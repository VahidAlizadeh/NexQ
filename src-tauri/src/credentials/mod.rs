pub mod windows_cred;

/// Credential manager for secure API key storage.
/// Delegates to the platform-specific credential backend (Windows Credential Manager).
pub struct CredentialManager;

impl CredentialManager {
    pub fn new() -> Self {
        Self
    }

    /// Store an API key for the given provider.
    pub fn store_key(&self, provider: &str, key: &str) -> Result<(), String> {
        let provider = Self::normalize_provider(provider);
        windows_cred::credential_write(&provider, key)
    }

    /// Retrieve an API key for the given provider. Returns None if not stored.
    pub fn get_key(&self, provider: &str) -> Result<Option<String>, String> {
        let provider = Self::normalize_provider(provider);
        windows_cred::credential_read(&provider)
    }

    /// Delete the API key for the given provider.
    pub fn delete_key(&self, provider: &str) -> Result<(), String> {
        let provider = Self::normalize_provider(provider);
        windows_cred::credential_delete(&provider)
    }

    /// Check whether an API key exists for the given provider.
    pub fn has_key(&self, provider: &str) -> Result<bool, String> {
        let provider = Self::normalize_provider(provider);
        let key = windows_cred::credential_read(&provider)?;
        Ok(key.is_some())
    }

    /// Normalize provider name to lowercase for consistent key naming.
    fn normalize_provider(provider: &str) -> String {
        provider.to_lowercase().trim().to_string()
    }
}
