use crate::context::{file_loader, pdf_extractor};

/// Extract text from a file based on its type.
///
/// Dispatches to the appropriate extractor:
/// - "pdf" → `pdf_extractor::extract_text_from_pdf`
/// - "txt" or "md" → `file_loader::load_text_file`
/// - "docx" → `extract_docx_text` (simple XML parsing of OOXML)
pub fn extract_text(file_path: &str, file_type: &str) -> Result<String, String> {
    match file_type.to_lowercase().as_str() {
        "pdf" => pdf_extractor::extract_text_from_pdf(file_path),
        "txt" | "md" => file_loader::load_text_file(file_path),
        "docx" => extract_docx_text(file_path),
        other => Err(format!(
            "Unsupported file type for text extraction: {}",
            other
        )),
    }
}

/// Extract text from a DOCX (Office Open XML) file.
///
/// Opens the file as a ZIP archive, reads `word/document.xml`,
/// and extracts text content from `<w:t>` elements using simple
/// string parsing (no full XML parser dependency).
pub fn extract_docx_text(file_path: &str) -> Result<String, String> {
    let file = std::fs::File::open(file_path)
        .map_err(|e| format!("Failed to open DOCX file '{}': {}", file_path, e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read DOCX as ZIP archive: {}", e))?;

    let mut xml_content = String::new();
    {
        let mut document_xml = archive
            .by_name("word/document.xml")
            .map_err(|e| format!("DOCX missing word/document.xml: {}", e))?;

        std::io::Read::read_to_string(&mut document_xml, &mut xml_content)
            .map_err(|e| format!("Failed to read document.xml: {}", e))?;
    }

    Ok(parse_docx_xml(&xml_content))
}

/// Parse text content from DOCX XML by extracting `<w:t>` element text.
///
/// Uses simple string splitting rather than a full XML parser:
/// 1. Split on '<' to get tag fragments
/// 2. Look for fragments starting with "w:t>" or "w:t " (the w:t element)
/// 3. Extract the text content after the '>'
/// 4. Track `<w:p>` (paragraph) boundaries to insert newlines
fn parse_docx_xml(xml: &str) -> String {
    let mut result = String::new();
    let mut in_paragraph = false;

    // Split on '<' to get tag-like fragments
    for fragment in xml.split('<') {
        if fragment.is_empty() {
            continue;
        }

        // Check for paragraph start: "w:p " or "w:p>"
        if fragment.starts_with("w:p>") || fragment.starts_with("w:p ") {
            if in_paragraph && !result.is_empty() && !result.ends_with('\n') {
                result.push('\n');
            }
            in_paragraph = true;
            continue;
        }

        // Check for paragraph end: "/w:p>"
        if fragment.starts_with("/w:p>") {
            if in_paragraph && !result.is_empty() && !result.ends_with('\n') {
                result.push('\n');
            }
            in_paragraph = false;
            continue;
        }

        // Check for text element: "w:t>" or "w:t " (with attributes like xml:space)
        if fragment.starts_with("w:t>") || fragment.starts_with("w:t ") {
            // Extract text after the closing '>'
            if let Some(pos) = fragment.find('>') {
                let text = &fragment[pos + 1..];
                result.push_str(text);
            }
        }
    }

    let trimmed = result.trim().to_string();

    // Clean up excessive blank lines (collapse multiple newlines to double)
    let mut cleaned = String::with_capacity(trimmed.len());
    let mut prev_newline_count = 0;
    for ch in trimmed.chars() {
        if ch == '\n' {
            prev_newline_count += 1;
            if prev_newline_count <= 2 {
                cleaned.push(ch);
            }
        } else {
            prev_newline_count = 0;
            cleaned.push(ch);
        }
    }

    cleaned
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_docx_xml_simple() {
        let xml = r#"<w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body>"#;
        let text = parse_docx_xml(xml);
        assert!(text.contains("Hello World"));
    }

    #[test]
    fn test_parse_docx_xml_multiple_paragraphs() {
        let xml = r#"<w:body><w:p><w:r><w:t>First</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:body>"#;
        let text = parse_docx_xml(xml);
        assert!(text.contains("First"));
        assert!(text.contains("Second"));
        // Paragraphs should be separated by newlines
        assert!(text.contains('\n'));
    }

    #[test]
    fn test_parse_docx_xml_with_attributes() {
        let xml = r#"<w:p><w:r><w:t xml:space="preserve"> spaced text </w:t></w:r></w:p>"#;
        let text = parse_docx_xml(xml);
        assert!(text.contains("spaced text"));
    }

    #[test]
    fn test_parse_docx_xml_empty() {
        let text = parse_docx_xml("");
        assert!(text.is_empty());
    }

    #[test]
    fn test_extract_text_unsupported() {
        let result = extract_text("test.xyz", "xyz");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported"));
    }
}
