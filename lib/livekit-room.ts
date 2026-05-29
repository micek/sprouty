"use client";

import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { db } from "./db";
import { generatePlan, type PlanProgressEvent } from "./plan-generation";
import { loadGardenContext } from "./garden-context";
import { getOrCreateDeviceId } from "./device";
import { summarizePlanForAgent } from "./plan-summary";

/**
 * Browser-side LiveKit lifecycle for the Sprouty voice flow.
 *
 *   startLiveSession()  - mint token via /api/livekit/token, connect, publish
 *                         mic, attach the agent's audio reply to a hidden
 *                         <audio> element, wire data-channel transcript
 *                         events, return a handle.
 *   handle.stop()       - leaves the room cleanly. Calling code should call
 *                         this on "Stop & send", on Escape, on unmount, etc.
 *   handle.onSessionEnd - resolved with the final transcript when the agent
 *                         publishes a `session_end` data event (or when the
 *                         room disconnects, whichever comes first).
 *
 * The handle holds enough state to plug into the existing zustand-driven
 * voice UI (`useAppStore.appendLiveTranscript()` for the inline transcript,
 * `setVoiceState("idle")` on stop). The component layer wires all that up.
 */

export interface LiveSessionHandlers {
  /** Called for every committed user turn — appends to the live transcript UI. */
  onUserTranscript?: (text: string) => void;
  /** Called for every committed agent turn (mostly for debugging / captions). */
  onAgentTranscript?: (text: string) => void;
  /** Surfaces non-fatal events so the UI can flash an error band. */
  onError?: (message: string) => void;
}

export interface LiveSessionHandle {
  room: Room;
  /** Resolves once the agent emits `session_end` OR the room disconnects. */
  endPromise: Promise<{ transcript: string; agentTranscript: string }>;
  /** Tear down the room + detach audio. Idempotent. */
  stop(): Promise<void>;
}

const AGENT_AUDIO_ELEMENT_ID = "sprouty-agent-audio";

/**
 * Connect to a freshly-minted LiveKit room and start the voice session. The
 * caller (a React component) wires the returned handlers + endPromise into
 * the existing voice UI state machine.
 */
