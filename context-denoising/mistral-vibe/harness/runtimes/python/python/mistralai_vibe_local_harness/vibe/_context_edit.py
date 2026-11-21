"""``/context-denoising``: one utility model call that rewrites stored history messages.

The operation reads the Session's committed interop history, renders the
editable user and assistant messages as a numbered transcript, and asks the
session's active model — as a utility completion, outside any turn, without
tools — which textual signals need edits. The model answers with a JSON
object (schema: ConversationContextRepair) whose edits name snippets;
the Harness verifies the edit targets, applies them to the interop
history, and replaces the Session's context, like a rewind replaces it with a
truncated transcript.

Every run reads the latest saved conversation, including edits from earlier
runs and the newest replies. Plain text in user and assistant messages is
editable, including text alongside reasoning and tool calls. Reasoning,
tool calls, tool results, injected context, system prompts, and images stay
unchanged; only the selected text snippets are rewritten.

Swapping the editor: ``CONTEXT_EDIT_SYSTEM_PROMPT`` owns the instructions the
editor model runs under (it may carry ``{{conversation_history}}`` and
``{{what_to_denoise}}`` placeholders, filled from the session and the slash
command's arguments) and ``CONTEXT_EDIT_OUTPUT_INSTRUCTIONS`` owns the schema
of the reply it must produce. ``parse_edits`` verifies that reply. Everything
else — the transcript, the numbering, the application — is shared plumbing
that does not change with the prompt.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
import dataclasses
from dataclasses import dataclass
import json
import logging
import time

from mistralai_vibe_local_harness.protocol import (
    RustSystemMessage,
    RustTextContentBlock,
    RustUserMessage,
)
from mistralai_vibe_local_harness.session_protocol import JsonObject
from mistralai_vibe_local_harness.vibe._completion import report_request_sent
from mistralai_vibe_local_harness.vibe._credentials import (
    ProviderAuthRequired,
    ProviderCredentialSnapshot,
)
from mistralai_vibe_local_harness.vibe._projection import (
    content_is_injected,
    displayed_user_content,
)
from mistralai_vibe_local_harness.vibe._runtime_config import (
    LocalRuntimeAdapterConfig,
    ProviderRetry,
)
from mistralai_vibe_local_harness.vibe._storage import (
    InteropAssistantContentPartV1,
    InteropAssistantMessageV1,
    InteropHistoryMessageV1,
    InteropUserMessageV1,
    RustTextContentBlock as StorageTextBlock,
)
from mistralai_vibe_local_harness.vibe._utility_completion import (
    CompletionFn,
    UtilityCompletionError,
    execute_utility_completion,
)

logger = logging.getLogger(__name__)

# The editor model's system prompt. Isolated so a different editor — another
# wording, another policy — is one constant away. It embeds the conversation
# under ``{{conversation_history}}`` and the user's complaint under
# ``{{what_to_denoise}}``; ``render_edit_request`` fills both.
CONTEXT_EDIT_SYSTEM_PROMPT = r"""# System Prompt: Conversation Context Repair Agent

## Role

You are a **Conversation Context Repair Agent**, responsible for diagnosing and proposing targeted modifications to the conversation history used by an LLM-based assistant or autonomous agent.

The user is having a conversation with the LLM where some of the LLM's responses are outputting some words which don't require to be there. These could be some assumptions that the LLM has made by correctly or incorrectly inferring the user intent. Which is fine, but now the user is facing this issue or getting irritated by the presence of these things or signals in the assistant response.

So here your role is to figure out what signals in the given conversation history are creating this problem and then propose edits to messages of the conversation. These edits could either replace a word, sentence with something else or completely remove or mask out certain words, phrases, sentences. These edits will then be applied programmatically to the original conversations, so the user doesn't face this issue (tbh the issue is because of the autoregressive nature of the LLMs and if we used certain words, or sentences before, the later conversation might take that as a signal and generate w\.r\.t\. it, we kind of just need to find those minimal signals and so replacement can be carried out which doesn't bring the underlying issue, so during your thinking it's always recommended to think about what the issue is and what signals are bringing these issues).

## Conversation History

{{conversation_history}}

