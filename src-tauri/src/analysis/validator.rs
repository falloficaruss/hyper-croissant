use shakmaty::{Chess, Position};

use crate::analysis::types::*;

/// Validate LLM output against the actual board position.
pub fn validate_llm_output(pos: &Chess, llm_text: &str) -> ValidationResult {
    let mut errors = Vec::new();
    let words = tokenize(llm_text);

    for word in &words {
        if looks_like_uci_move(word) {
            if let Err(msg) = check_uci_move(pos, word) {
                errors.push(ValidationError::IllegalMove {
                    mentioned: word.clone(),
                    reason: msg,
                });
            }
        }
    }

    ValidationResult {
        valid: errors.is_empty(),
        errors,
    }
}

fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| {
        c.is_whitespace()
            || c == '.' || c == ',' || c == ';' || c == '!'
            || c == '?' || c == ':' || c == '"' || c == '\''
    })
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .collect()
}

fn looks_like_uci_move(s: &str) -> bool {
    let s = s.trim_end_matches(|c: char| c == '+' || c == '#' || c == '!' || c == '?');
    (s.len() == 4 || s.len() == 5)
        && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

fn check_uci_move(pos: &Chess, uci: &str) -> Result<(), String> {
    let uci_clean = uci.trim_end_matches(|c: char| c == '+' || c == '#' || c == '!' || c == '?');
    let uci_move = shakmaty::uci::UciMove::from_ascii(uci_clean.as_bytes())
        .map_err(|_| format!("'{}' is not a valid UCI format", uci_clean))?;
    uci_move
        .to_move(pos)
        .map_err(|_| format!("'{}' is not a legal move in this position", uci_clean))?;
    Ok(())
}

/// Quick sanity-check that a set of UCI moves from the LLM are all legal
/// as a sequence starting from the position.
pub fn validate_llm_variation(pos: &Chess, variation: &[String]) -> ValidationResult {
    let mut errors = Vec::new();
    let mut current_pos = pos.clone();

    for mv_str in variation {
        let uci = match shakmaty::uci::UciMove::from_ascii(mv_str.as_bytes()) {
            Ok(u) => u,
            Err(e) => {
                errors.push(ValidationError::IllegalMove {
                    mentioned: mv_str.clone(),
                    reason: format!("Invalid UCI: {}", e),
                });
                continue;
            }
        };
        let mv = match uci.to_move(&current_pos) {
            Ok(m) => m,
            Err(_) => {
                errors.push(ValidationError::IllegalMove {
                    mentioned: mv_str.clone(),
                    reason: "Not legal in position".to_string(),
                });
                continue;
            }
        };
        current_pos = current_pos.clone().play(mv).unwrap_or(current_pos);
    }

    ValidationResult {
        valid: errors.is_empty(),
        errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess;

    #[test]
    fn test_validate_legal_move() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = check_uci_move(&pos, "e2e4");
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_illegal_move() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = check_uci_move(&pos, "e2e5");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_full_output() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        // Text with no UCI-like strings should always pass
        let text = "White has a slight advantage due to better development.";
        let result = validate_llm_output(&pos, text);
        assert!(result.valid);
    }

    #[test]
    fn test_validate_with_illegal() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let text = "Try the brilliant e2e5 sacrifice!";
        let result = validate_llm_output(&pos, text);
        assert!(!result.valid);
    }

    #[test]
    fn test_validate_variation() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let variation = vec!["e2e4".to_string(), "e7e5".to_string(), "g1f3".to_string()];
        let result = validate_llm_variation(&pos, &variation);
        assert!(result.valid);
    }

    #[test]
    fn test_validate_variation_with_illegal() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let variation = vec!["e2e4".to_string(), "e7e5".to_string(), "e2e5".to_string()];
        let result = validate_llm_variation(&pos, &variation);
        assert!(!result.valid);
    }
}
