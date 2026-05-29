# Running Sprouty locally

Sprouty has two processes that run side-by-side:

1. **Next.js web app** — the browser UI, API routes, IndexedDB, Qdrant client.
2. **Python LiveKit agent** — the voice worker that handles STT → LLM → TTS in the WebRTC room.

You need both running for the voice flow to work. Open **two terminal windows** and keep them both alive while developing.

---

## One-time setup

### 1. Install Node dependencies

```bash
cd /Users/cory/Documents/Sprout
npm install
```

### 2. Create the Python virtualenv for the agent

macOS ships `python3`, not `python`. Use `python3` to create the venv; once activated, `python` and `pip` point at the venv's binaries.

```bash
cd /Users/cory/Documents/Sprout/agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Fill in environment variables

Two `.env` files — one per process. Copy each example file and replace the placeholder values.

```bash
# Web app
cp /Users/cory/Documents/Sprout/.env.example /Users/cory/Documents/Sprout/.env.local

# Voice agent
cp /Users/cory/Documents/Sprout/agent/.env.example /Users/cory/Documents/Sprout/agent/.env
```

Required keys in `.env.local`:
- `OPENROUTER_API_KEY`
- `QDRANT_URL`, `QDRANT_API_KEY`
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `NEXT_PUBLIC_LIVEKIT_URL` (same wss URL as `LIVEKIT_URL`)

Required keys in `agent/.env`:
- `MISTRAL_API_KEY` (Voxtral STT + TTS)
- `OPENROUTER_API_KEY` (Mistral Small LLM)
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (same values as the web side)
- `QDRANT_URL`, `QDRANT_API_KEY` (for mid-conversation knowledge-base lookups)

---

## Every-time boot — two terminals

### Terminal 1 — Next.js dev server

```bash
cd /Users/cory/Documents/Sprout
npm run dev
```

Opens on [http://localhost:3000](http://localhost:3000). Hot-reloads on file changes.

### Terminal 2 — LiveKit voice agent

```bash
cd /Users/cory/Documents/Sprout/agent
source .venv/bin/activate
python agent.py dev
```

The `dev` subcommand registers a worker with LiveKit Cloud and watches `agent/` for file changes. You should see lines like:

```
INFO  livekit.agents     starting worker
INFO  livekit.agents     registered worker  {"agent_name": "", "id": "AW_...", "region": "US Central"}
```

When the browser opens a voice session, this terminal will log the room join, transcripts, and tool calls.

---

## Verifying it works

1. Open [http://localhost:3000](http://localhost:3000) — home page renders without console errors.
2. Drop into Settings → paste your keys → hit each "Test" button (should turn green).
3. Click **Tap to talk** or hold `K`. The Sprouty character should animate into listening mode and your transcript should stream in.
4. Disconnect. Within ~10s a plan card should render in the right column.

---

## Common pitfalls

- **`zsh: command not found: python`** — you forgot to `source .venv/bin/activate`, or you're using `python` instead of `python3` before the venv exists.
- **`ModuleNotFoundError: No module named 'dotenv'`** — venv isn't activated, or `pip install -r requirements.txt` hasn't run.
- **Agent registers but jobs time out with exit code -30** — known macOS Python 3.14 + livekit-agents spawn issue. The fix is already in `agent.py`: `WorkerOptions(job_executor_type=JobExecutorType.THREAD)`. If you ever rip that out, the subprocess will hang again.
- **Voice connects but no transcripts** — check `MISTRAL_API_KEY` in `agent/.env`. Voxtral STT goes direct to Mistral, not through OpenRouter.
- **"Knowledge base not configured" in logs** — `QDRANT_URL` / `QDRANT_API_KEY` missing from `agent/.env`. The rest of the voice flow still works without it.

---

## Stopping

- `Ctrl+C` in each terminal. The agent terminal will log `shutting down worker`.
- The venv stays activated only for the current shell session — open a new terminal and you'll need to `source .venv/bin/activate` again.
