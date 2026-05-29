/**
 * Per-service API key validators. All run client-side (BYOK rule — keys never
 * touch a server we control). Each function returns a Promise that resolves
 * to a {ok, message} pair. Rejections are converted to ok:false at call sites.
 */

export interface TestResult {
  ok: boolean;
  message: string;
}

/**
 * Validate an OpenRouter key by hitting the /key endpoint, which echoes the
 * key's label + credit balance. CORS-enabled; works directly from the browser.
 */
export async function testOpenRouter(key: string): Promise<TestResult> {
  if (!key) return { ok: false, message: "no key" };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        message: `HTTP ${res.status}${text ? ` — ${text.slice(0, 80)}` : ""}`,
      };
    }
    const json = (await res.json()) as { data?: { label?: string } };
    return { ok: true, message: json.data?.label ? `Connected · ${json.data.label}` : "Connected" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Validate a Qdrant Cloud API key against the configured cluster URL.
 * URL comes from `NEXT_PUBLIC_QDRANT_URL` (it's an endpoint, not a secret).
 * Hits `/collections` which is CORS-enabled and requires a valid `api-key`
 * header. Returns the collection count on success.
 */
export async function testQdrant(key: string): Promise<TestResult> {
  if (!key) return { ok: false, message: "no key" };
  const url = process.env.NEXT_PUBLIC_QDRANT_URL;
  if (!url) {
    return {
      ok: false,
      message: "Set NEXT_PUBLIC_QDRANT_URL in .env.local",
    };
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/collections`, {
      headers: { "api-key": key },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        message: `HTTP ${res.status}${text ? ` — ${text.slice(0, 80)}` : ""}`,
      };
    }
    const json = (await res.json()) as {
      result?: { collections?: Array<{ name: string }> };
    };
    const count = json.result?.collections?.length ?? 0;
    return {
      ok: true,
      message:
        count > 0
          ? `Connected · ${count} ${count === 1 ? "collection" : "collections"}`
          : "Connected · 0 collections (ready for ingest)",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Validate a Google AI Studio key by listing available models.
 * The Generative Language API supports CORS for the public models endpoint.
 */
export async function testGoogleAI(key: string): Promise<TestResult> {
  if (!key) return { ok: false, message: "no key" };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        message: `HTTP ${res.status}${text ? ` — ${text.slice(0, 80)}` : ""}`,
      };
    }
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    const count = json.models?.length ?? 0;
    return { ok: true, message: count ? `Connected · ${count} models` : "Connected" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Validate an OpenAI key by listing models. OpenAI allows CORS from any
 * origin for /v1/models with a bearer token.
 */
export async function testOpenAI(key: string): Promise<TestResult> {
  if (!key) return { ok: false, message: "no key" };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        message: `HTTP ${res.status}${text ? ` — ${text.slice(0, 80)}` : ""}`,
      };
    }
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    const count = json.data?.length ?? 0;
    return { ok: true, message: count ? `Connected · ${count} models` : "Connected" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Validate a trigger.dev personal access token by fetching the configured
 * project. Project ID comes from `NEXT_PUBLIC_TRIGGER_PROJECT_ID` (also not
 * a secret — projects are identified by `proj_…` slugs).
 */
export async function testTriggerDev(key: string): Promise<TestResult> {
  if (!key) return { ok: false, message: "no key" };
  const projectId = process.env.NEXT_PUBLIC_TRIGGER_PROJECT_ID;
  if (!projectId) {
    return {
      ok: false,
      message: "Set NEXT_PUBLIC_TRIGGER_PROJECT_ID in .env.local",
    };
  }
  try {
    const res = await fetch(
      `https://api.trigger.dev/api/v1/projects/${encodeURIComponent(projectId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        message: `HTTP ${res.status}${text ? ` — ${text.slice(0, 80)}` : ""}`,
      };
    }
    const json = (await res.json()) as { name?: string; slug?: string };
    return {
      ok: true,
      message: json.name
        ? `Connected · ${json.name}`
        : `Connected · ${projectId}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Validate the LiveKit server credentials by proxying through `/api/livekit/test`.
 * Unlike every other test in this file, the credentials never go to the
 * browser — they live server-side in `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
 * (per CLAUDE.md, LiveKit creds are deployment env vars, not BYOK). The route
 * runs `RoomService.listRooms()` against the configured cluster URL and
 * returns the active room count on success.
 *
 * `_keyArg` is accepted for signature parity with the other testers (the
 * SettingsKeys switch dispatches them all uniformly), but it's ignored — the
 * test never reads anything the user typed into the panel.
 */
export async function testLiveKit(_keyArg?: string): Promise<TestResult> {
  try {
    const res = await fetch("/api/livekit/test");
    let json: { ok?: boolean; message?: string; error?: string } = {};
    try {
      json = await res.json();
    } catch {
      return { ok: false, message: `HTTP ${res.status} — non-JSON response` };
    }
    if (json.ok) return { ok: true, message: json.message ?? "Connected" };
    return {
      ok: false,
      message: json.error ?? `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Network error" };
  }
}
