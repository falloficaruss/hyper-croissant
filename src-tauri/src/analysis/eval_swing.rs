use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{Chess, Color, Position};

use crate::analysis::types::*;
use crate::analysis::{detect_tactics, extract_features};
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
    let tactical_motifs = extract_new_tactics(pos, &after_pos, mover);

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

fn score_to_cp(score: Option<&ScoreData>) -> Option<i32> {
    match score {
        Some(s) if s.kind == "cp" => Some(s.value),
        Some(s) if s.kind == "mate" => {
            // Approximate mate as a large CP value with sign.
            if s.value > 0 {
                Some(10000 - s.value.saturating_mul(10).min(9000))
            } else {
                Some(-10000 - s.value.saturating_mul(10).max(-9000))
            }
        }
        _ => None,
    }
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

fn extract_consequences(
    before: &Features,
    after: &Features,
    mover: Color,
) -> Vec<String> {
    let mut out = Vec::new();

    let (before_us, after_us, before_them, after_them) = match mover {
        Color::White => (&before.white, &after.white, &before.black, &after.black),
        Color::Black => (&before.black, &after.black, &before.white, &after.white),
    };
    let us_label = if mover == Color::White { "White" } else { "Black" };
    let them_label = if mover == Color::White { "Black" } else { "White" };

    // King safety
    if after_us.king_safety.pawn_shield_score < before_us.king_safety.pawn_shield_score - 1 {
        out.push(format!("{}'s king lost defenders", us_label));
    }
    if after_us.king_safety.open_files_near_king.len()
        > before_us.king_safety.open_files_near_king.len()
    {
        out.push(format!("Open file(s) appeared near {}'s king", us_label));
    }
    if after_us.king_safety.storm_attackers_near_king
        > before_us.king_safety.storm_attackers_near_king
    {
        out.push(format!("More attackers near {}'s king", us_label));
    }

    // Pawn structure
    if after_us.pawn_structure.island_count > before_us.pawn_structure.island_count {
        out.push(format!("{}'s pawn structure fragmented", us_label));
    }
    let new_doubled = new_items(
        &before_us.pawn_structure.doubled_pawns,
        &after_us.pawn_structure.doubled_pawns,
    );
    for sq in new_doubled {
        out.push(format!("Doubled pawn appeared on {}", sq));
    }
    let new_isolated = new_items(
        &before_us.pawn_structure.isolated_pawns,
        &after_us.pawn_structure.isolated_pawns,
    );
    for sq in new_isolated {
        out.push(format!("Isolated pawn appeared on {}", sq));
    }
    let new_backward = new_items(
        &before_us.pawn_structure.backward_pawns,
        &after_us.pawn_structure.backward_pawns,
    );
    for sq in new_backward {
        out.push(format!("Backward pawn appeared on {}", sq));
    }
    // Lost passed pawns
    let lost_passed = new_items(
        &after_us.pawn_structure.passed_pawns,
        &before_us.pawn_structure.passed_pawns,
    );
    for sq in lost_passed {
        out.push(format!("Lost passed pawn on {}", sq));
    }
    // Opponent gained passed pawns
    let opp_passed = new_items(
        &before_them.pawn_structure.passed_pawns,
        &after_them.pawn_structure.passed_pawns,
    );
    for sq in opp_passed {
        out.push(format!("{} gained a passed pawn on {}", them_label, sq));
    }

    // Weak squares
    let new_weak = new_items(
        &before_us.square_control.weak_squares,
        &after_us.square_control.weak_squares,
    );
    for sq in new_weak.into_iter().take(3) {
        out.push(format!("{} square became weak", sq));
    }
    // Lost outposts
    let lost_outposts = new_items(
        &after_us.square_control.outposts,
        &before_us.square_control.outposts,
    );
    for sq in lost_outposts.into_iter().take(2) {
        out.push(format!("Lost outpost on {}", sq));
    }
    // Opponent gained outposts
    let opp_outposts = new_items(
        &before_them.square_control.outposts,
        &after_them.square_control.outposts,
    );
    for sq in opp_outposts.into_iter().take(2) {
        out.push(format!("{} gained an outpost on {}", them_label, sq));
    }

    // Files
    let new_open = new_items_u32(
        &before_them.files.open_files,
        &after_them.files.open_files,
    );
    // open_files is shared per position (same for both sides in our extractor) —
    // compare global open files via white side.
    let new_open_global = new_items_u32(&before.white.files.open_files, &after.white.files.open_files);
    for f in new_open_global.into_iter().chain(new_open).take(2) {
        if let Some(name) = file_name(f) {
            out.push(format!("{} opened the {}-file", them_label, name));
        }
    }

    // Piece activity
    if after_us.piece_activity.total_mobility + 4 < before_us.piece_activity.total_mobility {
        out.push(format!("{}'s pieces became less active", us_label));
    }
    if after_them.piece_activity.total_mobility
        > before_them.piece_activity.total_mobility + 4
    {
        out.push(format!("{}'s pieces became more active", them_label));
    }

    // Space
    if after_us.space.controlled_opponent_side + 2
        < before_us.space.controlled_opponent_side
    {
        out.push(format!("{} lost space", us_label));
    }

    // Material / bishop pair
    if before_us.material.has_bishop_pair && !after_us.material.has_bishop_pair {
        out.push(format!("{} lost the bishop pair", us_label));
    }
    if !before_them.material.has_bishop_pair && after_them.material.has_bishop_pair {
        out.push(format!("{} gained the bishop pair", them_label));
    }

    // Hanging / undefended pieces
    let new_hanging = new_items(
        &before_us.tactical_precursors.hanging_pieces,
        &after_us.tactical_precursors.hanging_pieces,
    );
    for sq in new_hanging {
        out.push(format!("Piece on {} became hanging", sq));
    }
    let new_undefended = new_items(
        &before_us.tactical_precursors.undefended_pieces,
        &after_us.tactical_precursors.undefended_pieces,
    );
    for sq in new_undefended.into_iter().take(2) {
        out.push(format!("Piece on {} became undefended", sq));
    }

    // New pins on our pieces
    let before_pins: Vec<String> = before_us
        .tactical_precursors
        .pins
        .iter()
        .map(|p| p.square.clone())
        .collect();
    let after_pins: Vec<String> = after_us
        .tactical_precursors
        .pins
        .iter()
        .map(|p| p.square.clone())
        .collect();
    for sq in new_items(&before_pins, &after_pins) {
        out.push(format!("Piece on {} became pinned", sq));
    }

    // Opponent gained forks
    if after_them.tactical_precursors.forks.len() > before_them.tactical_precursors.forks.len() {
        out.push(format!("{} gained a fork opportunity", them_label));
    }

    out
}

fn extract_new_tactics(before: &Chess, after: &Chess, _mover: Color) -> Vec<String> {
    let before_tactics = detect_tactics(before);
    let after_tactics = detect_tactics(after);

    let before_keys: Vec<String> = before_tactics
        .iter()
        .map(|t| format!("{:?}:{}:{}", t.motif_type, t.target, t.attacker))
        .collect();

    after_tactics
        .into_iter()
        .filter(|t| {
            let key = format!("{:?}:{}:{}", t.motif_type, t.target, t.attacker);
            !before_keys.contains(&key) && !matches!(t.severity, Severity::None_)
        })
        .map(|t| t.description)
        .take(5)
        .collect()
}

fn new_items(before: &[String], after: &[String]) -> Vec<String> {
    after
        .iter()
        .filter(|x| !before.contains(x))
        .cloned()
        .collect()
}

fn new_items_u32(before: &[u32], after: &[u32]) -> Vec<u32> {
    after
        .iter()
        .filter(|x| !before.contains(x))
        .copied()
        .collect()
}

fn file_name(f: u32) -> Option<char> {
    if f <= 7 {
        Some((b'a' + f as u8) as char)
    } else {
        None
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
