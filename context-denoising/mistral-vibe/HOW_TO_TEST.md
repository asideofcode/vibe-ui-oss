# How to test the /context-denoising feature

This is mistral-vibe (main) with the context-edit patch already applied.

## 1. Set up the project (first time)
Install the repo's Python dependencies the way you normally run this repo,
e.g. with uv:
    uv sync          # or: make setup / pip install -e ".[dev]"

## 2. Run the included tests (fastest verification)
    uv run pytest tests/acp/test_context_edit_command.py tests/app_server/test_session_backend_port.py

## 3. Test live
Start the CLI the way you normally start it for this repo, have a short
conversation so there is some history, then run:

    /context-denoising the assistant keeps assuming my event is casual

Expected: a short "Editing conversation context..." item while the editor
model runs, then a summary like:
    "Conversation context edited: 1 snippet replaced, 1 snippet removed.
     Message positions were preserved."
Touched phrases in earlier messages should be replaced, masked, or gone,
with all other wording unchanged. Nothing is ever removed entirely or
reordered; a malformed model reply leaves the history fully untouched.

The CLI's Rust frontend was also changed, so rebuild the CLI binary the way
you normally build it (make / cargo build) before starting it.

## Repeat denoising
Run `/context-denoising <what to change>` again after it finishes. Each run
reads and updates the latest saved conversation, including earlier denoising
edits and the most recent messages. The visible history updates in place.
Plain text next to tool calls can be edited; tool calls, tool results, and
reasoning remain unchanged. Saved edits survive restarting and resuming.
`/context-edit` remains a compatibility alias.
