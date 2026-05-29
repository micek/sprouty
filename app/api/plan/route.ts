import { COMMON_HOME_CROPS } from "@/lib/crops";
import { Models } from "@/lib/models";
import { chatJson, embed } from "@/lib/openrouter";
import {
  COLLECTION,
  EMBEDDING_MODEL,
  discover,
  qdrantClient,
  type DiscoveryHit,
} from "@/lib/qdrant";

/**
 * POST /api/plan
 *
 * Generates a 12-week beginner-friendly garden plan from a free-text user
 * transcript. Three streamed stages — each emits NDJSON progress events the
 * client orchestrates a UI from:
 *
 *   1. extracting    — Mistral Small extracts structured constraints
 *                      (crops, space, hours, goals, region, intent) as JSON.
 *   2. retrieving    — Embed positive/negative phrases, hit Qdrant Discovery
 *                      with a beginner difficulty cap, return matched chunks.
 *   3. generating    — Mistral Small composes the 12-week plan citing the
 *                      retrieved chunks (`sourceChunkId` + human "Ch. X, p. Y"
 *                      citation per task).
 *   4. done          — final payload: extracted constraints + plan JSON +
 *                      the chunks that informed it (so the UI can show
 *                      "Source: Ch. 3, p. 19" links).
 *
 * Body: application/json
 *   { transcript: string,           // required
 *     existingContext?: GardenCtx,  // optional — merge target for next session
 *     intent?: string }             // optional hint
 *
 * Headers (BYOK, request-scoped, never persisted):
 *   x-openrouter-key  - user's OpenRouter API key (or env fallback)
 *   x-qdrant-url      - user's Qdrant cluster URL  (or env fallback)
 *   x-qdrant-key      - user's Qdrant API key      (or env fallback)
 *
 * Response: 200 application/x-ndjson — one JSON object per line.
 */

interface ExtractedConstraints {
  crops: string[];
  spaceDescription?: string;
  hoursPerWeek?: number;
  goals?: string[];
  region?: string;
  intent?: "initial_planning" | "weekly_checkin" | "problem_report" | "general_chat";
  /**
   * `true` when the user's words would change the 12-week plan — they want
   * to add/remove crops, change their space or available time, change goals,
   * or report a scheduling-relevant problem. `false` for casual Q&A,
   * factual questions, story requests, or general chitchat.
   *
   * Used together with `hasExistingPlan` to skip plan regeneration on
   * conversations that don't actually warrant a new version.
   */
  needsReplan?: boolean;
}

interface PlanTask {
  id: string;
  label: string;
  status: "pending" | "current" | "done";
  sourceChunkId?: string;
  citation?: string;
}

interface PlanWeek {
  index: number;
  startDate: string;
  endDate: string;
  tasks: PlanTask[];
}

interface GeneratedPlan {
  weeks: PlanWeek[];
  shoppingList: string[];
}

