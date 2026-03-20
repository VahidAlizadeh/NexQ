use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::DatabaseError;

// ── Data structures ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_seconds: Option<i64>,
    pub transcript: serde_json::Value,
    pub ai_interactions: serde_json::Value,
    pub summary: Option<String>,
    pub config_snapshot: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSummary {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_seconds: Option<i64>,
    pub segment_count: i64,
    pub has_summary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: String,
    pub meeting_id: String,
    pub text: String,
    pub speaker: String,
    pub timestamp_ms: i64,
    pub is_final: bool,
    pub confidence: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingUpdate {
    pub title: Option<String>,
    pub end_time: Option<String>,
    pub duration_seconds: Option<i64>,
    pub transcript: Option<serde_json::Value>,
    pub ai_interactions: Option<serde_json::Value>,
    pub summary: Option<String>,
    pub config_snapshot: Option<serde_json::Value>,
}

// ── CRUD operations ──────────────────────────────────────────────────────────

/// Create a new meeting with a UUID and the current timestamp.
pub fn create_meeting(conn: &Connection, title: &str) -> Result<Meeting, DatabaseError> {
    let id = Uuid::new_v4().to_string();
    let start_time = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO meetings (id, title, start_time, transcript, ai_interactions)
         VALUES (?1, ?2, ?3, '[]', '[]')",
        params![id, title, start_time],
    )?;

    Ok(Meeting {
        id,
        title: title.to_string(),
        start_time,
        end_time: None,
        duration_seconds: None,
        transcript: serde_json::json!([]),
        ai_interactions: serde_json::json!([]),
        summary: None,
        config_snapshot: None,
    })
}

/// Get a single meeting by ID, with its transcript segments joined in.
pub fn get_meeting(conn: &Connection, id: &str) -> Result<Meeting, DatabaseError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, start_time, end_time, duration_seconds,
                transcript, ai_interactions, summary, config_snapshot
         FROM meetings WHERE id = ?1",
    )?;

    let meeting = stmt
        .query_row(params![id], |row| {
            let transcript_str: String = row.get(5)?;
            let ai_str: String = row.get(6)?;
            let summary: Option<String> = row.get(7)?;
            let config_str: Option<String> = row.get(8)?;

            Ok(Meeting {
                id: row.get(0)?,
                title: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                duration_seconds: row.get(4)?,
                transcript: serde_json::from_str(&transcript_str).unwrap_or(serde_json::json!([])),
                ai_interactions: serde_json::from_str(&ai_str).unwrap_or(serde_json::json!([])),
                summary,
                config_snapshot: config_str
                    .and_then(|s| serde_json::from_str(&s).ok()),
            })
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                DatabaseError::NotFound(format!("Meeting {} not found", id))
            }
            other => DatabaseError::Query(other.to_string()),
        })?;

    // Also fetch and merge transcript segments into the transcript array
    let segments = list_transcript_segments(conn, id)?;
    if !segments.is_empty() {
        let mut meeting = meeting;
        meeting.transcript = serde_json::to_value(&segments).unwrap_or(serde_json::json!([]));
        return Ok(meeting);
    }

    Ok(meeting)
}

