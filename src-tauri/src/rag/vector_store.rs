/// Compute the cosine similarity between two vectors.
///
/// Returns 0.0 if either vector is empty, they have different lengths,
/// or both norms are zero (to avoid division by zero).
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.is_empty() || b.is_empty() || a.len() != b.len() {
        return 0.0;
    }

    let mut dot_product: f32 = 0.0;
    let mut norm_a: f32 = 0.0;
    let mut norm_b: f32 = 0.0;

    for (ai, bi) in a.iter().zip(b.iter()) {
        dot_product += ai * bi;
        norm_a += ai * ai;
        norm_b += bi * bi;
    }

    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        return 0.0;
    }

    dot_product / denom
}

/// Search for the most similar embeddings to a query vector.
///
/// - `query`: the query embedding vector
/// - `embeddings`: slice of (id, embedding) pairs to search through
/// - `limit`: maximum number of results to return
///
/// Returns a Vec of (id, similarity_score) sorted by descending similarity.
pub fn search_similar(
    query: &[f32],
    embeddings: &[(String, Vec<f32>)],
    limit: usize,
) -> Vec<(String, f32)> {
    let mut scored: Vec<(String, f32)> = embeddings
        .iter()
        .map(|(id, vec)| {
            let score = cosine_similarity(query, vec);
            (id.clone(), score)
        })
        .collect();

    // Sort by similarity descending
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    scored.truncate(limit);
    scored
}

/// Convert a byte slice (little-endian) to a Vec<f32>.
///
/// Reads groups of 4 bytes, interpreting each as a little-endian f32.
/// Any trailing bytes that don't fill a complete f32 are ignored.
pub fn bytes_to_f32_vec(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| {
            let arr: [u8; 4] = [chunk[0], chunk[1], chunk[2], chunk[3]];
            f32::from_le_bytes(arr)
        })
        .collect()
}

/// Convert a Vec<f32> to a byte vector (little-endian).
pub fn f32_vec_to_bytes(vec: &[f32]) -> Vec<u8> {
    vec.iter().flat_map(|f| f.to_le_bytes()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_empty() {
        assert_eq!(cosine_similarity(&[], &[1.0]), 0.0);
        assert_eq!(cosine_similarity(&[1.0], &[]), 0.0);
        assert_eq!(cosine_similarity(&[], &[]), 0.0);
    }

    #[test]
    fn test_cosine_similarity_mismatched() {
        assert_eq!(cosine_similarity(&[1.0, 2.0], &[1.0]), 0.0);
    }

    #[test]
    fn test_search_similar() {
        let query = vec![1.0, 0.0, 0.0];
        let embeddings = vec![
            ("a".to_string(), vec![1.0, 0.0, 0.0]),
            ("b".to_string(), vec![0.0, 1.0, 0.0]),
            ("c".to_string(), vec![0.5, 0.5, 0.0]),
        ];
        let results = search_similar(&query, &embeddings, 2);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].0, "a");
    }

    #[test]
    fn test_bytes_roundtrip() {
        let original = vec![1.0f32, -2.5, 3.14, 0.0];
        let bytes = f32_vec_to_bytes(&original);
        let restored = bytes_to_f32_vec(&bytes);
        assert_eq!(original.len(), restored.len());
        for (a, b) in original.iter().zip(restored.iter()) {
            assert!((a - b).abs() < 1e-7);
        }
    }
}
