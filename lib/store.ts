"use client";

import { create } from "zustand";

/**
 * Global UI state — the small slice of cross-component state that doesn't
 * belong in IndexedDB (that's Dexie's job for persisted user data). This store
 * is ephemeral: it resets on reload and holds only what the voice UI and tab
 * navigation need to coordinate.
 *
 *   voiceState      — drives the Sprout character animation + listening modals;
 *                     the headless <VoiceSessionController /> watches it to join
 *                     and tear down the LiveKit room.
 *   activeTab       — which top-nav section (My Garden / Knowledge / Plan /
 *                     Vision) is showing.
 *   liveTranscript  — accumulates user speech as the agent emits
 *                     `user_transcript` data events, so the card/modal can show
 *                     real words streaming in instead of a placeholder.
 */

export type VoiceState = "idle" | "listening-inline" | "listening-modal" | "thinking" | "speaking";
export type ActiveTab = "My Garden" | "Knowledge" | "Plan" | "Vision";

interface AppStore {
  voiceState: VoiceState;
  setVoiceState: (s: VoiceState) => void;

  activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void;

  liveTranscript: string;
  setLiveTranscript: (t: string) => void;
  appendLiveTranscript: (delta: string) => void;
  clearLiveTranscript: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  voiceState: "idle",
  setVoiceState: (s) => set({ voiceState: s }),

  activeTab: "My Garden",
  setActiveTab: (t) => set({ activeTab: t }),

  liveTranscript: "",
  setLiveTranscript: (t) => set({ liveTranscript: t }),
  appendLiveTranscript: (delta) =>
    set((s) => ({ liveTranscript: s.liveTranscript + delta })),
  clearLiveTranscript: () => set({ liveTranscript: "" }),
}));
