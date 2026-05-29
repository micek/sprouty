"use client";

import { db, type VisionImageRecord } from "./db";
import {
  loadGardenContext,
  resolveCropList,
  type CropSource,
} from "./garden-context";
import { loadAllKeys } from "./keys";

/**
 * Client-side wrapper around `/api/vision`. Handles BYOK header forwarding
 * (saved OpenRouter key from IndexedDB), turns the data URL response into a
 * Blob the UI can render and Dexie can persist, and writes a fresh
 * `VisionImageRecord` so refreshing the page restores the result.
 */

export type VisionEngine = "gemini" | "openai";

export interface GenerateVisionInput {
  /** Optional "before" photo. */
  beforeBlob?: Blob | null;
  /** Engine choice — defaults to gemini. */
  engine?: VisionEngine;
  /** Optional plan context appended to the prompt. */
  prompt?: string;
}

export interface GenerateVisionResult {
  ok: true;
  record: VisionImageRecord;
  /** Blob URL to display the image — caller is responsible for revoking. */
  objectUrl: string;
  /** The crops we sent to the model, plus where they came from. */
  cropsUsed: { crops: string[]; source: CropSource };
}

export interface GenerateVisionFailure {
  ok: false;
  error: string;
  status?: number;
}

export async function generateVision(
  input: GenerateVisionInput,
): Promise<GenerateVisionResult | GenerateVisionFailure> {
  const engine: VisionEngine = input.engine ?? "gemini";
  const keys = await loadAllKeys();
  const headers: HeadersInit = {};
  if (keys.openrouter) headers["x-openrouter-key"] = keys.openrouter;

  // Resolve the user's crops *before* the request so we can both attach them
  // to the form AND surface them in the success payload (lets the UI show
  // "Generated using your saved crops" / "Default crops — talk to Sprouty to
  // personalize" hints later). The full garden context comes along for the
  // ride so the prompt can flavor the render with the user's own space,
  // region, hours-per-week, and goals.
  const cropsUsed = await resolveCropList();
  const ctx = await loadGardenContext();

  const form = new FormData();
  form.append("engine", engine);
  form.append("crops", cropsUsed.crops.join(", "));
  if (ctx?.spaceDescription) form.append("spaceDescription", ctx.spaceDescription);
  if (ctx?.region) form.append("region", ctx.region);
  if (typeof ctx?.hoursPerWeek === "number") {
    form.append("hoursPerWeek", String(ctx.hoursPerWeek));
  }
  if (ctx?.goals?.length) form.append("goals", ctx.goals.join("\n"));
  if (input.prompt) form.append("prompt", input.prompt);
  if (input.beforeBlob) {
    form.append(
      "file",
      input.beforeBlob,
      input.beforeBlob instanceof File ? input.beforeBlob.name : "before.jpg",
    );
  }

  let res: Response;
  try {
    res = await fetch("/api/vision", { method: "POST", body: form, headers });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }

  let payload: { ok: boolean; dataUrl?: string; mimeType?: string; error?: string };
  try {
    payload = await res.json();
  } catch {
    return { ok: false, status: res.status, error: `HTTP ${res.status} — non-JSON response` };
  }

  if (!payload.ok || !payload.dataUrl) {
    return {
      ok: false,
      status: res.status,
      error: payload.error ?? `HTTP ${res.status}`,
    };
  }

  const blob = await dataUrlToBlob(payload.dataUrl);
  const record: VisionImageRecord = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    prompt: input.prompt ?? "",
    engine,
    blob,
    createdAt: Date.now(),
  };
  await db().visions.put(record);

  return {
    ok: true,
    record,
    objectUrl: URL.createObjectURL(blob),
    cropsUsed,
  };
}

/** Latest persisted vision per engine — used to hydrate the After tile on
    mount so refreshing the page doesn't wipe a recent generation. */
export async function loadLatestVision(
  engine: VisionEngine,
): Promise<VisionImageRecord | null> {
  const all = await db().visions.where("engine").equals(engine).reverse().sortBy("createdAt");
  return all[0] ?? null;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
