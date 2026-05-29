"use client";

import { Mic, Square } from "lucide-react";
import { useRef } from "react";
import { useAppStore } from "@/lib/store";
import { SproutCharacter } from "./sprout-character";
import { Waveform } from "./waveform";

const PLACEHOLDER_TRANSCRIPT =
  "I have a sunny back patio, maybe two hours a week, and I really want vegetables I can use in salads";

/**
 * Hold a touch / mouse on Sprout or the "Tap to talk" button this many ms to
 * promote the inline listening state into the full-screen modal — mirrors the
 * desktop K-hold behavior on touch devices. Matches the 500ms target in
 * sprout_prd.md / CLAUDE.md.
 */
const LONG_PRESS_MS = 500;

export function VoiceCard() {
  const voiceState = useAppStore((s) => s.voiceState);
  const setVoiceState = useAppStore((s) => s.setVoiceState);
  const liveTranscript = useAppStore((s) => s.liveTranscript);

  const isListening = voiceState === "listening-inline";

  // Long-press → modal listening plumbing. The timer ref schedules the modal
  // promotion; the "triggered" ref tells the upcoming click handler to bail
  // (otherwise releasing after the modal opens would immediately start an
  // inline listening state and clobber the modal).
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const startListening = () => {
    if (voiceState === "idle") setVoiceState("listening-inline");
  };
  const stopListening = () => setVoiceState("idle");

  const startHold = () => {
    // Only arm long-press while idle — once we're already listening, every
    // tap should fall through to the regular toggle.
    if (voiceState !== "idle") return;
    longPressTriggeredRef.current = false;
    if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setVoiceState("listening-modal");
      // The pointerup that follows the long-press synthesizes a click on
      // whatever sits under the finger — once the modal pops open that's
      // usually its backdrop, whose onClick dismisses the modal. Eat the
      // very next click in the capture phase so the modal sticks. Without
      // this, the modal flashed open and immediately closed, and the
      // VoiceSessionController never got the time to mint a LiveKit token.
      const swallowNextClick = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      };
      document.addEventListener("click", swallowNextClick, {
        capture: true,
        once: true,
      });
    }, LONG_PRESS_MS);
  };

  const cancelHold = () => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  /** Click guard — eats the click that follows a long-press release so we
      don't accidentally also pop inline listening on top of the modal. */
  const handleTap = (cb: () => void) => () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    cb();
  };

  // Show live transcript when present; otherwise fall back to placeholder
  // until real STT is wired so the design is faithful.
  const transcript = liveTranscript || PLACEHOLDER_TRANSCRIPT;

  return (
    <section
      className="relative flex min-h-[600px] flex-col items-center justify-center overflow-hidden rounded-[32px] border px-12 py-14 text-center transition-all duration-500 max-[700px]:min-h-[520px] max-[700px]:px-6 max-[700px]:py-9"
      style={{
        background: "var(--color-card)",
        borderColor: isListening
          ? "rgba(196, 221, 88, 0.5)"
          : "var(--color-rule)",
        boxShadow: isListening
          ? "0 0 0 4px rgba(196, 221, 88, 0.15), 0 12px 32px rgba(45, 61, 42, 0.08), 0 24px 64px rgba(45, 61, 42, 0.10)"
          : "var(--shadow-md)",
      }}
    >
      {/* Ambient glow (idle: gentle; listening: amped) */}
      <div
        className="pointer-events-none absolute left-1/2"
        style={{
          top: -100,
          transform: "translateX(-50%)",
          width: 600,
          height: 600,
          background: isListening
            ? "radial-gradient(circle, rgba(196, 221, 88, 0.45), rgba(109, 180, 212, 0.15) 40%, transparent 70%)"
            : "radial-gradient(circle, rgba(196, 221, 88, 0.18), transparent 60%)",
          animation: isListening
            ? "glow-listening 2s ease-in-out infinite"
            : "glow-breathe 5s ease-in-out infinite",
          transition: "background 0.4s ease",
        }}
      />

      {/* Eyebrow */}
      <div
        className="relative z-10 mb-5 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors"
        style={{
          color: isListening ? "var(--color-lime-deep)" : "var(--color-sage)",
        }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: "var(--color-lime)",
            boxShadow: "0 0 0 4px rgba(196, 221, 88, 0.3)",
            animation: isListening
              ? "pulse-dot-fast 0.8s ease-in-out infinite"
              : "pulse-dot 2s ease-in-out infinite",
          }}
        />
        {isListening ? "Listening · Voxtral STT" : "Voice Agent · Always On"}
      </div>

      {/* Headline + subtitle both fade while listening so the transcript
          overlay can occupy the same vertical region cleanly. */}
      <h1
        className="font-tight relative z-10 mb-3.5 max-w-[540px] text-[clamp(28px,3.6vw,40px)] font-bold leading-[1.05] transition-opacity"
        style={{
          color: "var(--color-forest)",
          letterSpacing: "-0.035em",
          opacity: isListening ? 0 : 1,
        }}
      >
        Talk to me about{" "}
        <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
          your space.
        </em>
      </h1>

      <p
        className="relative z-10 mb-9 max-w-[460px] text-[15px] leading-[1.55] transition-opacity"
        style={{
          color: "var(--color-ink-muted)",
          opacity: isListening ? 0 : 1,
        }}
      >
        Describe your patio, your time, your goals. I&apos;ll build a personalized
        garden plan from your knowledge base.
      </p>

      {/* Listening transcript overlay (absolute over the subtitle area).
          Behaves like a teleprompter — latest words pinned to the bottom,
          older lines fade up and out via the top mask, so a long monologue
          can't paint over the Sprout character / waveform / Stop button.
          The slight font shrink (18px desktop, 15px mobile) lets ~6 lines
          breathe inside the height cap before any fading kicks in. */}
      <div
        className="pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 flex-col justify-end overflow-hidden px-6 transition-opacity"
        style={{
          top: 92,
          height: 168,
          maxWidth: 560,
          width: "100%",
          opacity: isListening ? 1 : 0,
          // Fade the top ~40% of the box so overflowing older text dissolves
          // into the card instead of getting hard-clipped.
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 18%, black 42%, black 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 18%, black 42%, black 100%)",
        }}
      >
        <div
          className="font-mono mb-2 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--color-sage)" }}
        >
          <span
            style={{
              flex: 1,
              maxWidth: 32,
              height: 1,
              background: "rgba(90, 138, 58, 0.3)",
            }}
          />
          Hearing you
          <span
            style={{
              flex: 1,
              maxWidth: 32,
              height: 1,
              background: "rgba(90, 138, 58, 0.3)",
            }}
          />
        </div>
        <div
          className="font-serif-italic text-center text-[18px] leading-[1.4] max-[700px]:text-[15px]"
          style={{ color: "var(--color-forest)" }}
        >
          {transcript}
          <span
            className="inline-block align-text-bottom"
            style={{
              width: 2,
              height: 18,
              background: "var(--color-sage)",
              marginLeft: 2,
              animation: "cursor-blink 0.8s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      {/* Sprout — wrapped so we can capture touch/mouse hold events for the
          long-press → modal listening behavior on mobile. */}
      <div
        className="relative z-10 mb-6"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
      >
        <SproutCharacter
          state={isListening ? "listening" : "idle"}
          onClick={isListening ? stopListening : handleTap(startListening)}
        />
      </div>

      {/* Inline waveform — only renders/visible while listening */}
      <div
        className="relative z-10 mb-6 transition-opacity"
        style={{
          opacity: isListening ? 1 : 0,
          height: 56,
          marginBottom: isListening ? 24 : 0,
        }}
      >
        {isListening && <Waveform variant="inline" />}
      </div>

      {/* Idle CTA row — fades out + un-clickable while listening */}
      <div
        className="relative z-10 flex flex-col items-center gap-3 transition-opacity"
        style={{
          opacity: isListening ? 0 : 1,
          pointerEvents: isListening ? "none" : "auto",
        }}
      >
        <div className="flex items-center gap-3.5 max-[700px]:flex-col max-[700px]:gap-2">
          <button
            onClick={handleTap(startListening)}
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            className="inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-px"
            style={{
              background: "var(--color-forest)",
              boxShadow: "0 8px 24px rgba(45, 61, 42, 0.18)",
            }}
          >
            <Mic size={14} strokeWidth={2.5} />
            Tap to talk
          </button>
          <span
            className="text-xs font-medium max-[700px]:hidden"
            style={{ color: "var(--color-ink-faded)" }}
          >
            or
          </span>
          <div
            className="inline-flex items-center gap-2 rounded-full border px-4 py-[11px] text-[13px] font-medium"
            style={{
              background: "var(--color-paper)",
              borderColor: "var(--color-rule)",
              color: "var(--color-ink-soft)",
            }}
          >
            <span>Hold</span>
            <span className="kbd-key" style={{ minWidth: 26, height: 24 }}>
              K
            </span>
          </div>
        </div>
      </div>

      {/* Stop & send — replaces the CTA row while listening */}
      <div
        className="absolute left-1/2 z-10 flex items-center transition-all"
        style={{
          bottom: 56,
          transform: isListening
            ? "translateX(-50%) translateY(0)"
            : "translateX(-50%) translateY(20px)",
          opacity: isListening ? 1 : 0,
          pointerEvents: isListening ? "auto" : "none",
          transitionDelay: isListening ? "100ms" : "0ms",
        }}
      >
        <button
          onClick={stopListening}
          className="inline-flex items-center gap-2.5 rounded-full border px-5 py-3 text-[13px] font-semibold transition-colors"
          style={{
            background: "rgba(45, 61, 42, 0.06)",
            color: "var(--color-forest)",
            borderColor: "var(--color-rule)",
          }}
        >
          <Square
            size={14}
            strokeWidth={3}
            color="var(--color-terracotta-deep)"
            fill="var(--color-terracotta-deep)"
          />
          End call
        </button>
      </div>
    </section>
  );
}
