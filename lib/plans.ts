"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type PlanRecord, type PlanWeek } from "./db";

/**
 * Plan persistence — the user's 12-week grow plan lives entirely in IndexedDB
 * (per the BYOK / no-server-storage rule). Every "voice → plan" run by the
 * voice agent creates a new `PlanRecord` with an incremented `version`; the
 * UI always reads the latest version.
 *
 * Until the voice agent is wired, we seed a starter plan from the design mock
 * on first mount so the Today card has something real to render. Once the
 * agent generates a real plan, that one wins (higher version number).
 */

const STARTER_PLAN_ID = "starter-plan-v1";

/**
 * Seed a starter plan if the database has zero plans. Idempotent — safe to call
 * on every mount. Preserves the content from `.local/sprout_design_04.html` so
 * the visual matches the design until real voice-driven data lands.
 */
export async function seedStarterPlanIfEmpty(): Promise<void> {
  const existing = await db().plans.count();
  if (existing > 0) return;

  // 12-week plan starting on the most recent Sunday so dates feel current.
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const week1Start = new Date(now);
  week1Start.setDate(now.getDate() - dayOfWeek);
  week1Start.setHours(0, 0, 0, 0);

  const weeks: PlanWeek[] = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(week1Start);
    start.setDate(week1Start.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      index: i + 1,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      tasks: [],
    };
  });

  // Week 1 starter tasks (matches the design HTML, week-of-the-mockup tasks).
  weeks[0].tasks = [
    {
      id: "t-prep-soil",
      label: "Prep raised bed soil",
      status: "done",
    },
    {
      id: "t-start-tomato",
      label: "Start tomato seeds indoors",
      status: "done",
    },
    {
      id: "t-bean-soak",
      label: "Soak bean seeds, sow tomorrow",
      status: "current",
      citation: "Ch. 3, p. 19",
    },
    {
      id: "t-trellis",
      label: "Set up trellis along south wall",
      status: "pending",
    },
    {
      id: "t-mulch",
      label: "Mulch around tomato seedlings",
      status: "pending",
    },
  ];

  const plan: PlanRecord = {
    id: STARTER_PLAN_ID,
    version: 1,
    triggerEvent: "starter_seed",
    createdAt: Date.now(),
    weeks,
    shoppingList: [
      "1 lb bush bean seeds (Provider variety)",
      "Bamboo trellis stakes (6 ft, x4)",
      "Wood chip mulch (2 cu. ft. bag)",
    ],
  };
  await db().plans.put(plan);
}

/**
 * Reactive accessor for the active plan — always returns the highest-version
 * `PlanRecord` in IndexedDB, or `undefined` while loading.
 */
export function useActivePlan(): PlanRecord | undefined {
  return useLiveQuery(
    async () => {
      const plan = await db().plans.orderBy("version").reverse().first();
      if (!plan) return undefined;
      // Guard against weeks stored without a tasks array (schema drift from early agent runs).
      plan.weeks = plan.weeks.map((w, i) => ({
        ...w,
        index: w.index ?? i + 1,
        tasks: w.tasks ?? [],
      }));
      plan.shoppingList = plan.shoppingList ?? [];
      return plan;
    },
    [],
    undefined,
  );
}

/**
 * Pick the "current week" — the earliest week that still has a non-done task.
 * Falls back to week 1 if every task is done.
 */
export function findCurrentWeek(plan: PlanRecord): PlanWeek {
  const open = plan.weeks.find((w) => w.tasks.some((t) => t.status !== "done"));
  return open ?? plan.weeks[0];
}

/**
 * Toggle a single task between done ↔ pending. If the task was `current`, it
 * advances to `done` and we promote the next-pending task in the same week to
 * `current`. Persists immediately.
 */
export async function toggleTask(
  planId: string,
  weekIndex: number,
  taskId: string,
): Promise<void> {
  const plan = await db().plans.get(planId);
  if (!plan) return;
  const week = plan.weeks.find((w) => w.index === weekIndex);
  if (!week) return;

  const task = week.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (task.status === "done") {
    task.status = "pending";
  } else {
    task.status = "done";
    // If we just finished the current task, promote the next pending one.
    const wasCurrent = !week.tasks.some((t) => t.status === "current");
    if (wasCurrent) {
      const nextPending = week.tasks.find((t) => t.status === "pending");
      if (nextPending) nextPending.status = "current";
    }
  }

  await db().plans.put(plan);
}