## What to Denoise/ or the user issue

{{what_to_denoise}}

## Examples

### Example 1: An Earlier Instruction Influencing Unrelated Responses

**Conversation history:**

- **User:** "Explain this concept like I'm a five-year-old."
- **Assistant:** "Sure, I'll keep things simple and explain everything in a way a child can understand."
- **User:** "Now let's discuss the mathematical foundations of neural networks."
- **Assistant:** "Imagine your brain is like a big box of colourful building blocks!"

**What to denoise:**

"The assistant keeps explaining everything like I'm a child, even when I'm asking technical questions."

**Reason:**

The assistant's earlier statement, "I'll keep things simple and explain everything in a way a child can understand", could be influencing later responses. The wording generalises a request intended for one explanation into a broader conversational preference.

---

### Example 2: An Unnecessary Assumption Repeated Throughout the Conversation

**Conversation history:**

- **User:** "I'm thinking of organising a small event for my colleagues."
- **Assistant:** "Since you're planning a casual event, let's consider some fun activities."
- **User:** "We should invite around 40 people."
- **Assistant:** "For your casual event, we could arrange some group activities."
- **User:** "What kind of venue should we book?"
- **Assistant:** "Since it's a casual gathering, a café or an informal space would be ideal."

**What to denoise:**

"The assistant keeps assuming the event is casual and recommending things accordingly. I never said it was casual."

**Reason:**

The word "casual" was introduced by the assistant without confirmation from the user. It subsequently appeared in multiple responses, reinforcing the assumption and influencing recommendations.

---

### Example 3: Repeated Words and Phrases Creating an Unwanted Response Pattern

**Conversation history:**

- **User:** "I'm struggling to understand this topic."
- **Assistant:** "Don't worry, you're doing great! Let's work through it."
- **User:** "Can you explain the next part?"
- **Assistant:** "Absolutely! You're doing great, and this is a great question."
- **User:** "What happens if we change this variable?"
- **Assistant:** "Great question! You're doing great. Let's explore that."
- **User:** "What is the relationship between these two variables?"
- **Assistant:** "That's another great question! You're doing great."

**What to denoise:**

"The assistant keeps telling me I'm doing great and calling everything a great question. It's getting irritating, and I want it to stop."

**Reason:**

The repeated phrases "You're doing great" and "Great question" appear throughout the assistant's earlier messages. These recurring patterns may influence subsequent token generation and encourage similar phrasing.

The goal is not to introduce additional instructions telling the assistant to stop using those phrases, but to reduce the signals already present in the conversation.

