pub mod downloader;
pub mod model_discovery;
pub mod model_registry;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use model_registry::{get_engines, get_model, get_models_for_engine, ModelDefinition};

/// Manages local STT model downloads, verification, and storage.
///
/// Storage layout: `{app_data_dir}/models/{engine}/{filename}`
/// For archive models, `filename` is a directory after extraction.
pub struct ModelManager {
    models_dir: PathBuf,
    active_downloads: HashMap<String, Arc<AtomicBool>>,
}

impl ModelManager {
    pub fn new(models_dir: PathBuf) -> Self {
        if let Err(e) = std::fs::create_dir_all(&models_dir) {
            log::error!("Failed to create models directory: {}", e);
        }
        Self {
            models_dir,
            active_downloads: HashMap::new(),
        }
    }

    /// Get the path where a model file/directory would be stored.
    fn model_file_path(&self, engine: &str, filename: &str) -> PathBuf {
        self.models_dir.join(engine).join(filename)
    }

    /// Check if a model is downloaded and exists on disk.
    pub fn is_model_downloaded(&self, engine: &str, model_id: &str) -> bool {
        if let Some(def) = get_model(engine, model_id) {
            let path = self.model_file_path(engine, def.filename);
            if def.is_archive {
                // Archive models are extracted to a directory
                path.is_dir()
            } else {
                path.exists()
            }
        } else {
            false
        }
    }

    /// Get the path to a downloaded model file/directory, if it exists.
    pub fn get_model_path(&self, engine: &str, model_id: &str) -> Option<PathBuf> {
        let def = get_model(engine, model_id)?;
        let path = self.model_file_path(engine, def.filename);
        if def.is_archive {
            if path.is_dir() {
                Some(path)
            } else {
                None
            }
        } else {
            if path.exists() {
                Some(path)
            } else {
                None
            }
        }
    }

