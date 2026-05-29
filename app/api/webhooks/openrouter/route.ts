import { tasks } from "@trigger.dev/sdk/v3";
import {
  openrouterWebhookTask,
  type OpenRouterWebhookPayload,
} from "@/trigger/openrouter-webhook";

/**
 * POST /api/webhooks/openrouter
 *
 * Public endpoint OpenRouter posts to under Settings → Observability. The
 * URL pasted into the OpenRouter dashboard is the deployed origin of this
 * route, e.g. `https://sprouty.vercel.app/api/webhooks/openrouter`.
 *
 * What this route does:
 *   1. Reads the raw payload (OpenRouter's generation log shape).
 *   2. Verifies the shared-secret header if `OPENROUTER_WEBHOOK_SECRET` is
 *      set — protects against random POSTers blowing through the trigger.dev
 *      run budget. If the env is unset (e.g. local dev without configuring
 *      it), we still accept the payload but log a warning.
 *   3. Triggers the `openrouter-webhook` task with the parsed payload.
 *   4. Returns 200 immediately. Any classification + alerting happens
 *      inside the trigger.dev task — keeps this route fast so OpenRouter
 *      doesn't time out and retry.
 *
 * See `docs/observability.md` for the full setup walk-through.
 */

// Vercel default function timeout is fine — this route does not block on the
// trigger.dev task; it returns the moment the task is enqueued.
export const maxDuration = 10;

export async function POST(req: Request) {
  // 1. Read raw body so we can both verify the signature and parse JSON.
  let raw: string;
  try {
    raw = await req.text();
  } catch (err) {
    return jsonError(400, `Could not read request body: ${errMsg(err)}`);
  }

  // 2. Optional shared-secret check. OpenRouter lets you configure a static
  //    header secret on the webhook; we check for it here so a leaked
  //    public URL can't be used to flood our trigger.dev account.
  const expected = process.env.OPENROUTER_WEBHOOK_SECRET;
  if (expected) {
    const provided =
      req.headers.get("x-openrouter-signature") ??
      req.headers.get("x-webhook-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    if (provided !== expected) {
      return jsonError(401, "Webhook signature mismatch.");
    }
  } else if (process.env.NODE_ENV === "production") {
    // In prod, no secret = silent door-open. Log it loud and accept anyway —
    // the user may have intentionally not set one. Cheaper to log than to
    // break observability for someone who hasn't bothered with a secret yet.
    console.warn(
      "[openrouter-webhook] OPENROUTER_WEBHOOK_SECRET is unset in production — incoming webhook is unauthenticated.",
    );
  }

  // 3. Parse JSON. OpenRouter posts JSON; reject anything that isn't.
  let payload: OpenRouterWebhookPayload;
  try {
    payload = JSON.parse(raw) as OpenRouterWebhookPayload;
  } catch (err) {
    return jsonError(400, `Invalid JSON payload: ${errMsg(err)}`);
  }

  // 4. Enqueue the trigger.dev task. The trigger() call returns once the
  //    run is queued; classification + logging happens server-side inside
  //    the task. We don't await the run itself.
  try {
    const handle = await tasks.trigger<typeof openrouterWebhookTask>(
      "openrouter-webhook",
      payload,
    );
    return Response.json({ ok: true, taskRunId: handle.id });
  } catch (err) {
    // If trigger.dev is misconfigured (missing TRIGGER_API_KEY, project
    // mismatch, deploy out of date) we still want to return 200 so
    // OpenRouter doesn't retry — the webhook is observability, not a
    // hard dependency. Log the error so the misconfig is visible in
    // Vercel function logs.
    console.error("[openrouter-webhook] failed to enqueue trigger.dev task:", err);
    return Response.json(
      { ok: false, error: errMsg(err), enqueued: false },
      { status: 200 },
    );
  }
}

function jsonError(status: number, message: string): Response {
  return Response.json({ ok: false, error: message }, { status });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
