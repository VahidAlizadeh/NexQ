pub mod file_loader;
pub mod pdf_extractor;
pub mod resource_cache;
pub mod token_counter;

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use uuid::Uuid;

use resource_cache::{CachedResource, ResourceCache};
use token_counter::{count_tokens, BudgetResource, TokenBudget};

/// A loaded context resource (mirrors the TS ContextResource type).
#[derive(Debug, Clone, Serialize)]
pub struct ContextResource {
    pub id: String,
    pub name: String,
    pub file_type: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub token_count: usize,
    pub preview: String,
    pub loaded_at: String,
}

/// Loads, caches, and serves context text from files.
/// Files stored in %APPDATA%/com.nexq.app/context/
pub struct ContextManager {
    context_dir: PathBuf,
    resources: Vec<ContextResource>,
    cache: ResourceCache,
    custom_instructions: String,
}

impl ContextManager {
    pub fn new() -> Self {
        // Determine the context directory: %APPDATA%/com.nexq.app/context/
        let context_dir = Self::get_context_dir();

        // Ensure the directory exists
        if let Err(e) = fs::create_dir_all(&context_dir) {
            log::warn!("Failed to create context directory: {}", e);
        }

        Self {
            context_dir,
            resources: Vec::new(),
            cache: ResourceCache::new(),
            custom_instructions: String::new(),
        }
    }

