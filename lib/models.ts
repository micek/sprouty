/**
 * Canonical OpenRouter model IDs for every model Sprouty calls.
 *
 * Single source of truth — never hard-code a model slug at a call site,
 * always import from here. That way version bumps (e.g. mistral-small-3.2)
 * are a one-line change.
 *
 * Kept in lock-step with the table in CLAUDE.md and the OpenRouter spec
 * sheet in sprout_prd.md.
 */

export const Models = {
  /** General LLM — Mistral Small via OpenRouter. Constraint extraction, plan
      generation, summaries. The bare `mistralai/mistral-small` slug was retired
      from OpenRouter; current versioned IDs include `-2603` (newest), `-3.1-24b-instruct`,
      and `-3.2-24b-instruct`. Pin to the dated build so we don't get surprised
      by a silent retirement again. */
  LLM: "mistralai/mistral-small-2603",

  /** Multimodal LLM for photo + image-aware tasks — Mistral Small Multimodal */
  MULTIMODAL: "mistralai/mistral-small-multimodal",

  /** Dense vector embeddings (1536-dim) — OpenAI text-embedding-3-small */
  EMBED: "openai/text-embedding-3-small",

  /** Default vision-board image generator — Gemini Nano Banana 2 */
  IMAGE_DEFAULT: "google/gemini-3.1-flash-image-preview",

  /** Alternate vision-board image generator — GPT-Image (5.4) */
  IMAGE_ALT: "openai/gpt-5.4-image-2",
} as const;

export type ModelKey = keyof typeof Models;
export type ModelId = (typeof Models)[ModelKey];

/** Vector dimensions written to the Qdrant `sprout_kb` dense field. */
export const EMBED_DIMENSIONS = 1536;

/* ─── audio (NOT routed through OpenRouter) ───
 *
 * STT and TTS go direct to Mistral, not through OpenRouter — OpenRouter is a
 * chat-completion proxy and doesn't host the audio APIs. The Python agent
 * reads its own model IDs from `agent/.env` (MISTRAL_STT_MODEL,
 * MISTRAL_TTS_MODEL, MISTRAL_TTS_VOICE), so this file intentionally doesn't
 * carry STT/TTS constants — they'd be a footgun if a Next.js route ever
 * tried to use them.
 *
 *   STT  → voxtral-mini-2507        (Mistral direct)
 *   TTS  → voxtral-mini-tts-2603    (Mistral direct, via custom plugin)
 */
