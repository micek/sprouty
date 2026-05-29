---
name: openrouter
description: Guides use of OpenRouter as a unified, OpenAI-compatible LLM gateway across 300+ models — and as the LLM backend behind MCP-enabled coding agents. Use when (1) building Python scripts/agents that need access to many LLMs through one key, (2) wiring an MCP server to a non-Anthropic LLM (Claude/GPT/Gemini/Grok/Llama via one endpoint), (3) prototyping where Vercel AI Gateway isn't the right fit (non-Vercel deploys, CLI tools, model fallback experiments), or (4) the user pastes an `openrouter/...` model slug and wants it wired up.
---

# Skill: OpenRouter

> Read this before adding OpenRouter to any MSB project, swapping a provider call to OpenRouter, or wiring MCP servers to a non-Anthropic LLM.

## When to reach for OpenRouter (vs. alternatives)

| Use case | Pick this | Why |
|---|---|---|
| **TypeScript / Next.js / Trigger.dev** in MSB | **Vercel AI SDK + AI Gateway** | Default routing layer, single key, caching, budgets, MSB convention. See `~/Documents/msb/skills/vercel-ai-sdk/SKILL.md`. |
| **Python script / agent / Modal job** | **OpenRouter** | OpenAI-compatible client → drop-in for the `openai` Python SDK. No need to bring AI Gateway. |
| **MCP server + non-Anthropic LLM** | **OpenRouter** | The OpenRouter MCP guide is literally "use Anthropic's MCP client SDK with OpenRouter under the hood." Lets you point any MCP host at GPT/Gemini/Llama/Grok via one endpoint. |
| **Voice agents (Vapi, Bland, ElevenLabs)** | **Provider-native LLM** | Voice platforms route their own LLM internally — don't proxy. |
| **n8n workflows** | **n8n AI nodes** | Use n8n's built-in OpenAI/Anthropic/Google nodes, or n8n's HTTP node pointed at OpenRouter for off-list models. |

**Default rule:** if you're writing **Node/TS** for an MSB project, reach for AI Gateway first. Use OpenRouter for **Python**, **CLI tools**, **MCP bridging**, or when you need a model that isn't on AI Gateway yet.

---

## Setup

### 1. Get an API key

Sign in at <https://openrouter.ai>, create a key under *Keys*, fund the account (pay-as-you-go credits — no monthly minimum). Add the key to the relevant env file:

```bash
# .env / .env.local
OPENROUTER_API_KEY=sk-or-v1-...
```

> **Naming:** OpenRouter docs sometimes show `OPENAI_API_KEY` because it's a drop-in for the OpenAI SDK. **In MSB code, always name the env var `OPENROUTER_API_KEY`** so it doesn't collide with a real OpenAI key. Pass it explicitly when constructing the client.

### 2. Endpoints

- Base URL: `https://openrouter.ai/api/v1`
- Chat completions: `POST /chat/completions` (OpenAI-compatible)
- Models list: `GET /models` (always check live — the catalog moves weekly)

### 3. Optional attribution headers

OpenRouter ranks apps in its public leaderboard if you send these:

```
HTTP-Referer:  https://mysickbuilds.com   (or the project URL)
X-Title:       MSB · <project name>
```

Harmless to omit. Include them when shipping to prod under an MSB brand.

---

## Model slug format

Always `provider/model[:variant]`. Examples (verify live with `GET /models` — your training data is stale):

```
anthropic/claude-sonnet-4.5
anthropic/claude-opus-4.5
openai/gpt-5.2
openai/gpt-5.2-mini
google/gemini-2.5-pro
google/gemini-2.5-flash
meta-llama/llama-4-405b-instruct
x-ai/grok-4
mistralai/mistral-large-latest
deepseek/deepseek-v3
qwen/qwen3-72b-instruct
```

**Never hand-write a model slug from memory.** Run this first:

```bash
# Quick: list all model IDs, newest first
curl -s https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  | jq -r '.data[].id' | sort

# Or filter by provider
curl -s https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  | jq -r '.data[] | select(.id | startswith("anthropic/")) | .id'
```

---

## Basic API usage

### curl (smoke test)

