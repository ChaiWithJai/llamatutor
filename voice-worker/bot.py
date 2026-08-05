from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from fastapi.responses import JSONResponse
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMContextFrame, TextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.runner.run import app
from pipecat.runner.types import (
    DailyRunnerArguments,
    RunnerArguments,
    SmallWebRTCRunnerArguments,
)
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.tts import OpenAITTSService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams, DailyTransport
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.workers.runner import WorkerRunner

from review_client import ReviewClient

load_dotenv(override=False)
logger.disable("pipecat.services.whisper.base_stt")

GREETING = (
    "Thanks for calling Dharmic Care. This is Maya, the virtual receptionist. "
    "How can I help today?"
)
SAFE_FAILURE = (
    "I could not safely complete that response. Nothing is booked or saved. "
    "Please try again in a moment."
)


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def transcript_history(context: LLMContext) -> list[dict[str, str]]:
    history: list[dict[str, str]] = []
    for message in context.messages:
        role = message.get("role")
        content = message.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            continue
        text = content.strip()
        if text:
            history.append(
                {
                    "speaker": "caller" if role == "user" else "receptionist",
                    "text": text,
                }
            )
    return history[-8:]


class ReviewedReplyProcessor(FrameProcessor):
    def __init__(self, client: ReviewClient, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._client = client
        self._conversation_state: dict[str, Any] | None = None

    async def process_frame(self, frame: Any, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if not isinstance(frame, LLMContextFrame):
            await self.push_frame(frame, direction)
            return

        history = transcript_history(frame.context)
        caller_turns = [turn for turn in history if turn["speaker"] == "caller"]
        if not caller_turns:
            return
        try:
            reviewed = await self._client.review(
                caller_turns[-1]["text"],
                history[:-1],
                self._conversation_state,
            )
            self._conversation_state = reviewed.conversation_state
            await self.push_frame(TextFrame(reviewed.reply))
        except Exception as error:  # noqa: BLE001 - this boundary must fail closed
            logger.warning("review boundary failed closed: {}", type(error).__name__)
            await self.push_frame(TextFrame(SAFE_FAILURE))

    async def cleanup(self) -> None:
        await self._client.close()
        await super().cleanup()


@app.get("/healthz")
async def healthz() -> JSONResponse:
    default_transport = os.getenv("PIPECAT_TRANSPORT", "webrtc")
    ready = all(
        [
            os.getenv("TOGETHER_API_KEY"),
            os.getenv("VOICE_CONTROL_URL"),
            len(os.getenv("VOICE_WORKER_SHARED_SECRET", "")) >= 32,
            default_transport != "daily" or os.getenv("DAILY_API_KEY"),
        ]
    )
    payload = {
        "ready": bool(ready),
        "service": "llamatutor-voice-worker",
        "defaultTransport": default_transport,
        "transports": {
            "webrtc": True,
            "daily": bool(os.getenv("DAILY_API_KEY")),
        },
        "reviewedBeforeSpoken": True,
    }
    return JSONResponse(payload, status_code=200 if ready else 503)


def make_transport(runner_args: RunnerArguments) -> BaseTransport:
    if isinstance(runner_args, DailyRunnerArguments):
        return DailyTransport(
            runner_args.room_url,
            runner_args.token,
            "Maya",
            params=DailyParams(audio_in_enabled=True, audio_out_enabled=True),
        )
    if isinstance(runner_args, SmallWebRTCRunnerArguments):
        connection: SmallWebRTCConnection = runner_args.webrtc_connection
        return SmallWebRTCTransport(
            webrtc_connection=connection,
            params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
        )
    raise RuntimeError(f"unsupported transport: {type(runner_args).__name__}")


async def run_bot(transport: BaseTransport) -> None:
    together_key = required_env("TOGETHER_API_KEY")
    control_url = required_env("VOICE_CONTROL_URL")
    review_secret = required_env("VOICE_WORKER_SHARED_SECRET")
    base_url = os.getenv("TOGETHER_OPENAI_BASE_URL", "https://api.together.xyz/v1")

    stt = OpenAISTTService(
        api_key=together_key,
        base_url=base_url,
        settings=OpenAISTTService.Settings(
            model=os.getenv("TOGETHER_STT_MODEL", "openai/whisper-large-v3"),
            language="en",
        ),
    )
    tts = OpenAITTSService(
        api_key=together_key,
        base_url=base_url,
        settings=OpenAITTSService.Settings(
            model=os.getenv("TOGETHER_TTS_MODEL", "cartesia/sonic-2"),
            voice=os.getenv("TOGETHER_TTS_RECEPTIONIST_VOICE", "laidback woman"),
            language="en",
        ),
    )
    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )
    reviewer = ReviewedReplyProcessor(ReviewClient(control_url, review_secret))
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            reviewer,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        observers=[],
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport: BaseTransport, _client: Any) -> None:
        await worker.queue_frames([TextFrame(GREETING)])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport: BaseTransport, _client: Any) -> None:
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=False, handle_sigterm=True)
    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments) -> None:
    await run_bot(make_transport(runner_args))


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
