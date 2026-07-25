use serde_json::{json, Value};

use crate::analysis::types::*;

#[derive(Debug, Clone)]
pub enum ExplanationLevel {
    Basic,
    Standard,
    Deep,
}

impl ExplanationLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            ExplanationLevel::Basic => "basic",
            ExplanationLevel::Standard => "standard",
            ExplanationLevel::Deep => "deep",
        }
    }
}

/// Build a structured JSON prompt for explaining a position analysis.
pub fn build_analysis_prompt(
    analysis: &StructuredAnalysis,
    level: &ExplanationLevel,
    user_question: Option<&str>,
) -> Value {
    json!({
        "type": "explain_position",
        "explanation_level": level.as_str(),
        "user_question": user_question.unwrap_or("What are the key ideas in this position?"),
        "analysis": {
            "fen": analysis.fen,
            "best_move": analysis.engine_lines.first().and_then(|l| l.pv.first()).cloned().unwrap_or_default(),
            "evaluation": analysis.engine_lines.first().map(|l| format_score_data(&l.score)).unwrap_or_default(),
            "concepts": {
                "initiative": analysis.concepts.initiative,
                "tempo_advantage": analysis.concepts.tempo_advantage,
                "key_ideas": analysis.concepts.key_ideas,
                "plan": {
                    "immediate": analysis.concepts.plan.immediate,
                    "three_move": analysis.concepts.plan.medium,
                    "long_term": analysis.concepts.plan.long_term,
                },
                "strategic_summary": analysis.concepts.strategic_summary,
            },
            "tactics": analysis.tactics.iter().map(|t| json!({
                "motif": t.motif_type,
                "target": t.target,
                "description": t.description,
                "severity": t.severity,
            })).collect::<Vec<_>>(),
            "features": {
                "material": {
                    "white": {
                        "pawns": analysis.features.white.material.pieces.pawns,
                        "knights": analysis.features.white.material.pieces.knights,
                        "bishops": analysis.features.white.material.pieces.bishops,
                        "rooks": analysis.features.white.material.pieces.rooks,
                        "queens": analysis.features.white.material.pieces.queens,
                        "bishop_pair": analysis.features.white.material.has_bishop_pair,
                    },
                    "black": {
                        "pawns": analysis.features.black.material.pieces.pawns,
                        "knights": analysis.features.black.material.pieces.knights,
                        "bishops": analysis.features.black.material.pieces.bishops,
                        "rooks": analysis.features.black.material.pieces.rooks,
                        "queens": analysis.features.black.material.pieces.queens,
                        "bishop_pair": analysis.features.black.material.has_bishop_pair,
                    },
                },
                "king_safety": {
                    "white": analysis.features.white.king_safety.pawn_shield_score,
                    "black": analysis.features.black.king_safety.pawn_shield_score,
                },
                "pawn_structure": {
                    "white_islands": analysis.features.white.pawn_structure.island_count,
                    "black_islands": analysis.features.black.pawn_structure.island_count,
                    "passed_pawns": analysis.features.white.pawn_structure.passed_pawns,
                },
            },
        }
    })
}

/// Build a structured JSON prompt for comparing two moves.
pub fn build_comparison_prompt(
    comparison: &MoveComparison,
    level: &ExplanationLevel,
    user_question: Option<&str>,
) -> Value {
    json!({
        "type": "compare_moves",
        "explanation_level": level.as_str(),
        "user_question": user_question.unwrap_or("Why was my move worse?"),
        "comparison": {
            "user_move": comparison.user_move,
            "engine_move": comparison.engine_move,
            "user_move_san": comparison.user_move_san,
            "engine_move_san": comparison.engine_move_san,
            "user_move_eval": comparison.user_move_eval.as_ref().map(format_score_data),
            "engine_move_eval": comparison.engine_move_eval.as_ref().map(format_score_data),
            "eval_diff_cp": comparison.eval_diff_cp,
            "eval_diff_pawns": comparison.eval_diff_pawns,
            "concepts_lost": comparison.concepts_lost,
            "concepts_gained": comparison.concepts_gained,
            "tactical_impact": comparison.tactical_impact,
            "strategic_difference": comparison.strategic_difference,
            "why_engine": comparison.why_engine,
            "summary": comparison.summary,
        },
    })
}