    /// Get the context storage directory path.
    fn get_context_dir() -> PathBuf {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            PathBuf::from(appdata)
                .join("com.nexq.app")
                .join("context")
        } else {
            // Fallback for non-Windows or if APPDATA is not set
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home)
                .join(".nexq")
                .join("context")
        }
    }

    /// Load a file into the context manager.
    /// Copies the file to the context directory, extracts text, and caches it.
    pub fn load_file(&mut self, file_path: &str) -> Result<ContextResource, String> {
        let source_path = Path::new(file_path);

        if !source_path.exists() {
            return Err(format!("File not found: {}", file_path));
        }

        // Determine file type from extension
        let extension = source_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let file_type = match extension.as_str() {
            "pdf" => "pdf",
            "txt" => "txt",
            "md" => "md",
            "docx" => "docx",
            _ => {
                return Err(format!(
                    "Unsupported file type: .{}. Supported: .pdf, .txt, .md, .docx",
                    extension
                ))
            }
        };

        // Generate a unique resource ID
        let resource_id = Uuid::new_v4().to_string();

        // Get original file name
        let file_name = source_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Copy file to context directory with unique name to avoid collisions
        let dest_filename = format!("{}_{}", resource_id, file_name);
        let dest_path = self.context_dir.join(&dest_filename);

        fs::copy(source_path, &dest_path)
            .map_err(|e| format!("Failed to copy file to context directory: {}", e))?;

        // Get file size
        let size_bytes = fs::metadata(&dest_path)
            .map(|m| m.len())
            .unwrap_or(0);

        // Extract text based on file type
        let text = match file_type {
            "pdf" => pdf_extractor::extract_text_from_pdf(
                dest_path.to_str().unwrap_or(file_path),
            )?,
            "txt" | "md" => file_loader::load_text_file(
                dest_path.to_str().unwrap_or(file_path),
            )?,
            "docx" => crate::rag::file_processor::extract_docx_text(
                dest_path.to_str().unwrap_or(file_path),
            )?,
            _ => String::new(),
        };

        // Count tokens
        let token_count = count_tokens(&text);

        // Create preview (first 100 chars)
        let preview = if text.len() > 100 {
            let boundary = text
                .char_indices()
                .nth(100)
                .map(|(i, _)| i)
                .unwrap_or(text.len());
            format!("{}...", &text[..boundary])
        } else {
            text.clone()
        };

        // Timestamp
        let loaded_at = chrono::Utc::now().to_rfc3339();

        // Create resource
        let resource = ContextResource {
            id: resource_id.clone(),
            name: file_name,
            file_type: file_type.to_string(),
            file_path: dest_path
                .to_str()
                .unwrap_or("")
                .to_string(),
            size_bytes,
            token_count,
            preview,
            loaded_at: loaded_at.clone(),
        };

        // Cache the extracted text
        self.cache.insert(
            resource_id,
            CachedResource {
                text,
                token_count,
                loaded_at,
            },
        );

        // Store resource metadata
        self.resources.push(resource.clone());

        log::info!(
            "Loaded context file: {} ({} tokens)",
            resource.name,
            resource.token_count
        );

        Ok(resource)
    }

    /// Restore a previously-persisted resource from stored metadata.
    ///
    /// Re-extracts the text from the copied file in the context directory so
    /// the in-memory cache is rebuilt after a restart. Skips silently if the
    /// file is no longer on disk (returns Err so the caller can clean up DB).
    pub fn restore_resource(&mut self, resource: ContextResource) -> Result<(), String> {
        let path = Path::new(&resource.file_path);
        if !path.exists() {
            return Err(format!("Context file missing from disk: {}", resource.file_path));
        }

        // Re-extract text (needed for context-stuffing mode and token budget)
        let text = match resource.file_type.as_str() {
            "pdf" => pdf_extractor::extract_text_from_pdf(&resource.file_path)?,
            "txt" | "md" => file_loader::load_text_file(&resource.file_path)?,
            "docx" => crate::rag::file_processor::extract_docx_text(&resource.file_path)?,
            _ => String::new(),
        };

        let token_count = count_tokens(&text);

        self.cache.insert(
            resource.id.clone(),
            CachedResource {
                text,
                token_count,
                loaded_at: resource.loaded_at.clone(),
            },
        );

        // Guard against duplicate restore (idempotent)
        if !self.resources.iter().any(|r| r.id == resource.id) {
            self.resources.push(resource);
        }

        Ok(())
    }

    /// Remove a context resource by its ID.
    pub fn remove_file(&mut self, resource_id: &str) -> Result<(), String> {
        // Find the resource
        let idx = self
            .resources
            .iter()
            .position(|r| r.id == resource_id)
            .ok_or_else(|| format!("Resource not found: {}", resource_id))?;

        let resource = self.resources.remove(idx);

        // Remove the cached file from context directory
        let file_path = Path::new(&resource.file_path);
        if file_path.exists() {
            if let Err(e) = fs::remove_file(file_path) {
                log::warn!("Failed to remove context file: {}", e);
            }
        }

        // Remove from cache
        self.cache.remove(resource_id);

        log::info!("Removed context resource: {}", resource.name);

        Ok(())
    }

    /// List all loaded context resources.
    pub fn list_resources(&self) -> Vec<ContextResource> {
        self.resources.clone()
    }

    /// Get the assembled context text (concatenation of all resources' text).
    pub fn get_assembled_context(&self) -> String {
        let mut parts: Vec<String> = Vec::new();

        // Add custom instructions first if present
        if !self.custom_instructions.is_empty() {
            parts.push(format!(
                "## Custom Instructions\n{}\n",
                self.custom_instructions
            ));
        }

        // Add each resource's text
        for resource in &self.resources {
            if let Some(cached) = self.cache.get(&resource.id) {
                if !cached.text.is_empty() {
                    parts.push(format!(
                        "## {} ({})\n{}\n",
                        resource.name, resource.file_type, cached.text
                    ));
                }
            }
        }

        parts.join("\n")
    }

    /// Set custom instructions text.
    pub fn set_custom_instructions(&mut self, text: &str) {
        self.custom_instructions = text.to_string();
    }

    /// Get the custom instructions text.
    pub fn get_custom_instructions(&self) -> &str {
        &self.custom_instructions
    }

    /// Compute the token budget breakdown.
    pub fn get_token_budget(
        &self,
        model_context_window: u64,
        transcript_tokens: usize,
    ) -> TokenBudget {
        let budget_resources: Vec<BudgetResource> = self
            .resources
            .iter()
            .map(|r| BudgetResource {
                name: r.name.clone(),
                file_type: r.file_type.clone(),
                token_count: r.token_count,
            })
            .collect();

        token_counter::compute_budget(
            &budget_resources,
            &self.custom_instructions,
            transcript_tokens,
            model_context_window,
        )
    }
}
