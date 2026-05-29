"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, FileText, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { useCallback } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { db, type KnowledgeFileRecord } from "@/lib/db";
import { formatBytes, relativeTime, type FileKind } from "@/lib/format";
import {
  addKnowledgeFile,
  addRejectedFile,
  ingestKnowledgeFile,
  removeKnowledgeFile,
} from "@/lib/knowledge-files";
import { loadAllKeys } from "@/lib/keys";
import { Section } from "./section";

/** Public Qdrant URL is OK to ship to the client — it's not a secret. */
const QDRANT_URL_FROM_ENV = process.env.NEXT_PUBLIC_QDRANT_URL;

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB safety cap

const ACCEPTED: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md", ".mdx"],
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic"],
};

export function KnowledgeBase() {
  // Reactive read from IndexedDB. `useLiveQuery` automatically re-renders the
  // UI when records change — drops, status updates, removals, all flow back
  // through Dexie. Survives hard refreshes and tab restarts.
  const files = useLiveQuery(
    () => db().files.orderBy("addedAt").reverse().toArray(),
    [],
    [] as KnowledgeFileRecord[],
  );

  const onDrop = useCallback(async (accepted: File[], rejected: FileRejection[]) => {
    // Persist all dropped + rejected files first so the UI shows them
    // immediately (queued / failed states render before the ingest finishes).
    const stagedRecords = await Promise.all(accepted.map((f) => addKnowledgeFile(f)));
    await Promise.all(
      rejected.map((r) =>
        addRejectedFile(r.file, r.errors[0]?.message ?? "rejected"),
      ),
    );

    // Pull the user's BYOK credentials from the encrypted IndexedDB envelope
    // so they ride along on the `/api/ingest` request as `x-*` headers. The
    // server route falls back to `.env.local` for any header the user hasn't
    // saved yet — handy in dev, and the only path that works for the Qdrant
    // URL today (we don't expose a settings field for it).
    const saved = await loadAllKeys();
    const keys = {
      openrouterKey: saved.openrouter,
      qdrantKey: saved.qdrant,
      qdrantUrl: QDRANT_URL_FROM_ENV,
    };

    // Kick off ingest for each accepted file in parallel. Each call updates
    // the file's status in IndexedDB → useLiveQuery re-renders the UI.
    await Promise.all(stagedRecords.map((r) => ingestKnowledgeFile(r, keys)));
  }, []);

  const removeFile = (id: string) => {
    void removeKnowledgeFile(id);
  };

  const indexedDocs = files.filter((f) => f.status === "indexed");
  const totalVectors = indexedDocs.reduce((sum, f) => sum + (f.vectorCount ?? 0), 0);
  const queuedCount = files.filter((f) => f.status === "queued" || f.status === "processing")
    .length;

  return (
    <Section
      eyebrow="Knowledge Base"
      title={
        <>
          Add documents.{" "}
          <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
            I&apos;ll learn from them.
          </em>
        </>
      }
      right={
        <div
          className="flex items-center gap-6 text-[13px] max-[700px]:gap-3"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <div>
            <strong style={{ color: "var(--color-forest)" }}>{indexedDocs.length}</strong>{" "}
            documents
          </div>
          <div className="h-4 w-px max-[700px]:hidden" style={{ background: "var(--color-rule)" }} />
          <div>
            <strong style={{ color: "var(--color-forest)" }}>{totalVectors}</strong> vectors
          </div>
          <div className="h-4 w-px max-[700px]:hidden" style={{ background: "var(--color-rule)" }} />
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background:
                queuedCount > 0
                  ? "rgba(196, 130, 90, 0.18)"
                  : "rgba(196, 221, 88, 0.18)",
              color: queuedCount > 0 ? "var(--color-terracotta-deep)" : "var(--color-sage)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  queuedCount > 0
                    ? "var(--color-terracotta)"
                    : "var(--color-lime-deep)",
                animation: queuedCount > 0 ? "pulse-tiny 1.4s ease-in-out infinite" : undefined,
              }}
            />
            {queuedCount > 0
              ? `Ingesting ${queuedCount}…`
              : "Synced · Qdrant Cloud"}
          </span>
        </div>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <DropZone onDrop={onDrop} />
        <FilesList files={files} onRemove={removeFile} />
      </div>
    </Section>
  );
}

/* ─── Dropzone ─── */

