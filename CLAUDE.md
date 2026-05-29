# CLAUDE.md — Sprouty

Orientation doc for Claude sessions on this repo. Read this first.

> **Naming note:** the project was originally called **Sprout** and renamed to **Sprouty** mid-build. Most code/file paths still use `sprout` or `Sprout` for stability (e.g., `sprout_prd.md`, the Dexie DB name, the `sprout_kb` Qdrant collection, the `SproutCharacter` component). The product, brand, and all user-visible copy use **Sprouty**.

## What this is

**Sprouty** is a voice-first garden coach for first-time vegetable gardeners. Built for the **Qdrant "Think Outside the Bot" Hackathon (Vector Space Day 2026)**. It turns generic gardening PDFs into a personalized 12-week plan via voice conversation, then sustains engagement through scheduled weekly voice nudges.

**One-line pitch:** "From 'I have no idea where to start' to a 12-week vegetable garden plan in 90 seconds of voice."

**Hackathon angle:** the rule is *no chatbots*. Sprouty takes voice as input and produces a **structured planning artifact** (12-week timeline, crop list, calendar, shopping list, AI-generated vision board). Users never type follow-up questions — subsequent interactions are scheduled by the system, not user-initiated.

## Source-of-truth docs

When in doubt, these files override anything in this CLAUDE.md:

- [sprout_prd.md](sprout_prd.md) — full PRD, schemas, environment variables, week-by-week build plan
- [.local/sprout_brief.html](.local/sprout_brief.html) — strategic dossier and design brief *(local-only, gitignored + vercelignored)*
- [.local/sprout_design_04.html](.local/sprout_design_04.html) — main UI design spec (idle state) *(local-only)*
- [.local/sprout_design_04_listening.html](.local/sprout_design_04_listening.html) — voice listening states (inline + modal K-hold) *(local-only)*
- [knowledge/](knowledge/) — the gardening PDFs that get embedded into Qdrant on first run

## Tech stack — exact versions and roles

### Frontend
- **Next.js 15.x** (React 19, TypeScript 5, Tailwind 4) — deployed to Vercel
- **livekit-client 2.x** + **@livekit/components-react 2.x** — WebRTC voice connection
- **zustand 5.x** — client state (plan, transcript, settings)
- **dexie 4.x** — IndexedDB wrapper (sessions, plans, gallery, garden context)
- **jszip 3.x** — export/import full ZIP archives
- **react-dropzone 14.x** — knowledge-base upload UX
- **framer-motion 11.x** — plan timeline animations
- **react-photo-view 1.x** — vision-board lightbox
- **lucide-react** — icons

### Voice agent (separate Python service)
- **livekit-agents 1.x** — agent framework (`Agent` + `AgentSession`, the post-`VoiceAssistant` API)
- **livekit-plugins-openai** — drives STT (Mistral direct), LLM (OpenRouter), TTS (OpenAI direct)
- **livekit-plugins-silero** — VAD turn detection (~1.5s silence = end-of-turn)
- **python-dotenv**

### Backend (Next.js API routes)
- **@qdrant/js-client-rest** — vector DB
- **openai** — OpenAI-compatible SDK pointed at OpenRouter
- **pdf-parse**, **mammoth** — document extraction
- **@trigger.dev/sdk** — scheduled jobs
- **livekit-server-sdk** — token minting
- **web-push** — browser push notifications

### Ingest pipeline (Python)
- **pypdf** + **langchain-text-splitters** + **qdrant-client** + **openai**

## AI providers — chat through OpenRouter, audio direct

OpenRouter is a chat-completion proxy; it doesn't host audio APIs. So the agent splits traffic across **three providers**, one per modality. Everything else (LLM, embeddings, image gen, multimodal) still rides through OpenRouter as the unified chat-completion gateway.

| Modality | Provider | Model | Purpose |
|---|---|---|---|
| STT | **Mistral** (direct) | `voxtral-mini-2507` | Streaming speech-to-text |
| LLM (chat) | **OpenRouter** | `mistralai/mistral-small` | Live conversation, constraint extraction, plan generation |
| LLM (multimodal) | **OpenRouter** | `mistralai/mistral-small-multimodal` | Photo analysis |
| Embeddings | **OpenRouter** | `openai/text-embedding-3-small` | 1536-dim dense vectors |
| Image gen (default) | **OpenRouter** | `google/gemini-3.1-flash-image-preview` | Garden vision board |
| Image gen (alt) | **OpenRouter** | `openai/gpt-5.4-image-2` | Garden vision board |
| TTS | **OpenAI** (direct) | `tts-1` (voice: `nova`) | Sprouty's voice |

