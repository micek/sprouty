# Sprout — Product Requirements Document

**Version:** 1.0
**Status:** Hackathon Build Spec
**Owner:** Cory Micek (My Sick Builds / Voiyz)
**Target Submission:** Vector Space Day 2026 — Qdrant "Think Outside the Bot" Hackathon
**Submission Deadline:** June 1, 2026, 11:59 PM Pacific
**Document Date:** May 4, 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Goals & Success Criteria](#2-product-goals--success-criteria)
3. [Hackathon Constraints](#3-hackathon-constraints)
4. [User Personas](#4-user-personas)
5. [Core User Journey](#5-core-user-journey)
6. [Functional Requirements](#6-functional-requirements)
   - 6.1 Voice Agent (with session logging)
   - 6.2 Knowledge Base
   - 6.3 Photo Visualization (with image gallery)
   - 6.4 Plan Display (with versioning)
   - 6.5 Scheduled Engagement
   - 6.6 Settings (API Keys)
   - 6.7 Cross-Device & Responsive Behavior
   - **6.8 Local Persistence & Data Storage**
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Technical Architecture](#8-technical-architecture)
   - 8.1 System overview
   - 8.2 Three-phase architecture
   - 8.3 Why these technology choices
   - **8.4 Hosting & Deployment**
9. [Tech Stack](#9-tech-stack)
10. [Data Model & Schemas](#10-data-model--schemas)
11. [API Contracts](#11-api-contracts)
12. [UI/UX Specification](#12-uiux-specification)
   - 12.1 Design system tokens
   - 12.2 Typography
   - 12.3 Sprout character
   - 12.4 Reference mockups
   - 12.5 Layout structure
   - **12.6 Responsive breakpoints**
   - **12.7 Mobile-specific components & patterns**
13. [Environment Variables](#13-environment-variables)
14. [Repository Structure](#14-repository-structure)
15. [Implementation Plan](#15-implementation-plan)
16. [Testing Strategy](#16-testing-strategy)
17. [Demo Video Storyboard](#17-demo-video-storyboard)
18. [Submission Checklist](#18-submission-checklist)
19. [Risks & Mitigations](#19-risks--mitigations)
20. [Appendix](#20-appendix)

---

## 1. Executive Summary

### What is Sprout?

Sprout is a **voice-first garden coach for first-time vegetable gardeners**. It transforms a generic gardening guide (PDF) into a personalized 12-week plan via voice conversation, then sustains engagement through scheduled weekly voice nudges and adaptive replanning.

### One-line pitch

> "From 'I have no idea where to start' to a 12-week vegetable garden plan in 90 seconds of voice."

### Why this wins the hackathon

The hackathon's central rule is **"no chatbots."** Sprout takes voice as input and produces a **structured planning artifact** (a 12-week timeline, crop list, calendar, shopping list, and AI-generated vision board) as output. The user never types a follow-up question. Subsequent voice interactions are scheduled by the system, not initiated by the user. This is the cleanest possible interpretation of the rule.

### Strategic angle: Mistral sponsor bonus

Mistral is sponsoring the hackathon with a bonus prize. Sprout uses **three Mistral products in the critical path** of every voice interaction:

| Step | Mistral Product | Role |
|---|---|---|
| Speech-to-text | Voxtral Mini Realtime | Streaming STT during voice intake |
| Reasoning | Mistral Small (or Magistral Small) | Constraint extraction + plan generation |
| Text-to-speech | Voxtral Mini TTS | Spoken plan summary + weekly nudges |

This stack qualifies Sprout for the Mistral sponsor bonus on top of the main competition prize.

### Architectural elegance

**OpenRouter is the single AI gateway** for the entire system. Voice (Mistral), reasoning (Mistral), embeddings (OpenAI), and image generation (Google's Nano Banana 2 + OpenAI's GPT-5.4 Image) all flow through one API key, one SDK, one billing surface. This is genuinely uncommon in hackathon submissions and reads as architectural maturity to judges.

### Built for every device

Sprout is voice-first, which makes mobile the **most natural form factor** — people talk to phones, not laptops. The application supports mobile, tablet, and desktop as **first-class targets**, with adaptive layouts, native camera capture, long-press voice activation, and touch-optimized component sizing. See [Section 6.7](#67-cross-device--responsive-behavior).

---

## 2. Product Goals & Success Criteria

### Primary product goals

1. **Reduce decision paralysis for first-time gardeners.** A beginner with a 30-page PDF guide can't extract a confident, actionable plan from it. Sprout does the extraction.
2. **Make voice the primary modality.** Typing about gardening on a phone is friction. Talking is natural.
3. **Demonstrate that Qdrant's Discovery API is a planning engine, not just a search engine.**
4. **Sustain engagement past the first interaction** through scheduled, adaptive voice nudges.

### Hackathon success criteria

| Criterion | Target | Measurement |
|---|---|---|
| Functional voice intake | Captures and transcribes voice in real time | Demo video shows live transcription |
| Personalized plan generation | Plan changes meaningfully based on different inputs | Demo shows two different plans for two different inputs |
| Vector retrieval visible | Plan cites specific PDF pages and chunks | UI surfaces "Source: Ch. 3, p. 19" |
| Photo visualization works | User uploads photo, AI returns plausible "future" vision | Demo shows before/after reveal |
| Scheduled engagement runs | At least one trigger.dev cron job fires successfully | Demo shows "Six days later" notification |
| Mistral in critical path | Three Mistral products demonstrably used | README documents the stack |
| Submission compliant | Form submitted, repo shared with @kanungle, ≤ 3-min demo video | Confirmation receipt |

### Non-goals (explicitly out of scope)

- Mobile native apps (web only)
- Multi-user accounts or authentication
- Database for user history beyond Qdrant payload
- Calendar integration (Google Calendar, Apple Calendar)
- Plant identification from photos (different problem)
- Pest/disease diagnosis from photos (out of scope for v1)
- Real-time collaborative gardening
- Marketplace, e-commerce, or affiliate links
- Internationalization (English only)
- Accessibility audit (WCAG AAA — best effort, not certified)

---

## 3. Hackathon Constraints

### Rules summary (from Vector Space Day 2026 Terms)

- **Qdrant must be used** as part of the technical solution
- **No chatbot UIs** — voice or other modalities only
- **All code must be created during the hackathon period** (no pre-existing repos repurposed)
- **Submission via form** sharing GitHub repo with `@kanungle` plus a ≤ 3-minute demo video
- **License:** Non-exclusive perpetual to Qdrant for marketing; team retains ownership

### Sponsor tracks targeted

- **Mistral** (primary): Voxtral STT, Mistral Small / Magistral Small LLM, Voxtral TTS

### Sponsor tracks NOT targeted (intentionally)

- **CrewAI** (multi-agent): Adds orchestration complexity that doesn't serve the demo
- **Twelve Labs** (video understanding): Not needed unless we extend to video walkthroughs (post-v1)
- **Neo4j** (graph): Not architecturally relevant to this concept

### Submission deadline working back

| Date | Milestone |
|---|---|
| May 28, 2026 | Code freeze. No new features after this date. |
| May 29, 2026 | Demo video shoot |
| May 30, 2026 | Demo video edit |
| May 31, 2026 | README finalization |
| June 1, 2026 | Submit form. Confirm receipt. |

---

## 4. User Personas

### Primary: "Anxious First-Timer Anna"

- **Age:** 28–45
- **Living situation:** Suburban or urban with a small back yard, patio, or balcony
- **Tech comfort:** Uses voice assistants daily. Comfortable with mobile apps. Not a developer.
- **Gardening experience:** Zero to minimal. Has read articles, maybe bought a houseplant once.
- **Pain points:**
  - Information overload — every YouTube video says something different
  - Decision paralysis — what to plant, when, where, how much
  - Fear of waste — doesn't want to spend money on dying plants
  - Forgets what she read by the time she's ready to act
- **What she wants:** A trusted advisor that tells her exactly what to do this week, in her specific situation
- **What converts her:** A plan that feels personalized, with clear next steps and source citations

### Secondary: "Curious Tinkerer Tom"

- **Age:** 35–55
- **Tech comfort:** Developer. Knows AI is everywhere now.
- **Gardening experience:** Moderate. Has tried gardening before with mixed results.
- **Why he uses Sprout:** Curious about voice-first AI products. Wants to feed his own knowledge base (regional planting guides) and see what happens.
- **What he values:** API key transparency. Open architecture. Bring-your-own-keys model.

---

## 5. Core User Journey

### First session (the demo flow)

1. **Land on Sprout.** Sees the sprout character, knowledge base section, plan area, settings.
2. **Connect API keys** in settings (one-time setup, ~2 minutes).
3. **Upload a PDF** to the knowledge base. Drag-and-drop or click. Watch chunks ingest into Qdrant in real time.
4. **Activate voice agent.** Tap the sprout, click "Tap to talk," or hold `K` from anywhere.
5. **Describe the garden.** ~45 seconds of natural speech. Watering animation plays during listening.
6. **Stop talking.** System processes (visible "Querying 142 chunks across 3 chapters..." status).
7. **Plan materializes.** 12-week timeline animates in. Each week shows tasks, recommended crops with source citations.
8. **Voxtral reads the summary out loud.** "Your patio garden plan: three containers, four crops, two hours per week..."
9. **Optionally upload a photo** of the actual space. Vision board generates and slides in 5–10 seconds later.
10. **User closes the app.**

### Follow-up sessions (the adaptive loop)

1. **Sunday morning:** trigger.dev cron fires. Generates a personalized voice nudge for the upcoming week's tasks.
2. **User receives notification** (web push, email, or both).
3. **User opens Sprout, clicks "Reply via voice."** Reports what's happening: "My lettuce already has holes in the leaves."
4. **System ingests the report,** queries Qdrant for relevant guidance, generates an adaptive recommendation.
5. **Voxtral speaks the response.** "Looks like flea beetles. Chapter 3, page 19. Floating row cover for now — I added it to your shopping list."

---

## 6. Functional Requirements

### 6.1 Voice Agent (always-on)

#### FR-VA-01: Always-visible voice agent
The voice agent (sprout character) **must** be visible in the main view at all times when on the home screen. It must be the most prominent element on the page.

#### FR-VA-02: Three activation methods
Users must be able to activate the voice agent through:
- (a) **Click/tap** on the character or "Tap to talk" button (inline activation)
- (b) **Hold `K` keyboard shortcut** from anywhere on the page (modal activation, full-screen takeover)
- (c) **Click "Reply"** on a scheduled nudge notification (post-v1)

#### FR-VA-03: Inline listening state
When activated via tap, the voice card transitions to a listening state with:
- Watering can graphic appears tilted over the sprout
- Animated water droplets fall onto the soil
- Soil visibly darkens to show wetness
- Sprout breathing animation accelerates
- Mouth opens slightly into "O" shape
- 25-bar animated waveform appears below character
- Live transcript streams in italic Fraunces serif as user speaks
- "Stop & send" button replaces "Tap to talk"

#### FR-VA-04: Modal listening state (K-hold)
When user holds `K`:
- Background blurs (8px) and desaturates
- Floating K-hint disappears
- Modal card scales from 0.92 → 1.0 with cubic-bezier ease
- Larger sprout character with watering animation
- Larger 25-bar waveform (80px height)
- Live transcript box with "Listening" pulsing indicator
- "Release `K` to send" instruction visible
- Status pill shows "● Voxtral · streaming STT"
- Backdrop click or Escape key closes modal
- Releasing `K` sends transcript and closes modal

#### FR-VA-05: No text input anywhere
The application **must not** include any text input that would allow the user to type a question or message to the AI. All AI interaction is voice-only. Text inputs are allowed only for: API keys (settings), file names (knowledge base), and search/filter UI.

#### FR-VA-06: Turn detection
The voice agent must detect end-of-turn automatically when the user stops speaking for ~1.5 seconds. Manual stop via "Stop & send" or releasing `K` is also supported.

#### FR-VA-07: TTS playback
After the LLM generates a plan or response, Voxtral TTS must speak the executive summary out loud. The user must be able to mute or skip TTS playback.

#### FR-VA-08: Session transcript logging
Every voice conversation must persist a **session log** to local storage (IndexedDB) containing:
- Unique session ID and ISO timestamp
- Total duration in seconds
- Full transcript from Voxtral STT
- Mistral-generated 2–3 sentence summary
- Extracted constraints (if any)
- Topics discussed (auto-tagged by Mistral)
- Decisions made (e.g., "user committed to cherry tomatoes")
- User intent classification: `initial_planning` | `weekly_checkin` | `problem_report` | `general_chat`

Both **JSON** (machine-readable) and **Markdown** (human-readable) formats must be produced for each session. The Markdown format is for the user to read; the JSON is what gets passed back to the LLM as context.

#### FR-VA-09: Garden context aggregation
After every voice session, the system must regenerate a master **`garden-context.md`** (human-readable) and **`garden-context.json`** (machine-readable) that aggregates the user's complete garden journey:
- Garden profile (space, sun, time, climate, goals, dislikes)
- Currently growing crops
- Recent observations from check-in sessions
- Open problems requiring attention
- Resolved issues
- Key milestones with dates
- Plan version history references

The `garden-context.json` file **must be passed as primary context** in every subsequent LLM call. This gives Sprout amnesia-free continuity across sessions.

#### FR-VA-10: Garden journal view
Users must be able to view their past sessions in a "Garden Journal" tab:
- Chronological list of sessions with date, duration, and summary
- Click to expand full transcript
- Filter by date range or topic tag
- Each entry shows what plan version it produced (if any)

### 6.2 Knowledge Base (Qdrant ingest)

#### FR-KB-01: Document upload
Users must be able to upload documents to the knowledge base via:
- Drag-and-drop into the dropzone
- Click "Choose files" button
- Multiple files in one batch

Supported formats: `.pdf`, `.md`, `.txt`, `.docx`. Max file size: 50 MB per file.

#### FR-KB-02: Real-time ingest visibility
Upload progress and Qdrant indexing must be visible to the user:
- File appears in the indexed list immediately with "Processing..." status
- Vector count updates as chunks are embedded and upserted
- Status changes to green dot when fully indexed

#### FR-KB-03: Indexed file display
Each indexed file must show:
- Filename
- File size
- Page count (PDFs) or word count (MD/TXT)
- Time of indexing
- Vector count (e.g., "98v")
- Delete button

#### FR-KB-04: Chunking strategy
PDFs must be chunked semantically:
- Split by headings (Chapter 1, Chapter 2, etc.)
- Within sections, split by paragraphs with ~1000-character chunks and 200-character overlap
- Preserve page numbers in metadata
- Detect and tag list-style content separately from narrative

#### FR-KB-05: Vector representation
Each chunk must be stored in Qdrant with:
- **Dense vector:** OpenAI `text-embedding-3-small` (1536 dimensions)
- **Sparse vector:** BM25 (Qdrant native sparse vectors)
- **Payload metadata:** see [Data Model](#10-data-model--schemas)

#### FR-KB-06: Retrieval method
Plan generation must use Qdrant's **Universal Query API** with:
- **Hybrid search:** Dense + sparse (BM25) fusion
- **Discovery API:** Constraint-based with positive/negative pairs
- **Recommendation API:** "Similar to these approved crops"

### 6.3 Photo Visualization

#### FR-PV-01: Photo upload
Users must be able to upload one photo of their garden space:
- Drag-and-drop or click to upload
- JPEG, PNG, WebP supported
- Max size: 10 MB
- Photo is processed locally first (no upload to cloud yet)

#### FR-PV-02: Photo analysis (Mistral multimodal)
Before generating a vision, the photo must be analyzed by Mistral Small 4 multimodal to extract:
- Available square footage (estimate)
- Sun exposure indicators
- Surface type (concrete, dirt, raised bed, deck)
- Existing structures (fences, walls, planters)
- Visible drainage characteristics
- Climate zone hints (vegetation type)

#### FR-PV-03: Engine selection
Users must be able to choose between two image generation engines:
- **Gemini 2.5 Flash Image (Nano Banana)** via OpenRouter (`google/gemini-3.1-flash-image-preview`)
- **GPT-5.4 Image** via OpenRouter (`openai/gpt-5.4-image-2`)

Default to Nano Banana 2 (better at preserving structure during edits).

#### FR-PV-04: Vision generation
After plan is generated and photo is uploaded:
- A trigger.dev async job fires
- Job sends photo + structured plan + crop list to selected image engine
- Generated image arrives 5–15 seconds later
- Slides into the "Week 12 · Vision" frame with animation
- Soft chime plays (optional, user-toggleable)

#### FR-PV-05: Vision board copy framing
The generated image **must be labeled** "An illustration of one possible outcome" or similar — not "forecast" or "prediction." This manages user expectations and avoids hallucination liability.

#### FR-PV-06: Image gallery
All AI-generated vision images must be saved to a **local image gallery** stored in IndexedDB. The gallery must:
- Display thumbnails of all generated images in a responsive grid (3 cols desktop, 2 cols tablet, 1 col mobile)
- Show metadata per image: generation date, engine used (Nano Banana 2 / GPT-5.4), plan version it was tied to
- Sort newest-first by default; allow toggling oldest-first
- Click any thumbnail to expand to a full-size lightbox

#### FR-PV-07: Image download
Each gallery image must have a download button that saves the image to the user's device using the standard `<a download>` pattern. Filename format: `sprout-vision-{date}-{plan-version}.png`.

#### FR-PV-08: Image deletion
Users must be able to delete individual images from the gallery (with confirmation modal). The delete is permanent and removes from IndexedDB.

#### FR-PV-09: Compare with original
Each gallery image must have a "Compare" toggle that shows the source photo side-by-side with the generated vision. Useful when the user generates multiple visions from the same source photo and wants to compare engines or iterations.

#### FR-PV-10: Image labeling
Users may optionally assign a custom label to each gallery image (e.g., "Spring layout option A", "October vision"). Labels persist with the image metadata.

### 6.4 Plan Display

#### FR-PD-01: 12-week plan structure
The generated plan must contain exactly 12 weeks. Each week must include:
- Week number
- Date range
- 1–5 tasks with completion checkboxes
- Recommended crops (if applicable to that week)
- Time estimate (e.g., "~2 hr")
- Source citations (PDF page references)

#### FR-PD-02: Plan visualization
The plan must render as:
- **Current week card** (forest green) — shown next to voice agent
- **Full timeline view** — accessible via "Plan" tab
- **Crop cards** — one per recommended crop with PDF source link
- **Shopping list** — aggregated from all 12 weeks
- **Calendar view** (post-v1)

#### FR-PD-03: Source attribution
Every recommendation in the plan must link back to a specific chunk in the user's uploaded knowledge base. The UI must surface "Source: [filename] · Ch. X, p. Y."

#### FR-PD-04: Adaptive replan
When the user reports a problem via voice (e.g., "My lettuce has holes"):
- The transcript is sent to Mistral with a "diagnose and adapt" prompt
- Mistral queries Qdrant for relevant troubleshooting chunks
- A new task is added to the current week
- Voxtral TTS speaks the recommendation
- The shopping list is updated if needed

#### FR-PD-05: Plan versioning
Each conversation that produces planning output creates a **new plan version**, not an overwrite. The system must:
- Track all plan versions chronologically with `plan_version` integer (v1, v2, v3...)
- Tag each version with the trigger event (e.g., "v1 - initial planning", "v3 - revised after flea beetle report on May 11")
- Reference the source session log ID that produced each version
- Allow users to view previous versions in a "Plan History" view
- Default the UI to displaying the most recent version

#### FR-PD-06: Plan persistence
The current plan and all version history must persist between browser sessions in IndexedDB. On app load:
- The most recent plan version loads automatically
- The garden journal and image gallery load
- Settings (API keys) load
- Voice agent is ready to talk without re-onboarding

This means a returning user opens Sprout and is immediately at "Week 5 of 12, here's what's due this week" — no setup, no re-explaining their garden.

#### FR-PD-07: Plan export
Users can export the current plan as JSON or as a printable PDF (via browser print) at any time. JSON export uses the `PlanSchema` defined in [Section 10.4](#104-plan-output-schema).

### 6.5 Scheduled Engagement (trigger.dev)

#### FR-SE-01: Weekly cron job
A trigger.dev job must fire every Sunday at 9:00 AM (user's timezone) to:
- Load the user's plan from local storage / Qdrant payload
- Identify the upcoming week's tasks
- Generate a personalized voice message via Voxtral TTS
- Send via web push notification (browser-native)

#### FR-SE-02: Adaptive replan job
A trigger.dev job triggered by user voice report must:
- Take the transcript as input
- Query Qdrant for relevant troubleshooting chunks
- Call Mistral to generate adaptive guidance
- Update the plan stored in local state
- Optionally generate a new TTS audio response

#### FR-SE-03: Demo accelerator mode
For demo video purposes, a "1 minute = 1 week" accelerator must exist (toggle in settings or env var) so the demo can show the "Six days later" beat without literally waiting six days.

### 6.6 Settings (API Keys)

#### FR-ST-01: Required keys
The settings panel must collect three required API keys:
1. **OpenRouter** — powers Mistral voice, reasoning, embeddings, and both image gen engines
2. **Qdrant Cloud** — vector database for knowledge base
3. **LiveKit Cloud** — real-time voice orchestration

#### FR-ST-02: Optional keys
The settings panel must collect one optional API key:
1. **trigger.dev** — for scheduled weekly check-ins (gracefully degrades if absent)

#### FR-ST-03: Client-side storage
All keys must be stored **client-side** in browser storage (encrypted via Web Crypto API where possible). The keys must **never** be sent to a Sprout-owned server. The README must document this clearly.

**Persistence is explicit, not implicit.** Typing into a key input only updates local UI state. The value is written to IndexedDB **only when the user clicks the per-card "Save" button (FR-ST-07) or the bottom-of-panel "Save & continue" button**. Navigating away, reloading the page, or closing the panel without saving discards in-flight edits — the previously persisted value remains intact.

#### FR-ST-04: Test connection
Each key card must have a "Test" button that performs a low-cost API call to verify the key works:
- OpenRouter: `GET /api/v1/models`
- Qdrant: `GET /collections`
- LiveKit: Mint a temporary access token
- trigger.dev: `GET /api/v1/projects`

The Test button uses the **current input value**, not the previously persisted one — so users can verify a key before saving it. A successful test does **not** auto-save; the user must still click Save. A successful test sets the in-memory "verified at" timestamp used by the status dot (FR-ST-05).

#### FR-ST-05: Status indicators
Each key card must show a status dot:
- **Green** (lime) = key saved and verified within last 24 hours
- **Empty** (gray) = no key saved (or saved but never tested)
- **Red** = key saved but most recent verification failed (post-v1)

#### FR-ST-06: Privacy disclosure
The settings panel must include a privacy disclosure: "Keys are stored locally in your browser. Sprout never sees your raw credentials."

#### FR-ST-07: Save button
Each key card must have a **"Save" button immediately to the right of the "Test" button**.

Behavior:
- Clicking Save writes the current input value to IndexedDB. Secret fields are encrypted via Web Crypto API; URL fields (`QDRANT_URL`, `LIVEKIT_URL`) are stored plaintext.
- Save is enabled only when the input has unsaved changes (i.e., the field is "dirty"). When clean, the button is visually de-emphasized (or labeled "Saved").
- On successful save:
  - The button briefly shows a "Saved ✓" confirmation state for ~1.5 seconds, then returns to "Save".
  - The input reverts to its masked/hidden state (cancelling any active reveal from FR-ST-08).
  - The status dot updates per FR-ST-05.
- Save does **not** require a successful Test first. If Save is clicked on an untested key, the status dot remains gray. (Rationale: users may want to paste a key now and test later when their network is up.)
- A panel-level **"Save & continue"** button at the bottom of the settings card commits every dirty field in one action and dismisses the settings sheet/modal on mobile/tablet (per FR-CD-03).
- Touch target ≥44×44 CSS pixels (per FR-CD-05).
- Keyboard: focusable in tab order immediately after the Test button; activates with Enter or Space.

#### FR-ST-08: Reveal toggle (eye icon)
API keys must be **hidden by default** in the UI. The input field renders with `type="password"` so the value displays as bullet/dot characters.

Each key input must include an **eye icon button** positioned inside the input field at its right edge (between the input value and the Test/Save buttons).

Behavior:
- Clicking the eye icon toggles that single input between hidden (`type="password"`) and revealed (`type="text"`).
- The icon swaps between an open-eye SVG (when hidden — "click to reveal") and an eye-with-slash SVG (when revealed — "click to hide") so the current state is visually obvious.
- Reveal state is **per-field and ephemeral**:
  - Toggling one card's eye icon does not affect any other card.
  - Reveal state is **not persisted**. Every page reload, settings panel re-open, or successful Save (FR-ST-07) returns the field to its hidden default.
  - Reveal state is **never written to IndexedDB**.
- Accessibility:
  - The button has `aria-label="Reveal API key"` (when hidden) / `aria-label="Hide API key"` (when revealed).
  - Focusable in tab order (immediately after the input).
  - Activatable with Enter or Space.
  - Touch target ≥44×44 CSS pixels (icon centered inside).
- Visual: stroked SVG using `var(--ink-muted)` at rest, `var(--forest)` on hover/focus. Sized 18×18px with surrounding 44×44 hit area.

The combination of FR-ST-07 + FR-ST-08 means the default-safe state for every key is **hidden + persisted**, with reveal as an explicit, ephemeral, per-field opt-in.

### 6.7 Cross-Device & Responsive Behavior

#### FR-CD-01: Universal device support
The application **must** function fully across three device classes. This is a **first-class requirement**, not a best-effort:
- **Mobile** (320px–640px): iPhone SE, iPhone 13/14/15, Pixel 7/8, Galaxy S series
- **Tablet** (641px–1024px): iPad mini, iPad, iPad Pro portrait
- **Desktop** (1025px+): MacBook, desktop displays at any reasonable resolution

Every feature (voice intake, knowledge base upload, plan display, photo visualization, settings) must work end-to-end on every device class. No feature may be desktop-only.

#### FR-CD-02: Touch-first voice activation
On touch devices, since the `K` keyboard shortcut is unavailable:
- The floating "Hold K" hint **must be replaced** with "Press and hold sprout to talk"
- **Long-press (500ms)** on the sprout character triggers the modal listening state
- **Single tap** on the sprout character or "Tap to talk" button triggers the inline listening state
- Detection must use `pointerdown`/`pointerup` events (not separate touch + mouse handlers) to support hybrid devices

#### FR-CD-03: Adaptive component layouts
The following components **must** restructure across breakpoints:

| Component | Mobile | Tablet | Desktop |
|---|---|---|---|
| Hero grid (voice + plan) | Single column, voice on top | Two columns | Two columns (1.65fr / 1fr) |
| Knowledge base body | Stacked: dropzone above files | Two columns | Two columns (1.4fr / 1fr) |
| Photo grid (before/after) | Stacked vertically | Side-by-side | Side-by-side |
| API keys grid | Single column | Two columns | Two columns |
| Top navigation tabs | Hidden behind icon menu | Visible inline | Visible inline |
| Settings | Full-screen sheet | Centered modal | Inline section |

#### FR-CD-04: Native mobile capabilities
- **Photo upload must support camera capture:** `<input accept="image/*" capture="environment">` so users can photograph their garden directly without leaving the app
- **Document upload must use the native picker:** standard file input behavior triggers iOS Files / Android documents UI
- **TTS audio playback must handle mobile autoplay restrictions:** the audio context must be unlocked on first user gesture (tap on sprout character is the standard moment); playing audio without prior gesture will silently fail on iOS Safari

#### FR-CD-05: Touch target sizing
All interactive elements must meet **minimum 44×44 CSS pixel** touch targets on mobile (per Apple HIG and Material Design). This includes:
- Sprout character (already 280px, exceeds requirement)
- "Tap to talk" button (must be at least 48px tall to allow comfortable padding)
- File list items, especially delete affordances
- API key Test buttons, Save buttons, and eye-icon reveal toggles (per FR-ST-04, FR-ST-07, FR-ST-08)
- Tab navigation items
- Photo engine selector pills

#### FR-CD-06: Safe area insets
The application must respect iOS notch, dynamic island, and bottom home indicator using CSS environment variables:
```css
.topbar { padding-top: max(16px, env(safe-area-inset-top)); }
.floating-element { bottom: max(32px, env(safe-area-inset-bottom)); }
.modal-card { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
```

#### FR-CD-07: Viewport configuration
The HTML `<head>` must include:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=yes">
```

Use `100dvh` (dynamic viewport height) rather than `100vh` for full-screen elements to handle the mobile browser chrome shrinking when scrolling.

#### FR-CD-08: Performance on mobile networks
- Initial page load (LCP) must complete in **< 3 seconds on simulated 4G**
- The Sprout character animation (CSS only, no JS) must render at 60fps on iPhone SE
- Image generation latency tolerance is higher on cellular — show a clear progress indicator for any operation > 2 seconds

#### FR-CD-09: Mobile listening modal
The modal listening state on mobile (triggered by long-press) must:
- Cover the full viewport (no padding on the backdrop)
- Display "Release to send" instead of "Release K to send"
- Show a prominent stop button at thumb-reach (bottom-center, 56px tall)
- Auto-dismiss when the user lifts their finger from the sprout character

#### FR-CD-10: No horizontal overflow
At any breakpoint, the application must not produce horizontal overflow. All container max-widths must use `min(100%, 1280px)` patterns or equivalent.

### 6.8 Local Persistence & Data Storage

#### FR-PER-01: IndexedDB as primary storage
All user-generated data must persist in **IndexedDB** (not localStorage, which is too small at 5–10MB). IndexedDB stores:
- **Session logs:** every voice conversation with transcript, summary, metadata
- **Plan versions:** all plans produced over the user's history with the app
- **Generated images:** Blobs of every image produced by Nano Banana 2 or GPT-5.4 Image
- **Garden context:** the aggregated `garden-context.json` and `garden-context.md` files
- **Source documents (optional):** original PDFs uploaded to the knowledge base

IndexedDB schema is defined via a thin wrapper (recommended: Dexie.js for ergonomics). See `lib/storage/indexeddb.ts` in [Section 14](#14-repository-structure).

#### FR-PER-02: What lives where (privacy boundary)

| Data type | Location | Why |
|---|---|---|
| Session transcripts, plans, images, context | **IndexedDB (browser)** | Never leaves the user's device |
| API keys | **IndexedDB (encrypted via Web Crypto)** | Never leaves the user's device |
| Vector embeddings | **Qdrant Cloud** | Required for retrieval; chunks are general gardening text, not PII |
| Live audio stream (during recording only) | **LiveKit Cloud → OpenRouter** | Transient; not stored |
| Image generation requests | **OpenRouter → Google/OpenAI** | Transient; subject to those providers' retention policies |

**Sprout itself stores no user data on any server it controls.** This is a hard rule, called out in the README.

#### FR-PER-03: Export functionality
Users must be able to export their entire garden data as a single ZIP file via a button in settings. The ZIP contains:
- `/sessions/*.json` and `/sessions/*.md` — every session log
- `/plans/*.json` — every plan version
- `/images/*.png` — every gallery image
- `garden-context.json` and `garden-context.md` — the master summary
- `manifest.json` — index of all files with timestamps
- `README.md` — explains what the export contains

Filename format: `sprout-export-{YYYYMMDD}.zip`

#### FR-PER-04: Import functionality
Users must be able to import a previously-exported ZIP from settings to restore their garden journey on a new device or after clearing browser data. Import:
- Validates the manifest before importing
- Replaces existing data after a confirmation modal (no merging in v1)
- Re-indexes any included PDF documents into Qdrant

#### FR-PER-05: Storage quota management
The settings panel must display:
- Current IndexedDB usage in MB
- Approximate browser quota
- Breakdown by category (sessions, plans, images, documents)

If usage exceeds 80% of available quota, the app must surface a non-blocking warning with a "Manage storage" button that lets users selectively delete old sessions or images.

#### FR-PER-06: Garden context regeneration
After every significant event (new session, plan version, completed task, image generation), the system must regenerate `garden-context.md` and `garden-context.json` by sending all session logs to Mistral with a summarization prompt. Output is normalized and replaces the previous context files.

The regeneration runs as a background job (web worker if available, fallback to async function on idle). User does not block on this.

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Operation | Target | Hard limit |
|---|---|---|
| Voice intake first transcript | < 500ms | 1.5s |
| End-to-end voice → plan | < 8s | 15s |
| PDF ingest (28 pages) | < 30s | 60s |
| Image generation (Nano Banana 2) | < 8s | 20s |
| Image generation (GPT-5.4) | < 15s | 30s |
| Plan render after data arrives | < 200ms | 500ms |

### 7.2 Reliability

- The system must gracefully handle: missing API keys, OpenRouter timeouts, Qdrant unavailability, image generation failures
- Failure states must be visible to the user (red status, error message, retry option)
- No silent failures

### 7.3 Privacy & Security

- API keys stored client-side only
- Photo uploaded for visualization is processed once and not stored server-side beyond the immediate request
- No analytics, no tracking, no telemetry to third parties beyond what the AI providers log themselves
- Privacy commitment documented in README

### 7.4 Browser & device support

**Browsers (all device classes):**
- Chrome 120+
- Safari 17+
- Firefox 120+
- Edge 120+

**Mobile browsers — first-class support, NOT best-effort:**
- Safari iOS 17+ (iPhone)
- Chrome iOS 120+ (iPhone)
- Chrome Android 120+
- Samsung Internet 23+

All features must work end-to-end on mobile. The demo video may be shot on desktop for visual clarity, but the mobile experience must be functional, tested, and verifiable by judges if they open the live deploy on their phone.

**Tablet browsers:**
- Safari iPadOS 17+
- Chrome iPadOS 120+

Tablets get the desktop layout above 1024px width and the mobile layout below it. iPad mini in portrait (744px wide) uses the tablet two-column layout; iPad mini in landscape (1133px) uses desktop.

See [Section 6.7](#67-cross-device--responsive-behavior) for specific responsive behaviors.

### 7.5 Accessibility (best effort)

- Keyboard navigation through all interactive elements
- `K` shortcut works without a mouse
- Color contrast meets WCAG AA where reasonable
- ARIA labels on interactive elements
- No formal WCAG audit; best-effort only for v1

---

## 8. Technical Architecture

### 8.1 System overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Next.js client)                  │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Voice UI   │  │ Knowledge   │  │ Plan + Vision        │  │
│  │ (Sprout)   │  │ Upload      │  │ Display              │  │
│  └────────────┘  └─────────────┘  └──────────────────────┘  │
└──────┬───────────────────┬──────────────────────┬───────────┘
       │                   │                      │
       │ WebRTC            │ HTTPS                │ HTTPS
       │                   │                      │
   ┌───▼─────────┐    ┌────▼──────┐         ┌────▼──────────┐
   │ LiveKit     │    │ Next.js   │         │ trigger.dev   │
   │ Cloud       │    │ API routes│         │ (scheduled    │
   │ (audio)     │    │ (uploads) │         │  jobs)        │
   └───┬─────────┘    └────┬──────┘         └────┬──────────┘
       │                   │                      │
       │  agent runtime    │                      │
       │                   │                      │
   ┌───▼─────────────────────────────────────────▼────────┐
   │              OpenRouter (single AI gateway)           │
   │                                                        │
   │  • mistralai/voxtral-mini-realtime    (STT)           │
   │  • mistralai/mistral-small            (LLM)           │
   │  • mistralai/voxtral-mini-tts         (TTS)           │
   │  • mistralai/mistral-small-multimodal (vision)        │
   │  • openai/text-embedding-3-small      (embeddings)    │
   │  • google/gemini-3.1-flash-image-preview (images)     │
   │  • openai/gpt-5.4-image-2             (images)        │
   └────────────────────────────────────────────────────────┘
                              │
                              │ embeddings + queries
                              │
                          ┌───▼──────────┐
                          │ Qdrant Cloud │
                          │ (vector DB)  │
                          └──────────────┘
```

### 8.2 Three-phase architecture

**Phase I — One-time ingest (when document is uploaded)**
1. Document parsed (pypdf for PDFs)
2. Chunked semantically by chapter and paragraph
3. Each chunk embedded via OpenRouter → OpenAI text-embedding-3-small
4. Chunks upserted to Qdrant Cloud with metadata payload

**Phase II — Live conversation (when user activates voice)**
1. Browser establishes WebRTC connection to LiveKit Cloud
2. LiveKit Agents Python service joins the room
3. Audio streams to Voxtral STT via OpenRouter (real-time)
4. Transcript accumulates as user speaks
5. End-of-turn detected (~1.5s silence)
6. Full transcript sent to Mistral Small via OpenRouter for constraint extraction
7. Constraints become positive/negative vectors for Qdrant Discovery API query
8. Retrieved chunks + constraints sent back to Mistral Small for plan generation
9. Structured plan returned as JSON
10. Plan rendered in UI; Voxtral TTS speaks the summary
11. (If photo uploaded) trigger.dev async job kicks off image generation

**Phase III — Scheduled engagement (background)**
1. trigger.dev cron fires every Sunday 9:00 AM
2. Job loads plan, identifies upcoming week
3. Generates voice message via Voxtral TTS
4. Sends web push notification with audio attachment
5. (User reply path) User voice report → adaptive replan job → Qdrant query → Mistral → updated plan

### 8.3 Why these technology choices

| Decision | Why | What we considered |
|---|---|---|
| OpenRouter as gateway | Single key for all AI; clean code; consistent SDK | Direct provider SDKs for each |
| Qdrant Cloud (not self-hosted) | Free tier, no infra, hackathon constraint | Qdrant OSS in Docker, Qdrant Edge |
| LiveKit (not ElevenLabs) | Modular pipeline preserves Mistral bonus | ElevenLabs Conversational AI |
| trigger.dev (not n8n) | TypeScript code in repo, judges can read it | n8n with JSON workflows |
| Next.js + Vercel | Free deploy, server actions for API routes | Vite + custom backend |
| Nano Banana 2 (default image) | Best at preserving structure when editing existing photos | GPT-5.4 Image, Imagen 4 |
| IndexedDB for client storage | Generous quota (~50–500MB), structured queries, async API | localStorage (too small), server DB (privacy) |

### 8.4 Hosting & Deployment

The application has three deployable components, each hosted independently:

#### 1. Frontend & API Routes — Vercel (Next.js)

**This is the right choice and the PRD commits to it.** Reasoning:
- Free Hobby tier covers hackathon demo traffic (no surprise bills)
- Automatic deploys from GitHub `main` branch — every commit is a preview URL
- Edge functions for low-latency API routes (sub-100ms TTFB globally)
- Built-in environment variable management in the dashboard
- Native Next.js integration (Vercel built Next.js — fewer surprises than other platforms)
- Automatic HTTPS with custom domains
- Serverless functions for API routes scale automatically
- Vercel Blob available if we want shareable image URLs (post-v1)

**What lives on Vercel:**
- Static React app (the entire UI)
- API routes: `/api/upload-doc`, `/api/extract-constraints`, `/api/generate-plan`, `/api/generate-vision`, `/api/livekit-token`, `/api/test-key`
- IndexedDB lives in the browser, not Vercel — Vercel just serves the JavaScript that uses it

#### 2. Voice Agent Service — Separate Python deployment

LiveKit Agents requires a long-running Python process. **Vercel's serverless environment cannot host this** — serverless functions have execution time limits incompatible with always-on agent workers.

Three deployment options ranked by recommendation for the hackathon:

| Option | Cost | Setup difficulty | Pros | Cons |
|---|---|---|---|---|
| **LiveKit Cloud Agent Workers** | Included with LiveKit | Lowest | Zero-config, same provider as audio routing, no separate dashboard | Beta feature; verify availability May 5 |
| **Railway** | $5/mo Hobby ($5 free credit) | Low | One-click GitHub deploy, simple env vars | Burns through free credit during testing |
| **Fly.io** | ~$3/mo, pay-as-you-go | Medium | Fastest cold starts, global regions | More CLI-driven setup |
| **Hostinger VPS** | $5–10/mo | Medium-High | Cory already operates these | Manual systemd setup, no GitHub integration |

**Recommendation:** Start with LiveKit Cloud Agent Workers if available on May 5. If not, deploy to Railway with a one-click GitHub integration. Document the choice in README so judges can verify.

For the demo video specifically, the Python agent can also run locally on your MacBook during recording — this guarantees zero network latency and removes a moving part. For the live deploy linked in the README, use Railway or LiveKit Cloud Agents.

#### 3. Vector Database — Qdrant Cloud

Free 1GB tier provisioned from the Qdrant Cloud dashboard. No deployment work — it's a managed service. Connection details (`QDRANT_URL`, `QDRANT_API_KEY`) go into Vercel env vars and the agent service env vars.

#### Deployment topology

```
┌────────────────────────────────────────────────────────────┐
│                      User's Browser                        │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Next.js client                                      │ │
│  │    ↕                                                  │ │
│  │  IndexedDB (sessions, plans, images, context, keys)  │ │
│  └──────────────────────────────────────────────────────┘ │
└────┬───────────────────────────────────────┬──────────────┘
     │                                       │
     │ HTTPS                                 │ WebRTC (audio)
     │                                       │
┌────▼─────────────────┐              ┌──────▼─────────────┐
│  Vercel              │              │  LiveKit Cloud     │
│  • Static pages      │              │  • Audio routing   │
│  • Next.js API       │              │  • Agent Workers   │
│    routes (edge)     │              │    (or Railway)    │
└────┬─────────────────┘              └──────┬─────────────┘
     │                                       │
     │ Server-to-server API calls            │ Worker-to-AI
     │                                       │
     └───────────────┬───────────────────────┘
                     │
                     ▼
       ┌────────────────────────────┐
       │  OpenRouter (single        │
       │  AI gateway for all models)│
       │  ──────────────────────────│
       │  + Qdrant Cloud (vector DB)│
       │  + trigger.dev (scheduled) │
       └────────────────────────────┘
```

#### CI/CD

- Vercel: automatic on push to `main`. Preview deploys on every PR.
- Agent service (Railway): automatic on push to `main` (path filter on `agent/`).
- trigger.dev: deployed via `npx trigger.dev@latest deploy` from CI.

#### Custom domain (optional)

Recommended: `sprout.cory.dev` or similar via Vercel's domain settings. Adds polish for the demo video without additional cost.

---

## 9. Tech Stack

### 9.1 Frontend

| Package | Version | Purpose |
|---|---|---|
| `next` | 15.x | React framework, app router |
| `react` | 19.x | UI library |
| `typescript` | 5.x | Type safety |
| `tailwindcss` | 4.x | Styling |
| `livekit-client` | 2.x | WebRTC voice connection |
| `@livekit/components-react` | 2.x | Audio components |
| `lucide-react` | latest | Icon library |
| `framer-motion` | 11.x | Plan timeline animations |
| `zustand` | 5.x | Client state (plan, transcript, settings) |
| `react-dropzone` | 14.x | File upload UX |
| `dexie` | 4.x | IndexedDB wrapper for sessions, plans, gallery |
| `jszip` | 3.x | Export/import ZIP archives |
| `react-photo-view` | 1.x | Lightbox for gallery image viewing |

### 9.2 Voice agent runtime (Python)

| Package | Version | Purpose |
|---|---|---|
| `livekit-agents` | latest | Agent framework |
| `livekit-plugins-openai` | latest | OpenAI-compatible STT/LLM/TTS plugins (used with OpenRouter) |
| `livekit-plugins-silero` | latest | Voice activity detection (VAD) |
| `python-dotenv` | latest | Env var loading |

### 9.3 Backend (Next.js API routes)

| Package | Version | Purpose |
|---|---|---|
| `@qdrant/js-client-rest` | latest | Qdrant client |
| `openai` | latest | OpenAI-compatible SDK (pointed at OpenRouter) |
| `pdf-parse` | latest | PDF text extraction |
| `mammoth` | latest | DOCX text extraction |
| `@trigger.dev/sdk` | latest | Scheduled jobs |
| `livekit-server-sdk` | latest | Token minting |
| `web-push` | latest | Browser push notifications |

### 9.4 Ingest pipeline (Python — runs locally during dev or as Vercel function)

| Package | Version | Purpose |
|---|---|---|
| `pypdf` | latest | PDF parsing |
| `qdrant-client` | latest | Qdrant Python client |
| `openai` | latest | Embeddings via OpenRouter |
| `langchain-text-splitters` | latest | Semantic chunking utilities |

### 9.5 OpenRouter model identifiers

| Model | OpenRouter ID | Purpose |
|---|---|---|
| Voxtral Mini Realtime | `mistralai/voxtral-mini-realtime` | Streaming STT |
| Mistral Small | `mistralai/mistral-small` | Reasoning, constraint extraction, plan gen |
| Voxtral Mini TTS | `mistralai/voxtral-mini-tts` | Text-to-speech |
| Mistral Small Multimodal | `mistralai/mistral-small-multimodal` | Photo analysis |
| OpenAI Embeddings | `openai/text-embedding-3-small` | Vector embeddings (1536d) |
| Gemini Nano Banana 2 | `google/gemini-3.1-flash-image-preview` | Image generation (default) |
| GPT-5.4 Image | `openai/gpt-5.4-image-2` | Image generation (alternative) |

---

## 10. Data Model & Schemas

### 10.1 Qdrant collection: `sprout_kb`

```typescript
{
  collection_name: "sprout_kb",
  vectors_config: {
    dense: {
      size: 1536,
      distance: "Cosine"
    }
  },
  sparse_vectors_config: {
    bm25: {
      modifier: "idf"
    }
  }
}
```

### 10.2 Qdrant point structure

Each chunk becomes one point in Qdrant with this shape:

```typescript
{
  id: string,                    // UUID v4
  vector: {
    dense: number[],             // 1536-dim float array
    bm25: SparseVector           // Qdrant sparse representation
  },
  payload: {
    // Source attribution
    text: string,                // The chunk text content
    source_doc: string,          // Original filename
    page: number,                // PDF page number (1-indexed)
    chapter: number,             // Chapter number (1-3 for green-thumb-beginnings)
    section_title: string,       // E.g., "Why raised beds are ideal..."
    chunk_index: number,         // Position in source doc
    chunk_type: "narrative" | "list" | "table" | "heading",

    // Semantic metadata (LLM-extracted at ingest time)
    topics: string[],            // E.g., ["soil-prep", "container-gardening"]
    crops_mentioned: string[],   // E.g., ["tomato", "lettuce", "bean"]
    difficulty_rating: number,   // 1-5 scale
    time_investment_hours: number | null,  // Hours per week if mentioned
    space_required_sqft: number | null,    // Square feet if mentioned
    seasons: string[],           // ["spring", "summer", "fall", "winter"]

    // Indexing metadata
    indexed_at: string,          // ISO timestamp
    embedding_model: string      // "openai/text-embedding-3-small"
  }
}
```

### 10.3 Constraint extraction schema (Mistral output)

When the user finishes speaking, the full transcript is sent to Mistral with a structured-output prompt. Mistral returns:

```typescript
{
  // Direct constraints (positive vectors for Discovery API)
  space_type: "patio" | "balcony" | "back_yard" | "raised_bed" | "container_only",
  available_sqft: number | null,
  sun_hours: number | null,           // Direct sunlight per day
  time_per_week_hours: number,
  goals: string[],                    // E.g., ["salad-vegetables", "cherry-tomatoes"]
  climate_zone: string | null,        // USDA zone if known

  // Negative vectors for Discovery API
  dislikes: string[],                 // E.g., ["daily-watering", "pests", "pruning"]

  // Confidence flags (drives clarifying questions if needed)
  confidence: {
    space_type: number,               // 0-1
    sun_hours: number,
    time_per_week: number,
    goals: number
  }
}
```

### 10.4 Plan output schema

```typescript
{
  plan_id: string,                    // UUID
  plan_version: number,               // 1, 2, 3... incremented on each replan
  generated_at: string,               // ISO timestamp
  source_session_id: string,          // SessionLog.id that triggered this plan
  trigger_event: string,              // "initial_planning" | "flea_beetle_remediation" | etc.
  parent_version: number | null,      // Previous plan version this evolved from (null for v1)
  user_constraints: ConstraintSchema, // Above
  garden_type_recommendation: {
    type: string,                     // E.g., "container_garden"
    rationale: string,
    source_chunks: string[]           // Qdrant point IDs cited
  },
  recommended_crops: [{
    name: string,                     // E.g., "Cherry Tomatoes"
    rationale: string,
    difficulty: number,
    source_chunks: string[]
  }],
  weeks: [{
    week_number: number,              // 1-12
    date_range: { start: string, end: string },
    title: string,                    // E.g., "Plant your beans"
    tasks: [{
      id: string,                     // UUID
      title: string,
      description: string,
      time_estimate_minutes: number,
      source_chunk: string,           // Qdrant point ID
      completed: boolean,
      completed_at: string | null     // ISO timestamp
    }],
    crops_active: string[],           // Crop names active this week
    voice_summary: string             // ~50 words for TTS playback
  }],
  shopping_list: [{
    item: string,
    quantity: string,                 // "3 packets" or "5 lb"
    needed_by_week: number,
    purchased: boolean
  }]
}
```

### 10.5 Session log schema

Every voice conversation produces one of these. Stored in IndexedDB `sessions` object store.

```typescript
{
  id: string,                         // UUID v4
  timestamp: string,                  // ISO timestamp (session start)
  duration_seconds: number,
  transcript: string,                 // Full STT output
  user_intent: "initial_planning" | "weekly_checkin" | "problem_report" | "general_chat",
  summary: string,                    // 2-3 sentence Mistral-generated summary
  topics_discussed: string[],         // Auto-tagged: ["soil-prep", "pest-control"]
  decisions_made: string[],           // E.g., ["committed to cherry tomatoes", "rejected zucchini"]
  observations_reported: string[],    // E.g., ["lettuce has holes in leaves"]
  extracted_constraints: ConstraintSchema | null,  // Only present if intent triggered constraint extraction
  generated_plan_id: string | null,   // PlanSchema.plan_id if a plan was produced
  generated_plan_version: number | null,
  audio_duration_kb: number,          // Approximate audio data processed (for usage tracking)
  cost_usd: number                    // Estimated total cost of this session (STT + LLM + TTS tokens)
}
```

The Markdown version (saved alongside as `sessions/{id}.md`) is human-readable:

```markdown
# Session: 2026-05-11 09:14:22

**Duration:** 47 seconds
**Intent:** problem_report
**Generated plan:** v3

## Summary
User reports flea beetles on lettuce. Decided to add row cover and update shopping list.

## Topics
- pest-control
- lettuce
- companion-planting

## Transcript
> My lettuce already has holes in the leaves...

## Decisions
- Add floating row cover to shopping list
- Continue with current crop selection

## Plan changes
- Plan v2 → v3
- Added Week 4 task: "Install row cover over lettuce"
- Added shopping list item: "Floating row cover, 6ft x 20ft"
```

### 10.6 Garden context schema (master aggregated state)

This is the file regenerated after every session. Always represents the user's current garden reality.

**`garden-context.json`** (machine-readable, fed to LLM as context):

```typescript
{
  last_updated: string,               // ISO timestamp
  total_sessions: number,
  active_plan_id: string,
  active_plan_version: number,

  garden_profile: {
    space_type: string,
    available_sqft: number | null,
    sun_hours: number | null,
    time_per_week_hours: number,
    climate_zone: string | null,
    goals: string[],
    dislikes: string[]
  },

  currently_growing: [{
    crop: string,
    planted_week: number,
    expected_harvest_week: number,
    status: "thriving" | "struggling" | "harvested" | "lost"
  }],

  crops_chosen: string[],             // Ever committed to
  crops_rejected: string[],           // Explicitly declined

  recent_observations: [{
    date: string,
    observation: string,
    session_id: string
  }],

  open_problems: [{
    issue: string,
    reported_at: string,
    session_id: string,
    status: "active" | "remediating" | "resolved"
  }],

  resolved_issues: [{
    issue: string,
    resolved_at: string,
    resolution: string
  }],

  key_milestones: [{
    date: string,
    event: string                     // "First plan generated", "First harvest", etc.
  }],

  plan_version_history: [{
    version: number,
    generated_at: string,
    trigger: string,
    session_id: string
  }]
}
```

**`garden-context.md`** (human-readable journal):

```markdown
# Cory's Garden Journal

**Last updated:** May 11, 2026 9:14 AM
**Sessions:** 4 · **Active plan:** v3

## Garden Profile
- **Space:** Patio, ~50 sq ft
- **Sun:** 6 hours direct
- **Time:** 2 hours/week
- **Climate:** USDA Zone 7b
- **Goals:** Salad vegetables, cherry tomatoes
- **Avoiding:** Daily watering, pests, pruning

## Currently Growing
- 🍅 Cherry tomatoes (planted Week 2 — thriving)
- 🫘 Bush beans (planted Week 3 — thriving)
- 🥬 Leaf lettuce (started Week 1 — struggling, flea beetles)

## Recent Observations
- **May 11:** Lettuce showing holes (likely flea beetles)
- **May 4:** First true leaves on tomato seedlings

## Open Issues
- 🟡 **Flea beetles on lettuce** — remediation in progress (row cover ordered)

## Plan History
- v1 (May 4): Initial planning
- v2 (May 11): Added bean trellis after weather check
- v3 (May 11): Revised after flea beetle report
```

### 10.7 Gallery image schema

Each image generated by Nano Banana 2 or GPT-5.4 Image is saved as a record in the IndexedDB `gallery` object store.

```typescript
{
  id: string,                         // UUID
  generated_at: string,               // ISO timestamp
  source_photo_blob: Blob | null,    // Original photo (if user uploaded one)
  generated_image_blob: Blob,        // The AI-generated image
  thumbnail_data_url: string,         // Pre-rendered thumbnail (200x200) for grid view
  engine_used: "nano_banana" | "gpt_image",
  model_id: string,                   // "google/gemini-3.1-flash-image-preview"
  prompt_used: string,                // The exact prompt sent to the image model
  plan_id: string | null,             // Plan this image visualizes
  plan_version: number | null,
  user_label: string | null,          // Optional user-assigned title
  generation_time_ms: number,
  cost_usd: number,
  width: number,
  height: number,
  file_size_kb: number
}
```

### 10.8 Settings schema (client-side IndexedDB)

```typescript
{
  api_keys: {
    openrouter: string,               // Encrypted
    qdrant_url: string,               // Plaintext (URL is not secret)
    qdrant_api_key: string,           // Encrypted
    livekit_url: string,
    livekit_api_key: string,
    livekit_api_secret: string,
    trigger_dev: string | null        // Optional, encrypted if set
  },
  preferences: {
    image_engine: "nano_banana" | "gpt_image",
    tts_voice: "neutral_male" | "neutral_female",
    demo_accelerator: boolean,        // 1 minute = 1 week
    notification_time: string         // "09:00"
  },
  current_plan_id: string | null
}
```

---

## 11. API Contracts

### 11.1 Internal API routes

#### `POST /api/upload-doc`

Upload and ingest a document into the knowledge base.

**Request:** `multipart/form-data` with field `file`

**Response:**
```typescript
{
  doc_id: string,
  filename: string,
  size_bytes: number,
  page_count: number,
  chunk_count: number,
  vector_count: number,
  status: "indexed" | "processing" | "failed",
  error?: string
}
```

#### `POST /api/extract-constraints`

Extract structured constraints from voice transcript.

**Request:**
```typescript
{
  transcript: string,
  photo_url?: string  // Optional, triggers Mistral multimodal analysis
}
```

**Response:** `ConstraintSchema` (see Section 10.3)

#### `POST /api/generate-plan`

Generate a 12-week plan from constraints.

**Request:**
```typescript
{
  constraints: ConstraintSchema
}
```

**Response:** `PlanSchema` (see Section 10.4)

#### `POST /api/generate-vision`

Generate a future-state vision image from photo + plan.

**Request:**
```typescript
{
  photo_data: string,                 // Base64-encoded image
  plan_id: string,
  engine: "nano_banana" | "gpt_image" // From user settings
}
```

**Response:**
```typescript
{
  image_url: string,                  // Generated image URL
  generation_time_ms: number,
  engine_used: string,
  cost_usd: number                    // Estimated cost for transparency
}
```

#### `POST /api/livekit-token`

Mint a LiveKit access token for the browser to join the agent room.

**Request:**
```typescript
{
  room_name: string,                  // E.g., "user-{session-id}"
  participant_name: string
}
```

**Response:**
```typescript
{
  token: string,
  url: string                         // LiveKit cloud URL
}
```

#### `POST /api/test-key`

Test an API key without storing it.

**Request:**
```typescript
{
  service: "openrouter" | "qdrant" | "livekit" | "trigger_dev",
  credentials: object                 // Service-specific
}
```

**Response:**
```typescript
{
  valid: boolean,
  message: string,
  test_duration_ms: number
}
```

### 11.2 LiveKit Agent contract

The Python agent service receives audio from LiveKit, transcribes via Voxtral, and sends events back to the browser via LiveKit data channels:

**Events emitted:**
- `transcript_partial` — `{ text: string, is_final: false }`
- `transcript_final` — `{ text: string, is_final: true }`
- `agent_thinking` — `{ stage: "extracting_constraints" | "querying_kb" | "generating_plan" }`
- `plan_ready` — `{ plan_id: string }`
- `tts_started` — `{ }`
- `tts_complete` — `{ }`

---

## 12. UI/UX Specification

### 12.1 Design system tokens

```css
:root {
  /* Surfaces */
  --paper: #f8f6f0;
  --paper-cream: #fcfaf5;
  --paper-warm: #f0ede0;
  --card: #ffffff;

  /* Ink */
  --ink: #1a2418;
  --ink-soft: #2d3d2a;
  --ink-muted: #5d6b4f;
  --ink-faded: #8d9b7d;

  /* Brand */
  --forest: #2d3d2a;
  --forest-deep: #1a3d2e;
  --sage: #5a8a3a;
  --lime: #c4dd58;
  --lime-bright: #d4eb6a;
  --terracotta: #c4825a;
  --water-blue: #6db4d4;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(45,61,42,0.05), 0 2px 4px rgba(45,61,42,0.04);
  --shadow-md: 0 4px 12px rgba(45,61,42,0.06), 0 12px 32px rgba(45,61,42,0.06);
  --shadow-lg: 0 12px 32px rgba(45,61,42,0.08), 0 24px 64px rgba(45,61,42,0.10);
}
```

### 12.2 Typography

| Use | Font | Weight | Notes |
|---|---|---|---|
| Display headlines | Inter Tight | 700 | Letter-spacing -0.03em |
| Italic emphasis | Fraunces | 500 italic | Variable opsz: 24-144 |
| Body | Inter | 400-600 | 15-16px base |
| Technical labels | IBM Plex Mono | 500-600 | Tracking +14% |
| Keyboard keys | IBM Plex Mono | 600 | Inside `.kbd-key` style |

### 12.3 Sprout character

The voice agent character is the brand. Visual spec:

- **Size:** 280×320px (idle), 240×280px (modal)
- **Body:** 144×144px circle with radial gradient `#d8eb78 → #b8d97a → #8fb340`
- **Leaves:** 92×110px each, gradient `#5a8a3a → #2d5a2c`, drop shadow
- **Pot:** 180×100px, gradient `#c4825a → #a55a40`, with rim and soil
- **Face:** Two 11×11px dark eyes with white highlight dots, 18×9px curved mouth
- **Animations (idle):** 4s breathe, 5s leaf sway, 5s blink
- **Animations (listening):** 1.2s breathe, 1.6s leaf sway, faster blink, watering can appears, water drops fall, soil darkens

### 12.4 Reference mockups

These HTML files in the repo represent the visual target:

- `mockups/sprout_design_04.html` — Main app layout with all components
- `mockups/sprout_design_04_listening.html` — Listening states (inline + modal)

The build should match these mockups visually within ~5% deviation. Color palette, typography, spacing, animations should be ports of the CSS in those files.

### 12.5 Layout structure

```
┌─────────────────────────────────────────────────────────────┐
│  [Brand]        [Today | KB | Plan | Vision]    [K]  [⚙]    │  ← Sticky topbar
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────┐  ┌──────────────────────┐ │
│  │                             │  │  THIS WEEK           │ │
│  │     [Sprout Character]      │  │  Plant your beans    │ │
│  │                             │  │                      │ │
│  │   Talk to me about          │  │  ☑ Prep soil         │ │
│  │   your space.               │  │  ☑ Start tomatoes    │ │
│  │                             │  │  ▶ Soak bean seeds   │ │
│  │   [Tap to talk]  or  [K]   │  │  ☐ Set up trellis    │ │
│  │                             │  │  ☐ Mulch tomatoes    │ │
│  └─────────────────────────────┘  └──────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  KNOWLEDGE BASE                                       │  │
│  │  ┌─────────────────┐  ┌────────────────────────────┐ │  │
│  │  │ [Drop files]    │  │ green-thumb-beginnings.pdf │ │  │
│  │  │                 │  │ usda-zone-7b-companions    │ │  │
│  │  │ Choose files    │  │ my-garden-notes.md         │ │  │
│  │  └─────────────────┘  └────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  GARDEN VISION                                        │  │
│  │  [Before] ↔ [After]      [Nano Banana | GPT-5.4]    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  CONNECT YOUR SERVICES (forest green section)         │  │
│  │  Required: OpenRouter | Qdrant | LiveKit             │  │
│  │  Optional: trigger.dev                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              [Hold K to talk to Sprout]  ← Floating
```

### 12.6 Responsive breakpoints

The application uses **mobile-first CSS** with three breakpoints. Default styles target mobile; media queries progressively enhance for larger screens.

```css
/* Default (mobile): 320px–640px */
/* Single-column layouts, stacked components, touch-first sizing */

@media (min-width: 641px) {
  /* Tablet: 641px–1024px */
  /* Two-column hero, two-column knowledge base body, side-by-side photos */
}

@media (min-width: 1025px) {
  /* Desktop: 1025px+ */
  /* Final desktop layout, K-hold shortcut visible, floating hint visible */
}

@media (min-width: 1280px) {
  /* Large desktop: 1280px+ */
  /* Max-width container kicks in, no further scaling */
}
```

**Component-level breakpoint behavior:**

| Component | < 641px (mobile) | 641px–1024px (tablet) | 1025px+ (desktop) |
|---|---|---|---|
| Top bar | Brand + ⚙ icon only | Brand + tabs + ⚙ | Brand + tabs + K hint + ⚙ |
| Hero grid | Stacked (voice → plan) | Two-column 1fr/1fr | Two-column 1.65fr/1fr |
| Sprout character | 240px (scaled) | 280px | 280px |
| Voice CTA row | Full-width stack | Inline horizontal | Inline horizontal |
| Knowledge base | Stacked vertically | Two-column 1fr/1fr | Two-column 1.4fr/1fr |
| Dropzone padding | 32px 20px | 48px 28px | 56px 32px |
| File card | Compact (no preview line) | Standard | Standard |
| Photo grid | Stacked, full width | Side-by-side | Side-by-side |
| Photo engine tabs | Stacked above generate btn | Inline | Inline |
| API keys grid | Single column | Two columns | Two columns |
| Settings | Bottom sheet (slide up) | Centered modal | Inline section |
| Floating K hint | **Hidden** | Hidden | Visible |
| Long-press hint | Visible | Hidden | Hidden |

### 12.7 Mobile-specific components & patterns

**Long-press handler on sprout character:**
```typescript
// Usage pattern on the SproutCharacter component
const longPressTimer = useRef<NodeJS.Timeout | null>(null);
const LONG_PRESS_MS = 500;

const handlePointerDown = () => {
  longPressTimer.current = setTimeout(() => {
    triggerModalListening();
  }, LONG_PRESS_MS);
};

const handlePointerUp = () => {
  if (longPressTimer.current) {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    if (!isModalOpen) triggerInlineListening();
  } else {
    // Long-press already fired — release sends the transcript
    finalizeModalRecording();
  }
};
```

**Bottom sheet settings (mobile):**
On mobile, the settings panel slides up from the bottom of the screen with a backdrop and a drag handle. Uses `100dvh` for height. Tapping outside or swiping down dismisses.

**Floating bottom action bar (mobile only):**
Replaces the floating "Hold K" hint on touch devices. Shows the press-and-hold instruction prominently:
```
┌─────────────────────────────────────┐
│  Press & hold sprout to talk     ▼  │
└─────────────────────────────────────┘
```

**Mobile listening modal:**
Full-viewport with no padding. Sprout character at 200px. Waveform spans full width. Transcript box uses 18px font (vs 22px on desktop). Stop button is 56px tall and sits at the bottom in the thumb-reach zone, respecting safe area.

**iOS audio context unlock:**
On the first interaction with the sprout (any pointer event), call `audioContext.resume()` to unlock mobile Safari audio playback. Without this, Voxtral TTS will fail silently on iPhones.

**Native camera capture:**
```html
<input
  type="file"
  accept="image/*"
  capture="environment"
  onChange={handlePhotoUpload}
/>
```
The `capture="environment"` attribute prompts iOS/Android to open the rear camera directly when the user taps "Take photo." On desktop, the same input falls back to standard file picker.

---

## 13. Environment Variables

Create a `.env.local` file (Next.js) and a `.env` file (Python agent service):

### 13.1 `.env.local` (Next.js / browser-accessible prefixed with NEXT_PUBLIC_)

```bash
# OpenRouter — single gateway for all AI
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx

# Qdrant Cloud
QDRANT_URL=https://xxxxxxxx.us-east-0-1.aws.cloud.qdrant.io
QDRANT_API_KEY=qdrant-xxxxxxxxxxxxxxxxxxxxxx

# LiveKit Cloud
LIVEKIT_URL=wss://xxxxxxxx.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_LIVEKIT_URL=wss://xxxxxxxx.livekit.cloud

# trigger.dev (optional)
TRIGGER_API_KEY=tr_pat_xxxxxxxxxxxxxxxxxxxxxxxx
TRIGGER_PROJECT_ID=proj_xxxxxxxxxx

# Web push (optional)
VAPID_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_VAPID_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

# Application config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AGENT_SERVICE_URL=https://sprout-agent.up.railway.app
NODE_ENV=development
```

### 13.2 `agent/.env` (Python LiveKit agent service)

```bash
# OpenRouter for Voxtral STT/TTS + Mistral LLM
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# LiveKit Cloud
LIVEKIT_URL=wss://xxxxxxxx.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxxxxxxxxxxxxxx

# Qdrant for retrieval during agent reasoning
QDRANT_URL=https://xxxxxxxx.us-east-0-1.aws.cloud.qdrant.io
QDRANT_API_KEY=qdrant-xxxxxxxxxxxxxxxxxxxxxx

# Model selection
MISTRAL_LLM_MODEL=mistralai/mistral-small
MISTRAL_STT_MODEL=mistralai/voxtral-mini-realtime
MISTRAL_TTS_MODEL=mistralai/voxtral-mini-tts
MISTRAL_TTS_VOICE=neutral_male
```

### 13.3 `.env.example` template

A version-controlled `.env.example` file should exist with all keys and placeholder values. Real `.env` and `.env.local` files must be in `.gitignore`.

---

## 14. Repository Structure

```
sprout/
├── README.md                          # Project overview, setup, demo video link
├── ARCHITECTURE.md                    # Technical architecture deep-dive
├── PRD.md                             # This document
├── .env.example                       # Template for required env vars
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
│
├── app/                               # Next.js app router
│   ├── layout.tsx                     # Root layout
│   ├── page.tsx                       # Main app interface
│   ├── globals.css                    # Tailwind + design tokens
│   │
│   ├── api/
│   │   ├── upload-doc/route.ts        # POST: ingest document
│   │   ├── extract-constraints/route.ts
│   │   ├── generate-plan/route.ts
│   │   ├── generate-vision/route.ts
│   │   ├── livekit-token/route.ts
│   │   └── test-key/route.ts
│   │
│   └── (components)/
│       ├── voice-agent/
│       │   ├── SproutCharacter.tsx
│       │   ├── VoiceCard.tsx
│       │   ├── ListeningModal.tsx
│       │   ├── Waveform.tsx
│       │   └── WateringAnimation.tsx
│       ├── knowledge-base/
│       │   ├── KnowledgeBase.tsx
│       │   ├── Dropzone.tsx
│       │   └── FileList.tsx
│       ├── plan/
│       │   ├── PlanCard.tsx           # This week's tasks
│       │   ├── PlanTimeline.tsx       # Full 12-week view
│       │   ├── PlanHistory.tsx        # All plan versions
│       │   └── CropCard.tsx
│       ├── vision/
│       │   ├── VisionBoard.tsx
│       │   ├── PhotoUpload.tsx
│       │   ├── Gallery.tsx            # Grid of generated images
│       │   ├── GalleryItem.tsx        # Single image card
│       │   └── ImageLightbox.tsx      # Full-size viewer
│       ├── journal/
│       │   ├── GardenJournal.tsx      # Sessions list view
│       │   ├── SessionEntry.tsx       # Single session expanded
│       │   └── ContextSummary.tsx     # garden-context.md rendered
│       ├── settings/
│       │   ├── SettingsPanel.tsx
│       │   ├── ApiKeyCard.tsx
│       │   ├── StorageQuota.tsx       # IndexedDB usage display
│       │   └── ExportImport.tsx       # ZIP export/import
│       └── shared/
│           ├── TopBar.tsx
│           ├── KbdHint.tsx
│           └── FloatingKbd.tsx
│
├── lib/                               # Shared client/server code
│   ├── qdrant.ts                      # Qdrant client + helpers
│   ├── openrouter.ts                  # Unified OpenRouter client
│   ├── livekit.ts                     # LiveKit token minting
│   ├── ingest/
│   │   ├── chunk.ts                   # Semantic chunking
│   │   ├── embed.ts                   # Embedding generation
│   │   └── pdf-parse.ts               # PDF extraction
│   ├── storage/                       # IndexedDB layer (NEW)
│   │   ├── db.ts                      # Dexie.js IndexedDB wrapper
│   │   ├── session-store.ts           # Session log CRUD
│   │   ├── plan-store.ts              # Plan version CRUD
│   │   ├── gallery-store.ts           # Image gallery CRUD
│   │   ├── context-store.ts           # garden-context aggregation
│   │   └── export.ts                  # ZIP export/import
│   ├── prompts/
│   │   ├── constraint-extraction.ts   # System prompts
│   │   ├── plan-generation.ts
│   │   ├── photo-analysis.ts
│   │   ├── voice-summary.ts
│   │   ├── session-summary.ts         # NEW: summarize a session
│   │   └── context-aggregation.ts     # NEW: build garden-context
│   ├── stores/
│   │   ├── settings-store.ts          # Zustand: API keys (mirrors IndexedDB)
│   │   ├── plan-store.ts              # Zustand: current plan
│   │   ├── voice-store.ts             # Zustand: voice state
│   │   └── gallery-store.ts           # Zustand: gallery state
│   ├── crypto.ts                      # Web Crypto for key encryption
│   └── types.ts                       # Shared TypeScript types
│
├── agent/                             # Python LiveKit agent service
│   ├── main.py                        # Agent entrypoint
│   ├── prompts.py                     # System prompt templates
│   ├── qdrant_query.py                # Discovery API helpers
│   ├── requirements.txt
│   └── .env                           # Agent-specific env vars
│
├── trigger/                           # trigger.dev jobs
│   ├── trigger.config.ts
│   ├── jobs/
│   │   ├── weekly-nudge.ts            # Sunday 9 AM cron
│   │   ├── adaptive-replan.ts         # On-demand
│   │   └── generate-vision.ts         # Async image gen
│   └── package.json
│
├── scripts/                           # Dev utilities
│   ├── ingest-local.py                # Local PDF ingest for dev
│   ├── reset-qdrant.py                # Drop and recreate collection
│   └── test-openrouter.ts             # Verify all models accessible
│
├── mockups/                           # Design references (commit these)
│   ├── sprout_design_04.html
│   └── sprout_design_04_listening.html
│
├── public/
│   ├── favicon.svg
│   └── og-image.png
│
└── tests/
    ├── e2e/                           # Playwright E2E tests
    │   ├── voice-flow.spec.ts
    │   ├── upload-flow.spec.ts
    │   └── settings-flow.spec.ts
    └── unit/                          # Vitest unit tests
        ├── chunk.test.ts
        ├── qdrant.test.ts
        └── prompts.test.ts
```

---

## 15. Implementation Plan

### Week 1 (May 5–11) — Foundations

**Goal:** All accounts created, infrastructure ready, ingest pipeline working end-to-end.

**Tasks:**
- [ ] Create accounts: OpenRouter, Qdrant Cloud, LiveKit Cloud, trigger.dev, Vercel, Railway (or confirm LiveKit Cloud Agent Workers available)
- [ ] Initialize Next.js 15 project with Tailwind 4, TypeScript 5
- [ ] **Connect repo to Vercel from day 1** — push commits get auto-deployed; you get a preview URL immediately
- [ ] Implement `lib/openrouter.ts` — unified client with all 7 model IDs
- [ ] Test OpenRouter access for each model (`scripts/test-openrouter.ts`)
- [ ] Create Qdrant collection `sprout_kb` with dense + BM25 sparse vectors
- [ ] Build PDF ingest pipeline:
  - `lib/ingest/pdf-parse.ts` (extract text + page numbers)
  - `lib/ingest/chunk.ts` (semantic chunking)
  - `lib/ingest/embed.ts` (OpenRouter → text-embedding-3-small)
  - `app/api/upload-doc/route.ts` (orchestration)
- [ ] Build minimal upload UI to test ingest end-to-end
- [ ] Verify retrieval works via debug route `app/api/debug/query`
- [ ] Confirm production Vercel deploy works at this stage — if it doesn't, fix before week 2 starts

**Acceptance criteria:**
- Upload `green-thumb-beginnings.pdf`, see vector count tick up to ~98 in Qdrant Cloud dashboard
- Query "How do I prepare soil for tomatoes?" returns relevant chunks with page numbers
- Vercel preview URL works from a phone (basic page loads)

### Week 2 (May 12–18) — Voice intake + constraint extraction

**Goal:** Real voice in → structured JSON constraints out.

**Tasks:**
- [ ] Set up LiveKit Cloud project, get keys
- [ ] Build `agent/main.py` — Python LiveKit agent service
- [ ] Wire Voxtral Mini Realtime as STT plugin (via OpenRouter base URL override)
- [ ] Implement turn detection with Silero VAD
- [ ] Stream transcripts to browser via LiveKit data channels
- [ ] Build `app/api/extract-constraints/route.ts`:
  - Send transcript to Mistral Small via OpenRouter
  - Use structured output (JSON mode)
  - Return `ConstraintSchema`
- [ ] Build session logging infrastructure:
  - `lib/storage/db.ts` — Dexie.js wrapper, schema declaration
  - `lib/storage/session-store.ts` — CRUD operations for `SessionLog`
  - `lib/prompts/session-summary.ts` — Mistral prompt for 2-3 sentence summaries
- [ ] After every voice session, persist `SessionLog` JSON + auto-generated `.md` to IndexedDB
- [ ] Build minimum-viable voice UI:
  - SproutCharacter component (idle state only)
  - "Tap to talk" button
  - Live transcript display
  - No styling yet
- [ ] Implement `K` keyboard shortcut handler

**Acceptance criteria:**
- Click "Tap to talk", say "I have a sunny patio about 50 square feet, two hours a week, want salad vegetables, hate daily watering"
- See live transcript stream in
- After silence, see structured JSON constraint output in console

### Week 3 (May 19–25) — Planning engine + UI polish

**Goal:** Plan generation working, full UI matching design 04.

**Tasks:**
- [ ] Build `lib/qdrant.ts` Discovery API helper:
  - `discoverPlan(constraints)` returns ranked crop list
  - Use positives (goals) and negatives (dislikes) as vector pairs
  - Use `crops_mentioned`, `difficulty_rating` payload filters
- [ ] Build `app/api/generate-plan/route.ts`:
  - Take constraints + retrieved chunks
  - Mistral Small generates 12-week structured plan
  - Return `PlanSchema`
- [ ] Build plan UI components:
  - `PlanCard` (current week, forest green)
  - `PlanTimeline` (full 12 weeks with crop cards)
  - Source citation links
- [ ] Add Voxtral TTS for plan summary playback
- [ ] Implement listening states with watering animation (port CSS from mockup)
- [ ] Implement modal listening state (K-hold full-screen)
- [ ] Implement long-press handler on sprout character for mobile modal trigger (500ms threshold)
- [ ] Implement responsive breakpoints (mobile 320px, tablet 641px, desktop 1025px)
- [ ] Test hero grid stacking on mobile, two-column on tablet+
- [ ] Implement bottom sheet settings panel for mobile
- [ ] Replace floating K hint with "press & hold sprout" hint on touch devices
- [ ] Build settings panel with all 4 API keys
- [ ] Implement test-key endpoints
- [ ] Build photo upload + Mistral Small 4 multimodal analysis
- [ ] Build `app/api/generate-vision/route.ts` calling Nano Banana 2 via OpenRouter
- [ ] Build image gallery infrastructure:
  - `lib/storage/gallery-store.ts` — CRUD for `GalleryImage` records
  - `Gallery.tsx` component — responsive grid (3/2/1 cols)
  - `GalleryItem.tsx` — thumbnail card with download/delete actions
  - `ImageLightbox.tsx` — full-size viewer with compare-with-original toggle
- [ ] Build `lib/storage/context-store.ts` — regenerate `garden-context.json` and `.md` after each session
- [ ] Build Garden Journal view (`journal/GardenJournal.tsx`) showing all session logs chronologically
- [ ] Build Plan History view showing all plan versions with version labels
- [ ] Build Storage Quota indicator in settings panel
- [ ] Build Export/Import ZIP feature (`lib/storage/export.ts` using JSZip)
- [ ] Set up trigger.dev project + weekly nudge job (test only)
- [ ] Implement demo accelerator mode

**Acceptance criteria:**
- Full voice → plan flow in under 10 seconds
- Plan UI matches `mockups/sprout_design_04.html` within ~5% visual deviation
- Photo upload generates visible "future state" image
- All 4 API keys testable from settings
- Layout works on iPhone SE (375px), iPad (820px), and 1440px desktop without horizontal overflow
- Long-press on sprout character (mobile) opens modal listening state
- Native camera capture works on mobile when uploading garden photo

### Week 4 (May 26–June 1) — Polish, demo, submission

**Goal:** Ship it.

**Tasks:**
- [ ] **May 26–28:** Bug bash. Edge cases. Error handling. Code freeze Wednesday.
- [ ] **May 26:** Cross-device QA pass. Test on at least: iPhone (Safari), Android (Chrome), iPad (Safari), MacBook (Chrome + Safari), Windows (Chrome). Document any rendering issues and fix Tuesday.
- [ ] **May 27:** Fix mobile-specific bugs. Verify TTS audio plays on iOS Safari (audio context must be unlocked on first sprout tap). Verify long-press timing feels right on real devices, not just emulators.
- [ ] May 28: Final code commit. Open PR titled "Submission build." Verify Vercel production deploy works. Verify Python agent service is deployed and reachable from production Vercel deploy.
- [ ] **May 29:** Demo video shoot. Real backyard if weather allows; staged kitchen counter if not.
- [ ] **May 30:** Demo video edit. Three minutes max. The "vision reveal" beat at 1:50 must land.
- [ ] **May 31:** Write README. First paragraph must include the Mistral sponsor stack sentence. Include install instructions, env var list, demo video link.
- [ ] **June 1 (early morning):** Submit via the form. Share repo with `@kanungle`. Confirm form succeeded. Take the rest of the day off.

**Acceptance criteria:**
- Submission form completed before 11:59 PM PT June 1
- README includes: stack overview, install steps, env var list, license, demo video link
- Demo video is ≤ 3 minutes
- GitHub repo public and shared with @kanungle

---

## 16. Testing Strategy

### 16.1 Unit tests (Vitest)

- Chunk function produces expected chunks for a sample PDF page
- Constraint extraction prompt produces valid JSON for sample transcripts
- Qdrant query helpers return expected mock results

### 16.2 Integration tests

- Upload-doc endpoint successfully indexes a small test PDF
- Constraint extraction → plan generation pipeline produces a valid plan
- LiveKit token endpoint mints valid tokens

### 16.3 E2E tests (Playwright)

- **Voice flow:** Mock audio → see transcript → see plan
- **Upload flow:** Drop PDF → see file in list → see vector count
- **Settings flow:** Enter keys → click test → see green status

### 16.4 Manual testing checklist (pre-submission)

- [ ] Upload PDF, verify vectors appear in Qdrant dashboard
- [ ] Voice intake works in Chrome, Safari, Firefox (desktop)
- [ ] Plan generation produces meaningfully different plans for different inputs
- [ ] Photo visualization completes in < 20s
- [ ] Hold K from anywhere triggers modal
- [ ] Escape key closes modal
- [ ] All 4 API key tests pass
- [ ] trigger.dev job fires manually (can wait for Sunday)
- [ ] Demo accelerator mode works for video shoot

### 16.5 Cross-device testing matrix

The application must be verified on the following device/browser combinations before submission. Use BrowserStack or real devices (preferred — emulators miss touch behavior nuances).

| Device | Viewport | Browser | Critical paths to verify |
|---|---|---|---|
| iPhone SE (3rd gen) | 375×667 | Safari iOS 17+ | Voice intake, settings bottom sheet, plan stacked layout |
| iPhone 15 Pro | 393×852 | Safari iOS 17+ | Safe area insets (dynamic island), modal listening, camera capture |
| iPhone 15 Pro Max | 430×932 | Chrome iOS 120+ | Same as 15 Pro plus orientation rotation |
| Pixel 8 | 412×915 | Chrome Android 120+ | Voice intake, file upload, push notifications |
| Galaxy S23 | 360×780 | Samsung Internet 23+ | Voice intake, audio playback, photo upload |
| iPad mini (6th gen) | 744×1133 | Safari iPadOS | Tablet two-column layout, long-press behavior |
| iPad Air | 820×1180 | Safari iPadOS | Tablet layout, settings modal centered |
| iPad Pro 11" | 834×1194 | Chrome iPadOS | Desktop-equivalent at 1024px+ |
| MacBook Air 13" | 1440×900 | Chrome 120+ | Full desktop layout, K-hold shortcut |
| MacBook Pro 14" | 1512×982 | Safari 17+ | Full desktop, audio playback |
| Windows desktop | 1920×1080 | Chrome 120+, Firefox 120+ | Full desktop, all features |

**Critical things that ONLY break on real mobile devices (not desktop emulators):**
- iOS Safari requires user gesture before audio plays. Test that Voxtral TTS speaks on first tap.
- Touch event latency on cellular networks affects long-press timing. Test on actual 4G, not Wi-Fi.
- Safe area insets only show their effect on physical devices with notches/dynamic islands.
- iOS Safari's `100vh` shrinks when scrolling — verify `100dvh` is used and doesn't cause jumps.
- Microphone permission UX differs on iOS vs Android — both must produce a graceful error path.

---

## 17. Demo Video Storyboard

Three minutes maximum. Beat sheet:

| Time | Beat |
|---|---|
| 0:00 | Open on a real backyard or patio. Person holding a phone, looking at bare dirt. Voiceover: "I have no idea where to start." |
| 0:08 | Cut to phone screen. Sprout web app, sprout character glowing. Tap "Tap to talk." |
| 0:12 | Voice intake (45 seconds, real time). Live transcript scrolls. Watering animation plays. |
| 0:58 | Speaker stops. Screen pulses. Caption: "Querying 142 chunks across 3 chapters..." Brief vector clustering animation. |
| 1:08 | **Plan materializes.** Twelve week-cards animate into place. Crop list with cherry tomatoes, bush beans, leaf lettuce. "View source" links to PDF pages. |
| 1:30 | Voxtral TTS reads summary out loud: "Your patio garden plan: three containers, four crops, two hours per week. Your first task is preparing soil with compost — see chapter two, page eleven." |
| **1:50** | **THE HERO BEAT.** Soft chime. Vision board card slides in. Side-by-side: bare patio (their photo) ↔ flourishing container garden (Nano Banana 2 output). Same lighting, same fence — now with cherry tomatoes climbing a stake. |
| 2:10 | **"Six days later" title card.** Phone notification fires. Voice nudge plays: "Good morning — week two starts tomorrow. Time to plant your bean seeds." |
| 2:35 | Final card. Stack credits: Qdrant · Mistral · LiveKit · Nano Banana 2 · trigger.dev. Logo. Done. |

The 1:50 vision reveal is the beat that wins. Every other moment is in service of that one.

---

## 18. Submission Checklist

### Code
- [ ] Public GitHub repo
- [ ] Repo shared with `@kanungle` (collaborator access)
- [ ] All code authored during hackathon period (no pre-existing repos repurposed)
- [ ] `.gitignore` excludes `.env*` files
- [ ] `.env.example` documents all required keys

### Cross-device verification
- [ ] Tested on at least one iPhone (real device, not simulator)
- [ ] Tested on at least one Android device (real device or BrowserStack)
- [ ] Tested on at least one iPad
- [ ] All breakpoints render without horizontal overflow at 320px, 768px, 1024px, 1440px
- [ ] All touch targets meet 44×44 CSS pixel minimum
- [ ] iOS Safari audio plays on first sprout tap (audio context unlock works)
- [ ] Long-press on sprout triggers modal on touch devices
- [ ] Native camera capture works for photo upload on iOS and Android

### README must include
- [ ] Project name and one-line pitch
- [ ] Mistral sponsor stack sentence in first paragraph
- [ ] Install steps (`npm install`, `cd agent && pip install -r requirements.txt`)
- [ ] Required env vars list
- [ ] How to run dev environment
- [ ] Architecture overview (link to ARCHITECTURE.md)
- [ ] Demo video link
- [ ] License (MIT or Apache 2.0)
- [ ] Acknowledgments (Mistral, Qdrant, LiveKit, OpenRouter, trigger.dev, Google AI)

### Demo video
- [ ] ≤ 3 minutes total
- [ ] Hosted on YouTube or Vimeo (public/unlisted, accessible without login)
- [ ] Captions or subtitles for accessibility
- [ ] Shows all required features: voice intake, plan generation, source citations, photo vision, scheduled nudge

### Submission form
- [ ] Form completed before June 1, 11:59 PM PT
- [ ] Confirmation email received and saved
- [ ] @kanungle confirmed as repo collaborator

---

## 19. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenRouter rate-limits during demo | Low | High | Pre-warm with several queries before recording. Have backup cached plan ready. |
| Voxtral STT latency higher than expected | Medium | Medium | Test in week 2; if > 1.5s, fall back to Whisper via OpenRouter (still through OpenRouter; loses TTS-as-Mistral but keeps STT alternative) |
| Nano Banana 2 returns wildly off-base images | Medium | Medium | Generate 3 variations per request, pick best programmatically (3× cost = ~$0.12 instead of $0.04, fine for hackathon) |
| LiveKit free tier exhausted mid-demo | Low | High | Monitor usage in week 3; upgrade to paid before video shoot if needed (~$25) |
| Plan quality is mediocre on small PDF | Medium | High | Pre-test with 3 different inputs week 2. If plan feels generic, tighten prompt + use named vectors for better Discovery |
| Demo accelerator breaks production flow | Low | Low | Keep accelerator behind a feature flag; default off |
| trigger.dev integration takes longer than expected | Medium | Low | trigger.dev is "nice to have" for the demo. If short on time, skip and demo manually with a fake notification |
| Browser microphone permission denied | Medium | High | Handle gracefully with clear error message + retry instructions |
| Mobile-specific bug breaks demo on judges' devices | Medium | High | Test on real iPhone + Android in week 3, not just Chrome devtools. Borrow team members' phones if needed. iOS Safari audio context unlock is the most common silent failure. |
| Long-press timing feels wrong on real touch devices | Medium | Medium | 500ms is the standard but verify on iPhone SE and Pixel; tune up or down based on user testing |
| iOS Safari doesn't unlock audio context on first tap | Medium | High | Implement explicit `AudioContext.resume()` on first pointerdown event anywhere on the page. Test on physical iPhone before video shoot. |
| Long-press conflicts with iOS context menu (image save dialog) | Medium | Medium | Use `user-select: none` and `-webkit-touch-callout: none` on sprout character |
| Mobile cellular network makes image gen feel broken | Medium | Low | Show clear progress indicator with "Generating your vision... ~10s" copy so users don't think it crashed |
| Camera/photo upload fails on mobile Safari | Low | Medium | Use `accept="image/*" capture="environment"` and test before video shoot. Fallback to standard file picker if `capture` is unsupported. |
| Late finding bug on May 31 | Medium | High | Build buffer days into week 4. Code freeze Wednesday non-negotiable. |

---

## 20. Appendix

### 20.1 Reference: Mistral sponsor stack sentence (for README)

> "Sprout is built on Mistral's full voice stack — Voxtral Mini Realtime for transcription, Mistral Small for reasoning, and Voxtral Mini TTS for speech synthesis — orchestrated through LiveKit, with retrieval powered by Qdrant Cloud. Three Mistral products sit in the critical path of every gardener interaction. All AI access is unified through OpenRouter as a single gateway."

### 20.2 Reference: System prompt for constraint extraction

```
You are Sprout's constraint extraction module. Given a transcript of a first-time
gardener describing their situation, extract structured constraints in JSON.

OUTPUT SCHEMA:
{
  space_type: "patio" | "balcony" | "back_yard" | "raised_bed" | "container_only",
  available_sqft: number | null,
  sun_hours: number | null,
  time_per_week_hours: number,
  goals: string[],
  climate_zone: string | null,
  dislikes: string[],
  confidence: { space_type: number, sun_hours: number, time_per_week: number, goals: number }
}

RULES:
- Output ONLY valid JSON. No prose.
- If a value is not stated or cannot be inferred with > 50% confidence, use null
- Confidence scores 0-1 reflect how confident you are in each extracted value
- Goals are positive desires ("salad vegetables", "cherry tomatoes")
- Dislikes are negative constraints ("daily watering", "pests", "pruning")

TRANSCRIPT: {transcript}
```

### 20.3 Reference: Qdrant Discovery API call pattern

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

async function discoverPlan(constraints: ConstraintSchema, embedFn: EmbedFn) {
  // Convert constraints to vectors
  const positiveText = `${constraints.space_type} garden with ${constraints.sun_hours} hours sun, ${constraints.goals.join(", ")}`;
  const negativeText = constraints.dislikes.join(", ");

  const [positiveVec, negativeVec] = await Promise.all([
    embedFn(positiveText),
    embedFn(negativeText),
  ]);

  // Discovery API: positive/negative pairs
  const result = await qdrant.discoverPoints("sprout_kb", {
    target: positiveVec,
    context: [
      { positive: positiveVec, negative: negativeVec }
    ],
    filter: {
      must: [
        { key: "difficulty_rating", range: { lte: 3 } } // Beginner-appropriate only
      ]
    },
    limit: 20,
    with_payload: true,
  });

  return result;
}
```

### 20.4 Reference: LiveKit Agent skeleton

```python
# agent/main.py
import os
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import VoicePipelineAgent, llm
from livekit.plugins import openai, silero

load_dotenv()

SYSTEM_PROMPT = """You are Sprout, a voice-first gardening coach for first-time vegetable gardeners.

Your role:
1. Listen carefully to the user describe their garden situation
2. Ask one clarifying question only if a critical detail is missing (sun, space, time)
3. Once you have enough info, signal completion - the system will generate the plan

Be warm but concise. You're a coach, not a chatbot. After the user finishes,
the system handles plan generation. You only handle the conversation."""

async def entrypoint(ctx: agents.JobContext):
    initial_ctx = llm.ChatContext().append(
        role="system",
        text=SYSTEM_PROMPT,
    )

    agent = VoicePipelineAgent(
        vad=silero.VAD.load(),
        stt=openai.STT(
            model=os.getenv("MISTRAL_STT_MODEL"),
            base_url=os.getenv("OPENROUTER_BASE_URL"),
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
        llm=openai.LLM(
            model=os.getenv("MISTRAL_LLM_MODEL"),
            base_url=os.getenv("OPENROUTER_BASE_URL"),
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
        tts=openai.TTS(
            model=os.getenv("MISTRAL_TTS_MODEL"),
            voice=os.getenv("MISTRAL_TTS_VOICE", "neutral_male"),
            base_url=os.getenv("OPENROUTER_BASE_URL"),
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
        chat_ctx=initial_ctx,
    )

    await ctx.connect()
    agent.start(ctx.room)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
```

### 20.5 Reference: Image generation call (Nano Banana 2 via OpenRouter)

```typescript
// lib/openrouter.ts
import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function generateVision(params: {
  photo_data: string; // base64
  plan: PlanSchema;
  engine: "nano_banana" | "gpt_image";
}) {
  const model = params.engine === "nano_banana"
    ? "google/gemini-3.1-flash-image-preview"
    : "openai/gpt-5.4-image-2";

  const prompt = buildVisionPrompt(params.plan); // see prompts/

  const response = await openrouter.chat.completions.create({
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${params.photo_data}` } }
      ]
    }],
    modalities: ["image", "text"],
  });

  // Image arrives as base64 in response message content
  const imageContent = response.choices[0].message.content;
  return extractImageFromResponse(imageContent);
}
```

### 20.6 Reference: Vision generation prompt

```
You are editing an existing photo of a gardener's outdoor space to show what
it could look like in October after they've followed a 12-week vegetable garden plan.

PRESERVE in the edited image:
- The original architecture, fence, walls, doors
- The original surface (concrete, deck, dirt patch)
- The original lighting and time-of-day
- The same camera angle and composition

ADD to the image:
- {crops}: Place in {layout_description}
- Soil/mulch where appropriate
- A small watering can or garden tools (subtle, in corner)
- Vegetation height appropriate to October ({climate_zone})

DO NOT add:
- People or pets
- Decorative items beyond simple plant supports
- Buildings or structures that weren't there
- Fantasy elements or stylized art

OUTPUT a photorealistic image, same dimensions as input.

IMPORTANT: This is an aspirational illustration, not a forecast. Keep it
plausible for a beginner gardener.
```

### 20.7 Reference: Vector Space Day Hackathon Terms (key clauses)

- **Section 5.1.a:** "Qdrant technology" includes Cloud, OSS GitHub, and Edge — any one qualifies
- **Section 5.2:** "No chatbot UIs" — interpreted as no text-input-driven conversational interfaces. Voice + structured artifact output is the spirit of this rule.
- **Section 7.1:** All code must be created during the hackathon. Pre-existing snippets, libraries, and SDKs are fine; pre-existing application repos are not.
- **Section 8.1:** Submission via form sharing GitHub repo with `@kanungle` plus ≤ 3-min demo video.
- **Section 9.2:** Non-exclusive perpetual license to Qdrant for marketing purposes; team retains all ownership.

### 20.8 Reference: Total expected hackathon costs

| Service | Free tier covers? | Expected cost |
|---|---|---|
| OpenRouter | No (pay-per-use) | $5-10 (testing + demo) |
| Qdrant Cloud | Yes (1 GB) | $0 |
| LiveKit Cloud | Yes (limited minutes) | $0-25 if upgraded |
| trigger.dev | Yes (free tier) | $0 |
| Vercel | Yes (hobby) | $0 |
| **Total** | — | **< $30** |

---

**End of PRD**

*This document is the source of truth for the Sprout v1 hackathon build. For implementation questions, refer to the relevant section. For architectural decisions not covered here, default to "what would a Modern (#2 design direction) consumer app do?" and "what preserves the Mistral sponsor angle?"*
