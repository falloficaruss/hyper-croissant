use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{Chess, Color, Position};

use crate::analysis::feature_diff::{
    extract_consequences, extract_new_tactics, score_to_cp,
};
use crate::analysis::types::*;
use crate::analysis::extract_features;
use crate::chess;

/// Minimum absolute swing in centipawns to treat as significant.
pub const SWING_THRESHOLD_CP: i32 = 50;

/// Analyze the evaluation swing caused by a move by comparing features
/// before and after, plus optional engine scores.
pub fn analyze_eval_swing(
    pos: &Chess,
    user_move: &str,
    eval_before: Option<ScoreData>,
    eval_after: Option<ScoreData>,
) -> Result<EvalSwing, String> {
    let fen_before = chess::pos_to_fen(pos);
    let (after_pos, san) = play_uci(pos, user_move)?;
    let fen_after = chess::pos_to_fen(&after_pos);

    let before_features = extract_features(pos);
    let after_features = extract_features(&after_pos);

    // Side that just moved is the opposite of the side to move after the move.
    let mover = if after_pos.turn().is_white() {
        Color::Black
    } else {
        Color::White
    };

    let consequences = extract_consequences(&before_features, &after_features, mover);
    let tactical_motifs = extract_new_tactics(pos, &after_pos);

    let swing_cp = compute_swing_cp(&eval_before, &eval_after, mover);
    let swing_pawns = swing_cp.map(|cp| cp as f64 / 100.0);
    let severity = classify_severity(swing_cp, &consequences, &tactical_motifs);

    let summary = build_summary(
        swing_pawns,
        &severity,
        &consequences,
        &tactical_motifs,
    );

    Ok(EvalSwing {
        fen_before,
        fen_after,
        user_move: user_move.to_string(),
        user_move_san: Some(san),
        eval_before,
        eval_after,
        swing_cp,
        swing_pawns,
        consequences,
        tactical_motifs,
        severity,
        summary,
    })
}

fn play_uci(pos: &Chess, uci_str: &str) -> Result<(Chess, String), String> {
    let uci_move = UciMove::from_ascii(uci_str.as_bytes())
        .map_err(|e| format!("Invalid UCI: {}", e))?;
    let mv = uci_move
        .to_move(pos)
        .map_err(|_| format!("Illegal move: {}", uci_str))?;
    let san = San::from_move(pos, mv.clone()).to_string();
    let after = pos
        .clone()
        .play(mv)
        .map_err(|e| format!("Move failed: {:?}", e))?;
    Ok((after, san))
}

fn compute_swing_cp(
    before: &Option<ScoreData>,
    after: &Option<ScoreData>,
    mover: Color,
) -> Option<i32> {
    let b = score_to_cp(before.as_ref())?;
    let a = score_to_cp(after.as_ref())?;

    // Scores are white-relative. Convert to mover-relative.
    let b_mover = if mover == Color::White { b } else { -b };
    let a_mover = if mover == Color::White { a } else { -a };
    Some(a_mover - b_mover)
}

fn classify_severity(
    swing_cp: Option<i32>,
    consequences: &[String],
    tactical: &[String],
) -> SwingSeverity {
    let abs = swing_cp.map(|c| c.abs()).unwrap_or(0);
    let is_worsening = swing_cp.map(|c| c < 0).unwrap_or(false);
    let has_signal = !consequences.is_empty() || !tactical.is_empty();

    // Improvements / tiny changes with no feature signal → none
    if !is_worsening && abs < SWING_THRESHOLD_CP && !has_signal {
        return SwingSeverity::None;
    }
    // Improving moves: at most minor unless huge
    if !is_worsening {
        return if abs >= 200 {
            SwingSeverity::Significant
        } else if abs >= SWING_THRESHOLD_CP || has_signal {
            SwingSeverity::Minor
        } else {
            SwingSeverity::None
        };
    }

    // Worsening for the mover
    if abs >= 200 || (!tactical.is_empty() && abs >= 100) {
        SwingSeverity::Blunder
    } else if abs >= 100 || !tactical.is_empty() {
        SwingSeverity::Significant
    } else if abs >= SWING_THRESHOLD_CP || !consequences.is_empty() {
        SwingSeverity::Minor
    } else {
        SwingSeverity::None
    }
}

fn build_summary(
    swing_pawns: Option<f64>,
    severity: &SwingSeverity,
    consequences: &[String],
    tactical: &[String],
) -> String {
    let mut parts = Vec::new();

    if let Some(p) = swing_pawns {
        if p < -0.01 {
            parts.push(format!("You lost {:.1} pawns.", -p));
        } else if p > 0.01 {
            parts.push(format!("You gained {:.1} pawns.", p));
        } else {
            parts.push("Evaluation was roughly unchanged.".to_string());
        }
    } else {
        match severity {
            SwingSeverity::Blunder | SwingSeverity::Significant => {
                parts.push("Significant evaluation change detected.".to_string());
            }
            SwingSeverity::Minor => {
                parts.push("Minor positional change detected.".to_string());
            }
            SwingSeverity::None => {
                parts.push("No significant evaluation swing.".to_string());
            }
        }
    }

    let reasons: Vec<&String> = consequences.iter().chain(tactical.iter()).collect();
    if !reasons.is_empty() {
        parts.push(format!(
            "Reason: {}",
            reasons
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join("; ")
        ));
    }

    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess;

    #[test]
    fn test_swing_legal_move() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = analyze_eval_swing(
            &pos,
            "e2e4",
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 20,
            }),
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 25,
            }),
        )
        .unwrap();
        assert_eq!(result.user_move, "e2e4");
        assert_eq!(result.user_move_san.as_deref(), Some("e4"));
        assert!(result.swing_cp.is_some());
        assert!(!result.fen_after.is_empty());
    }

    #[test]
    fn test_swing_illegal_move() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = analyze_eval_swing(&pos, "e2e5", None, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_swing_large_loss_is_blunder() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = analyze_eval_swing(
            &pos,
            "f2f3",
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 20,
            }),
            Some(ScoreData {
                kind: "cp".to_string(),
                value: -250,
            }),
        )
        .unwrap();
        assert_eq!(result.swing_cp, Some(-270));
        assert!(matches!(
            result.severity,
            SwingSeverity::Blunder | SwingSeverity::Significant
        ));
        assert!(result.summary.contains("lost") || result.summary.contains("pawns"));
    }

    #[test]
    fn test_swing_from_black_perspective() {
        // After 1.e4, black to move
        let fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        // White-relative: before +30, after -200 means black blundered hard.
        let result = analyze_eval_swing(
            &pos,
            "f7f6",
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 30,
            }),
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 280,
            }),
        )
        .unwrap();
        // Black mover: before = -30, after = -280, swing = -250
        assert_eq!(result.swing_cp, Some(-250));
        assert!(matches!(result.severity, SwingSeverity::Blunder));
    }

    #[test]
    fn test_small_swing_none_or_minor() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = analyze_eval_swing(
            &pos,
            "e2e4",
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 20,
            }),
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 25,
            }),
        )
        .unwrap();
        assert!(matches!(
            result.severity,
            SwingSeverity::None | SwingSeverity::Minor
        ));
    }

    #[test]
    fn test_mate_score_swing() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = analyze_eval_swing(
            &pos,
            "e2e4",
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 0,
            }),
            Some(ScoreData {
                kind: "mate".to_string(),
                value: -3,
            }),
        )
        .unwrap();
        assert!(result.swing_cp.is_some());
        assert!(result.swing_cp.unwrap() < -1000);
    }
}
