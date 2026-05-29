---
name: Trigger.dev CLI
description: Run Trigger.dev tasks locally, deploy to cloud/self-hosted, manage projects, profiles, and env vars from the terminal. Use when initializing a Trigger.dev project, running `dev` for local task execution, deploying v3 tasks, or scripting Trigger.dev workflows in CI/CD.
type: cli
triggers:
  - trigger.dev
  - trigger dev
  - trigger.dev dev
  - trigger.dev deploy
  - trigger.dev init
  - trigger.dev login
  - trigger dev cli
  - npx trigger.dev
  - deploy trigger.dev
  - trigger.dev local
---

# Trigger.dev CLI

The Trigger.dev CLI is the primary way to initialize, run, and deploy Trigger.dev v3 tasks. Unlike most CLIs, it's typically **invoked via `npx`** rather than a globally-installed binary — this guarantees you always run the version that matches your installed `@trigger.dev/*` packages.

> **Related skill**: `skills/trigger-dev/SKILL.md` covers the higher-level **Claude Workflow Builder** pattern (how to design, build, and ship automations). This skill covers **CLI commands only**. Use both together.

---

## Quick Platform Context (2026)

- **v3 is the only supported version** — v2 is deprecated. All commands below assume v3.
- **CLI version must match SDK version** — mismatches break `dev` and `deploy`. Use `trigger.dev update` to keep them in lockstep.
- **Fluid-style concurrency** — each task runs in its own Node process, so `dev` can run many tasks in parallel without blocking.
- **Self-hosting supported** — same CLI, point it at your API URL via `--api-url` or `TRIGGER_API_URL`.
- **Config file**: `trigger.config.ts` at the project root is the default. Override with `--config`.

When in doubt, fetch current docs: https://trigger.dev/docs/cli-introduction

---

## Install / Invoke / Verify

Trigger.dev CLI is normally run via `npx` — no global install needed:

```bash
# Always runs the latest CLI (recommended for init)
npx trigger.dev@latest <command>

# pnpm
pnpm dlx trigger.dev@latest <command>

# yarn
yarn dlx trigger.dev@latest <command>
```

**Pin to a specific version** (match your SDK):

```bash
npx trigger.dev@4.4.3 dev
```

**Check version**:

```bash
npx trigger.dev@latest --version
```

> ⚠️ **Don't** install `trigger.dev` as a global npm package. The CLI is intentionally designed to be run ad hoc per-project so the version stays locked to the project's SDK.

---

## Authentication

```bash
npx trigger.dev@latest login             # interactive browser login
npx trigger.dev@latest whoami            # show current user + project
npx trigger.dev@latest logout            # clear local credentials
npx trigger.dev@latest list-profiles     # show all saved CLI profiles
```

**Profiles** — useful for switching between Trigger.dev Cloud and self-hosted instances, or between personal and client accounts:

```bash
# Log in to a named profile
npx trigger.dev@latest login --profile msb-cloud
npx trigger.dev@latest login --profile client-self-hosted --api-url https://trigger.client.com

# Use a profile for any subsequent command
npx trigger.dev@latest dev --profile client-self-hosted
npx trigger.dev@latest deploy --profile msb-cloud
```

**CI/CD auth (non-interactive)**:

```bash
export TRIGGER_ACCESS_TOKEN=tr_xxx       # get from dashboard → Personal Access Tokens
export TRIGGER_API_URL=https://api.trigger.dev    # only needed for self-hosted
npx trigger.dev@latest deploy
```

---

## Most-Used Commands

### `init` — bootstrap a project

```bash
npx trigger.dev@latest init
```

Installs `@trigger.dev/sdk`, creates `trigger.config.ts`, and scaffolds a `src/trigger/` folder with an example task.