/// Build a structured JSON prompt for explaining an evaluation swing.
pub fn build_swing_prompt(
    swing: &EvalSwing,
    level: &ExplanationLevel,
    user_question: Option<&str>,
) -> Value {
    json!({
        "type": "explain_swing",
        "explanation_level": level.as_str(),
        "user_question": user_question.unwrap_or("Why did the evaluation change after this move?"),
        "eval_swing": {
            "user_move": swing.user_move,
            "user_move_san": swing.user_move_san,
            "eval_before": swing.eval_before.as_ref().map(format_score_data),
            "eval_after": swing.eval_after.as_ref().map(format_score_data),
            "swing_pawns": swing.swing_pawns,
            "swing_cp": swing.swing_cp,
            "severity": swing.severity,
            "consequences": swing.consequences,
            "tactical_motifs": swing.tactical_motifs,
            "summary": swing.summary,
        },
    })
}

fn format_score_data(score: &ScoreData) -> String {
    if score.kind == "cp" {
        let val = score.value as f64 / 100.0;
        if val > 0.0 {
            format!("+{:.2}", val)
        } else {
            format!("{:.2}", val)
        }
    } else {
        format!("#{}", score.value)
    }
}

/// A single turn in a coach-mode conversation (for structured prompts).
#[derive(Debug, Clone, serde::Serialize)]
pub struct CoachHistoryEntry {
    pub role: String,
    pub content: String,
}

