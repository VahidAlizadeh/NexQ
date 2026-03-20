use crate::context::token_counter::count_tokens;

/// A single chunk produced by the text splitter.
#[derive(Debug, Clone)]
pub struct TextChunk {
    /// Zero-based index of this chunk in the sequence.
    pub index: usize,
    /// The chunk text content.
    pub text: String,
    /// Approximate token count for this chunk.
    pub token_count: usize,
    /// Start character offset in the original text.
    pub start_char: usize,
    /// End character offset (exclusive) in the original text.
    pub end_char: usize,
}

/// Default separator hierarchy for recursive character splitting.
const SEPARATORS: &[&str] = &["\n\n", "\n", ". ", "? ", "! ", " "];

/// Split text into chunks using a recursive character text splitter.
///
/// - `chunk_size`: target maximum token count per chunk
/// - `chunk_overlap`: number of overlap tokens to prepend from the previous chunk
/// - `strategy`: splitting strategy name (currently only "recursive" is implemented)
///
/// Returns an empty Vec for empty input.
pub fn chunk_text(
    text: &str,
    chunk_size: usize,
    chunk_overlap: usize,
    _strategy: &str,
) -> Vec<TextChunk> {
    if text.is_empty() {
        return Vec::new();
    }

    let raw_chunks = recursive_split(text, chunk_size, 0);

    if raw_chunks.is_empty() {
        return Vec::new();
    }

    // Apply overlap and build final TextChunk structs
    let mut result: Vec<TextChunk> = Vec::new();

    for (i, (chunk_text, start_char, end_char)) in raw_chunks.iter().enumerate() {
        let final_text = if i > 0 && chunk_overlap > 0 {
            // Grab overlap text from the end of the previous raw chunk
            let prev_text = &raw_chunks[i - 1].0;
            let overlap_text = extract_tail_by_tokens(prev_text, chunk_overlap);
            if overlap_text.is_empty() {
                chunk_text.clone()
            } else {
                format!("{}{}", overlap_text, chunk_text)
            }
        } else {
            chunk_text.clone()
        };

        let token_count = count_tokens(&final_text);
        result.push(TextChunk {
            index: i,
            text: final_text,
            token_count,
            start_char: *start_char,
            end_char: *end_char,
        });
    }

    result
}

/// Recursively split text using the separator hierarchy.
/// Returns Vec of (text, start_char, end_char) tuples.
fn recursive_split(
    text: &str,
    chunk_size: usize,
    separator_idx: usize,
) -> Vec<(String, usize, usize)> {
    // Base case: text fits in one chunk or we've exhausted separators
    if count_tokens(text) <= chunk_size || separator_idx >= SEPARATORS.len() {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        return vec![(trimmed.to_string(), 0, text.len())];
    }

    let separator = SEPARATORS[separator_idx];
    let parts: Vec<&str> = text.split(separator).collect();

    // If splitting didn't help (only one part), try next separator
    if parts.len() <= 1 {
        return recursive_split(text, chunk_size, separator_idx + 1);
    }

    let mut result: Vec<(String, usize, usize)> = Vec::new();
    let mut current_parts: Vec<&str> = Vec::new();
    let mut current_start: usize = 0;
    let mut char_offset: usize = 0;

    for (i, part) in parts.iter().enumerate() {
        let test_text = if current_parts.is_empty() {
            part.to_string()
        } else {
            let mut joined = current_parts.join(separator);
            joined.push_str(separator);
            joined.push_str(part);
            joined
        };

        if count_tokens(&test_text) > chunk_size && !current_parts.is_empty() {
            // Flush accumulated parts as a chunk
            let chunk_text = current_parts.join(separator);
            let chunk_end = char_offset;
            let trimmed = chunk_text.trim();
            if !trimmed.is_empty() {
                result.push((trimmed.to_string(), current_start, chunk_end));
            }

            // Start new accumulation with the current part
            current_parts.clear();
            current_start = char_offset;

            // Check if this single part exceeds chunk_size
            if count_tokens(part) > chunk_size {
                // Recursively split this part with the next separator
                let sub_chunks = recursive_split(part, chunk_size, separator_idx + 1);
                for (sub_text, sub_start, sub_end) in sub_chunks {
                    result.push((sub_text, current_start + sub_start, current_start + sub_end));
                }
                current_start = char_offset + part.len() + separator.len();
            } else {
                current_parts.push(part);
            }
        } else {
            current_parts.push(part);
        }

        // Advance char offset: part length + separator (except after last part)
        char_offset += part.len();
        if i < parts.len() - 1 {
            char_offset += separator.len();
        }
    }

    // Flush remaining accumulated parts
    if !current_parts.is_empty() {
        let chunk_text = current_parts.join(separator);
        let trimmed = chunk_text.trim();
        if !trimmed.is_empty() {
            result.push((trimmed.to_string(), current_start, char_offset));
        }
    }

    result
}

/// Extract the last N tokens worth of text from a string.
fn extract_tail_by_tokens(text: &str, target_tokens: usize) -> String {
    if target_tokens == 0 || text.is_empty() {
        return String::new();
    }

    // Approximate: 4 chars per token
    let approx_chars = target_tokens * 4;
    let chars: Vec<char> = text.chars().collect();

    if chars.len() <= approx_chars {
        return text.to_string();
    }

    let start_idx = chars.len() - approx_chars;
    // Try to start at a word boundary
    let adjusted_start = chars[start_idx..]
        .iter()
        .position(|c| c.is_whitespace())
        .map(|pos| start_idx + pos + 1)
        .unwrap_or(start_idx);

    if adjusted_start >= chars.len() {
        return String::new();
    }

    chars[adjusted_start..].iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_input() {
        let chunks = chunk_text("", 100, 10, "recursive");
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_small_text_single_chunk() {
        let chunks = chunk_text("Hello world", 100, 10, "recursive");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].index, 0);
        assert_eq!(chunks[0].text, "Hello world");
    }

    #[test]
    fn test_paragraph_splitting() {
        let text = "First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.";
        let chunks = chunk_text(text, 8, 0, "recursive");
        assert!(chunks.len() >= 2);
        for (i, chunk) in chunks.iter().enumerate() {
            assert_eq!(chunk.index, i);
            assert!(!chunk.text.is_empty());
        }
    }

    #[test]
    fn test_chunk_indices_sequential() {
        let text = "A.\n\nB.\n\nC.\n\nD.\n\nE.";
        let chunks = chunk_text(text, 2, 0, "recursive");
        for (i, chunk) in chunks.iter().enumerate() {
            assert_eq!(chunk.index, i);
        }
    }
}
