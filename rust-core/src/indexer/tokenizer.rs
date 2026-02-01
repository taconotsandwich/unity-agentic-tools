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
}
