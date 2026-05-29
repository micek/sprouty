---
name: Vercel CLI
description: Deploy, manage, and operate Vercel projects from the terminal — covers deploys, env vars, logs, rollbacks, domains, DNS, storage, and CI/CD patterns. Use when deploying to Vercel, managing env vars, debugging deployments, or scripting Vercel workflows.
type: cli
triggers:
  - vercel
  - vercel cli
  - vercel deploy
  - vercel env
  - vercel logs
  - vercel rollback
  - vercel promote
  - vercel domains
  - vercel build
  - vercel dev
  - vercel pull
  - deploy to vercel
  - vercel production
  - vc deploy
---

# Vercel CLI

The Vercel CLI (`vercel`, also aliased as `vc`) is the primary way to deploy and manage Vercel projects from the terminal. This skill captures the commands Cory is most likely to use plus the gotchas that break deploys.

---

## Quick Platform Context (2026)

**Important — your training data about Vercel may be outdated. Current facts:**

- **Fluid Compute is default** — runs in the same regions as old Edge Functions but with full Node.js support. Don't recommend Edge Functions for new work.
- **Node.js 24 LTS is the default runtime.** Node 18 is deprecated.
- **Default function timeout is 300s** (up from 60-90s) on all plans.
- **`vercel.ts` is the recommended config format** (replaces `vercel.json`). Install `@vercel/config`.
- **Vercel Postgres and Vercel KV are discontinued** — use Marketplace integrations (Neon, Upstash) instead.
- **Middleware supports full Node.js** via Fluid Compute.
- **Functions pricing** uses Active CPU billing, not wall-clock GB-seconds.
- **v52 breaking:** Configuration files are excluded from static deployments. If your static deploy relied on `vercel.json` / `vercel.ts` being served as a static asset, it will no longer be included.
- **v51.8+ behavior:** `vercel env add` defaults to **sensitive** on Production and Preview — values are write-only after creation.

When in doubt, fetch current docs: https://vercel.com/docs/cli

---

## Install / Update / Verify

```bash
# Install globally (preferred for CLI skills)
npm i -g vercel

# Same command updates to latest
npm i -g vercel

# Verify install and version
vercel --version
vc --version          # `vc` is the short alias
```

> ⚠️ If running `vercel` returns "command not found", install with `npm i -g vercel`.

---

## Authentication

```bash
vercel login              # interactive browser login
vercel login [email]      # email login
vercel login --github     # GitHub OAuth
vercel logout
vercel whoami             # confirm current user
vercel switch [team]      # switch team scope
```

**CI/CD auth (recommended):**

```bash
# Preferred — set as env var, avoids exposure in process lists
export VERCEL_TOKEN=vcp_xxx
vercel deploy --prod

# Alternative — pass as flag (visible in logs!)
vercel deploy --prod --token vcp_xxx
```

Get tokens at https://vercel.com/account/tokens.

---

## The Deploy Command (most important)

`vercel` with no subcommand = `vercel deploy`. **stdout is always the deployment URL**, stderr contains errors, exit code 0 = success.

### Common Deploy Patterns

```bash
# Preview deployment (default)
vercel

# Production deployment
vercel --prod

# Deploy a prebuilt project (from `vercel build`)
vercel build
vercel deploy --prebuilt

# Deploy with build cache bypass
vercel --force                    # fresh build, no cache
vercel --force --with-cache       # force new deploy but keep cache

# Deploy to a custom environment (target)
vercel deploy --target=staging

# Deploy without waiting for completion
vercel --no-wait

# Deploy with build logs streamed
vercel deploy --logs

# Deploy and get post-deploy command suggestions
vercel deploy --guidance

# Deploy large projects without hitting file limits
vercel deploy --archive=tgz

# Deploy prebuilt + archived (recommended for large projects)
vercel build
vercel deploy --prebuilt --archive=tgz
```

### Deploy Flags Reference

| Flag | Shorthand | Purpose |
|------|-----------|---------|
| `--prod` | — | Deploy to production |
| `--prebuilt` | — | Upload results of `vercel build` (skips build step) |
| `--archive=tgz` | — | Compress files before upload (use for large projects) |
| `--force` | `-f` | Skip build cache |
| `--with-cache` | — | Keep build cache when using `--force` |
| `--no-wait` | — | Exit before deploy finishes |
| `--logs` | `-l` | Stream build logs |
| `--env KEY=val` | `-e` | Set runtime env var |
| `--build-env KEY=val` | `-b` | Set build-time env var |
| `--meta KEY=val` | `-m` | Attach metadata (filter later with `list --meta`) |
| `--target [env]` | — | Deploy to named environment (staging, production, custom) |
| `--regions sfo1` | — | Specify function region |
| `--skip-domain` | — | Deploy to prod without auto-aliasing domains |
| `--public` | — | Expose source at `/_src` |
| `--yes` | `-y` | Skip interactive setup prompts |