These examples demonstrate different ways contextual signals can influence later responses. The problematic signals may come from the user's messages, the assistant's messages, or patterns repeated across multiple turns."""

CONVERSATION_HISTORY_PLACEHOLDER = "{{conversation_history}}"
WHAT_TO_DENOISE_PLACEHOLDER = "{{what_to_denoise}}"

# The JSON Schema the editor's reply must conform to - enforced twice: once
# in the prompt (the model sees it verbatim) and once in ``parse_edits``,
# which rejects any reply that violates it. ``message_index`` is the
# ``[number]`` label the transcript numbers; ``replacement_text`` rides
# ``replace`` and ``mask`` and must be absent for ``remove``.
CONTEXT_EDIT_REPLY_SCHEMA = r"""
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ConversationContextRepair",
  "type": "object",
  "additionalProperties": false,
  "required": ["edits"],
  "properties": {
    "edits": {
      "type": "array",
      "description": "List of proposed edits to the conversation history. Return an empty array if no edits are needed.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "reason",
          "message_index",
          "message_type",
          "operation",
          "original_text"
        ],
        "properties": {
          "message_index": {
            "type": "integer",
            "minimum": 0,
            "description": "Zero-based index of the message in the conversation history."
          },
          "message_type": {
            "type": "string",
            "enum": ["assistant", "user"],
            "description": "Role of the message containing the text to edit."
          },
          "operation": {
            "type": "string",
            "enum": ["replace", "remove", "mask"],
            "description": "Operation to perform on the identified text."
          },
          "original_text": {
            "type": "string",
            "minLength": 1,
            "description": "Exact word, phrase, or sentence from the original message to edit."
          },
          "replacement_text": {
            "type": "string",
            "minLength": 1,
            "description": "New text for replace, or masking text for mask."
          },
          "reason": {
            "type": "string",
            "description": "Why this textual signal may be contributing to the reported issue."
          }
        },
        "allOf": [
          {
            "if": {
              "properties": {
                "operation": {
                  "enum": ["replace", "mask"]
                }
              },
              "required": ["operation"]
            },
            "then": {
              "required": ["replacement_text"]
            }
          },
          {
            "if": {
              "properties": {
                "operation": {
                  "const": "remove"
                }
              },
              "required": ["operation"]
            },
            "then": {
              "not": {
                "required": ["replacement_text"]
              }
            }
          }
        ]
      }
    }
  }
}
""".strip()

# The output-format half of the contract, sent as the user message: the
# system prompt names the task, this names the shape of the answer.
# ``message_index`` names the message's ``[number]`` label in the transcript.
CONTEXT_EDIT_OUTPUT_INSTRUCTIONS = (
    "The transcript is the latest saved conversation, including previous "
    "denoising passes and the most recent messages. Edit this current wording; "
    "keep earlier denoising changes unless the user explicitly asks to undo them. "
    "Decide which textual signals in the numbered transcript need edits. "
    "Respond with a single JSON object that conforms to the schema below, "
    "wrapped in <edits></edits> tags and nothing else, for example:\n"
    "\n"
    "<edits>\n"
    '  {"edits": [\n'
    '    {"reason": "the phrase steers later replies wrong", '
    '"message_index": 0, "message_type": "assistant", "operation": "replace", '
    '"original_text": "the phrase to change", '
    '"replacement_text": "the phrase to use instead"},\n'
    '    {"reason": "the phrase steers later replies wrong", '
    '"message_index": 2, "message_type": "user", "operation": "remove", '
    '"original_text": "the phrase to strike"}\n'
    "  ]}\n"
    "</edits>\n"
    "\n"
    "The reply must conform to this JSON Schema (additional properties are "
    'rejected; "replacement_text" is required for "replace" and "mask" and '
    'forbidden for "remove"; every "original_text" must appear exactly in '
    "the named message):\n"
    "\n"
    f"{CONTEXT_EDIT_REPLY_SCHEMA}\n"
    "\n"
    '"message_index" is the message\'s [number] label from the transcript '
    'and "message_type" its role. Prefer several small edits over one '
    "whole-message rewrite: replace or mask just the signal, and keep "
    'surrounding wording intact. Output an empty "edits" array when no edit '
    "is needed."
)

EDITS_OPEN = "<edits>"
EDITS_CLOSE = "</edits>"

TRANSCRIPT_OPEN = "<conversation_transcript>"
TRANSCRIPT_CLOSE = "</conversation_transcript>"
EDIT_INSTRUCTIONS_OPEN = "<edit_instructions>"
EDIT_INSTRUCTIONS_CLOSE = "</edit_instructions>"

DEFAULT_EDIT_INSTRUCTIONS = (
    "Clean up the context so the conversation continues effectively."
)

# The edit request returns JSON, not prose: generous, but bounded.
EDIT_MAX_TOKENS = 32_768
EDIT_TIMEOUT_SECONDS = 120.0


class ContextEditError(RuntimeError):
    """A context edit that cannot run, or a reply that cannot be applied.

    The message is user-facing: the ACP command shows it as the reply to the
    slash command. ``unchanged`` says the Session's history was left as it
    was, which is every failure mode here — no edit is applied unless every
    edit verifies.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.unchanged = True


@dataclass(frozen=True, slots=True)
class ContextEdit:
    """One edit the editor model predicted, verified against the transcript.

    Mirrors one item of the reply schema's ``edits`` array: a snippet-level
    operation on one editable message, not a whole-message rewrite —
    ``original_text`` is the exact text to touch, and ``replacement_text``
    rides ``replace`` and ``mask``.
    """

    message_index: int
    message_type: str  # "assistant" or "user"
    operation: str  # "replace", "remove", or "mask"
    original_text: str
    replacement_text: str | None = None
    reason: str = ""

    def report(self) -> JsonObject:
        return {
            "message_index": self.message_index,
            "message_type": self.message_type,
            "operation": self.operation,
            "original_text": self.original_text,
            "replacement_text": self.replacement_text,
            "reason": self.reason,
        }