/// Build a structured JSON prompt for interactive coach mode.
///
/// When `revealed` is false, the coach must ask Socratic questions and must not
/// spoil the best move / full plan. When true, the coach may fully explain.
pub fn build_coach_prompt(
    analysis: &StructuredAnalysis,
    level: &ExplanationLevel,
    conversation_history: &[CoachHistoryEntry],
    revealed: bool,
    user_message: Option<&str>,
) -> Value {
    let best_move = analysis
        .engine_lines
        .first()
        .and_then(|l| l.pv.first())
        .cloned()
        .unwrap_or_default();
    let evaluation = analysis
        .engine_lines
        .first()
        .map(|l| format_score_data(&l.score))
        .unwrap_or_default();

    let prompt_type = if revealed {
        "coach_reveal"
    } else if conversation_history.is_empty() && user_message.is_none() {
        "coach_question"
    } else {
        "coach_follow_up"
    };

    json!({
        "type": prompt_type,
        "explanation_level": level.as_str(),
        "hidden": !revealed,
        "user_message": user_message,
        "conversation_history": conversation_history,
        "analysis": {
            "fen": analysis.fen,
            "best_move": best_move,
            "evaluation": evaluation,
            "concepts": {
                "initiative": analysis.concepts.initiative,
                "tempo_advantage": analysis.concepts.tempo_advantage,
                "key_ideas": analysis.concepts.key_ideas,
                "plan": {
                    "immediate": analysis.concepts.plan.immediate,
                    "three_move": analysis.concepts.plan.medium,
                    "long_term": analysis.concepts.plan.long_term,
                },
                "strategic_summary": analysis.concepts.strategic_summary,
            },
            "tactics": analysis.tactics.iter().map(|t| json!({
                "motif": t.motif_type,
                "target": t.target,
                "description": t.description,
                "severity": t.severity,
            })).collect::<Vec<_>>(),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_build_analysis_prompt_produces_valid_json() {
        // Create a minimal StructuredAnalysis for testing
        let analysis = StructuredAnalysis {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
            features: Features {
                white: SideFeatures {
                    king_safety: KingSafety { pawn_shield_score: 0, open_files_near_king: vec![], storm_attackers_near_king: 0 },
                    pawn_structure: PawnStructure { island_count: 0, passed_pawns: vec![], backward_pawns: vec![], doubled_pawns: vec![], isolated_pawns: vec![] },
                    files: FileInfo { open_files: vec![], half_open_for: vec![] },
                    square_control: SquareControl { weak_squares: vec![], outposts: vec![] },
                    piece_activity: PieceActivity { total_mobility: 0, centralization: 0.0, piece_scores: vec![] },
                    space: SpaceInfo { controlled_opponent_side: 0 },
                    material: MaterialInfo { pieces: PieceCount { pawns: 8, knights: 2, bishops: 2, rooks: 2, queens: 1 }, has_bishop_pair: true },
                    tactical_precursors: TacticalPrecursors { hanging_pieces: vec![], undefended_pieces: vec![], pins: vec![], forks: vec![] },
                },
                black: SideFeatures {
                    king_safety: KingSafety { pawn_shield_score: 0, open_files_near_king: vec![], storm_attackers_near_king: 0 },
                    pawn_structure: PawnStructure { island_count: 0, passed_pawns: vec![], backward_pawns: vec![], doubled_pawns: vec![], isolated_pawns: vec![] },
                    files: FileInfo { open_files: vec![], half_open_for: vec![] },
                    square_control: SquareControl { weak_squares: vec![], outposts: vec![] },
                    piece_activity: PieceActivity { total_mobility: 0, centralization: 0.0, piece_scores: vec![] },
                    space: SpaceInfo { controlled_opponent_side: 0 },
                    material: MaterialInfo { pieces: PieceCount { pawns: 8, knights: 2, bishops: 2, rooks: 2, queens: 1 }, has_bishop_pair: true },
                    tactical_precursors: TacticalPrecursors { hanging_pieces: vec![], undefended_pieces: vec![], pins: vec![], forks: vec![] },
                },
                turn: "w".to_string(),
            },
            concepts: ConceptEvaluation {
                initiative: None,
                tempo_advantage: 0,
                key_ideas: vec!["Develop pieces and control the center".to_string()],
                plan: PlanSkeleton { immediate: vec!["Improve piece positioning".to_string()], medium: vec!["Improve piece coordination".to_string()], long_term: vec!["Reach a favorable endgame".to_string()] },
                strategic_summary: "The position is roughly balanced. Key idea: Develop pieces and control the center.".to_string(),
            },
            tactics: vec![],
            engine_lines: vec![EngineLineInfo {
                depth: 18,
                score: ScoreData { kind: "cp".to_string(), value: 20 },
                pv: vec!["e2e4".to_string(), "e7e5".to_string(), "g1f3".to_string()],
                multipv: Some(1),
            }],
        };

        let prompt = build_analysis_prompt(&analysis, &ExplanationLevel::Standard, None);
        // Just verify it produces valid JSON (serde_json::to_string doesn't panic)
        let json_str = serde_json::to_string(&prompt).unwrap();
        assert!(json_str.contains("explain_position"));
        assert!(json_str.contains("explanation_level"));
        assert!(json_str.contains("standard"));
    }

    #[test]
    fn test_build_comparison_prompt() {
        let comparison = MoveComparison {
            fen_before: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
            fen_after_user: "rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 1 1".to_string(),
            fen_after_engine: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1".to_string(),
            user_move: "g1f3".to_string(),
            engine_move: "e2e4".to_string(),
            user_move_san: Some("Nf3".to_string()),
            engine_move_san: Some("e4".to_string()),
            user_move_eval: Some(ScoreData { kind: "cp".to_string(), value: 0 }),
            engine_move_eval: Some(ScoreData { kind: "cp".to_string(), value: 20 }),
            eval_diff_cp: Some(20),
            eval_diff_pawns: Some(0.2),
            concepts_lost: vec!["Your move loses the initiative".to_string()],
            concepts_gained: vec!["Engine move keeps the initiative".to_string()],
            tactical_impact: vec![],
            strategic_difference: vec!["White's pieces became less active".to_string()],
            why_engine: vec!["Engine move avoids: Your move loses the initiative".to_string()],
            summary: "Your move Nf3 is 0.2 pawns worse than engine move e4.".to_string(),
        };

        let prompt = build_comparison_prompt(&comparison, &ExplanationLevel::Basic, None);
        let json_str = serde_json::to_string(&prompt).unwrap();
        assert!(json_str.contains("compare_moves"));
        assert!(json_str.contains("g1f3"));
        assert!(json_str.contains("why_engine"));
        assert!(json_str.contains("eval_diff_pawns"));
    }

    #[test]
    fn test_build_swing_prompt() {
        let swing = EvalSwing {
            fen_before: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
            fen_after: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1".to_string(),
            user_move: "e2e4".to_string(),
            user_move_san: Some("e4".to_string()),
            eval_before: Some(ScoreData { kind: "cp".to_string(), value: 20 }),
            eval_after: Some(ScoreData { kind: "cp".to_string(), value: -180 }),
            swing_cp: Some(-200),
            swing_pawns: Some(-2.0),
            consequences: vec!["f3 square became weak".to_string()],
            tactical_motifs: vec![],
            severity: SwingSeverity::Blunder,
            summary: "You lost 2.0 pawns. Reason: f3 square became weak".to_string(),
        };

        let prompt = build_swing_prompt(&swing, &ExplanationLevel::Standard, None);
        let json_str = serde_json::to_string(&prompt).unwrap();
        assert!(json_str.contains("explain_swing"));
        assert!(json_str.contains("e2e4"));
        assert!(json_str.contains("consequences"));
    }

    fn sample_analysis() -> StructuredAnalysis {
        StructuredAnalysis {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
            features: Features {
                white: SideFeatures {
                    king_safety: KingSafety {
                        pawn_shield_score: 0,
                        open_files_near_king: vec![],
                        storm_attackers_near_king: 0,
                    },
                    pawn_structure: PawnStructure {
                        island_count: 0,
                        passed_pawns: vec![],
                        backward_pawns: vec![],
                        doubled_pawns: vec![],
                        isolated_pawns: vec![],
                    },
                    files: FileInfo {
                        open_files: vec![],
                        half_open_for: vec![],
                    },
                    square_control: SquareControl {
                        weak_squares: vec![],
                        outposts: vec![],
                    },
                    piece_activity: PieceActivity {
                        total_mobility: 0,
                        centralization: 0.0,
                        piece_scores: vec![],
                    },
                    space: SpaceInfo {
                        controlled_opponent_side: 0,
                    },
                    material: MaterialInfo {
                        pieces: PieceCount {
                            pawns: 8,
                            knights: 2,
                            bishops: 2,
                            rooks: 2,
                            queens: 1,
                        },
                        has_bishop_pair: true,
                    },
                    tactical_precursors: TacticalPrecursors {
                        hanging_pieces: vec![],
                        undefended_pieces: vec![],
                        pins: vec![],
                        forks: vec![],
                    },
                },
                black: SideFeatures {
                    king_safety: KingSafety {
                        pawn_shield_score: 0,
                        open_files_near_king: vec![],
                        storm_attackers_near_king: 0,
                    },
                    pawn_structure: PawnStructure {
                        island_count: 0,
                        passed_pawns: vec![],
                        backward_pawns: vec![],
                        doubled_pawns: vec![],
                        isolated_pawns: vec![],
                    },
                    files: FileInfo {
                        open_files: vec![],
                        half_open_for: vec![],
                    },
                    square_control: SquareControl {
                        weak_squares: vec![],
                        outposts: vec![],
                    },
                    piece_activity: PieceActivity {
                        total_mobility: 0,
                        centralization: 0.0,
                        piece_scores: vec![],
                    },
                    space: SpaceInfo {
                        controlled_opponent_side: 0,
                    },
                    material: MaterialInfo {
                        pieces: PieceCount {
                            pawns: 8,
                            knights: 2,
                            bishops: 2,
                            rooks: 2,
                            queens: 1,
                        },
                        has_bishop_pair: true,
                    },
                    tactical_precursors: TacticalPrecursors {
                        hanging_pieces: vec![],
                        undefended_pieces: vec![],
                        pins: vec![],
                        forks: vec![],
                    },
                },
                turn: "w".to_string(),
            },
            concepts: ConceptEvaluation {
                initiative: None,
                tempo_advantage: 0,
                key_ideas: vec!["Develop pieces and control the center".to_string()],
                plan: PlanSkeleton {
                    immediate: vec!["Improve piece positioning".to_string()],
                    medium: vec!["Improve piece coordination".to_string()],
                    long_term: vec!["Reach a favorable endgame".to_string()],
                },
                strategic_summary: "The position is roughly balanced.".to_string(),
            },
            tactics: vec![],
            engine_lines: vec![EngineLineInfo {
                depth: 18,
                score: ScoreData {
                    kind: "cp".to_string(),
                    value: 20,
                },
                pv: vec!["e2e4".to_string()],
                multipv: Some(1),
            }],
        }
    }

    #[test]
    fn test_build_coach_prompt_initial_question() {
        let analysis = sample_analysis();
        let prompt = build_coach_prompt(&analysis, &ExplanationLevel::Standard, &[], false, None);
        let json_str = serde_json::to_string(&prompt).unwrap();
        assert!(json_str.contains("coach_question"));
        assert!(json_str.contains("\"hidden\":true"));
        assert!(json_str.contains("key_ideas"));
        assert!(json_str.contains("e2e4"));
    }

    #[test]
    fn test_build_coach_prompt_follow_up() {
        let analysis = sample_analysis();
        let history = vec![
            CoachHistoryEntry {
                role: "assistant".to_string(),
                content: "What would you improve first?".to_string(),
            },
            CoachHistoryEntry {
                role: "user".to_string(),
                content: "I'd attack the king".to_string(),
            },
        ];
        let prompt = build_coach_prompt(
            &analysis,
            &ExplanationLevel::Standard,
            &history,
            false,
            Some("I'd attack the king"),
        );
        let json_str = serde_json::to_string(&prompt).unwrap();
        assert!(json_str.contains("coach_follow_up"));
        assert!(json_str.contains("\"hidden\":true"));
        assert!(json_str.contains("I'd attack the king"));
    }

    #[test]
    fn test_build_coach_prompt_reveal() {
        let analysis = sample_analysis();
        let prompt = build_coach_prompt(
            &analysis,
            &ExplanationLevel::Deep,
            &[],
            true,
            Some("reveal"),
        );
        let json_str = serde_json::to_string(&prompt).unwrap();
        assert!(json_str.contains("coach_reveal"));
        assert!(json_str.contains("\"hidden\":false"));
        assert!(json_str.contains("deep"));
    }
}