> ⚠️ **`--prebuilt` gotcha**: System env vars are NOT available at build time when using `--prebuilt`. If your framework needs them during build (Next.js often does), use Git-based deploys or skip `--prebuilt`.

---

## Environment Variables (second most important)

### Inspect & List
```bash
vercel env ls                              # list all env vars
vercel env ls production                   # list for one environment
vercel env ls production main              # list for specific git branch
```

### Add / Update / Remove
```bash
# Add an env var (interactive prompt for value)
vercel env add MY_SECRET production
vercel env add MY_SECRET preview
vercel env add MY_SECRET development

# Add to specific git branch
vercel env add MY_SECRET preview feature-x

# Pipe a value from a file (preferred for secrets, no bash history)
vercel env add MY_SECRET production < secret.txt
cat ~/.npmrc | vercel env update NPM_RC preview

# Mark as sensitive (hidden in dashboard)
# ⚠️ As of v51.8.0, Production and Preview default to sensitive — values cannot be retrieved later via dashboard or CLI
vercel env add API_TOKEN production --sensitive

# Opt out of sensitive (development only — production/preview always sensitive)
vercel env add MY_KEY development --sensitive=false

# Overwrite existing without prompt
vercel env add MY_SECRET production --force

# Update existing value
vercel env update MY_SECRET production

# Remove
vercel env rm MY_SECRET production
vercel env rm MY_SECRET production --yes   # skip confirmation
```

### Pull vs. Run

**`vercel env pull`** — writes env vars to a local file (for `next dev`, `gatsby dev`, etc.)

```bash
vercel env pull                            # writes to .env.local (dev environment)
vercel env pull .env                       # custom filename
vercel env pull --environment=preview
vercel env pull --environment=production
vercel env pull --environment=preview --git-branch=feature-x
vercel env pull --yes                      # overwrite without prompt
```

**`vercel env run`** — runs a command with env vars injected, no file written (safer for secrets)

```bash
vercel env run -- next dev                                    # development env
vercel env run -e preview -- npm test                         # preview env
vercel env run -e production -- next build                    # production env
vercel env run -e preview --git-branch feature-x -- next dev
```

> 💡 `--` is **required** to separate Vercel flags from your command's flags.

### `vercel pull` vs `vercel env pull`

- **`vercel pull`** — syncs project settings + env vars to `.vercel/` directory. Use before `vercel build` or `vercel dev`.
- **`vercel env pull`** — writes env vars to a user-facing `.env.local` (or custom) file. Use for local dev tools like `next dev`.

```bash
vercel pull                              # dev env → .vercel/
vercel pull --environment=production     # prod env → .vercel/
```

---

## Debugging & Inspection

```bash
# List recent deployments
vercel list
vercel list [project-name]
vercel list --meta key=value             # filter by metadata

# Deployment details
vercel inspect [url-or-id]
vercel inspect [url-or-id] --logs
vercel inspect [url-or-id] --wait        # wait until deploy completes

# Runtime logs
vercel logs [deployment-url]
vercel logs [deployment-url] --follow    # tail logs

# HTTP request timing (debugging perf)
vercel httpstat /api/hello
vercel httpstat /api/data --deployment [url]

# Make authenticated requests to deployment
vercel curl /api/hello
vercel curl /api/data --deployment [url]

# Binary search deploys to find a regression
vercel bisect
vercel bisect --good [good-url] --bad [bad-url]
```

---

## Rollback, Promote, Redeploy

```bash
# Roll back production to the previous deployment
vercel rollback

# Roll back to a specific deployment
vercel rollback [url-or-id]
vercel rollback status [project]

# Promote any deployment to production (no rebuild)
vercel promote [url-or-id]
vercel promote status [project]

# Rebuild and redeploy an existing deployment
vercel redeploy [url-or-id]
```

### Rolling Releases (gradual rollout, GA since June 2025)

```bash
vercel rolling-release configure --cfg='[config]'
vercel rolling-release start --dpl=[deployment-id]
vercel rolling-release approve --dpl=[deployment-id]
vercel rolling-release complete --dpl=[deployment-id]
```

