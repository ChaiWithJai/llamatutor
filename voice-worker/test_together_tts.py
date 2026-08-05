import asyncio
import base64
import json
import unittest

import httpx
from pipecat.frames.frames import ErrorFrame, TTSAudioRawFrame

from together_tts import TogetherTTSService


class TogetherTTSServiceTests(unittest.TestCase):
    def test_streams_together_voice_audio(self):
        audio = b"\x01\x02\x03\x04"
        event = {
            "type": "conversation.item.audio_output.delta",
            "delta": base64.b64encode(audio).decode(),
        }

        async def run():
            def handler(request: httpx.Request) -> httpx.Response:
                body = json.loads(request.content)
                self.assertEqual(body["voice"], "laidback woman")
                self.assertEqual(body["response_format"], "raw")
                self.assertEqual(body["response_encoding"], "pcm_s16le")
                stream = f"data: {json.dumps(event)}\n\ndata: [DONE]\n\n"
                return httpx.Response(200, content=stream.encode())

            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
                service = TogetherTTSService(
                    "test-key",
                    "cartesia/sonic-2",
                    "laidback woman",
                    http_client=http,
                )
                return [frame async for frame in service.run_tts("Hello", "turn-1")]

        frames = asyncio.run(run())
        self.assertEqual(len(frames), 1)
        self.assertIsInstance(frames[0], TTSAudioRawFrame)
        self.assertEqual(frames[0].audio, audio)

    def test_reports_provider_failure_without_audio(self):
        async def run():
            transport = httpx.MockTransport(lambda _request: httpx.Response(429))
            async with httpx.AsyncClient(transport=transport) as http:
                service = TogetherTTSService(
                    "test-key",
                    "cartesia/sonic-2",
                    "laidback woman",
                    http_client=http,
                )
                return [frame async for frame in service.run_tts("Hello", "turn-1")]

        frames = asyncio.run(run())
        self.assertEqual(len(frames), 1)
        self.assertIsInstance(frames[0], ErrorFrame)