@dataclass(frozen=True, slots=True)
class EditableMessage:
    """The position of an editable message: where it sits in both views.

    ``position`` indexes the interop history; ``number`` is the transcript
    number the model's edits name. The public projection entry that renders
    the message is patched separately, by matching ordinals.
    """

    position: int
    number: int
    text: str
    role: str


def editable_text(message: InteropHistoryMessageV1) -> str | None:
    """Return editable visible text without changing reasoning or tool calls."""
    if isinstance(message, InteropUserMessageV1):
        if content_is_injected(message.content):
            return None
        content = displayed_user_content(message.content)
    elif isinstance(message, InteropAssistantMessageV1):
        content = [
            part.content
            for part in message.parts
            if isinstance(part, InteropAssistantContentPartV1)
        ]
    else:
        return None
    if len(content) != 1 or not isinstance(content[0], StorageTextBlock):
        return None
    return content[0].text


def editable_messages(
    history: Sequence[InteropHistoryMessageV1],
) -> list[EditableMessage]:
    """The editable messages, in order, with their transcript numbers."""
    editable = []
    number = 0
    for position, message in enumerate(history):
        text = editable_text(message)
        if text is None or not text.strip():
            continue
        role = "user" if isinstance(message, InteropUserMessageV1) else "assistant"
        editable.append(
            EditableMessage(position=position, number=number, text=text, role=role)
        )
        number += 1
    return editable


def build_transcript(history: Sequence[InteropHistoryMessageV1]) -> str:
    """The numbered transcript the editor model reads."""
    lines = [
        f"[{message.number}] {'User' if message.role == 'user' else 'Assistant'}:"
        f" {message.text}"
        for message in editable_messages(history)
    ]
    return "\n".join(lines)


def build_request(transcript: str, instructions: str) -> str:
    """The user message for a system prompt that carries no placeholders."""
    goal = instructions.strip() or DEFAULT_EDIT_INSTRUCTIONS
    return (
        f"{TRANSCRIPT_OPEN}\n{transcript}\n{TRANSCRIPT_CLOSE}\n\n"
        f"{EDIT_INSTRUCTIONS_OPEN}\n{goal}\n{EDIT_INSTRUCTIONS_CLOSE}\n\n"
        f"{CONTEXT_EDIT_OUTPUT_INSTRUCTIONS}"
    )


def render_edit_request(transcript: str, instructions: str) -> tuple[str, str]:
    """The (system, user) messages of the edit completion.

    A prompt with the placeholders gets the transcript and the user's
    instructions substituted in place; the user message then only carries the
    output contract. A prompt without them keeps its text whole and gets the
    transcript and instructions in the user message instead, so a swapped
    prompt shapes the request without breaking it.
    """
    goal = instructions.strip() or DEFAULT_EDIT_INSTRUCTIONS
    system = CONTEXT_EDIT_SYSTEM_PROMPT
    parts: list[str] = []
    if CONVERSATION_HISTORY_PLACEHOLDER in system:
        system = system.replace(CONVERSATION_HISTORY_PLACEHOLDER, transcript)
    else:
        parts.append(f"{TRANSCRIPT_OPEN}\n{transcript}\n{TRANSCRIPT_CLOSE}")
    if WHAT_TO_DENOISE_PLACEHOLDER in system:
        system = system.replace(WHAT_TO_DENOISE_PLACEHOLDER, goal)
    else:
        parts.append(f"{EDIT_INSTRUCTIONS_OPEN}\n{goal}\n{EDIT_INSTRUCTIONS_CLOSE}")
    parts.append(CONTEXT_EDIT_OUTPUT_INSTRUCTIONS)
    return system, "\n\n".join(parts)


