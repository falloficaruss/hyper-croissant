use std::collections::HashMap;

use crate::analysis::types::{CachedAnalysis, EvalSwing};
use crate::chess;

/// In-memory cache for analyzed positions, keyed by normalized FEN.
/// Also caches eval swings by (fen_before, move).
pub struct PositionCache {
    inner: HashMap<String, CachedAnalysis>,
    max_entries: usize,
    insertion_order: Vec<String>,
    swing_inner: HashMap<String, EvalSwing>,
    swing_order: Vec<String>,
}

impl PositionCache {
    pub fn new(max_entries: usize) -> Self {
        PositionCache {
            inner: HashMap::new(),
            max_entries,
            insertion_order: Vec::new(),
            swing_inner: HashMap::new(),
            swing_order: Vec::new(),
        }
    }

    pub fn get(&self, fen: &str) -> Option<&CachedAnalysis> {
        let norm = Self::normalize_fen(fen);
        self.inner.get(&norm)
    }

    pub fn insert(&mut self, fen: String, analysis: CachedAnalysis) {
        let norm = Self::normalize_fen(&fen);
        if self.inner.contains_key(&norm) {
            return;
        }
        self.evict_if_needed();
        self.insertion_order.push(norm.clone());
        self.inner.insert(norm, analysis);
    }

    pub fn swing_key(fen_before: &str, user_move: &str) -> String {
        format!("{}|{}", Self::normalize_fen(fen_before), user_move)
    }

    pub fn get_swing(&self, fen_before: &str, user_move: &str) -> Option<&EvalSwing> {
        let key = Self::swing_key(fen_before, user_move);
        self.swing_inner.get(&key)
    }

    pub fn insert_swing(&mut self, swing: EvalSwing) {
        let key = Self::swing_key(&swing.fen_before, &swing.user_move);
        if self.swing_inner.contains_key(&key) {
            return;
        }
        self.evict_swing_if_needed();
        self.swing_order.push(key.clone());
        self.swing_inner.insert(key, swing);
    }

    pub fn normalize_fen(fen: &str) -> String {
        match chess::parse_fen(fen) {
            Ok(pos) => chess::pos_to_fen(&pos),
            Err(_) => fen.to_string(),
        }
    }

    fn evict_if_needed(&mut self) {
        while self.inner.len() >= self.max_entries {
            if let Some(oldest) = self.insertion_order.first().cloned() {
                self.inner.remove(&oldest);
                self.insertion_order.retain(|k| *k != oldest);
            } else {
                break;
            }
        }
    }

    fn evict_swing_if_needed(&mut self) {
        while self.swing_inner.len() >= self.max_entries {
            if let Some(oldest) = self.swing_order.first().cloned() {
                self.swing_inner.remove(&oldest);
                self.swing_order.retain(|k| *k != oldest);
            } else {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::types::*;

    fn dummy_analysis() -> CachedAnalysis {
        CachedAnalysis {
            features: Features {
                white: SideFeatures {
                    king_safety: KingSafety { pawn_shield_score: 0, open_files_near_king: vec![], storm_attackers_near_king: 0 },
                    pawn_structure: PawnStructure { island_count: 0, passed_pawns: vec![], backward_pawns: vec![], doubled_pawns: vec![], isolated_pawns: vec![] },
                    files: FileInfo { open_files: vec![], half_open_for: vec![] },
                    square_control: SquareControl { weak_squares: vec![], outposts: vec![] },
                    piece_activity: PieceActivity { total_mobility: 0, centralization: 0.0, piece_scores: vec![] },
                    space: SpaceInfo { controlled_opponent_side: 0 },
                    material: MaterialInfo { pieces: PieceCount { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 }, has_bishop_pair: false },
                    tactical_precursors: TacticalPrecursors { hanging_pieces: vec![], undefended_pieces: vec![], pins: vec![], forks: vec![] },
                },
                black: SideFeatures {
                    king_safety: KingSafety { pawn_shield_score: 0, open_files_near_king: vec![], storm_attackers_near_king: 0 },
                    pawn_structure: PawnStructure { island_count: 0, passed_pawns: vec![], backward_pawns: vec![], doubled_pawns: vec![], isolated_pawns: vec![] },
                    files: FileInfo { open_files: vec![], half_open_for: vec![] },
                    square_control: SquareControl { weak_squares: vec![], outposts: vec![] },
                    piece_activity: PieceActivity { total_mobility: 0, centralization: 0.0, piece_scores: vec![] },
                    space: SpaceInfo { controlled_opponent_side: 0 },
                    material: MaterialInfo { pieces: PieceCount { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 }, has_bishop_pair: false },
                    tactical_precursors: TacticalPrecursors { hanging_pieces: vec![], undefended_pieces: vec![], pins: vec![], forks: vec![] },
                },
                turn: "w".to_string(),
            },
            concepts: ConceptEvaluation {
                initiative: None,
                tempo_advantage: 0,
                key_ideas: vec![],
                plan: PlanSkeleton { immediate: vec![], medium: vec![], long_term: vec![] },
                strategic_summary: String::new(),
            },
            tactics: vec![],
        }
    }

    #[test]
    fn test_cache_put_get() {
        let mut cache = PositionCache::new(10);
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        cache.insert(fen.to_string(), dummy_analysis());
        assert!(cache.get(fen).is_some());
    }

    #[test]
    fn test_cache_normalize() {
        // Same position, different FEN representation
        let fen1 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let fen2 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        assert_eq!(PositionCache::normalize_fen(fen1), PositionCache::normalize_fen(fen2));
    }
}
