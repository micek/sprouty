"use client";

/**
 * Web Crypto BYOK envelope for Sprouty.
 *
 * Threat model: prevent a casual local-disk read (devtools, file inspection,
 * malicious extension scanning IndexedDB strings) from yielding plaintext API
 * keys. The master AES-GCM key is generated on first use, marked
 * non-extractable, and stored via IndexedDB structured cloning — so it
 * physically cannot be exported or copied off the device. Each `KeyRecord`
 * ciphertext gets a fresh 12-byte IV concatenated in front of the ciphertext.
 *
 * Limitations: a sufficiently motivated attacker with arbitrary JS execution
 * inside this origin can still call `decryptString` with the live key; this
 * envelope is not a sandbox. It's the practical maximum for a BYOK web app
 * with no server-side identity.
 */

import { db } from "./db";

let masterKeyCache: CryptoKey | null = null;

async function getOrCreateMasterKey(): Promise<CryptoKey> {
  if (masterKeyCache) return masterKeyCache;
  const existing = await db().master.get("default");
  if (existing) {
    masterKeyCache = existing.key;
    return existing.key;
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await db().master.put({ id: "default", key });
  masterKeyCache = key;
  return key;
}

/** Encrypt a UTF-8 string. Output is base64( iv ‖ ciphertext ). */
export async function encryptString(plaintext: string): Promise<string> {
  const key = await getOrCreateMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  let s = "";
  for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
  return btoa(s);
}

/** Decrypt a string produced by `encryptString`. Throws on tamper / wrong key. */
export async function decryptString(encoded: string): Promise<string> {
  const key = await getOrCreateMasterKey();
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const iv = bytes.slice(0, 12);
  const cipher = bytes.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}

/**
 * Wipe the master key + all envelopes. Used by the "reset everything" path
 * (and by tests). After calling, every previously-saved KeyRecord becomes
 * unrecoverable — that's intentional.
 */
export async function resetCryptoEnvelope(): Promise<void> {
  masterKeyCache = null;
  await db().master.clear();
  await db().keys.clear();
}
