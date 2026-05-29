# Sprouty — TODO

Hackathon submission deadline: **June 1, 2026 · 11:59 PM Pacific.**
Code freeze May 28 · demo shoot May 29 · edit May 30 · README polish May 31.

This document is the running punch-list. Mark items off as they ship and update [CHANGELOG.md](CHANGELOG.md) when significant phases land. Source-of-truth specs: [sprout_prd.md](sprout_prd.md), [CLAUDE.md](CLAUDE.md), [.local/sprout_brief.html](.local/sprout_brief.html).

Legend: `[ ]` open · `[~]` in progress · `[x]` done · `[!]` blocked.

---

## Phase 0 — Done so far

- [x] Project docs scaffolded (CLAUDE, README, CHANGELOG, .env templates)
- [x] Secret-leak scanner + git hooks
- [x] SKILLS folder with 6 skills (skill-creator, openrouter, playwright-mcp, trigger-dev, cli/trigger-dev, cli/vercel, cli/livekit)
- [x] Next.js 15 / React 19 / TS 5 / Tailwind 4 scaffold
- [x] Design tokens, fonts, idle home page
- [x] All visual sections (TopBar, VoiceCard, PlanCard, KnowledgeBase, PhotoVision, SettingsKeys, FloatingKbd, AppFooter)
- [x] Sprout character with idle + listening animations
- [x] Topbar nav with framer-motion pill slide + scroll-to-section
- [x] Drag-and-drop UI in Knowledge Base (PDF / TXT / MD / images, react-dropzone)
- [x] Inline + modal listening states (K-hold ≥200ms, Escape, Tap-to-talk, click Sprout)
- [x] Dexie schema scaffold + zustand store stub

---

## Phase 1 — BYOK persistence + key tests (foundation for everything else)

Without these, no AI / vector / voice integration can run end-to-end.

### Web Crypto + IndexedDB persistence
- [x] [lib/crypto.ts](lib/crypto.ts) — Web Crypto AES-GCM encrypt/decrypt helpers; non-extractable 256-bit master key generated once per browser and stored via IndexedDB structured cloning (cannot be exported / leaked) *(2026-05-05)*
- [x] [lib/keys.ts](lib/keys.ts) — `saveKey` / `loadKey` / `loadAllKeys` / `recordTestResult` / `deleteKey` wrappers that go through `lib/crypto.ts` then `lib/db.ts → keys` table; `isTestFresh` powers the 24h green-dot rule *(2026-05-05)*
- [x] Wire SettingsKeys card Save button to `saveKey(id, value)` + flash "Saved ✓" on success (with a Saving spinner while the encrypt round-trips) *(2026-05-05)*
- [x] On mount, hydrate SettingsKeys from IndexedDB (decrypted into local UI state for editing — never echo plaintext back to the server) *(2026-05-05)*
- [x] Connect badge dots: green if `lastTestedAt` within 24h and `testStatus === "ok"`, red if last test failed, gray if no value or never tested *(2026-05-05)*

