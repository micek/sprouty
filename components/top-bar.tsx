"use client";

import { motion } from "framer-motion";
import { Settings as SettingsIcon, Sprout as SproutGlyph } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const TABS = ["My Garden", "Knowledge", "Plan", "Vision"] as const;
type Tab = (typeof TABS)[number];

// Tab → DOM id of the section to scroll to. Order here matches the on-page
// section order (hero → knowledge → plan → vision) so the topbar reads
// left-to-right as the user scrolls down.
const TAB_TARGETS: Record<Tab, string> = {
  "My Garden": "hero",
  Knowledge: "knowledge",
  Plan: "plan",
  Vision: "vision",
};

// Tabs hidden on the mobile pill so the row doesn't wrap. Per Cory's earlier
// directive, "Vision" was dropped from mobile to keep the topbar tight; the
// section is still reachable by scrolling.
const MOBILE_HIDDEN: ReadonlySet<Tab> = new Set<Tab>(["Vision"]);

// Reverse lookup for the scrollspy. Kept here so the section list and the
// tab list always stay in lockstep.
const TAB_FOR_SECTION: Record<string, Tab> = {
  hero: "My Garden",
  knowledge: "Knowledge",
  plan: "Plan",
  vision: "Vision",
};
const SECTION_IDS = Object.keys(TAB_FOR_SECTION);

// Scroll-spy probe line: a section becomes "active" once its top edge crosses
// this many pixels from the viewport top. ~140px sits comfortably below the
// sticky topbar so a section is registered just as its heading appears.
const SCROLLSPY_PROBE_Y = 140;

// How long to ignore the scrollspy after a tab click. Smooth-scroll animations
// drag the viewport past intermediate sections; without this lockout the
// highlighted pill bounces during the animation.
const SCROLLSPY_LOCKOUT_MS = 800;

function scrollToId(id: string) {
  if (typeof window === "undefined") return;
  if (id === "hero") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function TopBar() {
  const [active, setActive] = useState<Tab>("My Garden");
  // Click-initiated navigation suspends the scrollspy until this timestamp so
  // the smooth-scroll animation can't drag the active pill through every
  // section it passes through on the way to its destination.
  const scrollSpyMutedUntilRef = useRef<number>(0);

  const onTabClick = (tab: Tab) => {
    scrollSpyMutedUntilRef.current = Date.now() + SCROLLSPY_LOCKOUT_MS;
    setActive(tab);
    scrollToId(TAB_TARGETS[tab]);
  };

  const onBrandClick = () => {
    scrollSpyMutedUntilRef.current = Date.now() + SCROLLSPY_LOCKOUT_MS;
    setActive("My Garden");
    scrollToId("hero");
  };

  // Scroll-spy: walk the section list top-to-bottom and pick the deepest
  // one whose top has crossed the probe line. RAF-throttled so the listener
  // runs at most once per frame on long-scroll trackpads.
  useEffect(() => {
    let rafId: number | null = null;

    const update = () => {
      rafId = null;
      if (Date.now() < scrollSpyMutedUntilRef.current) return;
      let activeId = SECTION_IDS[0];
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= SCROLLSPY_PROBE_Y) {
          activeId = id;
        } else {
          break;
        }
      }
      const nextTab = TAB_FOR_SECTION[activeId];
      if (nextTab) setActive((prev) => (prev === nextTab ? prev : nextTab));
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-2xl"
      style={{
        background: "rgba(248, 246, 240, 0.85)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-8 py-4 max-[700px]:gap-2 max-[700px]:px-4 max-[700px]:py-3">
        {/* Brand — full wordmark on desktop, logo-only on mobile.
            Click target scrolls back to the top of the page. */}
        <button
          type="button"
          onClick={onBrandClick}
          aria-label="Scroll to top"
          className="flex flex-shrink-0 items-center gap-3 rounded-xl transition-opacity hover:opacity-85"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              background: "var(--color-forest)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <SproutGlyph size={22} color="var(--color-lime)" strokeWidth={2.5} />
          </div>
          <div
            className="font-tight text-[22px] font-bold max-[700px]:hidden"
            style={{ color: "var(--color-forest)" }}
          >
            Sprouty
          </div>
        </button>

        {/* Tabs — visible on every breakpoint, just tighter on mobile */}
        <nav
          className="flex items-center gap-1 rounded-full border p-[5px] max-[700px]:p-[3px]"
          style={{
            background: "var(--color-card)",
            borderColor: "var(--color-rule)",
          }}
        >
          {TABS.map((tab) => {
            const isActive = active === tab;
            const hideOnMobile = MOBILE_HIDDEN.has(tab);
            return (
              <button
                key={tab}
                onClick={() => onTabClick(tab)}
                className={`relative rounded-full px-4 py-2 text-[13px] font-medium transition-colors hover:[color:var(--color-forest)] max-[700px]:px-3 max-[700px]:py-1.5 max-[700px]:text-xs${
                  hideOnMobile ? " max-[700px]:hidden" : ""
                }`}
                style={{
                  color: isActive ? "#fff" : "var(--color-ink-muted)",
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "var(--color-forest)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.8 }}
                  />
                )}
                <span className="relative z-10">{tab}</span>
              </button>
            );
          })}
        </nav>

        {/* Right cluster — K-hint desktop-only; Settings collapses to a gear on mobile */}
        <div className="flex flex-shrink-0 items-center gap-3.5 max-[700px]:gap-2">
          <div
            className="flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs max-[700px]:hidden"
            style={{
              background: "var(--color-card)",
              borderColor: "var(--color-rule)",
              color: "var(--color-ink-muted)",
            }}
          >
            <span className="font-medium">Hold</span>
            <span className="kbd-key">K</span>
            <span className="font-medium">to talk</span>
          </div>
          <button
            onClick={() => scrollToId("settings")}
            aria-label="Settings"
            className="flex items-center gap-2 rounded-full px-4 py-[9px] text-[13px] font-semibold transition-all hover:-translate-y-px max-[700px]:h-9 max-[700px]:w-9 max-[700px]:justify-center max-[700px]:gap-0 max-[700px]:p-0"
            style={{
              background: "var(--color-lime)",
              color: "var(--color-forest)",
            }}
          >
            <SettingsIcon size={14} strokeWidth={2.5} />
            <span className="max-[700px]:hidden">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
}
