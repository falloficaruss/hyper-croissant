//! Cluster engine multi-PV lines into idea groups for search-tree visualization.
//!
//! Pure chess logic — no LLM. Groups by first move, labels by eval gap from the
//! best line, and extracts symbolic reasons why non-main lines are weaker.

use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{Chess, Color, Position};

use crate::analysis::feature_diff::{
    extract_consequences, extract_new_tactics, format_cp, score_to_cp,
};
use crate::analysis::types::*;
use crate::analysis::{detect_tactics, evaluate_concepts, extract_features};
use crate::chess;

/// Minimum multipv lines before building a tree is useful.
pub const SEARCH_TREE_MIN_LINES: usize = 2;

/// Eval gap thresholds (centipawns, absolute, white-relative scores compared as-is).
const ALT_GAP_CP: i32 = 50;
const INFERIOR_GAP_CP: i32 = 200;

/// Build a search tree from engine multi-PV lines for `pos`.
///
/// Lines are clustered by first move. Each cluster is labeled Main / Alternative /
/// Inferior / Losing based on the gap from the best line's score. Non-main clusters
/// get symbolic "why rejected" reasons from feature/tactics diffs vs the main line.
pub fn build_search_tree(pos: &Chess, engine_lines: &[EngineLineInfo]) -> SearchTree {
    let fen = chess::pos_to_fen(pos);
    let mover = pos.turn();

    let mut prepared: Vec<PreparedLine> = engine_lines
        .iter()
        .filter_map(|line| prepare_line(pos, line))
        .collect();

    // Stable order: multipv ascending, then higher score for the mover first.
    prepared.sort_by(|a, b| {
        a.multipv
            .cmp(&b.multipv)
            .then_with(|| compare_score_for_mover(&b.score, &a.score, mover))
    });

    let depth = prepared.iter().map(|l| l.depth).max().unwrap_or(0);
    let best_score = prepared.first().map(|l| l.score.clone());
    let best_score_cp = best_score.as_ref().and_then(|s| score_to_cp(Some(s)));

    // Group by first UCI move, preserving first-seen order (best multipv first).
    let mut groups: Vec<LineGroup> = Vec::new();
    for line in prepared {
        if let Some(group) = groups.iter_mut().find(|g| g.first_move == line.first_move) {
            group.lines.push(line);
        } else {
            groups.push(LineGroup {
                first_move: line.first_move.clone(),
                first_move_san: line.first_move_san.clone(),
                lines: vec![line],
            });
        }
    }

    // Main group = the one containing multipv 1, else first group.
    let main_idx = groups
        .iter()
        .position(|g| g.lines.iter().any(|l| l.multipv == 1))
        .unwrap_or(0);

    let main_after = groups
        .get(main_idx)
        .and_then(|g| play_uci(pos, &g.first_move).ok());
    let main_features = main_after.as_ref().map(|p| extract_features(p));
    let main_concepts = main_after
        .as_ref()
        .zip(main_features.as_ref())
        .map(|(p, f)| evaluate_concepts(p, f));

    let mut clusters: Vec<SearchTreeCluster> = Vec::with_capacity(groups.len());

    for (idx, group) in groups.into_iter().enumerate() {
        let is_main = idx == main_idx;
        // Representative = best multipv (lowest) in the group, already sorted.
        let rep = &group.lines[0];
        let cluster_score = rep.score.clone();
        let cluster_cp = score_to_cp(Some(&cluster_score));
        let eval_gap_cp = match (best_score_cp, cluster_cp) {
            (Some(best), Some(c)) => Some(gap_from_best(best, c, mover)),
            _ => None,
        };

        let category = if is_main {
            SearchTreeCategory::Main
        } else {
            categorize_gap(eval_gap_cp)
        };

        let after = play_uci(pos, &group.first_move).ok();
        let ideas = after
            .as_ref()
            .map(|p| extract_line_ideas(p))
            .unwrap_or_default();

        let why_rejected = if is_main {
            Vec::new()
        } else if let (Some(main_pos), Some(main_feat), Some(alt_pos)) =
            (main_after.as_ref(), main_features.as_ref(), after.as_ref())
        {
            reject_reasons(pos, main_pos, main_feat, main_concepts.as_ref(), alt_pos, mover)
        } else {
            Vec::new()
        };

        let label = cluster_label(&category, &group.first_move_san, &ideas, is_main);
        let summary = cluster_summary(
            &category,
            &group.first_move_san,
            &cluster_score,
            eval_gap_cp,
            &why_rejected,
            &ideas,
        );

        let win_percent = cluster_cp
            .map(cp_to_win_percent)
            .unwrap_or(50.0);
        // Bar width relative to best line's advantage magnitude (for visualization).
        let bar_ratio = bar_ratio(best_score_cp, cluster_cp, mover);

        let lines: Vec<SearchTreeLine> = group
            .lines
            .into_iter()
            .map(|l| SearchTreeLine {
                multipv: l.multipv,
                depth: l.depth,
                score: l.score,
                score_cp: l.score_cp,
                pv: l.pv,
                pv_san: l.pv_san,
                first_move: l.first_move,
                first_move_san: l.first_move_san,
            })
            .collect();

        clusters.push(SearchTreeCluster {
            id: format!("{}-{}", group.first_move, idx),
            label,
            category,
            first_move: group.first_move,
            first_move_san: group.first_move_san,
            best_score: cluster_score,
            best_score_cp: cluster_cp,
            eval_gap_cp,
            win_percent,
            bar_ratio,
            lines,
            ideas,
            why_rejected,
            summary,
        });
    }

    // Sort: main first, then by ascending gap (better alternatives first).
    clusters.sort_by(|a, b| {
        let a_main = matches!(a.category, SearchTreeCategory::Main);
        let b_main = matches!(b.category, SearchTreeCategory::Main);
        match (a_main, b_main) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a
                .eval_gap_cp
                .unwrap_or(0)
                .cmp(&b.eval_gap_cp.unwrap_or(0))
                .then_with(|| a.first_move.cmp(&b.first_move)),
        }
    });

    SearchTree {
        fen,
        depth,
        best_score,
        best_score_cp,
        clusters,
    }
}

