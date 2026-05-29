import Dexie, { type Table } from "dexie";

/**
 * IndexedDB schema — all user data lives here. No server-side storage.
 * See sprout_prd.md §6 for full schema rationale.
 */

export interface KeyRecord {
  id: string; // KeyId (openrouter, qdrant, etc.)
  encrypted: string; // Web-Crypto wrapped value
  lastTestedAt?: number; // epoch ms — green dot if <24h
  testStatus?: "ok" | "failed";
  updatedAt: number;
}

/**
 * Device-bound AES-GCM master key. Created once per browser profile, marked
 * non-extractable so it physically cannot leave the browser. All `KeyRecord`
 * ciphertexts are wrapped with this key.
 */
export interface MasterKeyRecord {
  id: "default";
  key: CryptoKey;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt?: number;
  intent: "initial_planning" | "weekly_checkin" | "problem_report" | "general_chat";
  transcriptText: string;
  summary?: string;
  extractedConstraints?: Record<string, unknown>;
}

export interface PlanRecord {
  id: string;
  version: number;
  parentVersion?: number;
  triggerEvent: string;
  createdAt: number;
  weeks: PlanWeek[];
  shoppingList: string[];
}

export interface PlanWeek {
  index: number; // 1..12
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;
  tasks: PlanTask[];
}

export interface PlanTask {
  id: string;
  label: string;
  status: "pending" | "current" | "done";
  sourceChunkId?: string;
  citation?: string; // e.g. "Ch. 3, p. 19"
}

export interface KnowledgeFileRecord {
  id: string;
  filename: string;
  type: "PDF" | "MD" | "TXT" | "IMG";
  bytes: number;
  /** Pages or chunk count — only known after ingest. */
  pages?: number;
  /** Number of vectors written to Qdrant — only known after ingest. */
  vectorCount?: number;
  /** When the file was first dropped onto the dropzone. */
  addedAt: number;
  /** When ingest finished (status flipped to indexed). */
  ingestedAt?: number;
  status: "queued" | "processing" | "indexed" | "failed";
  /** Live ingest progress 0..1. Only meaningful while `status === "processing"`. */
  progress?: number;
  /** Human-readable stage label streamed from the ingest pipeline. */
  stage?: string;
  /** Qdrant operation status echoed back from the server (e.g. "completed"). */
  qdrantStatus?: string;
  error?: string;
  /**
   * Original file bytes. Stored so the app can re-ingest after a Qdrant reset
   * without re-uploading, and so images can be previewed without a network round-trip.
   */
  blob?: Blob;
}

export interface VisionImageRecord {
  id: string;
  prompt: string;
  engine: "gemini" | "openai";
  blob: Blob;
  createdAt: number;
}

export interface GardenContextRecord {
  id: "current";
  json: Record<string, unknown>; // canonical machine-readable
  markdown: string; // human-readable journal
  updatedAt: number;
}

class SproutDB extends Dexie {
  keys!: Table<KeyRecord, string>;
  sessions!: Table<SessionRecord, string>;
  plans!: Table<PlanRecord, string>;
  files!: Table<KnowledgeFileRecord, string>;
  visions!: Table<VisionImageRecord, string>;
  context!: Table<GardenContextRecord, string>;
  master!: Table<MasterKeyRecord, string>;

  constructor() {
    super("sprout");
    this.version(1).stores({
      keys: "&id, updatedAt",
      sessions: "&id, startedAt, intent",
      plans: "&id, version, createdAt",
      // Index on `addedAt` so the UI can sort newest-drop-first. `status` is
      // also indexed so we can query "what's queued" cheaply.
      files: "&id, addedAt, status",
      visions: "&id, createdAt, engine",
      context: "&id",
    });
    // v2: add a `master` table for the AES-GCM CryptoKey used to wrap every
    // KeyRecord ciphertext. The CryptoKey itself is non-extractable; storing
    // it via structured cloning keeps it bound to this browser profile.
    this.version(2).stores({
      keys: "&id, updatedAt",
      sessions: "&id, startedAt, intent",
      plans: "&id, version, createdAt",
      files: "&id, addedAt, status",
      visions: "&id, createdAt, engine",
      context: "&id",
      master: "&id",
    });
  }
}

let _db: SproutDB | null = null;

/**
 * Lazy DB accessor — Dexie can't be opened during SSR/build,
 * so this is only safe to call in client components or browser-side effects.
 */
export function db(): SproutDB {
  if (typeof window === "undefined") {
    throw new Error("SproutDB is browser-only");
  }
  if (!_db) _db = new SproutDB();
  return _db;
}
