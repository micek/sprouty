/**
 * Tiny formatting helpers used across the UI. Kept in one place so display
 * conventions (file sizes, "just now") stay consistent.
 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

export function relativeTime(then: number): string {
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export type FileKind = "PDF" | "TXT" | "MD" | "IMG";

export function fileKindFromMime(mime: string, name: string): FileKind | null {
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "TXT";
  if (mime === "text/markdown" || /\.mdx?$/i.test(name)) return "MD";
  if (mime.startsWith("image/")) return "IMG";
  return null;
}
