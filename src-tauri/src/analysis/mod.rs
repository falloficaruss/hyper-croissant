pub mod types;
mod feature_extractor;
mod concepts;
mod tactics;
mod comparison;
mod eval_swing;
mod prompt_builder;
mod validator;
mod position_cache;

pub use types::*;
pub use feature_extractor::extract_features;
pub use concepts::evaluate_concepts;
pub use tactics::detect_tactics;
pub use comparison::compare_moves;
pub use eval_swing::{analyze_eval_swing, SWING_THRESHOLD_CP};
pub use prompt_builder::{
    build_analysis_prompt, build_comparison_prompt, build_swing_prompt, ExplanationLevel,
};
pub use validator::validate_llm_output;
pub use position_cache::PositionCache;

use shakmaty::Chess;

/// Run the full analysis pipeline: features → concepts + tactics
pub fn analyze_position(pos: &Chess, engine_lines: &[EngineLineInfo]) -> StructuredAnalysis {
    let features = feature_extractor::extract_features(pos);
    let concepts = concepts::evaluate_concepts(pos, &features);
    let tactics = tactics::detect_tactics(pos);

    StructuredAnalysis {
        fen: crate::chess::pos_to_fen(pos),
        features,
        concepts,
        tactics,
        engine_lines: engine_lines.to_vec(),
    }
}