function DropZone({
  onDrop,
}: {
  onDrop: (accepted: File[], rejected: FileRejection[]) => void;
}) {
  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } =
    useDropzone({
      accept: ACCEPTED,
      onDrop,
      multiple: true,
      maxSize: MAX_FILE_BYTES,
    });

  // Visual state hierarchy: reject > accept > active > idle
  const visual = isDragReject
    ? "reject"
    : isDragAccept
      ? "accept"
      : isDragActive
        ? "active"
        : "idle";

  const borderColor =
    visual === "reject"
      ? "var(--color-terracotta-deep)"
      : visual === "accept"
        ? "var(--color-sage)"
        : visual === "active"
          ? "var(--color-sage)"
          : "#b8c5a3";

  const bg =
    visual === "reject"
      ? "rgba(196, 130, 90, 0.06)"
      : visual === "accept"
        ? "rgba(196, 221, 88, 0.10)"
        : "linear-gradient(180deg, var(--color-paper-cream), #fcfaf5)";

  return (
    <div
      {...getRootProps()}
      className="relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed px-8 py-14 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--color-lime)] focus-visible:ring-offset-2 max-[700px]:px-5 max-[700px]:py-10"
      style={{
        borderColor,
        background: bg,
        transform: visual === "accept" || visual === "active" ? "scale(1.005)" : undefined,
      }}
    >
      <input {...getInputProps()} />

      {/* Subtle leaf pattern (idle only) */}
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

      <div
        className="relative z-10 mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-3xl transition-transform"
        style={{
          background:
            visual === "reject"
              ? "linear-gradient(135deg, var(--color-terracotta-soft), var(--color-terracotta-deep))"
              : "linear-gradient(135deg, var(--color-lime), var(--color-lime-deep))",
          boxShadow:
            visual === "reject"
              ? "0 12px 28px rgba(196, 130, 90, 0.35)"
              : "0 12px 28px rgba(143, 179, 64, 0.35)",
          transform:
            visual === "active" || visual === "accept"
              ? "rotate(0deg) scale(1.08)"
              : "rotate(-6deg)",
        }}
      >
        {visual === "reject" ? (
          <AlertCircle size={32} color="#fff" strokeWidth={2.5} />
        ) : (
          <Upload size={32} color="var(--color-forest)" strokeWidth={2.5} />
        )}
      </div>

      <div
        className="font-tight relative z-10 mb-2 text-2xl font-bold max-[700px]:text-xl"
        style={{ color: "var(--color-forest)", letterSpacing: "-0.025em" }}
      >
        {visual === "reject" && "That file type isn't supported."}
        {visual === "accept" && (
          <>
            Release to{" "}
            <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
              add it.
            </em>
          </>
        )}
        {visual === "active" && (
          <>
            Drop your{" "}
            <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
              files.
            </em>
          </>
        )}
        {visual === "idle" && (
          <>
            Drop your guides{" "}
            <em className="font-serif-italic" style={{ color: "var(--color-sage)" }}>
              here.
            </em>
          </>
        )}
      </div>

      <div
        className="relative z-10 mx-auto mb-6 max-w-[360px] text-sm leading-[1.5]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        {visual === "reject"
          ? "Accepted: PDF, TXT, MD, and image files (PNG, JPG, WEBP, HEIC). Up to 50 MB each."
          : "eBooks, PDFs, text, markdown, and images. Chunked, embedded via OpenRouter, upserted to your Qdrant Cloud collection in seconds."}
      </div>

      <span
        className="relative z-10 inline-block rounded-full px-6 py-3 text-[13px] font-semibold"
        style={{
          background: "var(--color-forest)",
          color: "#fff",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        Choose files
      </span>
    </div>
  );
}

/* ─── Files list ─── */