```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "anthropic/claude-sonnet-4.5",
    "messages": [{"role": "user", "content": "Say hello in one word."}]
  }'
```

### Python (OpenAI SDK, drop-in)

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    default_headers={
        "HTTP-Referer": "https://mysickbuilds.com",
        "X-Title": "MSB · <project>",
    },
)

resp = client.chat.completions.create(
    model="anthropic/claude-sonnet-4.5",
    messages=[{"role": "user", "content": "What's the meaning of life?"}],
)
print(resp.choices[0].message.content)
```

### TypeScript (only when you can't use Vercel AI SDK)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultHeaders: {
    "HTTP-Referer": "https://mysickbuilds.com",
    "X-Title": "MSB · <project>",
  },
});

const res = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4.5",
  messages: [{ role: "user", content: "What's the meaning of life?" }],
});
```

> If you reach for this in a Next.js or Trigger.dev project, **stop** and use Vercel AI SDK + AI Gateway instead. Only fall back to OpenRouter in TS for: standalone CLI scripts, model experiments not yet on AI Gateway, or when the user explicitly asks for OpenRouter.

### Streaming

Pass `stream=True` (Python) / `stream: true` (TS) — output is OpenAI's standard SSE format. The OpenAI SDKs handle reconstruction automatically.

---

## MCP servers + OpenRouter

> **What this is:** OpenRouter doesn't host MCP servers. Instead, the [official guide](https://openrouter.ai/docs/guides/coding-agents/mcp-servers) shows how to take any MCP server's tool list, convert it to OpenAI's function-call format, and run the loop with **OpenRouter as the LLM**. Net effect: any MCP server can be paired with any OpenRouter-supported model.

### When to use this pattern

- You want **Gemini / GPT / Llama** to drive an MCP server (Claude Desktop / Claude Code already speak MCP natively to Anthropic).
- You're building a **Python coding agent / data agent / research agent** and want MCP tool-calling without locking into one provider.
- You want **provider fallback** — the same MCP loop, swap the model string.

### Minimal Python loop

```python
# pip install openai mcp python-dotenv
import asyncio
from contextlib import AsyncExitStack
from typing import Optional

from openai import OpenAI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

MODEL = "anthropic/claude-sonnet-4.5"  # or any openrouter slug

SERVER_CONFIG = StdioServerParameters(
    command="npx",
    args=["-y", "@modelcontextprotocol/server-filesystem", "/Users/cory/Documents/msb"],
    env=None,
)

def convert_tool(tool):
    """MCP Tool -> OpenAI function-call schema."""
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": {
                "type": "object",
                "properties": tool.inputSchema["properties"],
                "required": tool.inputSchema.get("required", []),
            },
        },
    }


class MCPClient:
    def __init__(self):
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.openai = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            # api_key picked up from OPENROUTER_API_KEY by passing it explicitly:
            # api_key=os.environ["OPENROUTER_API_KEY"],
        )

    async def connect(self, params: StdioServerParameters):
        transport = await self.exit_stack.enter_async_context(stdio_client(params))
        self.session = await self.exit_stack.enter_async_context(ClientSession(*transport))
        await self.session.initialize()

    async def run(self, user_msg: str):
        tools_resp = await self.session.list_tools()
        tools = [convert_tool(t) for t in tools_resp.tools]

        messages = [{"role": "user", "content": user_msg}]

        while True:
            resp = self.openai.chat.completions.create(
                model=MODEL,
                messages=messages,
                tools=tools,
            )
            msg = resp.choices[0].message
            messages.append(msg.model_dump(exclude_none=True))

            if not msg.tool_calls:
                return msg.content

            for call in msg.tool_calls:
                args = json.loads(call.function.arguments) if call.function.arguments else {}
                result = await self.session.call_tool(call.function.name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": str(result.content),
                })

    async def close(self):
        await self.exit_stack.aclose()


async def main():
    client = MCPClient()
    await client.connect(SERVER_CONFIG)
    print(await client.run("List the top-level folders in this workspace."))
    await client.close()


if __name__ == "__main__":
    import json
    asyncio.run(main())
```

