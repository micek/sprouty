# Changelog

A running, dated log of every meaningful change to Sprout — features added, dependencies bumped, design tokens shifted, infra moves. Newest entries on top.

Format:
```
## YYYY-MM-DD, H:MMpm CST — Short title
- bullet of what changed
- bullet of what changed
```

---

## 2026-05-14, 5:19pm CST — Start-over reset, plan-info gating, LiveKit dispatch fixes, scrollspy + toast move, plan empty state

A continuation of the multi-session voice-flow work, plus a privacy/UX commitment that the user can wipe everything from inside the app.

### "Start over · clear plan" — full-state reset from the footer

- **New [app/api/qdrant/reset/route.ts](app/api/qdrant/reset/route.ts).** POST endpoint that deletes the entire `sprout_kb` collection. BYOK headers (`x-qdrant-url` / `x-qdrant-key`) with `.env.local` fallback, same shape as `/api/ingest`. 404s during delete are treated as success — caller intent is "make sure it's gone."
- **New [lib/reset.ts](lib/reset.ts) `resetEverything()`.** Snapshots the user's Qdrant key out of the encrypted IndexedDB envelope BEFORE wiping (otherwise we'd nuke the key first and can't authenticate the Qdrant delete), POSTs to `/api/qdrant/reset` best-effort, closes the Dexie handle, drops the entire `sprout` IndexedDB via `Dexie.delete()` (which also discards the AES-GCM master key in the `master` table → next page load creates a fresh one), and calls `resetDeviceId()` to clear the localStorage LiveKit identity.
- **Footer link in [components/app-footer.tsx](components/app-footer.tsx).** Converted to a client component. New terracotta-colored "↺ Start over · clear plan" button sits above the "Created by Cory Micek" line. On click: `window.confirm()` with an itemized warning ("plan, voice sessions, knowledge-base files, vision images, garden context, and saved API keys — and the Qdrant collection. There is no undo."), then `resetEverything()`, toast, then `window.location.reload()` after 250ms so the toast renders briefly first. Qdrant failure surfaces as a `fail` toast but still reloads — local wipe should never be blocked by a transient network error.

### Voice agent: gate plan generation on three required inputs

- **[agent/prompts/sprouty.md](agent/prompts/sprouty.md) first-time mode rewritten.** Sprouty MUST hear all three before signaling readiness: (1) **space** they have, (2) **time** per week they can commit, (3) **what they want to grow** (≥1 crop). Sun, region, and climate are now bonus rather than substitutable. New "Hard rule: do NOT signal that you're ready to build the plan until you have heard the user give you all three required pieces" line, plus a redirect script for users who try to wrap early ("Before I build it — I still need to hear about [missing piece]"). Rationale: a plan built on missing constraints is generic and unhelpful; the seeded starter plan was masking this in testing.

### LiveKit voice flow: explicit dispatch + per-session rooms + stale-job guard

The voice agent was silently not receiving jobs on the second session of any given browser run. Root cause was a chain of issues:

