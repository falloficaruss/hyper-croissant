//! Shared feature / tactics diff helpers used by eval_swing and comparison.

use shakmaty::{Chess, Color};

use crate::analysis::types::*;
use crate::analysis::detect_tactics;

/// Extract positional consequences of going from `before` features to `after`,
/// from the perspective of `mover` (things that got worse for them / better for opponent).
pub fn extract_consequences(before: &Features, after: &Features, mover: Color) -> Vec<String> {
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

    // Files — open_files is shared per position via white side
    let new_open_global =
        new_items_u32(&before.white.files.open_files, &after.white.files.open_files);
    for f in new_open_global.into_iter().take(2) {
        if let Some(name) = file_name(f) {
            out.push(format!("{} opened the {}-file", them_label, name));
        }
    }

    // Piece activity
    if after_us.piece_activity.total_mobility + 4 < before_us.piece_activity.total_mobility {
        out.push(format!("{}'s pieces became less active", us_label));
    }
    if after_them.piece_activity.total_mobility > before_them.piece_activity.total_mobility + 4 {
        out.push(format!("{}'s pieces became more active", them_label));
    }

    // Space
    if after_us.space.controlled_opponent_side + 2 < before_us.space.controlled_opponent_side {
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

/// Tactics present in `after` but not in `before`.
pub fn extract_new_tactics(before: &Chess, after: &Chess) -> Vec<String> {
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

/// Convert ScoreData to approximate centipawns (white-relative).
pub fn score_to_cp(score: Option<&ScoreData>) -> Option<i32> {
    match score {
        Some(s) if s.kind == "cp" => Some(s.value),
        Some(s) if s.kind == "mate" => {
            if s.value > 0 {
                Some(10000 - s.value.saturating_mul(10).min(9000))
            } else {
                Some(-10000 - s.value.saturating_mul(10).max(-9000))
            }
        }
        _ => None,
    }
}

/// Difference engine_score - user_score from the mover's perspective
/// (positive = engine line is better for the side that moved).
pub fn eval_diff_cp_mover_relative(
    user_score: Option<&ScoreData>,
    engine_score: Option<&ScoreData>,
    mover: Color,
) -> Option<i32> {
    let u = score_to_cp(user_score)?;
    let e = score_to_cp(engine_score)?;
    // White-relative → mover-relative
    let u_m = if mover == Color::White { u } else { -u };
    let e_m = if mover == Color::White { e } else { -e };
    Some(e_m - u_m)
}

pub fn format_cp(cp: i32) -> String {
    let val = cp as f64 / 100.0;
    if val > 0.0 {
        format!("+{:.2}", val)
    } else {
        format!("{:.2}", val)
    }
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