// ── Internals ──────────────────────────────────────────────────────────────

struct PreparedLine {
    multipv: u32,
    depth: u32,
    score: ScoreData,
    score_cp: Option<i32>,
    pv: Vec<String>,
    pv_san: Vec<String>,
    first_move: String,
    first_move_san: Option<String>,
}

struct LineGroup {
    first_move: String,
    first_move_san: Option<String>,
    lines: Vec<PreparedLine>,
}

fn prepare_line(pos: &Chess, line: &EngineLineInfo) -> Option<PreparedLine> {
    let first = line.pv.first()?.clone();
    if first.len() < 4 {
        return None;
    }
    let (pv_san, first_san) = pv_to_san(pos, &line.pv);
    Some(PreparedLine {
        multipv: line.multipv.unwrap_or(1),
        depth: line.depth,
        score: line.score.clone(),
        score_cp: score_to_cp(Some(&line.score)),
        pv: line.pv.clone(),
        pv_san,
        first_move: first,
        first_move_san: first_san,
    })
}

fn pv_to_san(pos: &Chess, pv: &[String]) -> (Vec<String>, Option<String>) {
    let mut cur = pos.clone();
    let mut sans = Vec::with_capacity(pv.len());
    let mut first_san = None;

    for (i, uci_str) in pv.iter().enumerate() {
        match play_uci_san(&cur, uci_str) {
            Ok((next, san)) => {
                if i == 0 {
                    first_san = Some(san.clone());
                }
                sans.push(san);
                cur = next;
            }
            Err(_) => {
                sans.push(uci_str.clone());
                break;
            }
        }
    }

    (sans, first_san)
}

fn play_uci(pos: &Chess, uci_str: &str) -> Result<Chess, String> {
    let uci = UciMove::from_ascii(uci_str.as_bytes())
        .map_err(|e| format!("Invalid UCI: {}", e))?;
    let mv = uci
        .to_move(pos)
        .map_err(|_| format!("Illegal move: {}", uci_str))?;
    pos.clone()
        .play(mv)
        .map_err(|e| format!("Move failed: {:?}", e))
}