export async function POST(req: Request) {
  const openrouterKey =
    req.headers.get("x-openrouter-key") ?? process.env.OPENROUTER_API_KEY;
  const qdrantUrl = req.headers.get("x-qdrant-url") ?? process.env.QDRANT_URL;
  const qdrantKey = req.headers.get("x-qdrant-key") ?? process.env.QDRANT_API_KEY;

  if (!openrouterKey || openrouterKey.includes("REPLACE_ME")) {
    return ndjsonError(401, "OpenRouter key missing — save one in Settings or set OPENROUTER_API_KEY");
  }
  if (!qdrantUrl || !qdrantKey || qdrantKey.includes("REPLACE_ME")) {
    return ndjsonError(401, "Qdrant credentials missing — save them in Settings or set QDRANT_URL + QDRANT_API_KEY");
  }

  let body: {
    transcript?: unknown;
    existingContext?: unknown;
    intent?: unknown;
    hasExistingPlan?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch (err) {
    return ndjsonError(400, `Invalid JSON body: ${errMsg(err)}`);
  }
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (transcript.length < 5) {
    return ndjsonError(400, "Transcript is empty or too short to plan from.");
  }
  const intentHint = typeof body.intent === "string" ? body.intent : undefined;
  const hasExistingPlan = body.hasExistingPlan === true;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        // 1. Extract constraints
        send({ stage: "extracting", progress: 0.05, message: "Reading what you said" });
        const constraints = await extractConstraints(transcript, intentHint, openrouterKey);
        // Defensive: the LLM sometimes omits `crops` entirely on Q&A-only
        // transcripts ("what's a jar test?"), even though the schema marks
        // it required. Normalize to an empty array so downstream `.length`
        // reads can't crash.
        if (!Array.isArray(constraints.crops)) constraints.crops = [];

        const cropCount = constraints.crops.length;
        send({
          stage: "extracting",
          progress: 0.25,
          message: `Heard you on ${cropCount || "no specific"} crop${
            cropCount === 1 ? "" : "s"
          } · ${constraints.spaceDescription ?? "space TBD"}`,
        });

        // Short-circuit: if the user already has a plan AND nothing they said
        // would change it (Q&A, story request, casual chat), skip the
        // expensive retrieval + generation steps and emit a "skipped" done
        // event. The browser uses this to persist the session/context but
        // leave the active plan alone.
        const skipReplan =
          hasExistingPlan && constraints.needsReplan === false;
        if (skipReplan) {
          send({
            stage: "done",
            progress: 1,
            constraints,
            plan: null,
            sources: [],
            skipped: true,
          });
          return;
        }

        // 2. Retrieve relevant chunks from Qdrant
        send({ stage: "retrieving", progress: 0.35, message: "Pulling guidance from your knowledge base" });
        const hits = await retrieveChunks(constraints, openrouterKey, qdrantUrl, qdrantKey);
        send({
          stage: "retrieving",
          progress: 0.55,
          message: `Found ${hits.length} relevant section${hits.length === 1 ? "" : "s"} to draw from`,
        });

        // 3. Generate the plan
        send({ stage: "generating", progress: 0.65, message: "Drafting your 12-week plan" });
        const plan = await generatePlan(transcript, constraints, hits, openrouterKey);
        send({ stage: "generating", progress: 0.95, message: "Finalizing the schedule" });

        // 4. Done
        send({
          stage: "done",
          progress: 1,
          constraints,
          plan,
          sources: hits.map((h) => ({
            chunkId: String(h.id),
            score: h.score,
            sourceDoc: h.payload.source_doc,
            chapter: h.payload.chapter,
            section: h.payload.section_title,
          })),
        });
      } catch (err) {
        send({ stage: "error", error: errMsg(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/* ─── stage 1: constraint extraction ─── */

async function extractConstraints(
  transcript: string,
  intentHint: string | undefined,
  key: string,
): Promise<ExtractedConstraints> {
  const cropDictionary = COMMON_HOME_CROPS.join(", ");
  const system = [
    "You are an extraction model for a beginner-gardening app called Sprouty.",
    "Read the user's transcript and emit a strict JSON object describing what you heard.",
    "Only return JSON — no markdown, no commentary.",
    "If a field isn't mentioned, omit it (do NOT invent values).",
    `Use the canonical crop names from this list when possible: ${cropDictionary}.`,
    "If the user mentions a crop not on the list, include the exact word they used in lowercase.",
    "Intent values: 'initial_planning' | 'weekly_checkin' | 'problem_report' | 'general_chat'.",
    // The needsReplan flag drives whether we rebuild the 12-week plan or
    // just save the conversation. Be conservative — when in doubt, true.
    "Set `needsReplan` to true ONLY when the user's words would change a garden plan: they add or remove crops, change their space, change available hours, change goals, or describe a problem that warrants rescheduling. Set false for purely informational questions ('what's a jar test?', 'tell me a story'), confirmations, or casual chitchat with no new constraints.",
  ].join(" ");
  const userMessage = intentHint
    ? `Transcript:\n\n${transcript}\n\nIntent hint from caller: ${intentHint}`
    : `Transcript:\n\n${transcript}`;

  const schemaHint = `Return JSON matching:
{
  "crops": string[],
  "spaceDescription"?: string,
  "hoursPerWeek"?: number,
  "goals"?: string[],
  "region"?: string,
  "intent"?: "initial_planning" | "weekly_checkin" | "problem_report" | "general_chat",
  "needsReplan"?: boolean
}`;

  return chatJson<ExtractedConstraints>(
    [
      { role: "system", content: `${system}\n\n${schemaHint}` },
      { role: "user", content: userMessage },
    ],
    key,
    { model: Models.LLM, temperature: 0.1 },
  );
}

/* ─── stage 2: retrieval ─── */

async function retrieveChunks(
  constraints: ExtractedConstraints,
  openrouterKey: string,
  qdrantUrl: string,
  qdrantKey: string,
): Promise<DiscoveryHit[]> {
  // Compose the positive query — what the user wants. Crops + space + goals
  // give the embedder enough to anchor on. Fall through to a generic beginner
  // sentence if everything is empty.
  const positiveText =
    [
      constraints.crops.length ? `Growing ${constraints.crops.join(", ")}` : "",
      constraints.spaceDescription ?? "",
      constraints.goals?.join("; ") ?? "",
      constraints.hoursPerWeek
        ? `About ${constraints.hoursPerWeek} hours per week`
        : "",
    ]
      .filter(Boolean)
      .join(". ") || "A beginner home vegetable garden plan, easy crops, small space.";

  const negativeText =
    "Advanced commercial techniques, year-round greenhouse operation, large acreage, expert-only plant care, breeding programs, hydroponic engineering.";

  const [positive, negative] = await Promise.all([
    embed(positiveText, openrouterKey),
    embed(negativeText, openrouterKey),
  ]);

  const client = qdrantClient({ url: qdrantUrl, apiKey: qdrantKey });

  // Try with crop filter first; if Qdrant has no chunks tagged with those
  // crops yet (early-stage knowledge base), fall back to an unfiltered query
  // so we still surface *something* relevant.
  const tryQuery = async (withCropFilter: boolean) => {
    try {
      return await discover(client, {
        positives: [positive],
        negatives: [negative],
        crops: withCropFilter ? constraints.crops : undefined,
        limit: 8,
      });
    } catch {
      return [];
    }
  };

  let hits = await tryQuery(true);
  if (hits.length === 0) hits = await tryQuery(false);
  return hits;
}

/* ─── stage 3: plan generation ─── */

async function generatePlan(
  transcript: string,
  constraints: ExtractedConstraints,
  hits: DiscoveryHit[],
  key: string,
): Promise<GeneratedPlan> {
  const weekRange = computeWeekRange();
  const sourceBlock = hits
    .map((h, i) => {
      const cite = formatCitation(h);
      const text = h.payload.text.slice(0, 500);
      return `[chunk ${i + 1}] id=${h.id} ${cite}\n${text}`;
    })
    .join("\n\n");

  const system = [
    "You are a beginner-gardening planner for the Sprouty app.",
    "Compose a realistic 12-week plan tuned for a first-time gardener with limited time.",
    "Tasks must be concrete actions ('Soak bean seeds, sow tomorrow') — not vague advice.",
    "Cap the difficulty: prefer easy crops, simple containers/raised beds, and steady weekly progress.",
    "Each task may cite a source chunk by id when its action is grounded in a chunk's content.",
    "Return STRICT JSON only — no markdown, no commentary.",
  ].join(" ");

  const schemaHint = `Return JSON matching:
{
  "weeks": [
    {
      "index": 1..12,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "tasks": [
        {
          "id": "kebab-case-task-id",
          "label": "Concrete action sentence",
          "status": "pending" | "current" | "done",
          "sourceChunkId"?: "<id from sources>",
          "citation"?: "Ch. 3, p. 19"
        }
      ]
    }
  ],
  "shoppingList": [ "1 lb bush bean seeds (Provider variety)", ... ]
}

Rules:
- Generate all 12 weeks (index 1..12). Use the exact startDate/endDate values supplied below.
- Week 1's first task should be marked "current"; everything else "pending".
- Each week has 3-5 tasks.
- Cite chunks where the action is directly informed by one (sourceChunkId + citation).
- Keep tasks readable on a phone screen — under 80 chars.
- Shopping list: 4-8 items the user needs to buy before week 1, with realistic quantities.`;

  const weekHint = weekRange
    .map((w) => `Week ${w.index}: ${w.startDate} → ${w.endDate}`)
    .join("\n");

  const user = [
    `User transcript:\n${transcript}`,
    "",
    `Extracted constraints:\n${JSON.stringify(constraints, null, 2)}`,
    "",
    `Week schedule (use these exact dates):\n${weekHint}`,
    "",
    sourceBlock
      ? `Knowledge-base sources you can cite:\n${sourceBlock}`
      : "No knowledge-base sources matched — generate the plan from general beginner gardening knowledge and OMIT sourceChunkId/citation on every task.",
  ].join("\n");

  return chatJson<GeneratedPlan>(
    [
      { role: "system", content: `${system}\n\n${schemaHint}` },
      { role: "user", content: user },
    ],
    key,
    // 12 weeks × 3–5 tasks × ~80 chars each + ids + citations + 4–8 shopping
    // items hits ~9–10k chars when serialized as JSON. 4000 tokens routinely
    // truncated mid-string ("Unterminated string in JSON at position 11344").
    // 8000 gives ~30k chars of headroom — comfortable for the full plan.
    { model: Models.LLM, temperature: 0.3, maxTokens: 8000 },
  );
}

/* ─── helpers ─── */

function computeWeekRange(): Array<{ index: number; startDate: string; endDate: string }> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const week1Start = new Date(now);
  week1Start.setDate(now.getDate() - dayOfWeek);
  week1Start.setHours(0, 0, 0, 0);
  return Array.from({ length: 12 }, (_, i) => {
    const start = new Date(week1Start);
    start.setDate(week1Start.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      index: i + 1,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  });
}

function formatCitation(hit: DiscoveryHit): string {
  const ch = hit.payload.chapter ?? "";
  const sec = hit.payload.section_title ?? "";
  const page = hit.payload.page ? `p. ${hit.payload.page}` : "";
  const parts = [ch, sec, page].filter(Boolean);
  return parts.length ? `(${parts.join(" · ")})` : "";
}

function ndjsonError(status: number, message: string): Response {
  const body = `${JSON.stringify({ stage: "error", error: message })}\n`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
// Reference for tooling that reads the Qdrant collection name from this file.
export const _PLAN_COLLECTION_HINT = COLLECTION;
export const _PLAN_EMBEDDING_HINT = EMBEDDING_MODEL;
