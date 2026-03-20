// Word-level Myers diff for dual-pass transcription correction.
//
// Compares accumulated fast-pass words against the correction-pass result
// and produces a merged text that only patches changed words.

/// Apply a word-level diff: given old (fast-pass) and new (correction-pass) word lists,
/// return merged text that preserves unchanged words and patches differences.
///
/// If inputs exceed MAX_WORDS, falls back to returning `new_words` joined directly.
pub fn merge_correction(old_words: &[&str], new_words: &[&str]) -> String {
    const MAX_WORDS: usize = 200;

    // Fallback for very long utterances
    if old_words.len() > MAX_WORDS || new_words.len() > MAX_WORDS {
        return new_words.join(" ");
    }

    // If old is empty, just use new
    if old_words.is_empty() {
        return new_words.join(" ");
    }

    // If new is empty, keep old (whisper may have hallucinated silence)
    if new_words.is_empty() {
        return old_words.join(" ");
    }

    // If identical, no change needed
    if old_words == new_words {
        return old_words.join(" ");
    }

    // Compute LCS-based merge using Myers-like approach
    let ops = compute_diff(old_words, new_words);
    apply_ops(&ops, old_words, new_words)
}

#[derive(Debug, Clone, PartialEq)]
enum DiffOp {
    Keep(usize, usize),   // index in old, index in new
    Insert(usize),         // index in new
    Delete(usize),         // index in old
}

/// Simple LCS-based diff. O(NM) but inputs are bounded by MAX_WORDS.
fn compute_diff<'a>(old: &[&'a str], new: &[&'a str]) -> Vec<DiffOp> {
    let n = old.len();
    let m = new.len();

    // Build LCS table
    let mut dp = vec![vec![0u16; m + 1]; n + 1];
    for i in 1..=n {
        for j in 1..=m {
            if old[i - 1].eq_ignore_ascii_case(new[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = dp[i - 1][j].max(dp[i][j - 1]);
            }
        }
    }

    // Backtrack to produce edit operations
    let mut ops = Vec::new();
    let mut i = n;
    let mut j = m;

    while i > 0 || j > 0 {
        if i > 0 && j > 0 && old[i - 1].eq_ignore_ascii_case(new[j - 1]) {
            ops.push(DiffOp::Keep(i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if j > 0 && (i == 0 || dp[i][j - 1] >= dp[i - 1][j]) {
            ops.push(DiffOp::Insert(j - 1));
            j -= 1;
        } else {
            ops.push(DiffOp::Delete(i - 1));
            i -= 1;
        }
    }

    ops.reverse();
    ops
}

/// Apply diff ops to produce merged text.
/// Keep ops use the NEW word (correction has better punctuation/casing).
/// Insert ops add the new word. Delete ops skip the old word.
fn apply_ops(ops: &[DiffOp], _old: &[&str], new: &[&str]) -> String {
    let mut result = Vec::with_capacity(ops.len());
    for op in ops {
        match op {
            DiffOp::Keep(_, new_idx) => result.push(new[*new_idx]),
            DiffOp::Insert(new_idx) => result.push(new[*new_idx]),
            DiffOp::Delete(_) => {} // skip deleted old words
        }
    }
    result.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_texts() {
        let old = vec!["hello", "world"];
        let new = vec!["hello", "world"];
        assert_eq!(merge_correction(&old, &new), "hello world");
    }

    #[test]
    fn single_word_correction() {
        let old = vec!["hello", "word"];
        let new = vec!["hello", "world"];
        assert_eq!(merge_correction(&old, &new), "hello world");
    }

    #[test]
    fn insertion() {
        let old = vec!["hello", "world"];
        let new = vec!["hello", "beautiful", "world"];
        assert_eq!(merge_correction(&old, &new), "hello beautiful world");
    }

    #[test]
    fn deletion() {
        let old = vec!["hello", "um", "world"];
        let new = vec!["hello", "world"];
        assert_eq!(merge_correction(&old, &new), "hello world");
    }

    #[test]
    fn empty_old() {
        let old: Vec<&str> = vec![];
        let new = vec!["hello", "world"];
        assert_eq!(merge_correction(&old, &new), "hello world");
    }

    #[test]
    fn empty_new_keeps_old() {
        let old = vec!["hello", "world"];
        let new: Vec<&str> = vec![];
        assert_eq!(merge_correction(&old, &new), "hello world");
    }

    #[test]
    fn punctuation_correction() {
        let old = vec!["hello", "world", "how", "are", "you"];
        let new = vec!["Hello,", "world.", "How", "are", "you?"];
        assert_eq!(
            merge_correction(&old, &new),
            "Hello, world. How are you?"
        );
    }
}
