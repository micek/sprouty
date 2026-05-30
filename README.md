# Sprouty 🌱

[![Sprouty — Demo Video](public/Sprouty%20-%20YouTube%20Thumbnail.png)](https://youtu.be/DPgmu28xSec)

![Sprouty — voice-first garden coach](public/Sprouty%20-%20Readme.png)

**Voice-first garden coach for first-time growers.** Drop in a gardening PDF, talk to Sprouty for 90 seconds about your space, and get a personalized 12-week plan with weekly tasks, a shopping list, and an AI-generated vision of your future garden.

> _"From 'I have no idea where to start' to a 12-week vegetable garden plan in 90 seconds of voice."_

Built for the **Qdrant "Think Outside the Bot" Hackathon — Vector Space Day 2026**.

- **Submission deadline:** June 1, 2026 · 11:59 PM Pacific
- **Demo video:** https://youtu.be/DPgmu28xSec

---

## The "Think Outside the Bot" angle

The hackathon prohibits chatbots. **Sprouty is voice-in, artifact-out.** You speak to it; it produces a structured plan — a 12-week timeline, a crop list, a shopping list, and a generated vision board. There is no chat thread, no follow-up text input. Subsequent interactions are scheduled by the system (weekly trigger.dev cron → voice push notification), not user-initiated. Vector search is in the critical path of every plan it generates.

---

## Core features

- **Voice intake** — describe your patio, your time, your goals. Voxtral Mini Realtime streams transcription via OpenRouter; Silero VAD handles turn detection.
- **Personalized plan** — Mistral Small extracts constraints; Qdrant Discovery API runs hybrid (dense + BM25 sparse) retrieval over your knowledge base; Mistral Small generates a 12-week plan that cites source chunks (`Source: Ch. 3, p. 19`).
- **Knowledge base** — drag any gardening PDF. It's chunked semantically, embedded with `text-embedding-3-small` (1536-d), and upserted to Qdrant Cloud with rich metadata (chapter, page, crops mentioned, difficulty, seasons).
- **Garden vision** — upload a photo of your space; Gemini Nano Banana 2 (or GPT-Image as alt) generates what it could look like in week 12.
- **Scheduled nudges** — trigger.dev cron fires every Sunday with a Voxtral TTS voice message via web push. User reply → adaptive replan.
- **Three activation modes** — tap, hold `K` from anywhere, or long-press the Sprouty character on mobile.
- **Privacy-first BYOK** — all keys client-side (Web Crypto in IndexedDB). Sessions, plans, and gallery never touch a Sprouty-owned server. Full ZIP export/import.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (React 19, TypeScript 5, Tailwind 4), zustand, dexie, framer-motion, livekit-client |
| Voice agent | Python LiveKit Agents + livekit-plugins-openai + livekit-plugins-silero (VAD) |
| AI gateway | **OpenRouter** (single key for STT, LLM, TTS, embeddings, image gen) |
| Vector DB | **Qdrant Cloud** — hybrid search, Discovery API, 1536-d dense + BM25 sparse |
| Real-time | LiveKit Cloud (WebRTC + audio routing) |
| Scheduled jobs | trigger.dev |
| Hosting | Vercel (frontend + API routes), Railway / LiveKit Cloud Agent Workers (Python agent) |

### Models used (all via OpenRouter)

| Model | OpenRouter ID | Role |
|---|---|---|
| Voxtral Mini Realtime | `mistralai/voxtral-mini-realtime` | Streaming STT |
| Mistral Small | `mistralai/mistral-small` | Constraint extraction + plan generation |
| Voxtral Mini TTS | `mistralai/voxtral-mini-tts` | Plan summary speech |
| Mistral Small Multimodal | `mistralai/mistral-small-multimodal` | Photo analysis |
| OpenAI text-embedding-3-small | `openai/text-embedding-3-small` | 1536-d dense vectors |
| Gemini Nano Banana 2 | `google/gemini-3.1-flash-image-preview` | Vision board (default) |
| GPT-Image (5.4) | `openai/gpt-5.4-image-2` | Vision board (alt) |

### Mistral sponsor bonus

Three Mistral products in the critical path: **Voxtral STT + Mistral Small LLM + Voxtral TTS**. Every voice → plan flow exercises all three.

---

## Quick start

### Prerequisites

You'll need accounts for:

- **OpenRouter** — https://openrouter.ai (~$5–10 of credit covers a full demo session)
- **Qdrant Cloud** — https://cloud.qdrant.io (free 1GB tier is enough)
- **LiveKit Cloud** — https://livekit.io (free tier works)
- **trigger.dev** — https://trigger.dev (optional, only for scheduled nudges)
- **Node.js 20+** and **Python 3.11+**

### 1. Clone and install

```bash
git clone <repo-url> sprout
cd sprout
npm install
```

For the Python agent service:

```bash
cd agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment

Copy `.env.example` → `.env.local` and fill in your keys:

> **🔒 NEVER commit real keys.** `.env.local` and `agent/.env` are gitignored. Before your first push, install the secret-scanning hooks below.

```bash
# AI gateway (required)
OPENROUTER_API_KEY=sk-or-v1-...

# Vector DB (required)
QDRANT_URL=https://xxxxx.cloud.qdrant.io
QDRANT_API_KEY=...

# Real-time voice (required)
LIVEKIT_URL=wss://xxxxx.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
NEXT_PUBLIC_LIVEKIT_URL=wss://xxxxx.livekit.cloud

# Scheduled nudges (optional)
TRIGGER_API_KEY=tr_pat_...
TRIGGER_PROJECT_ID=proj_...

# Web push for nudges (optional)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...

# Local dev
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:8000
```

The Python agent reads its own `agent/.env` — same OpenRouter / LiveKit / Qdrant keys plus the Mistral model IDs (see [CLAUDE.md](CLAUDE.md) for the full list).

### 3. Ingest the included gardening books

```bash
python ingest/ingest.py knowledge/
```

This chunks every PDF in `knowledge/` (currently *Green-Thumb Beginnings* and *The Modern Victory Garden*), embeds via OpenRouter, and upserts to the `sprout_kb` Qdrant collection. Takes ~30s per 28-page book.

### 3a. Install the secret-scanning git hooks (one-time, do this before your first commit)

This repo ships pre-commit and pre-push hooks that scan for likely API keys and abort the operation if any are found. They live in `.githooks/` (versioned) so the whole team gets the same protection.

```bash
# Tell git to use this repo's hooks dir
git config core.hooksPath .githooks
```

That's it. From now on:

- **`git commit`** runs `scripts/check-secrets.sh --staged` against the staged diff.
- **`git push`** runs the same scanner against the entire working tree as a final safety net before anything reaches GitHub.

You can also run a manual scan any time:

```bash
scripts/check-secrets.sh
```

It checks for OpenRouter / OpenAI / Anthropic / Google / trigger.dev / GitHub / Slack / AWS / Stripe keys, JWTs, and any high-entropy `*_SECRET` / `*_TOKEN` / `*_API_KEY` assignment, while ignoring `.example` templates and the `knowledge/` PDFs.

### 3b. (Optional) Belt-and-suspenders: Claude Code hook

If you use Claude Code on this repo, you can have Claude refuse to run `git commit` / `git push` / `gh pr create` / `gh repo create` until the scanner passes. Add this to **`.claude/settings.json`** in this repo (Claude can't self-modify its own hook config, so create the file yourself):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash $CLAUDE_PROJECT_DIR/scripts/claude-pretooluse-secrets.sh" }
        ]
      }
    ]
  }
}
```

The wrapper at `scripts/claude-pretooluse-secrets.sh` is already in the repo. After saving, reload Claude Code (`/hooks` shows whether it loaded).

### 4. Run it

```bash
# Terminal 1 — Next.js
npm run dev

# Terminal 2 — LiveKit agent
cd agent && python agent.py
```

Open http://localhost:3000, drop in your keys via the Settings panel (or rely on `.env.local`), tap the Sprouty character, and tell it about your space.

---

## How vector search powers the plan

1. The voice transcript hits Mistral Small with a constraint-extraction prompt → structured JSON (`space_type`, `sun_hours`, `time_per_week_hours`, `goals`, `dislikes`, `climate_zone`).
2. Constraints are converted into **positive vectors** ("what the user wants") and **negative vectors** ("what to avoid").
3. **Qdrant Discovery API** runs a hybrid query against `sprout_kb`:
   - dense (`text-embedding-3-small`) + BM25 sparse fusion
   - filtered to `difficulty_rating ≤ 3` for first-time gardeners
   - prefers chunks tagged with the user's goal crops, demotes ones tagged with their dislikes
4. The top retrieved chunks become grounding context for plan generation. Each task in the resulting plan keeps its `source_chunk` ID so the UI can show **"Source: Ch. 3, p. 19"** under every recommendation.
5. Adaptive replans (e.g., user reports "my lettuce has holes") run a fresh Discovery query with the problem as a positive vector and previously-rejected paths as negative vectors. Each replan creates a new `plan_version` with a `parent_version` pointer.

This means Qdrant isn't a passive index — its **Discovery API and hybrid scoring directly shape every plan**.

---

## Repo layout

```
/                       Next.js app (App Router)
  app/                    pages + API routes
  components/             React components (Sprouty character, plan card, voice UI)
  lib/                    OpenRouter client, Qdrant helpers, IndexedDB schemas
  agent/                  Python LiveKit agent service
  ingest/                 Python ingest pipeline (PDF → Qdrant)
  knowledge/              source PDFs (gardening books)
CLAUDE.md               orientation for AI assistants
CHANGELOG.md            running log of changes
README.md               this file
```

---

## Third-party dependencies

**npm:** `next` 15.x, `react` 19, `typescript` 5, `tailwindcss` 4, `livekit-client` 2.x, `@livekit/components-react` 2.x, `@qdrant/js-client-rest`, `openai`, `pdf-parse`, `mammoth`, `@trigger.dev/sdk`, `livekit-server-sdk`, `web-push`, `zustand` 5.x, `dexie` 4.x, `jszip` 3.x, `react-dropzone` 14.x, `framer-motion` 11.x, `react-photo-view` 1.x, `lucide-react`.

**Python:** `livekit-agents`, `livekit-plugins-openai`, `livekit-plugins-silero`, `python-dotenv`, `pypdf`, `qdrant-client`, `openai`, `langchain-text-splitters`.

**Hosted services:** OpenRouter, Qdrant Cloud, LiveKit Cloud, trigger.dev, Vercel.

**Source content (in `knowledge/`):** Two free, open-source eBooks published by [BrightLearn AI](https://brightlearn.ai/). These are the gardening books ingested into Qdrant as Sprouty's knowledge base — full credit to their authors:

- ***Green-Thumb Beginnings: A Foolproof Guide to Starting Your First Vegetable Garden*** by **Thomas L. McAmis** — [free download](https://books.brightlearn.ai/Green-Thumb-Beginnings-A-Foolproof-Guide-to-Starting-2daf96141-en/index.html)
- ***The Modern Victory Garden: A Homesteader's Guide to Abundant Harvests*** by **Chief Bollinger, USN Meteorologist (Ret.)** — [free download](https://books.brightlearn.ai/The-Modern-Victory-Garden-A-Homesteaders-Guide-to-06732d7d8-En/index.html)

### Attribution & open-source licenses

Every dependency above is used unmodified via its public package registry (npm / PyPI) and remains under its own license — predominantly **MIT** and **Apache-2.0**, with a few BSD/ISC. No third-party source was copied into this repo; all of it is pulled at install time, so each package's `LICENSE` ships in `node_modules/<pkg>` or the Python `.venv` and is not relisted here. Sprouty's own code is MIT (see [LICENSE](LICENSE)).

Specific acknowledgements:
- **Qdrant** — vector database + Discovery/Recommendation APIs (`@qdrant/js-client-rest`, `qdrant-client`), Apache-2.0
- **LiveKit** — WebRTC + Agents framework (`livekit-client`, `livekit-server-sdk`, `livekit-agents`, plugins), Apache-2.0
- **Mistral** — Voxtral STT + Mistral Small LLM, accessed as a service (no bundled code)
- **OpenRouter** — unified AI gateway, accessed as a service
- **OpenAI / Google** — `tts-1` and Gemini image generation, accessed as services
- **Vercel** (Next.js) and **Tailwind Labs** (Tailwind CSS), MIT

The two gardening books in `knowledge/` are **free, open-source eBooks** from [BrightLearn AI](https://brightlearn.ai/), used to demonstrate the ingest → retrieval pipeline. Credit to their authors — Thomas L. McAmis (*Green-Thumb Beginnings*) and Chief Bollinger, USN Meteorologist Ret. (*The Modern Victory Garden*); see the **Source content** list above for free download links.

---

## Privacy commitment

- API keys are stored in your browser only, encrypted with the Web Crypto API. They never reach a server we control.
- Voice audio is transient — it streams through LiveKit Cloud to OpenRouter and is discarded on hangup.
- All sessions, plans, transcripts, and generated images live in **IndexedDB** in your browser.
- Vector embeddings live in *your* Qdrant Cloud instance.
- Export your entire garden as a ZIP at any time, or wipe everything in one click.
- No analytics, no tracking, no telemetry beyond what AI providers log on their side.

---

## Submission details

| Field | Value |
|---|---|
| Hackathon | Qdrant "Think Outside the Bot" — Vector Space Day 2026 |
| Submission form | https://try.qdrant.tech/hackathon-vsd |
| Deadline | June 1, 2026 · 11:59 PM Pacific (UTC-7) |
| Winners announced | June 11, 2026 (Vector Space Day SF) |
| Repo shared with | @kanungle |
| Demo video | https://youtu.be/DPgmu28xSec |
| Team | _TBA_ |

### Judging criteria addressed

- **Functionality** — voice intake → constraint extraction → Qdrant retrieval → plan → vision board → scheduled nudge, all wired end-to-end.
- **Originality** — voice as the only input modality; structured artifacts (not chat) as the output; Discovery API used for constraint-aware retrieval, not plain similarity.
- **User experience** — single home screen, character-driven affordance, three activation modes (tap/K-hold/long-press), responsive 320px → desktop, captioned voice, BYOK with test buttons.

### "Material use of Qdrant"

Qdrant is the planning brain. Every recommendation in the plan is grounded in a Qdrant chunk via Discovery-API hybrid retrieval. Plans cite source chunks; replans run constraint-aware Discovery queries against rejected/accepted history. We use:

- `@qdrant/js-client-rest` from Next.js API routes for retrieval
- `qdrant-client` (Python) for ingest
- Hybrid dense (1536-d cosine) + BM25 sparse vectors in `sprout_kb`
- Discovery API with positive/negative pairs derived from the voice constraints
- Recommendation API for "more like the crops you've approved"

### Eligibility statement

All participants are 18+; code in this repo was written during the hackathon period (May 4 – June 1, 2026) and shared only within the registered team. We grant Qdrant a non-exclusive, worldwide, royalty-free, sublicensable, transferable license for marketing, education, and promotional use as required by the hackathon rules.

---

## App screenshot

![Sprouty — full webapp](public/Sprouty%20-%20Qdrant%20Hackathon%202026.png)

---

## For judges and reviewers

If you just want to clone the repo and try Sprouty locally, the fastest path is in [CONTRIBUTING.md → Run it in 60 seconds](CONTRIBUTING.md#run-it-in-60-seconds). That walks you through the keys you need, how to ingest the bundled gardening PDFs, and two ways to drive the planning pipeline (typed-transcript modal for the no-microphone path, or the full LiveKit voice flow with the Python agent in a second terminal).

Every Settings panel row has a **Test** button that surfaces the exact upstream error for each service if a key is bad — easiest way to tell at a glance whether the cluster, the LLM gateway, and the LiveKit cluster are all reachable from your environment.

## License

The code in this repository is © Cory Micek and licensed under the MIT License — see [LICENSE](LICENSE). Per the hackathon rules, Qdrant has a perpetual non-exclusive license to use this submission for marketing and educational purposes. Source PDFs in `knowledge/` are reproduced under their original licenses for the purposes of the hackathon demo only.

---

## Created by

**Cory Micek**
[mysickbuilds.com](https://mysickbuilds.com) · [hi@mysickbuilds.com](mailto:hi@mysickbuilds.com)

---

## Acknowledgements

- **Qdrant** for the hackathon, the vector DB, and the Discovery API
- **Mistral** for Voxtral and Mistral Small via OpenRouter (sponsor bonus track)
- **LiveKit** for the WebRTC + Agents framework
- **OpenRouter** for the unified AI gateway
- **trigger.dev** for the scheduled jobs
- **Google** for Gemini Nano Banana 2
- **OpenAI** for GPT-Image 5.4 (Images 2) — vision board alternate generation

---

_Questions? See [CLAUDE.md](CLAUDE.md) for the deeper technical orientation, or [sprout_prd.md](sprout_prd.md) for the full product spec._