**The pattern in 3 steps:**
1. `convert_tool()` — translate each MCP tool into OpenAI's function schema.
2. Loop: call OpenRouter → if `tool_calls`, dispatch each via `session.call_tool()` → append results → loop again.
3. Exit when the model returns plain content (no `tool_calls`).

### Picking a coding-agent model on OpenRouter

For agentic loops with tools, prefer (in this order):
1. `anthropic/claude-sonnet-4.5` — best tool-call reliability across providers.
2. `openai/gpt-5.2` — strong tool calling, often cheaper for high-volume.
3. `google/gemini-2.5-pro` — long context (1M+), good for repo-wide tasks.
4. `x-ai/grok-4` — sometimes cheaper for the same task; verify tool-call quality on your specific tool set first.

Always check live IDs with `GET /models` before shipping.

---

## Provider routing & fallback

OpenRouter lets you specify routing preferences inside the request body:

```json
{
  "model": "anthropic/claude-sonnet-4.5",
  "provider": {
    "order": ["anthropic", "amazon-bedrock"],
    "allow_fallbacks": true
  },
  "messages": [...]
}
```

Useful when:
- A specific provider has lower latency from your region.
- You want to fall back to a different host of the same model on outage.
- You need to exclude a provider for compliance.

See the OpenRouter "Provider Routing" docs for the full list of `provider.*` knobs.

---

## MSB conventions

1. **Env var name:** `OPENROUTER_API_KEY`. Never `OPENAI_API_KEY` — keep them distinct.
2. **Always pass `api_key` and `base_url` explicitly** to the client. Don't rely on env defaults that the OpenAI SDK might pick up from a real OpenAI key.
3. **Send attribution headers** for any project shipped under an MSB-owned domain (`HTTP-Referer` + `X-Title`).
4. **Verify model IDs at code-write time** with `GET /models`. Don't paste a slug from memory.
5. **Cost-conscious by default:** for non-critical loops (drafts, classification, summarization), reach for `*-mini` / `*-flash` / `*-haiku` variants first.
6. **Don't double-route:** if a project already uses Vercel AI Gateway, **don't add OpenRouter alongside it** — pick one. Mixed routing means duplicate keys, duplicate billing, no unified logs.
7. **Don't put OpenRouter inside Vapi/Bland/ElevenLabs prompts** — those platforms route their own LLM and adding a hop adds latency.

---

## Cost & limits (high level)

- **Pricing:** per-token, varies by model. OpenRouter charges the model's list price + a small markup. Free tier exists for some open models (look for the `:free` suffix in the model slug, e.g. `meta-llama/llama-4-8b-instruct:free`) — rate-limited and not for production.
- **Credits:** prepaid balance. No monthly minimum. Set a low auto-recharge first time you wire it into a prod loop.
- **Rate limits:** per-key; visible in the OpenRouter dashboard. Headers on every response (`X-RateLimit-*`) tell you what's left.
- **Spending caps:** set per-key in the dashboard. Recommended for any agent that runs unattended.

---

## Quick reference

| Need | Snippet |
|---|---|
| List models | `curl -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/models \| jq -r '.data[].id'` |
| Smoke test a model | curl example above |
| Drop into existing OpenAI Python code | swap `base_url` to `https://openrouter.ai/api/v1` and `api_key` to `OPENROUTER_API_KEY` |
| Wire MCP server to non-Claude LLM | use the `convert_tool` + loop pattern above |
| Provider fallback | add `"provider": {"order": [...], "allow_fallbacks": true}` to the request |

---

## References

- **MCP servers + OpenRouter (the doc that triggered this skill):** <https://openrouter.ai/docs/guides/coding-agents/mcp-servers>
- **Quickstart:** <https://openrouter.ai/docs/quickstart>
- **Models catalog (live):** <https://openrouter.ai/models>
- **Provider routing:** <https://openrouter.ai/docs/features/provider-routing>
- **Full LLM-readable docs:** <https://openrouter.ai/docs/llms-full.txt>
- **Related MSB skills:** `vercel-ai-sdk/SKILL.md` (preferred for TS), `mcp-integration/SKILL.md` (general MCP setup).
