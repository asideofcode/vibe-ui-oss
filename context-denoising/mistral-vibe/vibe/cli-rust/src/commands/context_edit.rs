//! `/context-denoising`: send `session/contextEdit` and rebuild the transcript
//! from the state the server returns, like a rewind that rewrites wording.

use std::sync::Arc;

use serde_json::{json, Value};

use super::compact::settle_compact;
use super::event::{dispatch, CommandEvent};
use super::submission::new_message_id;
use crate::app::{App, Status};
use crate::server::{method, Client, PublicSessionState};
use crate::transcript::local;

/// Start a context edit. Does nothing while a turn is generating or if there
/// is no conversation history.
pub fn start_context_edit(app: &mut App, client: &Arc<Client>, value: &str) {
    if matches!(app.session.status, Status::Generating { .. }) {
        local::add_command_error(
            &mut app.view.transcript,
            &new_message_id(),
            "Cannot edit context while agent loop is processing. Please wait.",
        );
        return;
    }
    // Only server rows count as history; local rows are client notices.
    if app.view.transcript.lines().all(|entry| entry.local) {
        local::add_command_error(
            &mut app.view.transcript,
            &new_message_id(),
            "No conversation history to edit yet.",
        );
        return;
    }
    let Some(session_id) = app.session.session_id.clone() else {
        return;
    };
    let instructions = value
        .split_once(char::is_whitespace)
        .map(|(_, rest)| rest.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_default();
    let Some((_, tx)) = dispatch(app) else {
        return;
    };
    app.compacting = true;
    let status_id = new_message_id();
    local::add_progress_status(
        &mut app.view.transcript,
        &status_id,
        "Denoising conversation context...",
    );
    let client = client.clone();
    crate::work::spawn(async move {
        let params = json!({
            "sessionId": session_id,
            "instructions": instructions,
        });
        let event = edit_event(&client, method::SESSION_CONTEXT_EDIT, params, &status_id).await;
        let _ = tx.try_send(event);
    });
}

/// The `session/contextEdit` reply as a command event.
async fn edit_event(
    client: &Arc<Client>,
    method_name: &str,
    params: Value,
    status_id: &str,
) -> CommandEvent {
    match client.request(method_name, params).await {
        Ok(result) => {
            let changed = result
                .get("changed")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let summary = edit_summary(&result);
            if !changed {
                return CommandEvent::ContextUnchanged {
                    status_id: status_id.to_owned(),
                    summary,
                };
            }
            match result
                .get("state")
                .cloned()
                .and_then(|state| serde_json::from_value::<PublicSessionState>(state).ok())
            {
                Some(state) => CommandEvent::ContextEdited {
                    state: Box::new(state),
                    summary,
                    status_id: status_id.to_owned(),
                },
                None => CommandEvent::ContextEditError {
                    status_id: status_id.to_owned(),
                    error: "The edit returned no state.".to_owned(),
                },
            }
        }
        Err(error) => CommandEvent::ContextEditError {
            status_id: status_id.to_owned(),
            error: crate::server::request_error::describe(&error),
        },
    }
}

/// The one-line report of the edits the editor model's reply carried: counts
/// of replaced, masked, and removed snippets, or the all-clear when nothing
/// needed changing.
fn edit_summary(result: &Value) -> String {
    let (mut replaced, mut masked, mut removed) = (0usize, 0usize, 0usize);
    if let Some(edits) = result.get("edits").and_then(Value::as_array) {
        for edit in edits {
            match edit.get("operation").and_then(Value::as_str) {
                Some("replace") => replaced += 1,
                Some("mask") => masked += 1,
                Some("remove") => removed += 1,
                _ => {}
            }
        }
    }
    if replaced == 0 && masked == 0 && removed == 0 {
        return "No text needed edits; the conversation is unchanged.".to_owned();
    }
    format!(
        "{replaced} snippet(s) replaced, {masked} snippet(s) masked, {removed} snippet(s) removed."
    )
}

/// Apply a successful `session/contextEdit` response: rebuild every row from
/// the returned history, like a rewind that revises wording in place.
pub fn apply_context_edited(app: &mut App, state: PublicSessionState, summary: &str) {
    settle_compact(app);
    app.set_session_id(state.session.id.clone());
    // The edited turns are replaced wholesale, so no `/retry` offer survives.
    crate::commands::retry::cancel(app);
    app.view.transcript.clear();
    crate::goal::adopt(app, state.session.goal.clone(), false);
    crate::worktree::adopt_state(app, &state);
    crate::background_work::adopt_state(app, &state);
    crate::loops::adopt_state(app, &state);
    app.view.transcript.load_snapshot(&state);
    app.subagents.seed_snapshot(state.child_sessions);
    crate::subagents::refresh(app);
    app.expand_rebuilt_tools();
    local::add_command_result(&mut app.view.transcript, &new_message_id(), summary);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(changed: bool, edits: Value) -> Value {
        json!({
            "eventId": 0,
            "changed": changed,
            "edits": edits,
            "session": {"id": "session"},
            "childSessions": [],
        })
    }

    #[test]
    fn edit_summary_counts_replacements_masks_and_removals() {
        let result = reply(
            true,
            json!([
                {"message_index": 0, "operation": "replace", "original_text": "a", "replacement_text": "b"},
                {"message_index": 1, "operation": "replace", "original_text": "c", "replacement_text": "d"},
                {"message_index": 2, "operation": "mask", "original_text": "e", "replacement_text": "[masked]"},
                {"message_index": 3, "operation": "remove", "original_text": "f"},
            ]),
        );
        assert_eq!(
            edit_summary(&result),
            "2 snippet(s) replaced, 1 snippet(s) masked, 1 snippet(s) removed."
        );
    }

    #[test]
    fn edit_summary_reports_an_unchanged_conversation() {
        let result = reply(false, json!([]));
        assert_eq!(
            edit_summary(&result),
            "No text needed edits; the conversation is unchanged."
        );
    }

    #[test]
    fn edit_summary_skips_unknown_operations() {
        let result = reply(
            true,
            json!([{"message_index": 0, "operation": "rewrite", "original_text": "a"}]),
        );
        assert_eq!(
            edit_summary(&result),
            "No text needed edits; the conversation is unchanged."
        );
    }
}
