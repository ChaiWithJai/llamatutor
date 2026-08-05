from __future__ import annotations

import base64
import json
from collections.abc import AsyncGenerator

import httpx
from pipecat.frames.frames import ErrorFrame, Frame, TTSAudioRawFrame
from pipecat.services.settings import TTSSettings, assert_given
from pipecat.services.tts_service import TTSService
from pipecat.utils.tracing.service_decorators import traced_tts


class TogetherTTSService(TTSService):
    def __init__(
        self,
        api_key: str,
        model: str,
        voice: str,
        base_url: str = "https://api.together.xyz/v1",
        sample_rate: int = 24000,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(
            sample_rate=sample_rate,
            push_start_frame=True,
            push_stop_frames=True,
            settings=TTSSettings(model=model, voice=voice, language="en"),
        )
        self._api_key = api_key
        self._url = f"{base_url.rstrip('/')}/audio/speech"
        self._http = http_client or httpx.AsyncClient(timeout=30)
        self._owns_http = http_client is None

    def can_generate_metrics(self) -> bool:
        return True

    @traced_tts
    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        payload = {
            "model": assert_given(self._settings.model),
            "input": text,
            "voice": assert_given(self._settings.voice),
            "response_format": "raw",
            "response_encoding": "pcm_s16le",
            "sample_rate": self.sample_rate,
            "language": "en",
            "stream": True,
        }
        try:
            async with self._http.stream(
                "POST",
                self._url,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json=payload,
            ) as response:
                if response.status_code != 200:
                    yield ErrorFrame(error=f"Together TTS returned {response.status_code}")
                    return
                await self.start_tts_usage_metrics(text)
                async for line in response.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    event = json.loads(line[6:])
                    if event.get("type") != "conversation.item.audio_output.delta":
                        continue
                    audio = base64.b64decode(event["delta"], validate=True)
                    if audio:
                        await self.stop_ttfb_metrics()
                        yield TTSAudioRawFrame(
                            audio,
                            self.sample_rate,
                            1,
                            context_id=context_id,
                        )
        except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as error:
            yield ErrorFrame(error=f"Together TTS failed: {type(error).__name__}")

    async def cleanup(self) -> None:
        if self._owns_http:
            await self._http.aclose()
        await super().cleanup()
