"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { db } from "@/lib/db";
import { toast } from "@/lib/toast";
import { generateVision, loadLatestVision, type VisionEngine } from "@/lib/vision";
import { Section } from "./section";

const ACCEPTED_IMAGES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
};
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

interface BeforeState {
  file: File;
  previewUrl: string;
}

interface AfterState {
  /** Dexie record id — used to build the download filename. */
  recordId: string;
  objectUrl: string;
  engine: VisionEngine;
}

/**
 * Garden vision board — the "before → after" image generator. The user drops a
 * photo of their current space (or skips straight to generation), picks an
 * engine (Gemini Nano Banana 2 by default, GPT-Image as the alt), and Sprouty
 * renders an AI vision of the finished garden via `generateVision()`. Results
 * persist to IndexedDB (`db().visions`) and the latest is reloaded on mount so
 * the board survives refreshes. Image gen routes through OpenRouter per the
 * BYOK rule — the key never leaves the browser.
 */
export function PhotoVision() {
  const [engine, setEngine] = useState<VisionEngine>("gemini");
  const [before, setBefore] = useState<BeforeState | null>(null);
  const [after, setAfter] = useState<AfterState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Tracks how long the current generation has been running so the After tile
  // can swap its caption from "Envisioning your garden…" to "Still working,
  // GPT-Image takes a couple minutes" once the wait passes ~30s. Resets to 0
  // each time `busy` flips on.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setElapsedSeconds(0);
    const start = Date.now();
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Restore the most recent generation for the active engine on mount, so a
  // page refresh doesn't wipe a vision the user may want to re-share.
  useEffect(() => {
    let cancelled = false;
    let urlToRevoke: string | null = null;
    (async () => {
      const record = await loadLatestVision(engine);
      if (cancelled || !record) return;
      const url = URL.createObjectURL(record.blob);
      urlToRevoke = url;
      setAfter({ recordId: record.id, objectUrl: url, engine: record.engine });
    })();
    return () => {
      cancelled = true;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [engine]);

  // Always free the before-photo blob URL when state changes so we don't leak.
  useEffect(() => {
    return () => {
      if (before) URL.revokeObjectURL(before.previewUrl);
    };
  }, [before]);

  const onGenerate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateVision({
        beforeBlob: before?.file,
        engine,
      });
      if (!result.ok) {
        setError(result.error);
        toast.fail("Garden vision failed", result.error);
        return;
      }
      // Free the previous After URL before swapping in the new one.
      if (after) URL.revokeObjectURL(after.objectUrl);
      setAfter({
        recordId: result.record.id,
        objectUrl: result.objectUrl,
        engine,
      });
      toast.ok(
        "Garden vision ready",
        `Used ${result.cropsUsed.crops.length} crop${result.cropsUsed.crops.length === 1 ? "" : "s"} from your ${cropSourceLabel(result.cropsUsed.source)}.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
      toast.fail("Garden vision failed", message);
    } finally {
      setBusy(false);
    }
  };

  const clearBefore = () => {
    if (before) URL.revokeObjectURL(before.previewUrl);
    setBefore(null);
  };

  /**
   * Confirmed clear of the generated "after" image. Wipes the Dexie record
   * so the next mount doesn't restore it via `loadLatestVision`, frees the
   * blob URL, and resets local state — the After tile snaps back to its
   * empty placeholder.
   */
  const clearAfterConfirmed = async () => {
    if (!after) {
      setConfirmingClear(false);
      return;
    }
    try {
      await db().visions.delete(after.recordId);
    } catch (err) {
      toast.fail(
        "Couldn't remove from local storage",
        err instanceof Error ? err.message : String(err),
      );
      // Still tear down the on-screen image so the user isn't stuck staring
      // at it; the Dexie record will reappear on next mount but they can
      // try again.
    }
    URL.revokeObjectURL(after.objectUrl);
    setAfter(null);
    setLightboxOpen(false);
    setConfirmingClear(false);
    toast.ok("Vision cleared", "The After tile is back to empty.");
  };

  return (
    <Section
      eyebrow="Garden Vision"
      title={
        <>
          See your{" "}
          <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
            future garden.
          </em>
        </>
      }
    >
      <p
        className="mb-6 max-w-[540px] text-sm"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Upload a photo of your space. AI generates what it could look like with your plan
        implemented in week 12.
      </p>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <BeforeFrame state={before} onAccept={setBefore} onClear={clearBefore} />
        <AfterFrame
          state={after}
          busy={busy}
          busyCaption={busyCaptionFor(engine, elapsedSeconds)}
          onPreview={() => setLightboxOpen(true)}
          onRequestClear={() => setConfirmingClear(true)}
          confirmingClear={confirmingClear}
          onCancelClear={() => setConfirmingClear(false)}
          onConfirmClear={() => void clearAfterConfirmed()}
        />
      </div>

      {error && (
        <div
          className="mb-4 rounded-2xl border px-4 py-3 text-sm"
          style={{
            background: "rgba(196, 130, 90, 0.08)",
            borderColor: "var(--color-terracotta-soft)",
            color: "var(--color-terracotta-deep)",
          }}
        >
          {error}
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-3 border-t pt-5"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <div
          className="flex min-w-[280px] flex-1 rounded-full p-1"
          style={{ background: "var(--color-paper)" }}
        >
          <EngineTab
            label="Gemini Nano Banana 2"
            active={engine === "gemini"}
            mark="gemini"
            onClick={() => setEngine("gemini")}
          />
          <EngineTab
            label="GPT-Image (5.4)"
            active={engine === "openai"}
            mark="openai"
            onClick={() => setEngine("openai")}
          />
        </div>
        <button
          onClick={() => void onGenerate()}
          disabled={busy}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-semibold text-white transition-all hover:-translate-y-px"
          style={{
            background: "var(--color-forest)",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating
            </>
          ) : after ? (
            <>
              <RefreshCw size={14} strokeWidth={2.5} />
              Regenerate
            </>
          ) : (
            <>
              Generate vision
              <ArrowRight size={14} strokeWidth={2.5} />
            </>
          )}
        </button>
      </div>

      <BeforeAfterLightbox
        open={lightboxOpen && after !== null}
        beforeUrl={before?.previewUrl ?? null}
        afterUrl={after?.objectUrl ?? null}
        onClose={() => setLightboxOpen(false)}
      />
    </Section>
  );
}

/* ─── Before ─── */

function BeforeFrame({
  state,
  onAccept,
  onClear,
}: {
  state: BeforeState | null;
  onAccept: (s: BeforeState) => void;
  onClear: () => void;
}) {
  const [rejection, setRejection] = useState<string | null>(null);

  const onDrop = (accepted: File[], rejected: FileRejection[]) => {
    setRejection(null);
    if (rejected[0]) {
      setRejection(rejected[0].errors[0]?.message ?? "That photo wasn't accepted.");
      return;
    }
    const file = accepted[0];
    if (!file) return;
    onAccept({ file, previewUrl: URL.createObjectURL(file) });
  };

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_IMAGES,
      maxSize: MAX_PHOTO_BYTES,
      multiple: false,
    });

  // Photo loaded — show preview with a Replace button.
  if (state) {
    return (
      <div className="relative aspect-square overflow-hidden rounded-[20px]">
        {/* Use a plain <img> so we don't have to round-trip a Blob through Next/Image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.previewUrl}
          alt="Your space (before)"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span
          className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide"
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            color: "var(--color-forest)",
          }}
        >
          Before
        </span>
        <button
          onClick={onClear}
          aria-label="Remove photo"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-105"
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            color: "var(--color-forest)",
          }}
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  // Empty / dragging — render the dropzone using the same visual language
  // as the knowledge-base panel so the affordance reads identically.
  const visual: "idle" | "active" | "accept" | "reject" = isDragReject
    ? "reject"
    : isDragAccept
      ? "accept"
      : isDragActive
        ? "active"
        : "idle";

  const borderColor =
    visual === "reject"
      ? "var(--color-terracotta-deep)"
      : visual === "accept" || visual === "active"
        ? "var(--color-sage)"
        : "#b8c5a3";

  return (
    <div
      {...getRootProps()}
      className="relative aspect-square cursor-pointer overflow-hidden rounded-[20px] border-2 border-dashed px-6 py-8 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--color-lime)] focus-visible:ring-offset-2"
      style={{
        borderColor,
        background:
          visual === "reject"
            ? "rgba(196, 130, 90, 0.06)"
            : visual === "accept" || visual === "active"
              ? "rgba(196, 221, 88, 0.10)"
              : "linear-gradient(180deg, var(--color-paper-cream), #fcfaf5)",
      }}
    >
      {/* `capture="environment"` hints to mobile browsers to launch the rear
          camera straight from the file picker — desktops ignore the attribute
          entirely. Spreading it through getInputProps() keeps react-dropzone's
          internal handlers intact. */}
      <input {...getInputProps({ capture: "environment" })} />

      {visual === "idle" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><g fill='none' stroke='%235a8a3a' stroke-width='0.5' opacity='0.06'><path d='M0 60 Q 50 30, 100 60 T 200 60'/><path d='M0 140 Q 50 110, 100 140 T 200 140'/></g></svg>\")",
          }}
        />
      )}

      <span
        className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide"
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          color: "var(--color-forest)",
        }}
      >
        Before
      </span>

      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        <div
          className="mb-5 flex h-[64px] w-[64px] items-center justify-center rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, var(--color-lime), var(--color-lime-deep))",
            boxShadow: "0 12px 28px rgba(143, 179, 64, 0.35)",
            transform:
              visual === "active" || visual === "accept"
                ? "rotate(0deg) scale(1.08)"
                : "rotate(-6deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <Camera size={28} color="var(--color-forest)" strokeWidth={2.5} />
        </div>
        <div
          className="font-tight mb-2 text-2xl font-bold leading-tight max-[700px]:text-xl"
          style={{ color: "var(--color-forest)", letterSpacing: "-0.025em" }}
        >
          {visual === "reject" ? (
            "That file isn't a photo."
          ) : (
            <>
              Drop your space{" "}
              <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
                here.
              </em>
            </>
          )}
        </div>
        <p
          className="mx-auto max-w-[360px] text-sm leading-[1.5]"
          style={{ color: "var(--color-ink-muted)" }}
        >
          {rejection ??
            "A photo of where your raised beds will go — patio, balcony, side yard, anywhere. We'll show you what it could look like."}
        </p>
      </div>
    </div>
  );
}

/* ─── After ─── */

function AfterFrame({
  state,
  busy,
  busyCaption,
  onPreview,
  onRequestClear,
  confirmingClear,
  onCancelClear,
  onConfirmClear,
}: {
  state: AfterState | null;
  busy: boolean;
  busyCaption: string;
  onPreview: () => void;
  onRequestClear: () => void;
  confirmingClear: boolean;
  onCancelClear: () => void;
  onConfirmClear: () => void;
}) {
  // Generated image present — clicking the image OR the eye icon opens the
  // BeforeAfterLightbox modal (rendered at the parent level so it can
  // compose both the user's "before" photo and the generated "after"
  // together with their labels). The download icon writes the in-memory
  // blob URL to disk via a vanilla <a download> click.
  if (state) {
    const filename = makeVisionFilename(state.engine, state.recordId);
    return (
      <div className="group relative aspect-square overflow-hidden rounded-[20px]">
        <button
          type="button"
          aria-label="Preview before and after"
          onClick={onPreview}
          className="absolute inset-0 cursor-zoom-in p-0"
          style={{ background: "transparent" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.objectUrl}
            alt="Your future garden (week 12)"
            className="h-full w-full object-cover"
          />
        </button>

        <span
          className="pointer-events-none absolute left-4 top-4 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide"
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            color: "var(--color-forest)",
          }}
        >
          Week 12 · Vision
        </span>

        {/* Hover overlay — fades in on desktop hover, always visible on touch.
            36px tap targets meet WCAG minimums. */}
        <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            type="button"
            aria-label="Preview before and after"
            onClick={onPreview}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              color: "var(--color-forest)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            }}
          >
            <Eye size={16} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Download image"
            onClick={() => downloadObjectUrl(state.objectUrl, filename)}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              color: "var(--color-forest)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            }}
          >
            <Download size={16} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Clear generated vision"
            onClick={onRequestClear}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              color: "var(--color-forest)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            }}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {busy && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(45, 61, 42, 0.4)" }}
          >
            <Loader2 size={32} className="animate-spin" color="#fff" />
          </div>
        )}

        {/* In-container clear confirmation. Lives inside the After tile so the
            user's eye doesn't have to leave the photo they're about to
            discard. Backdrop click is a no-op (only Cancel + Yes dismiss) so
            an accidental tap doesn't lose work. */}
        <AnimatePresence>
          {confirmingClear && (
            <motion.div
              key="clear-confirm"
              className="absolute inset-0 flex items-center justify-center p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                background: "rgba(15, 22, 13, 0.62)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            >
              <motion.div
                className="w-full max-w-[320px] rounded-2xl px-5 py-5 text-center"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                style={{
                  background: "rgba(255, 255, 255, 0.97)",
                  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.35)",
                }}
              >
                <div
                  className="font-tight mb-1.5 text-[16px] font-bold leading-snug"
                  style={{ color: "var(--color-forest)" }}
                >
                  Clear this vision?
                </div>
                <p
                  className="mb-4 text-[12px] leading-[1.5]"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  The generated image will be removed from this device. You
                  can always generate a new one.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={onCancelClear}
                    className="inline-flex h-10 items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors hover:bg-[var(--color-paper-warm)]"
                    style={{
                      borderColor: "var(--color-rule)",
                      color: "var(--color-ink-soft)",
                      background: "var(--color-paper)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmClear}
                    className="inline-flex h-10 items-center justify-center rounded-full px-4 text-[13px] font-semibold transition-all hover:-translate-y-px"
                    style={{
                      background: "var(--color-terracotta-deep)",
                      color: "#fff",
                      boxShadow: "0 6px 16px rgba(165, 90, 64, 0.3)",
                    }}
                  >
                    Yes, clear
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Empty — painted vegetable-pattern placeholder by default; while a
  // first-time generation is in flight we swap to a shimmery dark canvas
  // so the wait reads as "the image is materializing" rather than "the
  // green tile is broken".
  if (busy) {
    return (
      <div className="shimmer-dark relative aspect-square overflow-hidden rounded-[20px]">
        <span
          className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide"
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            color: "var(--color-forest)",
          }}
        >
          Week 12 · Vision
        </span>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <Loader2 size={32} className="animate-spin" color="#fff" />
          <p
            className="max-w-[280px] text-sm font-medium leading-[1.4]"
            style={{ color: "rgba(255, 255, 255, 0.92)" }}
          >
            {busyCaption}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative aspect-square overflow-hidden rounded-[20px]"
      style={{ background: "linear-gradient(135deg, #2c5e3f, #5a8a3a)" }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><g><circle cx='40' cy='80' r='15' fill='%23c4dd58' opacity='0.7'/><circle cx='80' cy='60' r='20' fill='%23a8c248' opacity='0.6'/><circle cx='130' cy='90' r='18' fill='%23c4dd58' opacity='0.5'/><circle cx='160' cy='70' r='12' fill='%23d4eb6a' opacity='0.7'/><rect x='60' y='130' width='80' height='30' rx='4' fill='%23a8c248' opacity='0.4'/></g></svg>\")",
          backgroundSize: "cover",
        }}
      />
      <span
        className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide"
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          color: "var(--color-forest)",
        }}
      >
        Week 12 · Vision
      </span>
      <div className="absolute inset-0 flex items-end justify-center p-6 text-center">
        <p
          className="max-w-[320px] text-sm font-medium leading-[1.5]"
          style={{
            color: "rgba(255, 255, 255, 0.92)",
            textShadow: "0 1px 2px rgba(0,0,0,0.25)",
          }}
        >
          Nano Banana or GPT-Image will generate a render of your future garden here.
        </p>
      </div>
    </div>
  );
}

/**
 * Spinner caption that gets gentler over time — most users don't mind a 30s
 * wait but a silent 3-minute spinner reads as broken. We bias the early
 * caption toward Gemini's expected ~6s window and progressively reassure
 * once we cross GPT-Image territory.
 */
function busyCaptionFor(engine: VisionEngine, elapsedSeconds: number): string {
  if (elapsedSeconds < 30) return "Envisioning your garden…";
  if (engine === "openai") {
    if (elapsedSeconds < 90) return "Still working — GPT-Image is slow but worth it (30-90s).";
    if (elapsedSeconds < 180) return `Still rendering · ${elapsedSeconds}s elapsed. GPT-Image runs can hit 3 minutes for high-detail scenes.`;
    return `Almost there · ${elapsedSeconds}s elapsed. We hold the connection open up to 5 minutes.`;
  }
  // Gemini Nano Banana 2 should land inside ~10s; if we're past 30s the
  // upstream is being unusually slow.
  return `Still working · ${elapsedSeconds}s elapsed. The model usually returns in under 10 seconds — yours is taking longer.`;
}

/**
 * Trigger a browser download for an object URL. Uses an in-memory <a download>
 * because that's the only widely-supported way to suggest a filename without
 * a server round-trip.
 */
function downloadObjectUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Filename pattern: `sprouty-vision-<engine>-<shortId>.png`. The short id is
 * the last 6 chars of the Dexie record id (which already encodes a timestamp
 * + UUID), giving us a stable, unique-enough handle without exposing the
 * full id in case the user shares the file.
 */
function cropSourceLabel(source: "context" | "plan" | "default"): string {
  if (source === "context") return "garden context";
  if (source === "plan") return "active plan";
  return "default crop list";
}

function makeVisionFilename(engine: VisionEngine, recordId: string): string {
  const shortId = recordId.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "vision";
  return `sprouty-vision-${engine}-${shortId}.png`;
}

function EngineTab({
  label,
  active,
  mark,
  onClick,
}: {
  label: string;
  active: boolean;
  mark: "gemini" | "openai";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all"
      style={{
        background: active ? "var(--color-card)" : "transparent",
        color: active ? "var(--color-forest)" : "var(--color-ink-muted)",
        boxShadow: active ? "var(--shadow-sm)" : "none",
      }}
    >
      <span
        className="h-3.5 w-3.5 flex-shrink-0 rounded"
        style={{
          background:
            mark === "gemini"
              ? "linear-gradient(135deg, #4285f4, #ea4335)"
              : "#10a37f",
        }}
      />
      {label}
    </button>
  );
}

/* ─── Before/After lightbox ─── */

interface Slide {
  label: "Before" | "After";
  url: string;
  alt: string;
}

/**
 * Single-image carousel preview. Defaults to the After slide (since the
 * user clicks the After tile to open it) and lets them flip back to the
 * Before with arrow keys or the on-screen chevrons. Modal capped at 80vw /
 * 80vh so the surrounding page stays visible at the edges.
 */
function BeforeAfterLightbox({
  open,
  beforeUrl,
  afterUrl,
  onClose,
}: {
  open: boolean;
  beforeUrl: string | null;
  afterUrl: string | null;
  onClose: () => void;
}) {
  const slides = useMemo<Slide[]>(() => {
    const items: Slide[] = [];
    if (beforeUrl) items.push({ label: "Before", url: beforeUrl, alt: "Your space (before)" });
    if (afterUrl) items.push({ label: "After", url: afterUrl, alt: "Your future garden (week 12)" });
    return items;
  }, [beforeUrl, afterUrl]);

  const total = slides.length;
  const [index, setIndex] = useState(0);

  // When the modal opens, jump to the After slide — that's what the user
  // clicked to trigger the modal in the first place.
  useEffect(() => {
    if (!open || total === 0) return;
    const afterIdx = slides.findIndex((s) => s.label === "After");
    setIndex(afterIdx >= 0 ? afterIdx : 0);
  }, [open, slides, total]);

  const goPrev = useCallback(() => {
    if (total < 2) return;
    setIndex((i) => (i - 1 + total) % total);
  }, [total]);
  const goNext = useCallback(() => {
    if (total < 2) return;
    setIndex((i) => (i + 1) % total);
  }, [total]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goPrev, goNext]);

  const current = slides[index];

  return (
    <AnimatePresence>
      {open && current && (
        <motion.div
          key="before-after-lightbox"
          className="fixed inset-0 z-[110] flex items-center justify-center p-8 max-[700px]:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="absolute inset-0 cursor-default"
            style={{ background: "rgba(15, 22, 13, 0.78)" }}
          />

          <motion.div
            className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-3"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="absolute -right-2 -top-12 z-10 flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105 max-[700px]:-top-10"
              style={{
                background: "rgba(255, 255, 255, 0.95)",
                color: "var(--color-forest)",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              }}
            >
              <X size={18} strokeWidth={2.5} />
            </button>

            <div className="relative flex items-center justify-center gap-3 sm:gap-[30px]">
              {total > 1 && (
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={goPrev}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
                  style={{
                    background: "rgba(255, 255, 255, 0.95)",
                    color: "var(--color-forest)",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  <ChevronLeft size={20} strokeWidth={2.5} />
                </button>
              )}

              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={current.url}
                  src={current.url}
                  alt={current.alt}
                  className="block max-h-[calc(90vh-3rem)] max-w-[calc(90vw-160px)] min-w-0 rounded-[20px] object-contain"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                />
              </AnimatePresence>

              {total > 1 && (
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={goNext}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
                  style={{
                    background: "rgba(255, 255, 255, 0.95)",
                    color: "var(--color-forest)",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  <ChevronRight size={20} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <span
              className="font-tight text-[13px] font-bold uppercase tracking-[0.16em]"
              style={{ color: "rgba(255, 255, 255, 0.92)" }}
            >
              {current.label}
              {total > 1 && (
                <span className="ml-2 opacity-60">
                  {index + 1} / {total}
                </span>
              )}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
