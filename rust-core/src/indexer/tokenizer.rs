/// Estimate the number of tokens in a text
/// Uses a simple character-based estimation (chars / 4)
pub fn estimate_tokens(text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }

    // Simple estimation: ~4 characters per token on average
    (text.len() / 4).max(1) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens_empty() {
        assert_eq!(estimate_tokens(""), 0);
    }

    #[test]
    fn test_estimate_tokens_short() {
        assert_eq!(estimate_tokens("test"), 1);
    }

    #[test]
    fn test_estimate_tokens_long() {
        let text = "This is a longer piece of text that should have more tokens.";
        let tokens = estimate_tokens(text);
        assert!(tokens > 10);
    }

    #[test]
    fn test_estimate_tokens_single_char() {
        // Single char: len=1, (1/4).max(1) = 1
        assert_eq!(estimate_tokens("x"), 1);
    }

    #[test]
    fn test_estimate_tokens_exact_boundaries() {
        // 4 bytes: 4/4 = 1
        assert_eq!(estimate_tokens("abcd"), 1);
        // 8 bytes: 8/4 = 2
        assert_eq!(estimate_tokens("abcdefgh"), 2);
    }

    #[test]
    fn test_estimate_tokens_multibyte_utf8() {
        // Rust str::len() returns byte count, not char count
        // '€' is 3 bytes in UTF-8, so "€€" is 6 bytes -> 6/4 = 1 (max(1))
        let text = "€€";
        let tokens = estimate_tokens(text);
        assert_eq!(tokens, text.len() as u32 / 4);
    }
}
