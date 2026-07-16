// ── King Safety ──

export interface KingSafety {
  pawn_shield_score: number;
  open_files_near_king: number[];
  storm_attackers_near_king: number;
}

// ── Pawn Structure ──

export interface PawnStructure {
  island_count: number;
  passed_pawns: string[];
  backward_pawns: string[];
  doubled_pawns: string[];
  isolated_pawns: string[];
}

// ── File Analysis ──

export interface FileInfo {
  open_files: number[];
  half_open_for: number[];
}

// ── Square Control ──

export interface SquareControl {
  weak_squares: string[];
  outposts: string[];
}

// ── Piece Activity ──

export interface PieceScore {
  square: string;
  role: string;
  mobility: number;
  is_centralized: boolean;
}

export interface PieceActivity {
  total_mobility: number;
  centralization: number;
  piece_scores: PieceScore[];
}

// ── Space ──

export interface SpaceInfo {
  controlled_opponent_side: number;
}

// ── Material ──

export interface PieceCount {
  pawns: number;
  knights: number;
  bishops: number;
  rooks: number;
  queens: number;
}

export interface MaterialInfo {
  pieces: PieceCount;
  has_bishop_pair: boolean;
}

// ── Tactical Precursors ──

export interface PinnedPiece {
  square: string;
  direction: string;
}

export interface ForkCandidate {
  square: string;
  targets: string[];
}

export interface TacticalPrecursors {
  hanging_pieces: string[];
  undefended_pieces: string[];
  pins: PinnedPiece[];
  forks: ForkCandidate[];
}

// ── Per-side feature bundle ──

export interface SideFeatures {
  king_safety: KingSafety;
  pawn_structure: PawnStructure;
  files: FileInfo;
  square_control: SquareControl;
  piece_activity: PieceActivity;
  space: SpaceInfo;
  material: MaterialInfo;
  tactical_precursors: TacticalPrecursors;
}

// ── Complete Features ──

export interface Features {
  white: SideFeatures;
  black: SideFeatures;
  turn: string;
}

// ── Concepts ──

export interface PlanSkeleton {
  immediate: string[];
  medium: string[];
  long_term: string[];
}

export interface ConceptEvaluation {
  initiative: string | null;
  tempo_advantage: number;
  key_ideas: string[];
  plan: PlanSkeleton;
  strategic_summary: string;
}

// ── Tactics ──

export type MotifType =
  | "fork"
  | "pin"
  | "skewer"
  | "discovered_attack"
  | "deflection"
  | "decoy"
  | "back_rank_weakness"
  | "overloaded_piece"
  | "removing_defender"
  | "hanging_piece"
  | "undefended_piece";

export type Severity = "decisive" | "advantage" | "minor" | "none_";

export interface TacticalMotif {
  motif_type: MotifType;
  target: string;
  attacker: string;
  description: string;
  severity: Severity;
  requires_move: string | null;
}

// ── Comparison ──

export interface ScoreData {
  kind: string;
  value: number;
}

export interface MoveComparison {
  user_move: string;
  engine_move: string;
  user_move_eval: ScoreData | null;
  engine_move_eval: ScoreData | null;
  concepts_lost: string[];
  tactical_impact: string[];
  summary: string;
}

// ── Eval Swing ──

export type SwingSeverity = "none" | "minor" | "significant" | "blunder";

export interface EvalSwing {
  fen_before: string;
  fen_after: string;
  user_move: string;
  user_move_san: string | null;
  eval_before: ScoreData | null;
  eval_after: ScoreData | null;
  swing_cp: number | null;
  swing_pawns: number | null;
  consequences: string[];
  tactical_motifs: string[];
  severity: SwingSeverity;
  summary: string;
}

// ── Engine Lines ──

export interface EngineLineInfo {
  depth: number;
  score: ScoreData;
  pv: string[];
  multipv: number | null;
}

// ── Complete Analysis ──

export interface StructuredAnalysis {
  fen: string;
  features: Features;
  concepts: ConceptEvaluation;
  tactics: TacticalMotif[];
  engine_lines: EngineLineInfo[];
}

// ── Validation ──

export type ValidationError =
  | { type: "illegal_move"; mentioned: string; reason: string }
  | { type: "incorrect_square"; mentioned: string; actual: string }
  | { type: "hallucinated_concept"; description: string };

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ── Cache ──

export interface CachedAnalysis {
  features: Features;
  concepts: ConceptEvaluation;
  tactics: TacticalMotif[];
}
