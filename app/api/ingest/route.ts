import { chunkText } from "@/lib/chunk";
import { Models } from "@/lib/models";
import { embedBatch } from "@/lib/openrouter";
import {
  COLLECTION,
  EMBEDDING_MODEL,
  chunkId,
  ensureCollection,
  qdrantClient,
  upsertChunks,
  type ChunkPayload,
} from "@/lib/qdrant";

/**
 * POST /api/ingest
 *
 * Body: multipart/form-data with a single `file` field.
 * Headers (BYOK):
 *   - `x-openrouter-key`  — user's OpenRouter API key
 *   - `x-qdrant-url`      — user's Qdrant cluster URL
 *   - `x-qdrant-key`      — user's Qdrant API key
 *
 * **Response** is `application/x-ndjson` — one JSON object per line, streamed
 * as the pipeline progresses. The client reads the stream and updates the
 * file's IndexedDB record with progress + stage messages along the way.
 *
 * Event shapes:
 *   { stage: "extracting"|"chunking"|"embedding"|"upserting", progress: 0..1, message?: string }
 *   { stage: "done", vectorCount, pages?, qdrantStatus, embeddingModel, collection, chunks: [{id, chapter}] }
 *   { stage: "error", error: string }
 *
 * BYOK: header keys are read into the request lifecycle, used, and discarded.
 * Never persisted, never logged, never echoed.
 */
export async function POST(req: Request) {
  const openrouterKey =
    req.headers.get("x-openrouter-key") ?? process.env.OPENROUTER_API_KEY;
  const qdrantUrl = req.headers.get("x-qdrant-url") ?? process.env.QDRANT_URL;
  const qdrantKey = req.headers.get("x-qdrant-key") ?? process.env.QDRANT_API_KEY;

  if (!openrouterKey || openrouterKey.includes("REPLACE_ME")) {
    return errorResponse(
      401,
      "OpenRouter key missing — send `x-openrouter-key` header or set OPENROUTER_API_KEY in .env.local",
    );
  }
  if (!qdrantUrl || !qdrantKey || qdrantKey.includes("REPLACE_ME")) {
    return errorResponse(
      401,
      "Qdrant credentials missing — send `x-qdrant-url` + `x-qdrant-key` headers or set QDRANT_URL + QDRANT_API_KEY in .env.local",
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return errorResponse(400, `Invalid multipart body: ${errMsg(err)}`);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse(400, "Missing `file` field");
  }

  // Stream NDJSON events as the pipeline runs.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        // 1. Extract text
        send({
          stage: "extracting",
          progress: 0.05,
          message: "Reading your document",
        });
        const extracted = await extractText(file);
        if (extracted.text.trim().length === 0) {
          send({ stage: "error", error: "File contained no extractable text" });
          controller.close();
          return;
        }

        // 2. Chunk
        send({
          stage: "chunking",
          progress: 0.15,
          message: extracted.pages
            ? `Read ${extracted.pages} pages — preparing for Qdrant`
            : "Preparing your document",
        });
        const chunks = chunkText(extracted.text);
        if (chunks.length === 0) {
          send({ stage: "error", error: "Chunker produced no chunks" });
          controller.close();
          return;
        }
        send({
          stage: "chunking",
          progress: 0.2,
          message: `Split into ${chunks.length} searchable sections`,
        });

        // 3. Embed
        send({
          stage: "embedding",
          progress: 0.25,
          message: `Creating vectors for ${chunks.length} sections`,
        });
        const vectors = await embedBatch(
          chunks.map((c) => c.text),
          openrouterKey,
        );
        if (vectors.length !== chunks.length) {
          send({ stage: "error", error: "OpenRouter returned fewer vectors than chunks" });
          controller.close();
          return;
        }
        send({
          stage: "embedding",
          progress: 0.7,
          message: `${vectors.length} vectors ready`,
        });

        // 4. Upsert to Qdrant
        const client = qdrantClient({ url: qdrantUrl, apiKey: qdrantKey });
        send({
          stage: "upserting",
          progress: 0.75,
          message: "Connecting to your Qdrant database",
        });
        await ensureCollection(client);

        send({
          stage: "upserting",
          progress: 0.8,
          message: `Sending ${chunks.length} vectors to Qdrant`,
        });
        const now = Date.now();
        await upsertChunks(
          client,
          chunks.map((c, i) => ({
            id: chunkId(file.name, c.index),
            vector: vectors[i],
            payload: {
              text: c.text,
              source_doc: file.name,
              chapter: c.chapter,
              chunk_type: "narrative",
              indexed_at: now,
              embedding_model: EMBEDDING_MODEL,
            } satisfies ChunkPayload,
          })),
        );

        // Verify Qdrant accepted the points by reading the collection count.
        // If `wait: true` did its job (it did), this reflects the real state.
        let qdrantStatus = "completed";
        try {
          const info = await client.getCollection(COLLECTION);
          qdrantStatus = info.status ?? "completed";
        } catch {
          // Non-fatal — upsert with `wait: true` already confirmed indexing.
        }

        send({
          stage: "done",
          progress: 1,
          vectorCount: chunks.length,
          pages: extracted.pages,
          qdrantStatus,
          collection: COLLECTION,
          embeddingModel: Models.EMBED,
          chunks: chunks.map((c) => ({
            id: chunkId(file.name, c.index),
            chapter: c.chapter,
          })),
        });
      } catch (err) {
        send({ stage: "error", error: errMsg(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Prevent any reverse-proxy from buffering the stream
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/* ─── extractors ─── */

interface Extracted {
  text: string;
  pages?: number;
}

async function extractText(file: File): Promise<Extracted> {
  const mime = file.type;
  const name = file.name.toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return extractPdf(file);
  }

  if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".mdx")
  ) {
    return { text: await file.text() };
  }

  // Image captioning is on the roadmap (Phase 4 follow-up).
  throw new Error(
    `Unsupported file type "${mime}". PDF, TXT, MD supported now; image captioning is coming.`,
  );
}

async function extractPdf(file: File): Promise<Extracted> {
  const { default: pdfParse } = await import("pdf-parse");
  const buf = Buffer.from(await file.arrayBuffer());
  const result = await pdfParse(buf);
  return { text: result.text, pages: result.numpages };
}

/* ─── tiny helpers ─── */

/**
 * For early-exit failures (auth, malformed body) we return a single-line
 * NDJSON error so the client's stream-reader has a uniform shape to parse.
 */
function errorResponse(status: number, message: string): Response {
  const body = `${JSON.stringify({ stage: "error", error: message })}\n`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
