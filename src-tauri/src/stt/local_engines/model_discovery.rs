// Model file discovery for local STT engines.
//
// Scans a model directory to find encoder, decoder, joiner, and tokens
// files regardless of naming convention. Handles both canonical names
// (encoder.onnx) and epoch-based names (encoder-epoch-99-avg-1.onnx).

use std::path::{Path, PathBuf};

/// Discovered model file paths.
#[derive(Debug, Clone)]
pub struct ModelFiles {
    pub encoder: PathBuf,
    pub decoder: PathBuf,
    pub joiner: PathBuf,
    pub tokens: PathBuf,
}

/// Scan a model directory for transducer model files.
///
/// Looks for files matching `*encoder*.onnx`, `*decoder*.onnx`, `*joiner*.onnx`,
/// and `tokens.txt`. Searches the top level first, then one directory deeper
/// (archives often have a nested subdirectory).
pub fn discover_model_files(model_dir: &Path) -> Result<ModelFiles, String> {
    if !model_dir.is_dir() {
        return Err(format!(
            "Model directory does not exist: {}",
            model_dir.display()
        ));
    }

    let entries: Vec<_> = std::fs::read_dir(model_dir)
        .map_err(|e| format!("Cannot read model dir: {}", e))?
        .filter_map(|e| e.ok())
        .collect();

    let mut encoder: Option<PathBuf> = None;
    let mut decoder: Option<PathBuf> = None;
    let mut joiner: Option<PathBuf> = None;
    let mut tokens: Option<PathBuf> = None;

    for entry in &entries {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let path = entry.path();

        if name.ends_with(".onnx") {
            if name.contains("encoder") && encoder.is_none() {
                encoder = Some(path);
            } else if name.contains("decoder") && decoder.is_none() {
                decoder = Some(path);
            } else if name.contains("joiner") && joiner.is_none() {
                joiner = Some(path);
            }
        } else if name == "tokens.txt" {
            tokens = Some(path);
        }
    }

    // If not found at top level, try one directory deeper
    if encoder.is_none() || decoder.is_none() || joiner.is_none() || tokens.is_none() {
        for entry in &entries {
            if entry.path().is_dir() {
                if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                    for sub in sub_entries.filter_map(|e| e.ok()) {
                        let name = sub.file_name().to_string_lossy().to_lowercase();
                        let path = sub.path();

                        if name.ends_with(".onnx") {
                            if name.contains("encoder") && encoder.is_none() {
                                encoder = Some(path);
                            } else if name.contains("decoder") && decoder.is_none() {
                                decoder = Some(path);
                            } else if name.contains("joiner") && joiner.is_none() {
                                joiner = Some(path);
                            }
                        } else if name == "tokens.txt" && tokens.is_none() {
                            tokens = Some(path);
                        }
                    }
                }
            }
        }
    }

    Ok(ModelFiles {
        encoder: encoder.ok_or("No *encoder*.onnx found in model directory")?,
        decoder: decoder.ok_or("No *decoder*.onnx found in model directory")?,
        joiner: joiner.ok_or("No *joiner*.onnx found in model directory")?,
        tokens: tokens.ok_or("No tokens.txt found in model directory")?,
    })
}

/// Discovered model files for non-transducer models (SenseVoice, Parakeet CTC, etc.).
/// These have a single `model.onnx` (or `model.int8.onnx`) + `tokens.txt`.
#[derive(Debug, Clone)]
pub struct OfflineModelFiles {
    pub model: PathBuf,
    pub tokens: PathBuf,
}

/// Scan a model directory for non-transducer model files.
///
/// Looks for `model.int8.onnx` (preferred) or `model.onnx`, plus `tokens.txt`.
/// Used by SenseVoice, Parakeet TDT (NeMo CTC), and other non-streaming architectures.
pub fn discover_offline_model_files(model_dir: &Path) -> Result<OfflineModelFiles, String> {
    if !model_dir.is_dir() {
        return Err(format!(
            "Model directory does not exist: {}",
            model_dir.display()
        ));
    }

    let mut model: Option<PathBuf> = None;
    let mut model_fp32: Option<PathBuf> = None;
    let mut tokens: Option<PathBuf> = None;

    // Search top-level and one directory deeper
    let search_dirs: Vec<PathBuf> = {
        let mut dirs = vec![model_dir.to_path_buf()];
        if let Ok(entries) = std::fs::read_dir(model_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.path().is_dir() {
                    dirs.push(entry.path());
                }
            }
        }
        dirs
    };

    for dir in &search_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                let path = entry.path();

                if name == "model.int8.onnx" {
                    model = Some(path);
                } else if name == "model.onnx" && model.is_none() {
                    model_fp32 = Some(path);
                } else if name == "tokens.txt" && tokens.is_none() {
                    tokens = Some(path);
                }
            }
        }
        // Prefer int8 over fp32
        if model.is_none() {
            model = model_fp32.take();
        }
        if model.is_some() && tokens.is_some() {
            break;
        }
    }

    Ok(OfflineModelFiles {
        model: model.ok_or("No model.onnx or model.int8.onnx found in model directory")?,
        tokens: tokens.ok_or("No tokens.txt found in model directory")?,
    })
}

/// Check if a directory contains the expected model files (transducer or non-transducer).
pub fn has_model_files(model_dir: &Path) -> bool {
    discover_model_files(model_dir).is_ok() || discover_offline_model_files(model_dir).is_ok()
}