fn play_uci_san(pos: &Chess, uci_str: &str) -> Result<(Chess, String), String> {
    let uci = UciMove::from_ascii(uci_str.as_bytes())
        .map_err(|e| format!("Invalid UCI: {}", e))?;
    let mv = uci
        .to_move(pos)
        .map_err(|_| format!("Illegal move: {}", uci_str))?;
    let san = San::from_move(pos, mv.clone()).to_string();
    let after = pos
        .clone()
        .play(mv)
        .map_err(|e| format!("Move failed: {:?}", e))?;
    Ok((after, san))
}

/// Gap from best score for the side to move (positive = this line is worse).
fn gap_from_best(best_cp: i32, line_cp: i32, mover: Color) -> i32 {
    let best_m = if mover == Color::White {
        best_cp
    } else {
        -best_cp
    };
    let line_m = if mover == Color::White {
        line_cp
    } else {
        -line_cp
    };
    best_m - line_m
}

fn categorize_gap(gap: Option<i32>) -> SearchTreeCategory {
    match gap {
        None => SearchTreeCategory::Alternative,
        Some(g) if g <= ALT_GAP_CP => SearchTreeCategory::Alternative,
        Some(g) if g <= INFERIOR_GAP_CP => SearchTreeCategory::Inferior,
        Some(_) => SearchTreeCategory::Losing,
    }
}

fn compare_score_for_mover(a: &ScoreData, b: &ScoreData, mover: Color) -> std::cmp::Ordering {
    let a_cp = score_to_cp(Some(a)).unwrap_or(0);
    let b_cp = score_to_cp(Some(b)).unwrap_or(0);
    let a_m = if mover == Color::White { a_cp } else { -a_cp };
    let b_m = if mover == Color::White { b_cp } else { -b_cp };
    a_m.cmp(&b_m)
}

fn extract_line_ideas(after: &Chess) -> Vec<String> {
    let features = extract_features(after);
    let concepts = evaluate_concepts(after, &features);
    let tactics = detect_tactics(after);

    let mut ideas: Vec<String> = Vec::new();

    for t in tactics.into_iter().take(3) {
        if !ideas.contains(&t.description) {
            ideas.push(t.description);
        }
    }
    for idea in concepts.key_ideas.into_iter().take(4) {
        if !ideas.contains(&idea) {
            ideas.push(idea);
        }
    }
    if !concepts.strategic_summary.is_empty() && ideas.is_empty() {
        ideas.push(concepts.strategic_summary);
    }

    ideas.truncate(5);
    ideas
}

fn reject_reasons(
    root: &Chess,
    main_pos: &Chess,
    main_features: &Features,
    main_concepts: Option<&ConceptEvaluation>,
    alt_pos: &Chess,
    mover: Color,
) -> Vec<String> {
    let alt_features = extract_features(alt_pos);
    let alt_concepts = evaluate_concepts(alt_pos, &alt_features);

    // What gets worse for the mover on the alternative vs the main line.
    let mut reasons = extract_consequences(main_features, &alt_features, mover);

    // Tactics that appear only after the alt move (often opponent resources).
    for t in extract_new_tactics(root, alt_pos) {
        let msg = format!("Allows: {}", t);
        if !reasons.contains(&msg) {
            reasons.push(msg);
        }
    }

    // Tactics present after main that alt misses.
    for t in extract_new_tactics(root, main_pos) {
        let msg = format!("Misses: {}", t);
        if !reasons.contains(&msg) {
            reasons.push(msg);
        }
    }

    if let Some(main_c) = main_concepts {
        for idea in &main_c.key_ideas {
            if !alt_concepts.key_ideas.contains(idea) {
                let msg = format!("Gives up: {}", idea);
                if !reasons.contains(&msg) {
                    reasons.push(msg);
                }
            }
        }
        for idea in &alt_concepts.key_ideas {
            if !main_c.key_ideas.contains(idea)
                && (idea.contains("weak")
                    || idea.contains("hang")
                    || idea.contains("pin")
                    || idea.contains("unsafe")
                    || idea.contains("exposed"))
            {
                let msg = format!("Creates: {}", idea);
                if !reasons.contains(&msg) {
                    reasons.push(msg);
                }
            }
        }
    }

    reasons.truncate(6);
    reasons
}

