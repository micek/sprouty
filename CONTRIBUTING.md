# Contributing to Sprouty

Sprouty is a hackathon submission for **Qdrant "Think Outside the Bot" — Vector Space Day 2026**. The codebase is intentionally small and the code freeze is May 28, 2026; submission deadline is June 1, 2026.

This document is for two audiences:

1. **Judges and reviewers** who want to clone the repo and try it locally — see [Run it in 60 seconds](#run-it-in-60-seconds) below.
2. **Contributors** sending small fixes during or after the hackathon — see [Project conventions](#project-conventions).

---

## Run it in 60 seconds

You'll need:

- Node 22+, pnpm or npm
- Python 3.11+ (for the voice agent only)
- Five accounts with API keys: **OpenRouter**, **Qdrant Cloud**, **LiveKit Cloud**, **Google AI Studio** (or OpenAI), and **trigger.dev** (optional)

```bash
git clone https://github.com/<owner>/sprouty.git
cd sprouty
npm install                          # frontend deps
cp .env.example .env.local           # then edit with your keys
npm run dev                          # http://localhost:3000
```

Drop one of the bundled gardening PDFs from `knowledge/` into the Knowledge Base panel — within ~30 seconds you'll see "Vectorized · 42v" in the sidebar. Then either:

- **Type a plan** — the "or type a description to test the plan →" link inside the voice card opens a modal with three sample transcripts; pick one, hit Generate, watch the Today tile rerender. No microphone needed.
- **Talk to it** — start the Python agent in a second terminal:

```bash
cd agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                 # paste the same keys
python agent.py dev
```

Then back in the browser, hit **Tap to talk** (or hold `K`) — the agent picks up the room, you have a 30-second conversation, and the plan generates from the live transcript when the session ends.

If anything fails, the **Test** buttons in the Settings panel surface the exact upstream error for each service.

---

## Project conventions

### Source-of-truth docs

These override anything in this CONTRIBUTING.md or in the README:

- [CLAUDE.md](CLAUDE.md) — project orientation: tech stack, architecture, design tokens, performance targets, do-not-do list.
- [sprout_prd.md](sprout_prd.md) — full PRD with schemas and the week-by-week build plan.
- [TODO.md](TODO.md) — running list of what's shipped vs. what's open, updated alongside every commit.

### Code style

- **TypeScript everywhere** on the frontend / API routes. Run `npx tsc --noEmit` before committing — it must pass clean.
- **Python 3.11+** for the agent / ingest pipeline. We're not strict about formatting tooling for the hackathon, but follow standard PEP 8.
- **No `any`** in new code unless there's a comment explaining why. The defensive response parsers in `app/api/vision/route.ts` are the only sanctioned exceptions.
- **Comments earn their place.** Default to no comments; add one when the *why* is non-obvious (a hidden constraint, a workaround for a specific bug, a trade-off).

### Commits

- Branch from `main`, PR back to `main`. Keep PRs small.
- Update [CHANGELOG.md](CHANGELOG.md) with a dated entry for any non-trivial change. Format documented at the top of that file.
- Update [TODO.md](TODO.md) when you complete a checkbox or add a new one.
- Hooks: `.githooks/pre-commit` runs `scripts/check-secrets.sh --staged`; the same script runs on `pre-push`. Both are mandatory — install with `git config core.hooksPath .githooks` once after cloning.

### Privacy stance — don't break it

Sprouty's privacy commitment is non-negotiable: **no user data on any server we control**. That means:

- Sessions, plans, vision images, garden context, and encrypted API keys live in IndexedDB only.
- API keys are wrapped with a non-extractable AES-GCM master key in `lib/crypto.ts`. They never go to a Sprouty-owned server. They DO ride along as `x-*` headers to OpenRouter / Qdrant / LiveKit on a per-request basis.
- The only exception is `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`, which are server-side `.env` because client-side LiveKit creds would let anyone mint tokens for any room. These are deployment secrets, not user data.

If you're adding a feature that wants to store something user-personal, route it through `lib/db.ts` (Dexie) and `lib/crypto.ts` if it's sensitive. Don't add a server table. Don't add analytics or telemetry.

### Single AI gateway

All AI calls go through **OpenRouter** — no direct Mistral / OpenAI / Google API calls. One key, one billing path, one client. See `lib/openrouter.ts` and `lib/models.ts`. The Mistral sponsor stack (Voxtral STT + Mistral Small LLM + Voxtral TTS) lives at the heart of the voice flow; don't swap it for cheaper alternatives without a deliberate conversation.

### What's out of scope for the hackathon

- Server-side user accounts, auth, or sync.
- A chat UI. Sprouty is voice-in, structured-artifact-out — that's the hackathon's "no chatbot" angle.
- Cross-device sync via a Sprouty backend. Use ZIP export/import (`Settings → Export ZIP`) instead.
- Anything backwards-compatibility-related — this is a fresh build, rip and replace freely.

---

## Reporting bugs / asking questions

During the hackathon period, open a GitHub issue on the repo. After June 1, 2026 the project may be archived; check the README for current contact info.

**Author:** Cory Micek · [hi@mysickbuilds.com](mailto:hi@mysickbuilds.com) · [mysickbuilds.com](https://mysickbuilds.com)
