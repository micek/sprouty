import { logger, task } from "@trigger.dev/sdk/v3";

/**
 * OpenRouter observability webhook task.
 *
 * Triggered by the Next.js receiver at `app/api/webhooks/openrouter/route.ts`,
 * which runs `openrouterWebhookTask.trigger(payload)` for every generation
 * event OpenRouter posts to us. This task does the unified
 * filter-and-classify pass we agreed on (#1 from the observability brief):
 *
 *   - always log structured fields (model, status, latency, cost, …)
 *   - tag every run as one of: "ok" | "slow" | "error"
 *   - the trigger.dev dashboard then has those three filterable buckets
 *     plus a `model` facet, which is enough triage surface for hackathon
 *     debugging without a separate logs UI
 *
 * Why we still let "ok" runs through: every OpenRouter generation costs
 * one trigger.dev run regardless of how we filter. Logging the structured
 * fields anyway means the dashboard captures latency / cost trends, not
 * just failures, and the "ok" tag makes them trivial to filter out when
 * triaging.
 *
 * If 25k runs/month becomes a real ceiling, the cheap escape hatch is
 * disabling the webhook entirely from OpenRouter's dashboard until you're
 * actively investigating something. The real escape hatch is swapping
 * the URL on OpenRouter to an n8n endpoint instead — see
 * `docs/observability.md` for the swap path.
 */

/** A run is "slow" if total latency exceeds this. Tuned to our two real
    workloads: image gen (Gemini ~6-8s, GPT-Image medium ~60s, GPT-Image
    high several minutes) and embeddings (sub-second). 60s is the natural
    boundary — anything slower deserves a look. */
const SLOW_THRESHOLD_MS = 60_000;

/** OpenRouter's generation log payload (the shape that arrived from the
    real call you shared earlier). All fields are optional except `id`,
    since older or future event types may omit individual ones. */
export interface OpenRouterWebhookPayload {
  id?: number | string;
  generation_id?: string;
  request_id?: string;
  model?: string;
  provider_name?: string;
  finish_reason?: string;
  native_finish_reason?: string;
  cancelled?: boolean;
  streamed?: boolean;
  generation_time?: number; // ms
  latency?: number; // ms — TTFB
  moderation_latency?: number; // ms
  tokens_prompt?: number;
  tokens_completion?: number;
  native_tokens_prompt?: number;
  native_tokens_completion?: number;
  native_tokens_completion_images?: number;
  num_media_prompt?: number;
  num_media_completion?: number;
  usage?: number; // dollars (OpenRouter's normalized spend)
  usage_upstream?: number;
  origin?: string;
  user_agent?: string;
  http_referer?: string | null;
  created_at?: string;
  // anything else OpenRouter sends — we capture it but don't promise it
  [extra: string]: unknown;
}

type Severity = "ok" | "slow" | "error";

interface Classified {
  severity: Severity;
  /** Short human-readable reason that gets surfaced as the run summary. */
  reason: string;
}

/**
 * Classify an OpenRouter event. Errors take precedence over "slow" so a
 * generation that both timed out AND was cancelled lands in "error".
 */
function classify(payload: OpenRouterWebhookPayload): Classified {
  // Cancelled or non-stop finish reason — model refused, hit a length cap,
  // or upstream errored.
  if (payload.cancelled === true) {
    return { severity: "error", reason: "Cancelled by upstream or client" };
  }
  const finishReason = payload.finish_reason ?? payload.native_finish_reason;
  if (finishReason && finishReason !== "stop" && finishReason !== "completed") {
    return { severity: "error", reason: `Non-stop finish_reason: ${finishReason}` };
  }
  // No tokens out at all — model returned nothing useful (excluding image-only
  // outputs that put their bytes in the image-token bucket).
  const completionTokens =
    (payload.tokens_completion ?? 0) +
    (payload.native_tokens_completion_images ?? 0);
  if (completionTokens === 0 && payload.num_media_completion === 0) {
    return { severity: "error", reason: "Empty completion (no text and no media)" };
  }
  // Slow but successful — image-gen models in particular benefit from the
  // separate bucket so we can spot a Gemini regression vs. an expected
  // long GPT-Image run.
  const totalMs = (payload.latency ?? 0) + (payload.generation_time ?? 0);
  if (totalMs > SLOW_THRESHOLD_MS) {
    return {
      severity: "slow",
      reason: `Total ${(totalMs / 1000).toFixed(1)}s (latency ${payload.latency ?? "?"}ms + gen ${payload.generation_time ?? "?"}ms)`,
    };
  }
  return { severity: "ok", reason: "Completed normally" };
}

export const openrouterWebhookTask = task({
  id: "openrouter-webhook",
  // Surface the classification + model in trigger.dev's "tags" UI so the
  // dashboard filter chips work out of the box.
  run: async (payload: OpenRouterWebhookPayload, { ctx }) => {
    const { severity, reason } = classify(payload);

    const fields = {
      severity,
      reason,
      model: payload.model ?? "unknown",
      provider: payload.provider_name ?? "unknown",
      generationId: payload.generation_id ?? null,
      requestId: payload.request_id ?? null,
      latencyMs: payload.latency ?? null,
      generationMs: payload.generation_time ?? null,
      totalMs: (payload.latency ?? 0) + (payload.generation_time ?? 0) || null,
      usageUSD: payload.usage ?? null,
      promptTokens: payload.tokens_prompt ?? null,
      completionTokens: payload.tokens_completion ?? null,
      imageCompletionTokens: payload.native_tokens_completion_images ?? null,
      promptMedia: payload.num_media_prompt ?? null,
      completionMedia: payload.num_media_completion ?? null,
      streamed: payload.streamed ?? null,
      finishReason: payload.finish_reason ?? null,
      origin: payload.origin ?? null,
      runId: ctx.run.id,
    };

    if (severity === "error") {
      logger.error(`[openrouter] ${reason}`, fields);
    } else if (severity === "slow") {
      logger.warn(`[openrouter] ${reason}`, fields);
    } else {
      logger.info(`[openrouter] ${reason}`, fields);
    }

    // Hook for Slack / email / SMS alerts on error+slow. Keeping it as a
    // pure return for now — wire a real alert sender (Slack webhook, Resend,
    // Pushover) when we know which channel matters.
    return {
      severity,
      reason,
      model: fields.model,
      shouldAlert: severity !== "ok",
    };
  },
});
