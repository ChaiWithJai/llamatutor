import unittest

import httpx

from review_client import ReviewClient, build_turn_payload


class ReviewClientTests(unittest.IsolatedAsyncioTestCase):
    def test_payload_is_bounded_and_forces_the_sixth_turn_closed(self):
        history = [
            {
                "speaker": "caller" if index % 2 == 0 else "receptionist",
                "text": str(index),
            }
            for index in range(11)
        ]
        payload = build_turn_payload(" latest ", history, {"version": 2})
        self.assertEqual(payload["message"], "latest")
        self.assertEqual(len(payload["history"]), 8)
        self.assertEqual(payload["turnNumber"], 6)
        self.assertTrue(payload["forceClose"])

    async def test_accepts_only_explicitly_reviewed_control_plane_text(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.headers["authorization"], f"Bearer {'s' * 32}")
            return httpx.Response(
                200,
                json={
                    "reviewed": True,
                    "reply": "A reviewed reply.",
                    "route": "routine",
                    "conversationComplete": False,
                    "conversationState": {"version": 2, "turnCount": 1},
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = ReviewClient("https://control.test/voice-turn", "s" * 32, http)
            turn = await client.review("hello", [], None)
        self.assertEqual(turn.reply, "A reviewed reply.")
        self.assertEqual(turn.route, "routine")

    async def test_rejects_unreviewed_text(self):
        async def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"reviewed": False, "reply": "unchecked"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = ReviewClient("https://control.test/voice-turn", "s" * 32, http)
            with self.assertRaises(ValueError):
                await client.review("hello", [], None)


if __name__ == "__main__":
    unittest.main()
