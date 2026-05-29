/**
 * Per-plan export helpers — pure formatters, no DOM, no Dexie. Used by the
 * Plan card's Download button to produce a JSON + Markdown pair the user can
 * stash on disk for backup, sharing, or feeding into other tools.
 *
 * Distinct from `lib/portable.ts` which builds the full ZIP archive across
 * every Dexie table — this module is single-plan and single-purpose.
 */

import type { PlanRecord, PlanTask, PlanWeek } from "./db";

/**
 * Filename stem — `sprouty-plan-v{version}-{YYYY-MM-DD}` — derived from the
 * plan's version and `createdAt`. Append `.json` or `.md` at the call site.
 */
export function planFilenameStem(plan: PlanRecord): string {
  const date = new Date(plan.createdAt).toISOString().slice(0, 10);
  return `sprouty-plan-v${plan.version}-${date}`;
}

/** Pretty-printed JSON — full PlanRecord, every field, indented for readability. */
export function planToJson(plan: PlanRecord): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

/**
 * Human-readable Markdown rendering of a single plan. Designed to be
 * scannable in 30 seconds: header with metadata, one section per week with
 * task checkboxes + citations, then the shopping list.
 */
export function planToMarkdown(plan: PlanRecord): string {
  const out: string[] = [];
  out.push(`# Sprouty plan · v${plan.version}`);
  out.push("");

  const created = new Date(plan.createdAt).toISOString().slice(0, 10);
  const meta: string[] = [
    `**Created:** ${created}`,
    `**Trigger:** ${plan.triggerEvent}`,
  ];
  if (typeof plan.parentVersion === "number") {
    meta.push(`**Parent version:** v${plan.parentVersion}`);
  }
  out.push(meta.join(" · "));
  out.push("");
  out.push("---");
  out.push("");

  for (const week of plan.weeks) {
    out.push(weekToMarkdown(week));
    out.push("");
  }

  if (plan.shoppingList.length > 0) {
    out.push("---");
    out.push("");
    out.push("## Shopping list");
    out.push("");
    for (const item of plan.shoppingList) {
      out.push(`- ${item}`);
    }
    out.push("");
  }

  return out.join("\n");
}

function weekToMarkdown(week: PlanWeek): string {
  const range = `${formatDate(week.startDate)} – ${formatDate(week.endDate)}`;
  const lines: string[] = [`## Week ${week.index} · ${range}`, ""];
  if (week.tasks.length === 0) {
    lines.push("_No tasks this week._");
    return lines.join("\n");
  }
  for (const task of week.tasks) {
    lines.push(taskToMarkdown(task));
  }
  return lines.join("\n");
}

function taskToMarkdown(task: PlanTask): string {
  const checkbox = task.status === "done" ? "[x]" : "[ ]";
  const statusTag =
    task.status === "current" ? " _(current)_" :
    task.status === "done" ? " _(done)_" : "";
  const lines: string[] = [`- ${checkbox} ${task.label}${statusTag}`];
  if (task.citation) {
    lines.push(`  *Source · ${task.citation}*`);
  }
  return lines.join("\n");
}

function formatDate(iso: string): string {
  // Normalize ISO yyyy-mm-dd → "May 6" / "Dec 12" for readability.
  // Falls back to the raw string if the date is malformed so we never
  // throw at render time over a missing zero-pad or similar.
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
