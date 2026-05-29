import { Models } from "@/lib/models";
import { buildVisionPrompt } from "@/lib/vision-prompt";

// Vercel serverless functions cap at 10s on Hobby and 60s on Pro by default.
// GPT-Image generations can run 3-4 minutes; opt this route into the 300s
// max-duration tier so production deploys don't cut off mid-generation.
export const maxDuration = 300;

/**
 * POST /api/vision
 *
 * Generates a "Week 12 vision" image of the user's vegetable garden via
 * OpenRouter. Default engine is Gemini Nano Banana 2 (fast, cheap, sponsor
 * stack). The OpenAI engine is the alt path for cases where Gemini bounces.
 *
 * Body: multipart/form-data
 *   - file       (optional) - the user's "before" photo (any image MIME)
 *   - prompt     (optional) - extra context appended to the system prompt
 *   - engine     required   - "gemini" | "openai"
 *
 * Headers (BYOK, request-scoped, never persisted):
 *   - x-openrouter-key - user's OpenRouter API key (or env fallback)
 *
 * Response: 200 application/json
 *   { ok: true,  dataUrl, mimeType, engine, model }
 *   { ok: false, error }
 *
 * Image generation rides through OpenRouter's chat-completions endpoint —
 * the assistant message comes back with one or more `images[]` entries,
 * each containing a base64 data URL.
 */
