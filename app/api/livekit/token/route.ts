import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk";

// Explicit-dispatch agent name. Must match `agent_name="sprouty"` in
// agent/agent.py — LiveKit Cloud uses this string to route incoming room
// participants to the right registered worker.
const SPROUTY_AGENT_NAME = "sprouty";

/**
 * POST /api/livekit/token
 *
 * Mints a short-lived LiveKit join token. The browser hits this route, the
 * route signs a JWT with the server-side `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET`,
 * the browser uses the token to connect to the LiveKit room over WebRTC and
 * carry on a voice conversation with the Python agent listening in that room.
 *
 * Per CLAUDE.md, LiveKit credentials are NOT BYOK — they're a deployment
 * secret that live in `.env.local` (or Vercel env). Putting them on the
 * client would let anyone trivially mint tokens for any room. The user's
 * other API keys (OpenRouter, Qdrant) ride along inside the agent process,
 * never on the wire to the browser.
 *
 * Body: application/json (all fields optional)
 *   {
 *     roomName?:  string,  // defaults to a per-user room derived from identity
 *     identity?:  string,  // defaults to a fresh UUID
 *     name?:      string,  // human display name shown to the agent
 *     metadata?:  string,  // JSON-encoded extra context (e.g. garden context)
 *     ttlSeconds?: number, // token lifetime, default 600 (10 min)
 *   }
 *
 * Response: 200 application/json
 *   { ok: true, token, identity, roomName, wsUrl }
 *   { ok: false, error }
 */
export async function POST(req: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || apiKey.includes("REPLACE_ME") || apiSecret.includes("REPLACE_ME")) {
    return jsonError(
      401,
      "LiveKit server credentials missing — set LIVEKIT_API_KEY + LIVEKIT_API_SECRET in .env.local (these stay server-side, never BYOK)",
    );
  }
  if (!wsUrl) {
    return jsonError(
      401,
      "LiveKit cluster URL missing — set LIVEKIT_URL (server) and NEXT_PUBLIC_LIVEKIT_URL (client) in .env.local",
    );
  }

  let body: {
    roomName?: unknown;
    identity?: unknown;
    name?: unknown;
    metadata?: unknown;
    ttlSeconds?: unknown;
  } = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = (await req.json()) as typeof body;
    }
  } catch {
    // empty / malformed body is fine — we have defaults for everything
  }

  const identity =
    typeof body.identity === "string" && body.identity.trim().length > 0
      ? body.identity.trim()
      : `sprouty-${crypto.randomUUID()}`;
  const roomName =
    typeof body.roomName === "string" && body.roomName.trim().length > 0
      ? body.roomName.trim()
      : `sprouty-${identity}`;
  const displayName = typeof body.name === "string" ? body.name : undefined;
  const metadata = typeof body.metadata === "string" ? body.metadata : undefined;
  const ttlSeconds =
    typeof body.ttlSeconds === "number" && Number.isFinite(body.ttlSeconds)
      ? Math.max(60, Math.min(3600, body.ttlSeconds))
      : 600;

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: displayName,
      metadata,
      ttl: ttlSeconds,
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    // Explicit dispatch: tell LiveKit Cloud to spin up the named "sprouty"
    // agent worker in this room as the participant joins. Without this,
    // auto-dispatch was silently not firing on this project — the worker
    // registered but never received jobs.
    at.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName: SPROUTY_AGENT_NAME })],
    });
    const token = await at.toJwt();

    return Response.json({
      ok: true,
      token,
      identity,
      roomName,
      wsUrl,
    });
  } catch (err) {
    return jsonError(
      500,
      `Token signing failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function jsonError(status: number, message: string): Response {
  return Response.json({ ok: false, error: message }, { status });
}
