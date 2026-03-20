// Sub-PRD 6: Assemble prompt per template with context resources
//
// Architecture: UNIVERSAL, data-driven prompt builder.
// - System message = per-action editable system prompt + composed instructions (tone/format/length/custom).
//   This is the ONLY instruction the LLM receives. Configured entirely from the settings page.
// - User message = data sections ONLY, each controlled by a per-action toggle:
//   1. Reference Materials (RAG chunks) — controlled by `include_context`
//   2. Meeting Transcript — controlled by `include_transcript`, windowed by caller
//   3. User's Question — always included when provided (user explicitly typed it)
//   4. Detected Question — controlled by `include_question`
//
// NO hardcoded per-mode instructions. Custom actions work identically to built-in ones.

use crate::llm::provider::LLMMessage;

use super::question_detector::DetectedQuestion;

/// Builds the full prompt (list of LLMMessages) sent to the LLM.
/// Universal builder — no hardcoded per-mode logic. All behavior is driven
/// by the per-action config from the settings page.
pub struct ContextBuilder;

impl ContextBuilder {
    pub fn new() -> Self {
        Self
    }

    /// Build prompt with per-action configuration flags.
    ///
    /// The caller (intelligence_commands.rs) resolves all settings:
    /// - system_prompt: per-action editable prompt + composed instructions
    /// - include_context: whether RAG chunks appear in user message
    /// - include_transcript: whether transcript appears in user message
    /// - include_question: whether auto-detected question appears
    /// - transcript windowing and RAG top_k are applied BEFORE calling this
    /// - temperature is passed separately to the LLM provider
    pub fn build_prompt_with_config(
        &self,
        system_prompt: &str,
        transcript_text: &str,
        question: Option<&DetectedQuestion>,
        context_text: &str,
        custom_question: Option<&str>,
        include_context: bool,
        include_transcript: bool,
        include_question: bool,
    ) -> Vec<LLMMessage> {
        let mut messages: Vec<LLMMessage> = Vec::new();

        // 1. System prompt — the ONLY instruction.
        // Already contains: per-action editable prompt + composed instructions
        // (tone/format/length/custom text) if `include_custom_instructions` is on.
        // This is fully configurable from the settings page.
        messages.push(LLMMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        });

        // 2. User message — ONLY data sections, NO hardcoded instructions.
        // Each section is independently togglable per action.
        let mut user_parts: Vec<String> = Vec::new();

        // RAG chunks (controlled by `includeRagChunks` per-action toggle)
        // top_k filtering already applied by caller before reaching here
        if include_context && !context_text.is_empty() {
            user_parts.push(format!(
                "## Reference Materials\n{}\n",
                context_text
            ));
        }

        // Transcript (controlled by `includeTranscript` per-action toggle)
        // Window filtering already applied by caller (per-action or global window)
        if include_transcript && !transcript_text.is_empty() {
            user_parts.push(format!(
                "## Meeting Transcript (Recent)\n{}\n",
                transcript_text
            ));
        }

        // User's typed question — always included when provided.
        // The user explicitly typed this, so it's always relevant.
        if let Some(q) = custom_question {
            if !q.is_empty() {
                user_parts.push(format!("## User's Question\n{}\n", q));
            }
        }

        // Detected question (controlled by `includeDetectedQuestion` per-action toggle)
        if include_question {
            if let Some(q) = question {
                user_parts.push(format!(
                    "## Detected Question (confidence: {:.0}%)\n{}\n",
                    q.confidence * 100.0,
                    q.text
                ));
            }
        }

        let user_content = user_parts.join("\n");
        messages.push(LLMMessage {
            role: "user".to_string(),
            content: user_content,
        });

        messages
    }
}