def parse_edits(output: str) -> list[ContextEdit]:
    """Parse and verify the editor model's reply into its edits.

    The reply must conform to ``CONTEXT_EDIT_REPLY_SCHEMA``: a JSON object
    with an ``edits`` array (a bare array is tolerated), wrapped in
    ``<edits>`` tags or a JSON code fence. Every edit is checked against
    the schema's rules — required fields, the enums, ``additionalProperties:
    false``, and ``replacement_text``'s presence for ``replace``/``mask``
    and absence for ``remove`` — and any violation fails the whole reply,
    which closes the edit with the history untouched.
    """
    payload = output.strip()
    if EDITS_OPEN in payload and EDITS_CLOSE in payload:
        start = payload.index(EDITS_OPEN) + len(EDITS_OPEN)
        end = payload.index(EDITS_CLOSE)
        payload = payload[start:end].strip()
    if not payload:
        return []
    if payload.startswith("```"):
        payload = payload.split("\n", 1)[-1]
        payload = payload.rsplit("```", 1)[0].strip()
    try:
        values = json.loads(payload)
    except json.JSONDecodeError as error:
        raise ContextEditError(f"The edit reply was not valid JSON: {error}") from error
    if isinstance(values, dict):
        values = values.get("edits")
        if values is None:
            raise ContextEditError('The edit reply must carry an "edits" array.')
    if not isinstance(values, list):
        raise ContextEditError('The edit reply must carry an "edits" array.')
    allowed = {
        "reason",
        "message_index",
        "message_type",
        "operation",
        "original_text",
        "replacement_text",
    }
    edits: list[ContextEdit] = []
    for value in values:
        if not isinstance(value, dict):
            raise ContextEditError("Each edit must be a JSON object.")
        unknown = set(value) - allowed
        if unknown:
            raise ContextEditError(
                "An edit carries a property the schema does not allow: "
                f"{sorted(unknown)[0]!r}."
            )
        for field in (
            "reason",
            "message_index",
            "message_type",
            "operation",
            "original_text",
        ):
            if field not in value:
                raise ContextEditError(f"An edit is missing its {field!r} field.")
        index = value["message_index"]
        message_type = value["message_type"]
        operation = value["operation"]
        original = value["original_text"]
        reason = value["reason"]
        replacement = value.get("replacement_text")
        if not isinstance(index, int) or isinstance(index, bool) or index < 0:
            raise ContextEditError(
                f"An edit names a message_index that is not a number: {index!r}"
            )
        if message_type not in ("assistant", "user"):
            raise ContextEditError(
                "An edit names a message_type that is neither "
                f'"assistant" nor "user": {message_type!r}'
            )
        if operation not in ("replace", "remove", "mask"):
            raise ContextEditError(
                'An edit names an operation that is not "replace", "remove" '
                f'or "mask": {operation!r}'
            )
        if not isinstance(original, str) or not original:
            raise ContextEditError("An edit names empty or non-textual original_text.")
        if not isinstance(reason, str):
            raise ContextEditError("An edit's reason must be text.")
        if operation in ("replace", "mask"):
            if not isinstance(replacement, str) or not replacement:
                raise ContextEditError(
                    f"A {operation} edit must carry replacement_text."
                )
        elif replacement is not None:
            raise ContextEditError("A remove edit must not carry replacement_text.")
        edits.append(
            ContextEdit(
                message_index=index,
                message_type=message_type,
                operation=operation,
                original_text=original,
                replacement_text=replacement,
                reason=reason,
            )
        )
    return edits