/// List meetings with pagination, ordered by start_time descending.
pub fn list_meetings(
    conn: &Connection,
    limit: u32,
    offset: u32,
) -> Result<Vec<MeetingSummary>, DatabaseError> {
    let mut stmt = conn.prepare(
        "SELECT m.id, m.title, m.start_time, m.end_time, m.duration_seconds,
                (SELECT COUNT(*) FROM transcript_segments ts WHERE ts.meeting_id = m.id) AS segment_count,
                CASE WHEN m.summary IS NOT NULL AND m.summary != '' THEN 1 ELSE 0 END AS has_summary
         FROM meetings m
         ORDER BY m.start_time DESC
         LIMIT ?1 OFFSET ?2",
    )?;

    let rows = stmt.query_map(params![limit, offset], |row| {
        Ok(MeetingSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration_seconds: row.get(4)?,
            segment_count: row.get(5)?,
            has_summary: row.get::<_, i32>(6)? != 0,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

/// Update specific fields of a meeting.
pub fn update_meeting(
    conn: &Connection,
    id: &str,
    updates: &MeetingUpdate,
) -> Result<(), DatabaseError> {
    // Build dynamic SET clause
    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref title) = updates.title {
        sets.push(format!("title = ?{}", sets.len() + 1));
        param_values.push(Box::new(title.clone()));
    }
    if let Some(ref end_time) = updates.end_time {
        sets.push(format!("end_time = ?{}", sets.len() + 1));
        param_values.push(Box::new(end_time.clone()));
    }
    if let Some(duration) = updates.duration_seconds {
        sets.push(format!("duration_seconds = ?{}", sets.len() + 1));
        param_values.push(Box::new(duration));
    }
    if let Some(ref transcript) = updates.transcript {
        sets.push(format!("transcript = ?{}", sets.len() + 1));
        param_values.push(Box::new(transcript.to_string()));
    }
    if let Some(ref ai) = updates.ai_interactions {
        sets.push(format!("ai_interactions = ?{}", sets.len() + 1));
        param_values.push(Box::new(ai.to_string()));
    }
    if let Some(ref summary) = updates.summary {
        sets.push(format!("summary = ?{}", sets.len() + 1));
        param_values.push(Box::new(summary.clone()));
    }
    if let Some(ref config) = updates.config_snapshot {
        sets.push(format!("config_snapshot = ?{}", sets.len() + 1));
        param_values.push(Box::new(config.to_string()));
    }

    if sets.is_empty() {
        return Ok(());
    }

    // Add the id as the last parameter
    let id_param_idx = sets.len() + 1;
    let sql = format!(
        "UPDATE meetings SET {} WHERE id = ?{}",
        sets.join(", "),
        id_param_idx
    );
    param_values.push(Box::new(id.to_string()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows_affected = conn.execute(&sql, param_refs.as_slice())?;
    if rows_affected == 0 {
        return Err(DatabaseError::NotFound(format!(
            "Meeting {} not found",
            id
        )));
    }

    Ok(())
}

/// Delete a meeting and all its transcript segments (cascading via FK).
pub fn delete_meeting(conn: &Connection, id: &str) -> Result<(), DatabaseError> {
    // Delete segments first (in case FK cascade isn't working without PRAGMA)
    conn.execute(
        "DELETE FROM transcript_segments WHERE meeting_id = ?1",
        params![id],
    )?;

    let rows = conn.execute("DELETE FROM meetings WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(DatabaseError::NotFound(format!(
            "Meeting {} not found",
            id
        )));
    }

    Ok(())
}

/// Search meetings by title and transcript segment text.
pub fn search_meetings(
    conn: &Connection,
    query: &str,
) -> Result<Vec<MeetingSummary>, DatabaseError> {
    let search_pattern = format!("%{}%", query);

    let mut stmt = conn.prepare(
        "SELECT DISTINCT m.id, m.title, m.start_time, m.end_time, m.duration_seconds,
                (SELECT COUNT(*) FROM transcript_segments ts WHERE ts.meeting_id = m.id) AS segment_count,
                CASE WHEN m.summary IS NOT NULL AND m.summary != '' THEN 1 ELSE 0 END AS has_summary
         FROM meetings m
         LEFT JOIN transcript_segments ts ON ts.meeting_id = m.id
         WHERE m.title LIKE ?1
            OR ts.text LIKE ?1
            OR m.summary LIKE ?1
         ORDER BY m.start_time DESC
         LIMIT 50",
    )?;

    let rows = stmt.query_map(params![search_pattern], |row| {
        Ok(MeetingSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration_seconds: row.get(4)?,
            segment_count: row.get(5)?,
            has_summary: row.get::<_, i32>(6)? != 0,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

/// Append a single transcript segment (used for incremental 30s saves).
pub fn append_transcript_segment(
    conn: &Connection,
    meeting_id: &str,
    segment: &TranscriptSegment,
) -> Result<(), DatabaseError> {
    conn.execute(
        "INSERT OR REPLACE INTO transcript_segments
            (id, meeting_id, text, speaker, timestamp_ms, is_final, confidence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            segment.id,
            meeting_id,
            segment.text,
            segment.speaker,
            segment.timestamp_ms,
            segment.is_final,
            segment.confidence,
            segment.created_at,
        ],
    )?;

    Ok(())
}

/// List all transcript segments for a given meeting, ordered by timestamp.
fn list_transcript_segments(
    conn: &Connection,
    meeting_id: &str,
) -> Result<Vec<TranscriptSegment>, DatabaseError> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_id, text, speaker, timestamp_ms, is_final, confidence, created_at
         FROM transcript_segments
         WHERE meeting_id = ?1
         ORDER BY timestamp_ms ASC",
    )?;

    let rows = stmt.query_map(params![meeting_id], |row| {
        Ok(TranscriptSegment {
            id: row.get(0)?,
            meeting_id: row.get(1)?,
            text: row.get(2)?,
            speaker: row.get(3)?,
            timestamp_ms: row.get(4)?,
            is_final: row.get(5)?,
            confidence: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}
