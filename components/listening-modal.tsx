"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Square } from "lucide-react";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { SproutCharacter } from "./sprout-character";
import { Waveform } from "./waveform";

const PLACEHOLDER_TRANSCRIPT =
  "I have a sunny back patio, maybe two hours a week, and I really want vegetables I can use in salads";

/**
 * Full-screen K-hold listening modal. Per `.local/sprout_design_04_listening.html` —
 * appears when the user holds K for ≥200ms. The page behind blurs (handled by
 * the `body.modal-open` class managed in <KeyboardListener />).
 */
export function ListeningModal() {
  const voiceState = useAppStore((s) => s.voiceState);
  const setVoiceState = useAppStore((s) => s.setVoiceState);
  const liveTranscript = useAppStore((s) => s.liveTranscript);

  const isOpen = voiceState === "listening-modal";

  // Toggle body.modal-open so .behind-modal wrappers blur via CSS.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen) document.body.classList.add("modal-open");
    else document.body.classList.remove("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [isOpen]);

  const transcript = liveTranscript || PLACEHOLDER_TRANSCRIPT;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="listening-modal"
          className="fixed inset-0 z-[100] flex items-center justify-center p-8 max-[700px]:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {/* Backdrop — click to dismiss */}
          <button
            type="button"
            aria-label="Close listening modal"
            onClick={() => setVoiceState("idle")}
            className="absolute inset-0 cursor-default"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(45, 61, 42, 0.30), rgba(26, 36, 24, 0.55) 70%)",
            }}
          />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-[720px] overflow-hidden rounded-[40px] px-16 py-11 text-center max-[700px]:rounded-[28px] max-[700px]:px-8 max-[700px]:py-8"
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(196, 221, 88, 0.4)",
              boxShadow:
                "0 0 0 1px rgba(196, 221, 88, 0.15), 0 0 80px rgba(196, 221, 88, 0.25), 0 32px 96px rgba(26, 36, 24, 0.4)",
            }}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {/* Top glow halo */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2"
              style={{
                top: -150,
                transform: "translateX(-50%)",
                width: 700,
                height: 700,
                background:
                  "radial-gradient(circle, rgba(196, 221, 88, 0.30), transparent 60%)",
                animation: "glow-listening 2s ease-in-out infinite",
              }}
            />

            {/* Eyebrow pill */}
            <div
              className="font-mono relative z-10 mx-auto mb-4 inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{
                background: "rgba(196, 221, 88, 0.12)",
                borderColor: "rgba(196, 221, 88, 0.3)",
                color: "var(--color-sage)",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: "var(--color-lime-deep)",
                  animation: "pulse-dot-fast 0.8s ease-in-out infinite",
                }}
              />
              Listening
            </div>

            <h2
              className="font-tight relative z-10 mb-3 text-[clamp(28px,3.6vw,38px)] font-bold leading-[1.1]"
              style={{
                color: "var(--color-forest)",
                letterSpacing: "-0.03em",
              }}
            >
              Go ahead —{" "}
              <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
                I&apos;m all ears.
              </em>
            </h2>
            <p
              className="relative z-10 mb-6 text-sm"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Talk for as long as you need. Hit{" "}
              <span className="kbd-key">End call</span> when you&apos;re done.
            </p>

            {/* Sprout — design-spec 240px for the modal (vs 280px inline).
                Larger than the old 200 so the watering-can drops have room
                to render above the body without getting clipped behind it. */}
            <div className="relative z-10 mx-auto mb-5" style={{ width: 240 }}>
              <SproutCharacter state="listening" size={240} />
            </div>

            {/* Modal waveform */}
            <div className="relative z-10 mx-auto mb-5 flex justify-center">
              <Waveform variant="modal" />
            </div>

            {/* Transcript card */}
            <div
              className="relative z-10 mb-5 rounded-[20px] border px-6 py-5 text-left"
              style={{
                background: "rgba(248, 246, 240, 0.6)",
                borderColor: "rgba(196, 221, 88, 0.2)",
              }}
            >
              <div
                className="font-mono mb-2.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--color-sage)" }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "var(--color-lime-deep)",
                    animation: "pulse-dot-fast 0.8s ease-in-out infinite",
                  }}
                />
                Live transcript
              </div>
              {/* Teleprompter — bottom-aligned with a top fade so a long
                  monologue can't bloat the modal off-screen. ~6 lines visible
                  before older lines start dissolving up. */}
              <div
                className="flex flex-col justify-end overflow-hidden"
                style={{
                  height: 144,
                  maskImage:
                    "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 18%, black 42%, black 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 18%, black 42%, black 100%)",
                }}
              >
                <div
                  className="font-serif-italic text-[19px] leading-[1.45] max-[700px]:text-[16px]"
                  style={{ color: "var(--color-forest)" }}
                >
                  {transcript}
                  <span
                    className="inline-block align-text-bottom"
                    style={{
                      width: 2,
                      height: 19,
                      background: "var(--color-sage)",
                      marginLeft: 2,
                      animation: "cursor-blink 0.8s ease-in-out infinite",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Footer status row */}
            <div
              className="relative z-10 flex flex-wrap items-center justify-center gap-3.5 border-t pt-6 text-[13px]"
              style={{
                borderColor: "rgba(196, 221, 88, 0.15)",
                color: "var(--color-ink-muted)",
              }}
            >
              <span
                className="font-mono inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--color-ink-faded)" }}
              >
                <strong style={{ color: "var(--color-sage)", fontWeight: 600 }}>
                  ● Voxtral
                </strong>{" "}
                · streaming STT
              </span>
              <span style={{ color: "var(--color-ink-faded)" }}>·</span>
              <button
                type="button"
                onClick={() => setVoiceState("idle")}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all hover:-translate-y-px"
                style={{
                  background: "var(--color-forest)",
                  color: "#fff",
                  boxShadow: "0 8px 20px rgba(45, 61, 42, 0.18)",
                }}
              >
                <Square
                  size={12}
                  strokeWidth={3}
                  color="var(--color-terracotta-deep)"
                  fill="var(--color-terracotta-deep)"
                />
                End call
              </button>
              <span
                className="text-[11px]"
                style={{ color: "var(--color-ink-faded)" }}
              >
                or press <span className="kbd-key">Esc</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
