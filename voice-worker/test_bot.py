import unittest

from pipecat.frames.frames import InterruptionFrame, LLMContextFrame, TextFrame
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.tests.utils import run_test

from bot import ReviewedReplyProcessor, SAFE_FAILURE
from review_client import ReviewedTurn


class FakeReviewClient:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error

    async def review(self, _message, _history, _state):
        if self.error:
            raise self.error
        return self.result

    async def close(self):
        pass


class ReviewedReplyProcessorTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_reviewed_text_enters_the_speech_leg(self):
        reviewed = ReviewedTurn(
            reply="Approved response.",
            route="routine",
            conversation_complete=False,
            conversation_state={"version": 2},
        )
        processor = ReviewedReplyProcessor(FakeReviewClient(result=reviewed))
        context = LLMContext([{"role": "user", "content": "Please help."}])

        down, _ = await run_test(
            processor,
            frames_to_send=[LLMContextFrame(context)],
            expected_down_frames=[TextFrame],
        )

        self.assertEqual(down[0].text, "Approved response.")

    async def test_control_plane_failure_releases_only_owned_safe_text(self):
        processor = ReviewedReplyProcessor(
            FakeReviewClient(error=RuntimeError("control unavailable"))
        )
        context = LLMContext([{"role": "user", "content": "Please help."}])

        down, _ = await run_test(
            processor,
            frames_to_send=[LLMContextFrame(context)],
            expected_down_frames=[TextFrame],
        )

        self.assertEqual(down[0].text, SAFE_FAILURE)

    async def test_interruption_reaches_the_output_leg_to_flush_approved_audio(self):
        processor = ReviewedReplyProcessor(FakeReviewClient())

        await run_test(
            processor,
            frames_to_send=[InterruptionFrame()],
            expected_down_frames=[InterruptionFrame],
        )


if __name__ == "__main__":
    unittest.main()
