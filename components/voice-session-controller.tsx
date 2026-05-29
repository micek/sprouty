"use client";

import { useEffect, useRef } from "react";
import { db } from "@/lib/db";
import {
  finalizeSessionWithPlan,
  startLiveSession,
  type LiveSessionHandle,
} from "@/lib/livekit-room";
import { useAppStore } from "@/lib/store";
import { dismissToast, toast } from "@/lib/toast";

/**
 * Headless voice-session controller. Mounted once at the page level
 * (alongside <KeyboardListener /> and the modals). Watches `voiceState` and:
 *
 *   idle  →  listening-inline | listening-modal
 *      mints a token, joins the LiveKit room, publishes the mic, attaches
 *      the agent's audio reply, and pipes user transcripts into the global
 *      `liveTranscript` so the UI shows real text instead of the placeholder.
 *
 *   listening-* → idle
 *      tears down the room cleanly, then awaits the final transcript and
 *      hands it off to `generatePlan()` so the Today tile rerenders with
 *      a freshly-versioned plan.
 *
 * All UI feedback (busy spinner, error band) flows through the existing
 * zustand store and the modal/card components — this controller never
 * renders DOM of its own.
 */
export function VoiceSessionController() {
  const voiceState = useAppStore((s) => s.voiceState);
  const setVoiceState = useAppStore((s) => s.setVoiceState);
  const setLiveTranscript = useAppStore((s) => s.setLiveTranscript);
  const appendLiveTranscript = useAppStore((s) => s.appendLiveTranscript);
  const clearLiveTranscript = useAppStore((s) => s.clearLiveTranscript);

  // Refs (not state) so the cleanup in the effect can read the live handle
  // without re-running the effect every time the handle is mutated.
  const handleRef = useRef<LiveSessionHandle | null>(null);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  // Tracks whether we've seen the first STT result this session — separate
  // from the room handle because `onUserTranscript` can fire before
  // `startLiveSession()` resolves.
  const seenFirstTranscriptRef = useRef(false);

  useEffect(() => {
    const isListening =
      voiceState === "listening-inline" || voiceState === "listening-modal";

    // listening start: mint + connect if we don't already have a handle.
    if (isListening && !handleRef.current && !startingRef.current) {
      startingRef.current = true;
      seenFirstTranscriptRef.current = false;
      clearLiveTranscript();
      setLiveTranscript("Listening…");

      void startLiveSession({
        onUserTranscript: (text) => {
          // First transcript replaces the "Listening…" placeholder; later
          // turns append onto it for a running on-screen caption.
          if (seenFirstTranscriptRef.current) {
            appendLiveTranscript(` ${text}`);
          } else {
            setLiveTranscript(text);
            seenFirstTranscriptRef.current = true;
          }
        },
        onError: (message) => {
          // Toast the error so the user actually sees what went wrong —
          // the listening modal/card auto-closes a beat later and the
          // transcript line on its own gets eaten by the dismiss.
          toast.fail("Voice session error", message);
          setLiveTranscript(`(voice error) ${message}`);
          setVoiceState("idle");
        },
      })
        .then((handle) => {
          handleRef.current = handle;
          // When the room ends (user stops or agent disconnects), kick off
          // post-call processing. Two paths depending on whether a plan
          // already exists when the conversation ends:
          //
          //   no existing plan  → show the "Generating your plan…" toast
          //                       so the gap between modal-close and the
          //                       new plan rendering reads as progress.
          //   existing plan     → stay quiet; the server may short-circuit
          //                       (Q&A only) or update the plan. We pick
          //                       the right success toast once we know.
          void handle.endPromise.then(async ({ transcript }) => {
            const trimmed = transcript.trim();
            if (trimmed.length < 5) return;

            const hadPlanBefore = (await db().plans.count()) > 0;
            const pendingId = hadPlanBefore
              ? null
              : toast.info(
                  "Generating your plan…",
                  "Pulling sources from your knowledge base.",
                  30_000,
                );

            void finalizeSessionWithPlan(trimmed)
              .then((result) => {
                if (pendingId) dismissToast(pendingId);
                if (!result.ok) {
                  console.warn(
                    "[sprouty] plan generation after voice session failed:",
                    result.error,
                  );
                  toast.fail("Plan generation failed", result.error);
                  return;
                }

                if (result.skipped) {
                  // Q&A or chitchat — no plan changes. Keep it quiet.
                  toast.ok(
                    "Got it",
                    "Saved this chat. Your plan stays as-is.",
                  );
                  return;
                }

                if (hadPlanBefore) {
                  toast.ok(
                    "Plan updated",
                    "Pulled in what you said and re-versioned the plan.",
                  );
                } else {
                  toast.ok(
                    "Plan ready",
                    "Your 12-week plan was generated from this conversation.",
                  );
                }
                // Auto-scroll to the 12-week timeline so the user sees the
                // result without hunting for it. Defer past the next paint
                // so the live-queried plan has actually rendered into the
                // DOM before we scroll there.
                scrollToPlanSection();
              })
              .catch((err) => {
                if (pendingId) dismissToast(pendingId);
                const message = err instanceof Error ? err.message : String(err);
                toast.fail("Plan generation crashed", message);
              });
          });
        })
        .catch((err) => {
          const message =
            err instanceof Error ? err.message : "Could not start voice session";
          // The mint failure (most common: no LIVEKIT_API_KEY in .env.local,
          // or the Python agent isn't running) is what the user sees as a
          // "modal flicker" — the modal opens, the mint fails, state flips
          // back to idle, modal dismisses. Surface the real reason so it's
          // actionable instead of mysterious.
          toast.fail(
            "Couldn't start voice session",
            decoratePlausibleCause(message),
          );
          setLiveTranscript(`(voice error) ${message}`);
          setVoiceState("idle");
        })
        .finally(() => {
          startingRef.current = false;
        });
    }

    // listening stop: tear down the active handle (if any) when the UI
    // transitions back to idle.
    if (!isListening && handleRef.current && !stoppingRef.current) {
      stoppingRef.current = true;
      const h = handleRef.current;
      handleRef.current = null;
      seenFirstTranscriptRef.current = false;
      void h.stop().finally(() => {
        stoppingRef.current = false;
      });
    }
  }, [voiceState, appendLiveTranscript, clearLiveTranscript, setLiveTranscript, setVoiceState]);

  // On unmount, tear down any in-flight room so we don't leak a connection.
  useEffect(() => {
    return () => {
      if (handleRef.current) {
        void handleRef.current.stop();
        handleRef.current = null;
      }
    };
  }, []);

  return null;
}

/**
 * Smooth-scroll the page to the 12-week plan timeline section. Triggered
 * after `Plan ready` toasts so the user lands on their fresh plan without
 * scrolling. Defers a frame to let the new plan render before we scroll —
 * otherwise the browser may aim at an old (shorter) layout and miss the
 * actual plan position.
 */
function scrollToPlanSection(): void {
  if (typeof window === "undefined") return;
  // Two rAFs ≈ one paint. Small enough to feel immediate, late enough that
  // the live-queried PlanTimeline has had a chance to render the new rows.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = document.getElementById("plan");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/**
 * Tack on a hint about the most common root cause when the underlying error
 * looks like a token-mint failure. Saves the user a round-trip to the
 * Vercel logs to figure out which env var they forgot.
 */
function decoratePlausibleCause(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("token mint failed") || lower.includes("livekit") || lower.includes("401") || lower.includes("403")) {
    return `${message} — make sure LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL are set in .env.local and the Python voice agent is running.`;
  }
  return message;
}
