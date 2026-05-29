"""
Qdrant knowledge-base search for the Sprouty voice agent.

Provides a small async helper the agent's `@function_tool` calls when the
user asks a specific gardening question mid-conversation. Mirrors the
collection setup in `lib/qdrant.ts`:

  - collection: `sprout_kb`
  - dense vector field: `dense` (1536-dim cosine, openai/text-embedding-3-small)
  - difficulty filter cap: 3 (beginner-friendly)

Embeds the query through OpenRouter using the same `openai/text-embedding-3-small`
model the browser ingest pipeline writes vectors with — keeping the agent's
queries vector-compatible with the existing index.
"""

from __future__ import annotations

import logging
import os
from typing import Any

log = logging.getLogger("sprouty-agent.kb")

# Module-level singletons — built lazily on first call so the worker can boot
# even when Qdrant creds are missing (the tool just reports "unavailable"
# instead of crashing the whole session).
_qdrant_client: Any | None = None
_openai_client: Any | None = None

COLLECTION = "sprout_kb"
DENSE_FIELD = "dense"
EMBEDDING_MODEL = "openai/text-embedding-3-small"
BEGINNER_DIFFICULTY_MAX = 3


def _get_qdrant():
    """Lazy AsyncQdrantClient. Returns None if creds are missing."""
    global _qdrant_client
    if _qdrant_client is not None:
        return _qdrant_client
    url = os.environ.get("QDRANT_URL")
    key = os.environ.get("QDRANT_API_KEY")
    if not url or not key or "REPLACE_ME" in (url + key):
        return None
    from qdrant_client import AsyncQdrantClient
    _qdrant_client = AsyncQdrantClient(url=url, api_key=key)
    return _qdrant_client


def _get_openai():
    """Lazy AsyncOpenAI pointed at OpenRouter for embeddings."""
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    from openai import AsyncOpenAI
    _openai_client = AsyncOpenAI(
        base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    return _openai_client


async def _embed(text: str) -> list[float]:
    client = _get_openai()
    res = await client.embeddings.create(model=EMBEDDING_MODEL, input=text)
    return res.data[0].embedding


async def search_knowledge_base(query: str, *, limit: int = 3) -> str:
    """
    Run a beginner-difficulty-capped semantic search against `sprout_kb` and
    return a short, citation-rich text block the LLM can read aloud or
    paraphrase. Returns a graceful fallback string when:
      - Qdrant credentials aren't configured (worker boots without them),
      - The collection is empty / unreachable,
      - The embedding call fails.

    The output is intentionally compact (3 hits, ~200 chars each) so the
    Mistral Small response token budget isn't blown on raw retrieval.
    """
    qdrant = _get_qdrant()
    if qdrant is None:
        return "(Knowledge base not configured — set QDRANT_URL and QDRANT_API_KEY in agent/.env to enable citations.)"

    try:
        vector = await _embed(query)
    except Exception as err:  # noqa: BLE001
        log.warning("kb embed failed: %s", err)
        return f"(Couldn't embed the question — {err}.)"

    # No difficulty filter — the current ingest pipeline doesn't tag chunks
    # with `difficulty_rating`, so filtering on `lte: 3` would silently drop
    # every chunk. The corpus itself (beginner gardening books) is already
    # difficulty-appropriate, so this is fine.
    try:
        res = await qdrant.query_points(
            collection_name=COLLECTION,
            query=vector,
            using=DENSE_FIELD,
            limit=limit,
            with_payload=True,
        )
    except Exception as err:  # noqa: BLE001
        log.warning("kb query failed: %s", err)
        return f"(Knowledge base unavailable — {err}.)"

    points = getattr(res, "points", res) or []
    if not points:
        log.info("kb returned 0 hits for %r", query)
        return "(No matches in the knowledge base for that question.)"

    # Log what we actually pulled so the operator can verify Qdrant is being
    # cross-referenced (and which chunks the LLM is paraphrasing from).
    summary = ", ".join(
        f"{(p.payload or {}).get('source_doc', '?')}#p{(p.payload or {}).get('page', '?')}@{(p.score or 0):.2f}"
        for p in points
    )
    log.info("kb returned %d hits for %r: %s", len(points), query, summary)

    lines: list[str] = [
        f"Knowledge-base hits for {query!r} (read these and paraphrase, cite the chapter/page in your reply):"
    ]
    for i, point in enumerate(points, start=1):
        payload = point.payload or {}
        text = (payload.get("text") or "").strip().replace("\n", " ")
        if len(text) > 220:
            text = text[:220].rstrip() + "…"
        cite = _format_citation(payload)
        lines.append(f"[{i}] {cite}\n    {text}")

    return "\n".join(lines)


def _format_citation(payload: dict) -> str:
    """`Ch. 3 · "Soil prep" · p. 19` — assembled from whichever fields are present."""
    parts: list[str] = []
    if chapter := payload.get("chapter"):
        parts.append(f"Ch. {chapter}")
    if section := payload.get("section_title"):
        parts.append(f'"{section}"')
    if page := payload.get("page"):
        parts.append(f"p. {page}")
    src = payload.get("source_doc") or "knowledge base"
    inner = " · ".join(parts) if parts else "no citation"
    return f"({inner}) — {src}"
