use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::prompt_templates;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionConfig {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub visible: bool,
    pub system_prompt: String,
    pub is_default_prompt: bool,

    pub include_transcript: bool,
    pub include_rag_chunks: bool,
    pub include_custom_instructions: bool,
    pub include_detected_question: bool,

    pub transcript_window_seconds: Option<u64>,
    pub rag_top_k: Option<usize>,
    pub temperature: Option<f64>,

    pub is_built_in: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalDefaults {
    pub transcript_window_seconds: u64,
    pub rag_top_k: usize,
    pub temperature: f64,
    pub auto_trigger: bool,
}

impl Default for GlobalDefaults {
    fn default() -> Self {
        Self {
            transcript_window_seconds: 120,
            rag_top_k: 5,
            temperature: 0.3,
            auto_trigger: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionPresets {
    pub tone: Option<String>,
    pub format: Option<String>,
    pub length: Option<String>,
}

impl Default for InstructionPresets {
    fn default() -> Self {
        Self {
            tone: None,
            format: None,
            length: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllActionConfigs {
    pub global_defaults: GlobalDefaults,
    pub custom_instructions: String,
    pub instruction_presets: InstructionPresets,
    pub actions: HashMap<String, ActionConfig>,
}

impl Default for AllActionConfigs {
    fn default() -> Self {
        let mut actions = HashMap::new();

        actions.insert(
            "Assist".to_string(),
            ActionConfig {
                id: "Assist".to_string(),
                name: "Assist".to_string(),
                mode: "Assist".to_string(),
                visible: true,
                system_prompt: prompt_templates::ASSIST_PROMPT.to_string(),
                is_default_prompt: true,
                include_transcript: true,
                include_rag_chunks: true,
                include_custom_instructions: true,
                include_detected_question: true,
                transcript_window_seconds: None,
                rag_top_k: None,
                temperature: None,

                is_built_in: true,
            },
        );

        actions.insert(
            "WhatToSay".to_string(),
            ActionConfig {
                id: "WhatToSay".to_string(),
                name: "Say".to_string(),
                mode: "WhatToSay".to_string(),
                visible: true,
                system_prompt: prompt_templates::WHAT_TO_SAY_PROMPT.to_string(),
                is_default_prompt: true,
                include_transcript: true,
                include_rag_chunks: false,
                include_custom_instructions: true,
                include_detected_question: true,
                transcript_window_seconds: Some(60),
                rag_top_k: None,
                temperature: None,

                is_built_in: true,
            },
        );

        actions.insert(
            "Shorten".to_string(),
            ActionConfig {
                id: "Shorten".to_string(),
                name: "Short".to_string(),
                mode: "Shorten".to_string(),
                visible: true,
                system_prompt: prompt_templates::SHORTEN_PROMPT.to_string(),
                is_default_prompt: true,
                include_transcript: true,
                include_rag_chunks: false,
                include_custom_instructions: true,
                include_detected_question: true,
                transcript_window_seconds: Some(30),
                rag_top_k: None,
                temperature: None,

                is_built_in: true,
            },
        );

        actions.insert(
            "FollowUp".to_string(),
            ActionConfig {
                id: "FollowUp".to_string(),
                name: "F/U".to_string(),
                mode: "FollowUp".to_string(),
                visible: true,
                system_prompt: prompt_templates::FOLLOW_UP_PROMPT.to_string(),
                is_default_prompt: true,
                include_transcript: true,
                include_rag_chunks: false,
                include_custom_instructions: true,
                include_detected_question: false,
                transcript_window_seconds: None,
                rag_top_k: None,
                temperature: None,

                is_built_in: true,
            },
        );

        actions.insert(
            "Recap".to_string(),
            ActionConfig {
                id: "Recap".to_string(),
                name: "Recap".to_string(),
                mode: "Recap".to_string(),
                visible: true,
                system_prompt: prompt_templates::RECAP_PROMPT.to_string(),
                is_default_prompt: true,
                include_transcript: true,
                include_rag_chunks: false,
                include_custom_instructions: false,
                include_detected_question: false,
                transcript_window_seconds: Some(0), // 0 = all transcript
                rag_top_k: None,
                temperature: None,

                is_built_in: true,
            },
        );

        actions.insert(
            "AskQuestion".to_string(),
            ActionConfig {
                id: "AskQuestion".to_string(),
                name: "Ask".to_string(),
                mode: "AskQuestion".to_string(),
                visible: true,
                system_prompt: prompt_templates::ASK_QUESTION_PROMPT.to_string(),
                is_default_prompt: true,
                include_transcript: true,
                include_rag_chunks: true,
                include_custom_instructions: true,
                include_detected_question: false,
                transcript_window_seconds: None,
                rag_top_k: None,
                temperature: None,

                is_built_in: true,
            },
        );

        Self {
            global_defaults: GlobalDefaults::default(),
            custom_instructions: String::new(),
            instruction_presets: InstructionPresets::default(),
            actions,
        }
    }
}