- **Explicit agent dispatch.** Auto-dispatch was registered but never firing jobs on this LiveKit Cloud project. Added `agent_name="sprouty"` to `WorkerOptions` in [agent/agent.py](agent/agent.py) and a matching `RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: "sprouty" })] })` on the minted token in [app/api/livekit/token/route.ts](app/api/livekit/token/route.ts). The agent name string is the contract between worker registration and token routing.
- **Unique room name per session.** `RoomConfiguration`'s `agents` directive only fires on **room creation**. LiveKit's default `empty_timeout` (5 min) kept the prior room alive after the user ended a session, so the second `startLiveSession()` joined the still-warm room with no agent dispatch attached. Changed [lib/livekit-room.ts:84](lib/livekit-room.ts#L84) from a stable `sprouty-${identity}` room name to `sprouty-${crypto.randomUUID()}` per session — the identity stays stable across sessions (so the agent recognizes returning devices via metadata), but a fresh room name forces re-creation and re-dispatch.
- **Stale job replay guard.** When a worker is Ctrl+C'd mid-job, LiveKit replays the pending job on the next worker start — but the room has long since collapsed, so `ctx.wait_for_participant()` hangs forever / raises `RuntimeError`. Wrapped in `asyncio.wait_for(..., timeout=30.0)` in [agent/agent.py](agent/agent.py) with a graceful info-log + return on `TimeoutError`/`RuntimeError`. No more unhandled exceptions in the terminal on first run after a Ctrl+C.
- **Diagnostic event logging.** Added `console.info` calls in [lib/livekit-room.ts](lib/livekit-room.ts) for `ParticipantConnected`, `ParticipantDisconnected`, `TrackPublished`, `TrackSubscriptionFailed`, `TrackSubscribed`, plus `el.play().then(...).catch(...)` in `attachAgentAudio` to surface Chrome autoplay rejections. Used these to confirm during debugging that audio bytes were reaching the browser (`readyState: 4, muted: false, volume: 1`) and isolate a downstream system-audio issue from a code bug.

### Top-bar scrollspy

- **Scrollspy in [components/top-bar.tsx](components/top-bar.tsx).** As the user scrolls, the active tab pill follows the visible section. Implementation: a `useEffect`-installed `scroll` listener (passive, RAF-throttled to one update per frame) walks `SECTION_IDS` top-to-bottom and picks the deepest section whose top has crossed `SCROLLSPY_PROBE_Y = 140` (just below the sticky topbar). Click-initiated navigation suspends the scrollspy for `SCROLLSPY_LOCKOUT_MS = 800` so the smooth-scroll animation doesn't drag the highlighted pill through intermediate sections.

### Toast host moved to top-right, beneath the nav

- **[components/toast-host.tsx](components/toast-host.tsx)** moved from `bottom-6 right-6` to `top-[78px]` desktop / `top-[68px]` mobile — anchored 8px below the sticky topbar (`py-4 + 36px brand + 1px border` = 77px desktop). Mobile (≤700px) stretches edge-to-edge. Animation flipped from `y: +16 → 0` to `y: -16 → 0` so toasts now slide in from above the resting position. Same Framer-Motion `AnimatePresence` + spring transitions.

### Empty states for the two plan surfaces

The seeded starter plan was making both plan cards look "done" before the user had ever talked to Sprouty. Both surfaces now preempt the populated render and show an empty state until a real voice session generates a plan.

- **`PlanTimelineEmptyState` in [components/plan-timeline.tsx](components/plan-timeline.tsx).** Renders when no plan exists OR `triggerEvent === "starter_seed"`. Centered Sprout glyph on the paper-cream surface, "Talk to Sprouty to *generate your garden plan.*" headline, "Tap to talk" lime button (scrolls to top + sets `voiceState = "listening-inline"` via `useAppStore`), desktop-only "or hold K" hint. Replaces a previously-broken render path that crashed on plans with missing `weeks[i].tasks` / `shoppingList`.
- **`PlanCardEmptyState` in [components/plan-card.tsx](components/plan-card.tsx).** Mirror in the hero "This Week / Tend your garden" card. Same trigger condition (`!plan || triggerEvent === "starter_seed"`), but themed for the dark forest card surface: lime accents, Sprout glyph in a translucent lime tile, "No plan *yet.*" headline, secondary copy *"Tell Sprouty your space, time, and what you want to grow — and your first week of tasks lands here."* (intentionally echoes the three required inputs from the prompt rewrite). Same lime "Tap to talk" CTA + desktop K-hold hint as the timeline empty state, so the two surfaces feel like one design family.

### Schema-drift defensiveness in `useActivePlan`

- **[lib/plans.ts](lib/plans.ts)** normalizes plans on read. Early agent runs occasionally wrote plans without `weeks[i].tasks`, `weeks[i].index`, or top-level `shoppingList` — caused `TypeError: Cannot read properties of undefined (reading 'length')` in both [components/plan-card.tsx:43](components/plan-card.tsx#L43) and [components/plan-timeline.tsx:158](components/plan-timeline.tsx#L158). Fix coerces the missing fields to `[]` / `i+1` at the boundary so the rest of the component tree never sees a malformed plan.

### Hydration mismatch from browser extensions

- **`suppressHydrationWarning` on `<html>` in [app/layout.tsx](app/layout.tsx).** Phantom (and a handful of other wallet/recorder extensions) inject attributes like `data-scribe-recorder-ready="true"` into `<html>` before React hydrates, triggering a console hydration mismatch every refresh. Suppressed at the root element only — child components still warn normally.

---

## 2026-05-13, 5:55pm CST — Section reorder, toast persistence, agent thread-mode workaround, instructions doc

- **Plan now sits above Vision on the home page.** [app/page.tsx:38-42](app/page.tsx#L38-L42) swapped the `#plan` and `#vision` blocks; the on-page order is now hero → knowledge → plan → vision. Updated [components/top-bar.tsx:7-18](components/top-bar.tsx#L7-L18) to match — the topbar reads "My Garden · Knowledge · Plan · Vision" so left-to-right tracks scroll-down.
- **Toasts no longer auto-dismiss.** [components/toast-host.tsx:9-13](components/toast-host.tsx#L9-L13) set `ok` and `info` TTLs to `0` (matching `fail`). All three kinds now stay until the user clicks the X. The auto-dismiss timer in `ToastCard` already short-circuits when `ttl <= 0`, so no animation changes.
- **Agent IPC workaround for macOS Python 3.14.** [agent/agent.py:506-509](agent/agent.py#L506-L509) now passes `job_executor_type=JobExecutorType.THREAD` to `WorkerOptions`. The default `PROCESS` mode hangs on this combo — the spawned subprocess never returns its `InitializeResponse` within the 10s timeout (silent crash, exit code -30). Thread mode runs jobs in the same process and bypasses the spawn IPC path entirely. Symptom-level fix; root cause not yet identified.
- **New top-level [instructions.md](instructions.md).** Step-by-step "how to boot Sprouty locally" — `npm run dev` for the Next.js app, `python agent.py dev` for the LiveKit worker, plus venv setup, environment-variable checklist, and the two terminal windows you need to keep open.

---

## 2026-05-07, 1:15am CST — Vision board copy tweak

- Renamed the early-stage image-generation caption in [components/photo-vision.tsx:693](components/photo-vision.tsx#L693) from "Painting your garden…" to "Envisioning your garden…" — better fits the AI-mockup framing. Long-wait captions for GPT-Image are unchanged.

---

## 2026-05-07, 12:30am CST — Plan-aware agent, multi-session UX, KB tool tightening, voice-flow polish

A long iteration session aimed at turning Sprouty from a one-shot "pick crops, get a plan" interaction into a **conversational coach that knows your plan, tracks progress, and only re-mints when you actually change something.** Plus several small bugfixes shaken loose along the way.

### Voice agent: knowledge-base tool + plan awareness

- **Mid-conversation Qdrant lookups via [agent/qdrant_search.py](agent/qdrant_search.py).** New module that lazily builds an `AsyncQdrantClient` and an `AsyncOpenAI` (pointed at OpenRouter for embeddings). Embeds the user's question with `openai/text-embedding-3-small` (matching the ingest model), runs `query_points` against `sprout_kb`, and returns up to 3 hits formatted as `(Ch. 3 · "Soil prep" · p. 19) — green-thumb.pdf` for the LLM to paraphrase. Falls back gracefully when creds are missing or Qdrant errors. Logs `kb returned N hits for "..." with source_doc#pPAGE@SCORE` so each lookup is auditable.
- **`Sprouty(Agent)` subclass with `@function_tool search_knowledge_base`** in [agent/agent.py](agent/agent.py). Replaces the bare `Agent(...)` instantiation. The tool docstring tells the LLM exactly when to call it (factual gardening Q&A) vs when not to (chitchat, plan-structure questions). Added `qdrant-client>=1.10.0` to [agent/requirements.txt](agent/requirements.txt).
- **Plan snapshot in participant metadata: [lib/plan-summary.ts](lib/plan-summary.ts).** The Python agent has no access to IndexedDB, so the browser packs a compact `PlanSnapshot` (current week with full task list + status, next-week preview with first 3 tasks, completed-week count, total/done task counts, shopping list, version) into the LiveKit token's `metadata` field at mint time. [lib/livekit-room.ts:67-78](lib/livekit-room.ts#L67-L78) reads the active plan via Dexie and merges the snapshot alongside garden context.
- **Agent renders the snapshot into a structured English brief.** [agent/agent.py](agent/agent.py)'s `_format_plan_snapshot` produces a system message Sprouty can paraphrase: `Progress: 2/47 tasks done`, `This week (Week 1, 2026-05-03 → 2026-05-09): • [CURRENT] Soak bean seeds, sow tomorrow — cites Ch. 3, p. 19`, etc. Sprouty now answers "what's next this week?" / "how am I doing?" / "what's on my shopping list?" verbatim from the plan instead of hallucinating tasks.

### Returning-user mode: stop pretending every call needs a new plan

The old prompt always told Sprouty to "build the plan now" once enough info was gathered. That was wrong for returning users who already had a plan and just wanted to ask questions or make small tweaks. Now Sprouty operates in two modes, switched by whether a plan snapshot is present in metadata:

- **First-time mode (no plan):** unchanged — gather space/time/crops/region, hand off, plan generates.
- **Returning mode (plan present):** opener becomes *"Hey, welcome back. I've got your plan loaded — anything you want to adjust, or any questions about what you're working on?"* (vs the first-time *"Tell me about your space…"*). Sprouty defaults to a check-in posture, answers plan-state questions from the snapshot, and only commits to "I'll roll those into a new version" if the user actually mentions a change. No more "I'm generating your plan now" when one already exists.
- **Two openers in [agent/prompts/sprouty.md](agent/prompts/sprouty.md):** `## First-time opener` and `## Returning opener`. Agent's `_load_prompts()` returns both; `_participant_has_plan(metadata)` chooses at runtime.

### Skip-replan when nothing changed (server-side)

Followed the conversational change-detection through to plan generation:

- **[app/api/plan/route.ts](app/api/plan/route.ts)** accepts a new `hasExistingPlan: boolean` body field. Constraint extractor now also returns `needsReplan: boolean`, prompted: *"Set true ONLY when the user's words would change a garden plan: add/remove crops, change space, change available hours, change goals, or describe a problem requiring rescheduling. Set false for purely informational questions, story requests, or chitchat with no new constraints."*
- **Short-circuit in the route:** when `hasExistingPlan && !needsReplan`, emit `{ stage: "done", plan: null, skipped: true }` and skip the embed + Qdrant + plan-generation calls entirely. Saves ~5–15s on Q&A-only conversations.
- **Browser persistence path mirrors the skip:** `lib/plan-generation.ts`'s `persist()` no longer mints a new `PlanRecord` when `event.skipped` is true — just saves the session + merged garden context. Type updated: `plan: PlanRecord | null` and a new `skipped: boolean` flag on `PlanGenerationSuccess`.
- **Conditional toast UX in [components/voice-session-controller.tsx](components/voice-session-controller.tsx):**
  - No prior plan → "Generating your plan…" → "Plan ready" + auto-scroll. (As before.)
  - Plan exists, conversation was Q&A only (`skipped`) → quiet "Got it · Saved this chat. Your plan stays as-is." No loading toast.
  - Plan exists, real changes → "Plan updated" + auto-scroll.

### Knowledge-base retrieval fixes

- **Removed the difficulty-rating filter** from both [agent/qdrant_search.py](agent/qdrant_search.py) and [lib/qdrant.ts:236-244](lib/qdrant.ts#L236-L244)'s `discover()`. The ingest pipeline at [app/api/ingest/route.ts:148-155](app/api/ingest/route.ts#L148-L155) writes only `text / source_doc / chapter / chunk_type`, never `difficulty_rating`. Auto-applying `lte: 3` silently dropped every untagged chunk — both `/api/plan`'s retrieval and the agent's KB tool returned 0 hits before the fix. Callers can still pass `maxDifficulty` explicitly when they want the cap.
- **Prompt discipline rewrite in [agent/prompts/sprouty.md](agent/prompts/sprouty.md).** Sprouty was inventing answers when chunks didn't have them ("Maria the urban gardener in Chicago" — fabricated). New rules: use the tool **aggressively** for any factual question (including specific names/stories/examples); when the tool returns weak hits, say so instead of papering over them with general knowledge; **never invent** a name, quote, chapter, page, or story that isn't in the chunks. Result in the next test: KB tool fired on 5 of 5 factual questions vs only ~3 of 5 before.

### Vision generation: pull crops harder from the actual plan

- **Expanded [lib/crops.ts](lib/crops.ts)** `COMMON_HOME_CROPS` from 10 → 30 entries (added arugula, spinach, swiss chard, herbs, carrots, radishes, beets, onions, garlic, broccoli, peas, etc).
- **New `extractCropsByPattern`** picks up "X seeds / X seedlings / X starts / X bulbs / X cuttings / X tubers" via regex so dictionary-misses like *"okra seeds"* in a plan still influence the AI-generated vision board.
- **[lib/garden-context.ts](lib/garden-context.ts)** `extractCropsFromActivePlan` now reads the plan's **shopping list** in addition to task labels, then runs both extractors. End result: the photo-vision generator's `crops` payload reflects what the plan actually says they're growing.

### Voice-flow UI polish

- **Teleprompter-style transcript overlay** in both [components/voice-card.tsx](components/voice-card.tsx) (inline) and [components/listening-modal.tsx](components/listening-modal.tsx) (K-hold). Older words fade up and out via a `mask-image` linear gradient; latest words pin to the bottom. Fixed-height containers (168px / 144px) prevent long monologues from painting over the Sprout character, waveform, and primary action button. Font shrinks 22px → 18px on the inline overlay so ~6 lines fit before fading.
- **Watering-can drops now render in the K-hold modal.** [components/sprout-character.tsx](components/sprout-character.tsx) `WaterDrops` zIndex bumped 3 → 5 (above `SproutBody`'s 3) so drops aren't clipped behind the body when the character is rendered at smaller sizes. Modal sprout size also bumped 200 → 240 to match the design spec — gives drops room to fall.
- **"Stop & send" → "End call"** across [components/voice-card.tsx](components/voice-card.tsx) and [components/listening-modal.tsx](components/listening-modal.tsx) (button + subtitle reference). Phone-call metaphor matches the LiveKit/WebRTC reality and reads correctly under the multi-session model where some calls don't transmit a plan at all.
- **Brand cluster scrolls to top.** Clicking the Sprouty wordmark / glyph in [components/top-bar.tsx](components/top-bar.tsx) smooth-scrolls to `#hero` and resets the active tab pill to "My Garden".
- **Plan timeline headline updated** to *"From soil to harvest. This is your plan."* in [components/plan-timeline.tsx](components/plan-timeline.tsx) (both skeleton and loaded states), with the italic emphasis on "your plan" — matches the rest of the app's headline pattern.

### Bug fixes shaken loose this session

- **`Cannot read properties of undefined (reading 'length')`** in [app/api/plan/route.ts](app/api/plan/route.ts). The new `needsReplan` schema field caused Mistral Small to occasionally omit `crops` entirely on Q&A-only transcripts. Fix: defensive `if (!Array.isArray(constraints.crops)) constraints.crops = []` immediately after extraction.
- **`OpenRouter returned invalid JSON: ... Unterminated string in JSON at position 11344`** in [app/api/plan/route.ts:380](app/api/plan/route.ts#L380). The plan-generation `chatJson` call had `maxTokens: 4000`, which was routinely cutting off mid-week-7. Bumped to `8000` (≈30k chars of headroom for the full 12-week plan + shopping list).
- **`ModuleNotFoundError: qdrant_client`** in the agent — required `pip install -r agent/requirements.txt` after the new dep landed. Documented in the agent's setup flow.

### Doc + skill updates

- **CLAUDE.md** untouched this session — the audio-routing rewrite from the prior session still holds.
- **[agent/.env.example](agent/.env.example)** — `QDRANT_URL` / `QDRANT_API_KEY` promoted from "currently unused" to "required for the agent's mid-conversation knowledge-base tool". Tool reports "knowledge base not configured" when missing.

---

## 2026-05-06, 7:30pm CST — Voice agent live, end-to-end Mistral stack, hackathon-compliance pass

The longest single-session change yet — got Sprouty actually talking, fixed the AI-routing assumption baked into CLAUDE.md, and stripped out the typed-input affordances before submission day.

### Voice agent now works end-to-end (3 Mistral products in the critical path)

- **`livekit-agents` 1.x rewrite of [agent/agent.py](agent/agent.py).** The 0.x `VoiceAssistant` class was retired; the 1.x API splits into `Agent` (declarative — instructions + chat_ctx + tools) and `AgentSession` (runtime — STT/LLM/TTS/VAD wiring + event hooks). Old `user_speech_committed` / `agent_speech_committed` events became `user_input_transcribed` (with `is_final` flag) / `conversation_item_added` (filtered to `role == "assistant"`). Browser-side data-channel contract (`user_transcript` / `agent_transcript` / `session_end` on topic `sprouty`) unchanged.
- **Audio routing reality.** OpenRouter is a chat-completion proxy and *does not host audio APIs* — `mistralai/voxtral-mini-realtime` and `mistralai/voxtral-mini-tts` simply don't exist in their catalog (you get `Invalid model` 400s). CLAUDE.md's "all AI through OpenRouter" rule was aspirational. Updated the doc to reflect the real shape: STT goes direct to `https://api.mistral.ai/v1`, TTS goes direct to Mistral's TTS endpoint via a custom plugin, LLM still rides OpenRouter.
- **Custom Voxtral TTS plugin: [agent/voxtral_tts.py](agent/voxtral_tts.py).** Mistral's TTS isn't OpenAI-compatible (uses `voice_id` instead of `voice`, returns base64-wrapped JSON instead of raw audio bytes), so `livekit-plugins-openai`'s `TTS` class can't talk to it via base-URL override. The new `VoxtralTTS` subclasses `livekit.agents.tts.TTS`, POSTs to `/audio/speech`, base64-decodes the response, and pushes audio frames into the LiveKit emitter. Includes a CLI helper: `python -m agent.voxtral_tts list-voices` prints every preset voice slug on the account.
- **Prompts moved to [agent/prompts/sprouty.md](agent/prompts/sprouty.md).** Single source of truth for the system prompt + opener — edit the markdown, restart the worker, no Python edits. `_load_prompts()` parses `## System prompt` and `## Opener` sections.
- **Default models pinned to dated builds.** OpenRouter retired the bare `mistralai/mistral-small` slug; updated [lib/models.ts](lib/models.ts) `Models.LLM` to `mistralai/mistral-small-2603` (newest dated build). Removed dead `STT` and `TTS` constants from `Models` since neither is reachable via OpenRouter anymore — left a comment block explaining the audio-routing split so a future contributor doesn't try to put them back.
- **Mistral stack: 3 of 3 products in the critical path.** Voxtral STT (`voxtral-mini-2507`) + Mistral Small LLM (`mistralai/mistral-small-2603` via OpenRouter) + Voxtral TTS (`voxtral-mini-tts-2603` via the custom plugin). Default voice is `en_paul_happy` to match Sprouty's warm-friend persona.

### Browser ↔ agent flow polish

- **"Generating your plan…" / "Plan ready" toasts.** [components/voice-session-controller.tsx](components/voice-session-controller.tsx) fires an info toast on disconnect and dismisses it on success/failure — covers the 5-10s gap between modal close and PlanTimeline live-update so the user knows something's happening.
- **Auto-scroll to plan timeline on plan-ready.** Two-frame `requestAnimationFrame` deferral so the live-queried plan has rendered before we `scrollIntoView` to `#plan` — without it, we'd aim at the old (skeleton) layout and miss the position by a few hundred pixels.
- **Persistent error toasts.** `fail` toasts now default to `ttl=0` (no auto-dismiss) so the user can read, screenshot, or copy the error before it disappears. Added `overflow-wrap: anywhere` on the toast title + body so long unbreakable strings (Turbopack-mangled identifiers, URLs) wrap inside the 320px box instead of spilling out.

### Bug fixes shaken loose by getting voice working

- **Plan generation 404 from `mistralai/mistral-small` deprecation.** Updated `Models.LLM` (above) — the route uses this constant for both constraint extraction and plan generation passes.
- **Server-route import of a `"use client"` constant.** `app/api/plan/route.ts` was importing `COMMON_HOME_CROPS` from `lib/garden-context.ts` (which has `"use client"` for its Dexie usage). Turbopack wraps client-marked exports when imported server-side, breaking `.join()` on the array (`COMMON_HOME_CROPS.join is not a function`). Extracted the pure-data constants into a new server-neutral [lib/crops.ts](lib/crops.ts) — `garden-context.ts` re-exports them for client callers, the route imports directly from `crops.ts`.

### Per-plan export

- **Download button on the Plan card.** Single click writes `sprouty-plan-v{N}-{YYYY-MM-DD}.json` + `.md` to `~/Downloads`. New [lib/plan-export.ts](lib/plan-export.ts) holds the pure formatters (`planToJson`, `planToMarkdown`, `planFilenameStem`); the click handler in [components/plan-card.tsx](components/plan-card.tsx) triggers two `<a download>` clicks. Storage model unchanged — IndexedDB stays the source of truth, this is on-demand export for backup/sharing/inspection.

### Hackathon-compliance pass — typed-input removed entirely

- **Removed the test-plan modal and every affordance that opened it.** The "or type a description to test the plan →" link in `VoiceCard` and the "Sample · Try yours →" pill on `PlanCard` both opened a textarea modal where the user typed and got a plan back — exactly the chatbot-style input the "Think Outside the Bot" rule explicitly disallows. Deleted [components/test-plan-modal.tsx](), the `testPlanModalOpen` / `setTestPlanModalOpen` store fields, and the `<TestPlanModal />` mount in [app/page.tsx](app/page.tsx). Voice (Tap / Hold-K / long-press) is now the *only* path to plan generation. The submission is unambiguously voice-in / structured-artifact-out.

### Setup / docs

- **Python venv at the project root.** `.venv/` shipped via `python3 -m venv` with `livekit-agents 1.5.8`, `livekit-plugins-openai`, `livekit-plugins-silero` (now backed by `onnxruntime` instead of PyTorch — Python 3.14 wheels available, no torch-build pain).
- **[agent/.env.example](agent/.env.example) rewritten** to reflect the all-Mistral audio + OpenRouter LLM split. Required keys: `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `LIVEKIT_*`. No more `OPENAI_API_KEY` for TTS — Voxtral TTS handles it.
- **[CLAUDE.md](CLAUDE.md) updated** to match the audio-routing reality. The "all AI through OpenRouter" rule is now "chat/embed/image through OpenRouter; audio direct to vendors". Mistral sponsor narrative still 3-of-3 products.

---

## 2026-05-07, 8:30am CST — Fix Qdrant 400 on PDF ingest (chunk IDs must be UUIDs)

- Qdrant only accepts unsigned 64-bit ints or RFC-4122 UUIDs as point IDs; the previous `<source_doc>:<chunk_index>` strings were rejected with HTTP 400 the moment we hit `PUT /collections/sprout_kb/points`. Collection creation, payload-index creation, and embedding all succeeded — the upsert was the failing step.
- [lib/qdrant.ts](lib/qdrant.ts) `chunkId()` now hashes the `<source_doc>:<index>` natural key with SHA-256, patches the version (5) and RFC-4122 variant bits in-place, and emits a deterministic UUIDv5-shaped string. Re-ingesting the same file still overwrites the same point IDs (idempotent), but the wire format is now valid.
- Server-only — `node:crypto` is fine because `lib/qdrant.ts` is only imported by API routes (`app/api/ingest/route.ts`, `app/api/plan/route.ts`).

---

## 2026-05-07, 4:00am CST — Plan citations, 12-week timeline, shimmer placeholders

Three demo-visible additions, all read-only and no-keys-required:

- **Plan citations rendered prominently.** [components/plan-card.tsx](components/plan-card.tsx) `TaskRow` now shows `Source · Ch. 3, p. 19` as a faint mono caption beneath every cited task, regardless of completion state. New `Citation` sub-component handles the three tone variants (default green, on-lime forest, muted-for-done). Footer line swapped from a single-task callout to "N/M tasks cite the knowledge base" so the Qdrant story shows up at a glance.

- **12-week timeline view.** New [components/plan-timeline.tsx](components/plan-timeline.tsx) renders the full plan as a vertical timeline: forest dot for the current week, filled lime dot for past weeks, hollow ring for upcoming, all on a single gradient rail. Each week card shows date range + status badge (This week / Complete / Upcoming) + interactive task list with citation lines. Auto-scrolls to the current week the first time the timeline mounts so the user lands where the action is. Mounted between Knowledge and Vision in [app/page.tsx](app/page.tsx); the `Plan` tab in [top-bar.tsx](components/top-bar.tsx) now anchors to `#plan` instead of the vision section. Frame-by-frame whileInView stagger via `framer-motion`, with a `useReducedMotion()` short-circuit.

- **Shimmer placeholders.** New `.shimmer` and `.shimmer-dark` utility classes in [app/globals.css](app/globals.css) — moving lime sheen on either a paper-warm or dim-forest base, scoped via class so any rectangle can opt in. Reduced-motion drops the sweep animation but keeps the static gradient.
  - `PhotoVision` After tile in busy state swaps the green vegetable pattern for a `.shimmer-dark` canvas, so a long GPT-Image run reads as "the image is materializing" instead of "the green tile is hung".
  - [PlanCardSkeleton](components/plan-card.tsx) and [PlanTimelineSkeleton](components/plan-timeline.tsx) replace the plain `animate-pulse` boxes with shimmer rectangles.
  - [FileThumb](components/knowledge-base.tsx) overlays a faint `.shimmer-dark` ring on the file's type chip while ingest is in flight, reinforcing the live progress bar without adding a second spinner.

---

## 2026-05-07, 3:10am CST — Sticky listening modal + clear-vision affordance

Two bug-driven fixes:

- **Sticky listening modal.** Both the K-hold path and the touch long-press were firing a click on the modal backdrop the instant the user released, which dismissed the modal before LiveKit could even mint a token. Two sides of the same bug:
  - [components/keyboard-listener.tsx](components/keyboard-listener.tsx) — releasing K no longer auto-closes the modal. It opens at 200ms hold and stays until the user explicitly dismisses (Escape, backdrop, or the new in-modal Stop button).
  - [components/voice-card.tsx](components/voice-card.tsx) — when the long-press fires, we install a one-shot capture-phase document `click` swallower that eats the synthesized release-click, so a touch hold can't accidentally dismiss the modal during the same gesture that opened it.
  - [components/listening-modal.tsx](components/listening-modal.tsx) — added an explicit "Stop & send" button (Square icon, forest pill) next to the Voxtral status, plus a faint "or press Esc" hint. Hero copy swapped from "Hold K to keep talking. Release when you're done." to "Talk for as long as you need. Hit Stop when you're done."

- **Clear-vision affordance.** The After tile in [components/photo-vision.tsx](components/photo-vision.tsx) gained a third hover icon (terracotta X) next to the eye + download buttons. Clicking it opens an in-container confirmation overlay (backdrop blur + scale-in card, `Cancel` / `Yes, clear` buttons). Confirming deletes the Dexie `visions` record, revokes the blob URL, and resets the After tile to its empty placeholder. Toast confirms either outcome.

---

## 2026-05-07, 2:30am CST — Polish pass: toasts, empty states, garden-context vision, camera capture, long-press, deviceId, ZIP markdown

Seven follow-ups from the punch list landed in one pass. None of them require new keys or external services — everything is purely additive.

- **Toast system** — [lib/toast.ts](lib/toast.ts) (zustand store + `toast.ok / .fail / .info` facade) and [components/toast-host.tsx](components/toast-host.tsx) (bottom-right host with framer-motion AnimatePresence; mobile docks to viewport bottom). Mounted at the page root. Wired at the natural call sites: settings save / test buttons, vision generation success+failure, ZIP export+import.
- **Empty states** — [components/plan-card.tsx](components/plan-card.tsx) now shows a "Sample · Try yours →" pill in the eyebrow when `plan.triggerEvent === "starter_seed"` (clicks open the test-plan modal). [components/knowledge-base.tsx](components/knowledge-base.tsx) gained a friendlier "drop a gardening eBook…" copy and an icon tile in the empty FilesList state.
- **Vision prompt → garden context** — [lib/vision.ts](lib/vision.ts) now reads the full `GardenContext` (space, region, hours, goals) alongside the resolved crops and forwards each as a form field. [app/api/vision/route.ts](app/api/vision/route.ts) parses them; [lib/vision-prompt.ts](lib/vision-prompt.ts) folds them into a "User's garden context" block with care-budget density rules — low / moderate / lush — so the render matches the user's commitment.
- **ZIP markdown report** — [lib/portable.ts](lib/portable.ts) adds `buildMarkdownReport()`. Every export now bundles a `README.md` at the ZIP root summarizing garden context, every plan version (active full + previous compact), all generated visions (with relative `visions/<id>.png` paths so they preview when the ZIP is unpacked), the knowledge-base inventory as a Markdown table, and the most recent 30 voice sessions with transcripts. Raw JSON files are unchanged.
- **Native camera capture** — [components/photo-vision.tsx](components/photo-vision.tsx) Before tile passes `capture="environment"` through `getInputProps()`. iOS / Android browsers launch the rear camera straight from the file picker; desktops ignore it.
- **Long-press → modal listening** — [components/voice-card.tsx](components/voice-card.tsx) adds 500ms `pointerdown` → `setVoiceState("listening-modal")` plumbing on both the Sprout character and the "Tap to talk" button, with a click-swallow ref so the release after a long-press doesn't accidentally also pop inline listening. Mirrors the desktop K-hold behavior on touch devices.
- **Persistent deviceId** — [lib/device.ts](lib/device.ts) `getOrCreateDeviceId()` reads/writes `sprouty.device_id` in localStorage with a private-mode fallback to a per-pageview UUID. [lib/livekit-room.ts](lib/livekit-room.ts) now sends that id as the LiveKit `identity`, so returning callers keep a stable handle and the agent's "amnesia-free" continuity actually holds across reloads.
- **Settings polish** — [components/settings-keys.tsx](components/settings-keys.tsx) input fields, Test, and Save buttons are all now uniform `h-11` (44px) so the row aligns; the eye reveal button is `h-9 w-9` inside the input. The old inline `flashStatus` mechanism in `PortabilityFooter` is replaced by toast notifications.

---

## 2026-05-07, 1:15am CST — Vision lightbox: single-image carousel

Reworked the Before/After modal preview from a side-by-side panel to a single-image carousel. Opens on the After slide (matching the tile the user clicked), flips back to Before via on-screen chevrons or `←/→` arrow keys. Modal body capped at 80vw × 80vh so the page edges stay visible. Image uses `object-contain` so we don't crop tall reference photos.

- [components/photo-vision.tsx](components/photo-vision.tsx) — replaced grid layout in `BeforeAfterLightbox` with a slide list (Before + After if present), index state, prev/next handlers, ArrowLeft/ArrowRight key bindings, and a label footer that shows a `1 / 2` indicator when there are multiple slides. `LightboxPanel` removed; a single `motion.img` with key-based `AnimatePresence` handles the cross-fade.

---

## 2026-05-07, 12:00am CST — OpenRouter observability webhook → trigger.dev

Every OpenRouter generation can now post a structured event to a Sprouty-hosted webhook that fans out to a trigger.dev task. The task classifies the event into `ok` / `slow` / `error`, logs the structured fields at the matching log level, and the trigger.dev dashboard becomes the single triage surface (filterable by severity and by model). Full end-to-end is wired; `shouldAlert` is returned so a real alerter (Slack / email / Resend) drops in trivially.

- [trigger.config.ts](trigger.config.ts) — new. Project ref read from `TRIGGER_PROJECT_ID`, tasks live in `trigger/`, max duration capped at 60s for webhook tasks (no reason a classification + log should ever run longer).
- [trigger/openrouter-webhook.ts](trigger/openrouter-webhook.ts) — new task `openrouter-webhook`. Typed `OpenRouterWebhookPayload` matches the real generation-log shape; `classify()` returns one of three severities with a short reason, `error` taking precedence over `slow`. Slow threshold is 60s of total latency (separates the expected ~6s Gemini runs from "something's wrong"). Returns `{ severity, reason, model, shouldAlert }` for downstream alerters.
- [app/api/webhooks/openrouter/route.ts](app/api/webhooks/openrouter/route.ts) — new public webhook receiver. Reads raw body, optional shared-secret check via `OPENROUTER_WEBHOOK_SECRET` (silent door in dev, loud-warn in prod when unset), enqueues the trigger.dev task, returns 200 immediately so OpenRouter doesn't retry on slow round-trips. If trigger.dev is misconfigured the route still 200s — observability is best-effort, not a hard dependency.
- [docs/observability.md](docs/observability.md) — full setup walk-through. Architecture diagram, env var checklist, OpenRouter dashboard config steps, severity-tag table with examples, cost ceiling estimates per operation (one ingest = 200-300 webhooks!), the cheap "turn it off in the OR dashboard" escape hatch and the real "swap URL to n8n" escape hatch.

### How to start using it

1. Drop a `OPENROUTER_WEBHOOK_SECRET=...` random string into `.env.local`.
2. `npx trigger.dev@latest dev` (or `deploy`) to register the task.
3. Paste `https://YOUR_DOMAIN/api/webhooks/openrouter` into OpenRouter Settings → Observability with the matching secret.
4. Trigger any generation. New runs land in the trigger.dev dashboard within seconds, tagged with `severity` and `model`.

### Cost ceiling (the catch we already discussed)

Every webhook = 1 trigger.dev task run. Free tier is 25k/month. Heavy paths: knowledge-base ingest (200-300 webhooks per 60-page PDF), Phase 5 voice sessions (dozens-to-hundreds per turn-y conversation). If/when 25k becomes the ceiling, swap the URL on OpenRouter to n8n — no Sprouty code changes needed.

---

## 2026-05-06, 11:30pm CST — Vision-gen timeout fix + 2000² output cap

GPT-Image (5.4) generations were hanging the spinner forever. OpenRouter's gen log showed the actual cause: a successful 206-second image generation was getting cut off by the route's implicit fetch timeout, so the browser never saw the response even though the user was billed for the run. Three bundled fixes plus a size cap.

- [app/api/vision/route.ts](app/api/vision/route.ts)
  - Wrapped the OpenRouter `fetch` in an `AbortController` with a 300s timeout (was effectively unbounded → silently capped by infrastructure). On abort, the route returns a 504 with a clear "OpenRouter timed out after 300s — model may be slow, unavailable, or the slug may be wrong" message instead of stalling.
  - Added `export const maxDuration = 300;` so Vercel doesn't kill the function before the 300s upstream window closes.
  - New `describePayloadShape()` helper feeds a structured summary into the "no image found" error band — the user sees exactly whether the model returned text only, refused, or returned media in a shape the parser doesn't recognize.
  - Pass-through params for OpenAI gpt-image-2: `size: "2048x2048"` (closest standard preset to the "≤ 2000 × 2000" guideline) and `quality: "medium"` so generations land inside the 300s budget instead of running 3-5 minutes at "high".
- [lib/vision-prompt.ts](lib/vision-prompt.ts) — system prompt now specifies "up to 2000 × 2000 pixels (1:1 square aspect ratio). Do not exceed 2000 × 2000." Gemini Nano Banana 2 doesn't accept a `size` param via chat completions, so the prompt hint is its only size signal; OpenAI gets both the prompt and the request-body param.
- [components/photo-vision.tsx](components/photo-vision.tsx)
  - New `busyCaptionFor(engine, elapsedSeconds)` swaps the spinner caption progressively: "Painting your garden…" for the first 30s, then engine-aware reassurance ("GPT-Image is slow but worth it (30-90s)" → "GPT-Image runs can hit 3 minutes for high-detail scenes" → "Almost there · we hold the connection open up to 5 minutes"). For Gemini, anything past 30s flags as "taking longer than usual."
  - `useEffect` ticks elapsed seconds at 1Hz while `busy === true`, resets to zero when busy flips off.

Now: drop a photo, hit Generate. Gemini still returns in ~6-8 seconds. GPT-Image at 2048² medium quality lands in ~60-120 seconds with the new caption keeping the user oriented through the wait. The 206-second hangs are gone.

---

## 2026-05-06, 10:55pm CST — Before/After lightbox replaces single-image photo-view

Clicking the After tile (or the floating eye icon) now opens a side-by-side lightbox showing both the user's "before" photo and the generated "after" with explicit labels underneath. Also fixes a Turbopack runtime error introduced mid-edit when the `react-photo-view` import was removed before its consumers were swapped over.

- [components/photo-vision.tsx](components/photo-vision.tsx) — replaced `<PhotoProvider>` / `<PhotoView>` with a custom `BeforeAfterLightbox` component built on `framer-motion` AnimatePresence. Shows both panels in a `md:grid-cols-2` layout with a label band underneath each (`BEFORE` / `AFTER`, Inter Tight bold, uppercase tracking). When the user generated without uploading a "before" (txt2img path), the After panel collapses to a centered single column. Backdrop click and Escape both dismiss; close button floats top-right of the framed content.
- Lightbox state (`lightboxOpen`) lives on `PhotoVision` and is passed into `AfterFrame` via an `onPreview` callback so both the Eye icon and the image itself open the same modal.
- Removed `react-photo-view` imports + the now-unused CSS side-effect import from this component.

---

## 2026-05-06, 10:30pm CST — Phase 5 voice flow scaffolded + repo packaged for distribution

Three substantial pieces in one go: the Python voice agent skeleton, the browser-side LiveKit lifecycle that talks to it, and the LICENSE / CONTRIBUTING / README polish that gets the repo into "judges can clone it" shape.

### Python voice agent

- [agent/agent.py](agent/agent.py) — entrypoint using `livekit-agents` 0.11+ + `livekit-plugins-openai` (pointed at OpenRouter as the base URL) + `livekit-plugins-silero` for VAD. Mistral sponsor stack: `mistralai/voxtral-mini-realtime` for STT, `mistralai/mistral-small` for LLM, `mistralai/voxtral-mini-tts` for TTS. End-of-turn endpointing set to 1.5s per the CLAUDE.md spec. System prompt scopes Sprouty to short conversational turns; an `_inject_metadata_context()` helper reads the participant's `metadata` blob (browser packs the current `GardenContext` into it at token-mint time) and lays prior crop / space / goal facts in as a second system message so the agent isn't amnesiac across sessions.
- Mirrors three event types onto a `topic: "sprouty"` data channel so the browser can drive UI from real signals: `user_transcript` per committed user turn, `agent_transcript` per agent reply, `session_end` with the full transcript when the user disconnects.
- [agent/requirements.txt](agent/requirements.txt) — pinned minimum-known-good versions of livekit-agents / livekit-plugins-openai / livekit-plugins-silero / python-dotenv.
- [agent/README.md](agent/README.md) — local dev workflow + LiveKit Cloud deploy commands + the data-channel event contract.

### Browser ↔ agent wiring

- [lib/livekit-room.ts](lib/livekit-room.ts) — `startLiveSession()` mints a token via `/api/livekit/token` (packing the user's saved garden context into the participant metadata so the agent gets it server-side), connects via `livekit-client`, publishes the mic, attaches the agent's audio reply to a hidden `<audio>` element, and wires `RoomEvent.DataReceived` → typed handlers for the three Sprouty event topics. Returns a `LiveSessionHandle` with an `endPromise` that resolves on `session_end` (or room disconnect, whichever fires first). `finalizeSessionWithPlan()` is the convenience wrapper that hands the captured transcript to `generatePlan()`.
- [components/voice-session-controller.tsx](components/voice-session-controller.tsx) — headless component mounted at the page root next to `<KeyboardListener />`. Watches `voiceState`: when it goes from idle → listening-*, it kicks off `startLiveSession()` and pipes user transcripts into `useAppStore.appendLiveTranscript()` so the existing inline + modal transcript surfaces (already wired to that store value) show real text instead of the placeholder. When it goes back to idle, the room disconnects cleanly. On session end with a non-empty transcript, `generatePlan()` runs as a background task and the Today tile rerenders.
- [app/page.tsx](app/page.tsx) — mounted `<VoiceSessionController />` alongside `<KeyboardListener />`, `<ListeningModal />`, and `<TestPlanModal />` in the above-the-blur layer.

### Packaging for public distribution

- [LICENSE](LICENSE) — MIT, with a tail note that carves out third-party assets in `knowledge/` (gardening PDFs reproduced under their original licenses for the hackathon demo) and `public/logos/` (brand wordmarks used under nominative fair use).
- [CONTRIBUTING.md](CONTRIBUTING.md) — leads with a "Run it in 60 seconds" path written for reviewers (clone, install, drop the bundled PDF, either type-test or fire up the Python agent for full voice). Followed by contributor conventions: no `any` in new code, all AI through OpenRouter, no server-side user storage, the LiveKit-creds-as-deployment-secrets carve-out, and what's intentionally out of scope.
- [README.md](README.md) — added a "For judges and reviewers" subsection pointing at the new CONTRIBUTING quickstart, and replaced the `LICENSE _TBA_` placeholder with a real link.

### Try it now

In `.env.local`:
```
LIVEKIT_API_KEY=APIxxxxx
LIVEKIT_API_SECRET=secretxxxxx
LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

Two terminals:
```bash
# terminal 1 (Next.js)
npm run dev

# terminal 2 (voice agent)
cd agent && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # paste real keys
python agent.py dev
```

Tap "Tap to talk" in the browser. The mic publishes, the agent picks up the room, you hold a 30-second conversation, and when you click "Stop & send" the captured transcript drives `generatePlan()` which rerenders the Today tile with a freshly-versioned plan.

---

## 2026-05-06, 9:50pm CST — Nav rename + LiveKit token route + working LiveKit Test button

Two foundational pieces. The nav now reads "My Garden" instead of the generic "Today" so the first tab actually describes what's there, and the LiveKit voice path has its server-side scaffolding — token minting + a credential-validating Test button — so the next chunk of voice work is a wire-it-up exercise rather than a build-from-scratch one.

### Nav rename

- [components/top-bar.tsx](components/top-bar.tsx) — `TABS` and `TAB_TARGETS` updated; the "My Garden" pill scrolls to the `#hero` section (same anchor as before).
- [lib/store.ts](lib/store.ts) — `ActiveTab` type union and the default `activeTab` value swapped over.

### LiveKit token + test routes

- [app/api/livekit/token/route.ts](app/api/livekit/token/route.ts) — new POST handler. Mints a join token via `livekit-server-sdk`'s `AccessToken`, reads `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` from env (server-only by design — putting these on the client would let anyone mint tokens for any room). Optional body fields: `roomName`, `identity`, `name`, `metadata`, `ttlSeconds` (clamped 60-3600s, default 600). Grants `roomJoin + canPublish + canSubscribe + canPublishData` so the agent can both hear and respond. Returns `{ ok, token, identity, roomName, wsUrl }` ready to feed straight into `livekit-client`.
- [app/api/livekit/test/route.ts](app/api/livekit/test/route.ts) — new GET handler proxying the Settings-panel Test button. Calls `RoomServiceClient.listRooms()` against the configured cluster URL — that's a real round-trip that exercises the credentials end-to-end, not just JWT signing. Returns `{ ok: true, message: "Authenticated · cluster reports N active rooms" }` or a structured failure with the upstream error.
- [lib/test-keys.ts](lib/test-keys.ts) — `testLiveKit()` proxies through `/api/livekit/test`; signature stays `(_keyArg?: string)` for parity with the other testers even though the value is ignored.
- [components/settings-keys.tsx](components/settings-keys.tsx) — switch dispatch now has a `case "livekit"`. New `requiresLocalValue` flag treats LiveKit as the one credential where the local input field is informational (server-side env vars are the source of truth); the Test button stays enabled even with an empty input, the rest of the cards still gate on `value` like before.

### Env vars to set in `.env.local`
```
LIVEKIT_API_KEY=APIxxxxx
LIVEKIT_API_SECRET=secretxxxxx
LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud   # client uses this to connect after mint
```

The Python voice agent (Phase 5 follow-up) is the next concrete piece — it sits in the LiveKit room, runs Voxtral STT, hands transcripts to `generatePlan()`, and pipes the TTS summary back over the live channel.

---

## 2026-05-06, 9:30pm CST — "Try a typed plan" modal so the pipeline is demo-able without voice

The plan-generation pipeline that landed earlier today was reachable only from a `generatePlan()` import. There's now a real UI that drives it — a modal with a textarea, three sample-prompt chips, live progress band, and a result summary. Hit it from a small subtle link inside the VoiceCard ("or type a description to test the plan →"); judges can see Sprouty extract constraints, query Qdrant, and produce a real plan without LiveKit being live yet.

- [components/test-plan-modal.tsx](components/test-plan-modal.tsx) — new component. AnimatePresence + scale-from-0.94 entrance matching the listening modal. Three sample transcripts pre-loaded as one-tap chips so reviewers don't have to invent input. Calls `generatePlan()` with `intent: "initial_planning"` and pipes each NDJSON event into a `ProgressBand` (lime gradient + percentage). On success, a `ResultBand` summarizes "12 weeks · N tasks · M shopping items · K citations from your knowledge base"; the underlying transaction has already written the new plan to Dexie so the Today tile reflects it the moment the modal closes.
- [components/voice-card.tsx](components/voice-card.tsx) — added a small `setTestPlanModalOpen` selector and a subtle text link (Inter 12px, ink-muted) below the existing voice CTA row. Stays out of the way of the primary voice flow but discoverable.
- [components/test-plan-modal.tsx](components/test-plan-modal.tsx) toggles `body.modal-open` on mount/unmount, same trick as the listening modal, so the page behind blurs.
- [lib/store.ts](lib/store.ts) — added `testPlanModalOpen` + `setTestPlanModalOpen` to the zustand store so the trigger (in VoiceCard) and the modal (mounted at the page root, above the blur) share state.
- [app/page.tsx](app/page.tsx) — mounted `<TestPlanModal />` next to `<ListeningModal />` in the above-the-blur layer.

Workflow: paste a transcript (or pick a sample), hit Generate. The modal renders the live progress, then the success summary. Close the modal — the Today tile already shows the new plan because `generatePlan()` writes through to IndexedDB inside a transaction. Same code path the LiveKit voice agent will hit when Phase 5 lands.

---

## 2026-05-05, 9:15pm CST — Phase 6: real plan generation end-to-end

The Plan tile no longer renders a static seeded plan. There's now a working pipeline that takes a typed transcript, extracts user constraints with Mistral, queries the user's Qdrant knowledge base with the Discovery API, and asks Mistral to compose a citable 12-week plan. Sessions, plans, and the garden-context row all persist in IndexedDB via a single transaction.

### Server route

- [app/api/plan/route.ts](app/api/plan/route.ts) — new POST handler. Accepts `{ transcript, intent? }` JSON, reads BYOK creds from `x-openrouter-key` / `x-qdrant-url` / `x-qdrant-key` (env fallback for dev). Streams NDJSON progress in three stages:
  1. **extracting** — `chatJson` against `mistralai/mistral-small` with a strict JSON schema hint and the canonical `COMMON_HOME_CROPS` dictionary; returns `{ crops, spaceDescription, hoursPerWeek, goals, region, intent }`. Temperature 0.1 — we want determinism here.
  2. **retrieving** — embeds a positive ("growing X, in Y space, Z hrs/week") and a negative ("advanced commercial techniques, greenhouse-only, expert plant care") via `text-embedding-3-small`, then `discover()` on `sprout_kb` with the crop filter. If filtered Discovery returns zero hits (early-stage KB), automatically retries unfiltered so the plan-gen step always has *something* to ground on.
  3. **generating** — Mistral Small (temp 0.3, 4000 tokens) gets the transcript, extracted constraints, the exact week start/end dates for the upcoming 12 weeks, and the retrieved chunks formatted as a citable source block (`[chunk N] id=… (Ch. X · Section · p. Y)`). Returns strict JSON: 12 weeks × 3-5 tasks each, week 1 first task marked `current` and the rest `pending`, source citations on tasks where the action is grounded in a chunk, plus a 4-8 item shopping list.
- Final `done` event ships `{ constraints, plan, sources }` so the client can persist + render without another round trip.

### Client orchestrator

- [lib/plan-generation.ts](lib/plan-generation.ts) — `generatePlan({ transcript, intent, onProgress })`. Pulls saved BYOK keys via `loadAllKeys()`, posts to `/api/plan`, consumes the NDJSON stream calling `onProgress` for each line, and on `done` runs a single Dexie `transaction("rw", ...)` that writes:
  - **SessionRecord** — transcript, generated short summary, extracted constraints, intent.
  - **PlanRecord** — version = previous max + 1, `parentVersion` set, `triggerEvent` derived from intent (`weekly_checkin` / `problem_report` / `voice_session`). Always a fresh row, never an overwrite.
  - **GardenContext** — merged with the existing record. Crops dedupe case-insensitively across sessions so they accumulate over time instead of getting clobbered. Markdown projection regenerated to match the new JSON.

### How to test today

OpenRouter + Qdrant keys are wired (env or Settings), and at least one document needs to be ingested into `sprout_kb`. From any client module (or the browser console after importing):

```ts
import { generatePlan } from "@/lib/plan-generation";

const r = await generatePlan({
  transcript: "I have a sunny back patio, maybe two hours a week, and I really want vegetables I can use in salads",
  intent: "initial_planning",
  onProgress: (e) => console.log(e),
});
// r.plan, r.session, r.context, r.sources
```

Once the LiveKit voice agent (Phase 5) lands, it'll call `generatePlan()` with the live transcript instead of a typed string — same persistence path. Until then a small in-app "Try a test plan" button is the next concrete UI follow-up.

---

## 2026-05-05, 8:45pm CST — Garden context + v3 vision prompt

The vision route no longer ships with a hardcoded crop list and a vague style prompt. Crops now flow from a persistent garden-context record, and the prompt itself bakes in the four directional choices Cory locked in: pristine vibe, match-the-before-photo geometry AND lighting, dynamic crop list, no-reference fallback to a curated default scene.

- [lib/garden-context.ts](lib/garden-context.ts) — new module wrapping the existing Dexie `context` table. `loadGardenContext` / `saveGardenContext` / `setCrops` for reads & writes; `resolveCropList()` returns crops from (1) the saved context, (2) crops mentioned in the active plan's task labels matched against `COMMON_HOME_CROPS`, or (3) a random 5-of-10 from the common list as a last-resort fallback. Markdown projection is regenerated on every save so the Dexie row's `markdown` field stays in lock-step with `json`.
- [lib/vision-prompt.ts](lib/vision-prompt.ts) — new server-side module. `buildVisionPrompt({ crops, hasReferencePhoto, extraContext })` returns the `{system, user}` strings the route assembles into OpenRouter's chat-completions payload. System prompt is the v3 photorealistic-iPhone-photo style with hard negative constraints (no HDR, no cartoon, no text overlays, no people). Reference-photo branch issues an architectural-blueprint instruction set with a strong "match the lighting and time of day, do not improve it" clause.
- [app/api/vision/route.ts](app/api/vision/route.ts) — accepts a new `crops` form field (comma-separated), drops the inline `SYSTEM_PROMPT` constant, calls `buildVisionPrompt`, and `assembleMessages()` glues the result onto the optional reference-image into OpenRouter's payload.
- [lib/vision.ts](lib/vision.ts) — client helper now calls `resolveCropList()` before the request, attaches the resolved crops to the form, and returns `cropsUsed: { crops, source }` in the success payload so the UI can later surface "generated using your saved crops" / "default crops — talk to Sprouty to personalize" hints.

The garden-context module is also the foundation for Phase 5/6: the LiveKit voice agent will write extracted constraints (crops, space description, hours/week, goals, region) here after every session, and every LLM surface (vision, plan generation, weekly nudges) reads from it for amnesia-free continuity.

---

## 2026-05-05, 8:20pm CST — Vision lightbox + download icons

The After tile now has a full-screen lightbox (via the already-installed `react-photo-view`) and a hover overlay with explicit Preview / Download controls.

- [components/photo-vision.tsx](components/photo-vision.tsx) — `AfterFrame` wraps the generated image in `<PhotoProvider><PhotoView>` so clicking either the image OR the floating eye icon opens a lightbox. Download icon writes the in-memory blob URL to disk via an in-memory `<a download>` with the spec filename pattern `sprouty-vision-<engine>-<shortId>.png` (last 6 alphanumeric chars of the Dexie record id). Overlay fades in on desktop hover (`group-hover:opacity-100`) and stays visible on touch devices (`[@media(hover:none)]:opacity-100`). 36×36 buttons meet WCAG touch-target minimums.
- `AfterState` now carries the `recordId` from Dexie so the filename can be derived without a fresh DB lookup.
- `react-photo-view/dist/react-photo-view.css` imported at the component module level.

---

## 2026-05-05, 8:00pm CST — Phase 7: Garden Vision generates real images

The "Generate vision" button is wired end-to-end. Drop a photo of your patio / balcony / yard onto the Before tile, pick an engine, hit Generate — the After tile renders a Gemini Nano Banana 2 (or GPT-Image) image of what your space could look like in week 12. Results persist to IndexedDB so they survive a refresh.

### Server route

- [app/api/vision/route.ts](app/api/vision/route.ts) — new POST handler. Accepts multipart `file` (optional before-photo), `prompt` (optional plan context), `engine` (`gemini` | `openai`). Reads `x-openrouter-key` for BYOK with env fallback. Posts to OpenRouter `/chat/completions` with `modalities: ["image", "text"]`, then runs a defensive response extractor that handles four response shapes we've seen across image-gen models: `message.images[*].image_url.url`, `message.images[*].url`, string content with bare/markdown data URL, and array content with structured `image_url` parts. Returns `{ ok: true, dataUrl, mimeType, engine, model }` on success or a structured `{ ok: false, error }` with the upstream message on failure.
- System prompt is engineered for photorealistic phone-photo output (1:1 aspect, natural daylight, no watermarks/text), and explicitly asks the model to preserve the geometry/lighting of the before-photo when one is provided.

### Client helper

- [lib/vision.ts](lib/vision.ts) — `generateVision({ beforeBlob, engine, prompt })` pulls the OpenRouter key from the encrypted IndexedDB envelope via `loadAllKeys()`, posts the form, decodes the data URL into a Blob, writes a `VisionImageRecord` to `db().visions`, and returns the new record + an object URL ready to drop into an `<img>`. Plus `loadLatestVision(engine)` for hydration.

### Photo Vision UI

- [components/photo-vision.tsx](components/photo-vision.tsx) — full rewrite. Before tile is now a real `react-dropzone` (single image, 12 MB cap, accepts PNG/JPG/WEBP/HEIC) that swaps to a preview-with-clear when a file is dropped. After tile renders the generated PNG with an overlay spinner ("Painting your garden…") while in flight. Generate button transitions to "Regenerate" once a vision exists. Error states surface in a terracotta band under the tiles, not as alert popups. Engine pill (Gemini ↔ OpenAI) drives both the request and the hydration query, so flipping the toggle restores the most recent generation for that engine.
- Object URLs are properly revoked in cleanup effects so dropping in 20 photos in a row doesn't leak memory.

### Followups still open in Phase 7

Lightbox via `react-photo-view`, hover-overlay download/preview icons, native mobile camera capture, and the full plan-context prompt (waiting on Phase 6's `garden-context.json`). Tracked in [TODO.md](TODO.md).

---

## 2026-05-05, 7:30pm CST — ZIP export / import closes Phase 1

The privacy commitment ("your data is yours, take it anywhere") finally has a working migration path. The Settings panel footer now exports the full local state to a ZIP and re-imports it on another device, round-tripping every Dexie table including the original document blobs and any generated vision PNGs.

- [lib/portable.ts](lib/portable.ts) — new module. `exportZip()` walks `sessions` / `plans` / `files` / `visions` / `context`, writes JSON metadata for each, and stores binary payloads as separate entries (`files/<id>.bin`, `visions/<id>.png`) so the JSON stays readable and tools that inspect the archive can treat the binaries as opaque. `downloadExport()` wraps it with the createObjectURL + anchor-click + revoke ritual. `importZip()` validates `manifest.app === "sprouty"` and the schema version, then runs `clear()` + `bulkPut()` inside a single Dexie `transaction("rw", ...)` so a failed import can't leave a half-restored DB.
- **Keys are intentionally omitted from the export.** The non-extractable AES-GCM master key in `db().master` would need a user-supplied passphrase + KDF + re-wrap to be portable, which adds a lot of UX surface for a one-line copy-paste workflow most users already have via a password manager. Same trade Bitwarden makes with its unencrypted JSON exports — credentials get re-entered once on the destination device.
- [components/settings-keys.tsx](components/settings-keys.tsx) — replaced the vestigial "Save & continue" footer button with a real `PortabilityFooter`. Two buttons (Import ZIP / Export ZIP), an inline 5s status flash showing the operation summary ("Exported 3 plans, 2 files (412 KB)" / error message), a `window.confirm()` gate before the destructive import, and busy/disabled states wired through a single `busy` enum so the two actions can't fight each other.
- [TODO.md](TODO.md) — Phase 1 ZIP export/import checkboxes flipped, with rationale for the keys-omission decision documented inline.

Phase 1 is now genuinely done: BYOK persistence + key tests + ZIP portability all landed.

---

## 2026-05-05, 7:00pm CST — Powered-by marquee polish: alignment, fades, +OpenRouter

Three fixes after the initial drop. Two duplicated brands were appearing on screen at once on wide monitors, the marks weren't sharing a horizontal axis (Mistral and Gemini sat lower than the others), and OpenRouter — the gateway every AI call routes through — wasn't represented.

- [components/powered-by.tsx](components/powered-by.tsx) — every brand is now wrapped in a fixed `MARK_HEIGHT_PX` (28) flex box with `items-center`, so SVGs with mismatched intrinsic top/bottom whitespace and the text fallbacks all share one baseline. Fade mask widened from 8% → 22% on each side so duplicate copies from the looping second pass fully dissolve before reaching the visible center band. Inter-brand gap bumped from `gap-14` to `gap-24` so one full copy of the row is wider than typical viewports — combined with the wider fade, the same brand can no longer be visible twice. Animation slowed slightly (38s → 42s) to suit the wider track.
- Mistral entry switched from the icon-only SVG (Mistral's public path serves only the colorful M square, not the wordmark) to a typeset "Mistral" matching LiveKit / trigger.dev, so the row reads as wordmarks throughout.
- Added OpenRouter as a new entry. Their site doesn't expose a CDN-stable wordmark SVG, so it joins the typeset group.
- [public/logos/](public/logos/) — `mistral.svg` removed.

---

## 2026-05-05, 6:50pm CST — Listening modal trimmed + "Powered by" marquee under Garden Vision

Two adjustments. The K-hold modal felt taller than it needed to be — every section had a little extra room. And the page was missing a credit strip for the technology stack actually doing the work, so reviewers had no quick visual cue for which sponsor surfaces are wired in.

### Listening modal

- [components/listening-modal.tsx](components/listening-modal.tsx) — switched the card from `p-16` to `px-16 py-11` (mobile `p-10` → `px-8 py-8`), shrank the Sprout from 240 → 200, and tightened the spacing rhythm (`mb-9` → `mb-6` on the kicker copy, `mb-7` → `mb-5` between Sprout / waveform / transcript / footer). Net height drop is roughly 20% — feels breathable on shorter laptop screens without losing any content.

### Powered by marquee

- [components/powered-by.tsx](components/powered-by.tsx) — new component. Continuous left-to-right scrolling row of brand wordmarks under the Garden Vision section. Logo list duplicated in DOM and the inner track animates `translateX(-50%) → 0` over 38s linear infinite, so the second copy slides into the first copy's starting position seamlessly. Edges fade with a CSS mask so logos materialize/dissolve instead of clipping.
- All marks rendered with `filter: grayscale(100%) brightness(0.55) contrast(1.1)` and `opacity: 0.7` so the strip reads as one cohesive credit unit instead of a collage of competing brand colors.
- [public/logos/](public/logos/) — Qdrant, Mistral, Google Gemini (covers Nano Banana 2), and OpenAI are real SVGs pulled from each project's public assets / Wikimedia Commons. LiveKit and trigger.dev fall through to a typeset rendering of the brand name in Inter Tight bold — neither exposes a CDN-stable wordmark SVG, so the component supports both file-based logos and text-only entries via a `Brand` union type.
- [app/globals.css](app/globals.css) — added the `powered-by-scroll` keyframe and a `prefers-reduced-motion` override that pauses the track for users who've set the OS preference.
- [app/page.tsx](app/page.tsx) — mounted between `PhotoVision` and `SettingsKeys`.

---

## 2026-05-05, 6:25pm CST — Fix overlapping text in inline listening state

Tapping Sprout / clicking "Tap to talk" was leaving the headline "Talk to me about your space." rendered behind the absolutely-positioned "HEARING YOU" + transcript overlay, producing the smashed-together text in the bug screenshot. The subtitle already had the right behavior; the H1 just hadn't been wired to fade alongside it.

- [components/voice-card.tsx](components/voice-card.tsx) — H1 now carries the same `transition-opacity` + `opacity: isListening ? 0 : 1` treatment as the subtitle. While listening, both fade out and the transcript overlay occupies the now-empty vertical region cleanly.

---

## 2026-05-05, 6:15pm CST — Top bar tightened up for mobile

The header now collapses gracefully under 700px without losing navigation. The tab pill stays on screen, the brand wordmark drops away (logo tile alone), the Settings button becomes a single round gear, and the redundant "Vision" tab is gone — Plan was already pointing at the same anchor.

- [components/top-bar.tsx](components/top-bar.tsx)
  - Removed `Vision` from `TABS` and `TAB_TARGETS`. Plan still scrolls to the `vision` section.
  - Wordmark "Sprouty" hidden under 700px; the lime-on-forest leaf tile carries brand alone on mobile.
  - Tabs are no longer `max-[700px]:hidden` — they render at every width. On mobile they shrink to `px-3 py-1.5 text-xs` so three pills fit comfortably alongside the logo and gear at 320px.
  - Settings button collapses to a 36×36 round icon-only button on mobile (`aria-label="Settings"` for screen readers); full pill with text on ≥700px. K-hint remains desktop-only.

The "Before" tile in the Garden Vision section now uses the same dropzone visual language as the knowledge-base panel — same dashed border, same rotated lime-gradient icon tile, same Inter Tight bold + serif-italic accent headline, same muted description block — so the upload affordance reads identically across the page.

- [components/photo-vision.tsx](components/photo-vision.tsx) — `PhotoFrame` rewritten. The `before` variant renders a dashed cream tile with a `Camera` icon (rotated -6°, lime → lime-deep gradient, 12px shadow). Headline (`text-2xl` → `text-xl` mobile) and body (`text-sm`, `max-w-[360px]`) match the knowledge-base dropzone exactly. Copy: "Drop your space *here.*" + "A photo of where your raised beds will go — patio, balcony, side yard, anywhere. We'll show you what it could look like."
- The `after` variant gains a placeholder caption at the bottom of the painted tile: "Nano Banana or GPT-Image will generate a render of your future garden here." — sets reviewer expectations before Phase 7 image gen lands.
- Pure visual upgrade — no react-dropzone wiring yet (that lands with Phase 7 image generation).

---

## 2026-05-05, 5:55pm CST — BYOK persistence: encrypted keys in IndexedDB

The Settings panel finally remembers your keys across reloads. Each value is wrapped with a 256-bit AES-GCM key that's generated once per browser, marked non-extractable, and stored via IndexedDB structured cloning — so the master key physically cannot leave the device. Saved keys also flow through to `/api/ingest` as `x-openrouter-key` / `x-qdrant-key` headers, replacing the `.env.local`-only fallback that was in place before.

- [lib/db.ts](lib/db.ts) — added `MasterKeyRecord` and a `master` Dexie store; bumped schema to `version(2)` with a non-destructive migration.
- [lib/crypto.ts](lib/crypto.ts) — new module. `getOrCreateMasterKey()` (lazy-initialized, cached), `encryptString` / `decryptString` (AES-GCM with a fresh 12-byte IV per value, packed into base64), `resetCryptoEnvelope` for the future "wipe everything" path.
- [lib/keys.ts](lib/keys.ts) — new module. `saveKey`, `loadKey`, `loadAllKeys`, `recordTestResult`, `deleteKey`, plus an `isTestFresh` helper that powers the 24-hour green-dot rule from CLAUDE.md.
- [components/settings-keys.tsx](components/settings-keys.tsx) — `KeyCard` now decrypts on mount, persists on Save, and the green dot reads from the stored `lastTestedAt`/`testStatus` so it survives a reload. A new `Saving` spinner state covers the round-trip; failed test outcomes are recorded too.
- [components/knowledge-base.tsx](components/knowledge-base.tsx) — `onDrop` now calls `loadAllKeys()` and forwards the user's saved OpenRouter + Qdrant keys (and the env-provided Qdrant URL) into `ingestKnowledgeFile`, so BYOK actually works end-to-end without `.env.local`.

Net effect: drop your keys in once, the green dot stays green for 24 hours, and the ingest pipeline stops needing `.env.local` to function. The master key is non-extractable, which means even a hostile script that opens devtools and inspects IndexedDB sees ciphertext — not the raw API keys.

---

## 2026-05-05, 5:35pm CST — Explicit "Vectorized" badge on indexed files

Each file in the knowledge-base sidebar that's been successfully indexed in Qdrant now wears a clear lime pill that reads `✓ Vectorized · 42v` instead of just the cryptic vector count. Hovering the pill surfaces a tooltip ("42 vectors live in your Qdrant cluster (green)") so the user has zero ambiguity about whether their data is durably searchable.

- [components/knowledge-base.tsx](components/knowledge-base.tsx) — `StatusChip` indexed-state replaced the old `{n}v` chip with a chip containing a lucide check icon + the word "Vectorized" + the count in a softened mono. Same lime/forest palette, same pill shape, just a much clearer message.
- Tooltip uses `file.qdrantStatus` echoed back from the cluster (`completed`, `green`, etc.) so the user can verify Qdrant's own reported state.

Net effect: the user uploads a doc, watches the live progress bar, and ends up with a row that says "Vectorized" — they don't have to know what "98v" means to trust that Sprouty is ready to retrieve from it.

## 2026-05-05, 5:30pm CST — Plain-English progress copy + TODO additions

Refined the ingest progress messages to use everyday language so any reviewer (not just engineers) understands what's happening with their file. Also captured two new pieces of follow-up work in [TODO.md](TODO.md).

### Plain-English progress copy

Stage labels rewritten to focus on the *what* (your file → Qdrant) rather than the *how* (chunking, embedding, upserting). New copy:

- Upload starts → "Uploading to server"
- Reading file → "Reading your document"
- Chunked → "Read 28 pages — preparing for Qdrant" → "Split into 42 searchable sections"
- Embedding → "Creating vectors for 42 sections" → "42 vectors ready"
- Connecting → "Connecting to your Qdrant database"
- Saving → "Sending 42 vectors to Qdrant"
- Done → **"Saved to Qdrant · 42 vectors searchable"** (with the lime-glowing complete bar)

Top-level status chip during processing also flipped from "Indexing" → "Saving to Qdrant" so the user is never in doubt about where their data is going.

### TODO additions
- New **Phase 12.6** — package the repo for public GitHub distribution. Five sub-tasks:
  - 12.6.A: verify nothing private leaks (re-run secrets scan, audit `.gitignore` / `.vercelignore`, grep for key shapes)
  - 12.6.B: decide whether to bundle [knowledge/](knowledge/) (recommended: yes, gated by Phase 12.5 attribution)
  - 12.6.C: README "for Qdrant judges / reviewers" subsection with a ≤6-command run flow + a feature ↔ required-keys matrix
  - 12.6.D: housekeeping — `LICENSE` (MIT), `CONTRIBUTING.md`, GitHub repo topics, social preview image, public visibility, share with `@kanungle`
  - 12.6.E: first-clone smoke test on a different machine before pushing
  - 12.6.F (stretch): one-click reviewer experience via Vercel "Deploy" button + StackBlitz / pre-built demo dataset

## 2026-05-05, 5:24pm CST — Live ingest progress bar + Qdrant confirmation

The dropzone now shows real-time progress as each file streams through the ingest pipeline, with explicit confirmation from Qdrant when points are committed.

- [app/api/ingest/route.ts](app/api/ingest/route.ts) refactored to stream `application/x-ndjson` — one JSON event per line, written as the pipeline runs:
  - `{ stage: "extracting", progress: 0.05, message: "Reading file.pdf" }`
  - `{ stage: "chunking", progress: 0.2, message: "42 chunks ready" }`
  - `{ stage: "embedding", progress: 0.7, message: "42 vectors generated" }`
  - `{ stage: "upserting", progress: 0.8, message: "Writing 42 points to sprout_kb" }`
  - `{ stage: "done", progress: 1, vectorCount, pages, qdrantStatus, collection, embeddingModel, chunks }`
  - `{ stage: "error", error: "…" }` on any failure
  - After the upsert (`wait: true`), the route reads back `client.getCollection("sprout_kb").status` and includes it in the `done` event as `qdrantStatus` — that's the cluster's own confirmation that the points are committed.
- [lib/db.ts](lib/db.ts) — `KnowledgeFileRecord` gained `progress` (0..1), `stage` (human-readable label), and `qdrantStatus` (echoed back from the cluster).
- [lib/knowledge-files.ts](lib/knowledge-files.ts) — `ingestKnowledgeFile()` now reads the response body via `getReader()`, splits NDJSON on `\n`, and dispatches each event into a `applyEvent()` helper that updates the IndexedDB record. `useLiveQuery` re-renders the UI as each event lands.
- [components/knowledge-base.tsx](components/knowledge-base.tsx) — new `IngestProgressBar` inside each `FileCard`:
  - Lime → sage gradient bar that animates from 0% to 100%
  - Stage label on the left ("Embedding via OpenRouter", "Writing 42 points to sprout_kb", etc.) in IBM Plex Mono
  - Percentage on the right
  - On success the bar settles to solid lime with a subtle glow + the label flips to "Confirmed by Qdrant · green" so the user knows the data is durably indexed.

The user now has visible answers to "is anything happening?" (yes — progress bar is moving) and "did Qdrant actually accept my data?" (yes — status echoed from the cluster).

## 2026-05-05, 5:09pm CST — End-to-end ingest pipeline (Phases 3 + 4)

The drop-zone is now wired all the way to Qdrant. Drop a PDF/TXT/MD → file lands in IndexedDB queued → POSTs to `/api/ingest` → server extracts → chunks → embeds via OpenRouter → upserts to the user's Qdrant cluster → status flips to indexed (or failed with a real error message).

### Phase 3 — [lib/qdrant.ts](lib/qdrant.ts)
- `qdrantClient({ url, apiKey })` — BYOK first, env fallback (`QDRANT_URL` / `NEXT_PUBLIC_QDRANT_URL` / `QDRANT_API_KEY`).
- `ensureCollection(client)` — idempotent. Creates `sprout_kb` with hybrid dense (1536-cos) + BM25 sparse (`modifier: "idf"`) on first run, plus payload indexes on `difficulty_rating`, `crops_mentioned`, `seasons`, `source_doc`.
- `upsertChunks(client, chunks)` — batched 128-at-a-time upsert with `wait: true`.
- `deleteBySourceDoc(client, filename)` — removes every point from a file (used when the user removes a KB entry — keeps Qdrant ↔ IndexedDB in sync).
- `discover({ positives, negatives, maxDifficulty, crops, seasons, limit })` — Discovery API helper using context pairs. Default beginner difficulty cap of 3 per CLAUDE.md.
- `recommend(seedIds, limit)` — Recommendation API helper for "more like the crops you liked".
- `chunkId(sourceDoc, index)` — stable point IDs (`<file>:<n>`) so re-ingests overwrite cleanly.
- Exports the `ChunkPayload` interface mirroring CLAUDE.md's payload schema.

### Phase 4 — ingest pipeline
- New [lib/chunk.ts](lib/chunk.ts) — semantic-ish chunker. ~1000 chars, ~200 overlap. First splits on heading lines (markdown `#`, `Chapter N`, all-caps section titles), then slides a window over each section landing on sentence/paragraph boundaries (won't end mid-word).
- New [app/api/ingest/route.ts](app/api/ingest/route.ts) — POST multipart endpoint:
  - Accepts `x-openrouter-key`, `x-qdrant-url`, `x-qdrant-key` headers (BYOK), with `.env.local` fallback for dev.
  - Refuses requests where the key still contains `REPLACE_ME` placeholder.
  - PDF → `pdf-parse` (lazy-imported so it stays out of client bundles, declared as `serverExternalPackages` in next.config.ts).
  - TXT/MD/MDX → `File.text()`.
  - Image → 415 with a "captioning is on the roadmap" message (Phase 4 follow-up: `mistralai/mistral-small-multimodal`).
  - Embeds all chunks in a single `embedBatch()` round-trip.
  - Upserts to `sprout_kb`. Returns `{ ok, vectorCount, pages, chunks: [{id, chapter}], embeddingModel, collection }`.
- [lib/knowledge-files.ts](lib/knowledge-files.ts) — added `ingestKnowledgeFile(record, keys?)` which builds the multipart body, posts to `/api/ingest`, and writes status updates back into IndexedDB along the way (`queued → processing → indexed { vectorCount, pages, ingestedAt }` or `failed { error }`).
- [components/knowledge-base.tsx](components/knowledge-base.tsx) — `onDrop` now stages files then `Promise.all`s `ingestKnowledgeFile()` for each accepted drop. Status changes flow through `useLiveQuery` so the UI updates live without any extra plumbing.

Phase 6 (plan generation) is now genuinely close — it just needs a route that takes a session transcript, calls `discover()` against `sprout_kb`, and `chatJson()`s the retrieved chunks into a structured plan.

## 2026-05-05, 4:54pm CST — OpenRouter client + model constants

Foundation for every AI call Sprouty makes. Phase 2 of [TODO.md](TODO.md) lands.

- New [lib/models.ts](lib/models.ts) — single source of truth for the 7 OpenRouter model IDs. Exports a typed `Models` const (STT / LLM / TTS / MULTIMODAL / EMBED / IMAGE_DEFAULT / IMAGE_ALT), plus `EMBED_DIMENSIONS = 1536` and `DEFAULT_TTS_VOICE`. Call sites import from here so a model bump (e.g. `mistral-small` → `mistral-small-3.2`) is a one-line change.
- New [lib/openrouter.ts](lib/openrouter.ts):
  - `openrouterClient(key?)` — constructs the OpenAI SDK pointed at `https://openrouter.ai/api/v1`. Key resolution: explicit arg first (BYOK from IndexedDB), then `OPENROUTER_API_KEY` env. `dangerouslyAllowBrowser: true` is intentional and safe — Sprouty's BYOK design has the user's *own* key in their *own* browser.
  - Sends `HTTP-Referer` + `X-Title: "Sprouty"` headers so OpenRouter's dashboard can attribute usage.
  - `embed(text, key?)` and `embedBatch(inputs, key?)` — return 1536-dim vectors via `text-embedding-3-small`.
  - `chat(messages, key?, opts?)` — non-streaming completion. Default temperature 0.4 (grounded), max-tokens 1024. Returns the assistant's text content directly.
  - `chatJson<T>(messages, key?, opts?)` — same as `chat` but enforces `response_format: { type: "json_object" }` and parses. Used for structured constraint extraction. Throws on malformed JSON with a truncated preview of the bad output.
  - `streamChat(messages, key?, opts?)` — async-iterator over text deltas. `for await (const chunk of streamChat(...))`. Used for the voice agent path piping into TTS / live transcripts.

Image generation helper (`imageGen`) is intentionally deferred — the response shape for image-output chat completions varies per model (URL-with-base64 vs nested `images` array), so I'll wire that when building the Garden Vision route to match the actual model's response.

Unblocks Phase 4 (knowledge-base ingest pipeline), Phase 6 (plan generation), Phase 7 (Garden Vision), and Phase 8 (scheduled-nudge text generation) — they all just import from here.

## 2026-05-05, 4:48pm CST — Persistent grow plan in the "Today" card

The Today card is now Dexie-backed. Tasks survive hard refresh, tab restart, and (eventually) cross-device sync via ZIP export.

- New [lib/plans.ts](lib/plans.ts):
  - `seedStarterPlanIfEmpty()` — idempotent first-mount seed. Builds a 12-week plan with week 1 anchored to the most-recent Sunday and the design-mock starter tasks. Once the voice agent generates a higher-`version` plan, that one wins automatically (latest-version-first query).
  - `useActivePlan()` — `useLiveQuery` hook that always reads the highest-version `PlanRecord`.
  - `findCurrentWeek(plan)` — picks the earliest week with a non-done task.
  - `toggleTask(planId, weekIndex, taskId)` — flips done ↔ pending, auto-promotes the next pending task to `current` when the active task is finished. Persists immediately.
- [components/plan-card.tsx](components/plan-card.tsx) rewritten:
  - Reads from IndexedDB via `useActivePlan()`; calls `seedStarterPlanIfEmpty()` once on mount.
  - Each task is a clickable button — clicking toggles status and writes through `toggleTask`. Lime fill on the current task, lime check on done, line-through on completed labels.
  - Headline auto-picks a recognized crop word from the active task ("Plant your *beans*" / "Plant your *tomatoes*" / fallback "Tend your *garden*").
  - Date range computed from `currentWeek.startDate` / `endDate`, formatted as "May 3 — May 9".
  - Progress bars: solid lime for completed weeks, half-opacity for in-progress, faint for future. Citation chip (e.g. `Ch. 3, p. 19`) shows on the right of any task that has one.
  - Skeleton render while `useLiveQuery` returns `undefined` on first paint.
  - Empty-tasks state: italic "Talk to Sprouty to build out this week."

The eventual voice → plan pipeline (Phase 6 in [TODO.md](TODO.md)) just needs to write a new `PlanRecord` with `version > 1` and `triggerEvent="initial_planning"` — the UI swaps to it without code changes.

## 2026-05-05, 4:33pm CST — Brand → Sprouty · Qdrant + trigger.dev tests · KB persistence

A bundle of changes — branding, two more working test buttons, and IndexedDB persistence for uploaded knowledge files.

### Renamed Sprout → Sprouty

User-visible brand name swapped in:
- [components/top-bar.tsx](components/top-bar.tsx) — header brand
- [components/floating-kbd.tsx](components/floating-kbd.tsx) — "anywhere to talk to Sprouty"
- [app/layout.tsx](app/layout.tsx) — page title + applicationName + OG title
- [package.json](package.json) — `name: "sprouty"` + description
- [README.md](README.md) — every visible reference (replace_all)
- [CLAUDE.md](CLAUDE.md) — top header + "What this is" section + new naming-note callout
- [TODO.md](TODO.md) — top header

Left intentionally as `Sprout`/`sprout`: historical CHANGELOG entries, file paths (`sprout_prd.md`, `components/sprout-character.tsx`), the Dexie database name (`sprout`), the Qdrant collection (`sprout_kb`), and code-internal identifiers (`SproutCharacter`, `SproutDB`). A naming-note in CLAUDE.md spells this out so future Claude sessions don't get confused.

### Qdrant + trigger.dev Test buttons

- [lib/test-keys.ts](lib/test-keys.ts) — added `testQdrant(key)` (`GET ${url}/collections` with `api-key` header) and `testTriggerDev(key)` (`GET api.trigger.dev/api/v1/projects/<id>` with Bearer). Both read their endpoint/project from public env vars (URL/project-ID aren't sensitive — only the key is).
- [.env.local](.env.local) — added `NEXT_PUBLIC_QDRANT_URL` and `NEXT_PUBLIC_TRIGGER_PROJECT_ID` so the client-side test functions can reach the right cluster/project. Server-side `QDRANT_URL` / `TRIGGER_PROJECT_ID` retained for the agent + ingest pipeline.
- [components/settings-keys.tsx](components/settings-keys.tsx) — switch dispatches `qdrant` and `trigger` cases. Only `livekit` left as a stub (needs a `/api/livekit/test` server proxy because Twirp endpoints aren't CORS-friendly).
- 5 of 6 Test buttons now functional: OpenRouter ✓ Qdrant ✓ Google AI ✓ OpenAI ✓ trigger.dev ✓ LiveKit ✗

### Persistent knowledge-base files

Dropped files now survive page reloads.

- [lib/db.ts](lib/db.ts) — schema bumped: `KnowledgeFileRecord` now stores the original `blob`, separates `addedAt` (drop time) from `ingestedAt` (ingest-completed time), and makes `pages` / `vectorCount` optional (only set after ingest). Indexed on `addedAt` (newest-first sort) and `status` (cheap "what's queued" queries).
- [lib/knowledge-files.ts](lib/knowledge-files.ts) — new helper module with `addKnowledgeFile`, `addRejectedFile`, `updateKnowledgeFileStatus`, `removeKnowledgeFile`. All write through the lazy `db()` accessor.
- [components/knowledge-base.tsx](components/knowledge-base.tsx) — replaced the in-memory `useState` with `useLiveQuery(() => db().files.orderBy("addedAt").reverse().toArray(), [], [])`. Drops persist immediately; rejections persist with their reason; removes delete from IndexedDB. Survives hard refresh, tab restart, and (eventually) cross-device via the planned ZIP export.

### Other notes
- Fixed an over-aggressive guard in [scripts/check-secrets.sh](scripts/check-secrets.sh) — the "FORBIDDEN FILE" check now only fires in `--staged` mode (gitignored env files legitimately exist on disk in full-tree scans).
- TODO.md gained a Garden Vision sub-task for the hover-overlay download + preview UX (lightbox + `<a download>` save) on generated images.

## 2026-05-05, 4:20pm CST — Google AI + OpenAI Test buttons live

Two more services join OpenRouter on the working-test-button list. Same `{ok, message}` shape, same status-dot + inline-message UX.

- [lib/test-keys.ts](lib/test-keys.ts) — added `testGoogleAI(key)` (`GET generativelanguage.googleapis.com/v1beta/models`) and `testOpenAI(key)` (`GET api.openai.com/v1/models`). Both return model-count on success: e.g. `Connected · 47 models`.
- [components/settings-keys.tsx](components/settings-keys.tsx) — switch dispatches `gemini` and `openai` to their handlers.
- Remaining stubs: **Qdrant** (needs URL + key — schema change to add a second input), **LiveKit** (needs `/api/livekit/test` server proxy because the Twirp endpoints aren't CORS-friendly), **trigger.dev** (needs project ID alongside the personal access token).

## 2026-05-05, 4:17pm CST — OpenRouter Test button is live

First real BYOK key validation wired through end-to-end.

- New [lib/test-keys.ts](lib/test-keys.ts) — `testOpenRouter(key)` hits `https://openrouter.ai/api/v1/key` with the user's bearer and returns `{ok, message}` (label + credit info from the response on success). Runs entirely client-side per the BYOK rule. Stubs noted for the other 5 services with the matching shape.
- [components/settings-keys.tsx](components/settings-keys.tsx) updated:
  - Test button now triggers an async test, shows `Testing` (with spinner) → `Connected · Sprout dev key` (or HTTP error message)
  - Status dot reflects test result: lime ring on success, terracotta on fail, gray when untested or empty (FR-ST-05 honored)
  - Inline test result line replaces the "Get key from …" link while fresh; switches back when the user resets / changes the value

Other services (Qdrant, LiveKit, Google AI Studio, OpenAI, trigger.dev) currently fall through to a "Test not yet implemented" message — the `lib/test-keys.ts` TODOs spell out the exact endpoints to wire next.

## 2026-05-05, 4:11pm CST — Local-only design refs + new TODO.md

- Created `.local/` and moved [.local/sprout_brief.html](.local/sprout_brief.html), [.local/sprout_design_04.html](.local/sprout_design_04.html), [.local/sprout_design_04_listening.html](.local/sprout_design_04_listening.html) into it. These are now local-only references.
- Updated [.gitignore](.gitignore) — `.local/` now excluded so the design HTMLs and the strategic brief never reach GitHub.
- Added [.vercelignore](.vercelignore) — excludes `.local/` from Vercel uploads, plus `agent/`, `ingest/`, `knowledge/`, `SKILLS/`, `scripts/`, `.githooks/`, `CHANGELOG.md`, `TODO.md`, `sprout_prd.md` (none of those belong in the production bundle).
- Updated [CLAUDE.md](CLAUDE.md), [TODO.md](TODO.md), [CHANGELOG.md](CHANGELOG.md), [components/sprout-character.tsx](components/sprout-character.tsx), [components/listening-modal.tsx](components/listening-modal.tsx) to reference the new `.local/` paths.
- Added [TODO.md](TODO.md) — comprehensive 14-phase roadmap covering BYOK persistence, OpenRouter / Qdrant / LiveKit integration, ingest pipeline, Python voice agent, plan generation, image gen, scheduled nudges, mobile responsiveness, performance targets, deployment, and submission gates.

## 2026-05-05, 4:07pm CST — Listening states (inline + K-hold modal)

Implements the second half of the voice UX from [.local/sprout_design_04_listening.html](.local/sprout_design_04_listening.html). The page now has working idle ↔ listening transitions wired to global state.

- **K-hold (≥200ms)** anywhere on the page → full-screen [ListeningModal](components/listening-modal.tsx). Release K → back to idle. Suppressed while focus is in inputs/textareas/contenteditable.
- **Escape** → exits any listening state.
- **Click "Tap to talk"** or **click the Sprout character** → inline listening (in-card transcript overlay, waveform under character, watering can + 5 staggered droplets, soil darkens with shimmer line, body gets lime-ring glow + breathes faster, leaves sway wider, eyes blink-happy, mouth opens to "O"). The Sprout becomes the stop button while listening.
- **Click backdrop or "Stop & send"** → return to idle.

New components:
- [keyboard-listener.tsx](components/keyboard-listener.tsx) — global keydown/keyup hook with hold-threshold timer, Escape handler, focus-loss cancel, and input-suppression.
- [listening-modal.tsx](components/listening-modal.tsx) — full-screen K-hold modal: scaled-down Sprout (240px), 25-bar lime→sage waveform, transcript card with cursor-blink, "Voxtral · streaming STT" status, "Release K to send" footer. Mounts/unmounts via framer-motion `AnimatePresence` (scale 0.92→1 + opacity).
- [waveform.tsx](components/waveform.tsx) — reusable 25-bar audio visualizer (`variant="inline" | "modal"`); heights + delays match the design HTML exactly.

Updated:
- [voice-card.tsx](components/voice-card.tsx) — now `"use client"`, reads `voiceState` from the zustand store, swaps eyebrow text + color, fades subtitle, layers in transcript, waveform, watering-can, soil shimmer, and a "Stop & send" button at the card bottom while listening. Card border + shadow shift to lime ring tones during listening.
- [sprout-character.tsx](components/sprout-character.tsx) — full rewrite of the watering can (proper body / handle / spout divs with lime gradients, not the placeholder SVG), 5 staggered water drops, body lime-ring box-shadow when listening, soil shimmer line on listening, all timings aligned to the design HTML (`breathe-listening` -8px / scale 1.06; `blink-happy` 3s; `leaf-sway` ±10°). Now accepts an `onClick` prop with proper button semantics + Enter/Space activation.
- [globals.css](app/globals.css) — added `glow-listening`, `pulse-dot-fast`, `cursor-blink`, `water-shimmer`, `wave-bounce`, `water-fall`, refined `breathe-fast`, `blink-fast`, `water-tilt` to match design exactly. Added `--color-water-blue-light` token. New `body.modal-open .behind-modal` rule applies `filter: blur(8px) saturate(0.7); pointer-events: none` to everything outside the modal.
- [page.tsx](app/page.tsx) — wraps the page chrome in `<div class="behind-modal">` and mounts `<KeyboardListener />` + `<ListeningModal />` outside that wrapper so the modal is never blurred.

Live transcript text is wired through `useAppStore.liveTranscript`. While that's empty, both the inline overlay and the modal show a placeholder sentence for visual fidelity until real STT is wired (see [TODO.md](TODO.md)).

## 2026-05-05, 2:50pm CST — Next.js scaffold + idle-state home page

First substantial code drop. Next.js 15 + React 19 + TypeScript 5 + Tailwind 4 frontend rendering the full idle layout from [.local/sprout_design_04.html](.local/sprout_design_04.html).

**Config & tooling**
- [package.json](package.json) — pinned Next 15.0.4, React 19, TS 5.7, Tailwind 4. All Sprout deps from CLAUDE.md included: livekit-client/components-react, @qdrant/js-client-rest, openai, zustand, dexie, dexie-react-hooks, framer-motion, jszip, react-dropzone, react-photo-view, lucide-react, pdf-parse, mammoth, web-push, @trigger.dev/sdk, livekit-server-sdk.
- [tsconfig.json](tsconfig.json), [next.config.ts](next.config.ts), [postcss.config.mjs](postcss.config.mjs), [next-env.d.ts](next-env.d.ts), [.eslintrc.json](.eslintrc.json) — strict TS, App Router, `@/*` path alias, Tailwind 4 PostCSS plugin, `pdf-parse` and `mammoth` marked as `serverExternalPackages`. Agent + ingest folders excluded from typecheck and lint.

**Design system**
- [app/globals.css](app/globals.css) — full design-token map (paper / ink / forest / sage / lime / terracotta / water-blue palette + shadow scale) wired through Tailwind 4's `@theme` directive. All idle and listening keyframes from the design HTML are defined here (`breathe`, `leaf-sway-*`, `blink`, `glow-breathe`, `pulse-dot`, `pulse-tiny`, `floating-rise`, plus the listening-only `breathe-fast`, `water-tilt`, `droplet-fall`, `wave-bar`, `modal-rise`).
- [app/layout.tsx](app/layout.tsx) — loads Inter, Inter Tight, Fraunces (italic + opsz/SOFT axes), and IBM Plex Mono via `next/font/google`. Each font exposes a CSS variable that `globals.css` consumes. SEO metadata + `themeColor` set.

**Components — `components/`**
- [sprout-character.tsx](components/sprout-character.tsx) — pure-CSS-animated character (pot, leaves, body, face). Single `state` prop ("idle" | "listening") swaps timing curves and adds the watering-can + droplet visuals. 280×320px default, scalable.
- [top-bar.tsx](top-bar.tsx) — sticky topbar: brand, Today/Knowledge/Plan/Vision pill nav, `Hold K to talk` chip, Settings button. Mobile collapses tabs and chip.
- [voice-card.tsx](components/voice-card.tsx) — hero: pulse-dot eyebrow, `Talk to me about your space.` headline (Fraunces italic on the emphasis), Sprout character, "Tap to talk" + Hold-K CTA row.
- [plan-card.tsx](components/plan-card.tsx) — forest-green right card: This Week, Plant your beans, week 3/12 progress bars, 5 tasks with done/current/pending states, citation footer.
- [section.tsx](components/section.tsx) — generic section wrapper for the repeating "eyebrow + title + right cluster" header style.
- [knowledge-base.tsx](components/knowledge-base.tsx) — section with leaf-patterned dropzone + indexed file list (PDF/MD thumbs, vector-count chips, hover state).
- [photo-vision.tsx](components/photo-vision.tsx) — before/after photo frames + Gemini Nano Banana ↔ GPT-Image engine toggle + Generate vision CTA.
- [settings-keys.tsx](components/settings-keys.tsx) — BYOK panel (forest gradient + leaf-line backdrop) with all 6 services (4 required, 2 optional). **Implements PRD §6.6 FR-ST-07 / FR-ST-08**: per-card Save button (right of Test, only enabled when dirty, "Saved ✓" flash, reverts to hidden on save) and per-input eye-icon reveal toggle (`type=password` default, ephemeral state, never persisted).
- [floating-kbd.tsx](components/floating-kbd.tsx), [app-footer.tsx](components/app-footer.tsx) — corner K-hint pill (desktop only on mobile shrinks) and the IBM Plex Mono "Built on…" footer.

**App data layer (stubbed, no logic yet)**
- [lib/db.ts](lib/db.ts) — Dexie schema with 6 tables: `keys`, `sessions`, `plans`, `files`, `visions`, `context`. Lazy `db()` accessor guards against SSR access.
- [lib/store.ts](lib/store.ts) — zustand store: `voiceState`, `activeTab`, `liveTranscript` with append/clear helpers.

**Page wiring**
- [app/page.tsx](app/page.tsx) — composes TopBar → hero grid (VoiceCard + PlanCard) → KnowledgeBase → PhotoVision → SettingsKeys → AppFooter + FloatingKbd. Mirrors the section order in `.local/sprout_design_04.html`.

**Not yet built (next phases):** Listening-state UI (inline + modal K-hold), Web-Crypto encrypt/decrypt for keys, IndexedDB persistence wiring, OpenRouter client, Qdrant client, LiveKit token-mint API route, Python ingest pipeline, Python LiveKit agent service, weekly trigger.dev nudge job. Run `npm install && npm run dev` to verify the home page renders.

## 2026-05-04, 7:41pm CST — LiveKit CLI skill added

- Added [SKILLS/cli/livekit/SKILL.md](SKILLS/cli/livekit/SKILL.md) — LiveKit CLI (`lk`) reference covering install, `cloud auth`, project management, app templates, dev token creation, room debug joins (incl. FFmpeg/TCP/simulcast publishing), egress, load testing (incl. agent load testing), and the full `lk agent` deploy lifecycle (`create`, `deploy`, `update-secrets`, `secrets`, `logs`, `status`, `rollback`, `restart`) for the Sprout Python voice agent. Includes parameter precedence, template strings, Sprout-specific workflow recipes, and gotchas. Sourced from the GitHub README + LiveKit docs.
- Updated [SKILLS/README.md](SKILLS/README.md) and [CLAUDE.md](CLAUDE.md) to index the new skill.

## 2026-05-04, 7:32pm CST — OpenRouter skill added; README creator credit

- Added [SKILLS/openrouter/](SKILLS/openrouter/) — OpenRouter as unified OpenAI-compatible gateway for Python agent service, ingest pipeline, and Next.js API routes (all 7 Sprout models via one key).
- Updated [SKILLS/README.md](SKILLS/README.md): added `openrouter` to the Installed table; removed it from Planned.
- Updated [CLAUDE.md](CLAUDE.md): added `openrouter` skill row to the skills index.
- Updated [README.md](README.md): added "Created by Cory Micek" section with website and email.

## 2026-05-04, 7:28pm CST — Four new skills installed; CLAUDE.md indexes them

- Added [SKILLS/playwright-mcp/](SKILLS/playwright-mcp/) — Microsoft Playwright MCP server setup + use (browser automation, accessibility-snapshot scraping, Playwright test generation). Will drive end-to-end tests of the voice flow, plan render, and K-hold modal.
- Added [SKILLS/trigger-dev/](SKILLS/trigger-dev/) — high-level "Claude Workflow Builder" pattern for shipping Trigger.dev v3 automations (research → clarify → plan → build → deploy). Replaces the planned `trigger-dev` slot in [SKILLS/README.md](SKILLS/README.md).
- Added [SKILLS/cli/trigger-dev/](SKILLS/cli/trigger-dev/) — Trigger.dev CLI command reference (`init`, `dev`, `deploy`, profiles, env vars). Pairs with the workflow-builder skill.
- Added [SKILLS/cli/vercel/](SKILLS/cli/vercel/) — Vercel CLI command reference for shipping the Next.js frontend (deploys, `vercel env`, logs, rollback/promote, domains/DNS).
- Updated [SKILLS/README.md](SKILLS/README.md): expanded the Installed table to all five skills; trimmed the Planned list to `openrouter`, `qdrant-ingest`, and a new `livekit-agent` slot.
- Updated [CLAUDE.md](CLAUDE.md): added a "Skills available in this repo" section so future Claude sessions consult local skills before falling back to web search.

## 2026-05-04 — PRD: explicit Save + eye-icon reveal for API key inputs

Updated [sprout_prd.md](sprout_prd.md) §6.6 (Settings — API Keys):

- **FR-ST-03 tightened** — persistence is now explicit, not implicit. Typing only updates UI state; values write to IndexedDB only when the user clicks the per-card "Save" button or the panel's "Save & continue" button. Navigating away discards in-flight edits.
- **FR-ST-04 clarified** — Test button uses the in-flight input value (so users can verify before saving); a successful test does not auto-save.
- **New FR-ST-07: Save button** — sits immediately right of the Test button on every key card. Encrypts secrets via Web Crypto on write; shows a "Saved ✓" confirmation; reverts the field to hidden after save; enabled only on dirty fields; doesn't require a successful test first; ≥44×44 touch target.
- **New FR-ST-08: Reveal toggle (eye icon)** — keys are masked (`type="password"`) by default. Each input has an inline eye-icon button that toggles `password ↔ text` for that field only. Reveal state is per-field, ephemeral (resets on reload, panel re-open, and after Save), and never persisted to IndexedDB. Open-eye SVG when hidden, eye-with-slash when revealed. Accessible (aria-label, keyboard activation, ≥44×44 touch target).
- **FR-CD-05 updated** — touch-target list now explicitly includes Save buttons and eye-icon reveal toggles alongside Test buttons.

The default-safe state for every key in the UI is now **hidden + only-persisted-on-explicit-save**, with reveal as an opt-in ephemeral per-field action.

## 2026-05-04 — SKILLS folder + Anthropic skill-creator installed

- Created [SKILLS/](SKILLS/) directory at the repo root for reusable Claude skills.
- Added [SKILLS/README.md](SKILLS/README.md) documenting the layout and how to add new skills.
- Bundled Anthropic's [skill-creator](SKILLS/skill-creator/) skill verbatim from `anthropics/skills@main/skills/skill-creator`. Includes `SKILL.md`, `LICENSE.txt`, `references/schemas.md`, `assets/eval_review.html`, three sub-agents (`agents/{analyzer,comparator,grader}.md`), nine helper scripts under `scripts/`, and the `eval-viewer/` (`generate_review.py` + `viewer.html`). 18 files total, sizes verified against the GitHub manifest.
- Re-ran the secrets scanner after the bulk download — clean (36 files, 0 hits).
- Planned next skills: `openrouter`, `trigger-dev`, `qdrant-ingest` (sketched in [SKILLS/README.md](SKILLS/README.md)).

## 2026-05-04 — Secret-leak protection wired up

- Added [.gitignore](.gitignore) — excludes every `.env*` variant except the `.example` templates, plus common credential files (`*.pem`, `*.key`, `service-account*.json`, etc.), `node_modules`, `.next`, Python venvs, OS junk.
- Added [.env.example](.env.example) and [agent/.env.example](agent/.env.example) — placeholder templates for OpenRouter, Qdrant, LiveKit, trigger.dev, OpenAI, Web Push, and the Mistral model IDs the Python agent needs.
- Added [scripts/check-secrets.sh](scripts/check-secrets.sh) — bash scanner with patterns for OpenRouter / OpenAI / Anthropic / Google / trigger.dev / GitHub / Slack / AWS / Stripe keys, JWTs, and high-entropy `*_SECRET` / `*_TOKEN` / `*_API_KEY` assignments. Skips `.example` files, `knowledge/` PDFs, and binary/build artifacts. Two modes: `--staged` (fast, used by the pre-commit hook) and full repo scan (default).
- Added [.githooks/pre-commit](.githooks/pre-commit) and [.githooks/pre-push](.githooks/pre-push) — git hooks that abort if the scanner finds anything. Activate once with `git config core.hooksPath .githooks`.
- Added [scripts/claude-pretooluse-secrets.sh](scripts/claude-pretooluse-secrets.sh) — wrapper for an optional Claude Code PreToolUse hook that blocks Claude from running `git commit` / `git push` / `gh pr create` / `gh repo create` until the scanner passes. Install snippet documented in [README.md](README.md#3b-optional-belt-and-suspenders-claude-code-hook).
- Verified end-to-end: scanner exits 0 on the clean repo and exits 1 + prints offending file:line when seeded with fake `sk-or-v1-…` and `AIza…` keys.

## 2026-05-04 — Project docs scaffolded

- Added [CLAUDE.md](CLAUDE.md) — orientation for AI assistants. Captures tech stack, OpenRouter model IDs, Qdrant collection schema, design tokens, voice pipeline, privacy stance, and conventions distilled from the PRD, brief, and design specs.
- Added [README.md](README.md) — hackathon submission entrypoint. Covers the "Think Outside the Bot" angle, quick-start steps, third-party dependencies, Qdrant usage, judging criteria, eligibility, and submission metadata for the Qdrant Vector Space Day 2026 hackathon (deadline June 1, 2026 · 11:59 PM PT).
- Added this CHANGELOG.md.
- Knowledge base seeded with two source PDFs in [knowledge/](knowledge/): _Green-Thumb Beginnings_ and _The Modern Victory Garden_ — to be ingested into Qdrant on first run.
