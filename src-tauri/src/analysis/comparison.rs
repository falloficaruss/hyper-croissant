use shakmaty::{Chess, Position};

use crate::analysis::types::*;
use crate::analysis::extract_features;

pub fn compare_moves(
    pos: &Chess,
    user_move: &str,
    engine_move: &str,
    user_score: Option<ScoreData>,
    engine_score: Option<ScoreData>,
) -> Result<MoveComparison, String> {
    let user_pos = make_move_from_uci(pos, user_move)?;
    let user_features = extract_features(&user_pos);

    let engine_pos = make_move_from_uci(pos, engine_move)?;
    let engine_features = extract_features(&engine_pos);

    let mut concepts_lost = Vec::new();
    let mut tactical_impact = Vec::new();

    let user_total_mob =
        user_features.white.piece_activity.total_mobility
            + user_features.black.piece_activity.total_mobility;
    let engine_total_mob =
        engine_features.white.piece_activity.total_mobility
            + engine_features.black.piece_activity.total_mobility;
    if user_total_mob < engine_total_mob {
        concepts_lost.push("Piece activity decreased".to_string());
    }

    let user_pawn_islands = user_features.white.pawn_structure.island_count
        + user_features.black.pawn_structure.island_count;
    let engine_pawn_islands = engine_features.white.pawn_structure.island_count
        + engine_features.black.pawn_structure.island_count;
    if user_pawn_islands > engine_pawn_islands {
        concepts_lost.push("Pawn structure weakened".to_string());
    }

    if !user_features.white.tactical_precursors.hanging_pieces.is_empty()
        && engine_features.white.tactical_precursors.hanging_pieces.is_empty()
    {
        tactical_impact.push("Pieces became hanging".to_string());
    }

    let summary = if user_score.is_some() && engine_score.is_some() {
        let swing_desc = eval_swing_description(&user_score, &engine_score);
        format!(
            "{}. {}",
            swing_desc,
            if concepts_lost.is_empty() {
                "Both moves are similar in concept.".to_string()
            } else {
                format!("Your move: {}", concepts_lost.join("; "))
            }
        )
    } else if concepts_lost.is_empty() {
        "Both moves lead to similar positions.".to_string()
    } else {
        format!("Your move loses: {}", concepts_lost.join("; "))
    };

    Ok(MoveComparison {
        user_move: user_move.to_string(),
        engine_move: engine_move.to_string(),
        user_move_eval: user_score,
        engine_move_eval: engine_score,
        concepts_lost,
        tactical_impact,
        summary,
    })
}

fn eval_swing_description(
    user_score: &Option<ScoreData>,
    engine_score: &Option<ScoreData>,
) -> String {
    match (user_score, engine_score) {
        (Some(us), Some(es)) if us.kind == "cp" && es.kind == "cp" => {
            let diff = es.value - us.value;
            format!(
                "Eval swing: {} -> {} ({} centipawns)",
                format_cp(us.value),
                format_cp(es.value),
                if diff >= 0 { format!("+{}", diff) } else { diff.to_string() }
            )
        }
        _ => "Eval changed significantly.".to_string(),
    }
}

fn format_cp(cp: i32) -> String {
    let val = cp as f64 / 100.0;
    if val > 0.0 {
        format!("+{:.2}", val)
    } else {
        format!("{:.2}", val)
    }
}

fn make_move_from_uci(pos: &Chess, uci_str: &str) -> Result<Chess, String> {
    let uci_move = shakmaty::uci::UciMove::from_ascii(uci_str.as_bytes())
        .map_err(|e| format!("Invalid UCI: {}", e))?;
    let mv = uci_move
        .to_move(pos)
        .map_err(|_| format!("Illegal move: {}", uci_str))?;
    pos.clone()
        .play(mv)
        .map_err(|e| format!("Move failed: {:?}", e))
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
    }

    #[test]
    fn test_compare_different_moves() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = compare_moves(&pos, "g1f3", "e2e4", None, None).unwrap();
        assert_eq!(result.user_move, "g1f3");
        assert_eq!(result.engine_move, "e2e4");
    }

    #[test]
    fn test_compare_with_scores() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = compare_moves(
            &pos,
            "g1f3",
            "e2e4",
            Some(ScoreData { kind: "cp".to_string(), value: 0 }),
            Some(ScoreData { kind: "cp".to_string(), value: 20 }),
        ).unwrap();
        assert!(result.summary.contains("Eval swing"));
    }

    #[test]
    fn test_illegal_move() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let result = compare_moves(&pos, "e2e5", "e2e4", None, None);
        assert!(result.is_err());
    }
}