export async function POST(req: Request) {
  const openrouterKey =
    req.headers.get("x-openrouter-key") ?? process.env.OPENROUTER_API_KEY;
  if (!openrouterKey || openrouterKey.includes("REPLACE_ME")) {
    return jsonError(
      401,
      "OpenRouter key missing — save one in Settings or set OPENROUTER_API_KEY in .env.local",
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return jsonError(400, `Invalid multipart body: ${errMsg(err)}`);
  }

  const engine = (form.get("engine") ?? "gemini").toString();
  if (engine !== "gemini" && engine !== "openai") {
    return jsonError(400, `Unsupported engine "${engine}". Use "gemini" or "openai".`);
  }
  const model = engine === "openai" ? Models.IMAGE_ALT : Models.IMAGE_DEFAULT;

  const extraContext = (form.get("prompt") ?? "").toString().trim();
  const cropsField = (form.get("crops") ?? "").toString().trim();
  const crops = cropsField
    ? cropsField.split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  const spaceDescription = (form.get("spaceDescription") ?? "").toString().trim() || undefined;
  const region = (form.get("region") ?? "").toString().trim() || undefined;
  const hoursRaw = (form.get("hoursPerWeek") ?? "").toString().trim();
  const hoursPerWeek = hoursRaw ? Number(hoursRaw) : undefined;
  const goalsField = (form.get("goals") ?? "").toString().trim();
  const goals = goalsField
    ? goalsField.split("\n").map((g) => g.trim()).filter(Boolean)
    : undefined;
  const beforePhoto = form.get("file");
  const photoDataUrl =
    beforePhoto instanceof File && beforePhoto.size > 0
      ? await fileToDataUrl(beforePhoto)
      : null;

  const { system, user } = buildVisionPrompt({
    extraContext,
    crops,
    spaceDescription,
    region,
    hoursPerWeek: Number.isFinite(hoursPerWeek as number) ? hoursPerWeek : undefined,
    goals,
    hasReferencePhoto: photoDataUrl !== null,
  });
  const messages = assembleMessages(system, user, photoDataUrl);

  // Hard-cap the upstream call so a hung OpenRouter request can't stall the
  // browser's spinner forever. Gemini Nano Banana 2 lands inside 8s, but
  // OpenAI's GPT-Image (5.4) — even with a fast TTFB — routinely streams
  // image-token chunks for 3-4 minutes (the OpenRouter generation log we
  // got back from a real call clocked 206 seconds). We give either model
  // 300s of headroom and surface a clean timeout error to the client when
  // it elapses. The user-facing UI shows a soft "still working" hint after
  // 30s so the long wait doesn't read as hung.
  const REQUEST_TIMEOUT_MS = 300_000;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  let orRes: Response;
  try {
    orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openrouterKey}`,
        "HTTP-Referer": req.headers.get("origin") ?? "https://sprouty.app",
        "X-Title": "Sprouty",
      },
      body: JSON.stringify({
        model,
        messages,
        modalities: ["image", "text"],
        // OpenRouter pass-through params for OpenAI's gpt-image-2-class
        // models. `size: "2048x2048"` is the standard square preset
        // closest to the "max 2000²" guideline in the prompt — gpt-image
        // doesn't accept arbitrary dimensions, only its supported set.
        // `quality: "medium"` keeps generation time inside our 300s
        // timeout budget (high-quality runs can hit 4-5 minutes at this
        // resolution). Gemini ignores both fields silently, so we ship
        // them unconditionally rather than branching by engine.
        size: "2048x2048",
        quality: "medium",
      }),
      signal: abortController.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (err instanceof DOMException && err.name === "AbortError") {
      return jsonError(
        504,
        `OpenRouter timed out after ${REQUEST_TIMEOUT_MS / 1000}s — model "${model}" may be slow, unavailable, or the slug may be wrong. Try the alternate engine.`,
      );
    }
    return jsonError(502, `OpenRouter request failed: ${errMsg(err)}`);
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!orRes.ok) {
    const errorText = await orRes.text().catch(() => "");
    return jsonError(
      orRes.status,
      `OpenRouter error (${orRes.status}) for model "${model}": ${truncate(errorText, 400)}`,
    );
  }

  const payload: unknown = await orRes.json().catch(() => null);
  const extracted = extractImage(payload);
  if (!extracted) {
    // Echo a short structural summary of what the model actually returned so
    // the user can tell at a glance whether (a) the model refused, (b) it
    // returned only text, or (c) the image landed in a shape our parser
    // doesn't recognize yet.
    const shapeHint = describePayloadShape(payload);
    return jsonError(
      502,
      `Model "${model}" returned a response but no image was found (${shapeHint}). Try the alternate engine, or rephrase your prompt.`,
    );
  }

  return Response.json({
    ok: true,
    engine,
    model,
    mimeType: extracted.mimeType,
    dataUrl: extracted.dataUrl,
  });
}

/**
 * Glue together the {system, user} strings produced by `buildVisionPrompt`
 * with the optional reference image into the OpenAI-compatible messages
 * payload OpenRouter expects.
 */
function assembleMessages(systemText: string, userText: string, photoDataUrl: string | null) {
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: userText }];
  if (photoDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: photoDataUrl } });
  }

  return [
    { role: "system", content: systemText },
    { role: "user", content: userContent },
  ];
}

interface ExtractedImage {
  dataUrl: string;
  mimeType: string;
}

/**
 * OpenRouter's image-gen response shape is model-dependent. Defensive parsing
 * checks every place we've seen images surface:
 *   1. choices[0].message.images[*].image_url.url   (most common)
 *   2. choices[0].message.images[*].url             (alternate)
 *   3. choices[0].message.content (string)          (data URL or markdown)
 *   4. choices[0].message.content (array)           (mixed text + image_url)
 */
function extractImage(payload: unknown): ExtractedImage | null {
  if (!isObject(payload)) return null;
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = isObject(choices[0]) ? choices[0].message : null;
  if (!isObject(message)) return null;

  const images = message.images;
  if (Array.isArray(images)) {
    for (const entry of images) {
      const url = pickImageUrl(entry);
      if (url) {
        const parsed = parseDataUrl(url);
        if (parsed) return parsed;
      }
    }
  }

  const content = message.content;
  if (typeof content === "string") {
    const fromString = parseDataUrlFromString(content);
    if (fromString) return fromString;
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (!isObject(part)) continue;
      if (part.type === "image_url") {
        const url = pickImageUrl(part);
        if (url) {
          const parsed = parseDataUrl(url);
          if (parsed) return parsed;
        }
      }
    }
  }

  return null;
}

function pickImageUrl(entry: unknown): string | null {
  if (!isObject(entry)) return null;
  if (typeof entry.url === "string") return entry.url;
  const inner = entry.image_url;
  if (typeof inner === "string") return inner;
  if (isObject(inner) && typeof inner.url === "string") return inner.url;
  return null;
}

function parseDataUrl(url: string): ExtractedImage | null {
  if (url.startsWith("data:")) {
    const match = /^data:([^;,]+)[^,]*,/.exec(url);
    return { dataUrl: url, mimeType: match?.[1] ?? "image/png" };
  }
  return null;
}

function parseDataUrlFromString(s: string): ExtractedImage | null {
  const md = /!\[[^\]]*\]\((data:[^)]+)\)/.exec(s);
  if (md?.[1]) return parseDataUrl(md[1]);
  const bare = /(data:image\/[a-z+]+;base64,[a-zA-Z0-9+/=]+)/.exec(s);
  if (bare?.[1]) return parseDataUrl(bare[1]);
  return null;
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function jsonError(status: number, message: string): Response {
  return Response.json({ ok: false, error: message }, { status });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Tiny shape summary for failed extractions. Helps the user (and us) tell at
 * a glance whether the model returned nothing, returned only text, or returned
 * media in a shape our parser doesn't recognize. Trimmed to ~120 chars so it
 * fits in a UI error band.
 */
function describePayloadShape(payload: unknown): string {
  if (!isObject(payload)) return "non-object response";
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "no choices in response";
  const message = isObject(choices[0]) ? choices[0].message : null;
  if (!isObject(message)) return "choice has no message";
  const parts: string[] = [];
  if (Array.isArray(message.images)) parts.push(`${message.images.length} image entr${message.images.length === 1 ? "y" : "ies"}`);
  if (typeof message.content === "string") parts.push(`${message.content.length} chars of text`);
  else if (Array.isArray(message.content)) parts.push(`${message.content.length} content parts`);
  if (typeof message.refusal === "string" && message.refusal.length > 0) parts.push("model refusal");
  return parts.length ? parts.join(", ") : "empty message";
}
