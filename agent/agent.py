"""
Sprouty LiveKit voice agent.

Drops into any LiveKit room minted by `app/api/livekit/token`, runs the
Mistral sponsor stack — Voxtral STT → Mistral Small LLM → Voxtral TTS — all
proxied through OpenRouter, with Silero VAD for end-of-turn detection.

Per the Sprouty privacy stance, the agent does NOT touch IndexedDB-stored
keys, sessions, plans, or vision images. Everything user-personal lives in
the browser. The agent's job is purely:

    1. transcribe the user's audio
    2. talk back over the live channel
    3. emit structured events over the LiveKit data channel so the browser
       can persist transcripts + drive `generatePlan()`

Wire-up:
    cp agent/.env.example agent/.env       # then fill in real values
    pip install -r agent/requirements.txt
    python agent/agent.py dev              # connects to LiveKit, listens for jobs

Production deploy (per SKILLS/cli/livekit/SKILL.md):
    lk agent create
    lk agent deploy
    lk agent update-secrets    # ship .env contents into the cluster

Targets `livekit-agents` 1.x. The 0.x `VoiceAssistant` API was replaced
by `Agent` + `AgentSession` in 1.0; this file uses the 1.x shape.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobExecutorType,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.agents.llm import ChatContext, ChatMessage
from livekit.plugins import openai as openai_plugin
from livekit.plugins import silero
from qdrant_search import search_knowledge_base
from voxtral_tts import VoxtralTTS

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [sprouty-agent] %(levelname)s %(message)s")
log = logging.getLogger("sprouty-agent")


# ─── prompts ──────────────────────────────────────────────────────────


PROMPT_PATH = Path(__file__).parent / "prompts" / "sprouty.md"


def _split_markdown_sections(text: str) -> dict[str, str]:
    """
    Split a markdown document on top-level `## ` headings into a
    {section_name_lower: body} mapping. Intro text before the first heading
    is discarded (treated as documentation, not prompt content).
    """
    sections: dict[str, str] = {}
    current: Optional[str] = None
    buf: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if current is not None:
                sections[current] = "\n".join(buf).strip()
            current = line[3:].strip().lower()
            buf = []
        elif current is not None:
            buf.append(line)
    if current is not None:
        sections[current] = "\n".join(buf).strip()
    return sections


def _load_prompts() -> tuple[str, str, str]:
    """
    Read agent/prompts/sprouty.md, parse out the system prompt + both
    openers (first-time vs returning user). Failing loud here is intentional
    — a bad prompt file should crash the worker on boot, not silently fall
    back to a generic prompt that won't represent Sprouty correctly.

    Returns (system_prompt, first_time_opener, returning_opener).
    """
    if not PROMPT_PATH.exists():
        raise FileNotFoundError(
            f"Sprouty prompt file missing at {PROMPT_PATH}. "
            "It ships with the repo — check for an aborted edit or merge."
        )
    text = PROMPT_PATH.read_text(encoding="utf-8")
    sections = _split_markdown_sections(text)
    system = sections.get("system prompt")
    first_time = sections.get("first-time opener") or sections.get("opener")
    returning = sections.get("returning opener")
    if not system:
        raise RuntimeError(
            f"{PROMPT_PATH} is missing required `## System prompt` section "
            f"(found sections: {list(sections.keys())})."
        )
    if not first_time:
        raise RuntimeError(
            f"{PROMPT_PATH} is missing required `## First-time opener` section "
            f"(found sections: {list(sections.keys())})."
        )
    if not returning:
        # Soft fallback so we don't crash on prompt files that haven't been
        # updated to the two-opener format yet — reuse the first-time opener.
        returning = first_time
    return system, first_time, returning


SYSTEM_PROMPT, FIRST_TIME_OPENER, RETURNING_OPENER = _load_prompts()


# ─── Sprouty agent (with knowledge-base tool) ─────────────────────────


class Sprouty(Agent):
    """
    The Sprouty voice agent. Subclasses `Agent` so we can hang an
    @function_tool on it — that's how livekit-agents 1.x exposes function
    calling to the LLM. The knowledge-base tool wraps a Qdrant Discovery
    query against `sprout_kb` so Sprouty can cite real chapter/page numbers
    mid-conversation when the user asks something specific
    ("how far apart should I plant tomatoes?").
    """

    def __init__(self, *, instructions: str, chat_ctx: Optional[ChatContext] = None):
        if chat_ctx is not None:
            super().__init__(instructions=instructions, chat_ctx=chat_ctx)
        else:
            super().__init__(instructions=instructions)

    @function_tool
    async def search_knowledge_base(self, query: str) -> str:
        """
        Search the gardening knowledge base for chapter/page-cited facts. Use
        this when the user asks a specific factual question that benefits
        from citing the books — spacing, sun requirements, watering cadence,
        seed-starting timing, pest treatment, soil pH, etc. Don't call it
        for casual chit-chat or for big-picture planning (the post-call plan
        generator already runs RAG on the full transcript).

        Args:
            query: A short natural-language question or topic phrase. Aim
                for 4-15 words. Examples: "tomato spacing in raised beds",
                "when to start kale seeds zone 6", "fix yellow leaves
                on pepper plant".

        Returns:
            A short text block with up to 3 hits, each prefixed with a
            citation like `(Ch. 3 · "Soil prep" · p. 19) — green-thumb.pdf`.
            Read these and paraphrase in your spoken reply; cite the chapter
            or page so the user knows it's grounded in their books.
        """
        log.info("kb tool called: %r", query)
        return await search_knowledge_base(query)


# ─── garden-context preload ───────────────────────────────────────────


def _build_chat_context(metadata_json: Optional[str]) -> Optional[ChatContext]:
    """
    Returns a ChatContext seeded with prior garden-context facts AND the
    user's active 12-week plan snapshot (both packed into participant.metadata
    by the browser). Returns None if there's nothing to inject. The base
    system prompt is supplied separately via `Agent(instructions=...)`, so
    this only carries the *delta* — what we know about this specific user.

    Best-effort — silently skips on any parse error so a malformed metadata
    blob doesn't sink the whole session.
    """
    if not metadata_json:
        return None
    try:
        meta = json.loads(metadata_json)
    except Exception:
        return None

    # ─── garden context block ───
    profile_parts: list[str] = []
    if meta.get("crops"):
        profile_parts.append(f"Crops the user has previously mentioned growing: {', '.join(meta['crops'])}.")
    if meta.get("spaceDescription"):
        profile_parts.append(f"Their space: {meta['spaceDescription']}.")
    if meta.get("hoursPerWeek") is not None:
        profile_parts.append(f"Hours per week available: {meta['hoursPerWeek']}.")
    if meta.get("goals"):
        profile_parts.append(f"Goals: {'; '.join(meta['goals'])}.")
    if meta.get("region"):
        profile_parts.append(f"Region/climate: {meta['region']}.")

    # ─── plan snapshot block ───
    plan_block = _format_plan_snapshot(meta.get("plan"))

    if not profile_parts and not plan_block:
        return None

    chat_ctx = ChatContext()
    if profile_parts:
        chat_ctx.add_message(
            role="system",
            content=(
                "Prior garden context for this returning user (carry this knowledge "
                "into the conversation; don't ask them to repeat it):\n"
                + "\n".join(profile_parts)
            ),
        )
    if plan_block:
        chat_ctx.add_message(role="system", content=plan_block)
    return chat_ctx


def _participant_has_plan(metadata_json: Optional[str]) -> bool:
    """
    Quick check used by the entrypoint to decide between the first-time
    opener ("tell me about your space") and the returning opener
    ("welcome back, want to adjust anything?"). Best-effort — any parse
    error → treat as no plan and use the first-time path.
    """
    if not metadata_json:
        return False
    try:
        meta = json.loads(metadata_json)
    except Exception:
        return False
    plan = meta.get("plan")
    return isinstance(plan, dict) and bool(plan.get("currentWeekTasks"))


def _format_plan_snapshot(plan: Optional[dict]) -> Optional[str]:
    """
    Render the browser's PlanSnapshot (lib/plan-summary.ts) into a compact
    English brief Sprouty can paraphrase mid-conversation. Returns None
    when no plan exists yet (first-time users) so we don't lie about plan
    state.

    Layout matches what an agent typically needs to answer:
      - "what's this week?"            → currentWeek tasks
      - "what's next / coming up?"     → nextWeek preview
      - "how am I doing overall?"      → completed/total counts
      - "what's on the shopping list?" → shoppingList
    """
    if not isinstance(plan, dict):
        return None

    starter_note = (
        " (this is the seeded starter plan — the user hasn't done a real voice planning session yet, "
        "so treat it as a placeholder)"
        if plan.get("isStarter")
        else ""
    )
    lines: list[str] = [
        f"User's active 12-week garden plan, version {plan.get('version', '?')}, "
        f"created {plan.get('createdAt', 'unknown')}{starter_note}.",
        "",
        f"Progress: {plan.get('doneTasks', 0)}/{plan.get('totalTasks', 0)} tasks done across "
        f"{plan.get('completedWeeks', 0)} fully-completed week(s).",
    ]

    cur_week_idx = plan.get("currentWeekIndex")
    cur_tasks = plan.get("currentWeekTasks") or []
    if cur_week_idx and cur_tasks:
        lines.append("")
        lines.append(
            f"This week (Week {cur_week_idx}, "
            f"{plan.get('currentWeekStart', '?')} → {plan.get('currentWeekEnd', '?')}):"
        )
        for t in cur_tasks:
            status = (t.get("status") or "pending").upper()
            label = t.get("label") or "(no label)"
            cite = f" — cites {t['citation']}" if t.get("citation") else ""
            lines.append(f"  • [{status}] {label}{cite}")

    next_week = plan.get("nextWeekPreview")
    if isinstance(next_week, dict) and next_week.get("firstTasks"):
        lines.append("")
        lines.append(
            f"Next up — Week {next_week.get('index', '?')} "
            f"({next_week.get('startDate', '?')} → {next_week.get('endDate', '?')}):"
        )
        for t in next_week["firstTasks"]:
            label = t.get("label") or "(no label)"
            lines.append(f"  • {label}")

    shopping = plan.get("shoppingList") or []
    if shopping:
        lines.append("")
        lines.append("Shopping list:")
        for item in shopping:
            lines.append(f"  • {item}")

    lines.append("")
    lines.append(
        "When the user asks 'what's next', 'what should I do this week', or about a "
        "specific task, answer FROM THIS PLAN — don't invent tasks or weeks. If they "
        "ask about something not on the plan, say so plainly."
    )
    return "\n".join(lines)


# ─── data-channel events to the browser ────────────────────────────────


async def _publish_event(room: rtc.Room, payload: dict) -> None:
    """
    Emit a structured JSON event over the room's data channel. The browser
    listens for these to (a) stream live transcripts into the UI and (b)
    fire `generatePlan()` once the user finishes talking.

    Event shapes the browser handles:
      { "type": "user_transcript",  "text": "..." }   - final user turn
      { "type": "agent_transcript", "text": "..." }   - agent's reply
      { "type": "session_end",      "transcript": "..." }
    """
    try:
        data = json.dumps(payload).encode("utf-8")
        await room.local_participant.publish_data(data, reliable=True, topic="sprouty")
    except Exception as err:  # noqa: BLE001
        log.warning("failed to publish data event: %s", err)


def _extract_text(message: ChatMessage) -> str:
    """
    ChatMessage.content is a list of `ChatContent` items (text or images).
    For Sprouty's voice flow we only care about the spoken text — strip out
    any non-text parts and join.
    """
    pieces: list[str] = []
    for part in message.content:
        if isinstance(part, str):
            pieces.append(part)
        else:
            text = getattr(part, "text", None)
            if isinstance(text, str):
                pieces.append(text)
    return "".join(pieces).strip()


# ─── entrypoint ────────────────────────────────────────────────────────


async def entrypoint(ctx: JobContext) -> None:
    log.info("agent received job for room %s", ctx.room.name)

    # In livekit-agents 1.x `connect()` auto-subscribes by default; the room
    # input options on `AgentSession.start()` control what tracks the agent
    # actually consumes. We don't need an explicit AutoSubscribe enum here.
    await ctx.connect()

    # Wait for at least one human participant to finish joining so the
    # initial greeting actually has someone to listen to it. The 30s timeout
    # is a safety net for stale jobs: when a worker is killed mid-session
    # (Ctrl+C in dev), LiveKit Cloud holds the pending job and replays it
    # the moment the worker reconnects — but the original room is long gone
    # so no participant ever joins. Without a timeout, the agent would hang
    # on `wait_for_participant()` until the room finally times out (~minutes)
    # and the inner await raises a scary `RuntimeError: room disconnected`.
    try:
        participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=30.0)
    except (asyncio.TimeoutError, RuntimeError) as err:
        log.info(
            "no participant joined room %s (likely a stale job replay after worker restart): %s",
            ctx.room.name,
            err,
        )
        return
    log.info(
        "participant joined: identity=%s metadata=%r",
        participant.identity,
        participant.metadata,
    )

    # Seed any prior garden-context facts from the participant's metadata blob.
    # The base system prompt is attached to the Agent below.
    prior_ctx = _build_chat_context(participant.metadata)
    has_existing_plan = _participant_has_plan(participant.metadata)

    # All-Mistral audio + LLM-via-OpenRouter. The custom VoxtralTTS plugin
    # exists because Mistral's TTS isn't OpenAI-compatible (uses `voice_id`
    # and returns base64 JSON instead of raw bytes), so the openai plugin
    # can't reach it via base_url override the way STT can.
    #
    #   STT  → Voxtral STT via Mistral direct          (sponsor product #1)
    #   LLM  → Mistral Small via OpenRouter            (sponsor product #2)
    #   TTS  → Voxtral TTS via Mistral direct          (sponsor product #3)
    mistral_api_key = os.environ["MISTRAL_API_KEY"]
    mistral_base_url = os.environ.get("MISTRAL_API_BASE_URL", "https://api.mistral.ai/v1")
    stt = openai_plugin.STT(
        model=os.environ.get("MISTRAL_STT_MODEL", "voxtral-mini-2507"),
        base_url=mistral_base_url,
        api_key=mistral_api_key,
    )
    chat_llm = openai_plugin.LLM(
        # OpenRouter retired the bare `mistralai/mistral-small` slug; current
        # versioned IDs include `-2603`, `-3.1-24b-instruct`, `-3.2-24b-instruct`.
        # Default to the newest dated build for stability.
        model=os.environ.get("MISTRAL_LLM_MODEL", "mistralai/mistral-small-2603"),
        base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    tts = VoxtralTTS(
        api_key=mistral_api_key,
        base_url=mistral_base_url,
        model=os.environ.get("MISTRAL_TTS_MODEL", "voxtral-mini-tts-2603"),
        voice_id=os.environ.get("MISTRAL_TTS_VOICE", "oliver"),
    )
    vad = silero.VAD.load()

    # `AgentSession` is the 1.x replacement for the old `VoiceAssistant`.
    # 1.5s end-of-turn silence threshold matches CLAUDE.md.
    session = AgentSession(
        vad=vad,
        stt=stt,
        llm=chat_llm,
        tts=tts,
        min_endpointing_delay=1.5,
    )

    sprouty = Sprouty(instructions=SYSTEM_PROMPT, chat_ctx=prior_ctx)

    # ─── data-channel mirroring ───
    # The browser's `lib/livekit-room.ts` listens on topic="sprouty" for
    # user_transcript / agent_transcript / session_end events. Mirror the
    # session events into that channel so the inline transcript and the
    # post-call plan generation both have the data they need.
    accumulated_user: list[str] = []
    accumulated_agent: list[str] = []

    @session.on("user_input_transcribed")
    def _on_user_transcribed(ev) -> None:
        # DIAGNOSTIC: log every STT event (interim + final, including empty)
        # so we can tell apart "VAD/STT never fired" (no logs at all → browser
        # sending silence) vs "STT fired but returned empty text" (silent/
        # echo-cancelled audio reaching Voxtral). Remove once hearing is fixed.
        log.info("STT event: is_final=%s text=%r", ev.is_final, ev.transcript)
        # `user_input_transcribed` fires for both interim and final results.
        # Only commit the final transcript to avoid duplicate fragments.
        if not ev.is_final:
            return
        text = (ev.transcript or "").strip()
        if not text:
            return
        accumulated_user.append(text)
        asyncio.create_task(
            _publish_event(ctx.room, {"type": "user_transcript", "text": text})
        )

    # DIAGNOSTIC: surface raw VAD speech boundaries. If these never appear
    # during a live test where you're clearly talking, the audio reaching the
    # agent is silent (browser mic problem) — not an STT problem. Remove once
    # hearing is fixed.
    @session.on("user_state_changed")
    def _on_user_state(ev) -> None:
        log.info("user_state_changed: %s -> %s", getattr(ev, "old_state", "?"), getattr(ev, "new_state", "?"))

    @session.on("conversation_item_added")
    def _on_item_added(ev) -> None:
        # `conversation_item_added` fires once per turn (user OR agent) once
        # the message is committed to chat history. Filter to assistant-only
        # since the user side is already covered by `user_input_transcribed`.
        item = ev.item
        if not isinstance(item, ChatMessage) or item.role != "assistant":
            return
        text = _extract_text(item)
        if not text:
            return
        accumulated_agent.append(text)
        asyncio.create_task(
            _publish_event(ctx.room, {"type": "agent_transcript", "text": text})
        )

    # When the participant disconnects (user clicks "Stop & send" / closes
    # the modal), publish a final session_end with the full transcript so
    # the browser can call `generatePlan()` against it.
    disconnect_event = asyncio.Event()

    def _on_participant_disconnected(p: rtc.RemoteParticipant) -> None:
        if p.identity == participant.identity:
            log.info("participant disconnected, ending session")
            disconnect_event.set()

    ctx.room.on("participant_disconnected", _on_participant_disconnected)

    # Start the session, greet the user, then idle until they leave.
    # Pick the opener based on whether they already have a plan — first-
    # time users hear "tell me about your space"; returning users hear
    # "welcome back, want to adjust anything?". The system prompt also
    # branches behavior on the same plan-presence signal.
    await session.start(sprouty, room=ctx.room)
    opener = RETURNING_OPENER if has_existing_plan else FIRST_TIME_OPENER
    log.info(
        "opener selected: %s (plan present: %s)",
        "returning" if has_existing_plan else "first-time",
        has_existing_plan,
    )
    await session.say(opener, allow_interruptions=True)

    await disconnect_event.wait()

    # Final session_end carries the full conversational transcript so the
    # browser can call `generatePlan()` with the user's actual words.
    await _publish_event(
        ctx.room,
        {
            "type": "session_end",
            "transcript": "\n".join(accumulated_user),
            "agent_transcript": "\n".join(accumulated_agent),
        },
    )
    log.info(
        "session ended — %d user turns, %d agent turns",
        len(accumulated_user),
        len(accumulated_agent),
    )


if __name__ == "__main__":
    # `agent_name="sprouty"` opts this worker out of auto-dispatch and into
    # explicit dispatch — the browser-side token (see app/api/livekit/token)
    # carries a RoomConfiguration that names this agent, and LiveKit Cloud
    # routes the room to us by name. Auto-dispatch was unreliable on this
    # project (worker registered fine but never received jobs); explicit
    # dispatch is the documented escape hatch and is guaranteed to fire.
    #
    # Thread-based job execution avoids the macOS Python 3.14 multiprocessing
    # spawn IPC hang where the subprocess never acks initialization.
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="sprouty",
            job_executor_type=JobExecutorType.THREAD,
        )
    )
