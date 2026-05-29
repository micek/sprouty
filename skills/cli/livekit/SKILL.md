---
name: LiveKit CLI
description: Manage LiveKit Cloud projects, rooms, tokens, agents, egress, and load tests from the terminal. Use when authenticating with LiveKit Cloud, generating dev tokens, joining rooms for debugging, scaffolding agent/frontend templates, deploying Python LiveKit Agents, running load tests, or browsing LiveKit docs/SDK source from the CLI.
type: cli
triggers:
  - lk
  - livekit
  - lk cloud auth
  - lk project
  - lk app create
  - lk token create
  - lk room join
  - lk egress
  - lk load-test
  - lk agent
  - lk agent deploy
  - lk agent create
  - lk docs
  - livekit cli
  - deploy livekit agent
---

# LiveKit CLI

The LiveKit CLI (`lk`) is the primary terminal tool for working with LiveKit Cloud and self-hosted servers — auth, project switching, app scaffolding, token generation, room debugging, agent deploy/manage, egress, load testing, and docs search. This skill captures the commands Cory will hit while building Sprout (voice agent + LiveKit Cloud) plus the gotchas that bite first-time users.

> **Source of truth:** the GitHub README at https://github.com/livekit/livekit-cli is more current than the website. When in doubt, `curl` it or run `lk <cmd> --help`.

---

## Quick Platform Context (2026)

- **Binary name is `lk`** (not `livekit-cli`). The old `livekit-cli` and `livekit-load-tester` binaries have been folded into `lk` as subcommands.
- **`lk` major + minor version must match `server-sdk-go`.** Mismatched minors break agent deploys against newer LiveKit servers — keep `lk` updated.
- **Default project + cloud auth flow** — `lk cloud auth` opens a browser, links a Cloud project, and stores credentials in `~/.livekit/cli-config.yaml`. After that you can omit `--url` / `--api-key` / `--api-secret` on every command.
- **Built-in MCP-powered docs search** — `lk docs` queries the LiveKit docs MCP server directly. Faster and more current than web search for SDK questions.
- **Agent deploys are first-class** — `lk agent create/deploy/update-secrets/secrets/logs` ship Python or Node agents to LiveKit Cloud's managed runner. Sprout's Python LiveKit agent uses this path.

---

## Install / Update / Verify

```bash
# macOS (preferred for Cory's local dev)
brew install livekit-cli
brew upgrade livekit-cli      # update later

# Linux
curl -sSL https://get.livekit.io/cli | bash

# Windows
winget install LiveKit.LiveKitCLI

# From source (requires git-lfs for embedded video samples)
git clone https://github.com/livekit/livekit-cli && cd livekit-cli
make install

# Verify
lk --version
lk --help                     # top-level subcommand list
lk <subcommand> --help        # works on every subcommand
```

> ⚠️ If `lk` returns "command not found" after `brew install`, run `brew doctor` — Homebrew sometimes installs to a path not on `$PATH` for fresh shells.

---

## Authentication & Project Management

### Cloud auth (recommended path)

```bash
# Browser-based OAuth flow → links a LiveKit Cloud project
lk cloud auth
```

When the browser returns, the CLI offers to set the linked project as the **default**. Accept it once and every subsequent command can omit `--url` / `--api-key` / `--api-secret`.

### Add / list / switch projects manually

```bash
# Add a project by API key/secret (no browser needed — useful for CI)
lk project add --api-key <key> --api-secret <secret> <project_name>

# List all configured projects
lk project list

# Set the default project
lk project set-default <project_name>

# Run one command against a non-default project
lk <subcommand> --project <project_name> ...
```

Project credentials live in `~/.livekit/cli-config.yaml`. Don't commit that file.

### Environment variables (CI/CD path)

```bash
export LIVEKIT_URL=wss://xxxxx.livekit.cloud
export LIVEKIT_API_KEY=API...
export LIVEKIT_API_SECRET=...
```

