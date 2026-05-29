"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Mic, Sprout as SproutGlyph } from "lucide-react";
import type { PlanTask, PlanWeek } from "@/lib/db";
import { findCurrentWeek, toggleTask, useActivePlan } from "@/lib/plans";
import { useAppStore } from "@/lib/store";
import { Section } from "./section";

/**
 * Full 12-week timeline view of the active plan. Sister to <PlanCard />,
 * which only renders the current week. The timeline is the artifact a judge
 * (or a user) actually scrolls through to see the whole arc — past weeks
 * dim, the current week pulses, future weeks render at full saturation but
 * with hollow node markers.
 *
 * The component reads the active plan via `useActivePlan()` so it stays in
 * sync with everything else (voice-driven plan generation, the starter seed,
 * version bumps from problem-report replans).
 *
 * Scroll behavior: the section's `id="plan"` is on the wrapper div in
 * `app/page.tsx` so the global `.scroll-anchor { scroll-margin-top: 96px }`
 * rule applies. We deliberately do NOT auto-scroll into the current week on
 * mount — the topbar's "Plan" tab scrolls to the section heading, and any
 * follow-up auto-scroll would override the user's intent and dump them
 * below the title.
 */
export function PlanTimeline() {
  const plan = useActivePlan();
  const prefersReducedMotion = useReducedMotion();

  // No real plan yet: either still loading or only the demo starter-seed exists.
  // Either way, surface a clear CTA instead of the demo timeline so the user
  // knows the next step is to talk to Sprouty.
  if (!plan || plan.triggerEvent === "starter_seed") {
    return (
      <Section
        eyebrow="Your 12 Weeks"
        title={
          <>
            From soil to harvest. This is{" "}
            <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
              your plan.
            </em>
          </>
        }
      >
        <PlanTimelineEmptyState />
      </Section>
    );
  }

  const currentWeek = findCurrentWeek(plan);
  const totalsByWeek = plan.weeks.map((w) => ({
    index: w.index,
    total: w.tasks.length,
    done: w.tasks.filter((t) => t.status === "done").length,
  }));
  const grandTotal = totalsByWeek.reduce((s, w) => s + w.total, 0);
  const grandDone = totalsByWeek.reduce((s, w) => s + w.done, 0);
  const citedCount = plan.weeks.reduce(
    (s, w) => s + w.tasks.filter((t) => t.citation).length,
    0,
  );

  return (
    <Section
      eyebrow="Your 12 Weeks"
      title={
        <>
          From soil to harvest. This is{" "}
          <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
            your plan.
          </em>
        </>
      }
      right={
        <div
          className="flex items-center gap-6 text-[13px] max-[700px]:gap-3"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <div>
            <strong style={{ color: "var(--color-forest)" }}>
              {grandDone}/{grandTotal}
            </strong>{" "}
            tasks done
          </div>
          <div className="h-4 w-px max-[700px]:hidden" style={{ background: "var(--color-rule)" }} />
          <div>
            <strong style={{ color: "var(--color-forest)" }}>{citedCount}</strong> cite
            sources
          </div>
          {plan.triggerEvent === "starter_seed" ? (
            <span
              className="font-mono inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.14em]"
              style={{
                background: "rgba(196, 221, 88, 0.10)",
                borderColor: "rgba(196, 221, 88, 0.4)",
                color: "var(--color-sage)",
              }}
            >
              SAMPLE PLAN
            </span>
          ) : (
            <span
              className="font-mono inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em]"
              style={{
                background: "var(--color-forest)",
                color: "var(--color-lime)",
              }}
            >
              v{plan.version}
            </span>
          )}
        </div>
      }
    >
      <ol className="relative ml-1 list-none">
        {/* Vertical rail behind the markers. Faded gradient stops at the
            last week so it doesn't dangle below the final node. */}
        <span
          aria-hidden
          className="absolute left-[7px] top-2"
          style={{
            bottom: 16,
            width: 2,
            background:
              "linear-gradient(180deg, rgba(196, 221, 88, 0.5), rgba(196, 221, 88, 0.18) 60%, rgba(196, 221, 88, 0.05))",
            borderRadius: 2,
          }}
        />

        {plan.weeks.map((week, i) => {
          const isCurrent = week.index === currentWeek.index;
          const allDone =
            week.tasks.length > 0 && week.tasks.every((t) => t.status === "done");
          const isPast = week.index < currentWeek.index || allDone;
          return (
            <motion.li
              key={week.index}
              className="relative pb-7 pl-9 last:pb-0"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2, margin: "0px 0px -80px 0px" }}
              transition={{
                duration: 0.4,
                delay: prefersReducedMotion ? 0 : Math.min(i * 0.04, 0.4),
                ease: [0.2, 0.8, 0.2, 1],
              }}
            >
              <WeekMarker isCurrent={isCurrent} isPast={isPast} />
              <WeekCard
                planId={plan.id}
                week={week}
                isCurrent={isCurrent}
                isPast={isPast}
              />
            </motion.li>
          );
        })}
      </ol>

      {plan.shoppingList.length > 0 && (
        <ShoppingList items={plan.shoppingList} />
      )}
    </Section>
  );
}

