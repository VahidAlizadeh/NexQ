use std::fs;
use std::path::Path;

/// Load a text file (.txt or .md) and return its contents as a String.
/// Handles UTF-8 encoding and BOM (byte order mark).
pub fn load_text_file(file_path: &str) -> Result<String, String> {
    let path = Path::new(file_path);

    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if extension != "txt" && extension != "md" {
        return Err(format!(
            "Unsupported text file type: .{}. Expected .txt or .md",
            extension
        ));
    }

    // Read raw bytes first to handle BOM
    let bytes = fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;

    // Strip UTF-8 BOM if present (EF BB BF)
    let text = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        String::from_utf8(bytes[3..].to_vec())
            .map_err(|e| format!("File is not valid UTF-8: {}", e))?
    } else {
        String::from_utf8(bytes).map_err(|e| format!("File is not valid UTF-8: {}", e))?
    };

    Ok(text)
}
