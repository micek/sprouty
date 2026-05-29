"use client";

import { Download, Mic, Sprout as SproutGlyph } from "lucide-react";
import { useEffect } from "react";
import type { PlanRecord, PlanTask } from "@/lib/db";
import {
  planFilenameStem,
  planToJson,
  planToMarkdown,
} from "@/lib/plan-export";
import {
  findCurrentWeek,
  seedStarterPlanIfEmpty,
  toggleTask,
  useActivePlan,
} from "@/lib/plans";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";

const TOTAL_WEEKS = 12;

/**
 * The "Today" card. Reads the active plan from IndexedDB so tasks survive
 * reloads, restarts, and (eventually) cross-device sync via ZIP export.
 *
 * Until the voice agent is wired, a starter plan is seeded on first mount so
 * the card has real data. Once the agent produces a higher-version plan, this
 * card switches to that automatically (latest-version wins).
 */
export function PlanCard() {
  const plan = useActivePlan();

  // Seed once on first mount if no plan exists yet.
  useEffect(() => {
    void seedStarterPlanIfEmpty();
  }, []);

  if (!plan) {
    return <PlanCardSkeleton />;
  }

  // Until the user runs their first real voice session, the only plan that
  // exists is the design-mock starter we seed on first mount. Show the empty
  // state so the card reads as "no plan yet" instead of pretending the starter
  // tasks are real.
  if (plan.triggerEvent === "starter_seed") {
    return <PlanCardEmptyState />;
  }

  const currentWeek = findCurrentWeek(plan);
  const completedWeeks = plan.weeks.filter((w) =>
    w.tasks.length > 0 && w.tasks.every((t) => t.status === "done"),
  ).length;
  const inProgressWeek = currentWeek.index;
  const dateLabel = `${formatRange(currentWeek.startDate, currentWeek.endDate)}`;

  // Pick a headline crop name to highlight from the current task pool.
  const headline = pickHeadline(currentWeek.tasks);

  return (
    <section
      className="relative flex flex-col overflow-hidden rounded-[32px] px-8 py-9"
      style={{
        background: "var(--color-forest)",
        color: "#fff",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: -80,
          right: -80,
          width: 240,
          height: 240,
          background: "radial-gradient(circle, rgba(196, 221, 88, 0.18), transparent 70%)",
        }}
      />
      <div
        className="relative z-10 mb-3.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-lime)" }}
      >
        <span>▸ This Week</span>
        <button
          type="button"
          onClick={() => downloadPlanFiles(plan)}
          aria-label="Download plan as JSON and Markdown"
          title="Download this plan (JSON + Markdown)"
          className="ml-auto inline-flex items-center justify-center rounded-full p-1.5 transition-all hover:bg-white/10"
          style={{ color: "var(--color-lime-bright)" }}
        >
          <Download size={14} strokeWidth={2.5} />
        </button>
      </div>
      <h3
        className="font-tight relative z-10 mb-2 text-[26px] font-bold leading-[1.15]"
        style={{ letterSpacing: "-0.025em" }}
      >
        {headline.before}
        {headline.emphasis && (
          <em
            className="font-serif-italic"
            style={{ color: "var(--color-lime-bright)" }}
          >
            {headline.emphasis}
          </em>
        )}
      </h3>
      <div
        className="relative z-10 mb-6 text-[13px]"
        style={{ color: "rgba(196, 221, 88, 0.7)" }}
      >
        Week {inProgressWeek} of {TOTAL_WEEKS} · {dateLabel}
      </div>

      <div className="relative z-10 mb-6 flex flex-col gap-2">
        {currentWeek.tasks.length === 0 ? (
          <EmptyTasks />
        ) : (
          currentWeek.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={() => toggleTask(plan.id, currentWeek.index, t.id)}
            />
          ))
        )}
      </div>

      <div className="relative z-10 mb-3 flex gap-[3px]">
        {Array.from({ length: TOTAL_WEEKS }).map((_, i) => (
          <span
            key={i}
            className="h-[5px] flex-1 rounded-full"
            style={{
              background:
                i < completedWeeks
                  ? "var(--color-lime)"
                  : i === inProgressWeek - 1
                    ? "rgba(196, 221, 88, 0.55)"
                    : "rgba(196, 221, 88, 0.18)",
            }}
          />
        ))}
      </div>

      <div
        className="relative z-10 mt-auto text-xs"
        style={{ color: "rgba(196, 221, 88, 0.7)" }}
      >
        {planFooter(currentWeek.tasks)}
      </div>
    </section>
  );
}

