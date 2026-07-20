use serde::{Deserialize, Serialize};

// ── King Safety ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KingSafety {
    pub pawn_shield_score: i32,
    pub open_files_near_king: Vec<u32>,
    pub storm_attackers_near_king: u32,
}

// ── Pawn Structure ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PawnStructure {
    pub island_count: u32,
    pub passed_pawns: Vec<String>,
    pub backward_pawns: Vec<String>,
    pub doubled_pawns: Vec<String>,
    pub isolated_pawns: Vec<String>,
}

// ── File Analysis ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub open_files: Vec<u32>,
    pub half_open_for: Vec<u32>,
}

// ── Square Control ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SquareControl {
    pub weak_squares: Vec<String>,
    pub outposts: Vec<String>,
}

// ── Piece Activity ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PieceScore {
    pub square: String,
    pub role: String,
    pub mobility: u32,
    pub is_centralized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PieceActivity {
    pub total_mobility: u32,
    pub centralization: f64,
    pub piece_scores: Vec<PieceScore>,
}

// ── Space ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceInfo {
    pub controlled_opponent_side: u32,
}

// ── Material ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PieceCount {
    pub pawns: u32,
    pub knights: u32,
    pub bishops: u32,
    pub rooks: u32,
    pub queens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialInfo {
    pub pieces: PieceCount,
    pub has_bishop_pair: bool,
}

// ── Tactical Precursors ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinnedPiece {
    pub square: String,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForkCandidate {
    pub square: String,
    pub targets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TacticalPrecursors {
    pub hanging_pieces: Vec<String>,
    pub undefended_pieces: Vec<String>,
    pub pins: Vec<PinnedPiece>,
    pub forks: Vec<ForkCandidate>,
}

// ── Per-side feature bundle ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SideFeatures {
    pub king_safety: KingSafety,
    pub pawn_structure: PawnStructure,
    pub files: FileInfo,
    pub square_control: SquareControl,
    pub piece_activity: PieceActivity,
    pub space: SpaceInfo,
    pub material: MaterialInfo,
    pub tactical_precursors: TacticalPrecursors,
}

// ── Complete Features ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Features {
    #[serde(rename = "white")]
    pub white: SideFeatures,
    #[serde(rename = "black")]
    pub black: SideFeatures,
    pub turn: String,
}

// ── Concepts ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanSkeleton {
    pub immediate: Vec<String>,
    pub medium: Vec<String>,
    pub long_term: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConceptEvaluation {
    pub initiative: Option<String>,
    pub tempo_advantage: i32,
    pub key_ideas: Vec<String>,
    pub plan: PlanSkeleton,
    pub strategic_summary: String,
}

// ── Tactics ──

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MotifType {
    Fork,
    Pin,
    Skewer,
    DiscoveredAttack,
    Deflection,
    Decoy,
    BackRankWeakness,
    OverloadedPiece,
    RemovingDefender,
    HangingPiece,
    UndefendedPiece,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Decisive,
    Advantage,
    Minor,
    None_,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TacticalMotif {
    pub motif_type: MotifType,
    pub target: String,
    pub attacker: String,
    pub description: String,
    pub severity: Severity,
    pub requires_move: Option<String>,
}

// ── Comparison ──

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScoreData {
    pub kind: String,
    pub value: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveComparison {
    pub fen_before: String,
    pub fen_after_user: String,
    pub fen_after_engine: String,
    pub user_move: String,
    pub engine_move: String,
    pub user_move_san: Option<String>,
    pub engine_move_san: Option<String>,
    pub user_move_eval: Option<ScoreData>,
    pub engine_move_eval: Option<ScoreData>,
    /// Engine eval − user eval in cp from the mover's perspective (positive = engine better).
    pub eval_diff_cp: Option<i32>,
    /// Same as eval_diff_cp in pawns.
    pub eval_diff_pawns: Option<f64>,
    pub concepts_lost: Vec<String>,
    pub concepts_gained: Vec<String>,
    pub tactical_impact: Vec<String>,
    pub strategic_difference: Vec<String>,
    pub why_engine: Vec<String>,
    pub summary: String,
}

// ── Eval Swing ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SwingSeverity {
    None,
    Minor,
    Significant,
    Blunder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvalSwing {
    pub fen_before: String,
    pub fen_after: String,
    pub user_move: String,
    pub user_move_san: Option<String>,
    pub eval_before: Option<ScoreData>,
    pub eval_after: Option<ScoreData>,
    /// Centipawn change from the mover's perspective (negative = worse).
    pub swing_cp: Option<i32>,
    /// Same as swing_cp but in pawns (e.g. -2.1).
    pub swing_pawns: Option<f64>,
    pub consequences: Vec<String>,
    pub tactical_motifs: Vec<String>,
    pub severity: SwingSeverity,
    pub summary: String,
}

// ── Engine Lines ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineLineInfo {
    pub depth: u32,
    pub score: ScoreData,
    pub pv: Vec<String>,
    pub multipv: Option<u32>,
}

// ── Complete Analysis ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredAnalysis {
    pub fen: String,
    pub features: Features,
    pub concepts: ConceptEvaluation,
    pub tactics: Vec<TacticalMotif>,
    pub engine_lines: Vec<EngineLineInfo>,
}

// ── Validation ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationError {
    IllegalMove { mentioned: String, reason: String },
    IncorrectSquare { mentioned: String, actual: String },
    HallucinatedConcept { description: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
}

// ── Cache ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedAnalysis {
    pub features: Features,
    pub concepts: ConceptEvaluation,
    pub tactics: Vec<TacticalMotif>,
}
