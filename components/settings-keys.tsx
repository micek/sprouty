"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, Download, Eye, EyeOff, Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { db, type KeyRecord } from "@/lib/db";
import {
  isTestFresh,
  loadKey,
  recordTestResult,
  saveKey,
  type KeyId,
} from "@/lib/keys";
import { downloadExport, importZip } from "@/lib/portable";
import { toast } from "@/lib/toast";
import {
  testGoogleAI,
  testLiveKit,
  testOpenAI,
  testOpenRouter,
  testQdrant,
  testTriggerDev,
  type TestResult,
} from "@/lib/test-keys";

type KeyDef = {
  id: KeyId;
  name: string;
  purpose: string;
  placeholder: string;
  required: boolean;
  source: string;
};

const KEYS: KeyDef[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    purpose: "Powers Mistral voice (STT, LLM, TTS) for the Mistral sponsor bonus",
    placeholder: "sk-or-v1-...",
    required: true,
    source: "openrouter.ai",
  },
  {
    id: "qdrant",
    name: "Qdrant Cloud",
    purpose: "Vector database for your knowledge base — required for retrieval",
    placeholder: "qdrant-...",
    required: true,
    source: "cloud.qdrant.io",
  },
  {
    id: "livekit",
    name: "LiveKit Cloud",
    purpose: "Real-time voice orchestration — agent runtime and turn detection",
    placeholder: "lkapi-...",
    required: true,
    source: "livekit.io",
  },
  {
    id: "gemini",
    name: "Google AI Studio",
    purpose: "Image generation via Gemini Nano Banana 2 for garden visualizations",
    placeholder: "AIza...",
    required: true,
    source: "aistudio.google.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    purpose: "Alternative image generation via GPT-Image (fallback for Nano Banana)",
    placeholder: "sk-proj-...",
    required: false,
    source: "platform.openai.com",
  },
  {
    id: "trigger",
    name: "trigger.dev",
    purpose: "Scheduled weekly check-ins and adaptive replan jobs",
    placeholder: "tr_pat_...",
    required: false,
    source: "trigger.dev",
  },
];

export function SettingsKeys() {
  const required = KEYS.filter((k) => k.required);
  const optional = KEYS.filter((k) => !k.required);

  // Live-query the encrypted records table. We only read metadata here
  // (presence, lastTestedAt, testStatus) — decryption happens inside KeyCard
  // so a single bad ciphertext can't crash the panel.
  const records = useLiveQuery(() => db().keys.toArray(), [], [] as KeyRecord[]);
  const recordById = new Map(records.map((r) => [r.id, r]));
  const totalConnected = KEYS.filter((k) => recordById.has(k.id)).length;

  return (
    <section
      id="settings"
      className="scroll-anchor relative mb-6 overflow-hidden rounded-[32px] p-12 max-[700px]:p-8"
      style={{
        background: "linear-gradient(135deg, var(--color-forest), var(--color-forest-deep))",
        color: "#fff",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800' viewBox='0 0 800 800'><g fill='none' stroke='%23c4dd58' stroke-width='0.4' opacity='0.10' stroke-linecap='round'><path d='M-50 200 Q 200 100, 400 220 T 850 200'/><path d='M-50 400 Q 200 320, 400 440 T 850 420'/><path d='M-50 600 Q 200 520, 400 620 T 850 600'/></g></svg>\")",
          backgroundSize: "800px 800px",
        }}
      />

      {/* Header */}
      <div className="relative z-10 mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div
            className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-lime)" }}
          >
            <span
              className="inline-block"
              style={{ width: 16, height: 1.5, background: "var(--color-lime)" }}
            />
            Connect Your Services
          </div>
          <h2
            className="font-tight mb-2 text-[clamp(28px,3.4vw,38px)] font-bold leading-[1.05]"
            style={{ letterSpacing: "-0.03em" }}
          >
            Bring your{" "}
            <em
              className="font-serif-italic"
              style={{ color: "var(--color-lime-bright)" }}
            >
              own keys.
            </em>
          </h2>
          <p
            className="max-w-[540px] text-[15px] leading-[1.55]"
            style={{ color: "rgba(255, 255, 255, 0.7)" }}
          >
            All keys are encrypted and stored client-side. Sprout never sees your raw
            credentials. Test each one to confirm it&apos;s working before you go live.
          </p>
        </div>
        <div
          className="rounded-2xl border px-5 py-4 text-right"
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            borderColor: "rgba(196, 221, 88, 0.2)",
          }}
        >
          <div
            className="font-tight mb-1 text-[28px] font-bold leading-none"
            style={{ color: "var(--color-lime-bright)" }}
          >
            {totalConnected} / {KEYS.length}
          </div>
          <div className="text-xs" style={{ color: "rgba(196, 221, 88, 0.7)" }}>
            services connected
          </div>
        </div>
      </div>

      {/* Required */}
      <GroupLabel>Required</GroupLabel>
      <div className="relative z-10 mb-7 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {required.map((k) => (
          <KeyCard key={k.id} def={k} record={recordById.get(k.id)} />
        ))}
      </div>

      {/* Optional */}
      <GroupLabel>Optional</GroupLabel>
      <div className="relative z-10 mb-7 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {optional.map((k) => (
          <KeyCard key={k.id} def={k} record={recordById.get(k.id)} />
        ))}
      </div>

      {/* Footer */}
      <PortabilityFooter />
    </section>
  );
}

