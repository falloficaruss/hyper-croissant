use std::collections::HashMap;

use shakmaty::{Bitboard, Board, Chess, Color, File, Position, Rank, Role, Square};

use crate::analysis::types::*;

pub fn extract_features(pos: &Chess) -> Features {
    let board = pos.board();
    let turn = if pos.turn().is_white() { "w" } else { "b" };

    Features {
        white: side_features(pos, board, Color::White),
        black: side_features(pos, board, Color::Black),
        turn: turn.to_string(),
    }
}

fn side_features(pos: &Chess, board: &Board, color: Color) -> SideFeatures {
    let king_sq = board.king_of(color).expect("each side must have a king");
    SideFeatures {
        king_safety: king_safety(board, king_sq, color),
        pawn_structure: pawn_structure(board, color),
        files: analyze_files(board),
        square_control: squares_and_outposts(board, king_sq, color),
        piece_activity: piece_activity(pos, board, color),
        space: space_analysis(board, color),
        material: material_count(board, color),
        tactical_precursors: tactical_precursors(pos, board, color),
    }
}

// ── King Safety ──

fn king_safety(board: &Board, king_sq: Square, color: Color) -> KingSafety {
    let king_file = king_sq.file();

    let shield_files = [
        king_file.to_u32().wrapping_sub(1),
        king_file.to_u32(),
        king_file.to_u32().wrapping_add(1),
    ];

    let mut shield_score = 0i32;
    let mut open_files_near_king = Vec::new();
    let my_pawns: Bitboard = board.by_role(Role::Pawn) & board.by_color(color);
    let opponent = !color;
    let enemy_pieces: Bitboard = board.by_color(opponent);

    for &f_idx in &shield_files {
        if f_idx > 7 {
            continue;
        }
        let file = File::new(f_idx);
        let mut has_own_pawn = false;
        if color == Color::White {
            for r in 0..=2 {
                let sq = Square::from_coords(file, Rank::new(r));
                if my_pawns.contains(sq) {
                    has_own_pawn = true;
                    break;
                }
            }
        } else {
            for r in 4..=6 {
                let sq = Square::from_coords(file, Rank::new(r));
                if my_pawns.contains(sq) {
                    has_own_pawn = true;
                    break;
                }
            }
        }
        if !has_own_pawn {
            open_files_near_king.push(f_idx);
            shield_score -= 1;
        }
    }

    let king_zone = king_zone_mask(king_sq);
    let attackers_near = (enemy_pieces & attacks_to_zone(board, king_zone, opponent)).count() as u32;

    KingSafety {
        pawn_shield_score: shield_score,
        open_files_near_king,
        storm_attackers_near_king: attackers_near,
    }
}

fn king_zone_mask(king: Square) -> Bitboard {
    let kf = king.file().to_u32();
    let kr = king.rank().to_u32();
    let mut bb = Bitboard(0);
    for f in kf.saturating_sub(1)..=((kf + 1).min(7)) {
        for r in kr.saturating_sub(1)..=((kr + 1).min(7)) {
            bb |= Bitboard::from_square(Square::from_coords(File::new(f), Rank::new(r)));
        }
    }
    bb
}

fn attacks_to_zone(board: &Board, zone: Bitboard, color: Color) -> Bitboard {
    let occupied = board.occupied();
    let mut attackers = Bitboard(0);
    for sq in zone {
        attackers |= board.attacks_to(sq, color, occupied) & board.by_color(color);
    }
    attackers
}

// ── Pawn Structure ──

