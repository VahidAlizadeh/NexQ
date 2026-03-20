// Sub-PRD 6: Assemble prompt per template with context resources

use crate::llm::provider::LLMMessage;

use super::prompt_templates::get_system_prompt;
use super::question_detector::DetectedQuestion;

/// Builds the full prompt (list of LLMMessages) sent to the LLM.
/// Assembles: system prompt (per mode), context resources, transcript window, detected question.
pub struct ContextBuilder;

impl ContextBuilder {
    pub fn new() -> Self {
        Self
    }

    /// Build the prompt messages for the given intelligence mode.
    ///
    /// # Arguments
    /// - `mode`: The intelligence mode (Assist, WhatToSay, Shorten, FollowUp, Recap, AskQuestion)
    /// - `transcript_text`: Recent transcript text from the buffer
    /// - `question`: Optional detected question to focus on
    /// - `context_text`: Assembled context from loaded resources (documents, custom instructions)
    /// - `custom_question`: Optional user-typed question (for AskQuestion mode)
    pub fn build_prompt(
        &self,
        mode: &str,
        transcript_text: &str,
        question: Option<&DetectedQuestion>,
        context_text: &str,
        custom_question: Option<&str>,
    ) -> Vec<LLMMessage> {
        let system_prompt = get_system_prompt(mode);
        self.build_prompt_with_config(
            system_prompt,
            mode,
            transcript_text,
            question,
            context_text,
            custom_question,
            true,  // include_context
            true,  // include_transcript
            true,  // include_question
        )
    }

    /// Build prompt with per-action configuration flags.
    ///
    /// This is the configurable version — the caller resolves the system prompt
    /// and inclusion flags from the action config.
    pub fn build_prompt_with_config(
        &self,
        system_prompt: &str,
        mode: &str,
        transcript_text: &str,
        question: Option<&DetectedQuestion>,
        context_text: &str,
        custom_question: Option<&str>,
        include_context: bool,
        include_transcript: bool,
        include_question: bool,
    ) -> Vec<LLMMessage> {
        let mut messages: Vec<LLMMessage> = Vec::new();

        // 1. System prompt
        messages.push(LLMMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        });

        // 2. Build the user message with all context sections
        let mut user_parts: Vec<String> = Vec::new();

        // Add context resources if available and included
        if include_context && !context_text.is_empty() {
            user_parts.push(format!(
                "## Reference Materials\n{}\n",
                context_text
            ));
        }

        // Add transcript if included
        if include_transcript && !transcript_text.is_empty() {
            user_parts.push(format!(
                "## Meeting Transcript (Recent)\n{}\n",
                transcript_text
            ));
        }

        // Add the detected question or user question depending on mode
        match mode {
            "AskQuestion" => {
                if let Some(q) = custom_question {
                    user_parts.push(format!(
                        "## User's Question\n{}\n",
                        q
                    ));
                } else if include_question {
                    if let Some(q) = question {
                        user_parts.push(format!(
                            "## User's Question\n{}\n",
                            q.text
                        ));
                    }
                }
            }
            "Shorten" => {
                // For Shorten mode, the transcript IS the content to shorten
                if include_question {
                    if let Some(q) = question {
                        user_parts.push(format!(
                            "## Content to Shorten\n{}\n",
                            q.text
                        ));
                    }
                }
                user_parts.push(
                    "Please condense the above into a brief, clear response.".to_string()
                );
            }
            _ => {
                // For Assist, WhatToSay, FollowUp, Recap — include detected question as focus
                if include_question {
                    if let Some(q) = question {
                        user_parts.push(format!(
                            "## Detected Question (confidence: {:.0}%)\n{}\n",
                            q.confidence * 100.0,
                            q.text
                        ));
                    }
                }

                // Add mode-specific instruction
                match mode {
                    "Assist" => {
                        user_parts.push(
                            "Based on the transcript and context above, provide your assistance."
                                .to_string(),
                        );
                    }
                    "WhatToSay" => {
                        user_parts.push(
                            "Based on the above context, suggest what I should say next."
                                .to_string(),
                        );
                    }
                    "FollowUp" => {
                        user_parts.push(
                            "Based on the above transcript, suggest 2-3 follow-up questions I could ask."
                                .to_string(),
                        );
                    }
                    "Recap" => {
                        user_parts.push(
                            "Provide a concise recap of the meeting so far based on the transcript above."
                                .to_string(),
                        );
                    }
                    _ => {
                        // Custom actions — just provide a generic instruction
                        user_parts.push(
                            "Based on the above context, provide your response.".to_string(),
                        );
                    }
                }
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
