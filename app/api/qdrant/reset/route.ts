import { COLLECTION, qdrantClient } from "@/lib/qdrant";

/**
 * POST /api/qdrant/reset
 *
 * Drops the entire `sprout_kb` collection. Pairs with the footer "Start over"
 * link — when a user nukes their local data, we also delete the vectors so
 * the next ingest starts from a clean slate.
 *
 * Headers (BYOK, same shape as `/api/ingest`):
 *   - `x-qdrant-url`  — user's Qdrant cluster URL
 *   - `x-qdrant-key`  — user's Qdrant API key
 */
export async function POST(req: Request) {
  const qdrantUrl = req.headers.get("x-qdrant-url") ?? process.env.QDRANT_URL;
  const qdrantKey = req.headers.get("x-qdrant-key") ?? process.env.QDRANT_API_KEY;

  if (!qdrantUrl || !qdrantKey || qdrantKey.includes("REPLACE_ME")) {
    return Response.json(
      { ok: false, error: "Qdrant credentials missing" },
      { status: 401 },
    );
  }

  try {
    const client = qdrantClient({ url: qdrantUrl, apiKey: qdrantKey });
    // `deleteCollection` is a 404-safe no-op when the collection doesn't exist
    // on most Qdrant versions, but wrap it so a 404 from older servers still
    // returns ok — the caller's intent is "make sure it's gone."
    try {
      await client.deleteCollection(COLLECTION);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/not found|404/i.test(msg)) throw err;
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