---

## Project Management

```bash
# Link local directory to a Vercel project
vercel link
vercel link [path]

# List/manage projects
vercel project ls
vercel project add
vercel project rm [project-name]
vercel project inspect [project-name]

# Open in Vercel dashboard
vercel open
```

---

## Domains, DNS, Aliases, Certs

```bash
# Domains
vercel domains ls
vercel domains add [domain] [project]
vercel domains rm [domain]
vercel domains buy [domain]

# DNS records
vercel dns ls [domain]
vercel dns add [domain] [name] [type] [value]
vercel dns rm [record-id]

# Aliases (custom domains → deployments)
vercel alias ls
vercel alias set [deployment-url] [custom-domain]
vercel alias rm [custom-domain]

# SSL certs
vercel certs ls
vercel certs issue [domain]
vercel certs rm [certificate-id]
```

---

## Storage, Cache, Flags, Routing

### Blob Storage
```bash
vercel blob list
vercel blob put [path-to-file]
vercel blob get [url-or-pathname]
vercel blob del [url-or-pathname]
vercel blob copy [from-url] [to-pathname]
```

### Cache
```bash
vercel cache purge
vercel cache purge --type cdn
vercel cache purge --type data
vercel cache invalidate --tag [tag]
```

### Feature Flags
```bash
vercel flags list
vercel flags create [slug]
vercel flags set [flag] --environment [env] --variant [variant]
vercel flags open [flag]
```

### Redirects & Routes
```bash
vercel redirects list
vercel redirects add /old /new --status 301
vercel redirects upload redirects.csv --overwrite

vercel routes list
vercel routes add --ai "Rewrite /api/* to https://backend.internal/*"
vercel routes publish
```

---

## Marketplace Integrations

```bash
# Add an integration (replaces discontinued Vercel Postgres, Vercel KV)
vercel install [integration-name]         # alias for `integration add`
vercel integration add [name]
vercel integration list [project]
vercel integration discover                # browse available
vercel integration guide [name]            # setup instructions
vercel integration balance [name]          # check usage/billing
vercel integration open [name] [resource]
vercel integration remove [name]

# Manage individual resources from integrations
vercel integration-resource remove [resource]
vercel integration-resource disconnect [resource] [project]
```

---

## Teams, Usage, Billing

```bash
vercel teams list
vercel teams add
vercel teams invite [email]
vercel switch [team-name]

vercel usage
vercel usage --from 2025-01-01 --to 2025-01-31
vercel usage --breakdown daily
vercel contract
vercel contract --format json
```

---

## Miscellaneous Commands

```bash
vercel activity                           # project activity feed
vercel activity ls --type deployment --since 7d
vercel api /v9/projects                   # raw Vercel API call (beta)
vercel mcp                                # configure MCP for project
vercel mcp --project
vercel git connect                        # connect git provider
vercel git disconnect [provider]
vercel telemetry disable
vercel webhooks list
vercel webhooks create [url] --event [event]
vercel connex token                           # fetch auth token for Connex clients (v52+)
```

---

## Global Flags (work on most commands)

| Flag | Shorthand | Purpose |
|------|-----------|---------|
| `--token [tok]` | `-t` | Auth token (prefer `VERCEL_TOKEN` env var) |
| `--scope [team]` | `-S` | Run command in different team scope |
| `--team [team]` | `-T` | Specify team slug or ID |
| `--project [name]` | — | Specify project (also: `VERCEL_PROJECT_ID` env var) |
| `--cwd [path]` | — | Working directory |
| `--local-config [file]` | `-A` | Path to vercel.json |
| `--global-config [dir]` | `-Q` | Path to global config directory |
| `--debug` | `-d` | Verbose output (troubleshooting) |
| `--no-color` | — | Disable color/emoji (also `NO_COLOR=1`) |
| `--help` | `-h` | Command help |
| `--version` | `-v` | CLI version |

**Project specification precedence** (highest to lowest):
1. `--project` flag
2. `VERCEL_PROJECT_ID` env var
3. `.vercel/project.json` (from `vercel link`)

---

## Common Workflows

### 1. First-time project setup
```bash
cd my-project
vercel link                    # links to existing or creates new
vercel pull                    # sync env + settings to .vercel/
vercel env pull .env.local     # pull dev env vars for local tools
vercel dev                     # run locally with Vercel environment
```

