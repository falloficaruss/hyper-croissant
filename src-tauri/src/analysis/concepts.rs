use shakmaty::{Chess, Color, Position, Role, Square};

use crate::analysis::types::*;

pub fn evaluate_concepts(pos: &Chess, features: &Features) -> ConceptEvaluation {
    let board = pos.board();
    let turn = pos.turn();

    let initiative = detect_initiative(turn, features);
    let tempo = evaluate_tempo(board);
    let key_ideas = generate_key_ideas(pos, features, turn);
    let plan = generate_plan(features, turn, &key_ideas);
    let summary = generate_summary(&initiative, tempo, &key_ideas, turn);

    ConceptEvaluation {
        initiative: initiative.map(|c| if c.is_white() { "white" } else { "black" }.to_string()),
        tempo_advantage: tempo,
        key_ideas,
        plan,
        strategic_summary: summary,
    }
}

fn detect_initiative(turn: Color, features: &Features) -> Option<Color> {
    let (active, opposing) = if turn.is_white() {
        (&features.white, &features.black)
    } else {
        (&features.black, &features.white)
    };

    let mut score = 0i32;

    if active.piece_activity.total_mobility > opposing.piece_activity.total_mobility + 5 {
        score += 1;
    }
    if active.space.controlled_opponent_side > opposing.space.controlled_opponent_side + 3 {
        score += 1;
    }
    if opposing.king_safety.pawn_shield_score < -2 {
        score += 1;
    }
    if opposing.king_safety.storm_attackers_near_king > 2 {
        score += 1;
    }
    if active.king_safety.pawn_shield_score < -2 {
        score -= 1;
    }

    if score >= 2 {
        Some(turn)
    } else if score <= -1 {
        Some(!turn)
    } else {
        None
    }
}

fn evaluate_tempo(board: &shakmaty::Board) -> i32 {
    let white_dev = development_count(board, Color::White) as i32;
    let black_dev = development_count(board, Color::Black) as i32;
    white_dev - black_dev
}

fn development_count(board: &shakmaty::Board, color: Color) -> u32 {
    let my_pieces = board.by_color(color);
    my_pieces
        .into_iter()
        .filter(|sq| {
            board.piece_at(*sq).map(|p| p.role).map_or(false, |role| {
                matches!(role, Role::Knight | Role::Bishop | Role::Rook | Role::Queen)
                    && !is_back_rank(*sq, color)
            })
        })
        .count() as u32
}

fn is_back_rank(sq: Square, color: Color) -> bool {
    let r = sq.rank().to_u32();
    if color == Color::White { r == 0 } else { r == 7 }
}

fn generate_key_ideas(pos: &Chess, features: &Features, turn: Color) -> Vec<String> {
    let mut ideas = Vec::new();
    let (active, opposing) = if turn.is_white() {
        (&features.white, &features.black)
    } else {
        (&features.black, &features.white)
    };

    if opposing.king_safety.pawn_shield_score < -1
        && active.king_safety.storm_attackers_near_king >= 2
    {
        ideas.push("Attack the king".to_string());
    }
    if opposing.pawn_structure.isolated_pawns.len() >= 2 {
        ideas.push("Target isolated pawns".to_string());
    }
    if !opposing.pawn_structure.passed_pawns.is_empty() {
        ideas.push("Stop opponent's passed pawns".to_string());
    }
    if !active.pawn_structure.passed_pawns.is_empty() {
        ideas.push("Push passed pawns".to_string());
    }
    if active.material.has_bishop_pair && !opposing.material.has_bishop_pair {
        ideas.push("Exploit bishop pair".to_string());
    }
    if active.space.controlled_opponent_side > opposing.space.controlled_opponent_side + 5 {
        ideas.push("Maintain space advantage".to_string());
    }
    if !active.tactical_precursors.pins.is_empty() {
        ideas.push("Exploit pinned pieces".to_string());
    }
    if !active.tactical_precursors.hanging_pieces.is_empty() {
        ideas.push("Capture hanging pieces".to_string());
    }
    if !active.files.open_files.is_empty() {
        ideas.push("Contest open files with rooks".to_string());
    }

    if ideas.is_empty() {
        if pos.checkers().any() {
            ideas.push("Deal with the check".to_string());
        } else if features.turn == "w" {
            ideas.push("Develop pieces and control the center".to_string());
        } else {
            ideas.push("Complete development and castle".to_string());
        }
    }

    ideas.truncate(4);
    ideas
}

fn generate_plan(
    features: &Features,
    _turn: Color,
    _key_ideas: &[String],
) -> PlanSkeleton {
    use std::collections::HashSet;

    let mut immediate = Vec::new();
    let mut medium = Vec::new();
    let mut long_term = Vec::new();

    let all_ideas: Vec<String> = features
        .white
        .tactical_precursors
        .hanging_pieces
        .iter()
        .chain(features.black.tactical_precursors.hanging_pieces.iter())
        .cloned()
        .collect();

    if !all_ideas.is_empty() {
        immediate.push("Capture hanging pieces".to_string());
    }
    if !features.white.tactical_precursors.pins.is_empty()
        || !features.black.tactical_precursors.pins.is_empty()
    {
        immediate.push("Add pressure to pinned pieces".to_string());
    }
    if immediate.is_empty() {
        immediate.push("Improve piece positioning".to_string());
    }

    let white_passed = features.white.pawn_structure.passed_pawns.clone();
    let black_passed = features.black.pawn_structure.passed_pawns.clone();
    if !white_passed.is_empty() || !black_passed.is_empty() {
        medium.push("Advance or stop passed pawns".to_string());
    }
    if features.white.material.has_bishop_pair || features.black.material.has_bishop_pair {
        medium.push("Open the position for bishop pair".to_string());
    }
    if medium.is_empty() {
        medium.push("Improve piece coordination".to_string());
    }
    long_term.push("Reach a favorable endgame".to_string());

    // Deduplicate
    let dedup = |items: Vec<String>| -> Vec<String> {
        let mut seen = HashSet::new();
        items.into_iter().filter(|x| seen.insert(x.clone())).collect()
    };

    PlanSkeleton {
        immediate: dedup(immediate),
        medium: dedup(medium),
        long_term: dedup(long_term),
    }
}

fn generate_summary(
    initiative: &Option<Color>,
    _tempo: i32,
    key_ideas: &[String],
    _turn: Color,
) -> String {
    let mut parts = Vec::new();

    match initiative {
        Some(_) => parts.push("One side has the initiative.".to_string()),
        None => parts.push("The position is roughly balanced.".to_string()),
    }

    if let Some(idea) = key_ideas.first() {
        parts.push(format!("Key idea: {}", idea));
    }

    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess;
    use crate::analysis::extract_features;

    #[test]
    fn test_concepts_start_position() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let feats = extract_features(&pos);
        let concepts = evaluate_concepts(&pos, &feats);
        assert!(concepts.initiative.is_none());
        assert!(!concepts.key_ideas.is_empty());
        assert!(!concepts.strategic_summary.is_empty());
    }
}
