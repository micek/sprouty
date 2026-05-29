"use client";

import { create } from "zustand";

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