fn cluster_label(
    category: &SearchTreeCategory,
    san: &Option<String>,
    ideas: &[String],
    is_main: bool,
) -> String {
    let move_label = san.as_deref().unwrap_or("?");
    if is_main {
        if let Some(idea) = ideas.first() {
            // Shorten long idea strings for the header.
            let short = truncate_idea(idea, 40);
            return format!("Main idea: {} — {}", move_label, short);
        }
        return format!("Main idea: {}", move_label);
    }

    let prefix = match category {
        SearchTreeCategory::Main => "Main idea",
        SearchTreeCategory::Alternative => "Alternative",
        SearchTreeCategory::Inferior => "Inferior",
        SearchTreeCategory::Losing => "Losing line",
    };

    // Prefer a short tactical tag when available.
    if let Some(idea) = ideas.first() {
        let short = truncate_idea(idea, 32);
        return format!("{}: {} — {}", prefix, move_label, short);
    }
    format!("{}: {}", prefix, move_label)
}

fn truncate_idea(s: &str, max: usize) -> String {
    let trimmed = s.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let mut out: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn cluster_summary(
    category: &SearchTreeCategory,
    san: &Option<String>,
    score: &ScoreData,
    gap: Option<i32>,
    why_rejected: &[String],
    ideas: &[String],
) -> String {
    let move_label = san.as_deref().unwrap_or("this move");
    let score_str = format_score(score);

    match category {
        SearchTreeCategory::Main => {
            if let Some(idea) = ideas.first() {
                format!(
                    "{} is the engine's main idea ({}). {}",
                    move_label, score_str, idea
                )
            } else {
                format!("{} is the engine's main idea ({}).", move_label, score_str)
            }
        }
        _ => {
            let gap_str = gap
                .map(|g| format!(" — {} worse than best", format_cp(g)))
                .unwrap_or_default();
            if let Some(reason) = why_rejected.first() {
                format!(
                    "Engine rejects {} ({}){}. {}",
                    move_label, score_str, gap_str, reason
                )
            } else if let Some(idea) = ideas.first() {
                format!(
                    "Engine ranks {} lower ({}){}. {}",
                    move_label, score_str, gap_str, idea
                )
            } else {
                format!(
                    "Engine ranks {} lower ({}){}.",
                    move_label, score_str, gap_str
                )
            }
        }
    }
}

fn format_score(score: &ScoreData) -> String {
    if score.kind == "cp" {
        format_cp(score.value)
    } else if score.value > 0 {
        format!("+#{}", score.value)
    } else {
        format!("-#{}", score.value.abs())
    }
}

/// Map white-relative cp → win% for the side the score favors (white).
fn cp_to_win_percent(cp: i32) -> f64 {
    50.0 + 50.0 * (2.0 / (1.0 + (-0.004 * cp as f64).exp()) - 1.0)
}

/// Bar fill 0.0–1.0 relative to the best line (main = 1.0).
fn bar_ratio(best_cp: Option<i32>, line_cp: Option<i32>, mover: Color) -> f64 {
    let (Some(best), Some(line)) = (best_cp, line_cp) else {
        return 0.5;
    };
    let best_m = if mover == Color::White { best } else { -best };
    let line_m = if mover == Color::White { line } else { -line };

    // Map mover-relative scores through a soft sigmoid so large losses still show a stub.
    let best_w = soft_weight(best_m);
    let line_w = soft_weight(line_m);
    if best_w <= f64::EPSILON {
        return 0.5;
    }
    (line_w / best_w).clamp(0.05, 1.0)
}

fn soft_weight(cp: i32) -> f64 {
    // Shift so equal positions still have positive mass.
    let win = 1.0 / (1.0 + (-0.004 * cp as f64).exp());
    win.max(0.05)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess;

    fn start_pos() -> Chess {
        chess::parse_fen(chess::START_FEN).unwrap()
    }

    fn line(multipv: u32, depth: u32, cp: i32, pv: &[&str]) -> EngineLineInfo {
        EngineLineInfo {
            depth,
            score: ScoreData {
                kind: "cp".into(),
                value: cp,
            },
            pv: pv.iter().map(|s| s.to_string()).collect(),
            multipv: Some(multipv),
        }
    }

    #[test]
    fn clusters_by_first_move() {
        let pos = start_pos();
        let lines = vec![
            line(1, 18, 35, &["e2e4", "e7e5", "g1f3"]),
            line(2, 18, 30, &["d2d4", "d7d5", "c2c4"]),
            line(3, 18, 28, &["e2e4", "c7c5"]), // same first move as multipv1
        ];
        let tree = build_search_tree(&pos, &lines);
        assert_eq!(tree.clusters.len(), 2, "e2e4 and d2d4 should form 2 clusters");
        let main = tree
            .clusters
            .iter()
            .find(|c| matches!(c.category, SearchTreeCategory::Main))
            .expect("main cluster");
        assert_eq!(main.first_move, "e2e4");
        assert_eq!(main.lines.len(), 2);
        assert!(main.first_move_san.as_deref() == Some("e4"));
    }

    #[test]
    fn categorizes_by_eval_gap() {
        let pos = start_pos();
        let lines = vec![
            line(1, 16, 40, &["e2e4"]),
            line(2, 16, 20, &["d2d4"]),   // gap 20 → alternative
            line(3, 16, -80, &["g1f3"]),  // gap 120 → inferior
            line(4, 16, -300, &["a2a4"]), // gap 340 → losing
        ];
        let tree = build_search_tree(&pos, &lines);
        assert_eq!(tree.clusters.len(), 4);

        let cat = |uci: &str| {
            tree.clusters
                .iter()
                .find(|c| c.first_move == uci)
                .map(|c| c.category.clone())
                .unwrap()
        };
        assert!(matches!(cat("e2e4"), SearchTreeCategory::Main));
        assert!(matches!(cat("d2d4"), SearchTreeCategory::Alternative));
        assert!(matches!(cat("g1f3"), SearchTreeCategory::Inferior));
        assert!(matches!(cat("a2a4"), SearchTreeCategory::Losing));
    }

    #[test]
    fn main_has_no_rejection_reasons() {
        let pos = start_pos();
        let lines = vec![
            line(1, 12, 30, &["e2e4", "e7e5"]),
            line(2, 12, 10, &["d2d4", "d7d5"]),
        ];
        let tree = build_search_tree(&pos, &lines);
        let main = tree
            .clusters
            .iter()
            .find(|c| matches!(c.category, SearchTreeCategory::Main))
            .unwrap();
        assert!(main.why_rejected.is_empty());
        assert!(!main.summary.is_empty());
        assert!(main.bar_ratio >= 0.99);
    }

    #[test]
    fn empty_lines_yield_empty_tree() {
        let pos = start_pos();
        let tree = build_search_tree(&pos, &[]);
        assert!(tree.clusters.is_empty());
        assert_eq!(tree.depth, 0);
    }

    #[test]
    fn pv_san_populated() {
        let pos = start_pos();
        let lines = vec![line(1, 10, 25, &["e2e4", "e7e5", "g1f3"])];
        let tree = build_search_tree(&pos, &lines);
        let main = &tree.clusters[0];
        assert_eq!(main.lines[0].pv_san, vec!["e4", "e5", "Nf3"]);
    }

    #[test]
    fn black_to_move_gap_uses_mover_perspective() {
        // After 1.e4, black to move
        let fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        // Scores are white-relative: lower is better for Black.
        let lines = vec![
            line(1, 14, -20, &["e7e5"]),
            line(2, 14, 80, &["g8f6"]), // worse for black (higher white score)
        ];
        let tree = build_search_tree(&pos, &lines);
        let alt = tree
            .clusters
            .iter()
            .find(|c| c.first_move == "g8f6")
            .unwrap();
        assert!(
            alt.eval_gap_cp.unwrap() > 0,
            "alt should be worse for the mover"
        );
        assert!(!matches!(alt.category, SearchTreeCategory::Main));
    }
}
