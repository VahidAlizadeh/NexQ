// Manages OPUS-MT model downloads, storage, and activation.
// Each model is a directory with encoder_model.onnx, decoder_model_merged.onnx,
// tokenizer.json, and config.json.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::opus_mt_registry::{self, OpusMtModelDefinition};
use crate::stt::local_engines::downloader::DownloadProgress;

/// Manages OPUS-MT model downloads, storage, and activation.
///
/// Storage layout: `{app_data_dir}/models/opus_mt/{model_id}/`
/// Each model directory contains: encoder_model.onnx, decoder_model_merged.onnx,
/// tokenizer.json, config.json
pub struct OpusMtManager {
    models_dir: PathBuf,
    active_downloads: HashMap<String, Arc<AtomicBool>>,
    active_model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpusMtModelStatus {
    pub definition: OpusMtModelDefinition,
    pub is_downloaded: bool,
    pub is_active: bool,
}

impl OpusMtManager {
    pub fn new(models_dir: PathBuf) -> Self {
        if let Err(e) = std::fs::create_dir_all(&models_dir) {
            log::error!("Failed to create OPUS-MT models directory: {}", e);
        }

        // Load persisted active model
        let active_file = models_dir.join("active_model.txt");
        let active_model_id = std::fs::read_to_string(&active_file)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        Self {
            models_dir,
            active_downloads: HashMap::new(),
            active_model_id,
        }
    }

    /// Get the directory path for a given model.
    pub fn model_dir(&self, model_id: &str) -> PathBuf {
        self.models_dir.join(model_id)
    }

    /// Check if all required files for a model exist on disk.
    pub fn is_downloaded(&self, model_id: &str) -> bool {
        let dir = self.model_dir(model_id);
        dir.join("encoder_model.onnx").exists()
            && dir.join("decoder_model_merged.onnx").exists()
            && dir.join("tokenizer.json").exists()
    }

    /// Get the currently active model ID.
    pub fn active_model_id(&self) -> Option<&str> {
        self.active_model_id.as_deref()
    }

    /// List all models with their download and activation status.
    pub fn list_models(&self) -> Vec<OpusMtModelStatus> {
        opus_mt_registry::all_models()
            .iter()
            .map(|def| {
                let is_downloaded = self.is_downloaded(def.model_id);
                let is_active = self
                    .active_model_id
                    .as_deref()
                    .map(|a| a == def.model_id)
                    .unwrap_or(false);
                OpusMtModelStatus {
                    definition: def.clone(),
                    is_downloaded,
                    is_active,
                }
            })
            .collect()
    }

    /// Activate a downloaded model. Persists the choice to active_model.txt.
    pub fn activate_model(&mut self, model_id: &str) -> Result<(), String> {
        if !self.is_downloaded(model_id) {
            return Err(format!("Model {} is not downloaded", model_id));
        }
        if opus_mt_registry::get_model(model_id).is_none() {
            return Err(format!("Unknown model: {}", model_id));
        }

        self.active_model_id = Some(model_id.to_string());
        let active_file = self.models_dir.join("active_model.txt");
        if let Err(e) = std::fs::write(&active_file, model_id) {
            log::error!("Failed to persist active model: {}", e);
        }
        log::info!("OPUS-MT model activated: {}", model_id);
        Ok(())
    }

    /// Deactivate the current model.
    pub fn deactivate(&mut self) {
        self.active_model_id = None;
        let active_file = self.models_dir.join("active_model.txt");
        let _ = std::fs::remove_file(&active_file);
        log::info!("OPUS-MT model deactivated");
    }

