"""
Custom LiveKit TTS plugin for Mistral's Voxtral TTS API.

Mistral's TTS isn't OpenAI-compatible:
  - Request uses `voice_id` instead of `voice`
  - Response is a JSON envelope with base64-encoded audio (key `audio_data`),
    not raw audio bytes streamed back

…so the standard `livekit-plugins-openai` TTS class can't be aimed at it via
a simple `base_url` override. This module wraps the Mistral endpoint with the
exact contract LiveKit's `tts.TTS` base class expects, so it slots into
`AgentSession(tts=...)` the same way any other plugin would.

Sponsor narrative: keeps Voxtral in the critical path as the third Mistral
product (alongside Voxtral STT + Mistral Small LLM).

Endpoint:  POST {base_url}/audio/speech
Request:   { model, input, voice_id, response_format }
Response:  { audio_data: "<base64>", ... }

Pricing:   $0.016 per 1k characters (per https://mistral.ai/news/voxtral-tts)

Usage:
    from agent.voxtral_tts import VoxtralTTS

    tts = VoxtralTTS(
        api_key=os.environ["MISTRAL_API_KEY"],
        voice_id=os.environ.get("MISTRAL_TTS_VOICE", "oliver"),
    )

    session = AgentSession(stt=..., llm=..., tts=tts, vad=...)
"""

from __future__ import annotations

import base64
from typing import Any

import httpx
from livekit.agents import (
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    APITimeoutError,
    tts,
)
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS

DEFAULT_MODEL = "voxtral-mini-tts-2603"
DEFAULT_BASE_URL = "https://api.mistral.ai/v1"
DEFAULT_RESPONSE_FORMAT = "mp3"
# Voxtral preset voices (per the public news page) include Marie, Oliver,
# Nick, Margaret, Sanchit, Angele, Gustavo, Khyathi, Yassir, Patrick. The
# exact `voice_id` casing isn't documented publicly — if `oliver` 400s,
# try `Oliver`, then list voices via `python -m agent.voxtral_tts list-voices`.
DEFAULT_VOICE = "oliver"

# 24kHz mono is a sensible default for the LiveKit emitter target. The
# upstream MP3 is decoded by `av` regardless of declared sample rate.
SAMPLE_RATE = 24_000
NUM_CHANNELS = 1


class VoxtralTTS(tts.TTS):
    """LiveKit TTS plugin for Mistral's Voxtral TTS endpoint."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str = DEFAULT_MODEL,
        voice_id: str = DEFAULT_VOICE,
        base_url: str = DEFAULT_BASE_URL,
        response_format: str = DEFAULT_RESPONSE_FORMAT,
    ) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
        )
        if not api_key:
            raise ValueError(
                "VoxtralTTS requires `api_key` — pass it explicitly or "
                "set MISTRAL_API_KEY in agent/.env"
            )
        self._api_key = api_key
        self._model = model
        self._voice_id = voice_id
        self._base_url = base_url.rstrip("/")
        self._response_format = response_format
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(30.0, connect=10.0),
        )

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.ChunkedStream:
        return _VoxtralChunkedStream(tts=self, input_text=text, conn_options=conn_options)

    async def aclose(self) -> None:
        await self._client.aclose()


class _VoxtralChunkedStream(tts.ChunkedStream):
    """Single-shot synthesis: POST text → JSON with base64 audio → push frames."""

    def __init__(
        self,
        *,
        tts: VoxtralTTS,
        input_text: str,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts: VoxtralTTS = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        try:
            response = await self._tts._client.post(
                "/audio/speech",
                json={
                    "model": self._tts._model,
                    "input": self.input_text,
                    "voice_id": self._tts._voice_id,
                    "response_format": self._tts._response_format,
                },
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
        except httpx.TimeoutException:
            raise APITimeoutError() from None
        except httpx.HTTPStatusError as e:
            raise APIStatusError(
                f"Voxtral TTS error: {e.response.text[:400]}",
                status_code=e.response.status_code,
                request_id=e.response.headers.get("x-request-id"),
                body=e.response.text,
            ) from None
        except Exception as e:
            raise APIConnectionError() from e

        # Defensive field lookup — the docs reference `audio_data`, but other
        # plausible names won't surprise us if Mistral renames the field
        # post-GA.
        audio_b64 = (
            payload.get("audio_data")
            or payload.get("audio")
            or payload.get("data")
        )
        if not audio_b64 or not isinstance(audio_b64, str):
            raise APIConnectionError(
                f"Voxtral TTS response missing audio field. "
                f"Top-level keys: {list(payload.keys())}"
            )

        try:
            audio_bytes = base64.b64decode(audio_b64)
        except Exception as e:
            raise APIConnectionError(f"Voxtral TTS returned malformed base64: {e}") from None

        output_emitter.initialize(
            request_id=str(payload.get("id") or ""),
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
            mime_type=f"audio/{self._tts._response_format}",
        )
        output_emitter.push(audio_bytes)
        output_emitter.flush()


# ─── one-off voice discovery helper ──────────────────────────────────
#
# Run with:  python -m agent.voxtral_tts list-voices
# Prints every voice id+name on the account so you can pick a working
# `MISTRAL_TTS_VOICE`. Useful when the default `oliver` returns 400 or
# you want a different language/persona.


def _list_voices(api_key: str, base_url: str = DEFAULT_BASE_URL) -> None:
    """Print available voice IDs to stdout (sync, for CLI use)."""
    import json
    import sys

    try:
        res = httpx.get(
            f"{base_url.rstrip('/')}/audio/voices",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15.0,
        )
        res.raise_for_status()
    except httpx.HTTPStatusError as e:
        print(f"List voices failed ({e.response.status_code}): {e.response.text}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(res.json(), indent=2))


if __name__ == "__main__":
    import os
    import sys

    if len(sys.argv) >= 2 and sys.argv[1] == "list-voices":
        from dotenv import load_dotenv

        load_dotenv()
        key = os.environ.get("MISTRAL_API_KEY")
        if not key:
            print("MISTRAL_API_KEY not set in env / agent/.env", file=sys.stderr)
            sys.exit(1)
        _list_voices(key)
    else:
        print(
            "Usage: python -m agent.voxtral_tts list-voices\n"
            "       (lists voice IDs available on your Mistral account)",
            file=sys.stderr,
        )
        sys.exit(1)
