pub mod context;
pub mod meetings;
pub mod migrations;
pub mod rag;

use rusqlite::Connection;
use std::path::PathBuf;

/// Database manager with rusqlite connection and auto-migration.
pub struct DatabaseManager {
    conn: Connection,
}

impl DatabaseManager {
    /// Opens (or creates) the SQLite database at the standard app data path
    /// and runs all migrations.
    pub fn new(app_data_dir: PathBuf) -> Result<Self, DatabaseError> {
        // Ensure directory exists
        std::fs::create_dir_all(&app_data_dir).map_err(|e| {
            DatabaseError::Init(format!("Failed to create data directory: {}", e))
        })?;

        let db_path = app_data_dir.join("nexq.db");
        log::info!("Opening database at: {}", db_path.display());

        let conn = Connection::open(&db_path).map_err(|e| {
            DatabaseError::Init(format!("Failed to open database: {}", e))
        })?;

        // Run migrations
        migrations::run(&conn).map_err(|e| {
            DatabaseError::Migration(format!("Migration failed: {}", e))
        })?;

        Ok(Self { conn })
    }

    /// Returns a reference to the underlying SQLite connection.
    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DatabaseError {
    #[error("Database initialization error: {0}")]
    Init(String),
    #[error("Migration error: {0}")]
    Migration(String),
    #[error("Query error: {0}")]
    Query(String),
    #[error("Not found: {0}")]
    NotFound(String),
}

impl From<rusqlite::Error> for DatabaseError {
    fn from(e: rusqlite::Error) -> Self {
        DatabaseError::Query(e.to_string())
    }
}
