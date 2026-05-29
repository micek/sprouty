import { RoomServiceClient } from "livekit-server-sdk";

/**
 * GET /api/livekit/test
 *
 * Validates the server-side LiveKit credentials by making a real round-trip
 * to the cluster (`RoomService.listRooms`). The Settings panel's LiveKit
 * Test button calls this — LiveKit's server APIs aren't browser-CORS-friendly,
 * so we proxy through here. No request body needed; the test reads
 * `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` from env.
 *
 * A 200 with `{ ok: true }` means the credentials authenticate against the
 * cluster. A non-2xx (or `{ ok: false }`) tells the user exactly what's wrong.
 */
export async function GET() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || apiKey.includes("REPLACE_ME")) {
    return Response.json(
      { ok: false, error: "LIVEKIT_API_KEY missing or still a placeholder." },
      { status: 401 },
    );
  }
  if (!apiSecret || apiSecret.includes("REPLACE_ME")) {
    return Response.json(
      { ok: false, error: "LIVEKIT_API_SECRET missing or still a placeholder." },
      { status: 401 },
    );
  }
  if (!wsUrl) {
    return Response.json(
      {
        ok: false,
        error: "LiveKit cluster URL missing — set LIVEKIT_URL (server) and NEXT_PUBLIC_LIVEKIT_URL (client).",
      },
      { status: 401 },
    );
  }

  // RoomServiceClient accepts either an `https://` or `wss://` host; it will
  // normalize internally. Calling listRooms() exercises the credentials end-to-end.
  try {
    const svc = new RoomServiceClient(wsUrl, apiKey, apiSecret);
    const rooms = await svc.listRooms();
    return Response.json({
      ok: true,
      message: `Authenticated · cluster reports ${rooms.length} active room${rooms.length === 1 ? "" : "s"}`,
      url: wsUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: `LiveKit cluster rejected the credentials: ${message}` },
      { status: 502 },
    );
  }
}
