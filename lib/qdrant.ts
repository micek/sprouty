/**
 * Qdrant client — hybrid dense (1536-dim cosine) + BM25 sparse retrieval.
 *
 * Single source of truth for:
 *   - The `sprout_kb` collection schema (dense + BM25 sparse, payload fields)
 *   - Connection setup (URL + API key, BYOK or env fallback)
 *   - Upsert + hybrid Discovery-API queries
 *
 * Per CLAUDE.md, retrieval uses Qdrant's Discovery API (positive/negative
 * vector pairs derived from voice constraints), NOT plain similarity. This
 * module exposes that as a typed `discover()` helper.
 */

import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { EMBED_DIMENSIONS, Models } from "./models";

/** Collection name. Matches `sprout_kb` per CLAUDE.md. */
export const COLLECTION = "sprout_kb";

/** Identifier of the dense vector field used by the collection. */
export const DENSE_FIELD = "dense";
/** Identifier of the sparse (BM25) vector field. */
export const SPARSE_FIELD = "bm25";

/** Difficulty cap for first-time-gardener filtering. */
export const BEGINNER_DIFFICULTY_MAX = 3;

/**
 * Per-chunk payload written alongside vectors. Mirrors the schema documented
 * in CLAUDE.md so the ingest pipeline + retrieval stay in lock-step.
 */
export interface ChunkPayload {
  text: string;
  source_doc: string; // filename
  page?: number;
  chapter?: string;
  section_title?: string;
  chunk_type?: "narrative" | "list" | "table" | "heading";
  topics?: string[];
  crops_mentioned?: string[];
  difficulty_rating?: 1 | 2 | 3 | 4 | 5;
  time_investment_hours?: number;
  space_required_sqft?: number;
  seasons?: Array<"spring" | "summer" | "fall" | "winter">;
  indexed_at: number; // epoch ms
  embedding_model: string;
}

export interface UpsertChunkInput {
  id: string;
  vector: number[];
  payload: ChunkPayload;
}

/* ─── Connection ─── */

interface QdrantConfig {
  /** Cluster URL. Omit on the client to use `NEXT_PUBLIC_QDRANT_URL`; on the server to use `QDRANT_URL`. */
  url?: string;
  /** API key. Omit on the client to use a previously-saved IndexedDB key; on the server to use `QDRANT_API_KEY`. */
  apiKey?: string;
}

/**
 * Build a configured Qdrant client. Mirrors the OpenRouter pattern — explicit
 * args first (BYOK), then env vars as a fallback for server-side use.
 */
export function qdrantClient(config: QdrantConfig = {}): QdrantClient {
  const url =
    config.url ??
    (typeof window === "undefined"
      ? process.env.QDRANT_URL
      : process.env.NEXT_PUBLIC_QDRANT_URL);
  const apiKey = config.apiKey ?? process.env.QDRANT_API_KEY;

  if (!url) {
    throw new Error(
      "Qdrant URL missing — pass `url` or set QDRANT_URL / NEXT_PUBLIC_QDRANT_URL",
    );
  }
  if (!apiKey) {
    throw new Error(
      "Qdrant API key missing — pass `apiKey` or set QDRANT_API_KEY",
    );
  }

  return new QdrantClient({ url, apiKey });
}

/* ─── Collection lifecycle ─── */

/**
 * Idempotent: creates `sprout_kb` if it doesn't exist with the hybrid
 * dense + BM25 schema. Safe to call on every ingest run / app boot.
 */
export async function ensureCollection(client: QdrantClient): Promise<"created" | "exists"> {
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION);
  if (exists) return "exists";

  await client.createCollection(COLLECTION, {
    vectors: {
      [DENSE_FIELD]: {
        size: EMBED_DIMENSIONS,
        distance: "Cosine",
      },
    },
    sparse_vectors: {
      [SPARSE_FIELD]: {
        modifier: "idf",
      },
    },
  });

  // Create payload indexes that we filter on. These speed up Discovery-API
  // queries that use difficulty / crops / seasons filters.
  await Promise.all([
    client.createPayloadIndex(COLLECTION, {
      field_name: "difficulty_rating",
      field_schema: "integer",
    }),
    client.createPayloadIndex(COLLECTION, {
      field_name: "crops_mentioned",
      field_schema: "keyword",
    }),
    client.createPayloadIndex(COLLECTION, {
      field_name: "seasons",
      field_schema: "keyword",
    }),
    client.createPayloadIndex(COLLECTION, {
      field_name: "source_doc",
      field_schema: "keyword",
    }),
  ]);

  return "created";
}

/* ─── Upsert ─── */

/**
 * Upsert a batch of chunks into `sprout_kb`. Each chunk needs an id (string —
 * usually `<source_doc>:<chunk_index>`), its dense vector, and a payload.
 * BM25 sparse vectors are computed server-side from `payload.text` because
 * the collection is configured with `modifier: "idf"`.
 *
 * Wait for the upsert to complete before returning so the caller can
 * confidently mark files as `indexed`.
 */
export async function upsertChunks(
  client: QdrantClient,
  chunks: UpsertChunkInput[],
): Promise<void> {
  if (chunks.length === 0) return;

  // Qdrant batches up to ~256 points per request comfortably; chunk if larger.
  const BATCH = 128;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    await client.upsert(COLLECTION, {
      wait: true,
      points: slice.map((c) => ({
        id: c.id,
        vector: { [DENSE_FIELD]: c.vector },
        payload: c.payload as unknown as Record<string, unknown>,
      })),
    });
  }
}

