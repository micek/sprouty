"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, X } from "lucide-react";
import { useEffect } from "react";
import { dismissToast, useToasts, type ToastItem } from "@/lib/toast";

// All toasts stay until manually dismissed (ttl=0 → no auto-dismiss timer).
const DEFAULT_TTL: Record<ToastItem["kind"], number> = {
  ok: 0,
  info: 0,
  fail: 0,
};

/**
 * Top-right toast host, anchored just below the sticky <TopBar />. Sits above
 * every page layer (z-index higher than the K-hold listening modal) so
 * success/error feedback never gets eclipsed. The top offsets here are
 * `topbar height + 8px` — 78px on desktop (py-4 + 36px brand + 1px border),
 * 68px on mobile (py-3). Mobile (≤700px) stretches the stack edge-to-edge.
 */
export function ToastHost() {
  const toasts = useToasts();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[78px] z-[200] flex flex-col items-end gap-2 px-6 max-[700px]:top-[68px] max-[700px]:items-stretch max-[700px]:px-3"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const ttl = toast.ttl ?? DEFAULT_TTL[toast.kind];

  useEffect(() => {
    if (ttl <= 0) return;
    const id = window.setTimeout(() => dismissToast(toast.id), ttl);
    return () => window.clearTimeout(id);
  }, [toast.id, ttl]);

  const palette = paletteFor(toast.kind);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="pointer-events-auto flex w-[320px] max-w-full items-start gap-3 rounded-2xl border px-4 py-3 max-[700px]:w-full"
      style={{
        background: palette.bg,
        borderColor: palette.border,
        boxShadow: "0 12px 32px rgba(15, 22, 13, 0.18)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <div
        className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: palette.iconBg, color: palette.iconFg }}
        aria-hidden
      >
        {toast.kind === "ok" ? (
          <Check size={13} strokeWidth={3} />
        ) : toast.kind === "fail" ? (
          <X size={13} strokeWidth={3} />
        ) : (
          <Info size={13} strokeWidth={2.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="font-tight text-[13px] font-semibold leading-snug [overflow-wrap:anywhere]"
          style={{ color: palette.title }}
        >
          {toast.title}
        </div>
        {toast.body && (
          <div
            className="mt-0.5 text-[12px] leading-snug [overflow-wrap:anywhere]"
            style={{ color: palette.body }}
          >
            {toast.body}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss"
        className="-mr-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-100"
        style={{ color: palette.body, opacity: 0.6 }}
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

function paletteFor(kind: ToastItem["kind"]): {
  bg: string;
  border: string;
  iconBg: string;
  iconFg: string;
  title: string;
  body: string;
} {
  if (kind === "ok") {
    return {
      bg: "rgba(255, 255, 255, 0.97)",
      border: "rgba(196, 221, 88, 0.5)",
      iconBg: "var(--color-lime)",
      iconFg: "var(--color-forest)",
      title: "var(--color-forest)",
      body: "var(--color-ink-muted)",
    };
  }
  if (kind === "fail") {
    return {
      bg: "rgba(255, 255, 255, 0.97)",
      border: "rgba(196, 130, 90, 0.5)",
      iconBg: "var(--color-terracotta-deep)",
      iconFg: "#fff",
      title: "var(--color-terracotta-deep)",
      body: "var(--color-ink-muted)",
    };
  }
  return {
    bg: "rgba(255, 255, 255, 0.97)",
    border: "var(--color-rule)",
    iconBg: "var(--color-paper-warm)",
    iconFg: "var(--color-forest)",
    title: "var(--color-forest)",
    body: "var(--color-ink-muted)",
  };
}