def edited_texts(
    history: Sequence[InteropHistoryMessageV1], edits: Sequence[ContextEdit]
) -> dict[int, str]:
    """The editable messages' numbers mapped to their post-edit full text.

    Every edit is a snippet operation on one message's current text, and
    they apply in the model's order — so two edits to one message compose.
    Any failed edit — a number the transcript never assigned, a role
    mismatch, an ``original_text`` the message does not carry, or an edit
    that would empty a message — raises ``ContextEditError``, which the
    callers turn into an untouched history.
    """
    editable = editable_messages(history)
    texts = {message.number: message.text for message in editable}
    roles = {message.number: message.role for message in editable}
    for edit in edits:
        name = f"message {edit.message_index}"
        if edit.message_index not in texts:
            raise ContextEditError(
                f"Edit names {name}, which is not an editable message."
            )
        if roles[edit.message_index] != edit.message_type:
            raise ContextEditError(
                f"Edit names {name} as {edit.message_type}, but the message's "
                f"role is {roles[edit.message_index]}."
            )
        current = texts[edit.message_index]
        if edit.original_text not in current:
            raise ContextEditError(
                f"Edit names text that message {edit.message_index} does not "
                "contain, so it cannot be applied safely."
            )
        if edit.operation in ("replace", "mask"):
            assert edit.replacement_text is not None
            updated = current.replace(edit.original_text, edit.replacement_text, 1)
        else:
            updated = current.replace(edit.original_text, "", 1)
            # Splicing a snippet out can leave doubled spaces behind; one
            # gentle pass keeps the message readable without touching any
            # other wording.
            while "  " in updated:
                updated = updated.replace("  ", " ")
        if not updated.strip():
            raise ContextEditError(
                f"Edit would leave message {edit.message_index} empty."
            )
        texts[edit.message_index] = updated
    return texts


def apply_edits(
    history: Sequence[InteropHistoryMessageV1], edits: Sequence[ContextEdit]
) -> list[InteropHistoryMessageV1]:
    """The history with every verified edit applied, in place by position.

    Edits never drop or reorder messages: ``replace`` and ``mask`` swap the
    named snippet for its replacement, ``remove`` splices the snippet out,
    and every position survives. Raises ``ContextEditError`` — leaving the
    history untouched — when an edit does not verify.
    """
    texts = edited_texts(history, edits)
    edited = list(history)
    for message in editable_messages(history):
        new_text = texts.get(message.number)
        if new_text is None or new_text == message.text:
            continue
        stored = edited[message.position]
        if isinstance(stored, InteropUserMessageV1):
            edited[message.position] = stored.model_copy(
                update={"content": [StorageTextBlock(type="text", text=new_text)]}
            )
        elif isinstance(stored, InteropAssistantMessageV1):
            edited[message.position] = stored.model_copy(
                update={
                    "parts": [
                        part.model_copy(
                            update={
                                "content": part.content.model_copy(
                                    update={"text": new_text}
                                )
                            }
                        )
                        if isinstance(part, InteropAssistantContentPartV1)
                        else part
                        for part in stored.parts
                    ]
                }
            )
        else:  # pragma: no cover - editable_messages only numbers these two.
            raise ContextEditError("An edit targeted a non-editable message.")
    return edited


def patch_public_entries(
    entries: Sequence[JsonObject],
    history: Sequence[InteropHistoryMessageV1],
    edits: Sequence[ContextEdit],
    *,
    now: int,
) -> list[JsonObject]:
    """The public history entries with the edits applied to their text.

    The public projection holds the same messages the interop history does,
    so the same ordinal edits apply — except that a user entry may render
    ``userDisplayContent`` in place of its text. No entry is dropped:
    replace, mask, and remove are snippet operations, so every message
    keeps its place and only its wording changes.
    """
    public_messages: list[tuple[int, str, str]] = []
    for index, entry in enumerate(entries):
        if entry.get("type") != "message":
            continue
        role = entry.get("role")
        if not isinstance(role, str) or role not in {"user", "assistant"}:
            continue
        if entry.get("generationStatus") != "completed":
            continue
        content = entry.get("content")
        if not isinstance(content, list) or len(content) != 1:
            continue
        block = content[0]
        if not isinstance(block, dict) or block.get("type") != "text":
            continue
        text = block.get("text")
        if isinstance(text, str) and text.strip():
            public_messages.append((index, role, text))
    stored_messages = [
        (position, message.role, text)
        for position, message in enumerate(history)
        if (text := editable_text(message)) is not None and text.strip()
    ]
    if len(public_messages) != len(stored_messages) or any(
        (public_role, public_text) != (stored_role, stored_text)
        for (_, public_role, public_text), (_, stored_role, stored_text) in zip(
            public_messages, stored_messages, strict=False
        )
    ):
        raise ContextEditError(
            "The session's history view does not match its stored transcript, "
            "so no edit can be applied safely."
        )
    message_spots = {
        position: index
        for (index, _, _), (position, _, _) in zip(
            public_messages, stored_messages, strict=True
        )
    }
    texts = edited_texts(history, edits)
    rewrite = {
        message_spots[message.position]: texts[message.number]
        for message in editable_messages(history)
        if texts[message.number] != message.text
    }
    patched: list[JsonObject] = []
    for index, entry in enumerate(entries):
        if index in rewrite:
            entry = dict(entry)
            entry["content"] = [{"type": "text", "text": rewrite[index]}]
            entry.pop("userDisplayContent", None)
            entry["updatedAt"] = now
        patched.append(entry)
    return patched


