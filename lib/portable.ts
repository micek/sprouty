"use client";

import JSZip from "jszip";
import { db, type GardenContextRecord, type KnowledgeFileRecord, type PlanRecord, type SessionRecord, type VisionImageRecord } from "./db";

/**
 * ZIP export / import — fulfills the privacy commitment that "your data is
 * yours, take it anywhere." Bundles every Dexie table (except `keys` and
 * `master`, see note below) plus binary blobs into a single portable archive.
 *
 *   sprouty-export.zip
 *   ├── manifest.json          {version, exportedAt, schemaVersion, counts}
 *   ├── sessions.json
 *   ├── plans.json
 *   ├── visions.json
 *   ├── context.json
 *   ├── files.json             (file metadata only)
 *   ├── files/<id>.bin         (the original document blobs)
 *   └── visions/<id>.png       (the generated vision images)
 *
 * Key omission rationale: API keys live in `db().keys` wrapped with a
 * non-extractable AES-GCM master key. Exporting them safely would require a
 * user-supplied passphrase + KDF + re-wrap — adds significant UX surface for
 * a one-line copy-paste workflow most users already have via a password
 * manager. So exports skip credentials by design; the user re-enters them
 * once on the destination device. This is the same trade Bitwarden makes
 * with its unencrypted JSON exports.
 */

/** Bumped whenever the export schema shape changes. Imports check this. */
export const PORTABLE_SCHEMA_VERSION = 1;

interface PortableManifest {
  /** App identifier — guards against importing a non-Sprouty zip. */
  app: "sprouty";
  schemaVersion: number;
  exportedAt: number;
  /** UA string at export time — purely informational, not validated on import. */
  userAgent?: string;
  counts: {
    sessions: number;
    plans: number;
    files: number;
    visions: number;
    context: number;
  };
}

export interface ExportSummary {
  filename: string;
  bytes: number;
  blob: Blob;
  counts: PortableManifest["counts"];
}

export interface ImportSummary {
  counts: PortableManifest["counts"];
}

/* ─── export ─── */

