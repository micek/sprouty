"use client";

import type { PlanRecord, PlanTask, PlanWeek } from "./db";

/**
 * Compact, agent-readable snapshot of the user's active plan. Sent as part
 * of `participant.metadata` when the browser mints a LiveKit token, so the
 * Python voice agent can answer questions like "what's next in my plan?"
 * without needing a tool call back to the browser (IndexedDB is browser-
 * only — the agent has no way to fetch the plan dynamically).
 *
 * Kept short on purpose: the system-prompt budget is small and the model
 * doesn't need every task across all 12 weeks. We send the current week
 * fully, the next week as a preview, and aggregate counts for the rest.
 */
export interface PlanSnapshot {
  /** Plan version, e.g. 3 — let Sprouty say "your latest plan, version 3". */
  version: number;
  /** When this version was created (ISO date). */
  createdAt: string;
  /** Whether this is the seeded starter plan (no real voice convo yet). */
  isStarter: boolean;
  /** 1-based current week index (the earliest week with non-done tasks). */
  currentWeekIndex: number;
  /** ISO start/end dates of the current week. */
  currentWeekStart: string;
  currentWeekEnd: string;
  /** Tasks in the current week, in order. */
  currentWeekTasks: SnapshotTask[];
  /** Quick preview of week N+1's first 2-3 tasks so Sprouty can say "next week you'll start X". */
  nextWeekPreview?: {
    index: number;
    startDate: string;
    endDate: string;
    firstTasks: SnapshotTask[];
  };
  /** Weeks that are fully complete. */
  completedWeeks: number;
  /** Total tasks across all 12 weeks. */
  totalTasks: number;
  /** Tasks marked done. */
  doneTasks: number;
  /** Shopping list — short enough to send wholesale. */
  shoppingList: string[];
}

export interface SnapshotTask {
  /** Free-text task label, e.g. "Soak bean seeds, sow tomorrow". */
  label: string;
  /** Status — drives "you're working on …" vs. "still pending". */
  status: "pending" | "current" | "done";
  /** Optional citation like "Ch. 3, p. 19" — let Sprouty echo the source. */
  citation?: string;
}

/**
 * Build the snapshot. Returns `null` when there's no plan yet (the agent
 * skips the plan block in its system context). Pure function — no IDB / no
 * side effects, so callers can do the IDB read themselves.
 */
export function summarizePlanForAgent(plan: PlanRecord | null | undefined): PlanSnapshot | null {
  if (!plan || plan.weeks.length === 0) return null;

  const currentWeek =
    plan.weeks.find((w) => w.tasks.some((t) => t.status !== "done")) ?? plan.weeks[0];
  const nextWeek = plan.weeks.find((w) => w.index === currentWeek.index + 1);

  const completedWeeks = plan.weeks.filter(
    (w) => w.tasks.length > 0 && w.tasks.every((t) => t.status === "done"),
  ).length;
  const totalTasks = plan.weeks.reduce((s, w) => s + w.tasks.length, 0);
  const doneTasks = plan.weeks.reduce(
    (s, w) => s + w.tasks.filter((t) => t.status === "done").length,
    0,
  );

  return {
    version: plan.version,
    createdAt: new Date(plan.createdAt).toISOString().slice(0, 10),
    isStarter: plan.triggerEvent === "starter_seed",
    currentWeekIndex: currentWeek.index,
    currentWeekStart: currentWeek.startDate,
    currentWeekEnd: currentWeek.endDate,
    currentWeekTasks: currentWeek.tasks.map(toSnapshotTask),
    nextWeekPreview: nextWeek
      ? {
          index: nextWeek.index,
          startDate: nextWeek.startDate,
          endDate: nextWeek.endDate,
          firstTasks: nextWeek.tasks.slice(0, 3).map(toSnapshotTask),
        }
      : undefined,
    completedWeeks,
    totalTasks,
    doneTasks,
    shoppingList: plan.shoppingList,
  };
}

function toSnapshotTask(t: PlanTask): SnapshotTask {
  return {
    label: t.label,
    status: t.status,
    citation: t.citation,
  };
}