def edit_marker_entry(
    session_id: str, edits: Sequence[ContextEdit], *, now: int
) -> JsonObject:
    """The public history entry that marks a context edit, like a rewind's."""
    return {
        "type": "checkpoint",
        "id": f"checkpoint-context-edit-{now}",
        "sessionId": session_id,
        "turnId": None,
        "createdAt": now,
        "updatedAt": now,
        "generationStatus": "completed",
        "relatedEntryId": None,
        "inputEntryId": None,
        "kind": "custom",
        "message": "Context denoised",
        "details": {"edits": [edit.report() for edit in edits] if edits else []},
    }


async def execute_context_edit(
    *,
    history: Sequence[InteropHistoryMessageV1],
    instructions: str,
    config: LocalRuntimeAdapterConfig,
    complete: CompletionFn | None = None,
    timeout_s: float = EDIT_TIMEOUT_SECONDS,
) -> list[ContextEdit]:
    """Run the editor completion over ``history`` and return its edits.

    The call rides the session's active model and its credentials, like the
    smart-approve classifier, and is attributed through the Host telemetry
    sink under the ``context_edit`` purpose.
    """
    transcript = build_transcript(history)
    if not transcript:
        raise ContextEditError("No editable messages in the conversation yet.")
    run_config = dataclasses.replace(
        config, max_tokens=EDIT_MAX_TOKENS, correlation_id_sink=None
    )
    route = config.active_model
    system_text, user_text = render_edit_request(transcript, instructions)
    messages = [
        RustSystemMessage(content=[RustTextContentBlock(text=system_text)]),
        RustUserMessage(content=[RustTextContentBlock(text=user_text)]),
    ]
    report_request_sent(
        messages, run_config, route, purpose="context_edit", iteration=0
    )
    metadata = (
        run_config.completion_metadata("context_edit", 0)
        if run_config.completion_metadata is not None
        else None
    )
    credential = await run_config.credentials.resolve()
    if isinstance(credential, ProviderAuthRequired):
        raise ContextEditError(
            f"The editor completion has no usable credential: {credential.reason}"
        )
    assert isinstance(credential, ProviderCredentialSnapshot)

    async def on_retry(retry: ProviderRetry | None) -> None:
        if retry is not None:
            logger.info("Context edit completion retrying: %s", retry)

    start = time.perf_counter()
    try:
        reply = await asyncio.wait_for(
            execute_utility_completion(
                messages,
                config=run_config,
                credential=credential,
                route=route,
                metadata=metadata,
                on_retry=on_retry,
                complete=complete,
            ),
            timeout=timeout_s,
        )
    except TimeoutError as error:
        raise ContextEditError(
            "The edit model did not answer in time; nothing was changed."
        ) from error
    except UtilityCompletionError as error:
        raise ContextEditError(f"The edit model call failed: {error}") from error
    logger.info(
        "Context edit completion answered in %.1fs with %d characters",
        time.perf_counter() - start,
        len(reply.text),
    )
    return parse_edits(reply.text)


__all__ = [
    "CONTEXT_EDIT_OUTPUT_INSTRUCTIONS",
    "CONTEXT_EDIT_REPLY_SCHEMA",
    "CONTEXT_EDIT_SYSTEM_PROMPT",
    "ContextEdit",
    "ContextEditError",
    "apply_edits",
    "build_request",
    "build_transcript",
    "edit_marker_entry",
    "editable_messages",
    "editable_text",
    "edited_texts",
    "execute_context_edit",
    "parse_edits",
    "patch_public_entries",
    "render_edit_request",
]
