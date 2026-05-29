"use client";

import Dexie from "dexie";
import { db } from "./db";
import { resetDeviceId } from "./device";
import { loadAllKeys } from "./keys";

const QDRANT_URL_FROM_ENV = process.env.NEXT_PUBLIC_QDRANT_URL;

export interface ResetSummary {
  qdrant: "deleted" | "skipped" | "failed";
  qdrantError?: string;
}

/**
 * Wipe every trace of the user's session: Qdrant vectors, the entire IndexedDB
 * (plans, sessions, files, visions, context, encrypted keys, master crypto
 * key), and the persisted device id in localStorage. After this resolves the
 * caller should reload the page so React + Dexie reinitialize against the
 * empty stores.
 *
 * Qdrant deletion is best-effort: if the user has no key saved, we silently
 * skip it rather than blocking the local wipe.
 */
export async function resetEverything(): Promise<ResetSummary> {
  const summary: ResetSummary = { qdrant: "skipped" };

  // 1. Snapshot the BYOK creds BEFORE we drop the DB so we can still call
  //    `/api/qdrant/reset` with the user's own key.
  let qdrantKey: string | undefined;
  try {
    const keys = await loadAllKeys();
    qdrantKey = keys.qdrant;
  } catch {
    // ignore — local wipe must still happen
  }

  if (qdrantKey) {
    try {
      const headers: Record<string, string> = { "x-qdrant-key": qdrantKey };
      if (QDRANT_URL_FROM_ENV) headers["x-qdrant-url"] = QDRANT_URL_FROM_ENV;
      const res = await fetch("/api/qdrant/reset", { method: "POST", headers });
      if (res.ok) {
        summary.qdrant = "deleted";
      } else {
        summary.qdrant = "failed";
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        summary.qdrantError = body?.error ?? `HTTP ${res.status}`;
      }
    } catch (err) {
      summary.qdrant = "failed";
      summary.qdrantError = err instanceof Error ? err.message : String(err);
    }
  }

  // 2. Close the live Dexie handle, then drop the entire database. Deleting
  //    the whole DB is cleaner than table-by-table `.clear()` because it also
  //    discards the AES-GCM master key (`master` table) — the next page load
  //    creates a fresh one and the user starts from zero.
  try {
    db().close();
  } catch {
    /* already closed */
  }
  await Dexie.delete("sprout");

  // 3. localStorage device id — the LiveKit identity the agent sees.
  resetDeviceId();

  return summary;
}
