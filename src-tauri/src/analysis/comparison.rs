use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{Chess, Color, Position};

use crate::analysis::feature_diff::{
    eval_diff_cp_mover_relative, extract_consequences, extract_new_tactics,
};
use crate::analysis::types::*;
use crate::analysis::{evaluate_concepts, extract_features};
use crate::chess;

/// Minimum absolute eval gap (cp, mover-relative) to treat comparison as significant
/// when there is no feature/tactics signal.
pub const COMPARISON_THRESHOLD_CP: i32 = 30;

/// Compare the user's move against the engine's best move from the same position.
pub fn compare_moves(
    pos: &Chess,
    user_move: &str,
    engine_move: &str,
    user_score: Option<ScoreData>,
    engine_score: Option<ScoreData>,
) -> Result<MoveComparison, String> {
    let fen_before = chess::pos_to_fen(pos);
    let mover = pos.turn();

    let (user_pos, user_san) = play_uci(pos, user_move)?;
    let (engine_pos, engine_san) = play_uci(pos, engine_move)?;
    let fen_after_user = chess::pos_to_fen(&user_pos);
    let fen_after_engine = chess::pos_to_fen(&engine_pos);

    let user_features = extract_features(&user_pos);
    let engine_features = extract_features(&engine_pos);

    // What got worse for the mover in the user line vs the engine line.
    let feature_lost = extract_consequences(&engine_features, &user_features, mover);
    // What the engine line keeps / improves vs the user line.
    let feature_gained = extract_consequences(&user_features, &engine_features, mover);

    // Tactics that appear after the user move but not after the engine move.
    let user_new_tactics = extract_new_tactics(pos, &user_pos);
    let engine_new_tactics = extract_new_tactics(pos, &engine_pos);
    let tactical_impact: Vec<String> = user_new_tactics
        .into_iter()
        .filter(|t| !engine_new_tactics.contains(t))
        .collect();

    // Concept-level differences (initiative, key ideas).
    let user_concepts = evaluate_concepts(&user_pos, &user_features);
    let engine_concepts = evaluate_concepts(&engine_pos, &engine_features);
    let (mut concepts_lost, mut concepts_gained, mut strategic_difference) =
        diff_concepts(&user_concepts, &engine_concepts, mover);

    // Merge feature diffs into concept buckets (dedupe).
    for item in &feature_lost {
        if !concepts_lost.contains(item) && !strategic_difference.contains(item) {
            strategic_difference.push(item.clone());
        }
    }
    for item in &feature_gained {
        if !concepts_gained.contains(item) {
            concepts_gained.push(item.clone());
        }
    }
    // Promote pure feature losses that sound conceptual into concepts_lost
    for item in feature_lost {
        if looks_like_concept(&item) && !concepts_lost.contains(&item) {
            concepts_lost.push(item);
        }
    }

    let eval_diff_cp =
        eval_diff_cp_mover_relative(user_score.as_ref(), engine_score.as_ref(), mover);
    let eval_diff_pawns = eval_diff_cp.map(|cp| cp as f64 / 100.0);

    let why_engine = build_why_engine(
        &concepts_lost,
        &strategic_difference,
        &tactical_impact,
        &concepts_gained,
    );

    let summary = build_summary(
        &user_san,
        &engine_san,
        eval_diff_pawns,
        &concepts_lost,
        &strategic_difference,
        &tactical_impact,
        &why_engine,
    );

    Ok(MoveComparison {
        fen_before,
        fen_after_user,
        fen_after_engine,
        user_move: user_move.to_string(),
        engine_move: engine_move.to_string(),
        user_move_san: Some(user_san),
        engine_move_san: Some(engine_san),
        user_move_eval: user_score,
        engine_move_eval: engine_score,
        eval_diff_cp,
        eval_diff_pawns,
        concepts_lost,
        concepts_gained,
        tactical_impact,
        strategic_difference,
        why_engine,
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

fn diff_concepts(
    user: &ConceptEvaluation,
    engine: &ConceptEvaluation,
    mover: Color,
) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut lost = Vec::new();
    let mut gained = Vec::new();
    let mut strategic = Vec::new();

    let mover_str = if mover == Color::White {
        "white"
    } else {
        "black"
    };
    let opp_str = if mover == Color::White {
        "black"
    } else {
        "white"
    };

    // Initiative shifts
    let user_init = user.initiative.as_deref();
    let eng_init = engine.initiative.as_deref();
    if eng_init == Some(mover_str) && user_init != Some(mover_str) {
        lost.push("Your move loses the initiative".to_string());
        gained.push("Engine move keeps the initiative".to_string());
    } else if user_init == Some(opp_str) && eng_init != Some(opp_str) {
        lost.push("Your move hands the initiative to the opponent".to_string());
    }

    // Tempo
    if engine.tempo_advantage > user.tempo_advantage + 1 {
        strategic.push("Engine move gains more tempo".to_string());
    } else if user.tempo_advantage + 1 < 0 && engine.tempo_advantage >= 0 {
        lost.push("Your move loses tempo".to_string());
    }

    // Key ideas present in engine line but missing from user line
    for idea in &engine.key_ideas {
        if !user.key_ideas.iter().any(|u| u == idea) {
            let msg = format!("Misses: {}", idea);
            if !gained.contains(&msg) {
                gained.push(msg);
            }
        }
    }
    for idea in &user.key_ideas {
        if !engine.key_ideas.iter().any(|e| e == idea)
            && idea.to_lowercase().contains("weak")
        {
            strategic.push(format!("Your move creates: {}", idea));
        }
    }

    // Plan skeleton differences (immediate plans)
    for plan in &engine.plan.immediate {
        if !user.plan.immediate.iter().any(|p| p == plan) {
            let msg = format!("Engine plan: {}", plan);
            if !gained.contains(&msg) && gained.len() < 4 {
                gained.push(msg);
            }
        }
    }

    (lost, gained, strategic)
}

fn looks_like_concept(s: &str) -> bool {
    let lower = s.to_lowercase();
    lower.contains("initiative")
        || lower.contains("bishop pair")
        || lower.contains("space")
        || lower.contains("active")
        || lower.contains("outpost")
}

fn build_why_engine(
    concepts_lost: &[String],
    strategic: &[String],
    tactical: &[String],
    concepts_gained: &[String],
) -> Vec<String> {
    let mut why = Vec::new();

    let avoided: Vec<&str> = concepts_lost
        .iter()
        .chain(strategic.iter())
        .chain(tactical.iter())
        .map(|s| s.as_str())
        .take(5)
        .collect();

    if !avoided.is_empty() {
        why.push(format!(
            "Engine move avoids: {}",
            avoided.join("; ")
        ));
    }

    for g in concepts_gained.iter().take(3) {
        if !why.iter().any(|w| w.contains(g.as_str())) {
            why.push(g.clone());
        }
    }

    if why.is_empty() {
        why.push("Engine move leads to a more favorable position".to_string());
    }

    why
}

fn build_summary(
    user_san: &str,
    engine_san: &str,
    eval_diff_pawns: Option<f64>,
    concepts_lost: &[String],
    strategic: &[String],
    tactical: &[String],
    why_engine: &[String],
) -> String {
    let mut parts = Vec::new();

    if let Some(diff) = eval_diff_pawns {
        if diff > 0.01 {
            parts.push(format!(
                "Your move {} is {:.1} pawns worse than engine move {}.",
                user_san, diff, engine_san
            ));
        } else if diff < -0.01 {
            parts.push(format!(
                "Your move {} evaluates {:.1} pawns better than engine move {}.",
                user_san, -diff, engine_san
            ));
        } else {
            parts.push(format!(
                "Your move {} and engine move {} are close in evaluation.",
                user_san, engine_san
            ));
        }
    } else {
        parts.push(format!(
            "Comparing your move {} to engine move {}.",
            user_san, engine_san
        ));
    }

    let problems: Vec<&str> = concepts_lost
        .iter()
        .chain(strategic.iter())
        .chain(tactical.iter())
        .map(|s| s.as_str())
        .take(4)
        .collect();
    if !problems.is_empty() {
        parts.push(format!("Your move: {}", problems.join("; ")));
    }

    if let Some(first) = why_engine.first() {
        parts.push(first.clone());
    }

    parts.join(" ")
}

/// Whether a comparison is worth showing in the UI.
pub fn is_significant_comparison(c: &MoveComparison) -> bool {
    if c.user_move == c.engine_move {
        return false;
    }
    let has_content = !c.concepts_lost.is_empty()
        || !c.tactical_impact.is_empty()
        || !c.strategic_difference.is_empty()
        || !c.concepts_gained.is_empty();
    if has_content {
        return true;
    }
    match c.eval_diff_cp {
        Some(diff) => diff.abs() >= COMPARISON_THRESHOLD_CP,
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess;

    #[test]
    fn test_compare_same_move() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = compare_moves(&pos, "e2e4", "e2e4", None, None).unwrap();
        assert_eq!(result.user_move, result.engine_move);
        assert_eq!(result.user_move_san.as_deref(), Some("e4"));
        assert_eq!(result.engine_move_san.as_deref(), Some("e4"));
        assert!(!is_significant_comparison(&result));
    }

    #[test]
    fn test_compare_different_moves() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = compare_moves(&pos, "g1f3", "e2e4", None, None).unwrap();
        assert_eq!(result.user_move, "g1f3");
        assert_eq!(result.engine_move, "e2e4");
        assert_eq!(result.user_move_san.as_deref(), Some("Nf3"));
        assert_eq!(result.engine_move_san.as_deref(), Some("e4"));
        assert!(!result.fen_after_user.is_empty());
        assert!(!result.fen_after_engine.is_empty());
        assert!(!result.why_engine.is_empty());
        assert!(!result.summary.is_empty());
    }

    #[test]
    fn test_compare_with_scores() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = compare_moves(
            &pos,
            "g1f3",
            "e2e4",
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 0,
            }),
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 20,
            }),
        )
        .unwrap();
        assert_eq!(result.eval_diff_cp, Some(20));
        assert!((result.eval_diff_pawns.unwrap() - 0.2).abs() < 0.001);
        assert!(
            result.summary.contains("worse")
                || result.summary.contains("close")
                || result.summary.contains("Comparing")
                || result.summary.contains("pawns")
        );
    }

    #[test]
    fn test_illegal_move() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = compare_moves(&pos, "e2e5", "e2e4", None, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_significant_with_large_eval_gap() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = compare_moves(
            &pos,
            "f2f3",
            "e2e4",
            Some(ScoreData {
                kind: "cp".to_string(),
                value: -150,
            }),
            Some(ScoreData {
                kind: "cp".to_string(),
                value: 30,
            }),
        )
        .unwrap();
        assert_eq!(result.eval_diff_cp, Some(180));
        assert!(is_significant_comparison(&result));
        assert!(result.summary.contains("worse") || result.eval_diff_pawns.unwrap() > 1.0);
    }

    #[test]
    fn test_format_cp_helper() {
        use crate::analysis::feature_diff::format_cp;
        assert_eq!(format_cp(25), "+0.25");
        assert_eq!(format_cp(-80), "-0.80");
        assert_eq!(format_cp(0), "0.00");
    }
}