function TaskRow({ task, onToggle }: { task: PlanTask; onToggle: () => void }) {
  const isDone = task.status === "done";
  const isCurrent = task.status === "current";

  return (
    <button
      onClick={onToggle}
      className="flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left text-[13.5px] transition-all hover:-translate-y-px"
      style={{
        background: isCurrent
          ? "var(--color-lime)"
          : "rgba(196, 221, 88, 0.08)",
        color: isCurrent ? "var(--color-forest)" : undefined,
        fontWeight: isCurrent ? 600 : 400,
      }}
    >
      <span
        className="relative mt-[3px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-[1.5px]"
        style={{
          background: isDone
            ? "var(--color-lime)"
            : isCurrent
              ? "var(--color-forest)"
              : "transparent",
          borderColor: isDone
            ? "var(--color-lime)"
            : isCurrent
              ? "var(--color-forest)"
              : "rgba(196, 221, 88, 0.4)",
        }}
      >
        {isDone && (
          <span
            className="absolute"
            style={{
              top: 5,
              left: 4,
              width: 8,
              height: 4,
              borderLeft: "2px solid var(--color-forest)",
              borderBottom: "2px solid var(--color-forest)",
              transform: "rotate(-45deg)",
            }}
          />
        )}
        {isCurrent && (
          <span
            style={{
              width: 6,
              height: 6,
              background: "var(--color-lime)",
              borderRadius: "50%",
              animation: "pulse-tiny 1.5s ease-in-out infinite",
            }}
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block"
          style={{
            color: isDone ? "rgba(255,255,255,0.55)" : undefined,
            textDecoration: isDone ? "line-through" : undefined,
            textDecorationColor: isDone ? "rgba(196, 221, 88, 0.4)" : undefined,
          }}
        >
          {task.label}
        </span>
        {task.citation && (
          <Citation
            text={task.citation}
            tone={isCurrent ? "on-lime" : isDone ? "muted" : "default"}
          />
        )}
      </span>
    </button>
  );
}

/**
 * Inline `Source · Ch. 3, p. 19` line. Always rendered when a task has a
 * citation — the chunk credit is the load-bearing artifact of the Qdrant
 * Discovery query (and the headline judging axis), so it stays visible even
 * after the task is checked off. Tone variants:
 *
 *   default  — green-on-forest: subtle but legible against the plan card.
 *   on-lime  — forest-on-lime: used inside the current/highlighted task pill.
 *   muted    — extra-faded for done tasks so the line-through stays readable.
 */
function Citation({ text, tone }: { text: string; tone: "default" | "on-lime" | "muted" }) {
  const color =
    tone === "on-lime"
      ? "rgba(45, 61, 42, 0.78)"
      : tone === "muted"
        ? "rgba(196, 221, 88, 0.45)"
        : "rgba(196, 221, 88, 0.78)";
  return (
    <span
      className="font-mono mt-1 block text-[10px] uppercase tracking-[0.14em]"
      style={{ color }}
    >
      Source · {text}
    </span>
  );
}

function EmptyTasks() {
  return (
    <div
      className="rounded-xl px-3.5 py-4 text-[13px] italic"
      style={{
        background: "rgba(196, 221, 88, 0.05)",
        color: "rgba(255, 255, 255, 0.55)",
      }}
    >
      No tasks scheduled — talk to Sprouty to build out this week.
    </div>
  );
}

/**
 * Empty state shown before the user has had a real voice session. Sits inside
 * the same dark forest card surface as the populated state so the hero-grid
 * layout doesn't shift between empty + filled. "Tap to talk" flips the global
 * `voiceState` to `listening-inline` — <VoiceSessionController /> picks that
 * up and mints the LiveKit session.
 */
function PlanCardEmptyState() {
  const setVoiceState = useAppStore((s) => s.setVoiceState);

  const handleTapToTalk = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setVoiceState("listening-inline");
  };

  return (
    <section
      className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-[32px] px-8 py-9 text-center"
      style={{
        background: "var(--color-forest)",
        color: "#fff",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: -100,
          right: -100,
          width: 280,
          height: 280,
          background: "radial-gradient(circle, rgba(196, 221, 88, 0.22), transparent 70%)",
        }}
      />
      <div
        className="relative z-10 mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{
          background: "rgba(196, 221, 88, 0.14)",
          border: "1px solid rgba(196, 221, 88, 0.32)",
        }}
      >
        <SproutGlyph size={34} color="var(--color-lime)" strokeWidth={2.5} />
      </div>
      <div
        className="font-mono relative z-10 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-lime)" }}
      >
        ▸ This Week
      </div>
      <h3
        className="font-tight relative z-10 max-w-[18rem] text-[24px] font-bold leading-[1.18]"
        style={{ letterSpacing: "-0.025em" }}
      >
        No plan{" "}
        <em
          className="font-serif-italic"
          style={{ color: "var(--color-lime-bright)" }}
        >
          yet.
        </em>
      </h3>
      <p
        className="relative z-10 mt-3 max-w-[20rem] text-[13.5px] leading-relaxed"
        style={{ color: "rgba(196, 221, 88, 0.78)" }}
      >
        Tell Sprouty your space, time, and what you want to grow — and your
        first week of tasks lands here.
      </p>
      <button
        type="button"
        onClick={handleTapToTalk}
        className="relative z-10 mt-6 inline-flex items-center gap-2 rounded-full px-5 py-[10px] text-[14px] font-semibold transition-all hover:-translate-y-px"
        style={{
          background: "var(--color-lime)",
          color: "var(--color-forest)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <Mic size={14} strokeWidth={2.5} />
        Tap to talk
      </button>
      <span
        className="relative z-10 mt-3 inline-flex items-center gap-2 text-[12px] max-[700px]:hidden"
        style={{ color: "rgba(196, 221, 88, 0.6)" }}
      >
        <span>or hold</span>
        <span className="kbd-key">K</span>
      </span>
    </section>
  );
}