### Test buttons (per-key handlers)
- [x] **OpenRouter** — `GET https://openrouter.ai/api/v1/key` (or models list) with `Authorization: Bearer <key>` *(2026-05-05)*
- [x] **Qdrant Cloud** — `GET ${NEXT_PUBLIC_QDRANT_URL}/collections` with `api-key` header *(2026-05-05)*
- [ ] **LiveKit Cloud** — needs server route at `/api/livekit/test` (Twirp endpoints aren't browser-CORS-friendly)
- [x] **Google AI Studio** — `GET https://generativelanguage.googleapis.com/v1beta/models?key=<key>` *(2026-05-05)*
- [x] **OpenAI** — `GET https://api.openai.com/v1/models` *(2026-05-05)*
- [x] **trigger.dev** — `GET https://api.trigger.dev/api/v1/projects/<NEXT_PUBLIC_TRIGGER_PROJECT_ID>` with bearer *(2026-05-05)*
- [ ] All test calls run from the **client** (BYOK rule — keys never reach our server). Use `fetch` directly, not Next.js routes.
- [ ] On success, write `lastTestedAt = Date.now()` and `testStatus = "ok"` to IndexedDB.

### ZIP export / import (privacy commitment)
- [x] [lib/portable.ts](lib/portable.ts) — `exportZip()` + `downloadExport()` pack `sessions`, `plans`, `files` (with original blobs under `files/<id>.bin`), `visions` (with PNGs under `visions/<id>.png`), `context` into a `.zip` with a versioned `manifest.json`. **`keys` is intentionally omitted** — non-extractable AES-GCM master key would need a passphrase + KDF re-wrap to be portable; user re-enters credentials once on the destination device (same trade Bitwarden makes with unencrypted JSON exports). *(2026-05-05)*
- [x] `importZip(file)` — parses, validates `manifest.app === "sprouty"` and schema-version compat, restores all five tables inside a single Dexie transaction so a failed import doesn't leave the user with a half-restored DB. *(2026-05-05)*
- [x] Settings panel "Import ZIP" / "Export ZIP" buttons in the footer with inline status flash (✓ "Exported 3 plans, 2 files (412 KB)" / ✗ error message). Hidden `<input type="file">` driven by a styled button; `window.confirm` before destructive import. *(2026-05-05)*

---

## Phase 2 — OpenRouter client (single AI gateway)

All AI calls flow through OpenRouter — no direct vendor calls anywhere.

- [x] [lib/openrouter.ts](lib/openrouter.ts) — wraps the `openai` npm SDK pointed at `https://openrouter.ai/api/v1`, accepts an API key argument (read from IndexedDB on the client; from env on the server) *(2026-05-05)*
- [x] [lib/models.ts](lib/models.ts) — exported constants for the 7 model IDs (Voxtral STT/TTS, Mistral Small, Mistral Small Multimodal, text-embedding-3-small, Gemini Nano Banana 2, GPT-Image 5.4) *(2026-05-05)*
- [x] Helper: `embed(text)` + `embedBatch(inputs)` → 1536-dim vectors via `openai/text-embedding-3-small` *(2026-05-05)*
- [x] Helper: `chat(messages, key, opts)` + `chatJson<T>(...)` + `streamChat(...)` → completion / structured / streaming via `mistralai/mistral-small` *(2026-05-05)*
- [ ] Helper: `imageGen(prompt, photoBlob, engine)` → returns image blob from Gemini Nano Banana 2 (default) or GPT-Image (alt). *Deferred — image-gen response shape varies by model; wire when building the Garden Vision route.*
- [ ] Reference: [SKILLS/openrouter/SKILL.md](SKILLS/openrouter/SKILL.md)

---

## Phase 3 — Qdrant collection + retrieval

- [x] [lib/qdrant.ts](lib/qdrant.ts) — `@qdrant/js-client-rest` wrapper, BYOK + env fallback, payload-index creation *(2026-05-05)*
- [x] `ensureCollection()` — creates `sprout_kb` if missing with hybrid config: dense (1536-cos) + BM25 sparse `modifier: "idf"`. Idempotent — safe to call on every ingest *(2026-05-05)*
- [x] `discover({ positives, negatives, maxDifficulty, crops, seasons, limit })` — Discovery API helper using context pairs (positive ↔ negative). Default beginner-difficulty cap of 3 *(2026-05-05)*
- [x] `recommend(seedIds, limit)` — Recommendation API helper for "more like the crops you've approved" *(2026-05-05)*
- [x] Hybrid scoring is built in via Qdrant's Discovery API + payload filters; BM25 sparse vector fusion handled server-side via the `idf` modifier *(2026-05-05)*

---

## Phase 4 — Knowledge-base ingest pipeline

Currently the dropzone stages files in local state with status `queued`. Wire it through to actual ingest + Qdrant upsert.

### Server-side route
- [x] [app/api/ingest/route.ts](app/api/ingest/route.ts) — POST multipart, accepts: `file` + the user's OpenRouter & Qdrant keys (sent in `x-openrouter-key` / `x-qdrant-url` / `x-qdrant-key` headers; never persisted, never logged). Falls back to env vars when headers are absent (dev convenience). *(2026-05-05)*
- [x] PDF text extraction via `pdf-parse` (lazy-imported in the handler so it never reaches client bundles) *(2026-05-05)*
- [x] Markdown / plain text passes through (`File.text()`) *(2026-05-05)*
- [ ] Images: send to `mistralai/mistral-small-multimodal` for caption + structured topics, then embed the caption text *(stub left in `extractText` — Phase 4 follow-up)*
- [x] Semantic chunker: ~1000 chars, ~200 overlap, split on chapter/heading boundaries (markdown headings, all-caps lines, "Chapter N" patterns), with paragraph + sentence fallbacks. See [lib/chunk.ts](lib/chunk.ts). *(2026-05-05)*
- [x] Embed chunks via OpenRouter `text-embedding-3-small` (one batch call per file) *(2026-05-05)*
- [x] Build payload per [CLAUDE.md](CLAUDE.md): currently writes `text`, `source_doc`, `chapter`, `chunk_type`, `indexed_at`, `embedding_model`. Remaining payload fields (`crops_mentioned`, `difficulty_rating`, `time_investment_hours`, `space_required_sqft`, `seasons`, `topics`) need an LLM-classification pass on each chunk. *(partial)*
- [x] Upsert to Qdrant `sprout_kb` (idempotent — same chunk index overwrites) *(2026-05-05)*
- [ ] Stream progress (SSE or chunked response) so the UI shows fine-grained progress within "processing"

### Client-side wiring
- [x] In [knowledge-base.tsx](components/knowledge-base.tsx) `onDrop`, each accepted file is staged in IndexedDB then driven through [`ingestKnowledgeFile`](lib/knowledge-files.ts) which POSTs to `/api/ingest` and updates the file's status (`processing → indexed` with `vectorCount` + `pages`, or `failed` with the error message). *(2026-05-05)*
- [x] Status updates flow through `updateKnowledgeFileStatus` — `useLiveQuery` re-renders the UI automatically *(2026-05-05)*
- [x] Indexed files persist to Dexie `files` table with original `blob`; rehydrate on mount via the same `useLiveQuery` *(2026-05-05)*
- [x] Pass the user's BYOK keys via headers to `/api/ingest` (`loadAllKeys()` in `components/knowledge-base.tsx` → `x-openrouter-key` / `x-qdrant-key`; URL still comes from `NEXT_PUBLIC_QDRANT_URL` until we add a config field). *(2026-05-05)*

### Standalone Python ingest (for the seed PDFs)
- [ ] `ingest/ingest.py` — pypdf + langchain-text-splitters + qdrant-client + openai (per-OpenRouter)
- [ ] `python ingest/ingest.py knowledge/` — chunks every PDF in `knowledge/`, embeds, upserts to `sprout_kb`. ≤30s per 28-page book per [CLAUDE.md](CLAUDE.md) target.
- [ ] `requirements.txt` for the ingest pipeline

---

## Phase 5 — LiveKit + Python voice agent

### LiveKit token mint (Next.js side)
- [x] [app/api/livekit/token/route.ts](app/api/livekit/token/route.ts) — POST mints a 10-min join token via `livekit-server-sdk`'s `AccessToken`. Reads `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` from env (server-only — these are deployment secrets, not BYOK). Optional body fields: `roomName`, `identity`, `name`, `metadata`, `ttlSeconds` (clamped 60-3600). Grants `roomJoin + canPublish + canSubscribe + canPublishData`. *(2026-05-06)*
- [x] [app/api/livekit/test/route.ts](app/api/livekit/test/route.ts) — server-side proxy for the Settings panel's LiveKit Test button. Calls `RoomServiceClient.listRooms()` against the configured cluster — exercises the credentials end-to-end (not just JWT signing) and reports active room count on success. *(2026-05-06)*
- [x] [lib/test-keys.ts](lib/test-keys.ts) — `testLiveKit()` proxies through the new test route; the SettingsKeys panel's switch + button gate now treats LiveKit as the one credential where the local `value` is ignored (server-side env-only). *(2026-05-06)*
- [x] Room naming: per-user `sprouty-{identity}` so each conversation is isolated. Default identity is `sprouty-{uuid}` when the caller doesn't pin one. *(2026-05-06)*
- [x] Identity persistence: deviceId persisted in localStorage via [lib/device.ts](lib/device.ts), forwarded as the LiveKit identity so returning callers keep the same handle. *(2026-05-07)*

### Python LiveKit agent (`agent/`)
- [ ] `agent/agent.py` — entrypoint using `livekit-agents`
- [ ] STT: `livekit-plugins-openai` with OpenRouter base URL → `mistralai/voxtral-mini-realtime`
- [ ] LLM: same plugin → `mistralai/mistral-small`
- [ ] TTS: `mistralai/voxtral-mini-tts`
- [ ] VAD: `livekit-plugins-silero` (1.5s silence = end-of-turn)
- [ ] System prompt: includes `garden-context.json` so every response is amnesia-free
- [ ] Constraint extraction in conversation flow
- [ ] After end-of-turn silence: classify intent, summarize, extract constraints, persist via callback to Next.js
- [ ] `agent/requirements.txt`
- [ ] `agent/.env` with model IDs (already templated in `.env.example`)

### Browser ↔ agent wiring
- [ ] On listening start (inline or modal), connect a LiveKit room via `livekit-client`
- [ ] Stream STT deltas into `useAppStore.appendLiveTranscript()` so the inline + modal transcripts show real text
- [ ] On disconnect / "Stop & send", finalize the transcript and post to `/api/sessions` for plan generation
- [ ] Reference: [SKILLS/cli/livekit/SKILL.md](SKILLS/cli/livekit/SKILL.md) for `lk agent create / deploy / update-secrets`

---

## Phase 6 — Plan generation + display

- [x] [app/api/plan/route.ts](app/api/plan/route.ts) — given a session transcript + user's keys, runs (with NDJSON streamed progress events): *(2026-05-05)*
  1. Constraint extraction — Mistral Small in JSON mode emits `{ crops, spaceDescription, hoursPerWeek, goals, region, intent }`. Crops are matched against the canonical `COMMON_HOME_CROPS` dictionary so the downstream prompt has stable identifiers.
  2. Discovery API query — embeds a positive ("growing X, in Y space, Z hours/week") and a negative ("advanced commercial techniques, greenhouse-only…"), runs `discover()` against Qdrant `sprout_kb` with crop filter; falls back to unfiltered Discovery if the filter returns zero hits (early-stage KB safety).
  3. Plan generation — Mistral Small (temp 0.3, 4000 max tokens) gets the transcript, the extracted constraints, the exact week start/end dates for the upcoming 12 weeks, and the retrieved chunks as a citable source block. Returns strict JSON with 12 weeks × 3-5 tasks, sourceChunkId + "Ch. X · Section · p. Y" citations, plus a 4-8 item shopping list.
  4. TTS summary (Voxtral) of the plan — *deferred to LiveKit voice agent so the audio flows back through the live channel.*
- [x] Persist plan to Dexie `plans` table with `version`, `parentVersion`, `triggerEvent`, `createdAt` — handled in [lib/plan-generation.ts](lib/plan-generation.ts) inside a single Dexie transaction alongside the session + merged garden context. Plan version always increments off the previous highest. *(2026-05-05)*
- [ ] Update [PlanCard](components/plan-card.tsx) to read from `useLiveQuery(() => db().plans.orderBy("version").last())`. *Already does this via `useActivePlan()`. New voice-driven plans will surface automatically; needs a visual when version > 1 lands.*
- [x] 12-week timeline component with framer-motion stagger animations — [components/plan-timeline.tsx](components/plan-timeline.tsx). Vertical timeline with current-week node + auto-scroll into view. Mounted between Knowledge and Vision; the Plan tab anchors here. *(2026-05-07)*
- [x] Source-chunk citations rendered under tasks: `Source · Ch. 3, p. 19` — [PlanCard](components/plan-card.tsx) and the new [PlanTimeline](components/plan-timeline.tsx) both render the citation line under cited tasks; counted in the PlanCard footer. *(2026-05-07)*
- [ ] Plan version history (newest first) — separate route or inside the Plan tab
- [ ] Replan flow: when user reports a problem, fire a fresh Discovery query and create a new `plan_version` with `parentVersion` pointer. *Foundations are there — `triggerEvent` already accepts `"problem_report"` and `parentVersion` is wired; just needs a UI entry point.*

### Sessions
- [x] On session end: persist `SessionRecord` (transcript, summary, extracted constraints, intent classification — `initial_planning` | `weekly_checkin` | `problem_report` | `general_chat`) to Dexie `sessions`. Done inside the same Dexie transaction as the plan write so a partial failure can't strand a session pointing at a missing plan. *(2026-05-05)*
- [x] Regenerate garden-context (machine-readable JSON + human-readable Markdown) and stash in Dexie `context` table — fed into every future LLM call. The merge strategy preserves prior fields when the latest session didn't repeat them, and crop dedupe is case-insensitive so "Tomatoes"/"tomatoes" don't accumulate. *(2026-05-05)*
- [ ] `app/api/sessions/route.ts` — POST creates a session record, returns id; GET returns history. *Currently the client-side `lib/plan-generation.ts` writes sessions directly to IndexedDB. A server-side route would only matter if we add cross-device sync (which is out of scope for the privacy commitment).*

### How to test the route today (no LiveKit needed)
Once OpenRouter + Qdrant keys are set and at least one document has been ingested into `sprout_kb`, call from the browser DevTools console:
```js
const { generatePlan } = await import("/_next/static/chunks/lib_plan-generation_*.js"); // or import from "@/lib/plan-generation" inside any client module
const result = await generatePlan({
  transcript: "I have a sunny back patio, maybe two hours a week, and I really want vegetables I can use in salads",
  intent: "initial_planning",
  onProgress: (e) => console.log(e),
});
console.log(result);
```
A small in-app "test plan" button is the next concrete UI follow-up.

---

## Phase 7 — Garden Vision (image gen)

- [x] [app/api/vision/route.ts](app/api/vision/route.ts) — accepts `before` photo + plan-context prompt + engine choice; calls OpenRouter chat-completions with `modalities: ["image", "text"]` and a defensive response parser that accepts `message.images[]`, structured `image_url` content parts, or markdown/data-URL bodies. *(2026-05-05)*
- [x] Default engine: `google/gemini-3.1-flash-image-preview` (Gemini Nano Banana 2) wired through the `Models.IMAGE_DEFAULT` constant. *(2026-05-05)*
- [x] Alt engine: `openai/gpt-5.4-image-2` via `Models.IMAGE_ALT`, selectable through the engine pill. *(2026-05-05)*
- [x] Prompt template uses crops + space + region + hours + goals from `GardenContext` — see [lib/vision.ts](lib/vision.ts) (forwarding) + [lib/vision-prompt.ts](lib/vision-prompt.ts) (assembly). Care-budget density rules drive low / moderate / lush styling. *(2026-05-07)*
- [x] Wire [PhotoVision](components/photo-vision.tsx) Generate button: react-dropzone on the Before tile, full BYOK forwarding via `loadAllKeys()` → `x-openrouter-key` header, busy state on the button + after-tile, error band under the tiles. *(2026-05-05)*
- [x] Persist generated images to Dexie `visions` table (Blob) — every generation writes a fresh `VisionImageRecord`; on mount, the latest record for the active engine hydrates the After tile so refreshing doesn't wipe the result. *(2026-05-05)*
- [ ] Lightbox via `react-photo-view` for full-screen view of past generations
- [x] Loading state with overlay spinner ("Painting your garden…") on the after-tile while a request is in flight. *(2026-05-05)* — shimmer placeholder still TODO.
- [x] Native camera capture (`<input type="file" accept="image/*" capture="environment">`) on mobile for the before-photo *(2026-05-07)*
- [ ] **Hover overlay on every generated image** — two icons in the top-right of each image when the user hovers (or taps once on touch):
  - **Preview** (eye icon) → opens the image in a `react-photo-view` lightbox modal
  - **Download** (arrow-down icon) → saves the Blob from Dexie `visions` to the user's desktop via an in-memory `<a download>` anchor. Filename pattern: `sprouty-vision-{week}-{engine}-{shortId}.png`. Works on the after-frame, the gallery view, and the lightbox itself.

---

## Phase 8 — Scheduled weekly nudges (trigger.dev)

- [ ] `trigger/sprout-weekly-nudge.ts` — Sunday 9am cron job per user's saved IANA tz
- [ ] Loads latest plan version, generates a personalized nudge string via Mistral Small (referencing this-week tasks + garden-context)
- [ ] Voxtral TTS the nudge
- [ ] Web push notification with the nudge text + audio link
- [ ] `trigger/sprout-adaptive-replan.ts` — on user reply, fires a fresh Qdrant Discovery query, generates a new plan version with `triggerEvent="user_reply"`
- [ ] VAPID keys flow: generate locally, paste into Settings → trigger.dev test button verifies project access
- [ ] Reference: [SKILLS/trigger-dev/SKILL.md](SKILLS/trigger-dev/SKILL.md) + [SKILLS/cli/trigger-dev/SKILL.md](SKILLS/cli/trigger-dev/SKILL.md)
- [ ] Graceful degrade: if `TRIGGER_API_KEY` is empty, skip nudge wiring entirely (per PRD)

---

## Phase 9 — Mobile responsiveness verification

Every feature must work end-to-end on every tier per [CLAUDE.md](CLAUDE.md). No desktop-only feature.

- [ ] **320px** — no horizontal overflow, single-column layout, ≥44×44px touch targets
- [ ] **`100dvh`** layouts (not `100vh`) so iOS Safari toolbar doesn't crop
- [ ] Safe-area insets on the topbar + floating-kbd
- [x] **Long-press 500ms** on Sprout character or "Tap to talk" → triggers modal listening — see [components/voice-card.tsx](components/voice-card.tsx). Click-swallow ref prevents the release tap from also popping inline listening. *(2026-05-07)*
- [ ] Native camera capture for the Garden Vision before-photo (`capture="environment"`)
- [ ] Floating-K hint: hidden on touch-only devices (or replaced with "Tap to talk")
- [ ] Test on real iPhone Safari + Android Chrome
- [ ] Reference: [SKILLS/playwright-mcp/SKILL.md](SKILLS/playwright-mcp/SKILL.md) — drive Playwright with mobile viewports for regression coverage

---

## Phase 10 — Performance targets

Per [CLAUDE.md](CLAUDE.md):

| Operation | Target | Hard limit |
|---|---|---|
| First STT partial | <500ms | 1.5s |
| Voice → rendered plan | <8s | 15s |
| PDF ingest (28 pages) | <30s | 60s |
| Image gen (Nano Banana 2) | <8s | 20s |
| Image gen (GPT-Image) | <15s | 30s |
| Mobile LCP (4G) | <3s | 4s |

- [ ] Run Lighthouse on production preview
- [ ] Verify all character/animation work hits 60fps on iPhone SE (Safari devtools timeline)
- [ ] Bundle audit: `next build` → check First Load JS per route ≤ 200kb

---

## Phase 11 — Polish (nice-to-have, time permitting)

- [x] Loading shimmer placeholders for plan/vision/ingest — `.shimmer` + `.shimmer-dark` utility classes in [app/globals.css](app/globals.css), wired into the PhotoVision busy tile, both plan-card skeletons, and the KnowledgeBase file thumb during ingest. *(2026-05-07)*
- [ ] Empty states (no plan yet, no docs yet, no images yet) with on-brand illustrations
- [ ] Error boundaries with retry CTA
- [ ] Privacy commitment dedicated page (link from Settings footer)
- [ ] Sessions / journal route — list past conversations with summary + replay transcript
- [ ] Plan tab dedicated route with full 12-week scroll view + version history
- [ ] Vision tab dedicated route with `react-photo-view` gallery
- [x] Toast system for "Saved ✓", test results, ingest complete — [lib/toast.ts](lib/toast.ts) + [components/toast-host.tsx](components/toast-host.tsx). Wired to settings save/test, vision generation, ZIP export/import. *(2026-05-07)*

---

## Phase 12 — Deployment

### Vercel (Next.js frontend)
- [ ] `vercel link` — link this repo to a Vercel project (Cory's account)
- [ ] Push to GitHub repo (URL TBD — fill in [README.md](README.md) placeholders once created)
- [ ] Server-side env vars (Vercel Project Settings):
  - `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — for token mint
  - `NEXT_PUBLIC_LIVEKIT_URL`
  - `NEXT_PUBLIC_AGENT_SERVICE_URL`
  - `NEXT_PUBLIC_APP_URL`
  - VAPID public + private (web-push)
- [ ] **No** OpenRouter / Qdrant / Google / OpenAI keys on Vercel — those are BYOK client-side only (per privacy commitment)
- [ ] Reference: [SKILLS/cli/vercel/SKILL.md](SKILLS/cli/vercel/SKILL.md)
- [ ] Live URL → update [README.md](README.md) live demo link

### LiveKit agent deployment
- [ ] `lk agent create` from `agent/` directory
- [ ] `lk agent update-secrets --secrets-file agent/.env`
- [ ] `lk agent logs --follow` — verify boot
- [ ] Reference: [SKILLS/cli/livekit/SKILL.md](SKILLS/cli/livekit/SKILL.md)

### trigger.dev
- [ ] `npx trigger.dev init` (if optional nudges are shipped)
- [ ] `npx trigger.dev deploy` to push tasks
- [ ] Verify cron triggers in dashboard

---

## Phase 12.5 — Open-source ebook attribution (legal / submission requirement)

The two seed PDFs in [knowledge/](knowledge/) are open-source / freely licensed gardening ebooks. They need to be properly credited in [README.md](README.md) before submission.

- [ ] Find the official source URL for [knowledge/green-thumb-beginnings-a-foolproof-guide-to-starting-your-first-vegetable-garden-6c5ccda1-en.pdf](knowledge/) — author, license, and download page
- [ ] Find the official source URL for [knowledge/the-modern-victory-garden-a-homesteader-s-guide-to-abundant-harvests-e7627cf6-En.pdf](knowledge/) — author, license, and download page
- [ ] Add a **"Source content"** subsection in [README.md](README.md) (under §Third-party dependencies, where the books are already listed) with:
  - Title (italicized)
  - Author / publisher
  - License (e.g., CC0, CC BY-SA, public domain)
  - Direct link to the source page
- [ ] Confirm the licenses permit hackathon redistribution + demo use; if not, either swap the source PDF or note the restriction
- [ ] Mirror the same credits at the end of the demo video (1-2 second credit screen)

---

## Phase 12.6 — Package for public GitHub distribution

The Qdrant team and other judges need to be able to clone the repo and run Sprouty locally with minimal friction. This phase gets the repo into "first impression" shape — every file present is intentional, every file absent has a documented reason, every step in the run flow works on a fresh machine.

### 12.6.A — Verify nothing private leaks
- [ ] Run `bash scripts/check-secrets.sh` — must exit 0. Re-run any time `.env.local` is modified.
- [ ] Open `.gitignore` and confirm: `.env`, `.env.*` (except `.example`), `agent/.env`, `.local/`, `node_modules/`, `.next/`, `*.pem`, `*.key`, OS junk, `uploads/`, `exports/`, `tmp/`. ✅ already in place.
- [ ] Check `.vercelignore` — same treatment for what shouldn't reach the production bundle.
- [ ] `git status --ignored` — eyeball the ignored list; nothing surprising should be there.
- [ ] Final pre-push: `git ls-files | xargs grep -nE "sk-(or-v1|proj|ant)-|AIza[0-9A-Za-z_-]{35}|tr_(pat|dev|prod)_|eyJhbGci"` should return zero matches against tracked files.

### 12.6.B — Decide on bundling [knowledge/](knowledge/)
The seed PDFs (`green-thumb-beginnings…pdf`, `the-modern-victory-garden…pdf`) make first-run demos instant — no document hunting required. **Recommended: include them**, gated by Phase 12.5 (proper attribution + license confirmation).

- [ ] **Include** them only if both books permit hackathon redistribution (see Phase 12.5). If yes:
  - Add `knowledge/README.md` documenting each book's title / author / license / source link
  - Mention in [README.md](README.md) §Quick start: "the seed PDFs auto-ingest on first run; clear them with `rm knowledge/*.pdf` to bring your own"
- [ ] **Exclude** path: add `knowledge/*.pdf` to `.gitignore`, replace with `knowledge/.gitkeep` + a `knowledge/README.md` listing recommended free PDFs the reviewer can drop in.

### 12.6.C — README "run it yourself" path (for reviewers, not just devs)
This is judge-facing — assume they'll spend ≤5 minutes on cold setup before deciding to keep going.

- [ ] Add a **"For Qdrant judges / reviewers"** subsection at the very top of the Quick-start that promises an end-to-end demo path in ≤6 commands. Example flow:
  ```
  git clone <repo>
  cp .env.example .env.local         # then drop OpenRouter + Qdrant keys
  npm install
  npm run dev                         # → http://localhost:3000
  # Drop knowledge/green-thumb-beginnings.pdf into the dropzone — vectors land in your Qdrant
  # Open Settings → click each "Test" — 5/6 should glow lime
  ```
- [ ] **What works without each key** matrix — judges shouldn't waste time on a fail path:

  | Feature | Required keys |
  |---|---|
  | Home page renders, K-hold listening modal, plan toggle persistence | none |
  | API key Test buttons | per-service key under test |
  | PDF ingest → vectors in Qdrant | OpenRouter + Qdrant |
  | Voice intake + plan generation | OpenRouter + Qdrant + LiveKit |
  | Garden Vision image gen | OpenRouter (Gemini fallback to GPT-Image) |
  | Sunday weekly nudges | trigger.dev + VAPID |

- [ ] Document Node 20+ and Python 3.11+ as prerequisites; flag `pdf-parse`'s known Next.js quirk and that `next.config.ts` already handles it via `serverExternalPackages`.
- [ ] Add `npm run typecheck`, `npm run lint`, `npm run build` to the README so reviewers can sanity-check the codebase compiles.

### 12.6.D — Repo housekeeping
- [x] Add **[LICENSE](LICENSE)** at the repo root — MIT, with a tail note carving out third-party assets (gardening PDFs in `knowledge/`, brand wordmarks in `public/logos/`) which retain their original licenses. *(2026-05-06)*
- [x] Add **[CONTRIBUTING.md](CONTRIBUTING.md)** — judge-facing "Run it in 60 seconds" path at the top, plus contributor conventions (no `any` in new code, no server-side user storage, all AI through OpenRouter, Settings panel `Test` buttons surface upstream errors). *(2026-05-06)*
- [x] [README.md](README.md) gained a "For judges and reviewers" section pointing at the CONTRIBUTING quickstart. *(2026-05-06)*
- [ ] Add **`.github/ISSUE_TEMPLATE/bug_report.md`** + `feature_request.md` — boilerplate is fine, just shows the repo is taken seriously.
- [ ] Add a **GitHub repo description** (not just README): something like "Voice-first garden coach — drop a PDF, talk for 90 seconds, get a 12-week plan grounded in your Qdrant collection. Built for Vector Space Day 2026."
- [ ] Add **GitHub topics**: `qdrant`, `vector-search`, `livekit`, `mistral`, `openrouter`, `nextjs`, `voice-agent`, `hackathon`, `gardening`.
- [ ] Add a **social preview image** (1280×640) — Sprouty logo + tagline + "Vector Space Day 2026" badge. GitHub renders it on shared links.
- [ ] Pin the repo on Cory's GitHub profile (post-submission).
- [ ] **Repo visibility: Public** before the submission deadline.
- [ ] **Share repo with @kanungle** per submission rules.

### 12.6.E — First-clone smoke test (do this before submission)
The "fresh-machine" test catches every paper-cut. Run it the day before submission.

- [ ] On a different machine (or a fresh user account / Docker container) clone the public repo.
- [ ] Follow the Quick-start exactly as written. Time it. Anything >5 minutes from clone → first vector in Qdrant means the README needs trimming.
- [ ] Verify [scripts/check-secrets.sh](scripts/check-secrets.sh) runs clean on the fresh clone.
- [ ] Open the app, drop the seed PDF (or a substitute), watch ingest run, see vectors appear in your Qdrant cloud dashboard.
- [ ] Click each Test button, confirm green dots.
- [ ] Note any friction; fix or document before pushing the final commit.

### 12.6.F — Optional: one-click reviewer experience
Stretch goal — only if Phase 0–11 are all in:

- [ ] **Vercel "Deploy" button** in the README. Vercel pre-fills env vars from `.env.example`, the reviewer just plugs in their own keys. Adds the `https://vercel.com/new/clone?repository-url=…` link.
- [ ] **Open in StackBlitz / GitPod** badge for instant cloud sandboxing (no local setup at all).
- [ ] **Pre-built demo dataset** — a tiny JSON snapshot of one fully-ingested KB + a sample plan, so reviewers can skip ingest and jump straight to "see a finished plan with citations".

---

## Phase 13 — Submission (we are playing to win this)

Submission form: https://try.qdrant.tech/hackathon-vsd

### 13.A — Make [README.md](README.md) a winning submission package

The README is what every judge sees first. Treat it as the pitch deck. Every section should answer "why does this win?" with evidence, not adjectives. Aim for **scannable in 60 seconds, persuasive in 3 minutes**.

#### Top of the file (above the fold)
- [ ] **Title block** — "Sprouty 🌱" + the one-line pitch + a hero GIF (≤8s, voice intake → plan rendered) so judges instantly see the magic on first scroll
- [ ] **Live demo URL** (Vercel) — single click, no setup
- [ ] **Demo video link** (≤3min, YouTube/Loom) — embedded as a clickable thumbnail with a play overlay
- [ ] **Submission badges row** — `Hackathon: Vector Space Day 2026` · `Tracks: Think Outside the Bot · Mistral Sponsor Bonus` · `Status: ✅ Live`

#### "Why we win" section (judges' rubric mapped)
- [ ] **Functionality** — concrete bullets with screenshots/GIFs:
  - Voice in → 12-week plan out in <8s (timestamped GIF)
  - PDF dropped → vectors in Qdrant in <30s
  - Plan tasks cite `Source: Ch. 3, p. 19` (screenshot zoom)
  - Sunday 9am voice push nudge fires (Trigger.dev run screenshot)
  - K-hold from anywhere → modal listening (animated GIF)
- [ ] **Originality / Think Outside the Bot** — one paragraph + a side-by-side comparison table (chatbot vs. Sprouty: input modality, output shape, persistence model, follow-up trigger). Make the "no chat thread" stance unmistakable.
- [ ] **Material use of Qdrant** (this is the Qdrant-specific judging axis — be loud here):
  - Discovery API with positive/negative context pairs *driving* every plan, not similarity
  - Hybrid dense (1536-cos) + BM25 sparse fusion via `modifier: "idf"`
  - Recommendation API for "more like crops you've approved"
  - Payload-indexed filters (difficulty / crops / seasons) so beginners stay safe
  - Code link directly to [lib/qdrant.ts](lib/qdrant.ts) for judges to inspect
- [ ] **User experience** — list the three activation modes (tap / K-hold / long-press), responsive 320px → desktop, captioned voice, BYOK with one-click test buttons, IndexedDB persistence

#### Mistral sponsor bonus track
- [ ] Dedicated **"Powered by Mistral"** subsection. Three products in the critical path: **Voxtral STT + Mistral Small + Voxtral TTS**. Show the OpenRouter call sites that prove it (link to [lib/openrouter.ts](lib/openrouter.ts) + [lib/models.ts](lib/models.ts) constants).
- [ ] Mention `mistralai/mistral-small-multimodal` for the photo-ingest path.

#### Architecture (visual + readable)
- [ ] **Architecture diagram** (PNG or SVG) showing the three-phase flow: Browser ↔ Vercel API routes ↔ LiveKit ↔ Python agent ↔ OpenRouter ↔ Qdrant + Trigger.dev. Mermaid works for inline, or export from Excalidraw / draw.io.
- [ ] Tech-stack table — already drafted; tighten and verify versions match `package.json`.
- [ ] Models table — already drafted; verify the 7 model slugs match [lib/models.ts](lib/models.ts).

#### Quick-start (judges who clone)
- [ ] Reduce to ≤6 commands (clone → install → drop keys → ingest → run). The current quick-start is solid; trim anything that won't run on a stock Mac with Node 20 + Python 3.11.
- [ ] Add a note that the included [knowledge/](knowledge/) seed PDFs auto-ingest on first run (or document the one-liner if not auto).

#### Privacy / BYOK pitch
- [ ] Existing privacy section is good — add a one-line **"verify it yourself"** callout pointing to [scripts/check-secrets.sh](scripts/check-secrets.sh) and the [.githooks/](.githooks/) directory so judges can see the secret-scanner is real, not theater.

#### Source content attributions (legal / Phase 12.5)
- [ ] Resolve all the items in **Phase 12.5** above and add a **"Source content"** subsection — title, author, license, link for each ebook in [knowledge/](knowledge/). Required for legitimate use.

#### Submission metadata
- [ ] Fill in repo URL (once the GitHub repo is created)
- [ ] Fill in live demo URL (post-Vercel deploy)
- [ ] Fill in demo video link (post-edit)
- [ ] Team name + emails
- [ ] Eligibility statement (already drafted; verify ages/team scope)
- [ ] Note that **all code in this repo was written during the hackathon period** (May 4 – June 1, 2026) — `git log` will be inspected; the dated [CHANGELOG.md](CHANGELOG.md) is supporting evidence.
- [ ] Repo shared with `@kanungle` per submission rules

#### Polish
- [ ] Run a Markdown linter (`markdownlint-cli`) and fix any nags
- [ ] Run a link-checker; no dead anchors
- [ ] Read aloud — every sentence should either inform or persuade. Cut filler.
- [ ] Add a **"Created by"** + contact (Cory Micek · mysickbuilds.com · hi@mysickbuilds.com) at the very bottom — already there, verify it survives polishing
- [ ] Add a **Star this repo** / **Try the live demo** call-to-action button row before the Acknowledgements

### 13.B — Demo video (≤3 min, drives the README)

Storyboard, not improvised. Narration script written and rehearsed before recording.

- [ ] **0:00–0:10** — cold open: title card "From 'I have no idea where to start' to a 12-week garden plan in 90 seconds." Logo + Mistral / Qdrant / LiveKit / Trigger.dev sponsor badges fly in.
- [ ] **0:10–0:55** — voice intake: tap, speak (~30s), watch the live transcript stream into the modal, plan materializes, scroll to show the source citations.
- [ ] **0:55–1:25** — drop a PDF, watch chunks/vectors spin up, then a follow-up voice asks about it and the plan adapts. Show Qdrant dashboard with the vectors.
- [ ] **1:25–2:00** — Garden Vision: upload a "before" photo, generate the week-12 vision (Nano Banana 2), open the lightbox, click download.
- [ ] **2:00–2:35** — Trigger.dev nudge fires (fast-forward), web push lands, user replies → adaptive replan.
- [ ] **2:35–3:00** — privacy stance + BYOK + the no-chatbot rule, end on the live demo URL + repo URL.

### 13.C — Submission day checklist
- [ ] Repo public, README polished, live URL responding
- [ ] Repo shared with `@kanungle`
- [ ] Demo video uploaded with public link (not "unlisted" — submission needs to be reviewable)
- [ ] Eligibility statement confirmed
- [ ] Submit form by **June 1, 2026 · 11:59 PM Pacific**
- [ ] Post-submission: tweet/Linkedin with the demo video, tag @qdrant_engine + @MistralAI

---

## Phase 14 — Verification gates (run before claiming "done")

Per [CLAUDE.md](CLAUDE.md) verification checklist:

- [ ] `npm run dev` boots without errors and home page renders
- [ ] Drop a PDF into the knowledge base → vectors appear in Qdrant within ~30s
- [ ] Tap to talk → real-time transcript renders → plan materializes within 15s
- [ ] Plan cites source chunks (visible "Source: Ch. X, p. Y" markers)
- [ ] Hold K from anywhere → modal listening overlay
- [ ] Reload page → plan, settings, gallery all persist (IndexedDB)
- [ ] Export ZIP → import in a fresh browser profile → state restored
- [ ] Test on real iPhone or 320px-width browser pane: no horizontal overflow, touch targets ≥44px
