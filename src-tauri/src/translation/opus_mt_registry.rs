// Static catalog of downloadable OPUS-MT translation models.
// Each entry is a language pair with HuggingFace download URLs for ONNX files.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct OpusMtModelDefinition {
    pub model_id: &'static str,
    pub display_name: &'static str,
    pub source_lang: &'static str,
    pub source_name: &'static str,
    pub target_lang: &'static str,
    pub target_name: &'static str,
    pub size_bytes: u64,
    pub encoder_url: &'static str,
    pub decoder_url: &'static str,
    pub tokenizer_url: &'static str,
    pub config_url: &'static str,
    pub quality_rating: u8,
}

/// Base URL pattern: https://huggingface.co/Helsinki-NLP/opus-mt-{src}-{tgt}/resolve/main/
/// ONNX files are exported via Optimum and available at onnx/ subdirectory.
/// tokenizer.json and config.json are at the repo root.

static OPUS_MT_MODELS: &[OpusMtModelDefinition] = &[
    // ── English → X ──
    OpusMtModelDefinition {
        model_id: "opus-mt-en-es",
        display_name: "English → Spanish",
        source_lang: "en",
        source_name: "English",
        target_lang: "es",
        target_name: "Spanish",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-es/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-es/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-es/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-es/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-fr",
        display_name: "English → French",
        source_lang: "en",
        source_name: "English",
        target_lang: "fr",
        target_name: "French",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-fr/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-fr/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-fr/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-fr/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-de",
        display_name: "English → German",
        source_lang: "en",
        source_name: "English",
        target_lang: "de",
        target_name: "German",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-de/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-de/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-de/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-de/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-it",
        display_name: "English → Italian",
        source_lang: "en",
        source_name: "English",
        target_lang: "it",
        target_name: "Italian",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-it/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-it/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-it/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-it/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-pt",
        display_name: "English → Portuguese",
        source_lang: "en",
        source_name: "English",
        target_lang: "pt",
        target_name: "Portuguese",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-pt/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-pt/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-pt/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-pt/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-nl",
        display_name: "English → Dutch",
        source_lang: "en",
        source_name: "English",
        target_lang: "nl",
        target_name: "Dutch",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-nl/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-nl/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-nl/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-nl/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-ru",
        display_name: "English → Russian",
        source_lang: "en",
        source_name: "English",
        target_lang: "ru",
        target_name: "Russian",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-ru/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-ru/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-ru/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-ru/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-zh",
        display_name: "English → Chinese",
        source_lang: "en",
        source_name: "English",
        target_lang: "zh",
        target_name: "Chinese",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-zh/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-zh/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-zh/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-zh/resolve/main/config.json",
        quality_rating: 3,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-ar",
        display_name: "English → Arabic",
        source_lang: "en",
        source_name: "English",
        target_lang: "ar",
        target_name: "Arabic",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-ar/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-ar/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-ar/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-ar/resolve/main/config.json",
        quality_rating: 3,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-ja",
        display_name: "English → Japanese",
        source_lang: "en",
        source_name: "English",
        target_lang: "ja",
        target_name: "Japanese",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-ja/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-ja/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-ja/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-ja/resolve/main/config.json",
        quality_rating: 3,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-en-ko",
        display_name: "English → Korean",
        source_lang: "en",
        source_name: "English",
        target_lang: "ko",
        target_name: "Korean",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-en-ko/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-en-ko/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-en-ko/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-en-ko/resolve/main/config.json",
        quality_rating: 3,
    },
    // ── X → English ──
    OpusMtModelDefinition {
        model_id: "opus-mt-es-en",
        display_name: "Spanish → English",
        source_lang: "es",
        source_name: "Spanish",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-es-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-es-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-es-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-es-en/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-fr-en",
        display_name: "French → English",
        source_lang: "fr",
        source_name: "French",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-fr-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-fr-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-fr-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-fr-en/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-de-en",
        display_name: "German → English",
        source_lang: "de",
        source_name: "German",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-de-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-de-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-de-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-de-en/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-it-en",
        display_name: "Italian → English",
        source_lang: "it",
        source_name: "Italian",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-it-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-it-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-it-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-it-en/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-pt-en",
        display_name: "Portuguese → English",
        source_lang: "pt",
        source_name: "Portuguese",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-pt-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-pt-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-pt-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-pt-en/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-nl-en",
        display_name: "Dutch → English",
        source_lang: "nl",
        source_name: "Dutch",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-nl-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-nl-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-nl-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-nl-en/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-ru-en",
        display_name: "Russian → English",
        source_lang: "ru",
        source_name: "Russian",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-ru-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-ru-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-ru-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-ru-en/resolve/main/config.json",
        quality_rating: 4,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-zh-en",
        display_name: "Chinese → English",
        source_lang: "zh",
        source_name: "Chinese",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-zh-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-zh-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-zh-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-zh-en/resolve/main/config.json",
        quality_rating: 3,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-ar-en",
        display_name: "Arabic → English",
        source_lang: "ar",
        source_name: "Arabic",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-ar-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-ar-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-ar-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-ar-en/resolve/main/config.json",
        quality_rating: 3,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-ja-en",
        display_name: "Japanese → English",
        source_lang: "ja",
        source_name: "Japanese",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-ja-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-ja-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-ja-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-ja-en/resolve/main/config.json",
        quality_rating: 3,
    },
    OpusMtModelDefinition {
        model_id: "opus-mt-ko-en",
        display_name: "Korean → English",
        source_lang: "ko",
        source_name: "Korean",
        target_lang: "en",
        target_name: "English",
        size_bytes: 310_000_000,
        encoder_url: "https://huggingface.co/Xenova/opus-mt-ko-en/resolve/main/onnx/encoder_model.onnx",
        decoder_url: "https://huggingface.co/Xenova/opus-mt-ko-en/resolve/main/onnx/decoder_model_merged.onnx",
        tokenizer_url: "https://huggingface.co/Xenova/opus-mt-ko-en/resolve/main/tokenizer.json",
        config_url: "https://huggingface.co/Xenova/opus-mt-ko-en/resolve/main/config.json",
        quality_rating: 3,
    },
];

/// Get all available OPUS-MT model definitions.
pub fn all_models() -> &'static [OpusMtModelDefinition] {
    OPUS_MT_MODELS
}

/// Look up a specific model by ID.
pub fn get_model(model_id: &str) -> Option<&'static OpusMtModelDefinition> {
    OPUS_MT_MODELS.iter().find(|m| m.model_id == model_id)
}

/// Find the model for a given source→target language pair.
pub fn get_model_for_pair(source: &str, target: &str) -> Option<&'static OpusMtModelDefinition> {
    OPUS_MT_MODELS
        .iter()
        .find(|m| m.source_lang == source && m.target_lang == target)
}

/// Get all unique source languages available in the catalog.
pub fn available_source_langs() -> Vec<(&'static str, &'static str)> {
    let mut langs: Vec<(&str, &str)> = OPUS_MT_MODELS
        .iter()
        .map(|m| (m.source_lang, m.source_name))
        .collect();
    langs.sort_by_key(|&(code, _)| code);
    langs.dedup_by_key(|&mut (code, _)| code);
    langs
}

/// Get all target languages available for a given source language.
pub fn targets_for_source(source: &str) -> Vec<(&'static str, &'static str)> {
    OPUS_MT_MODELS
        .iter()
        .filter(|m| m.source_lang == source)
        .map(|m| (m.target_lang, m.target_name))
        .collect()
}
