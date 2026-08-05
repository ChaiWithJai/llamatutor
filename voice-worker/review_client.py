from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class ReviewedTurn:
    reply: str
    route: str
    conversation_complete: bool
    conversation_state: dict[str, Any]


def build_turn_payload(
    message: str,
    history: list[dict[str, str]],
    conversation_state: dict[str, Any] | None,
) -> dict[str, Any]:
    caller_turns = sum(turn["speaker"] == "caller" for turn in history)
    turn_number = min(caller_turns + 1, 6)
    return {
        "message": message.strip(),
        "history": history[-8:],
        "turnNumber": turn_number,
        "forceClose": turn_number >= 6,
        **(
            {"conversationState": conversation_state}
            if conversation_state is not None
            else {}
        ),
    }


class ReviewClient:
    def __init__(
        self,
        endpoint: str,
        secret: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if len(secret) < 32:
            raise ValueError(
                "VOICE_WORKER_SHARED_SECRET must be at least 32 characters"
            )
        self._endpoint = endpoint
        self._secret = secret
        self._client = client or httpx.AsyncClient(timeout=20.0)
        self._owns_client = client is None

    async def review(
        self,
        message: str,
        history: list[dict[str, str]],
        conversation_state: dict[str, Any] | None,
    ) -> ReviewedTurn:
        response = await self._client.post(
            self._endpoint,
            headers={"Authorization": f"Bearer {self._secret}"},
            json=build_turn_payload(message, history, conversation_state),
        )
        response.raise_for_status()
        payload = response.json()
        if (
            payload.get("reviewed") is not True
            or not str(payload.get("reply", "")).strip()
        ):
            raise ValueError("control plane returned an unreviewed or empty turn")
        state = payload.get("conversationState")
        if not isinstance(state, dict):
            raise TypeError("control plane omitted conversation state")
        return ReviewedTurn(
            reply=str(payload["reply"]).strip(),
            route=str(payload.get("route", "unknown")),
            conversation_complete=bool(payload.get("conversationComplete", False)),
            conversation_state=state,
        )

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