| Flag | Purpose |
|------|---------|
| `--project-ref, -p <ref>` | Attach to an existing project (skips the picker) |
| `--tag, -t <version>` | Pin SDK package version (defaults to `latest`) |
| `--javascript` | Scaffold in plain JS (TypeScript is the default — don't use this for MSB work) |
| `--skip-package-install` | Don't run `npm install` — you'll install manually |
| `--override-config` | Overwrite an existing `trigger.config.ts` |
| `--pkg-args <csv>` | Extra args forwarded to your package manager |

**Typical use**:

```bash
cd my-new-project
npx trigger.dev@latest init --project-ref proj_abc123
```

---

### `dev` — run tasks locally

```bash
npx trigger.dev@latest dev
```

Starts the local dev server. Watches `src/trigger/`, recompiles on change, and executes runs against your **dev** environment in the dashboard. Each task runs in its own Node process.

| Flag | Purpose | Default |
|------|---------|---------|
| `--config, -c <file>` | Use a different config file | `trigger.config.ts` |
| `--project-ref, -p <ref>` | Required if no config file exists | — |
| `--env-file <path>` | Load env vars into the CLI process | — |
| `--analyze` | Show detailed build/import timings — use when `dev` is slow to start | — |
| `--skip-update-check` | Skip the "new CLI version available" check | — |
| `--log-level, -l <level>` | `debug` \| `info` \| `log` \| `warn` \| `error` \| `none` | `log` |

**Common invocations**:

```bash
# Standard local run
npx trigger.dev@latest dev

# Debugging startup perf
npx trigger.dev@latest dev --analyze --log-level debug

# Multiple envs in one repo
npx trigger.dev@latest dev --config trigger.staging.config.ts --env-file .env.staging
```

> **Gotcha**: `dev` runs against the **dev** environment in your Trigger.dev dashboard — not prod. Runs in dev do not trigger prod schedules or webhooks.

---

### `deploy` — ship to cloud or self-hosted

```bash
npx trigger.dev@latest deploy
```

Compiles, bundles, uploads, and registers your tasks as a new version in the target environment. By default, deploys to **prod** and promotes the new version to current.

| Flag | Purpose | Default |
|------|---------|---------|
| `--env, -e <env>` | Target: `prod` \| `staging` \| `preview` | `prod` |
| `--branch, -b <name>` | Preview branch name (auto-detected from git) | — |
| `--config, -c <file>` | Use a different config file | `trigger.config.ts` |
| `--project-ref, -p <ref>` | Required if no config file exists | — |
| `--env-file <path>` | Load env vars into the CLI process | — |
| `--dry-run` | Build without deploying; prints the build path | — |
| `--skip-promotion` | Deploy the version but don't make it current | — |
| `--skip-sync-env-vars` | Don't sync local env vars to the dashboard | — |
| `--local-build` | Force Docker builds on your machine (auto for self-hosted) | — |

**Common invocations**:

```bash
# Deploy to prod (standard)
npx trigger.dev@latest deploy

# Deploy to staging
npx trigger.dev@latest deploy --env staging

# Preview branch deploy (auto-detected from current git branch)
npx trigger.dev@latest deploy --env preview

# Dry run to inspect build without shipping
npx trigger.dev@latest deploy --dry-run

# Deploy but don't promote — validates and lets you promote via dashboard
npx trigger.dev@latest deploy --skip-promotion

# Self-hosted deploy
TRIGGER_API_URL=https://trigger.client.com \
  npx trigger.dev@latest deploy --local-build
```

> **Gotcha**: `deploy` requires the CLI version to match `@trigger.dev/sdk` in your project. Run `npx trigger.dev@latest update` first if you hit a version mismatch error.

---

### `update` — sync CLI + SDK versions

```bash
npx trigger.dev@latest update
```

Updates all `@trigger.dev/*` packages in the project to match the CLI version you just ran. This is how you keep the CLI and SDK in lockstep — always run it after bumping the CLI.

**Flags**: standard common options only (`--log-level`, `--skip-telemetry`, `--help`, `--version`).

---

## Common Options (all commands)

| Flag | Purpose |
|------|---------|
| `--profile <name>` | Use a specific login profile (default: `default`) |
| `--api-url, -a <url>` | Override the API URL (self-hosted instances) |
| `--log-level, -l <level>` | `debug` \| `info` \| `log` \| `warn` \| `error` \| `none` |
| `--skip-telemetry` | Disable telemetry (also: `TRIGGER_TELEMETRY_DISABLED=1`) |
| `--help, -h` | Command help |
| `--version, -v` | CLI version |

---

## Environment Variables

| Var | Purpose |
|-----|---------|
| `TRIGGER_ACCESS_TOKEN` | Personal Access Token for CI/CD (replaces `login`) |
| `TRIGGER_API_URL` | Self-hosted API URL |
| `TRIGGER_TELEMETRY_DISABLED` | Set to `1` to disable telemetry |

---

## Common Workflows

### 1. Bootstrap a new automation project

```bash
mkdir my-automation && cd my-automation
npm init -y
npx trigger.dev@latest login
npx trigger.dev@latest init
npx trigger.dev@latest dev
```

### 2. Daily dev loop

```bash
# Terminal 1 — local dev server
npx trigger.dev@latest dev

# Edit src/trigger/*.ts — auto-recompiles on save
# Trigger test runs from the dashboard or via SDK
```

### 3. Deploy to production (interactive)

```bash
npx trigger.dev@latest whoami              # confirm correct account/project
npx trigger.dev@latest deploy --dry-run    # sanity check
npx trigger.dev@latest deploy              # ship to prod
```

### 4. CI/CD deploy (GitHub Actions)

```yaml
- name: Deploy to Trigger.dev
  env:
    TRIGGER_ACCESS_TOKEN: ${{ secrets.TRIGGER_ACCESS_TOKEN }}
  run: npx trigger.dev@latest deploy
```

### 5. Staging + prod split

```bash
# Deploy to staging for QA
npx trigger.dev@latest deploy --env staging

# After QA passes, deploy to prod
npx trigger.dev@latest deploy --env prod
```

### 6. Multi-client with profiles (MSB pattern)

```bash
# One-time setup per client
npx trigger.dev@latest login --profile client-acme

# Deploy for that client
npx trigger.dev@latest deploy --profile client-acme
```

### 7. Version mismatch recovery

```bash
# Symptom: "CLI version does not match SDK" error during dev or deploy
npx trigger.dev@latest update    # syncs @trigger.dev/* packages to CLI version
npx trigger.dev@latest dev       # retry
```

---

## Gotchas

| Gotcha | Fix |
|--------|-----|
| CLI and SDK versions drift → `dev`/`deploy` fails | Run `npx trigger.dev@latest update` after every CLI bump |
| `dev` runs against dev env, not prod | Expected. Use `deploy` to ship; dev schedules/webhooks don't fire in dev env |
| `deploy` fails with "project not found" | Missing `trigger.config.ts` or wrong `--project-ref`. Check with `whoami` |
| Env vars not in prod after deploy | `--skip-sync-env-vars` was set, or env vars weren't in `.env` at deploy time. Add them in the dashboard manually |
| `init` overwrites existing config | Must pass `--override-config` explicitly — without it, init aborts |
| Self-hosted deploys slow | Docker builds happen locally. Make sure Docker Desktop is running and has enough RAM |
| Preview branch deploy detects wrong branch | Pass `--branch <name>` explicitly in detached HEAD / CI environments |
| `npx` downloads CLI on every run | That's by design — guarantees version match. Use `pnpm dlx` for faster cold starts if it bothers you |

---

## Global installs (if you really must)

If you want a shorter command than `npx trigger.dev@latest`, you can install globally — but **pin the version** to avoid SDK drift:

```bash
npm i -g trigger.dev@4.4.3
trigger.dev dev
trigger.dev deploy
```

⚠️ You are now responsible for keeping the global CLI and project SDKs in sync. For MSB work, prefer `npx`.

---

## Docs

- CLI overview: https://trigger.dev/docs/cli-introduction
- `dev`: https://trigger.dev/docs/cli-dev
- `deploy`: https://trigger.dev/docs/cli-deploy
- `init`: https://trigger.dev/docs/cli-init-commands
- `update`: https://trigger.dev/docs/cli-update-commands
- Self-hosting: https://trigger.dev/docs/self-hosting/overview
