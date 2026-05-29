"use client";

import { db, type PlanRecord, type SessionRecord } from "./db";
import { extractKnownCrops, loadGardenContext, saveGardenContext, type GardenContext } from "./garden-context";
import { loadAllKeys } from "./keys";

/**
 * Client orchestrator for `/api/plan`. Streams the NDJSON response, persists
 * three IndexedDB rows in one shot when the run succeeds:
 *
 *   1. SessionRecord  — the raw transcript + summary + extracted constraints
 *   2. PlanRecord     — versioned (parent = previous highest); always a NEW
 *                       row, never an overwrite (per CLAUDE.md rule)
 *   3. GardenContext  — *merged* with whatever the user already had, so an
 *                       update doesn't drop fields they mentioned previously
 *
 * Every voice session and every "regenerate" eventually calls this — both
 * the LiveKit agent (Phase 5) and any test UI that supplies a typed
 * transcript will share the same persistence path.
 */

export type PlanIntent =
  | "initial_planning"
  | "weekly_checkin"
  | "problem_report"
  | "general_chat";

export interface PlanProgressEvent {
  stage: "extracting" | "retrieving" | "generating" | "done" | "error";
  progress?: number;
  message?: string;
  error?: string;
}

export interface PlanGenerationInput {
  transcript: string;
  intent?: PlanIntent;
  /** Optional callback fired on every NDJSON event (UI progress bars). */
  onProgress?: (event: PlanProgressEvent) => void;
}

export interface PlanGenerationSuccess {
  ok: true;
  session: SessionRecord;
  /**
   * The newly-versioned plan, or `null` when the conversation didn't warrant
   * a replan (e.g. the user already had a plan and just asked a Q&A
   * question). The previous active plan stays in IndexedDB untouched.
   */
  plan: PlanRecord | null;
  context: GardenContext;
  sources: Array<{
    chunkId: string;
    score: number;
    sourceDoc: string;
    chapter?: string;
    section?: string;
  }>;
  /**
   * `true` when the server short-circuited plan generation because the
   * user's words didn't change the plan and one already existed. Lets the
   * UI swap the "Plan ready" splash for a calmer "Got it" toast.
   */
  skipped: boolean;
}

export interface PlanGenerationFailure {
  ok: false;
  error: string;
  status?: number;
}

export async function generatePlan(
  input: PlanGenerationInput,
): Promise<PlanGenerationSuccess | PlanGenerationFailure> {
  const transcript = input.transcript.trim();
  if (transcript.length < 5) {
    return { ok: false, error: "Transcript is empty or too short to plan from." };
  }

  const keys = await loadAllKeys();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (keys.openrouter) headers["x-openrouter-key"] = keys.openrouter;
  if (keys.qdrant) headers["x-qdrant-key"] = keys.qdrant;
  if (process.env.NEXT_PUBLIC_QDRANT_URL) {
    headers["x-qdrant-url"] = process.env.NEXT_PUBLIC_QDRANT_URL;
  }

  // Tell the server whether a plan already exists so it can short-circuit
  // generation on conversations that don't actually change anything (Q&A,
  // story requests, etc.). Read-only IDB lookup — cheap.
  const existing = await db().plans.orderBy("version").reverse().first();
  const hasExistingPlan = existing != null;

  let res: Response;
  try {
    res = await fetch("/api/plan", {
      method: "POST",
      headers,
      body: JSON.stringify({
        transcript,
        intent: input.intent,
        hasExistingPlan,
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
  if (!res.body) {
    return { ok: false, status: res.status, error: `HTTP ${res.status} — empty response` };
  }

  const finalEvent = await consumeNdjson(res.body, input.onProgress);
  if (finalEvent.stage === "error") {
    return { ok: false, status: res.status, error: finalEvent.error ?? "Plan generation failed" };
  }
  if (finalEvent.stage !== "done") {
    return { ok: false, error: "Plan stream ended without a `done` event" };
  }

  // Persist session + plan + merged context. Wrapped in a Dexie transaction
  // so a failure halfway through doesn't leave us with, e.g., a session
  // pointing at a plan that never landed.
  const persisted = await persist(transcript, finalEvent, input.intent);
  return { ok: true, ...persisted };
}

/* ─── NDJSON consumer ─── */

interface FinalDoneEvent {
  stage: "done";
  constraints: GardenContext & { intent?: PlanIntent };
  /** `null` when the server skipped replan; we just persist context. */
  plan: { weeks: PlanRecord["weeks"]; shoppingList: string[] } | null;
  sources: PlanGenerationSuccess["sources"];
  skipped?: boolean;
}
interface FinalErrorEvent {
  stage: "error";
  error?: string;
}

async function consumeNdjson(
  body: ReadableStream<Uint8Array>,
  onProgress?: (event: PlanProgressEvent) => void,
): Promise<FinalDoneEvent | FinalErrorEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: FinalDoneEvent | FinalErrorEvent | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as PlanProgressEvent | FinalDoneEvent;
        if (event.stage === "done" || event.stage === "error") {
          final = event as FinalDoneEvent | FinalErrorEvent;
        }
        onProgress?.(event as PlanProgressEvent);
      } catch {
        // skip malformed lines silently
      }
    }
  }
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim()) as FinalDoneEvent | FinalErrorEvent;
      final = event;
      onProgress?.(event as unknown as PlanProgressEvent);
    } catch {
      /* ignore */
    }
  }
  return final ?? { stage: "error", error: "Plan stream ended without a final event" };
}

