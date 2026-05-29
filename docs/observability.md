# Observability — OpenRouter generation log → trigger.dev

Every call Sprouty makes through OpenRouter (image gen, plan generation, embeddings, eventually voice) can be mirrored to a trigger.dev task that classifies the run and logs structured fields. The dashboard then becomes the single place to triage failed image gens, slow embeddings, or surprise refusals — without leaving the trigger.dev UI.

## Architecture

```
OpenRouter generation
        │
        ▼   (Settings → Observability → Webhook URL)
Next.js  POST /api/webhooks/openrouter   ← shared-secret guard
        │
        ▼
trigger.dev task: openrouter-webhook
        │
        ├── classify  →  ok | slow | error
        ├── logger.{info,warn,error}({ structured fields })
        └── (hook for Slack / email alerts on slow + error)
```

A single OpenRouter webhook = one trigger.dev task run. The free tier gives you 25,000 task runs per month, which is comfortable for hackathon-scale traffic but worth tracking.

## Setup (5 minutes)

### 1. Configure environment

Add to `.env.local`:

```
TRIGGER_API_KEY=tr_pat_xxxxxxxxxxxx                          # Personal Access Token from trigger.dev
TRIGGER_PROJECT_ID=proj_vsdtmcbxzbblnjexcfkb                 # Your project ref
NEXT_PUBLIC_TRIGGER_PROJECT_ID=proj_vsdtmcbxzbblnjexcfkb     # Same value, exposed for the in-app Test button

OPENROUTER_WEBHOOK_SECRET=<generate-a-long-random-string>    # Optional but recommended in prod
```

`TRIGGER_API_KEY` should be a **Personal Access Token** (`tr_pat_...`). Dev keys (`tr_dev_...`) only work for local CLI runs, not for runtime triggering.

### 2. Run trigger.dev locally (or deploy)

For local development you don't strictly need this — but you'll only see runs in the trigger.dev dashboard if a deployed (or `dev`-mode) worker is registered:

```bash
npx trigger.dev@latest dev          # one-off local worker, attaches to your project
# OR
npx trigger.dev@latest deploy       # ships the task to trigger.dev cloud
```

### 3. Configure the webhook in OpenRouter

1. Go to [OpenRouter → Settings → Observability](https://openrouter.ai/settings/observability) (or wherever the current dashboard exposes generation webhooks).
2. Add a new webhook:
   - **URL**: `https://YOUR_DOMAIN/api/webhooks/openrouter` (or `https://your-tunnel.ngrok.app/api/webhooks/openrouter` for local testing)
   - **Secret**: paste the same random string you put in `OPENROUTER_WEBHOOK_SECRET`. The receiver checks the `x-openrouter-signature` (or `x-webhook-secret` / `Authorization: Bearer …`) header against the env value and 401s on mismatch.
3. Save. OpenRouter will start firing webhooks for new generations immediately.

### 4. Verify

Trigger any OpenRouter call (drop a doc to ingest, hit "Generate vision", run the test plan modal). Within a few seconds you should see a new run in the trigger.dev dashboard tagged `openrouter-webhook`.

## Severity tags — what they mean

The task classifies every event as one of three severities:

| Severity | Trigger | Log level | Examples |
|----------|---------|-----------|----------|
| `error`  | `cancelled === true`, non-stop `finish_reason`, or zero completion tokens AND zero media | `logger.error` | Refusals, timeouts, upstream 500s, model returned nothing |
| `slow`   | `latency + generation_time > 60s` (and not an error) | `logger.warn` | Long GPT-Image runs, OpenRouter cold starts, network thrash |
| `ok`     | everything else | `logger.info` | Healthy generations |

The trigger.dev dashboard filters by log level, so `Errors only` and `Warnings + Errors` are one click each. The `model` field is logged on every run, so you can also slice by `openai/gpt-5.4-image-2`, `mistralai/mistral-small`, etc.

## Cost ceiling — what to watch

Each webhook = one trigger.dev run regardless of severity. Heavy usage paths:

| Operation | Webhooks per call | Notes |
|---|---|---|
| Plan generation | ~3 | constraint extraction + retrieval-time embedding pair + plan compose |
| Knowledge ingest (60-page PDF) | 200–300 | one per chunk's embedding + one final |
| Vision generation | 1 | per Generate Vision click |
| Voice session (Phase 5) | dozens to hundreds | each STT chunk + LLM turn + TTS chunk fires once |

If you're hitting the 25k/month ceiling:

- **Cheap escape hatch**: turn the webhook off in OpenRouter's dashboard until you're actively investigating something. Re-enable on demand.
- **Real escape hatch**: swap the URL on OpenRouter to your n8n webhook. No code changes needed on Sprouty's side.

## Swapping to n8n

If trigger.dev limits become a problem, n8n is a drop-in:

1. In n8n, create a new workflow with a **Webhook** trigger node. Note the URL.
2. Wire downstream nodes for whatever you want — log to a Google Sheet, alert on Slack, archive to S3, etc.
3. In OpenRouter's Observability dashboard, replace the Sprouty webhook URL with the n8n URL.
4. Optional: keep the `OPENROUTER_WEBHOOK_SECRET` env on Sprouty (the route still checks it) but it now becomes inactive — n8n's auth flow takes over.

You can keep the trigger.dev task definition in the repo for free; it just won't get invoked anymore.

## Future hooks

The task currently returns `{ severity, reason, model, shouldAlert }` and stops. To wire actual alerts:

- **Slack DM on error/slow** — add a `SLACK_WEBHOOK_URL` env, post a small JSON to it from the task when `shouldAlert === true`.
- **Email digest** — schedule a daily trigger.dev task that queries the run history (via the trigger.dev management API) and emails a roll-up via Resend / Mailgun.
- **Per-model latency tracking** — push the `totalMs` field into a TimescaleDB / PlanetScale instance for charting.

None of these block the hackathon submission; the dashboard view is enough triage surface to ship with.