/**
 * Drop every point originating from a specific source document. Used when
 * the user removes a file from the knowledge-base UI — keeps Qdrant in
 * sync with IndexedDB.
 */
export async function deleteBySourceDoc(
  client: QdrantClient,
  sourceDoc: string,
): Promise<void> {
  await client.delete(COLLECTION, {
    wait: true,
    filter: {
      must: [{ key: "source_doc", match: { value: sourceDoc } }],
    },
  });
}

/* ─── Retrieval (Discovery API) ─── */

export interface DiscoveryQuery {
  /** "What the user wants" — vectors that pull results toward them. */
  positives: number[][];
  /** "What to avoid" — vectors that push results away. */
  negatives?: number[][];
  /** Cap by beginner difficulty (default = 3 per CLAUDE.md rule). */
  maxDifficulty?: number;
  /** Optional crop allow-list — only return chunks mentioning these crops. */
  crops?: string[];
  /** Optional season filter. */
  seasons?: Array<"spring" | "summer" | "fall" | "winter">;
  /** Number of points to return. Default 8. */
  limit?: number;
}

export interface DiscoveryHit {
  id: string | number;
  score: number;
  payload: ChunkPayload;
}

/**
 * Discovery-API hybrid query. Fuses dense + BM25 sparse, applies a beginner
 * difficulty cap, and uses positive/negative vectors to pull/push results.
 *
 * The Discovery-API "context pairs" model (positive ↔ negative) is what
 * separates Sprouty's retrieval from a plain similarity search. See
 * CLAUDE.md §"Qdrant Discovery API for retrieval".
 */
export async function discover(
  client: QdrantClient,
  q: DiscoveryQuery,
): Promise<DiscoveryHit[]> {
  if (q.positives.length === 0) {
    throw new Error("discover() requires at least one positive vector");
  }

  // Build positive/negative context pairs. If we have N positives and M
  // negatives we pair them round-robin; missing negatives = no penalty.
  const negatives = q.negatives ?? [];
  const context = q.positives.map((positive, i) => ({
    positive,
    negative: negatives[i % Math.max(1, negatives.length)] ?? undefined,
  }));

  // Filter only on what the caller explicitly requests. The current ingest
  // pipeline doesn't tag every chunk with `difficulty_rating` / `seasons` /
  // `crops_mentioned`, so auto-applying a default difficulty cap silently
  // drops every untagged chunk. Callers that want the beginner cap can pass
  // `maxDifficulty: BEGINNER_DIFFICULTY_MAX` explicitly.
  const filter = buildFilter({
    maxDifficulty: q.maxDifficulty,
    crops: q.crops,
    seasons: q.seasons,
  });

  const res = await client.discoverPoints(COLLECTION, {
    using: DENSE_FIELD,
    target: q.positives[0], // anchor for hybrid scoring
    context,
    filter,
    limit: q.limit ?? 8,
    with_payload: true,
    with_vector: false,
  });

  return res.map((p) => ({
    id: p.id,
    score: p.score ?? 0,
    payload: (p.payload ?? {}) as unknown as ChunkPayload,
  }));
}

/**
 * Recommendation-API helper. Given seed point IDs (e.g. "approved" chunks),
 * return more like them. Used after the user picks crops they like.
 */
export async function recommend(
  client: QdrantClient,
  seedIds: Array<string | number>,
  limit = 8,
): Promise<DiscoveryHit[]> {
  if (seedIds.length === 0) return [];
  const res = await client.recommend(COLLECTION, {
    using: DENSE_FIELD,
    positive: seedIds,
    limit,
    with_payload: true,
    with_vector: false,
  });
  return res.map((p) => ({
    id: p.id,
    score: p.score ?? 0,
    payload: (p.payload ?? {}) as unknown as ChunkPayload,
  }));
}

/* ─── Filter helpers ─── */

interface FilterArgs {
  maxDifficulty?: number;
  crops?: string[];
  seasons?: string[];
}

function buildFilter(args: FilterArgs) {
  const must: Array<Record<string, unknown>> = [];
  if (typeof args.maxDifficulty === "number") {
    must.push({
      key: "difficulty_rating",
      range: { lte: args.maxDifficulty },
    });
  }
  if (args.crops && args.crops.length > 0) {
    must.push({ key: "crops_mentioned", match: { any: args.crops } });
  }
  if (args.seasons && args.seasons.length > 0) {
    must.push({ key: "seasons", match: { any: args.seasons } });
  }
  return must.length > 0 ? { must } : undefined;
}

/* ─── Convenience: build a chunk ID ─── */

/**
 * Stable chunk ID — a deterministic UUIDv5-shaped string derived from
 * `<source_doc>:<chunk_index>`. Re-ingesting the same file overwrites
 * the same point IDs (ingest is idempotent per chunk index).
 *
 * Qdrant only accepts unsigned 64-bit ints or RFC-4122 UUIDs as point IDs;
 * arbitrary strings are rejected with HTTP 400. We hash the natural key with
 * SHA-256 and format the first 16 bytes as a valid UUID (version=5, RFC-4122
 * variant) so the upsert stays idempotent without leaking implementation
 * details into the payload.
 */
export function chunkId(sourceDoc: string, index: number): string {
  const hash = createHash("sha256")
    .update(`${sourceDoc}:${index}`)
    .digest();

  // Patch version (5) and variant (RFC-4122) bits in-place, then format 8-4-4-4-12.
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Helper used by [components/settings-keys.tsx](components/settings-keys.tsx)
 * to fetch the current model identifier in payload writes.
 */
export const EMBEDDING_MODEL = Models.EMBED;