    /// Start downloading a model. Spawns an async task that emits progress events.
    /// For archive models, automatically extracts after download.
    pub fn download_model(
        &mut self,
        engine: &str,
        model_id: &str,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let def = get_model(engine, model_id)
            .ok_or_else(|| format!("Unknown model: {}:{}", engine, model_id))?;

        // Ensure engine subdirectory exists
        let engine_dir = self.models_dir.join(engine);
        std::fs::create_dir_all(&engine_dir)
            .map_err(|e| format!("Failed to create engine directory: {}", e))?;

        let download_key = format!("{}:{}", engine, model_id);
        if self.active_downloads.contains_key(&download_key) {
            // Check if the download or extraction is actually still running
            let check_path = if def.is_archive {
                engine_dir.join(format!("{}.tar.bz2", def.filename))
            } else {
                self.model_file_path(engine, def.filename)
            };
            let tmp_path = check_path.with_extension("download");
            // Still downloading (temp file exists) or still extracting (archive exists)
            if tmp_path.exists() {
                return Err("Download already in progress".to_string());
            }
            if def.is_archive && check_path.exists() {
                return Err("Extraction in progress".to_string());
            }
            // Stale entry — previous download finished, clean up
            self.active_downloads.remove(&download_key);
        }

        let is_archive = def.is_archive;
        let dest_path = if is_archive {
            // Download the archive to a .tar.bz2 file, extract afterward
            engine_dir.join(format!("{}.tar.bz2", def.filename))
        } else {
            self.model_file_path(engine, def.filename)
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.active_downloads
            .insert(download_key, Arc::clone(&cancel_flag));

        let url = def.download_url.to_string();
        let sha256 = def.sha256.to_string();
        let engine_str = engine.to_string();
        let model_id_str = model_id.to_string();

        // Also capture the expected model directory path for cleanup of old files
        let model_dir_path = engine_dir.join(def.filename);

        tokio::spawn(async move {
            let result = downloader::download_file(
                &url,
                &dest_path,
                &sha256,
                &engine_str,
                &model_id_str,
                cancel_flag,
                app_handle.clone(),
            )
            .await;

            if let Err(e) = result {
                log::error!(
                    "Model download failed ({}:{}): {}",
                    engine_str,
                    model_id_str,
                    e
                );
                let _ = app_handle.emit(
                    "model_download_progress",
                    &downloader::DownloadProgress {
                        engine: engine_str,
                        model_id: model_id_str,
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        percent: 0.0,
                        status: "error".to_string(),
                    },
                );
                return;
            }

            // Post-download extraction for archive models
            if is_archive {
                // Emit "extracting" status
                let _ = app_handle.emit(
                    "model_download_progress",
                    &downloader::DownloadProgress {
                        engine: engine_str.clone(),
                        model_id: model_id_str.clone(),
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        percent: 100.0,
                        status: "extracting".to_string(),
                    },
                );

                // Remove any old raw file at the model directory path
                // (leftover from previous buggy downloads that saved the archive as a file)
                if model_dir_path.is_file() {
                    log::info!(
                        "Removing stale raw archive file at: {}",
                        model_dir_path.display()
                    );
                    let _ = tokio::fs::remove_file(&model_dir_path).await;
                }

                let archive_for_extract = dest_path.clone();
                let extract_dest = engine_dir;

                let extract_result = tokio::task::spawn_blocking(move || {
                    downloader::extract_tar_bz2(&archive_for_extract, &extract_dest)
                })
                .await;

                match extract_result {
                    Ok(Ok(dir)) => {
                        // Delete the archive file
                        let _ = tokio::fs::remove_file(&dest_path).await;
                        log::info!("Model extracted to: {}", dir.display());
                        let _ = app_handle.emit(
                            "model_download_progress",
                            &downloader::DownloadProgress {
                                engine: engine_str,
                                model_id: model_id_str,
                                downloaded_bytes: 0,
                                total_bytes: 0,
                                percent: 100.0,
                                status: "complete".to_string(),
                            },
                        );
                    }
                    Ok(Err(e)) => {
                        log::error!(
                            "Extraction failed ({}:{}): {}",
                            engine_str,
                            model_id_str,
                            e
                        );
                        let _ = app_handle.emit(
                            "model_download_progress",
                            &downloader::DownloadProgress {
                                engine: engine_str,
                                model_id: model_id_str,
                                downloaded_bytes: 0,
                                total_bytes: 0,
                                percent: 0.0,
                                status: "error".to_string(),
                            },
                        );
                    }
                    Err(e) => {
                        log::error!(
                            "Extraction task panicked ({}:{}): {}",
                            engine_str,
                            model_id_str,
                            e
                        );
                        let _ = app_handle.emit(
                            "model_download_progress",
                            &downloader::DownloadProgress {
                                engine: engine_str,
                                model_id: model_id_str,
                                downloaded_bytes: 0,
                                total_bytes: 0,
                                percent: 0.0,
                                status: "error".to_string(),
                            },
                        );
                    }
                }
            } else {
                // Non-archive: download is the final step, emit complete
                let _ = app_handle.emit(
                    "model_download_progress",
                    &downloader::DownloadProgress {
                        engine: engine_str,
                        model_id: model_id_str,
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        percent: 100.0,
                        status: "complete".to_string(),
                    },
                );
            }
        });

        Ok(())
    }

    /// Cancel an active download.
    pub fn cancel_download(&mut self, engine: &str, model_id: &str) {
        let key = format!("{}:{}", engine, model_id);
        if let Some(flag) = self.active_downloads.remove(&key) {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
            log::info!("Cancelled download for {}:{}", engine, model_id);
        }
    }

    /// Delete a downloaded model from disk (handles both files and directories).
    pub fn delete_model(&mut self, engine: &str, model_id: &str) -> Result<(), String> {
        let def = get_model(engine, model_id)
            .ok_or_else(|| format!("Unknown model: {}:{}", engine, model_id))?;

        let path = self.model_file_path(engine, def.filename);
        if path.is_dir() {
            std::fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to delete model directory: {}", e))?;
        } else if path.is_file() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete model file: {}", e))?;
        }
        log::info!(
            "Deleted model: {}:{} from {}",
            engine,
            model_id,
            path.display()
        );
        Ok(())
    }

    /// List all engines with their models and download status.
    pub fn list_engines_with_status(&self) -> Vec<EngineWithStatus> {
        get_engines()
            .into_iter()
            .map(|eng| {
                let models = get_models_for_engine(eng.engine)
                    .iter()
                    .map(|m| ModelWithStatus {
                        definition: m.clone(),
                        is_downloaded: self.is_model_downloaded(m.engine, m.model_id),
                    })
                    .collect();
                EngineWithStatus {
                    engine: eng.engine.to_string(),
                    name: eng.name.to_string(),
                    description: eng.description.to_string(),
                    models,
                }
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelWithStatus {
    pub definition: ModelDefinition,
    pub is_downloaded: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct EngineWithStatus {
    pub engine: String,
    pub name: String,
    pub description: String,
    pub models: Vec<ModelWithStatus>,
}
