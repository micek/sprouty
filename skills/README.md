# SKILLS

Reusable Claude skills used while building Sprout. Each subdirectory is one skill — a folder containing a `SKILL.md` (with YAML frontmatter `name` + `description`) and any supporting `references/`, `scripts/`, `assets/`, `agents/`.

## Installed skills

| Skill | Purpose |
|---|---|
| [skill-creator](skill-creator/) | Meta-skill for creating, editing, evaluating, and benchmarking other skills. Bundled verbatim from [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/skill-creator). Entrypoint when authoring new Sprout-specific skills. |
| [openrouter](openrouter/) | OpenRouter as a unified OpenAI-compatible gateway — use for the Python agent service and ingest pipeline (all 7 Sprout models via one key). The Next.js API routes use the same endpoint via the `openai` npm SDK pointed at `https://openrouter.ai/api/v1`. |
| [playwright-mcp](playwright-mcp/) | Setup + use of Microsoft's Playwright MCP server for browser automation. Use for end-to-end testing the Sprout UI (voice flow, plan render, K-hold modal), scraping, and Playwright test generation. |
| [trigger-dev](trigger-dev/) | High-level "Claude Workflow Builder" pattern for designing and shipping Trigger.dev v3 automations (research → clarify → plan → build → deploy). Drives the Sunday 9am weekly nudge job and adaptive replan flow. |
| [cli/trigger-dev](cli/trigger-dev/) | Trigger.dev CLI commands — `init`, `dev`, `deploy`, profiles, env vars. Pairs with the workflow-builder skill for the actual ship step. |
| [cli/vercel](cli/vercel/) | Vercel CLI commands — deploy, env, logs, rollback, promote, domains, DNS. Used when shipping the Next.js frontend for the demo. |
| [cli/livekit](cli/livekit/) | LiveKit CLI (`lk`) — `cloud auth`, project switching, dev token generation, room debug joins, `lk agent create/deploy/update-secrets/logs/rollback` for the Python voice agent service, egress, load testing, and `lk docs` SDK search. |

## Adding a new skill

1. Create `SKILLS/<skill-name>/SKILL.md` with YAML frontmatter:
   ```markdown
   ---
   name: <skill-name>
   description: <one-line description of when to use this skill>
   ---
   ```
2. Put any reference docs the skill loads under `references/`, scripts under `scripts/`, prompt assets under `assets/`, and sub-agents under `agents/`.
3. Validate with `python SKILLS/skill-creator/scripts/quick_validate.py SKILLS/<skill-name>` (or whichever validator the skill-creator skill recommends).
4. Note the addition in [CHANGELOG.md](../CHANGELOG.md).

## Planned

- `qdrant-ingest` — repeatable Qdrant collection setup + PDF chunking + embed + upsert.
- `livekit-agent` — Python LiveKit Agents scaffold (Voxtral STT/TTS + Mistral Small LLM via OpenRouter, Silero VAD).

## License

The bundled `skill-creator` is © Anthropic, distributed under the license at [skill-creator/LICENSE.txt](skill-creator/LICENSE.txt). All other skills in this folder are © their respective authors.
