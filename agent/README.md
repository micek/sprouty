# Sprouty voice agent

Python LiveKit agent that powers Sprouty's voice flow. Sits in a LiveKit
room minted by [`/api/livekit/token`](../app/api/livekit/token/route.ts),
runs the Mistral sponsor stack — Voxtral STT → Mistral Small LLM → Voxtral
TTS — through OpenRouter, and emits structured transcript events over the
LiveKit data channel so the browser can persist the session and trigger
plan generation.

## Architecture

```
Browser (livekit-client)  ───WebRTC audio───→  LiveKit Cloud  ───→  Python agent (this dir)
        ↑                                                                 │
        └────data channel events (user_transcript, session_end)──────────┘
                                  │
                  Browser calls generatePlan() with full transcript
                                  ↓
                  Mistral extracts → Qdrant Discovery → Mistral plan
                                  ↓
                  Plan persisted to IndexedDB, Today tile rerenders
```

The agent is intentionally stateless about user data — every IndexedDB
record (sessions, plans, vision images, garden context, encrypted keys)
lives entirely in the browser. The agent's job is purely conversational.

## Run locally

```bash
cd agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# fill in OPENROUTER_API_KEY, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET

python agent.py dev
```

The `dev` subcommand connects to LiveKit and registers as a worker. Open
the Sprouty web app, hit "Tap to talk", and the agent picks up the room.

## Deploy to LiveKit Cloud

```bash
lk agent create
lk agent deploy
lk agent update-secrets   # ships .env contents into the cluster
lk agent logs --follow    # tail production output
```

See [SKILLS/cli/livekit/SKILL.md](../SKILLS/cli/livekit/SKILL.md) for the
full LiveKit CLI surface.

## Data channel events

Every event is published with `topic: "sprouty"` so the browser filter
stays simple.

| Type | When | Payload |
|------|------|---------|
| `user_transcript` | Each completed user turn (after VAD end-of-turn) | `{ text }` |
| `agent_transcript` | Each agent reply that finished synthesizing | `{ text }` |
| `session_end` | When the user disconnects from the room | `{ transcript, agent_transcript }` |

The browser handler in [`lib/livekit-room.ts`](../lib/livekit-room.ts)
accumulates `user_transcript` into `useAppStore.liveTranscript` for the
inline display, and on `session_end` calls `generatePlan({ transcript })`
to drive the constraint-extraction → Qdrant Discovery → plan-generation
pipeline.

## Future hooks (intentionally not in the skeleton)

- **Garden-context preload** — when the browser mints a token, it can pack
  the existing `GardenContext` into the participant `metadata` field; the
  agent's `_inject_metadata_context()` helper injects that into the chat
  context as a second system message. Wire from
  [`lib/livekit-room.ts`](../lib/livekit-room.ts).
- **Mid-conversation plan preview** — once the agent has enough
  constraints, it could call back to `/api/plan` itself and TTS-summarize
  the result. Currently the browser drives plan gen after the session ends.
- **Image captioning** — when the user uploads a "before" photo mid-call,
  the browser can emit a data event with the data URL; the agent can call
  `mistralai/mistral-small-multimodal` for a caption that flows into the
  vision-board prompt.
