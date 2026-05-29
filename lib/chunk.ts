/**
 * Semantic-ish text chunker for the knowledge-base ingest pipeline.
 *
 * Targets ~1000 chars per chunk with ~200 chars of overlap so retrieved
 * passages keep enough surrounding context to make sense out of context.
 * Splits on chapter / heading boundaries when the document signals them
 * (markdown headings, all-caps lines), otherwise on paragraph boundaries,
 * otherwise on sentence boundaries.
 *
 * Per CLAUDE.md §Phase I — Ingest.
 */

export interface ChunkOptions {
  /** Target chunk size in characters. Default 1000. */
  targetSize?: number;
  /** Overlap between adjacent chunks. Default 200. */
  overlap?: number;
}

export interface Chunk {
  text: string;
  /** Order within the document — used to build the canonical chunk ID. */
  index: number;
  /** Best-effort chapter / section heading, if we found one. */
  chapter?: string;
}

const HEADING_RE = /^(#+\s+.+|[A-Z][A-Z0-9 \-,'"]{6,}|Chapter\s+\d+.*)$/m;

/**
 * Split a long text into overlapping chunks with chapter awareness.
 */
export function chunkText(raw: string, options: ChunkOptions = {}): Chunk[] {
  const targetSize = options.targetSize ?? 1000;
  const overlap = options.overlap ?? 200;

  const text = normalize(raw);
  if (text.length <= targetSize) {
    return [{ text, index: 0, chapter: detectChapter(text) }];
  }

  // First pass: split on heading lines so chunks don't span chapter boundaries.
  const sections = splitByHeadings(text);

  const chunks: Chunk[] = [];
  let lastChapter: string | undefined;
  let cursor = 0;

  for (const section of sections) {
    const chapter = section.chapter ?? lastChapter;
    if (chapter) lastChapter = chapter;

    if (section.body.length <= targetSize) {
      chunks.push({
        text: section.body.trim(),
        index: cursor++,
        chapter,
      });
      continue;
    }

    // Long section — slide a window of `targetSize` chars with `overlap`
    // backstep, rounding to nearest sentence/paragraph boundary.
    let start = 0;
    while (start < section.body.length) {
      const end = Math.min(section.body.length, start + targetSize);
      const slice = section.body.slice(start, end);
      const trimmedEnd = trimToBoundary(slice);
      const text = (trimmedEnd ?? slice).trim();
      if (text.length === 0) break;
      chunks.push({ text, index: cursor++, chapter });
      const advance = (trimmedEnd ?? slice).length - overlap;
      // Avoid infinite loops if `targetSize ≤ overlap` or if we couldn't advance
      if (advance <= 0) break;
      start += advance;
    }
  }

  return chunks;
}

/* ─── helpers ─── */

function normalize(text: string): string {
  // Collapse Windows / Mac line endings, strip page-form-feed markers from
  // PDF extraction, normalize repeated whitespace. Keep paragraph breaks.
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

interface Section {
  chapter?: string;
  body: string;
}

function splitByHeadings(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let current: Section = { body: "" };

  for (const line of lines) {
    const isHeading = HEADING_RE.test(line.trim()) && line.trim().length < 120;
    if (isHeading) {
      if (current.body.trim().length > 0) sections.push(current);
      current = { chapter: line.replace(/^#+\s*/, "").trim(), body: "" };
    } else {
      current.body += `${line}\n`;
    }
  }
  if (current.body.trim().length > 0) sections.push(current);
  return sections;
}

function detectChapter(text: string): string | undefined {
  const m = text.match(HEADING_RE);
  return m ? m[0].replace(/^#+\s*/, "").trim() : undefined;
}

/**
 * Walk back from the end of `slice` to the nearest sentence or paragraph
 * boundary so chunks don't end mid-word. Returns null if we can't find a
 * decent boundary in the last 200 chars.
 */
function trimToBoundary(slice: string): string | null {
  const minLen = Math.max(0, slice.length - 200);
  const candidates = ["\n\n", ". ", "! ", "? ", "\n", "; "];
  for (const sep of candidates) {
    const idx = slice.lastIndexOf(sep, slice.length);
    if (idx >= minLen) return slice.slice(0, idx + sep.length);
  }
  return null;
}
