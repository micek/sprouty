"use client";

import { db, type GardenContextRecord } from "./db";
import {
  COMMON_HOME_CROPS,
  extractCropsByPattern,
  extractKnownCrops,
} from "./crops";

// Re-export for callers that already pull these from this module. The actual
// definitions live in `./crops` so server routes can import them without
// triggering Turbopack's client-export wrapping.
export { COMMON_HOME_CROPS, extractKnownCrops };

/**
 * Garden context — the persistent record of who the user is, what they're
 * growing, and the constraints of their space. Stored in IndexedDB as
 * `db().context.get("current")`. Future voice sessions overwrite this record
 * after every conversation; image generation, plan generation, and weekly
 * nudges all read from it so Sprouty has amnesia-free continuity across runs.
 */

export interface GardenContext {
  /** Crops the user has chosen / mentioned, e.g. ["tomatoes", "lettuce", "beans"]. */
  crops: string[];
  /** Plain-language space description, e.g. "sunny back patio, 4 hours direct light". */
  spaceDescription?: string;
  /** Hours per week the user can commit. */
  hoursPerWeek?: number;
  /** Free-form user goals — "I want salad greens for lunch", etc. */
  goals?: string[];
  /** Region / climate hint — used downstream for plant suitability. */
  region?: string;
}

/* ─── read / write ─── */

export async function loadGardenContext(): Promise<GardenContext | null> {
  const record = await db().context.get("current");
  if (!record) return null;
  return record.json as unknown as GardenContext;
}

export async function saveGardenContext(ctx: GardenContext): Promise<void> {
  const record: GardenContextRecord = {
    id: "current",
    json: ctx as unknown as Record<string, unknown>,
    markdown: toMarkdown(ctx),
    updatedAt: Date.now(),
  };
  await db().context.put(record);
}

/** Convenience setter for just the crops field — merges with whatever else
    is in context so callers don't have to round-trip. */
export async function setCrops(crops: string[]): Promise<void> {
  const existing = (await loadGardenContext()) ?? { crops: [] };
  await saveGardenContext({ ...existing, crops });
}

/* ─── crop list resolution ─── */

export type CropSource = "context" | "plan" | "default";

export interface ResolvedCrops {
  crops: string[];
  source: CropSource;
}

/**
 * Best-available crop list. Tries (in order):
 *   1. The persisted GardenContext if it exists and has crops.
 *   2. Crops mentioned in the latest plan's task labels (matched against
 *      COMMON_HOME_CROPS so we don't pick up false positives like "soil").
 *   3. A random 5-of-10 from COMMON_HOME_CROPS so the prompt never goes empty.
 */
export async function resolveCropList(): Promise<ResolvedCrops> {
  const ctx = await loadGardenContext();
  if (ctx?.crops?.length) return { crops: ctx.crops, source: "context" };

  const planCrops = await extractCropsFromActivePlan();
  if (planCrops.length) return { crops: planCrops, source: "plan" };

  return { crops: pickRandom(COMMON_HOME_CROPS, 5), source: "default" };
}

async function extractCropsFromActivePlan(): Promise<string[]> {
  const latest = await db().plans.orderBy("version").reverse().first();
  if (!latest) return [];

  // Task labels surface verbs like "Plant tomato seedlings"; the shopping
  // list is the most explicit crop ledger ("1 lb bush bean seeds", "garlic
  // starts"). Read both, then layer two extractors:
  //   1. extractKnownCrops — canonical-name lookup against COMMON_HOME_CROPS
  //   2. extractCropsByPattern — catches dictionary-misses like "okra seeds"
  // Dictionary hits go first so they win the dedupe (canonical plurals).
  const taskText = latest.weeks
    .flatMap((w) => w.tasks.map((t) => t.label))
    .join(" ");
  const shoppingText = (latest.shoppingList ?? []).join(" ");
  const haystack = `${taskText} ${shoppingText}`.toLowerCase();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [
    ...extractKnownCrops(haystack),
    ...extractCropsByPattern(shoppingText),
  ]) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}


/* ─── helpers ─── */

function pickRandom<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function toMarkdown(ctx: GardenContext): string {
  const lines: string[] = ["# Garden context", ""];
  if (ctx.crops?.length) {
    lines.push("## Crops");
    for (const c of ctx.crops) lines.push(`- ${c}`);
    lines.push("");
  }
  if (ctx.spaceDescription) {
    lines.push(`## Space\n${ctx.spaceDescription}\n`);
  }
  if (ctx.hoursPerWeek != null) {
    lines.push(`## Time commitment\n${ctx.hoursPerWeek} hours per week\n`);
  }
  if (ctx.goals?.length) {
    lines.push("## Goals");
    for (const g of ctx.goals) lines.push(`- ${g}`);
    lines.push("");
  }
  if (ctx.region) lines.push(`## Region\n${ctx.region}\n`);
  return lines.join("\n");
}