fn pawn_structure(board: &Board, color: Color) -> PawnStructure {
    let pawns: Bitboard = board.by_role(Role::Pawn) & board.by_color(color);
    let enemy = !color;
    let enemy_pawns: Bitboard = board.by_role(Role::Pawn) & board.by_color(enemy);

    let mut pawns_per_file = [0u32; 8];
    for sq in pawns {
        pawns_per_file[sq.file().to_usize()] += 1;
    }

    let mut island_count = 0u32;
    let mut i = 0;
    while i < 8 {
        if pawns_per_file[i] > 0 {
            island_count += 1;
            while i < 8 && pawns_per_file[i] > 0 {
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    let mut passed = Vec::new();
    let mut backward = Vec::new();
    let mut doubled = Vec::new();
    let mut isolated = Vec::new();

    for sq in pawns {
        let sq_name = sq.to_string();
        let f = sq.file();
        let r = sq.rank().to_u32();

        let is_passed = {
            let mut blocked = false;
            for adj_f in f.to_u32().wrapping_sub(1)..=(f.to_u32().wrapping_add(1)) {
                if adj_f > 7 {
                    continue;
                }
                if has_enemy_pawn_ahead(enemy_pawns, adj_f, r, color) {
                    blocked = true;
                    break;
                }
            }
            !blocked
        };

        let is_isolated = {
            let left = f.to_u32().wrapping_sub(1);
            let right = f.to_u32().wrapping_add(1);
            (left > 7 || pawns_per_file[left as usize] == 0)
                && (right > 7 || pawns_per_file[right as usize] == 0)
        };

        let is_doubled = pawns_per_file[f.to_usize()] > 1;

        let is_backward = if !is_passed && !is_isolated {
            let advance_sq = if color == Color::White {
                Square::from_coords(f, Rank::new(r + 1))
            } else {
                Square::from_coords(f, Rank::new(r.wrapping_sub(1)))
            };
            let occupied = board.occupied();
            let defended = pawn_attacks_square(board, color, advance_sq);
            occupied.contains(advance_sq) && !defended
        } else {
            false
        };

        if is_passed {
            passed.push(sq_name.clone());
        }
        if is_backward {
            backward.push(sq_name.clone());
        }
        if is_doubled && !doubled.contains(&sq_name) {
            doubled.push(sq_name.clone());
        }
        if is_isolated {
            isolated.push(sq_name);
        }
    }

    PawnStructure {
        island_count,
        passed_pawns: passed,
        backward_pawns: backward,
        doubled_pawns: doubled,
        isolated_pawns: isolated,
    }
}

fn has_enemy_pawn_ahead(enemy_pawns: Bitboard, file_idx: u32, rank: u32, color: Color) -> bool {
    let file = File::new(file_idx as u32);
    if color == Color::White {
        for r in (rank + 1)..8 {
            if enemy_pawns.contains(Square::from_coords(file, Rank::new(r))) {
                return true;
            }
        }
    } else {
        for r in (0..rank).rev() {
            if enemy_pawns.contains(Square::from_coords(file, Rank::new(r))) {
                return true;
            }
        }
    }
    false
}

fn pawn_attacks_square(board: &Board, color: Color, target: Square) -> bool {
    let pawn_attacks = shakmaty::attacks::pawn_attacks(color, target);
    let my_pawns: Bitboard = board.by_role(Role::Pawn) & board.by_color(color);
    (pawn_attacks & my_pawns).any()
}

// ── File Analysis ──

fn analyze_files(board: &Board) -> FileInfo {
    let white_pawns: Bitboard = board.by_role(Role::Pawn) & board.by_color(Color::White);
    let black_pawns: Bitboard = board.by_role(Role::Pawn) & board.by_color(Color::Black);

    let mut open = Vec::new();
    let mut half_open = Vec::new();

    for f_idx in 0..8 {
        let file = File::new(f_idx);
        let file_pawns = file_pawn_mask(file);
        let w_on_file = (file_pawns & white_pawns).any();
        let b_on_file = (file_pawns & black_pawns).any();

        if !w_on_file && !b_on_file {
            open.push(f_idx);
        } else if w_on_file != b_on_file {
            half_open.push(f_idx);
        }
    }

    FileInfo {
        open_files: open,
        half_open_for: half_open,
    }
}

fn file_pawn_mask(file: File) -> Bitboard {
    let mut bb = Bitboard(0);
    for r in 0..8 {
        bb |= Bitboard::from_square(Square::from_coords(file, Rank::new(r)));
    }
    bb
}

// ── Weak Squares & Outposts ──

fn squares_and_outposts(board: &Board, _king_sq: Square, color: Color) -> SquareControl {
    let opponent = !color;
    let my_pawns: Bitboard = board.by_role(Role::Pawn) & board.by_color(color);
    let enemy_pawns: Bitboard = board.by_role(Role::Pawn) & board.by_color(opponent);
    let occupied = board.occupied();

    let mut my_pawn_attacks = Bitboard(0);
    for sq in my_pawns {
        my_pawn_attacks |= shakmaty::attacks::pawn_attacks(color, sq);
    }

    let mut enemy_pawn_attacks = Bitboard(0);
    for sq in enemy_pawns {
        enemy_pawn_attacks |= shakmaty::attacks::pawn_attacks(opponent, sq);
    }

    // Squares attacked by opponent on relevant ranks
    let relevant_ranks: Bitboard = Bitboard::from_rank(Rank::new(2)) | Bitboard::from_rank(Rank::new(3))
        | Bitboard::from_rank(Rank::new(4)) | Bitboard::from_rank(Rank::new(5));

    let mut weak = Bitboard(0);
    for sq in relevant_ranks {
        let attacked_by_opponent = board.attacks_to(sq, opponent, occupied);
        if attacked_by_opponent.any() && !my_pawn_attacks.contains(sq) {
            weak |= Bitboard::from_square(sq);
        }
    }

    let weak_squares: Vec<String> = weak.into_iter().take(8).map(|sq| sq.to_string()).collect();

    // Outposts
    let enemy_side = if color == Color::White {
        Bitboard::from_rank(Rank::new(4)) | Bitboard::from_rank(Rank::new(5)) | Bitboard::from_rank(Rank::new(6))
    } else {
        Bitboard::from_rank(Rank::new(1)) | Bitboard::from_rank(Rank::new(2)) | Bitboard::from_rank(Rank::new(3))
    };

    let outpost_candidates = enemy_side & my_pawn_attacks & !enemy_pawn_attacks & !board.by_color(color);
    let outposts: Vec<String> = outpost_candidates.into_iter().take(8).map(|sq| sq.to_string()).collect();

    SquareControl {
        weak_squares,
        outposts,
    }
}

// ── Piece Activity ──

fn piece_activity(pos: &Chess, board: &Board, color: Color) -> PieceActivity {
    let mut mobility_map: HashMap<Square, u32> = HashMap::new();
    for mv in pos.legal_moves() {
        if let Some(from) = mv.from() {
            if board.color_at(from) == Some(color) {
                *mobility_map.entry(from).or_insert(0) += 1;
            }
        }
    }

    let center = center_squares();
    let expanded_center = expanded_center_squares();

    let mut total_mobility = 0u32;
    let mut centralized_count = 0u32;
    let total_pieces = mobility_map.len() as u32;
    let mut scores = Vec::new();

    for (&sq, &mob) in &mobility_map {
        let role = board.piece_at(sq).map(|p| p.role).unwrap_or(Role::Pawn);
        let role_str = role_char(role);
        let is_centralized = center.contains(sq) || expanded_center.contains(sq);

        total_mobility += mob;
        if is_centralized {
            centralized_count += 1;
        }

        scores.push(PieceScore {
            square: sq.to_string(),
            role: role_str.to_string(),
            mobility: mob,
            is_centralized,
        });
    }

    let centralization = if total_pieces > 0 {
        centralized_count as f64 / total_pieces as f64
    } else {
        0.0
    };

    PieceActivity {
        total_mobility,
        centralization,
        piece_scores: scores,
    }
}

fn center_squares() -> Bitboard {
    Bitboard::from_square(Square::E4)
        | Bitboard::from_square(Square::D4)
        | Bitboard::from_square(Square::E5)
        | Bitboard::from_square(Square::D5)
}

fn expanded_center_squares() -> Bitboard {
    center_squares()
        | Bitboard::from_square(Square::C3)
        | Bitboard::from_square(Square::D3)
        | Bitboard::from_square(Square::E3)
        | Bitboard::from_square(Square::F3)
        | Bitboard::from_square(Square::C4)
        | Bitboard::from_square(Square::F4)
        | Bitboard::from_square(Square::C5)
        | Bitboard::from_square(Square::F5)
        | Bitboard::from_square(Square::C6)
        | Bitboard::from_square(Square::D6)
        | Bitboard::from_square(Square::E6)
        | Bitboard::from_square(Square::F6)
}

fn role_char(role: Role) -> &'static str {
    match role {
        Role::Pawn => "pawn",
        Role::Knight => "knight",
        Role::Bishop => "bishop",
        Role::Rook => "rook",
        Role::Queen => "queen",
        Role::King => "king",
    }
}

// ── Space Analysis ──

fn space_analysis(board: &Board, color: Color) -> SpaceInfo {
    let my_pieces = board.by_color(color);
    let occupied = board.occupied();

    let opponent_half = if color == Color::White {
        Bitboard::from_rank(Rank::new(4)) | Bitboard::from_rank(Rank::new(5))
            | Bitboard::from_rank(Rank::new(6)) | Bitboard::from_rank(Rank::new(7))
    } else {
        Bitboard::from_rank(Rank::new(0)) | Bitboard::from_rank(Rank::new(1))
            | Bitboard::from_rank(Rank::new(2)) | Bitboard::from_rank(Rank::new(3))
    };

    let mut controlled = Bitboard(0);
    for sq in my_pieces {
        let piece = match board.piece_at(sq) {
            Some(p) => p,
            None => continue,
        };
        let attacks_from = shakmaty::attacks::attacks(sq, piece, occupied);
        controlled |= attacks_from;
        let attacks_to = board.attacks_to(sq, !color, occupied);
        controlled |= attacks_to;
    }

    let count = (controlled & opponent_half).count() as u32;
    SpaceInfo { controlled_opponent_side: count }
}

// ── Material ──

fn material_count(board: &Board, color: Color) -> MaterialInfo {
    let my_pieces = board.by_color(color);
    let pawns = (board.by_role(Role::Pawn) & my_pieces).count() as u32;
    let knights = (board.by_role(Role::Knight) & my_pieces).count() as u32;
    let bishops = (board.by_role(Role::Bishop) & my_pieces).count() as u32;
    let rooks = (board.by_role(Role::Rook) & my_pieces).count() as u32;
    let queens = (board.by_role(Role::Queen) & my_pieces).count() as u32;

    MaterialInfo {
        pieces: PieceCount { pawns, knights, bishops, rooks, queens },
        has_bishop_pair: bishops >= 2,
    }
}

// ── Tactical Precursors ──

fn tactical_precursors(_pos: &Chess, board: &Board, color: Color) -> TacticalPrecursors {
    let opponent = !color;
    let my_pieces = board.by_color(color);
    let enemy_pieces = board.by_color(opponent);
    let occupied = board.occupied();

    let our_king = board.king_of(color).expect("king exists");

    let enemy_sliders = enemy_pieces
        & (board.by_role(Role::Bishop)
            | board.by_role(Role::Rook)
            | board.by_role(Role::Queen));

    let mut hanging = Vec::new();
    let mut undefended = Vec::new();
    let mut pins = Vec::new();
    let mut forks = Vec::new();

    // Hanging: We attack enemy pieces more than they defend
    for sq in enemy_pieces {
        let our_attackers = (board.attacks_to(sq, color, occupied) & my_pieces).count();
        let their_defenders = (board.attacks_to(sq, opponent, occupied) & enemy_pieces).count();
        if our_attackers > 0 && our_attackers > their_defenders {
            hanging.push(sq.to_string());
        }
    }

    // Undefended: Our pieces with 0 defenders
    for sq in my_pieces {
        let defenders = (board.attacks_to(sq, color, occupied) & my_pieces).count();
        if defenders == 0 {
            undefended.push(sq.to_string());
        }
    }

    // Pins
    for pin_sq in my_pieces {
        if pin_sq == our_king {
            continue;
        }
        if let Some(dir) = pin_direction(our_king, pin_sq, enemy_sliders, board, occupied) {
            pins.push(PinnedPiece {
                square: pin_sq.to_string(),
                direction: dir,
            });
        }
    }

    // Forks
    for attack_sq in my_pieces {
        let piece = match board.piece_at(attack_sq) {
            Some(p) => p,
            None => continue,
        };
        let attacks = shakmaty::attacks::attacks(attack_sq, piece, occupied) & enemy_pieces;
        let count = attacks.count();
        if count >= 2 {
            let targets: Vec<String> = attacks.into_iter().map(|sq| sq.to_string()).collect();
            forks.push(ForkCandidate {
                square: attack_sq.to_string(),
                targets,
            });
        }
    }

    TacticalPrecursors { hanging_pieces: hanging, undefended_pieces: undefended, pins, forks }
}

fn pin_direction(
    king: Square,
    piece: Square,
    enemy_sliders: Bitboard,
    board: &Board,
    _occupied: Bitboard,
) -> Option<String> {
    let kf = king.file().to_u32() as i8;
    let kr = king.rank().to_u32() as i8;
    let pf = piece.file().to_u32() as i8;
    let pr = piece.rank().to_u32() as i8;

    let df = pf - kf;
    let dr = pr - kr;

    if df == 0 && dr == 0 {
        return None;
    }

    let (step_f, step_r) = if df == 0 {
        (0, dr.signum())
    } else if dr == 0 {
        (df.signum(), 0)
    } else if df.abs() == dr.abs() {
        (df.signum(), dr.signum())
    } else {
        return None;
    };

    let mut f = pf + step_f;
    let mut r = pr + step_r;
    while f >= 0 && f <= 7 && r >= 0 && r <= 7 {
        let sq = Square::from_coords(File::new(f as u32), Rank::new(r as u32));
        if enemy_sliders.contains(sq) {
            let direction = if step_f == 0 { "file" } else if step_r == 0 { "rank" } else { "diagonal" };
            return Some(direction.to_string());
        }
        if board.piece_at(sq).is_some() {
            break;
        }
        f += step_f;
        r += step_r;
    }

    None
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess;

    const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    #[test]
    fn test_features_start_position() {
        let pos = chess::parse_fen(START_FEN).unwrap();
        let feats = extract_features(&pos);
        assert_eq!(feats.turn, "w");
        assert_eq!(feats.white.material.pieces.pawns, 8);
        assert_eq!(feats.black.material.pieces.pawns, 8);
        assert_eq!(feats.white.material.pieces.knights, 2);
        assert_eq!(feats.white.material.pieces.bishops, 2);
        assert_eq!(feats.white.material.pieces.rooks, 2);
        assert_eq!(feats.white.material.pieces.queens, 1);
        assert!(feats.white.material.has_bishop_pair);
    }

    #[test]
    fn test_pawn_islands() {
        // White pawns on a2 and h2 = 2 separate islands
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/P6P/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let feats = extract_features(&pos);
        assert_eq!(feats.white.pawn_structure.island_count, 2);
    }

    #[test]
    fn test_passed_pawn() {
        // White pawn on a7 with no black pawns on a/b/c files ahead (passed and about to promote)
        let fen = "rnbqkbnr/2pppppp/P7/8/8/8/1PPPPPPP/RNBQKBNR b KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let feats = extract_features(&pos);
        assert!(feats.white.pawn_structure.passed_pawns.contains(&"a6".to_string()));
    }

    #[test]
    fn test_open_files() {
        let fen = "rnbqkbnr/ppppp3/8/8/8/8/PPPPP3/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let feats = extract_features(&pos);
        assert!(feats.white.files.open_files.contains(&5));
    }

    #[test]
    fn test_tactical_precursors_start() {
        let pos = chess::parse_fen(START_FEN).unwrap();
        let feats = extract_features(&pos);
        assert!(feats.white.tactical_precursors.hanging_pieces.is_empty());
        assert!(feats.white.tactical_precursors.pins.is_empty());
    }
}
