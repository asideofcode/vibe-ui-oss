from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

from acp.schema import AgentMessageChunk, ToolCallProgress, ToolCallStart
import pytest

from tests.stubs.fake_client import FakeClient
from vibe.acp.commands.controller import AcpCommandController
from vibe.acp.commands.registry import AcpCommandRegistry
from vibe.acp.exceptions import InternalError
from vibe.acp.session import AcpSession
from vibe.app_server.protocol import (
    AppServerResponseError,
    ProtocolError,
    ProtocolErrorCode,
    SessionContextEditResponse,
)
from vibe.app_server.session import AppServerSession


def _edit(
    operation: str = "replace",
    message_index: int = 0,
    message_type: str = "assistant",
    replacement_text: str | None = None,
) -> SimpleNamespace:
    """One entry of the response's ``edits`` list, as the controller reads it."""
    return SimpleNamespace(
        operation=operation,
        message_index=message_index,
        message_type=message_type,
        original_text="the bothersome phrase",
        replacement_text=replacement_text,
        reason="the phrase steers later replies wrong",
    )


def _controller_and_session(
    *, has_history: bool = False, context_edit: AsyncMock | None = None
) -> tuple[AcpCommandController, AcpSession, FakeClient]:
    client = FakeClient()

    async def send_config_options(_session: AcpSession) -> None:
        return None

    controller = AcpCommandController(lambda: client, send_config_options)
    app_server = MagicMock(spec=AppServerSession)
    app_server.resources = MagicMock()
    app_server.state.latest_turn = None
    # The controller only asks whether there is anything to edit; the shape
    # of the entries it would read does not matter to it.
    entry: Any = MagicMock()
    app_server.history = [entry] if has_history else []
    if context_edit is not None:
        app_server.context_edit = context_edit
    session = AcpSession(
        session_id="session",
        app_server=cast(AppServerSession, app_server),
        cwd=Path.cwd(),
        commands=AcpCommandRegistry(),
    )
    return controller, session, client


def _tool_call_chapters(
    client: FakeClient,
) -> list[tuple[str, ToolCallStart | ToolCallProgress]]:
    return [
        (update.update.title, update.update)
        for update in client._session_updates
        if isinstance(update.update, ToolCallStart | ToolCallProgress)
    ]


def _agent_messages(client: FakeClient) -> list[str]:
    return [
        notification.update.content.text
        for notification in client._session_updates
        if isinstance(notification.update, AgentMessageChunk)
        and hasattr(notification.update.content, "text")
    ]


@pytest.mark.asyncio
async def test_context_edit_without_history_says_so() -> None:
    controller, session, client = _controller_and_session()

    await controller.execute(session, "/context-denoising", "message-1")

    assert _agent_messages(client) == ["No conversation history to edit yet."]


@pytest.mark.asyncio
async def test_context_edit_reports_the_edits_the_model_applied() -> None:
    response = cast(
        SessionContextEditResponse,
        SimpleNamespace(
            changed=True,
            edits=[
                _edit("replace", replacement_text="a neutral phrasing"),
                _edit("remove", message_index=2, message_type="user"),
            ],
        ),
    )
    context_edit = AsyncMock(return_value=response)
    controller, session, client = _controller_and_session(
        has_history=True, context_edit=context_edit
    )

    await controller.execute(session, "/context-denoising fix my typos", "m-1")

    context_edit.assert_awaited_once_with("fix my typos")
    chapters = _tool_call_chapters(client)
    assert [title for title, _ in chapters] == [
        "Denoising conversation context...",
        "Denoised conversation context",
    ]
    progress = cast(ToolCallProgress, chapters[1][1])
    text = progress.content[0].content.text
    assert "1 snippet replaced" in text
    assert "1 snippet removed" in text
    assert progress.status == "completed"


@pytest.mark.asyncio
async def test_context_edit_with_no_edits_needed_says_the_context_is_unchanged() -> (
    None
):
    response = cast(
        SessionContextEditResponse, SimpleNamespace(changed=False, edits=[])
    )
    context_edit = AsyncMock(return_value=response)
    controller, session, client = _controller_and_session(
        has_history=True, context_edit=context_edit
    )

    await controller.execute(session, "/context-denoising", "m-1")

    progress = _tool_call_chapters(client)[-1][1]
    assert (
        progress.content[0].content.text
        == "No messages needed edits; the conversation is unchanged."
    )


@pytest.mark.asyncio
async def test_context_edit_when_the_backend_refuses_reports_the_failure() -> None:
    context_edit = AsyncMock(
        side_effect=AppServerResponseError(
            ProtocolError(
                code=ProtocolErrorCode.INVALID_PARAMS,
                message="The edit reply was not a JSON array.",
            )
        )
    )
    controller, session, client = _controller_and_session(
        has_history=True, context_edit=context_edit
    )

    with pytest.raises(InternalError):
        await controller.execute(session, "/context-denoising", "m-1")

    progress = _tool_call_chapters(client)[-1][1]
    assert progress.status == "failed"
    assert progress.raw_output == "The edit reply was not a JSON array."
