// Sub-PRD 5: SSE parser + NDJSON parser utilities

use serde_json::Value;

/// Parses Server-Sent Events (SSE) format.
/// SSE lines look like: "data: {json...}" or "data: [DONE]"
pub struct SSEParser;

impl SSEParser {
    /// Parse a raw SSE chunk into individual data lines.
    /// Returns a list of parsed JSON values. Returns None for "[DONE]" signals.
    pub fn parse_chunk(chunk: &str) -> Vec<Option<Value>> {
        let mut results = Vec::new();

        for line in chunk.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with(':') {
                // Empty line (event boundary) or comment
                continue;
            }

            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data == "[DONE]" {
                    results.push(None);
                    continue;
                }
                if data.is_empty() {
                    continue;
                }
                match serde_json::from_str::<Value>(data) {
                    Ok(val) => results.push(Some(val)),
                    Err(_) => {
                        // Not valid JSON yet, might be a partial line - skip
                    }
                }
            }
        }

        results
    }

    /// Extract token text from an OpenAI-compatible SSE data object.
    /// Path: choices[0].delta.content
    pub fn extract_openai_token(data: &Value) -> Option<String> {
        data.get("choices")
            .and_then(|c| c.get(0))
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(|content| content.as_str())
            .map(|s| s.to_string())
    }

    /// Extract token text from an Anthropic SSE content_block_delta event.
    /// Path: delta.text
    pub fn extract_anthropic_token(data: &Value) -> Option<String> {
        data.get("delta")
            .and_then(|delta| delta.get("text"))
            .and_then(|text| text.as_str())
            .map(|s| s.to_string())
    }

    /// Extract token text from a Gemini SSE data object.
    /// Path: candidates[0].content.parts[0].text
    pub fn extract_gemini_token(data: &Value) -> Option<String> {
        data.get("candidates")
            .and_then(|c| c.get(0))
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.get(0))
            .and_then(|part| part.get("text"))
            .and_then(|text| text.as_str())
            .map(|s| s.to_string())
    }
}

/// Parses Newline-Delimited JSON (NDJSON) format.
/// Each line is a separate JSON object.
pub struct NDJSONParser;

impl NDJSONParser {
    /// Parse a raw NDJSON chunk into JSON values.
    /// Each non-empty line should be a valid JSON object.
    pub fn parse_chunk(chunk: &str) -> Vec<Value> {
        let mut results = Vec::new();

        for line in chunk.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<Value>(line) {
                Ok(val) => results.push(val),
                Err(_) => {
                    // Partial line or invalid JSON - skip
                }
            }
        }

        results
    }

    /// Extract token text from an Ollama NDJSON object.
    /// Path: message.content
    pub fn extract_ollama_token(data: &Value) -> Option<String> {
        data.get("message")
            .and_then(|msg| msg.get("content"))
            .and_then(|content| content.as_str())
            .map(|s| s.to_string())
    }

    /// Check if an Ollama NDJSON object indicates the stream is done.
    /// Field: done == true
    pub fn is_ollama_done(data: &Value) -> bool {
        data.get("done")
            .and_then(|d| d.as_bool())
            .unwrap_or(false)
    }
}

/// A line buffer for incremental SSE/NDJSON parsing from byte streams.
/// Accumulates bytes until complete lines are available.
pub struct LineBuffer {
    buffer: String,
}

impl LineBuffer {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
        }
    }

    /// Push new bytes into the buffer and extract complete lines.
    pub fn push(&mut self, data: &str) -> Vec<String> {
        self.buffer.push_str(data);
        let mut lines = Vec::new();

        while let Some(pos) = self.buffer.find('\n') {
            let line = self.buffer[..pos].to_string();
            self.buffer = self.buffer[pos + 1..].to_string();
            lines.push(line);
        }

        lines
    }

    /// Get any remaining data in the buffer (for final flush).
    pub fn flush(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            None
        } else {
            Some(std::mem::take(&mut self.buffer))
        }
    }
}