These override config-file defaults but are themselves overridden by explicit CLI flags (see [Parameter precedence](#parameter-precedence) below).

---

## Bootstrap an App from a Template

LiveKit ships a template index of starter apps for agents, frontends, and token servers. `lk app create` clones the template and pre-fills your project credentials so the app can connect on first run.

```bash
# List available templates
lk app list-templates

# Create a project from a template
lk app create --template <template_name> my-app
```

**Templates likely useful for Sprout:**

- `agent-starter-python` — the canonical Python LiveKit Agent template. **This is the one to use for the Sprout voice agent service.**
- `agent-starter-node` — TypeScript agent starter (skip — Sprout uses Python for the Mistral plugin path).
- `agent-starter-react` — React frontend that connects to a deployed agent. Sprout's UI is bespoke Next.js, so this is reference only.
- Token server templates — Sprout mints tokens from a Next.js API route, so skip these.

> Template index: https://github.com/livekit-examples/index

---

## Token Creation (development & debugging)

```bash
# Most common: a join token for a test room
lk token create --join \
  --room test-room \
  --identity test-user \
  --open meet                    # opens https://meet.livekit.io with token preloaded

# Token without auto-opening Meet (paste it yourself)
lk token create --join --room test-room --identity test-user

# Custom permissions
lk token create --join \
  --room test-room \
  --identity test-user \
  --can-publish=true \
  --can-subscribe=true \
  --can-publish-data=true

# Token with extra claim metadata
lk token create --join --room test-room --identity test-user \
  --metadata '{"role":"moderator"}'
```

> 💡 In production, mint tokens from your backend (Sprout uses `livekit-server-sdk` in a Next.js API route). Use the CLI for **dev** and **debugging** only.

### Template strings (for unique identities/rooms in scripts)

| Token | Expands to |
|---|---|
| `%t` | Compact timestamp `20260504193200` |
| `%T` | ISO 8601 timestamp |
| `%Y` `%m` `%d` `%H` `%M` `%S` | Year / month / day / hour / minute / second |
| `%x` | Random 6-char hex |
| `%U` | Current OS user |
| `%h` | Current hostname |
| `%p` | Current PID |

```bash
lk token create --join --identity "%U@%h" --room "sprout-test-%x"
# → identity "cory@MacBook.local", room "sprout-test-a1b2c3"
```

---

## Room Operations (`lk room`)

Useful for **debugging the voice flow** — join a Sprout room as a fake publisher, verify the agent actually subscribes, watch transcript events stream in.

### Join a room (CLI as a participant)

```bash
# Join with a custom identity and attributes
lk room join --identity publisher \
  --attribute key1=value1 \
  --attribute key2=value2 \
  <room_name>

# Attributes from a JSON file
lk room join --identity publisher \
  --attribute-file attributes.json \
  <room_name>
```

### Publish the demo video track (smoke-test publishing path)

```bash
lk room join --identity publisher --publish-demo <room_name>
# Publishes a built-in 720p/360p/180p simulcast video sample.
```

### Publish a media file

```bash
lk room join --identity publisher \
  --publish path/to/video.ivf \
  --publish path/to/audio.ogg \
  --fps 23.98 \
  <room_name>
```

> Codecs supported: VP8, H.264, H.265, Opus. Match `--fps` to the source to avoid A/V drift.

### Publish from FFmpeg (live RTSP, screen share, files re-encoded on the fly)

Run FFmpeg on one side, encoding to Unix sockets:

```bash
ffmpeg -i <video-file | rtsp://url> \
  -c:v libx264 -bsf:v h264_mp4toannexb -b:v 2M -profile:v baseline -pix_fmt yuv420p \
    -x264-params keyint=120 -max_delay 0 -bf 0 \
    -listen 1 -f h264 unix:/tmp/myvideo.sock \
  -c:a libopus -page_duration 20000 -vn \
    -listen 1 -f opus unix:/tmp/myaudio.sock
```

Then publish the sockets:

```bash
lk room join --identity bot \
  --publish h264:///tmp/myvideo.sock \
  --publish opus:///tmp/myaudio.sock \
  <room_name>
```

### Publish from TCP (gstreamer pipeline)

```bash
lk room join --identity bot \
  --publish h264://127.0.0.1:16400 \
  <room_name>
```

### Simulcast over multiple TCP ports

```bash
lk room join --identity bot \
  --publish h264://127.0.0.1:5005/1920x1080 \
  --publish h264://127.0.0.1:5006/1280x720 \
  --publish h264://127.0.0.1:5007/640x480 \
  <room>
```

> Tracks auto-bin to HIGH/MED/LOW based on width order. All layers must use the same codec.

### Other `lk room` subcommands worth knowing

```bash
lk room list                       # list active rooms
lk room create <name>              # pre-create a room (most apps create on join)
lk room delete <name>              # disconnect everyone, delete room
lk room list-participants <name>
lk room remove-participant <name> --identity <id>
```

---

## Egress (Recording & Streaming)

Recording requires the egress service to be deployed (LiveKit Cloud has it built in). Example `request.json` files: https://github.com/livekit/livekit-cli/tree/main/cmd/lk/examples

```bash
# Record the room as a composited video (UI included)
lk egress start --type room-composite path/to/request.json

# Record audio + video as a composite of specific tracks
lk egress start --type track-composite path/to/request.json

# Record a single track (raw)
lk egress start --type track path/to/request.json
```

### Test an egress template (UI development)

```bash
lk egress test-template \
  --base-url http://localhost:3000 \
  --room test-room \
  --layout speaker \
  --video-publishers 3
```

Spins up virtual publishers, opens your local template URL with the right query params, and you can iterate on the recording UI without a real session.

### Egress lifecycle

```bash
lk egress list                     # list active and recent egresses
lk egress stop <egress-id>
```

---

## Agent Operations (`lk agent`) — Sprout's voice agent path

LiveKit Cloud runs a managed agent runner. `lk agent` ships your local Python (or Node) agent code to that runner, manages secrets, restarts, rolls back, and tails logs.

### Initial deploy

```bash
# From the agent project root (must contain Dockerfile or supported framework files)
lk agent create

# Or with an explicit path
lk agent create /path/to/agent
```

`lk agent create` runs the cloud build (using your Dockerfile if present), assigns the agent a name, and sets initial secrets if you pass `--secrets-file`.

### Subsequent deploys (push new code)

```bash
# Re-deploy the current directory
lk agent deploy

# Re-deploy from a path
lk agent deploy /path/to/agent
```

### Secrets management

Secrets become env vars inside the running agent — this is where Sprout will set `OPENROUTER_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, the Mistral model IDs, etc.

```bash
# List secrets (names only — values are write-only after creation)
lk agent secrets

# Update individual secrets (triggers rolling restart)
lk agent update-secrets \
  --secrets "OPENROUTER_API_KEY=sk-or-v1-..." \
  --secrets "QDRANT_URL=https://xxx.cloud.qdrant.io"

# Update from a .env-style file
lk agent update-secrets --secrets-file path/to/secrets.env

# Replace ALL secrets (delete-then-set, not merge)
lk agent update-secrets --secrets-file path/to/secrets.env --overwrite

# Mount a file as a secret (e.g., service-account JSON)
lk agent update-secrets --secret-mount ./google-application-credentials.json
```

> 🔒 Don't pass keys via `--secrets "KEY=val"` from your shell history — pipe a file or use `--secrets-file`. Sprout's `agent/.env` is gitignored; treat it the same way for `lk agent update-secrets --secrets-file agent/.env`.

### Inspect & operate

```bash
lk agent status              # show running agent + version
lk agent logs                # stream logs from the deployed agent
lk agent logs --follow       # tail
lk agent rollback            # revert to previous version
lk agent restart             # rolling restart with current code/secrets
```

> Agent commands inherit project context from `lk project set-default` or `--project`. Every command takes `--help` for the full flag list — check it before scripting.

---

## Load Testing (`lk load-test`)

Spins up virtual publishers and subscribers to stress-test your LiveKit instance. The old `livekit-load-tester` binary is now `lk load-test`.

### Common scenarios

```bash
# 8 video publishers, no subscribers
lk load-test --room test-room --video-publishers 8

# 5 audio-only publishers (simulates concurrent speakers)
lk load-test --room test-room --audio-publishers 5

# 5 publishers + 500 subscribers, run for 1 minute
lk load-test \
  --duration 1m \
  --video-publishers 5 \
  --subscribers 500
```

### Useful flags

| Flag | Purpose |
|---|---|
| `--video-publishers N` | Number of publishing video clients |
| `--audio-publishers N` | Number of publishing audio clients |
| `--subscribers N` | Number of subscribing-only clients |
| `--video-resolution low\|medium\|high` | Publishing resolution |
| `--no-simulcast` | Disable simulcast (force single layer) |
| `--num-per-second N` | Ramp rate |
| `--layout speaker\|3x3\|4x4\|5x5` | Subscriber layout to simulate |
| `--simulate-speakers` | Rotate active speakers |
| `--duration 5m` | Test duration |

### Tune system limits before high-N runs

```bash
ulimit -n 65535
sysctl -w fs.file-max=2097152
sysctl -w net.core.somaxconn=65535
sysctl -w net.core.rmem_max=25165824
sysctl -w net.core.wmem_max=25165824
```

> 💡 Run from a cloud VM, not your laptop — residential bandwidth caps will distort the results well before LiveKit does.

### Agent load testing

Stress-test a deployed agent (started with `start`, not `dev`, and a configured `agent_name`).

```bash
lk perf agent-load-test \
  --rooms 5 \
  --agent-name test-agent \
  --echo-speech-delay 10s \
  --duration 5m \
  --attribute key1=value1
```

Each simulated room dispatches the agent + an "echo" participant that plays the agent's audio back after the delay. Stats print at the end.

---

## Documentation & Code Search (`lk docs`)

`lk docs` is an MCP-backed search over LiveKit's docs site and SDK repos. Often faster + more accurate than web search for "what's the right import path for plugin X" type questions.

```bash
# Site overview
lk docs overview

# Free-text search
lk docs search "voice agents"

# Fetch a page as markdown
lk docs get-page /agents/start/voice-ai-quickstart

# Search code across LiveKit GitHub repos
lk docs code-search "class AgentSession" --repo livekit/agents

# SDK changelog
lk docs changelog pypi:livekit-agents

# List all SDKs
lk docs list-sdks

# Submit doc feedback
lk docs submit-feedback --page /agents/build/tools "missing error handling examples"
```

### Hidden flags (for staging docs deploys)

```bash
lk docs --server-url https://docs-staging.example.com/mcp/ search "agents"
lk docs --server-url https://docs-abc123.vercel.app/mcp/ \
        --vercel-header <vercel-protection-bypass-token> overview
```

---

## Parameter precedence

Highest to lowest:

1. Command line flag (`--api-key`, `--room`, `--project`)
2. Environment variable (`LIVEKIT_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_SECRET`)
3. Local config file (default `./livekit.toml`, override with `--config`)
4. Default project (set with `lk project set-default`)

`--project <name>` overrides the default for one command without disturbing the saved default.

---

## Common Workflows for Sprout

### 1. First-time CLI setup on this laptop

```bash
brew install livekit-cli
lk cloud auth                                 # browser flow → pick the Sprout project, set as default
lk project list                               # verify
```

### 2. Generate a dev token for local browser testing

```bash
lk token create --join \
  --room "sprout-dev-%x" \
  --identity "cory@%h" \
  --open meet
```

### 3. Verify the Python agent connects (end-to-end smoke test)

```bash
# Terminal 1 — run the local agent
cd agent && python agent.py dev

# Terminal 2 — join the same room as a CLI publisher
lk room join --identity smoke-test --publish-demo sprout-dev-room
```

If the agent's logs show "subscribed to track from smoke-test", the LiveKit ↔ agent wiring is good.

### 4. Deploy the Python agent to LiveKit Cloud

```bash
cd agent
lk agent create                               # first time
lk agent update-secrets --secrets-file .env   # ship the OpenRouter / Qdrant / Mistral keys
lk agent status
lk agent logs --follow                        # watch it boot
```

### 5. Push a code change to the deployed agent

```bash
cd agent
lk agent deploy
lk agent logs --follow                        # confirm clean startup
# If something is wrong:
lk agent rollback
```

### 6. Quick Sprout voice-flow load test (post-MVP)

```bash
lk perf agent-load-test \
  --rooms 3 \
  --agent-name sprout-coach \
  --echo-speech-delay 8s \
  --duration 3m
```

### 7. Pull a doc page straight into Cursor / VSCode

```bash
lk docs get-page /agents/build/tools | pbcopy
```

---

## Gotchas & Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `lk` says "no project configured" | Skipped `lk cloud auth` or didn't set default | Re-run `lk cloud auth` or `lk project set-default <name>` |
| Agent deploy fails with "minor version mismatch" | `lk` older than the LiveKit server | `brew upgrade livekit-cli` |
| Secrets seem to "disappear" after `lk agent update-secrets --overwrite` | `--overwrite` replaces ALL secrets, not merges | Always pass the **complete** secrets file when using `--overwrite`, or skip the flag for incremental updates |
| `lk room join --publish-demo` shows nothing in browser | Browser hasn't subscribed / wrong room | Open `https://meet.livekit.io` and paste the same token to verify subscription works |
| FFmpeg → Unix socket → `lk` shows initial black frames | Pre-encoded GOP boundaries / first I-frame delay | Expected; lower `keyint` in the FFmpeg invocation |
| Token works locally, fails in deployed app | Mixed up `LIVEKIT_URL` (wss://) with REST URL | LiveKit URLs are always `wss://...livekit.cloud` |
| Agent build is huge / slow | Big `node_modules` or venv getting uploaded | Add a `.dockerignore` excluding `.venv/`, `node_modules/`, `__pycache__/`, etc. |
| `lk docs search` returns stale answers | Local cache | Pass `--server-url` to force a different MCP endpoint, or just re-run |

---

## When NOT to use the CLI

- **Production token minting** — do that from your Next.js API route via `livekit-server-sdk`. CLI tokens are for dev/debug.
- **End-user-facing recording UIs** — `lk egress start` is for ops/automation; users hit the egress REST/WS API via the SDK.
- **Long-running agent dev loops** — use `python agent.py dev` (auto-reload) locally; only `lk agent deploy` once you're ready to ship.

---

## Official Docs & Source

- Main docs: https://docs.livekit.io/intro/basics/cli/
- GitHub source: https://github.com/livekit/livekit-cli
- Templates index: https://github.com/livekit-examples/index
- Docs MCP server: https://docs.livekit.io/mcp
- Agent ops: https://docs.livekit.io/agents/ops/

**`lk <subcommand> --help` is always more current than this skill.** When something doesn't match, trust the binary.