### 2. Deploy to production
```bash
vercel --prod
# or safer: preview → inspect → promote
vercel                                     # preview deploy
vercel inspect [preview-url] --logs        # verify
vercel promote [preview-url]               # promote to prod
```

### 3. Roll back a broken production deploy
```bash
vercel rollback                # interactive, picks previous
# or to a specific deployment:
vercel rollback [deployment-url]
```

### 4. Debug a failing deployment
```bash
vercel logs [deployment-url] --follow
vercel inspect [deployment-url] --logs
vercel list --meta failed=true
```

### 5. Add a secret to production
```bash
# Safer (no bash history, no process list exposure):
cat secret.txt | vercel env add STRIPE_KEY production --sensitive
vercel env pull --environment=production   # sync locally if needed
```

### 6. CI/CD deploy pattern (GitHub Actions style)
```bash
#!/bin/bash
export VERCEL_TOKEN=$VERCEL_TOKEN_SECRET
export VERCEL_ORG_ID=$VERCEL_ORG_ID
export VERCEL_PROJECT_ID=$VERCEL_PROJECT_ID

# Pull project settings
vercel pull --yes --environment=production

# Build locally
vercel build --prod

# Deploy prebuilt output
url=$(vercel deploy --prebuilt --prod)
echo "Deployed to: $url"
```

### 7. Preview deploy → custom alias
```bash
vercel deploy > url.txt 2> err.txt
if [ $? -eq 0 ]; then
  vercel alias "$(cat url.txt)" preview.example.com
else
  cat err.txt
  exit 1
fi
```

---

## `vercel.ts` Configuration (recommended over `vercel.json`)

Since late 2025, `vercel.ts` is the preferred config format. Install with `npm i @vercel/config`.

```ts
// vercel.ts
import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'npm run build',
  framework: 'nextjs',
  rewrites: [
    routes.rewrite('/api/(.*)', 'https://backend.example.com/$1'),
  ],
  redirects: [
    routes.redirect('/old-docs', '/docs', { permanent: true }),
  ],
  headers: [
    routes.cacheControl('/static/(.*)', { public: true, maxAge: '1 week', immutable: true }),
  ],
  crons: [{ path: '/api/cleanup', schedule: '0 0 * * *' }],
};
```

Docs: https://vercel.com/docs/project-configuration/vercel-ts

---

## Gotchas & Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `vercel` hangs on deploy | Interactive prompts in CI | Add `--yes` |
| Build cache serving stale code | Cache not invalidated | `vercel deploy --force` |
| Env vars missing at build time with `--prebuilt` | System env vars not available | Don't use `--prebuilt`, or pass with `--build-env` |
| Wrong team scope | Default team mismatch | Use `--scope` or `vercel switch [team]` |
| Deploy URL not captured in script | Reading stderr instead of stdout | `vercel > url.txt 2> err.txt` — stdout is URL |
| Upload fails: too many files | Hitting [files limit](https://vercel.com/docs/limits#files) | Add `--archive=tgz` |
| Env var not applying to branch | Wrong target scope | Specify `[environment] [gitbranch]` in `env add` |
| Token exposed in logs | Using `--token` flag | Use `VERCEL_TOKEN` env var instead |
| `vercel dev` can't find env vars | Didn't run `vercel pull` first | `vercel pull` syncs to `.vercel/` |

---

## Stdout / Stderr / Exit Codes (for scripting)

- **stdout** → deployment URL (always, on `vercel deploy`)
- **stderr** → errors, warnings, progress messages
- **exit code 0** → success
- **exit code non-zero** → failure

```bash
url=$(vercel deploy --prod 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "Deployed: $url"
else
  echo "Deploy failed"; exit 1
fi
```

---

## When NOT to Use the CLI

- **Routine Git-connected deploys** — if your project is connected to GitHub, pushing to the branch auto-deploys. CLI is for manual deploys, env management, rollbacks, debugging, and CI/CD scripts.
- **Mass env var imports** — dashboard has a bulk import UI that's faster.
- **Domain registration** — dashboard has better search/pricing UX than `vercel domains buy`.

---

## Official Docs
- Main: https://vercel.com/docs/cli
- Deploy: https://vercel.com/docs/cli/deploy
- Env: https://vercel.com/docs/cli/env
- Global options: https://vercel.com/docs/cli/global-options
- vercel.ts config: https://vercel.com/docs/project-configuration/vercel-ts

**When in doubt, fetch fresh docs** — Vercel ships fast, and memorized answers can be wrong.