/* ─── week marker (timeline node) ─── */

function WeekMarker({ isCurrent, isPast }: { isCurrent: boolean; isPast: boolean }) {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-[10px] flex h-4 w-4 items-center justify-center rounded-full"
      style={{
        background: isCurrent
          ? "var(--color-forest)"
          : isPast
            ? "var(--color-lime)"
            : "var(--color-card)",
        border: isCurrent
          ? "3px solid var(--color-lime)"
          : isPast
            ? "3px solid var(--color-lime)"
            : "2px solid rgba(143, 179, 64, 0.55)",
        boxShadow: isCurrent
          ? "0 0 0 4px rgba(196, 221, 88, 0.25), 0 4px 12px rgba(143, 179, 64, 0.35)"
          : "none",
        animation: isCurrent ? "pulse-tiny 1.6s ease-in-out infinite" : undefined,
      }}
    >
      {isPast && !isCurrent && (
        <span
          aria-hidden
          style={{
            width: 5,
            height: 3,
            borderLeft: "2px solid var(--color-forest)",
            borderBottom: "2px solid var(--color-forest)",
            transform: "rotate(-45deg) translate(0, -1px)",
            marginTop: -1,
          }}
        />
      )}
    </span>
  );
}

/* ─── week card ─── */

function WeekCard({
  planId,
  week,
  isCurrent,
  isPast,
}: {
  planId: string;
  week: PlanWeek;
  isCurrent: boolean;
  isPast: boolean;
}) {
  const status: "current" | "done" | "upcoming" = isCurrent
    ? "current"
    : isPast
      ? "done"
      : "upcoming";

  return (
    <div
      className="rounded-2xl border p-4 transition-all"
      style={{
        background: isCurrent ? "var(--color-paper-cream)" : "var(--color-card)",
        borderColor: isCurrent ? "rgba(196, 221, 88, 0.6)" : "var(--color-rule)",
        boxShadow: isCurrent
          ? "0 0 0 4px rgba(196, 221, 88, 0.15), 0 8px 20px rgba(45, 61, 42, 0.06)"
          : "none",
        opacity: status === "done" ? 0.78 : 1,
      }}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div
            className="font-tight text-[13px] font-bold uppercase tracking-[0.12em]"
            style={{
              color:
                status === "current"
                  ? "var(--color-forest)"
                  : "var(--color-ink-muted)",
            }}
          >
            Week {week.index}
          </div>
          <div className="text-[12px]" style={{ color: "var(--color-ink-faded)" }}>
            {formatRange(week.startDate, week.endDate)}
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      {week.tasks.length === 0 ? (
        <EmptyWeek />
      ) : (
        <ul className="flex flex-col gap-2">
          {week.tasks.map((t) => (
            <TimelineTaskRow
              key={t.id}
              task={t}
              onToggle={() => toggleTask(planId, week.index, t.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "current" | "done" | "upcoming" }) {
  const styles: Record<typeof status, { bg: string; color: string; label: string }> = {
    current: {
      bg: "var(--color-lime)",
      color: "var(--color-forest)",
      label: "This week",
    },
    done: {
      bg: "rgba(143, 179, 64, 0.15)",
      color: "var(--color-sage-deep)",
      label: "Complete",
    },
    upcoming: {
      bg: "var(--color-paper-warm)",
      color: "var(--color-ink-muted)",
      label: "Upcoming",
    },
  };
  const s = styles[status];
  return (
    <span
      className="font-mono shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em]"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label.toUpperCase()}
    </span>
  );
}

function TimelineTaskRow({
  task,
  onToggle,
}: {
  task: PlanTask;
  onToggle: () => void | Promise<void>;
}) {
  const isDone = task.status === "done";
  const isCurrent = task.status === "current";
  return (
    <li>
      <button
        onClick={() => void onToggle()}
        className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-colors hover:bg-[rgba(196,221,88,0.08)]"
      >
        <span
          className="relative mt-[3px] flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px]"
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
                : "rgba(143, 179, 64, 0.45)",
          }}
        >
          {isDone && (
            <span
              className="absolute"
              style={{
                top: 4,
                left: 3.5,
                width: 7,
                height: 3,
                borderLeft: "2px solid var(--color-forest)",
                borderBottom: "2px solid var(--color-forest)",
                transform: "rotate(-45deg)",
              }}
            />
          )}
          {isCurrent && (
            <span
              style={{
                width: 5,
                height: 5,
                background: "var(--color-lime)",
                borderRadius: "50%",
                animation: "pulse-tiny 1.5s ease-in-out infinite",
              }}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block leading-snug"
            style={{
              color: isDone
                ? "var(--color-ink-faded)"
                : isCurrent
                  ? "var(--color-forest)"
                  : "var(--color-ink)",
              fontWeight: isCurrent ? 600 : 400,
              textDecoration: isDone ? "line-through" : undefined,
            }}
          >
            {task.label}
          </span>
          {task.citation && (
            <span
              className="font-mono mt-1 block text-[10px] uppercase tracking-[0.14em]"
              style={{
                color: isDone
                  ? "var(--color-ink-faded)"
                  : "var(--color-sage-deep)",
              }}
            >
              Source · {task.citation}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Empty state shown before the user has had a real voice session — replaces
 * the demo starter-seed timeline. "Tap to talk" scrolls back to the hero
 * (where <VoiceCard /> lives) and flips the global voiceState; the existing
 * <VoiceSessionController /> picks that up and mints the LiveKit session.
 */
function PlanTimelineEmptyState() {
  const setVoiceState = useAppStore((s) => s.setVoiceState);

  const handleTapToTalk = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setVoiceState("listening-inline");
  };

  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-16 text-center max-[700px]:py-12"
      style={{
        background: "var(--color-paper-cream)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: -120,
          right: -120,
          width: 280,
          height: 280,
          background:
            "radial-gradient(circle, rgba(196, 221, 88, 0.22), transparent 70%)",
        }}
      />
      <div
        className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{
          background: "var(--color-forest)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <SproutGlyph size={34} color="var(--color-lime)" strokeWidth={2.5} />
      </div>
      <h3
        className="font-tight relative z-10 mt-6 max-w-md text-[24px] font-bold leading-[1.2]"
        style={{ color: "var(--color-forest)", letterSpacing: "-0.02em" }}
      >
        Talk to Sprouty to{" "}
        <em
          className="font-serif-italic"
          style={{ color: "var(--color-sage)" }}
        >
          generate your garden plan.
        </em>
      </h3>
      <p
        className="relative z-10 mt-3 max-w-md text-[14px] leading-relaxed"
        style={{ color: "var(--color-ink-muted)" }}
      >
        90 seconds of voice and Sprouty builds out your full 12-week plan —
        week by week, with sources cited.
      </p>
      <div className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleTapToTalk}
          className="inline-flex items-center gap-2 rounded-full px-5 py-[10px] text-[14px] font-semibold transition-all hover:-translate-y-px"
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
          className="inline-flex items-center gap-2 rounded-full border px-4 py-[10px] text-[13px] max-[700px]:hidden"
          style={{
            background: "var(--color-card)",
            borderColor: "var(--color-rule)",
            color: "var(--color-ink-muted)",
          }}
        >
          <span className="font-medium">or hold</span>
          <span className="kbd-key">K</span>
        </span>
      </div>
    </div>
  );
}

function EmptyWeek() {
  return (
    <div
      className="rounded-xl border border-dashed px-3 py-4 text-[12px] italic"
      style={{
        borderColor: "var(--color-rule)",
        color: "var(--color-ink-faded)",
        background: "var(--color-paper)",
      }}
    >
      No tasks yet — Sprouty will fill this week in once you talk through your
      goals.
    </div>
  );
}

function ShoppingList({ items }: { items: string[] }) {
  return (
    <div
      className="mt-7 rounded-2xl border p-5"
      style={{
        background: "var(--color-paper-cream)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div
        className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-sage)" }}
      >
        <span style={{ width: 16, height: 1.5, background: "var(--color-sage)" }} />
        Shopping list
      </div>
      <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-[13.5px] leading-snug"
            style={{ color: "var(--color-ink-soft)" }}
          >
            <span
              aria-hidden
              className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ background: "var(--color-sage)" }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── helpers ─── */

function formatRange(startISO: string, endISO: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return `${fmt(startISO)} – ${fmt(endISO)}`;
}

function PlanTimelineSkeleton() {
  return (
    <ol className="relative ml-1 list-none">
      <span
        aria-hidden
        className="absolute left-[7px] top-2"
        style={{
          bottom: 16,
          width: 2,
          background: "rgba(196, 221, 88, 0.18)",
        }}
      />
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="relative pb-7 pl-9">
          <span
            aria-hidden
            className="absolute left-0 top-[10px] h-4 w-4 rounded-full"
            style={{
              background: "var(--color-card)",
              border: "2px solid rgba(143, 179, 64, 0.35)",
            }}
          />
          <div
            className="rounded-2xl border p-4"
            style={{
              background: "var(--color-card)",
              borderColor: "var(--color-rule)",
            }}
          >
            <div className="shimmer mb-3 h-3 w-32 rounded-full" />
            <div className="shimmer h-3 w-24 rounded-full" />
            <div className="mt-4 flex flex-col gap-2">
              <div className="shimmer h-9 rounded-xl" />
              <div className="shimmer h-9 rounded-xl" />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* expose Skeleton for the loading-shimmer pass */
export { PlanTimelineSkeleton };
