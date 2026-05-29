"use client";

/**
 * High-level BYOK helpers that the SettingsKeys panel and the ingest pipeline
 * both consume. Anything that needs to store, read, or pass around a user API
 * key should go through this module — never touch `db().keys` directly.
 */

import { db } from "./db";
import { decryptString, encryptString } from "./crypto";

export type KeyId =
  | "openrouter"
  | "qdrant"
  | "livekit"
  | "gemini"
  | "openai"
  | "trigger";

/** Fresh-test window — green dot if the last successful test was within this. */
export const FRESH_TEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function saveKey(id: KeyId, plaintext: string): Promise<void> {
  const trimmed = plaintext.trim();
  if (trimmed.length === 0) {
    await db().keys.delete(id);
    return;
  }
  const encrypted = await encryptString(trimmed);
  await db().keys.put({
    id,
    encrypted,
    updatedAt: Date.now(),
  });
}

export async function loadKey(id: KeyId): Promise<string | null> {
  const record = await db().keys.get(id);
  if (!record) return null;
  try {
    return await decryptString(record.encrypted);
  } catch {
    // Master key wiped or ciphertext corrupted — drop the dead record so the
    // UI doesn't show a phantom "saved" key the user can't actually use.
    await db().keys.delete(id);
    return null;
  }
}

/**
 * Decrypt every stored key in one pass. Used by the ingest pipeline to attach
 * `x-openrouter-key` / `x-qdrant-*` headers to outbound requests.
 */
export async function loadAllKeys(): Promise<Partial<Record<KeyId, string>>> {
  const records = await db().keys.toArray();
  const out: Partial<Record<KeyId, string>> = {};
  for (const r of records) {
    try {
      out[r.id as KeyId] = await decryptString(r.encrypted);
    } catch {
      await db().keys.delete(r.id);
    }
  }
  return out;
}

export async function recordTestResult(id: KeyId, ok: boolean): Promise<void> {
  await db().keys.update(id, {
    lastTestedAt: Date.now(),
    testStatus: ok ? "ok" : "failed",
  });
}

export async function deleteKey(id: KeyId): Promise<void> {
  await db().keys.delete(id);
}

/** True if the most recent test was OK and ran within the freshness window. */
export function isTestFresh(
  lastTestedAt: number | undefined,
  testStatus: "ok" | "failed" | undefined,
): boolean {
  if (!lastTestedAt || testStatus !== "ok") return false;
  return Date.now() - lastTestedAt < FRESH_TEST_WINDOW_MS;
}
