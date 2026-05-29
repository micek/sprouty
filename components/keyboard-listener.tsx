"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";

const HOLD_THRESHOLD_MS = 200; // distinguish a hold from an accidental tap

/**
 * Global keyboard handler:
 *   - Holding "K" for ≥200ms enters the modal listening state.
 *   - The modal is **sticky** — releasing K does NOT auto-close it. We
 *     learned the hard way that a 200ms hold + immediate-release flow felt
 *     like a flicker (modal flashed open and closed before LiveKit could
 *     even mint a token). Now the user has to explicitly dismiss via
 *     Escape, the backdrop, or the Stop & send button inside the modal.
 *   - "Escape" exits any listening state.
 *
 * Suppresses the shortcut when the user is typing in an input/textarea or any
 * contentEditable, so the K-hold doesn't fight with API key entry, search, etc.
 */
export function KeyboardListener() {
  const setVoiceState = useAppStore((s) => s.setVoiceState);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kHeldRef = useRef(false);

  useEffect(() => {
    const isTextInput = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextInput(e.target)) return;

      if (e.key === "Escape") {
        // Always allow Escape to break out
        useAppStore.getState().setVoiceState("idle");
        return;
      }

      if (e.key.toLowerCase() === "k" && !kHeldRef.current) {
        kHeldRef.current = true;
        // Wait 200ms before declaring it a "hold" so a quick K press is ignored
        holdTimerRef.current = setTimeout(() => {
          setVoiceState("listening-modal");
        }, HOLD_THRESHOLD_MS);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k") {
        kHeldRef.current = false;
        if (holdTimerRef.current !== null) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        // Sticky modal: releasing K leaves the modal open so the user has
        // time to read the transcript and explicitly stop. Escape, the
        // backdrop click, or the in-modal Stop & send button all close it.
      }
    };

    // Lose focus → cancel any pending hold so we don't pop the modal later
    const onBlur = () => {
      kHeldRef.current = false;
      if (holdTimerRef.current !== null) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
    };
  }, [setVoiceState]);

  return null;
}