function FilesList({
  files,
  onRemove,
}: {
  files: KnowledgeFileRecord[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) {
    return (
      <div
        className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 text-center"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, var(--color-paper-warm), var(--color-paper))",
            color: "var(--color-sage)",
          }}
        >
          <FileText size={22} strokeWidth={2} />
        </div>
        <div
          className="font-tight text-sm font-semibold"
          style={{ color: "var(--color-forest)" }}
        >
          No documents yet
        </div>
        <p
          className="max-w-[260px] text-xs leading-[1.5]"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Drop a gardening eBook on the left and I&apos;ll embed it into your
          Qdrant collection — every plan task will cite the page it came from.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-ink-muted)" }}
      >
        <span>Knowledge base</span>
        <span style={{ color: "var(--color-ink-faded)" }}>{files.length} files</span>
      </div>
      <AnimatePresence initial={false}>
        {files.map((f) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
          >
            <FileCard file={f} onRemove={() => onRemove(f.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function FileCard({
  file,
  onRemove,
}: {
  file: KnowledgeFileRecord;
  onRemove: () => void;
}) {
  const isProcessing = file.status === "processing";
  const showProgressBar = isProcessing || (file.status === "indexed" && file.qdrantStatus);

  return (
    <div
      className="rounded-2xl border p-4 transition-all hover:bg-[var(--color-paper-warm)]"
      style={{
        background: "var(--color-paper)",
        borderColor: file.status === "failed" ? "rgba(196, 130, 90, 0.4)" : "transparent",
      }}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3.5">
        <FileThumb kind={file.type} processing={isProcessing} />
        <div className="min-w-0">
          <div
            className="truncate text-sm font-semibold"
            style={{ color: "var(--color-forest)" }}
            title={file.filename}
          >
            {file.filename}
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            {formatBytes(file.bytes)}
            {file.pages ? ` · ${file.pages} pages` : ""} · {relativeTime(file.addedAt)}
          </div>
          {file.status === "failed" && file.error && (
            <div className="mt-1 text-[11px]" style={{ color: "var(--color-terracotta-deep)" }}>
              {file.error}
            </div>
          )}
        </div>
        <StatusChip file={file} onRemove={onRemove} />
      </div>

      {showProgressBar && (
        <IngestProgressBar
          progress={file.progress ?? (file.status === "indexed" ? 1 : 0)}
          stage={
            file.stage ??
            (file.status === "indexed"
              ? `Saved to Qdrant · ${file.vectorCount ?? 0} vectors searchable`
              : "")
          }
          done={file.status === "indexed"}
        />
      )}
    </div>
  );
}

function IngestProgressBar({
  progress,
  stage,
  done,
}: {
  progress: number;
  stage: string;
  done: boolean;
}) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div className="mt-3">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(45, 61, 42, 0.08)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: done
              ? "var(--color-lime)"
              : "linear-gradient(90deg, var(--color-lime), var(--color-sage))",
            transition: "width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
            boxShadow: done ? "0 0 8px rgba(196, 221, 88, 0.5)" : undefined,
          }}
        />
      </div>
      {stage && (
        <div
          className="mt-1.5 flex items-center justify-between text-[10px]"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <span className="font-mono uppercase tracking-[0.12em]">{stage}</span>
          <span className="font-mono">{Math.round(pct)}%</span>
        </div>
      )}
    </div>
  );
}

function FileThumb({ kind, processing }: { kind: FileKind; processing?: boolean }) {
  // Subtle shimmer ring over the thumb while ingest is in flight — reinforces
  // the live progress bar below without crowding the file row with a second
  // spinner.
  const shimmerOverlay = processing && (
    <span
      aria-hidden
      className="shimmer-dark pointer-events-none absolute inset-0 rounded-[10px]"
      style={{ opacity: 0.65 }}
    />
  );
  if (kind === "IMG") {
    return (
      <div
        className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px]"
        style={{
          background: "linear-gradient(135deg, var(--color-water-blue), #4a8fa8)",
          color: "#fff",
        }}
      >
        <ImageIcon size={18} strokeWidth={2.5} />
        {shimmerOverlay}
      </div>
    );
  }
  return (
    <div
      className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] text-[9px] font-bold tracking-wider"
      style={{
        background: "var(--color-forest)",
        color: "var(--color-lime)",
      }}
    >
      {kind}
      {shimmerOverlay}
    </div>
  );
}

function StatusChip({
  file,
  onRemove,
}: {
  file: KnowledgeFileRecord;
  onRemove: () => void;
}) {
  if (file.status === "indexed") {
    const count = file.vectorCount ?? 0;
    return (
      <div
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={{
          background: "var(--color-lime)",
          color: "var(--color-forest)",
        }}
        title={`${count} vectors live in your Qdrant ${file.qdrantStatus ? `(${file.qdrantStatus})` : "cluster"}`}
      >
        <Check size={11} strokeWidth={3} />
        <span>Vectorized</span>
        <span className="font-mono opacity-70">· {count}v</span>
      </div>
    );
  }
  if (file.status === "queued" || file.status === "processing") {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={{
          background: "rgba(196, 130, 90, 0.15)",
          color: "var(--color-terracotta-deep)",
        }}
      >
        <Loader2 size={12} className="animate-spin" />
        {file.status === "queued" ? "Queued" : "Saving to Qdrant"}
      </div>
    );
  }
  // failed
  return (
    <button
      type="button"
      onClick={onRemove}
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:opacity-80"
      style={{
        background: "rgba(196, 130, 90, 0.15)",
        color: "var(--color-terracotta-deep)",
      }}
    >
      Remove
    </button>
  );
}
