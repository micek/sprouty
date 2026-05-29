"use client";

import { db, type KnowledgeFileRecord } from "./db";
import { fileKindFromMime, type FileKind } from "./format";

/** NDJSON event emitted by /api/ingest. One per line, streamed. */
export type IngestEvent =
  | {
      stage: "extracting" | "chunking" | "embedding" | "upserting";
      progress: number;
      message?: string;
    }
  | {
      stage: "done";
      progress: 1;
      vectorCount: number;
      pages?: number;
      qdrantStatus: string;
      collection: string;
      embeddingModel: string;
      chunks: Array<{ id: string; chapter?: string }>;
    }
  | { stage: "error"; error: string };

export type IngestResult =
  | { ok: true; vectorCount: number; pages?: number; qdrantStatus: string }
  | { ok: false; error: string };

/**
 * Persist a freshly-dropped file. Writes the original blob into IndexedDB so
 * the user can re-ingest after a Qdrant reset and so images can render
 * thumbnails without going back to the network.
 */
export async function addKnowledgeFile(file: File): Promise<KnowledgeFileRecord> {
  const id = `${Date.now()}-${crypto.randomUUID()}-${file.name}`;
  const kind: FileKind = fileKindFromMime(file.type, file.name) ?? "TXT";
  const record: KnowledgeFileRecord = {
    id,
    filename: file.name,
    type: kind,
    bytes: file.size,
    addedAt: Date.now(),
    status: "queued",
    blob: file,
  };
  await db().files.put(record);
  return record;
}

/**
 * Stage a rejection so the user sees why the file wasn't accepted. We keep
 * these in IndexedDB too so they don't disappear on refresh — the user can
 * retry or remove them explicitly.
 */
export async function addRejectedFile(file: File, reason: string): Promise<KnowledgeFileRecord> {
  const id = `${Date.now()}-${crypto.randomUUID()}-${file.name}-rej`;
  const kind: FileKind = fileKindFromMime(file.type, file.name) ?? "TXT";
  const record: KnowledgeFileRecord = {
    id,
    filename: file.name,
    type: kind,
    bytes: file.size,
    addedAt: Date.now(),
    status: "failed",
    error: reason,
  };
  await db().files.put(record);
  return record;
}

export async function updateKnowledgeFileStatus(
  id: string,
  patch: Partial<
    Pick<
      KnowledgeFileRecord,
      | "status"
      | "pages"
      | "vectorCount"
      | "error"
      | "ingestedAt"
      | "progress"
      | "stage"
      | "qdrantStatus"
    >
  >,
): Promise<void> {
  await db().files.update(id, patch);
}

export async function removeKnowledgeFile(id: string): Promise<void> {
  await db().files.delete(id);
}

/**
 * Drive a single file through the `/api/ingest` server route. Updates the
 * IndexedDB record's `status` along the way:
 *   queued → processing → indexed (with vectorCount + pages)
 *   queued → failed (with error message)
 *
 * The route reads the user's OpenRouter + Qdrant keys from `x-*` headers when
 * the BYOK persistence (Phase 1) lands; today, omitted headers fall back to
 * the server's `.env.local` values which is fine for dev.
 *
 * TODO(Phase 1): pass headers from IndexedDB-stored keys once Web Crypto
 * persistence is wired. Signature already accepts an optional `keys` arg.
 */
export interface IngestKeys {
  openrouterKey?: string;
  qdrantUrl?: string;
  qdrantKey?: string;
}

export async function ingestKnowledgeFile(
  record: KnowledgeFileRecord,
  keys: IngestKeys = {},
): Promise<IngestResult> {
  if (!record.blob) {
    const error = "No blob stored for this file — re-add it.";
    await updateKnowledgeFileStatus(record.id, { status: "failed", error });
    return { ok: false, error };
  }

  await updateKnowledgeFileStatus(record.id, {
    status: "processing",
    progress: 0,
    stage: "Uploading to server",
    error: undefined,
  });

  const form = new FormData();
  form.append("file", record.blob, record.filename);

  const headers: HeadersInit = {};
  if (keys.openrouterKey) headers["x-openrouter-key"] = keys.openrouterKey;
  if (keys.qdrantUrl) headers["x-qdrant-url"] = keys.qdrantUrl;
  if (keys.qdrantKey) headers["x-qdrant-key"] = keys.qdrantKey;

  let res: Response;
  try {
    res = await fetch("/api/ingest", { method: "POST", body: form, headers });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    await updateKnowledgeFileStatus(record.id, { status: "failed", error });
    return { ok: false, error };
  }

  if (!res.body) {
    const error = `HTTP ${res.status} — empty response`;
    await updateKnowledgeFileStatus(record.id, { status: "failed", error });
    return { ok: false, error };
  }

  // Read the NDJSON stream — one event per line.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: Extract<IngestEvent, { stage: "done" }> | undefined;
  let failure: string | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split off complete lines, leave any partial trailing chunk in buffer.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: IngestEvent;
      try {
        event = JSON.parse(trimmed) as IngestEvent;
      } catch {
        continue;
      }
      await applyEvent(record.id, event);
      if (event.stage === "done") final = event;
      if (event.stage === "error") failure = event.error;
    }
  }
  // Flush any trailing partial line
  if (buffer.trim().length > 0) {
    try {
      const event = JSON.parse(buffer.trim()) as IngestEvent;
      await applyEvent(record.id, event);
      if (event.stage === "done") final = event;
      if (event.stage === "error") failure = event.error;
    } catch {
      /* ignore */
    }
  }

  if (failure) {
    return { ok: false, error: failure };
  }
  if (!final) {
    const error = "Ingest stream ended without a `done` event";
    await updateKnowledgeFileStatus(record.id, { status: "failed", error });
    return { ok: false, error };
  }
  return {
    ok: true,
    vectorCount: final.vectorCount,
    pages: final.pages,
    qdrantStatus: final.qdrantStatus,
  };
}

/**
 * Translate a single NDJSON event into a Dexie record patch.
 * Done / error events flip the `status` field; intermediate events update
 * `progress` + `stage` so the UI's progress bar can animate smoothly.
 */
async function applyEvent(id: string, event: IngestEvent): Promise<void> {
  if (event.stage === "done") {
    await updateKnowledgeFileStatus(id, {
      status: "indexed",
      vectorCount: event.vectorCount,
      pages: event.pages,
      qdrantStatus: event.qdrantStatus,
      progress: 1,
      stage: `Saved to Qdrant · ${event.vectorCount} vectors searchable`,
      ingestedAt: Date.now(),
    });
    return;
  }
  if (event.stage === "error") {
    await updateKnowledgeFileStatus(id, {
      status: "failed",
      error: event.error,
      progress: undefined,
      stage: undefined,
    });
    return;
  }
  await updateKnowledgeFileStatus(id, {
    progress: event.progress,
    stage: event.message ?? prettyStage(event.stage),
  });
}

function prettyStage(s: IngestEvent["stage"]): string {
  switch (s) {
    case "extracting":
      return "Reading your document";
    case "chunking":
      return "Preparing for Qdrant";
    case "embedding":
      return "Creating vectors";
    case "upserting":
      return "Saving to Qdrant";
    default:
      return s;
  }
}
