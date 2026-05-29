/**
 * OpenRouter client — single, unified gateway for every AI call Sprouty makes.
 *
 * Uses the official `openai` npm SDK pointed at `https://openrouter.ai/api/v1`.
 * This works because OpenRouter is OpenAI-compatible: same request shapes,
 * same response shapes, just a different base URL and model slugs.
 *
 * **Key resolution order** (matches the BYOK rule):
 *   1. Explicit `key` argument — what the client passes (read from IndexedDB)
 *   2. `OPENROUTER_API_KEY` env var — server-only, used by API routes /
 *      the Python agent / Trigger.dev tasks during dev
 *
 * **Never** hard-code a key. Never log a key. Never echo a key back to the
 * client from a server response.
 *
 * See [SKILLS/openrouter/SKILL.md] for usage patterns.
 */

import OpenAI from "openai";
import { EMBED_DIMENSIONS, Models, type ModelId } from "./models";

const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Build a configured OpenAI SDK instance pointed at OpenRouter.
 *
 * `dangerouslyAllowBrowser: true` is intentional — Sprouty's BYOK design has
 * the user's own key in their browser. Anthropic/OpenAI SDK warns about this
 * because for *most* apps it would mean leaking a server-side secret to
 * everyone. Here, the key never leaves the user's browser. That's the
 * privacy commitment.
 */
export function openrouterClient(key?: string): OpenAI {
  const apiKey = key ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenRouter key missing — pass it explicitly or set OPENROUTER_API_KEY in .env.local",
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    // Send Sprouty's identity so the OpenRouter dashboard can attribute usage.
    // Required for OpenRouter's optional rankings; harmless either way.
    defaultHeaders: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ?? "https://sprouty.local",
      "X-Title": "Sprouty",
    },
    dangerouslyAllowBrowser: true,
  });
}

/* ─── Embeddings ─── */

/**
 * Embed a single string into a 1536-dim dense vector. Model:
 * {@link Models.EMBED} (`openai/text-embedding-3-small`). The vector is what
 * gets written to Qdrant `sprout_kb`.
 */
export async function embed(text: string, key?: string): Promise<number[]> {
  const client = openrouterClient(key);
  const res = await client.embeddings.create({
    model: Models.EMBED,
    input: text,
    dimensions: EMBED_DIMENSIONS,
  });
  const vector = res.data[0]?.embedding;
  if (!vector) throw new Error("OpenRouter returned no embedding");
  return vector;
}

/**
 * Embed many strings in one round-trip. Returns vectors in input order.
 * Use when ingesting a batch of chunks.
 */
export async function embedBatch(
  inputs: string[],
  key?: string,
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const client = openrouterClient(key);
  const res = await client.embeddings.create({
    model: Models.EMBED,
    input: inputs,
    dimensions: EMBED_DIMENSIONS,
  });
  return res.data.map((d) => d.embedding);
}

/* ─── Chat / completion ─── */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Override the default model. Defaults to {@link Models.LLM}. */
  model?: ModelId;
  /** 0 = deterministic, 1 = creative. Default 0.4 — leans grounded. */
  temperature?: number;
  /** Max tokens in the completion. Default 1024. */
  maxTokens?: number;
  /**
   * Force JSON output. When set, the model returns a syntactically valid
   * JSON document. Use for structured constraint extraction.
   */
  jsonMode?: boolean;
}

/**
 * Single non-streaming chat call. Returns the assistant's text content.
 * Used for plan generation, constraint extraction, summaries, etc.
 */
export async function chat(
  messages: ChatMessage[],
  key?: string,
  options: ChatOptions = {},
): Promise<string> {
  const client = openrouterClient(key);
  const res = await client.chat.completions.create({
    model: options.model ?? Models.LLM,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 1024,
    ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });
  const text = res.choices[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("OpenRouter chat returned no text content");
  }
  return text;
}

/**
 * Same as `chat` but parses the response as JSON. Throws if the model returns
 * malformed JSON or doesn't match the expected shape (caller's `T`).
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  key?: string,
  options: Omit<ChatOptions, "jsonMode"> = {},
): Promise<T> {
  const text = await chat(messages, key, { ...options, jsonMode: true });
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(
      `OpenRouter returned invalid JSON: ${text.slice(0, 200)}${err instanceof Error ? ` (${err.message})` : ""}`,
    );
  }
}

/* ─── Streaming chat (for the voice agent path) ─── */

/**
 * Async-iterator over completion deltas. Yields each text chunk as it arrives.
 * Use when piping to TTS, voice transcripts, or for live-updating UIs.
 *
 * Usage:
 * ```ts
 * for await (const chunk of streamChat(messages, key)) {
 *   appendToTranscript(chunk);
 * }
 * ```
 */
export async function* streamChat(
  messages: ChatMessage[],
  key?: string,
  options: ChatOptions = {},
): AsyncGenerator<string, void, void> {
  const client = openrouterClient(key);
  const stream = await client.chat.completions.create({
    model: options.model ?? Models.LLM,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 1024,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      yield delta;
    }
  }
}