**Mistral sponsor narrative:** Voxtral STT + Mistral Small LLM — two Mistral products in the critical path (the original "three Mistral products" plan assumed a Voxtral TTS that doesn't exist publicly yet; OpenAI TTS substitutes).

**Why three providers:**
- OpenRouter: chat completions, embeddings, image gen — broad model selection, single billing
- Mistral direct: Voxtral STT (transcription endpoint isn't proxied by OpenRouter)
- OpenAI direct: `tts-1` text-to-speech (TTS endpoint also not proxied; Mistral has no public TTS product as of May 2026)

The `livekit-plugins-openai` package speaks the OpenAI-compatible API shape against all three — only the `base_url` and `api_key` differ.

## Architecture (three-phase data flow)

**Phase I — One-time ingest** (knowledge base)
PDF → semantic chunk (~1000 char, 200 overlap, split by chapter/heading) → embed via OpenRouter → upsert to Qdrant (`sprout_kb` collection) with dense vector (1536d) + BM25 sparse + rich metadata payload.

**Phase II — Live conversation** (voice → plan)
Browser ↔ LiveKit Cloud (WebRTC) → Python agent → Voxtral STT (Mistral direct) → Mistral Small LLM (via OpenRouter) → OpenAI TTS (direct). On disconnect: full transcript posted to `/api/plan` → Mistral Small constraint extraction → Qdrant Discovery API hybrid query → Mistral Small plan generation → plan rendered as JSON in UI.

**Phase III — Scheduled engagement** (trigger.dev cron)
Sunday 9am: trigger.dev fires → loads plan → generates personalized voice nudge → web push. User reply → adaptive replan job → Qdrant query → updated plan version.

```
Browser (Next.js + IndexedDB)
    ↕ HTTPS + WebRTC
    ├→ Vercel (static + API routes)
    ├→ LiveKit Cloud (audio orchestration) → Python agent
    └→ trigger.dev (scheduled jobs)

Python agent splits traffic by modality:
    ├→ Mistral API (direct)        — Voxtral STT
    ├→ OpenRouter                  — Mistral Small LLM
    └→ OpenAI API (direct)         — tts-1 TTS

Next.js routes (chat/embed/image only — no audio):
    └→ OpenRouter
         ├→ Mistral Small (chat + multimodal)
         ├→ OpenAI text-embedding-3-small
         └→ Gemini Nano Banana 2 / GPT-Image (image gen)
    └→ Qdrant Cloud (vector DB)
```

## Qdrant collection — `sprout_kb`

```ts
{
  collection_name: "sprout_kb",
  vectors_config: { dense: { size: 1536, distance: "Cosine" } },
  sparse_vectors_config: { bm25: { modifier: "idf" } }
}
```

**Payload per chunk:** `text`, `source_doc`, `page`, `chapter`, `section_title`, `chunk_type` (narrative/list/table/heading), `topics`, `crops_mentioned`, `difficulty_rating` (1–5), `time_investment_hours`, `space_required_sqft`, `seasons`, `indexed_at`, `embedding_model`.

**Retrieval:** Qdrant Universal Query API → hybrid (dense + BM25 fusion), Discovery API for positive/negative constraint pairs, Recommendation API for "similar to chosen crops". Filter `difficulty_rating ≤ 3` for beginners.

**Knowledge files in this repo:**
- [knowledge/green-thumb-beginnings-a-foolproof-guide-to-starting-your-first-vegetable-garden-6c5ccda1-en.pdf](knowledge/)
- [knowledge/the-modern-victory-garden-a-homesteader-s-guide-to-abundant-harvests-e7627cf6-En.pdf](knowledge/)

## Privacy stance — BYOK, local-first

**Hard rule: Sprout stores no user data on any server it controls.**

- API keys: client-side only, encrypted via Web Crypto API in IndexedDB. Never sent to a Sprout-owned server.
- Sessions, plans, images, garden context, source documents: IndexedDB (browser) only.
- Vector embeddings live in user's own Qdrant Cloud; chunks are general gardening text, not PII.
- Live audio: transient (LiveKit → Mistral STT / OpenAI TTS → discarded). No analytics, no telemetry beyond what AI providers log themselves.
- Export/import via ZIP for portability across devices.

Required keys (Next.js side, BYOK in browser): **OpenRouter, Qdrant Cloud, LiveKit Cloud**. Optional: **trigger.dev** (scheduled nudges degrade gracefully if absent).

Required keys (Python agent side, server-only `agent/.env`): **Mistral API key** (Voxtral STT), **OpenRouter** (Mistral Small LLM), **OpenAI** (tts-1 TTS), **LiveKit** (token mint). The agent never reads from browser IndexedDB — these are deployment secrets that ride along with the agent process.

## Voice pipeline — three activation modes

1. **Tap** — click character or "Tap to talk" → inline listening state (transcript appears mid-card)
2. **Hold `K`** — keyboard shortcut from anywhere → modal listening (full-screen takeover, larger character, "Release K to send")
3. **Long-press** (mobile, 500ms) → modal listening with "Release to send"

Inline listening visual: watering can tilts → water droplets fall → soil darkens → sprout breathing accelerates → mouth opens "O" → 25-bar waveform appears below character → live transcript streams in italic Fraunces serif.

Modal listening: backdrop blurs (8px) + desaturates, modal scales 0.92→1.0, pulsing "Listening" indicator, status pill `● Voxtral · streaming STT`.

Every conversation persists to IndexedDB with full transcript, Mistral 2–3-sentence summary, extracted constraints, intent classification (`initial_planning` | `weekly_checkin` | `problem_report` | `general_chat`), in both JSON and Markdown.

After every session, regenerate `garden-context.json` (machine-readable, fed as context to every future LLM call — amnesia-free continuity) and `garden-context.md` (human-readable journal).

## Design system — exact tokens

**Colors (use these CSS variables; do not invent new ones without updating this section):**
```css
--paper: #f8f6f0;       --paper-cream: #fcfaf5;   --paper-warm: #f0ede0;
--card: #ffffff;
--ink: #1a2418;         --ink-soft: #2d3d2a;      --ink-muted: #5d6b4f;
--ink-faded: #8d9b7d;
--rule: #e8e4d6;        --rule-soft: #efebe0;
--forest: #2d3d2a;      --forest-deep: #1a3d2e;
--sage: #5a8a3a;        --sage-deep: #3a6240;
--lime: #c4dd58;        --lime-bright: #d4eb6a;   --lime-deep: #8fb340;
--terracotta: #c4825a;  --terracotta-deep: #a55a40;  --terracotta-soft: #d99878;
--water-blue: #6db4d4;
```

**Type:**
- **Inter Tight** 700 — headlines (`letter-spacing: -0.03em`)
- **Fraunces** 500 italic — emphasis (`<em>` inside headlines), variable opsz 9–144, SOFT axis
- **Inter** 400–600 — body, 15–16px base, line-height 1.5
- **IBM Plex Mono** 500–600 — technical labels, kbd keys

**Layout:** sticky topbar (Brand · Tabs[Today/Knowledge/Plan/Vision] · K hint · Settings) → hero grid (Sprout left, plan card right) → knowledge base section → garden vision section → settings (API keys) → floating K hint (desktop only).

## The Sprout character — animation contract

| State | Breathe | Leaves | Blink | Mouth | Extras |
|---|---|---|---|---|---|
| Idle | 4s cycle | 5s ±4° sway | every 5s | curved smile | none |
| Listening (inline) | 1.2s cycle | 1.6s ±10° | 3s cycle | "O" 24×13px | watering can + droplets, soil darkens, lime halo, waveform |
| Listening (modal) | same as inline | same | same | same | full-screen scrim, scale 0.92→1.0, "Release K to send" footer |

CSS-only animations, must hit 60fps on iPhone SE. Idle dimensions 280×320px; modal scaled to 240×280px.

## Responsive breakpoints (first-class requirement)

| Tier | Range | Behavior |
|---|---|---|
| Mobile | 320–640px | single-column, ≥44×44 touch targets, `100dvh`, safe-area insets, native camera capture, long-press for modal |
| Tablet | 641–1024px | two-column hero + KB, side-by-side photos |
| Desktop | 1025px+ | full layout, K-hold visible, floating K hint visible |
| Large | 1280px+ | max-width container |

Every feature works end-to-end on every tier — no desktop-only feature.

## Performance targets

| Operation | Target | Hard limit |
|---|---|---|
| First STT partial | <500ms | 1.5s |
| Voice → rendered plan | <8s | 15s |
| PDF ingest (28 pages) | <30s | 60s |
| Image gen (Nano Banana 2) | <8s | 20s |
| Image gen (GPT-Image) | <15s | 30s |
| Mobile LCP (4G) | <3s | 4s |

## Repo layout (target — most files don't exist yet)

```
/                       Next.js app (frontend + API routes)
  app/                    App Router pages + API routes
  components/             React components (Sprout character, plan card, voice UI…)
  lib/                    OpenRouter client, Qdrant helpers, IndexedDB schemas
  agent/                  Python LiveKit agent service (separate process)
  ingest/                 Python ingest pipeline (PDF → Qdrant)
  knowledge/              source PDFs (already present)
  public/
  .env.local              required keys (gitignored)
  agent/.env              agent service keys (gitignored)
```

## Conventions and rules of thumb

1. **Chat/embed/image AI calls go through OpenRouter** — single key, single SDK. **Audio APIs (STT/TTS) go direct to vendors** because OpenRouter doesn't proxy them: Voxtral STT via `https://api.mistral.ai/v1`, OpenAI TTS via `https://api.openai.com/v1`. Don't try to route audio through OpenRouter — `openai_plugin.STT(model="mistralai/voxtral-mini-realtime", base_url="…openrouter…")` will 400 with "model does not exist".
2. **Qdrant Discovery API for retrieval** — not plain similarity search. Constraints become positive/negative vectors. Plan must cite source chunk IDs (`Source: Ch. 3, p. 19`).
3. **Voice in, structured artifact out.** No chat threads in the UI. The plan, vision board, and shopping list are the deliverables.
4. **Mistral two-product stack must stay intact** — Voxtral STT + Mistral Small LLM. Don't swap these for cheaper alternatives without flagging it; the sponsor narrative depends on them. (TTS is OpenAI's `tts-1` because Mistral has no public TTS product yet.)
5. **Every plan is a new version** (`plan_version` 1, 2, 3…), with a `trigger_event` label and `parent_version` pointer. Never overwrite.
6. **`garden-context.json` is canon** — passed as context in every LLM call. Regenerate after every voice session.
7. **IndexedDB only for user data.** No server-side DB for sessions, plans, or transcripts. ZIP export/import is the migration path.
8. **Test buttons on every API key.** Status indicators: green (verified <24h), gray (not set), red (failed).
9. **No telemetry, no analytics.** This is part of the product promise.
10. **Submission deadline is hard.** June 1, 2026, 11:59 PM Pacific. Code freeze May 28; demo shoot May 29; edit May 30; README May 31.

## Verification before claiming "done"

- `npm run dev` boots without errors and home page renders
- Drop a PDF into the knowledge base → vectors appear in Qdrant within ~30s
- Tap to talk → real-time transcript renders → plan materializes within 15s
- Plan cites source chunks (visible "Source: Ch. X, p. Y" markers)
- Hold K from anywhere → modal listening overlay
- Reload page → plan, settings, gallery all persist (IndexedDB)
- Export ZIP → import in fresh browser profile → state restored
- Test on real iPhone or 320px-width browser pane: no horizontal overflow, touch targets ≥44px

## What NOT to do

- **No chatbot UI.** No persistent chat thread, no input box for follow-up questions. The competition rule is explicit.
- **No server-side user storage.** No Postgres, no user accounts, no auth. BYOK is the entire model.
- **Don't bypass OpenRouter.** Calling Mistral or OpenAI directly breaks the unified billing/key story and the sponsor narrative.
- **Don't pre-existing-ize this codebase.** All hackathon code must be written during the hackathon period — `git log` will be inspected.
- **Don't add backwards-compat shims.** This is a fresh build; rip and replace freely.

## Skills available in this repo

The [SKILLS/](SKILLS/) directory holds reusable Claude skills. Check there before reaching for general web search when the task touches one of these tools — the local skill is more current and tailored to this project.

| Skill | When to use |
|---|---|
| [SKILLS/skill-creator/](SKILLS/skill-creator/) | Authoring or editing any other skill. Always start here. |
| [SKILLS/openrouter/](SKILLS/openrouter/) | OpenRouter setup and usage — Python agents, ingest pipeline, MCP bridging, model slugs. All Sprout AI calls flow through OpenRouter; consult this skill when wiring any new model or service. |
| [SKILLS/playwright-mcp/](SKILLS/playwright-mcp/) | End-to-end testing the Sprout UI — voice flow, plan render, K-hold modal, mobile breakpoints. Browser automation, scraping, Playwright test generation. |
| [SKILLS/trigger-dev/](SKILLS/trigger-dev/) | Designing and shipping Trigger.dev v3 automations end-to-end (the weekly Sunday 9am nudge job and adaptive replan flow). High-level workflow patterns. |
| [SKILLS/cli/trigger-dev/](SKILLS/cli/trigger-dev/) | Concrete Trigger.dev CLI invocations (`npx trigger.dev dev`, `deploy`, `init`, env management). Pair with the workflow skill above. |
| [SKILLS/cli/vercel/](SKILLS/cli/vercel/) | Anything `vercel` CLI — deploys, `vercel env`, logs, rollback/promote, domains, DNS for the Next.js frontend demo. |
| [SKILLS/cli/livekit/](SKILLS/cli/livekit/) | LiveKit `lk` CLI — `cloud auth`, dev token creation, room debug joins, deploying and managing the Sprout Python voice agent (`lk agent create/deploy/update-secrets/logs/rollback`), egress, load testing, `lk docs` search. |

Planned (not yet installed): `openrouter`, `qdrant-ingest`, `livekit-agent`. See [SKILLS/README.md](SKILLS/README.md).

## Logs

When you make non-trivial changes, append a dated entry to [CHANGELOG.md](CHANGELOG.md). Format: `## YYYY-MM-DD — Title` then a short bullet list.
