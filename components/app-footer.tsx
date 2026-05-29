"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { resetEverything } from "@/lib/reset";
import { toast } from "@/lib/toast";

/**
 * Page footer with the "Start over" control — wipes all local data (IndexedDB,
 * device id, and best-effort Qdrant vectors) via `resetEverything()` behind a
 * confirm dialog, then reloads. The escape hatch for the no-accounts, BYOK
 * model where the only way to "log out" is to clear the browser.
 */
export function AppFooter() {
  const [busy, setBusy] = useState(false);

  const onStartOver = async () => {
    if (busy) return;
    const ok = window.confirm(
      "Start over?\n\n" +
        "This permanently deletes your plan, voice sessions, knowledge-base files, " +
        "vision images, garden context, and saved API keys — and clears the Qdrant " +
        "collection. There is no undo.",
    );
    if (!ok) return;

    setBusy(true);
    try {
      const summary = await resetEverything();
      if (summary.qdrant === "failed") {
        toast.fail(
          "Local data cleared",
          `Qdrant reset failed (${summary.qdrantError ?? "unknown error"}) — reloading anyway.`,
        );
      } else {
        toast.ok("Cleared — starting fresh");
      }
      // Small pause so the toast is briefly visible before reload.
      setTimeout(() => window.location.reload(), 250);
    } catch (err) {
      setBusy(false);
      toast.fail(
        "Couldn't reset",
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  };

  return (
    <footer
      className="mt-6 border-t px-8 py-12 text-center max-[700px]:px-5 max-[700px]:py-8"
      style={{
        background: "var(--color-paper-cream)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div className="mb-4 flex justify-center">
        <button
          type="button"
          onClick={onStartOver}
          disabled={busy}
          className="font-mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: "var(--color-terracotta-deep)" }}
        >
          <RotateCcw size={11} strokeWidth={2.5} />
          {busy ? "Clearing…" : "Start over · clear plan"}
        </button>
      </div>
      <div
        className="font-mono mb-2 text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Created by{" "}
        <strong style={{ color: "var(--color-forest)" }}>Cory Micek</strong> —
        Qdrant{" "}
        <strong style={{ color: "var(--color-forest)" }}>
          Think Outside the Bot
        </strong>{" "}
        Hackathon 2026
      </div>
      <div
        className="font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Built on{" "}
        <strong style={{ color: "var(--color-forest)" }}>Qdrant</strong> ·{" "}
        <strong style={{ color: "var(--color-forest)" }}>
          Mistral
        </strong>{" "}
        (Voxtral STT/TTS, Mistral Small) ·{" "}
        <strong style={{ color: "var(--color-forest)" }}>LiveKit</strong> ·{" "}
        <strong style={{ color: "var(--color-forest)" }}>Nano Banana</strong> ·{" "}
        <strong style={{ color: "var(--color-forest)" }}>trigger.dev</strong>
      </div>
    </footer>
  );
}