export async function exportZip(): Promise<ExportSummary> {
  const [sessions, plans, files, visions, context] = await Promise.all([
    db().sessions.toArray(),
    db().plans.toArray(),
    db().files.toArray(),
    db().visions.toArray(),
    db().context.toArray(),
  ]);

  const zip = new JSZip();

  // Strip blobs from the file metadata array and store them under files/<id>.bin
  // so the JSON stays small and tools that inspect the archive can treat the
  // binary payloads as opaque.
  const fileMeta = files.map((f) => {
    const { blob: _blob, ...rest } = f;
    return rest;
  });
  zip.file("sessions.json", JSON.stringify(sessions, null, 2));
  zip.file("plans.json", JSON.stringify(plans, null, 2));
  zip.file("files.json", JSON.stringify(fileMeta, null, 2));
  zip.file("visions.json", JSON.stringify(stripVisionBlobs(visions), null, 2));
  zip.file("context.json", JSON.stringify(context, null, 2));

  for (const f of files) {
    if (f.blob) zip.file(`files/${f.id}.bin`, f.blob);
  }
  for (const v of visions) {
    if (v.blob) zip.file(`visions/${v.id}.png`, v.blob);
  }

  // Human-readable companion. Sits at the ZIP root so a user double-clicking
  // the archive sees their plans + sessions in plain Markdown without having
  // to parse the JSON files.
  zip.file("README.md", buildMarkdownReport({ sessions, plans, files, visions, context }));

  const manifest: PortableManifest = {
    app: "sprouty",
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    exportedAt: Date.now(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    counts: {
      sessions: sessions.length,
      plans: plans.length,
      files: files.length,
      visions: visions.length,
      context: context.length,
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return {
    filename: `sprouty-export-${stamp}.zip`,
    bytes: blob.size,
    blob,
    counts: manifest.counts,
  };
}

/** Trigger a browser download for a fresh export. Convenience wrapper around
    `exportZip()` that handles the URL.createObjectURL / anchor click dance. */
export async function downloadExport(): Promise<ExportSummary> {
  const summary = await exportZip();
  const url = URL.createObjectURL(summary.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = summary.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Browsers need a tick before they've started the download; revoke after.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return summary;
}

/* ─── import ─── */

/** Parse + validate a zip and replace the contents of every Dexie table that
    is included. Throws with a human-readable message on any structural
    mismatch — the caller surfaces the message to the user. */
export async function importZip(file: Blob): Promise<ImportSummary> {
  const zip = await JSZip.loadAsync(file);

  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) {
    throw new Error("Not a Sprouty export — manifest.json is missing.");
  }
  const manifest = JSON.parse(await manifestEntry.async("string")) as PortableManifest;
  if (manifest.app !== "sprouty") {
    throw new Error(`Not a Sprouty export (manifest.app = ${manifest.app ?? "unknown"}).`);
  }
  if (manifest.schemaVersion > PORTABLE_SCHEMA_VERSION) {
    throw new Error(
      `Export was created by a newer version of Sprouty (schema v${manifest.schemaVersion}). Update Sprouty and try again.`,
    );
  }

  const [sessions, plans, fileMeta, visionMeta, context] = await Promise.all([
    readJson<SessionRecord[]>(zip, "sessions.json", []),
    readJson<PlanRecord[]>(zip, "plans.json", []),
    readJson<KnowledgeFileRecord[]>(zip, "files.json", []),
    readJson<VisionImageRecord[]>(zip, "visions.json", []),
    readJson<GardenContextRecord[]>(zip, "context.json", []),
  ]);

  // Re-attach binary blobs that were stored separately under files/ + visions/.
  for (const f of fileMeta) {
    const entry = zip.file(`files/${f.id}.bin`);
    if (entry) f.blob = await entry.async("blob");
  }
  for (const v of visionMeta) {
    const entry = zip.file(`visions/${v.id}.png`);
    if (entry) v.blob = await entry.async("blob");
  }

  // Atomic-ish replace: clear + bulkPut inside one transaction so a failed
  // import doesn't leave the user with a half-restored DB.
  await db().transaction(
    "rw",
    [db().sessions, db().plans, db().files, db().visions, db().context],
    async () => {
      await Promise.all([
        db().sessions.clear(),
        db().plans.clear(),
        db().files.clear(),
        db().visions.clear(),
        db().context.clear(),
      ]);
      await Promise.all([
        db().sessions.bulkPut(sessions),
        db().plans.bulkPut(plans),
        db().files.bulkPut(fileMeta),
        db().visions.bulkPut(visionMeta),
        db().context.bulkPut(context),
      ]);
    },
  );

  return {
    counts: {
      sessions: sessions.length,
      plans: plans.length,
      files: fileMeta.length,
      visions: visionMeta.length,
      context: context.length,
    },
  };
}

/* ─── helpers ─── */

async function readJson<T>(zip: JSZip, name: string, fallback: T): Promise<T> {
  const entry = zip.file(name);
  if (!entry) return fallback;
  const text = await entry.async("string");
  return JSON.parse(text) as T;
}

function stripVisionBlobs(visions: VisionImageRecord[]): Omit<VisionImageRecord, "blob">[] {
  return visions.map((v) => {
    const { blob: _blob, ...rest } = v;
    return rest;
  });
}

/* ─── markdown report ─── */

interface MarkdownReportInput {
  sessions: SessionRecord[];
  plans: PlanRecord[];
  files: KnowledgeFileRecord[];
  visions: VisionImageRecord[];
  context: GardenContextRecord[];
}

/**
 * Render a single, scannable Markdown summary of everything in the export.
 * Prioritizes the artifacts a user actually wants to review later: the latest
 * plan with its citations, the weekly tasks, the shopping list, recent
 * sessions, and pointers to the generated vision PNGs the ZIP itself bundles.
 */
function buildMarkdownReport(input: MarkdownReportInput): string {
  const { sessions, plans, files, visions, context } = input;
  const stamp = new Date().toLocaleString();
  const out: string[] = [
    "# Sprouty export",
    "",
    `Generated **${stamp}** from a Sprouty browser session. Everything below was decrypted out of IndexedDB and packaged alongside the raw JSON / blobs in this ZIP.`,
    "",
    "**API keys and the encryption master key are intentionally NOT included** — re-enter them once on the device where you import this archive (same trade Bitwarden makes with its JSON exports).",
    "",
    "---",
    "",
  ];

  // Garden context first — sets the stage for every plan that follows.
  const ctx = context[0];
  if (ctx) {
    const json = ctx.json as Record<string, unknown>;
    out.push("## Garden context");
    out.push("");
    const crops = Array.isArray(json.crops) ? (json.crops as string[]) : [];
    const goals = Array.isArray(json.goals) ? (json.goals as string[]) : [];
    if (crops.length) out.push(`- **Crops:** ${crops.join(", ")}`);
    if (typeof json.spaceDescription === "string") {
      out.push(`- **Space:** ${json.spaceDescription}`);
    }
    if (typeof json.hoursPerWeek === "number") {
      out.push(`- **Hours per week:** ${json.hoursPerWeek}`);
    }
    if (typeof json.region === "string") out.push(`- **Region:** ${json.region}`);
    if (goals.length) {
      out.push("- **Goals:**");
      for (const g of goals) out.push(`  - ${g}`);
    }
    out.push("");
    out.push(`Last updated: ${new Date(ctx.updatedAt).toLocaleString()}`);
    out.push("");
    out.push("---");
    out.push("");
  }

  // Plans — newest first. The active (highest-version) plan goes first under
  // its own heading; older versions land under a collapsed "previous versions"
  // section so the file doesn't read as 500 lines of repeated tasks.
  if (plans.length) {
    const sorted = [...plans].sort((a, b) => b.version - a.version);
    out.push(`## Plans (${plans.length})`);
    out.push("");
    out.push(`### Active plan · v${sorted[0].version}`);
    out.push("");
    out.push(renderPlan(sorted[0]));
    out.push("");
    if (sorted.length > 1) {
      out.push(`### Previous versions (${sorted.length - 1})`);
      out.push("");
      for (const p of sorted.slice(1)) {
        out.push(`#### v${p.version} · ${new Date(p.createdAt).toLocaleString()} · ${p.triggerEvent}`);
        out.push("");
        out.push(renderPlan(p, { compact: true }));
        out.push("");
      }
    }
    out.push("---");
    out.push("");
  }

  // Vision images — one row per generation with a relative path so the user
  // can click it after unzipping.
  if (visions.length) {
    out.push(`## Garden visions (${visions.length})`);
    out.push("");
    const sorted = [...visions].sort((a, b) => b.createdAt - a.createdAt);
    for (const v of sorted) {
      const when = new Date(v.createdAt).toLocaleString();
      const engine = v.engine === "openai" ? "GPT-Image" : "Gemini Nano Banana 2";
      out.push(`- ![${engine} · ${when}](visions/${v.id}.png) — **${engine}** · ${when}`);
      if (v.prompt?.trim()) {
        out.push(`  - Prompt notes: ${truncate(v.prompt.trim(), 240)}`);
      }
    }
    out.push("");
    out.push("---");
    out.push("");
  }

  // Knowledge base inventory.
  if (files.length) {
    out.push(`## Knowledge base (${files.length})`);
    out.push("");
    out.push("| File | Type | Size | Pages | Vectors | Status |");
    out.push("|---|---|---|---|---|---|");
    for (const f of files) {
      const sizeKb = (f.bytes / 1024).toFixed(0);
      out.push(
        `| ${escapePipe(f.filename)} | ${f.type} | ${sizeKb} KB | ${f.pages ?? "—"} | ${f.vectorCount ?? "—"} | ${f.status} |`,
      );
    }
    out.push("");
    out.push("Original blobs live under `files/<id>.bin` — rename to the original extension to open.");
    out.push("");
    out.push("---");
    out.push("");
  }

  // Voice sessions — newest first, transcript + summary + intent. Capped at
  // 30 entries so a hyperactive user doesn't blow the file up to 10 MB; the
  // raw `sessions.json` always has the full set.
  if (sessions.length) {
    const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
    const cap = 30;
    out.push(`## Voice sessions (showing ${Math.min(sorted.length, cap)} of ${sorted.length})`);
    out.push("");
    for (const s of sorted.slice(0, cap)) {
      const when = new Date(s.startedAt).toLocaleString();
      out.push(`### ${when} · ${s.intent}`);
      out.push("");
      if (s.summary) {
        out.push(`> ${s.summary.replace(/\n/g, "\n> ")}`);
        out.push("");
      }
      if (s.transcriptText?.trim()) {
        out.push("**Transcript**");
        out.push("");
        out.push("```");
        out.push(truncate(s.transcriptText.trim(), 4000));
        out.push("```");
        out.push("");
      }
    }
    if (sorted.length > cap) {
      out.push(`_${sorted.length - cap} earlier sessions omitted from this Markdown report — see \`sessions.json\` for the full record._`);
      out.push("");
    }
  }

  return out.join("\n");
}

function renderPlan(p: PlanRecord, opts: { compact?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`Created **${new Date(p.createdAt).toLocaleString()}** · trigger: \`${p.triggerEvent}\``);
  if (p.parentVersion) lines.push(`Replaces v${p.parentVersion}.`);
  lines.push("");

  // Tasks per week — when compact, only show weeks with at least one task to
  // keep older plans from sprawling.
  for (const w of p.weeks) {
    if (opts.compact && w.tasks.length === 0) continue;
    lines.push(`**Week ${w.index}** · ${w.startDate} → ${w.endDate}`);
    if (w.tasks.length === 0) {
      lines.push("- _No tasks_");
    } else {
      for (const t of w.tasks) {
        const box = t.status === "done" ? "[x]" : t.status === "current" ? "[›]" : "[ ]";
        const cite = t.citation ? ` _(Source: ${t.citation})_` : "";
        lines.push(`- ${box} ${t.label}${cite}`);
      }
    }
    lines.push("");
  }

  if (p.shoppingList.length) {
    lines.push("**Shopping list**");
    for (const item of p.shoppingList) lines.push(`- ${item}`);
    lines.push("");
  }
  return lines.join("\n");
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