/**
 * Footer band — privacy copy on the left, Export / Import ZIP buttons on the
 * right. Exports skip the `keys` table by design (re-enter once on the new
 * device); everything else (sessions, plans, files w/ blobs, visions w/ blobs,
 * garden context) round-trips losslessly.
 */
function PortabilityFooter() {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = async () => {
    if (busy) return;
    setBusy("export");
    try {
      const summary = await downloadExport();
      toast.ok(
        "ZIP exported",
        `${formatExportCounts(summary.counts)} (${(summary.bytes / 1024).toFixed(0)} KB).`,
      );
    } catch (err) {
      toast.fail("Export failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  const onImportClick = () => {
    if (busy) return;
    fileRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;

    if (
      !window.confirm(
        "Importing replaces the local sessions, plans, files, visions, and garden context with the contents of this ZIP. API keys are left alone. Continue?",
      )
    ) {
      return;
    }

    setBusy("import");
    try {
      const summary = await importZip(file);
      toast.ok("ZIP imported", `Restored ${formatExportCounts(summary.counts)}.`);
    } catch (err) {
      toast.fail("Import failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-xs"
      style={{
        borderColor: "rgba(196, 221, 88, 0.15)",
        color: "rgba(255, 255, 255, 0.55)",
      }}
    >
      <div className="max-w-[420px]">
        Your data lives only in this browser. Export a ZIP to move it to another
        device — sessions, plans, knowledge files, vision images, and garden
        context all round-trip losslessly.
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          onChange={(e) => {
            void onFileChosen(e);
          }}
          className="hidden"
        />
        <button
          onClick={onImportClick}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[12px] font-semibold transition-colors"
          style={{
            background: "rgba(255,255,255,0.04)",
            borderColor: "rgba(196, 221, 88, 0.25)",
            color: "rgba(255,255,255,0.85)",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy && busy !== "import" ? 0.5 : 1,
          }}
        >
          {busy === "import" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Upload size={12} strokeWidth={2.5} />
          )}
          Import ZIP
        </button>
        <button
          onClick={() => void onExport()}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[12px] font-bold transition-all"
          style={{
            background: "var(--color-lime)",
            color: "var(--color-forest)",
            boxShadow: "0 8px 24px rgba(196, 221, 88, 0.25)",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy && busy !== "export" ? 0.5 : 1,
          }}
        >
          {busy === "export" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Download size={12} strokeWidth={2.5} />
          )}
          Export ZIP
        </button>
      </div>
    </div>
  );
}

function formatExportCounts(counts: {
  sessions: number;
  plans: number;
  files: number;
  visions: number;
  context: number;
}): string {
  const parts: string[] = [];
  if (counts.sessions) parts.push(`${counts.sessions} session${counts.sessions === 1 ? "" : "s"}`);
  if (counts.plans) parts.push(`${counts.plans} plan${counts.plans === 1 ? "" : "s"}`);
  if (counts.files) parts.push(`${counts.files} file${counts.files === 1 ? "" : "s"}`);
  if (counts.visions) parts.push(`${counts.visions} vision${counts.visions === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "an empty archive";
}

function GroupLabel({ children }: { children: string }) {
  return (
    <div
      className="relative z-10 mb-3.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: "rgba(196, 221, 88, 0.6)" }}
    >
      {children}
      <span
        className="ml-2 flex-1"
        style={{ height: 1, background: "rgba(196, 221, 88, 0.15)" }}
      />
    </div>
  );
}

/**
 * Individual key card with explicit Save (FR-ST-07) and eye-icon reveal (FR-ST-08).
 * Persists to IndexedDB via the AES-GCM envelope in `lib/crypto.ts`. The
 * encrypted record is provided by the parent through `useLiveQuery`; we
 * decrypt it once on mount so the input shows masked dots over the real key,
 * and the "reveal" eye icon flips it to plaintext.
 */
function KeyCard({ def, record }: { def: KeyDef; record: KeyRecord | undefined }) {
  const [value, setValue] = useState("");
  const [savedValue, setSavedValue] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Decrypt the stored ciphertext on mount / when the record changes.
  // If decryption fails (master key wiped, etc.) the helper deletes the dead
  // record on its own; we just fall back to an empty input.
  useEffect(() => {
    let cancelled = false;
    if (!record) {
      setValue("");
      setSavedValue("");
      return;
    }
    void loadKey(def.id).then((plaintext) => {
      if (cancelled) return;
      const v = plaintext ?? "";
      setValue(v);
      setSavedValue(v);
    });
    return () => {
      cancelled = true;
    };
  }, [def.id, record]);

  const dirty = value !== savedValue;

  // Status dot. Green dot is reserved for a *fresh* successful test (per
  // CLAUDE.md: green if verified <24h). The just-finished `testResult` wins
  // if present; otherwise we read the persisted metadata from the record.
  const dotState: "ok" | "fail" | "off" = (() => {
    if (testResult) return testResult.ok ? "ok" : "fail";
    if (!record) return "off";
    if (isTestFresh(record.lastTestedAt, record.testStatus)) return "ok";
    if (record.testStatus === "failed") return "fail";
    return "off";
  })();

  const onSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await saveKey(def.id, value);
      setSavedValue(value.trim());
      setValue(value.trim());
      setRevealed(false); // FR-ST-08: revert to hidden after save
      setTestResult(null); // saved key invalidates any previous in-memory test
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
      toast.ok(`${def.name} key saved`, "Encrypted to this browser only.");
    } catch (err) {
      toast.fail(
        `Couldn't save ${def.name} key`,
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      setSaving(false);
    }
  };

  // LiveKit creds are server-side env-only, so the Test button doesn't
  // require the user to type anything into the local field. Every other
  // service still gates on `value` since the BYOK key has to be present.
  const requiresLocalValue = def.id !== "livekit";

  const onTest = async () => {
    if (testing) return;
    if (requiresLocalValue && !value) return;
    setTesting(true);
    setTestResult(null);
    let result: TestResult;
    switch (def.id) {
      case "openrouter":
        result = await testOpenRouter(value);
        break;
      case "qdrant":
        result = await testQdrant(value);
        break;
      case "gemini":
        result = await testGoogleAI(value);
        break;
      case "openai":
        result = await testOpenAI(value);
        break;
      case "trigger":
        result = await testTriggerDev(value);
        break;
      case "livekit":
        // LiveKit creds are server-side env-only, so the local `value` is
        // ignored — the test route reads LIVEKIT_API_KEY / LIVEKIT_API_SECRET
        // from process.env and round-trips RoomService.listRooms().
        result = await testLiveKit();
        break;
      default:
        result = {
          ok: false,
          message: "Test not yet implemented for this service",
        };
    }
    setTestResult(result);
    setTesting(false);
    if (result.ok) {
      toast.ok(`${def.name} reachable`, result.message);
    } else {
      toast.fail(`${def.name} test failed`, result.message);
    }
    // Persist the test outcome alongside the saved key so the green dot
    // survives a reload (and so we know whether the freshness window applies).
    if (record) {
      void recordTestResult(def.id, result.ok);
    }
  };

  return (
    <div
      className="rounded-2xl border p-5 transition-all"
      style={{
        background: "rgba(255, 255, 255, 0.04)",
        borderColor: "rgba(196, 221, 88, 0.12)",
      }}
    >
      <div className="mb-3.5 grid grid-cols-[auto_1fr_auto] items-start gap-3.5">
        <KeyMark id={def.id} />
        <div>
          <div className="font-tight text-[15px] font-bold text-white">{def.name}</div>
          <div className="text-xs leading-snug" style={{ color: "rgba(255,255,255,0.55)" }}>
            {def.purpose}
          </div>
        </div>
        <span
          className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
          style={{
            background:
              dotState === "ok"
                ? "var(--color-lime)"
                : dotState === "fail"
                  ? "var(--color-terracotta-deep)"
                  : "rgba(255,255,255,0.2)",
            boxShadow:
              dotState === "ok"
                ? "0 0 0 3px rgba(196, 221, 88, 0.2)"
                : dotState === "fail"
                  ? "0 0 0 3px rgba(196, 130, 90, 0.2)"
                  : "none",
            transition: "all 0.2s ease",
          }}
        />
      </div>

      {/* Input + reveal + Test + Save — all share h-11 so the row aligns */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={revealed ? "text" : "password"}
            value={value}
            placeholder={def.placeholder}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono h-11 w-full rounded-[10px] border px-3.5 pr-11 text-xs tracking-wider text-white outline-none transition-all focus:border-[var(--color-lime)]"
            style={{
              background: "rgba(0, 0, 0, 0.25)",
              borderColor: "rgba(196, 221, 88, 0.15)",
              letterSpacing: "0.05em",
            }}
          />
          <button
            type="button"
            aria-label={revealed ? `Hide ${def.name} key` : `Show ${def.name} key`}
            onClick={() => setRevealed((v) => !v)}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
            style={{
              color: revealed ? "var(--color-lime)" : "rgba(255,255,255,0.55)",
            }}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          disabled={testing || (requiresLocalValue && !value)}
          onClick={onTest}
          className="inline-flex h-11 items-center gap-1 rounded-[10px] px-4 text-xs font-bold transition-all"
          style={{
            background:
              requiresLocalValue && !value
                ? "rgba(255,255,255,0.1)"
                : "var(--color-lime)",
            color:
              requiresLocalValue && !value
                ? "rgba(255,255,255,0.4)"
                : "var(--color-forest)",
            cursor:
              testing || (requiresLocalValue && !value) ? "not-allowed" : "pointer",
          }}
        >
          {testing ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Testing
            </>
          ) : (
            "Test"
          )}
        </button>
        <button
          disabled={!dirty || saving}
          onClick={() => void onSave()}
          className="inline-flex h-11 min-w-11 items-center gap-1 rounded-[10px] px-4 text-xs font-bold transition-all"
          style={{
            background: dirty ? "var(--color-lime-bright)" : "rgba(255,255,255,0.1)",
            color: dirty ? "var(--color-forest)" : "rgba(255,255,255,0.4)",
            cursor: dirty && !saving ? "pointer" : "not-allowed",
          }}
        >
          {saving ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Saving
            </>
          ) : savedFlash ? (
            <>
              <Check size={14} strokeWidth={3} />
              Saved
            </>
          ) : (
            "Save"
          )}
        </button>
      </div>

      {/* Inline test result message (replaces the link while a result is fresh) */}
      {testResult ? (
        <div
          className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium"
          style={{
            color: testResult.ok
              ? "var(--color-lime)"
              : "var(--color-terracotta-soft)",
          }}
        >
          {testResult.ok ? (
            <Check size={12} strokeWidth={3} />
          ) : (
            <X size={12} strokeWidth={3} />
          )}
          {testResult.message}
        </div>
      ) : (
        <a
          className="mt-2.5 inline-flex items-center gap-1 text-[11px] hover:text-[var(--color-lime-bright)]"
          style={{ color: "rgba(196, 221, 88, 0.7)" }}
        >
          Get key from {def.source} →
        </a>
      )}
    </div>
  );
}

function KeyMark({ id }: { id: KeyId }) {
  const styles: Record<KeyId, { bg: string; label: string }> = {
    openrouter: { bg: "linear-gradient(135deg, #6c47ff, #4527d6)", label: "M" },
    qdrant: { bg: "linear-gradient(135deg, #dc382c, #b02a20)", label: "Q" },
    livekit: { bg: "linear-gradient(135deg, #1f1f1f, #404040)", label: "L" },
    gemini: { bg: "linear-gradient(135deg, #4285f4, #ea4335)", label: "G" },
    openai: { bg: "#10a37f", label: "O" },
    trigger: { bg: "linear-gradient(135deg, #6366f1, #4338ca)", label: "T" },
  };
  const s = styles[id];
  return (
    <div
      className="font-tight flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px] text-base font-bold text-white"
      style={{ background: s.bg }}
    >
      {s.label}
    </div>
  );
}
