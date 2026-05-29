"use client";

import { create } from "zustand";

/**
 * Lightweight toast queue. Anyone in the app can call
 * `toast.ok("Saved")` / `toast.fail(...)` / `toast.info(...)` and a single
 * <ToastHost /> mounted at the page root renders the live list.
 *
 * Why our own instead of pulling in a library: the design system is opinionated
 * (lime accents, Fraunces emphasis, the same shadow/blur language used for
 * cards), and shipping a 4kB file beats the bundle hit + theme override work.
 */

export type ToastKind = "ok" | "fail" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  /** Bold first line. Required. */
  title: string;
  /** Secondary description. Optional. */
  body?: string;
  /** ms to live before auto-dismiss. Defaults to 4500 (ok/info) or 7000 (fail). */
  ttl?: number;
  /** Epoch ms when this toast was created — used for animation key stability. */
  createdAt: number;
}

interface ToastStore {
  toasts: ToastItem[];
  push(toast: Omit<ToastItem, "id" | "createdAt">): string;
  dismiss(id: string): void;
  clear(): void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push(input) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: ToastItem = { ...input, id, createdAt: Date.now() };
    set((s) => ({ toasts: [...s.toasts, item] }));
    return id;
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clear() {
    set({ toasts: [] });
  },
}));

export function useToasts(): ToastItem[] {
  return useToastStore((s) => s.toasts);
}

export function dismissToast(id: string): void {
  useToastStore.getState().dismiss(id);
}

/**
 * Imperative facade — the natural call site for non-React code (lib helpers,
 * fetch handlers, etc.). Also fine to use inside components; pull from the
 * store hook only when you need reactive subscription.
 */
export const toast = {
  ok(title: string, body?: string, ttl?: number): string {
    return useToastStore.getState().push({ kind: "ok", title, body, ttl });
  },
  fail(title: string, body?: string, ttl?: number): string {
    return useToastStore.getState().push({ kind: "fail", title, body, ttl });
  },
  info(title: string, body?: string, ttl?: number): string {
    return useToastStore.getState().push({ kind: "info", title, body, ttl });
  },
};