function PlanCardSkeleton() {
  return (
    <section
      className="relative flex min-h-[420px] flex-col overflow-hidden rounded-[32px] px-8 py-9"
      style={{
        background: "var(--color-forest)",
        color: "#fff",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div className="shimmer-dark h-3 w-24 rounded-full" />
      <div className="shimmer-dark mt-4 h-7 w-44 rounded-full" />
      <div className="shimmer-dark mt-2 h-3 w-32 rounded-full" />
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shimmer-dark h-10 rounded-xl" />
        ))}
      </div>
    </section>
  );
}

/* ─── helpers ─── */

function formatRange(startISO: string, endISO: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return `${fmt(startISO)} — ${fmt(endISO)}`;
}

/**
 * Pick the headline copy. If a "current" task name has a recognizable crop
 * keyword, lean into it. Otherwise, fall back to a generic header.
 */
function pickHeadline(tasks: PlanTask[]): { before: string; emphasis?: string } {
  const current = tasks.find((t) => t.status === "current");
  const target = current?.label ?? tasks[0]?.label ?? "";
  const known = ["beans", "tomatoes", "lettuce", "peppers", "herbs", "kale", "squash"];
  const match = known.find((k) => target.toLowerCase().includes(k));
  if (match) return { before: "Plant your ", emphasis: match };
  return { before: "Tend your ", emphasis: "garden" };
}

function planFooter(tasks: PlanTask[]): string {
  const cited = tasks.filter((t) => t.citation).length;
  if (cited === 0) return "Next nudge Sunday at 9:00 AM";
  return `Next nudge Sunday at 9:00 AM · ${cited}/${tasks.length} tasks cite the knowledge base`;
}

/**
 * Trigger two browser downloads — one JSON, one Markdown — for the active
 * plan. Some browsers (Chrome) prompt once per origin to allow multiple
 * file downloads in quick succession; the user grants it once and future
 * exports are silent. We toast on success so the click feels acknowledged
 * even if the downloads land in the corner without user-visible motion.
 */
function downloadPlanFiles(plan: PlanRecord): void {
  const stem = planFilenameStem(plan);
  try {
    triggerDownload(`${stem}.json`, planToJson(plan), "application/json");
    triggerDownload(`${stem}.md`, planToMarkdown(plan), "text/markdown");
    toast.ok("Plan downloaded", `${stem}.json + ${stem}.md`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    toast.fail("Couldn't download plan", message);
  }
}

function triggerDownload(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer the revoke so the browser actually finishes consuming the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
