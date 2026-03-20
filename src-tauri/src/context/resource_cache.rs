use std::collections::HashMap;

/// Cached resource data stored in memory.
#[derive(Debug, Clone)]
pub struct CachedResource {
    pub text: String,
    pub token_count: usize,
    pub loaded_at: String,
}

/// In-memory cache keyed by resource_id.
#[derive(Debug)]
pub struct ResourceCache {
    entries: HashMap<String, CachedResource>,
}

impl ResourceCache {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// Insert or update a cached resource.
    pub fn insert(&mut self, resource_id: String, resource: CachedResource) {
        self.entries.insert(resource_id, resource);
    }

    /// Get a cached resource by ID.
    pub fn get(&self, resource_id: &str) -> Option<&CachedResource> {
        self.entries.get(resource_id)
    }

    /// Remove a cached resource by ID. Returns true if it existed.
    pub fn remove(&mut self, resource_id: &str) -> bool {
        self.entries.remove(resource_id).is_some()
    }

    /// Clear all cached resources.
    pub fn clear(&mut self) {
        self.entries.clear();
    }

    /// Get all cached entries as a slice of (id, resource) pairs.
    pub fn entries(&self) -> &HashMap<String, CachedResource> {
        &self.entries
    }
}