export async function startLiveSession(
  handlers: LiveSessionHandlers = {},
): Promise<LiveSessionHandle> {
  // 1. Mint a token. Pack the user's current garden context AND a compact
  //    plan snapshot into the participant `metadata` so the agent can
  //    answer "what's next in my plan?" without a tool round-trip — the
  //    plan lives in IndexedDB, which the Python agent can't reach. The
  //    identity is pulled from a locally-persisted device id so the agent
  //    recognizes returning callers instead of treating every voice
  //    session as a stranger.
  const context = await loadGardenContext();
  const activePlan = await db().plans.orderBy("version").reverse().first();
  // The seeded `starter_seed` plan is design-mock data, not a real voice-built
  // plan. Treat it as "no plan" so the agent picks the first-time opener
  // ("Hi, I'm Sprouty. Tell me about your space…") instead of the returning
  // opener ("Hey, welcome back. I've got your plan loaded…"). The matching
  // UI gate lives in PlanCard / PlanTimeline empty states.
  const realPlan = activePlan?.triggerEvent === "starter_seed" ? null : activePlan;
  const planSnapshot = summarizePlanForAgent(realPlan);
  const metadataPayload =
    context || planSnapshot ? { ...(context ?? {}), plan: planSnapshot } : null;
  const identity = getOrCreateDeviceId();
  // Per-session room name. The identity stays stable across sessions (so the
  // agent can recognize the returning device via metadata), but the room name
  // must be unique every time — LiveKit's `RoomConfiguration { agents: [...] }`
  // directive only fires when a room is *first created*. Reusing a stable
  // room name lets the empty `empty_timeout` (5 min default) keep the prior
  // room alive, and the second session silently joins that already-existing
  // room with no agent dispatch attached. A uuid'd room name forces fresh
  // creation each time.
  const roomName = `sprouty-${crypto.randomUUID()}`;
  const tokenRes = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity,
      roomName,
      metadata: metadataPayload ? JSON.stringify(metadataPayload) : undefined,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    throw new Error(`LiveKit token mint failed (${tokenRes.status}): ${text.slice(0, 200)}`);
  }
  const tokenJson = (await tokenRes.json()) as
    | { ok: true; token: string; wsUrl: string; identity: string; roomName: string }
    | { ok: false; error: string };
  if (!tokenJson.ok) throw new Error(tokenJson.error);

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  // 2. Wire room events BEFORE connect so we don't miss the first track.
  let userTranscriptParts: string[] = [];
  let agentTranscriptParts: string[] = [];
  let endResolved = false;
  let resolveEnd!: (value: { transcript: string; agentTranscript: string }) => void;
  const endPromise = new Promise<{ transcript: string; agentTranscript: string }>((resolve) => {
    resolveEnd = resolve;
  });
  const finalize = () => {
    if (endResolved) return;
    endResolved = true;
    resolveEnd({
      transcript: userTranscriptParts.join("\n"),
      agentTranscript: agentTranscriptParts.join("\n"),
    });
  };

  room
    .on(RoomEvent.ParticipantConnected, (p) => {
      console.info("[sprouty] ParticipantConnected:", {
        identity: p.identity,
        sid: p.sid,
        kind: p.kind,
        metadata: p.metadata,
      });
    })
    .on(RoomEvent.ParticipantDisconnected, (p) => {
      console.info("[sprouty] ParticipantDisconnected:", { identity: p.identity });
    })
    .on(RoomEvent.TrackPublished, (pub, p) => {
      console.info("[sprouty] TrackPublished (remote):", {
        kind: pub.kind,
        source: pub.source,
        trackName: pub.trackName,
        participant: p.identity,
        subscribed: pub.isSubscribed,
      });
    })
    .on(RoomEvent.TrackSubscriptionFailed, (sid, p) => {
      console.warn("[sprouty] TrackSubscriptionFailed:", {
        sid,
        participant: p.identity,
      });
    })
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
      console.info("[sprouty] TrackSubscribed:", {
        kind: track.kind,
        sid: track.sid,
        participant: p.identity,
      });
      if (track.kind === Track.Kind.Audio) {
        attachAgentAudio(track);
      }
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) detachAgentAudio();
    })
    .on(RoomEvent.DataReceived, (payload: Uint8Array, _participant, _kind, topic?: string) => {
      if (topic !== "sprouty") return;
      let event: { type?: string; text?: string; transcript?: string; agent_transcript?: string };
      try {
        event = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      if (event.type === "user_transcript" && event.text) {
        userTranscriptParts.push(event.text);
        handlers.onUserTranscript?.(event.text);
      } else if (event.type === "agent_transcript" && event.text) {
        agentTranscriptParts.push(event.text);
        handlers.onAgentTranscript?.(event.text);
      } else if (event.type === "session_end") {
        // The agent has already packaged the full transcript.
        if (event.transcript) userTranscriptParts = [event.transcript];
        if (event.agent_transcript) agentTranscriptParts = [event.agent_transcript];
        finalize();
      }
    })
    .on(RoomEvent.Disconnected, () => {
      detachAgentAudio();
      finalize();
    })
    .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      if (state === ConnectionState.Disconnected) finalize();
    });

  // 3. Connect + publish mic. Pin the AEC / NS / AGC constraints explicitly
  //    instead of trusting livekit-client's defaults — Chrome incognito,
  //    enterprise policy, and certain extensions can silently flip these
  //    off, which lets Sprouty's TTS echo back through laptop speakers →
  //    laptop mic → STT, and the agent ends up transcribing itself
  //    ("Hey, welcome back" / "on your mind this week" — both fragments
  //    of Sprouty's own opener showed up as user input in testing).
  await room.connect(tokenJson.wsUrl, tokenJson.token, { autoSubscribe: true });
  try {
    await room.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  } catch (err) {
    handlers.onError?.(
      err instanceof Error ? `Microphone permission denied: ${err.message}` : "Microphone permission denied",
    );
    await room.disconnect();
    throw err;
  }

  return {
    room,
    endPromise,
    async stop() {
      try {
        await room.disconnect();
      } finally {
        detachAgentAudio();
        finalize();
      }
    },
  };
}

/**
 * After a session ends with a non-empty transcript, drive the same
 * constraint-extraction → Qdrant Discovery → plan-generation pipeline the
 * "Try a typed plan" modal uses. The component layer typically calls this
 * directly with `handle.endPromise` resolution.
 */
export async function finalizeSessionWithPlan(
  transcript: string,
  onProgress?: (event: PlanProgressEvent) => void,
) {
  if (transcript.trim().length < 5) {
    return { ok: false as const, error: "Empty transcript — no plan to generate." };
  }
  return generatePlan({ transcript, intent: "initial_planning", onProgress });
}

/* ─── audio element plumbing ─── */

function attachAgentAudio(track: RemoteTrack): void {
  detachAgentAudio();
  const el = track.attach() as HTMLAudioElement;
  el.id = AGENT_AUDIO_ELEMENT_ID;
  el.autoplay = true;
  el.style.display = "none";
  document.body.appendChild(el);
  // Explicit play() — `autoplay=true` should be enough on a page with user
  // activation (the user just clicked Tap to Talk), but Chrome's autoplay
  // policy will silently no-op if the activation window has closed by the
  // time the agent's track arrives (~3–5s later, after token mint + connect
  // + agent dispatch + Voxtral synthesis). The rejected promise surfaces
  // that case to the console with a NotAllowedError instead of leaving us
  // staring at a non-playing element.
  el.play()
    .then(() => {
      console.info("[sprouty] agent audio playing:", {
        muted: el.muted,
        volume: el.volume,
        readyState: el.readyState,
      });
    })
    .catch((err) => {
      console.warn("[sprouty] agent audio play() rejected:", err);
    });
}

function detachAgentAudio(): void {
  const existing = document.getElementById(AGENT_AUDIO_ELEMENT_ID);
  if (existing) existing.remove();
}
