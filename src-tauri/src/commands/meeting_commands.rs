use tauri::{command, State};

use crate::db::meetings::{self, MeetingUpdate, TranscriptSegment};
use crate::state::AppState;

#[command]
pub async fn start_meeting(
    title: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state
        .database
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let db = db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let title = title.unwrap_or_else(|| {
        format!(
            "Meeting {}",
            chrono::Local::now().format("%Y-%m-%d %H:%M")
        )
    });

    let meeting = meetings::create_meeting(db.connection(), &title)
        .map_err(|e| format!("Failed to create meeting: {}", e))?;

    serde_json::to_string(&meeting).map_err(|e| format!("Failed to serialize meeting: {}", e))
}

#[command]
pub async fn end_meeting(
    meeting_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .database
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let db = db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    // Get the meeting to calculate duration
    let meeting = meetings::get_meeting(db.connection(), &meeting_id)
        .map_err(|e| format!("Failed to get meeting: {}", e))?;

    let end_time = chrono::Utc::now().to_rfc3339();

    // Calculate duration
    let duration_seconds = chrono::DateTime::parse_from_rfc3339(&end_time)
        .ok()
        .and_then(|end| {
            chrono::DateTime::parse_from_rfc3339(&meeting.start_time)
                .ok()
                .map(|start| (end - start).num_seconds())
        });

    let update = MeetingUpdate {
        title: None,
        end_time: Some(end_time),
        duration_seconds,
        transcript: None,
        ai_interactions: None,
        summary: None,
        config_snapshot: None,
    };

    meetings::update_meeting(db.connection(), &meeting_id, &update)
        .map_err(|e| format!("Failed to end meeting: {}", e))
}

#[command]
pub async fn list_meetings(
    limit: Option<u32>,
    offset: Option<u32>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state
        .database
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let db = db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    let summaries = meetings::list_meetings(db.connection(), limit, offset)
        .map_err(|e| format!("Failed to list meetings: {}", e))?;

    serde_json::to_string(&summaries).map_err(|e| format!("Failed to serialize meetings: {}", e))
}

#[command]
pub async fn get_meeting(
    meeting_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state
        .database
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let db = db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let meeting = meetings::get_meeting(db.connection(), &meeting_id)
        .map_err(|e| format!("Failed to get meeting: {}", e))?;

    serde_json::to_string(&meeting).map_err(|e| format!("Failed to serialize meeting: {}", e))
}

#[command]
pub async fn delete_meeting(
    meeting_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .database
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let db = db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    meetings::delete_meeting(db.connection(), &meeting_id)
        .map_err(|e| format!("Failed to delete meeting: {}", e))
}

#[command]
pub async fn search_meetings(
    query: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state
        .database
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let db = db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let results = meetings::search_meetings(db.connection(), &query)
        .map_err(|e| format!("Failed to search meetings: {}", e))?;

    serde_json::to_string(&results).map_err(|e| format!("Failed to serialize results: {}", e))
}

#[command]
pub async fn append_transcript_segment(
    meeting_id: String,
    segment: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state
        .database
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let db = db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    // Parse the frontend segment (which may lack meeting_id and created_at)
    let partial: serde_json::Value = serde_json::from_str(&segment)
        .map_err(|e| format!("Failed to parse transcript segment: {}", e))?;

    let full_segment = TranscriptSegment {
        id: partial["id"].as_str().unwrap_or("unknown").to_string(),
        meeting_id: meeting_id.clone(),
        text: partial["text"].as_str().unwrap_or("").to_string(),
        speaker: partial["speaker"].as_str().unwrap_or("Unknown").to_string(),
        timestamp_ms: partial["timestamp_ms"].as_i64().unwrap_or(0),
        is_final: partial["is_final"].as_bool().unwrap_or(true),
        confidence: partial["confidence"].as_f64().unwrap_or(0.0),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    meetings::append_transcript_segment(db.connection(), &meeting_id, &full_segment)
        .map_err(|e| format!("Failed to append transcript segment: {}", e))
}