    /// Start downloading a model. Downloads 3 files sequentially with combined progress.
    pub fn download_model(
        &mut self,
        model_id: &str,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let def = opus_mt_registry::get_model(model_id)
            .ok_or_else(|| format!("Unknown model: {}", model_id))?;

        // Check for existing download
        if self.active_downloads.contains_key(model_id) {
            let staging = self.models_dir.join(format!(".staging-{}", model_id));
            if staging.exists() {
                return Err("Download already in progress".to_string());
            }
            self.active_downloads.remove(model_id);
        }

        // Already downloaded?
        if self.is_downloaded(model_id) {
            return Err("Model already downloaded".to_string());
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.active_downloads
            .insert(model_id.to_string(), Arc::clone(&cancel_flag));

        let model_id_str = model_id.to_string();
        let models_dir = self.models_dir.clone();
        let encoder_url = def.encoder_url.to_string();
        let decoder_url = def.decoder_url.to_string();
        let tokenizer_url = def.tokenizer_url.to_string();
        let config_url = def.config_url.to_string();
        let total_size = def.size_bytes;

        tokio::spawn(async move {
            let staging_dir = models_dir.join(format!(".staging-{}", model_id_str));
            let final_dir = models_dir.join(&model_id_str);

            // Create staging directory
            if let Err(e) = tokio::fs::create_dir_all(&staging_dir).await {
                emit_error(&app_handle, &model_id_str, &format!("Failed to create staging dir: {}", e));
                return;
            }

            let emit_progress = |downloaded: u64, status: &str| {
                let percent = if total_size > 0 {
                    (downloaded as f32 / total_size as f32) * 100.0
                } else {
                    0.0
                };
                let _ = app_handle.emit(
                    "model_download_progress",
                    &DownloadProgress {
                        engine: "opus_mt".to_string(),
                        model_id: model_id_str.clone(),
                        downloaded_bytes: downloaded,
                        total_bytes: total_size,
                        percent,
                        status: status.to_string(),
                    },
                );
            };

            // File downloads: encoder (largest, ~45% of total), decoder (~45%), tokenizer+config (~10%)
            struct FileDownload {
                url: String,
                filename: &'static str,
                weight: f32, // fraction of total
            }

            let files = [
                FileDownload { url: encoder_url, filename: "encoder_model.onnx", weight: 0.45 },
                FileDownload { url: decoder_url, filename: "decoder_model_merged.onnx", weight: 0.45 },
                FileDownload { url: tokenizer_url, filename: "tokenizer.json", weight: 0.05 },
                FileDownload { url: config_url, filename: "config.json", weight: 0.05 },
            ];

            let mut cumulative_weight: f32 = 0.0;

            for file_dl in &files {
                if cancel_flag.load(Ordering::SeqCst) {
                    let _ = tokio::fs::remove_dir_all(&staging_dir).await;
                    emit_progress(0, "cancelled");
                    return;
                }

                let dest = staging_dir.join(file_dl.filename);
                emit_progress(
                    (cumulative_weight * total_size as f32) as u64,
                    "downloading",
                );

                match download_single_file(
                    &file_dl.url,
                    &dest,
                    &cancel_flag,
                )
                .await
                {
                    Ok(_) => {
                        cumulative_weight += file_dl.weight;
                        emit_progress(
                            (cumulative_weight * total_size as f32) as u64,
                            "downloading",
                        );
                    }
                    Err(e) => {
                        if cancel_flag.load(Ordering::SeqCst) {
                            let _ = tokio::fs::remove_dir_all(&staging_dir).await;
                            emit_progress(0, "cancelled");
                        } else {
                            log::error!("OPUS-MT download failed ({}): {}", model_id_str, e);
                            let _ = tokio::fs::remove_dir_all(&staging_dir).await;
                            emit_error(&app_handle, &model_id_str, &e);
                        }
                        return;
                    }
                }
            }

            // Rename staging → final
            if let Err(e) = tokio::fs::rename(&staging_dir, &final_dir).await {
                // rename may fail across drives on Windows — try copy+delete
                match copy_dir_recursive(&staging_dir, &final_dir).await {
                    Ok(_) => {
                        let _ = tokio::fs::remove_dir_all(&staging_dir).await;
                    }
                    Err(copy_err) => {
                        log::error!(
                            "OPUS-MT staging rename+copy failed: rename={}, copy={}",
                            e,
                            copy_err
                        );
                        let _ = tokio::fs::remove_dir_all(&staging_dir).await;
                        emit_error(
                            &app_handle,
                            &model_id_str,
                            &format!("Failed to finalize model: {}", e),
                        );
                        return;
                    }
                }
            }

            log::info!("OPUS-MT model downloaded: {}", model_id_str);
            let _ = app_handle.emit(
                "model_download_progress",
                &DownloadProgress {
                    engine: "opus_mt".to_string(),
                    model_id: model_id_str,
                    downloaded_bytes: total_size,
                    total_bytes: total_size,
                    percent: 100.0,
                    status: "complete".to_string(),
                },
            );
        });

        Ok(())
    }

    /// Cancel an active download.
    pub fn cancel_download(&mut self, model_id: &str) {
        if let Some(flag) = self.active_downloads.remove(model_id) {
            flag.store(true, Ordering::SeqCst);
            log::info!("Cancelled OPUS-MT download: {}", model_id);
        }
    }

    /// Delete a downloaded model from disk.
    pub fn delete_model(&mut self, model_id: &str) -> Result<(), String> {
        let dir = self.model_dir(model_id);
        if dir.is_dir() {
            std::fs::remove_dir_all(&dir)
                .map_err(|e| format!("Failed to delete model: {}", e))?;
        }

        // If this was the active model, deactivate
        if self.active_model_id.as_deref() == Some(model_id) {
            self.deactivate();
        }

        log::info!("Deleted OPUS-MT model: {}", model_id);
        Ok(())
    }
}

/// Download a single file from a URL to a destination path.
async fn download_single_file(
    url: &str,
    dest: &std::path::Path,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {} for {}", response.status(), url));
    }

    let mut stream = response.bytes_stream();
    let tmp_path = dest.with_extension("download");
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    while let Some(chunk_result) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            drop(file);
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return Err("Cancelled".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;
    drop(file);

    tokio::fs::rename(&tmp_path, dest)
        .await
        .map_err(|e| format!("Rename error: {}", e))?;

    Ok(())
}

/// Emit an error status event with the error message.
fn emit_error(app_handle: &AppHandle, model_id: &str, msg: &str) {
    log::error!("OPUS-MT download error for {}: {}", model_id, msg);
    let _ = app_handle.emit(
        "model_download_progress",
        &DownloadProgress {
            engine: "opus_mt".to_string(),
            model_id: model_id.to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            percent: 0.0,
            status: "error".to_string(),
        },
    );
}

/// Recursively copy a directory (fallback for cross-device rename).
async fn copy_dir_recursive(
    src: &std::path::Path,
    dst: &std::path::Path,
) -> Result<(), String> {
    tokio::fs::create_dir_all(dst)
        .await
        .map_err(|e| format!("mkdir: {}", e))?;

    let mut entries = tokio::fs::read_dir(src)
        .await
        .map_err(|e| format!("readdir: {}", e))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("entry: {}", e))?
    {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            Box::pin(copy_dir_recursive(&src_path, &dst_path)).await?;
        } else {
            tokio::fs::copy(&src_path, &dst_path)
                .await
                .map_err(|e| format!("copy: {}", e))?;
        }
    }

    Ok(())
}
