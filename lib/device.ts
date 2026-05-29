"use client";

/**
 * Stable per-browser-profile device id.
 *
 * Used as the `identity` argument to `/api/livekit/token`, so the same browser
 * keeps the same LiveKit identity across voice sessions. Without this, every
 * fresh `startLiveSession()` call would mint a brand-new UUID and the agent
 * would treat the user as a stranger every time — breaking the "amnesia-free"
 * narrative the garden context relies on.
 *
 * Why localStorage and not IndexedDB: this value isn't sensitive (it's
 * effectively a non-routable session cookie scoped to one browser) and we
 * want a synchronous, never-async accessor so room mint code stays linear.
 *
 * Why not a UA fingerprint: stable across device cleans + private windows is
 * the wrong shape for a privacy-first product. A locally-stored random
 * identifier wipes the moment the user clears storage, exactly as expected.
 */

const DEVICE_ID_KEY = "sprouty.device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateDeviceId is browser-only");
  }
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^sprouty-[a-zA-Z0-9-]{4,}$/.test(existing)) return existing;
    const fresh = `sprouty-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage quota / blocked third-party storage all land
    // here. Fall back to a per-pageview id so the rest of the app still
    // works — the agent just won't recognize the user across reloads.
    return `sprouty-${crypto.randomUUID()}`;
  }
}

/**
 * Wipe the persisted id. Useful for "log out of this browser" / privacy
 * controls and the ZIP-import flow if we ever expose a per-device reset.
 */
export function resetDeviceId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    /* ignore */
  }
}