/* ─── persistence ─── */

async function persist(
  transcript: string,
  event: FinalDoneEvent,
  intentHint: PlanIntent | undefined,
): Promise<{
  session: SessionRecord;
  plan: PlanRecord | null;
  context: GardenContext;
  sources: PlanGenerationSuccess["sources"];
  skipped: boolean;
}> {
  const now = Date.now();
  const intent: PlanIntent = event.constraints.intent ?? intentHint ?? "general_chat";

  // Merge garden context — last write wins on individual fields, but crops
  // dedupe with whatever the user previously named (so they accumulate over
  // multiple sessions instead of getting clobbered).
  const existing = (await loadGardenContext()) ?? { crops: [] };
  const merged: GardenContext = {
    ...existing,
    ...(stripUndefined(event.constraints as unknown as Record<string, unknown>) as Partial<GardenContext>),
    crops: dedupeCrops([
      ...(existing.crops ?? []),
      ...(event.constraints.crops ?? []),
      ...extractKnownCrops(transcript),
    ]),
  };

  const session: SessionRecord = {
    id: `session-${now}`,
    startedAt: now,
    endedAt: now,
    intent,
    transcriptText: transcript,
    summary: buildShortSummary(transcript, event.constraints),
    extractedConstraints: merged as unknown as Record<string, unknown>,
  };

  // Skipped path: the user already had a plan and the conversation didn't
  // change anything plan-relevant. Persist the session + merged context
  // so the transcript/journal is preserved, but DON'T mint a new
  // PlanRecord — the active plan stays put.
  if (event.skipped || event.plan === null) {
    await db().transaction("rw", [db().sessions, db().context], async () => {
      await Promise.all([db().sessions.put(session), saveGardenContext(merged)]);
    });
    return {
      session,
      plan: null,
      context: merged,
      sources: event.sources,
      skipped: true,
    };
  }

  // Bump plan version on top of whatever already exists.
  const previous = await db().plans.orderBy("version").reverse().first();
  const nextVersion = (previous?.version ?? 0) + 1;
  const planId = `plan-v${nextVersion}-${now}`;
  const plan: PlanRecord = {
    id: planId,
    version: nextVersion,
    parentVersion: previous?.version,
    triggerEvent:
      intent === "weekly_checkin"
        ? "weekly_checkin"
        : intent === "problem_report"
          ? "problem_report"
          : "voice_session",
    createdAt: now,
    weeks: event.plan.weeks,
    shoppingList: event.plan.shoppingList,
  };

  await db().transaction(
    "rw",
    [db().sessions, db().plans, db().context],
    async () => {
      await Promise.all([
        db().sessions.put(session),
        db().plans.put(plan),
        saveGardenContext(merged),
      ]);
    },
  );

  return { session, plan, context: merged, sources: event.sources, skipped: false };
}

/* ─── small helpers ─── */

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function dedupeCrops(crops: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of crops) {
    const key = c.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c.trim().toLowerCase());
  }
  return out;
}

function buildShortSummary(
  transcript: string,
  constraints: { crops?: string[]; spaceDescription?: string; hoursPerWeek?: number },
): string {
  const parts: string[] = [];
  if (constraints.crops?.length) parts.push(`crops: ${constraints.crops.join(", ")}`);
  if (constraints.spaceDescription) parts.push(constraints.spaceDescription);
  if (constraints.hoursPerWeek != null) parts.push(`${constraints.hoursPerWeek} hrs/week`);
  if (parts.length === 0) return transcript.slice(0, 140);
  return parts.join(" · ");
}
