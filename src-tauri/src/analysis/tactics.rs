use shakmaty::{Bitboard, Board, Chess, Color, File, Position, Rank, Role, Square};
use shakmaty::attacks;

use crate::analysis::types::*;

pub fn detect_tactics(pos: &Chess) -> Vec<TacticalMotif> {
    let _board = pos.board();
    let mut motifs = Vec::new();

    motifs.append(&mut detect_pins(pos, Color::White));
    motifs.append(&mut detect_pins(pos, Color::Black));
    motifs.append(&mut detect_forks(pos, Color::White));
    motifs.append(&mut detect_forks(pos, Color::Black));
    motifs.append(&mut detect_skewers(pos, Color::White));
    motifs.append(&mut detect_skewers(pos, Color::Black));
    motifs.append(&mut detect_discovered_attacks(pos));
    motifs.append(&mut detect_back_rank_weakness(pos));
    motifs.append(&mut detect_hanging_pieces(pos, Color::White));
    motifs.append(&mut detect_hanging_pieces(pos, Color::Black));

    motifs
}

// ── Pin Detection ──

fn detect_pins(pos: &Chess, color: Color) -> Vec<TacticalMotif> {
    let board = pos.board();
    let opponent = !color;
    let our_king = match board.king_of(color) {
        Some(k) => k,
        None => return vec![],
    };
    let my_pieces = board.by_color(color);
    let enemy_sliders = board.by_color(opponent)
        & (board.by_role(Role::Bishop) | board.by_role(Role::Rook) | board.by_role(Role::Queen));
    let occupied = board.occupied();
    let mut motifs = Vec::new();

    for pin_sq in my_pieces {
        if pin_sq == our_king {
            continue;
        }
        if let Some(dir) = pin_direction(our_king, pin_sq, enemy_sliders, board, occupied) {
            let target_sq = find_slider_beyond(pin_sq, our_king, enemy_sliders, board, occupied);
            let target_desc = target_sq.map(|s| s.to_string()).unwrap_or_default();
            let severity = if board.piece_at(pin_sq).map(|p| p.role == Role::King).unwrap_or(false) {
                Severity::Decisive
            } else {
                Severity::Advantage
            };
            motifs.push(TacticalMotif {
                motif_type: MotifType::Pin,
                target: target_desc,
                attacker: pin_sq.to_string(),
                description: format!("Piece on {} is pinned along the {}", pin_sq, dir),
                severity,
                requires_move: None,
            });
        }
    }

    motifs
}

fn pin_direction(
    king: Square,
    piece: Square,
    _enemy_sliders: Bitboard,
    _board: &Board,
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

    if df == 0 {
        Some("file".to_string())
    } else if dr == 0 {
        Some("rank".to_string())
    } else if df.abs() == dr.abs() {
        Some("diagonal".to_string())
    } else {
        None
    }
}

fn find_slider_beyond(
    piece: Square,
    king: Square,
    enemy_sliders: Bitboard,
    board: &Board,
    _occupied: Bitboard,
) -> Option<Square> {
    let kf = king.file().to_u32() as i8;
    let kr = king.rank().to_u32() as i8;
    let pf = piece.file().to_u32() as i8;
    let pr = piece.rank().to_u32() as i8;

    let df = pf - kf;
    let dr = pr - kr;

    let (step_f, step_r) = if df == 0 {
        (0, dr.signum())
    } else if dr == 0 {
        (df.signum(), 0)
    } else {
        (df.signum(), dr.signum())
    };

    let mut f = pf + step_f;
    let mut r = pr + step_r;
    while f >= 0 && f <= 7 && r >= 0 && r <= 7 {
        let sq = Square::from_coords(File::new(f as u32), Rank::new(r as u32));
        if enemy_sliders.contains(sq) {
            return Some(sq);
        }
        if board.piece_at(sq).is_some() {
            break;
        }
        f += step_f;
        r += step_r;
    }
    None
}

// ── Fork Detection ──

fn detect_forks(pos: &Chess, color: Color) -> Vec<TacticalMotif> {
    let board = pos.board();
    let opponent = !color;
    let my_pieces = board.by_color(color);
    let enemy_pieces = board.by_color(opponent);
    let occupied = board.occupied();
    let mut motifs = Vec::new();

    for sq in my_pieces {
        let piece = match board.piece_at(sq) {
            Some(p) => p,
            None => continue,
        };
        if piece.role == Role::Pawn || piece.role == Role::King {
            continue;
        }
        let attack_mask = attacks::attacks(sq, piece, occupied);
        let targets = attack_mask & enemy_pieces;
        let count = targets.count();
        if count >= 2 {
            let target_list: Vec<String> = targets.into_iter().take(4).map(|s| s.to_string()).collect();
            motifs.push(TacticalMotif {
                motif_type: MotifType::Fork,
                target: sq.to_string(),
                attacker: sq.to_string(),
                description: format!("{} on {} forks {}", role_str(piece.role), sq, target_list.join(", ")),
                severity: if count >= 3 { Severity::Decisive } else { Severity::Advantage },
                requires_move: None,
            });
        }
    }

    motifs
}

// ── Skewer Detection ──

fn detect_skewers(pos: &Chess, color: Color) -> Vec<TacticalMotif> {
    let board = pos.board();
    let opponent = !color;
    let enemy_pieces = board.by_color(opponent);
    let enemy_sliders = enemy_pieces
        & (board.by_role(Role::Bishop) | board.by_role(Role::Rook) | board.by_role(Role::Queen));
    let occupied = board.occupied();
    let mut motifs = Vec::new();

    for slider_sq in enemy_sliders {
        let piece = match board.piece_at(slider_sq) {
            Some(p) => p,
            None => continue,
        };
        let attacks = attacks::attacks(slider_sq, piece, occupied);
        let targets_on_ray: Vec<Square> = attacks.into_iter()
            .filter(|sq| enemy_pieces.contains(*sq))
            .collect();

        if targets_on_ray.len() >= 2 {
            let first = targets_on_ray[0];
            motifs.push(TacticalMotif {
                motif_type: MotifType::Skewer,
                target: first.to_string(),
                attacker: slider_sq.to_string(),
                description: format!("{} skewers {}", slider_sq, first),
                severity: Severity::Advantage,
                requires_move: None,
            });
        }
    }

    motifs
}

// ── Discovered Attack Detection ──

fn detect_discovered_attacks(pos: &Chess) -> Vec<TacticalMotif> {
    let board = pos.board();
    let occupied = board.occupied();
    let mut motifs = Vec::new();

    for color in [Color::White, Color::Black] {
        let my_pieces = board.by_color(color);
        let opponent = !color;

        for sq in my_pieces {
            let piece = match board.piece_at(sq) {
                Some(p) => p,
                None => continue,
            };
            if piece.role == Role::Pawn || piece.role == Role::Knight || piece.role == Role::King {
                continue;
            }
            let attack_bb = attacks::attacks(sq, piece, occupied);
            let enemy_on_line: Vec<Square> = attack_bb.into_iter()
                .filter(|s| board.color_at(*s) == Some(opponent))
                .collect();

            if !enemy_on_line.is_empty() {
                motifs.push(TacticalMotif {
                    motif_type: MotifType::DiscoveredAttack,
                    target: enemy_on_line[0].to_string(),
                    attacker: sq.to_string(),
                    description: format!("Moving {} may reveal an attack on {}", sq, enemy_on_line[0]),
                    severity: Severity::Minor,
                    requires_move: None,
                });
            }
        }
    }

    motifs
}

// ── Back Rank Weakness ──

fn detect_back_rank_weakness(pos: &Chess) -> Vec<TacticalMotif> {
    let board = pos.board();
    let mut motifs = Vec::new();

    for color in [Color::White, Color::Black] {
        let king_sq = match board.king_of(color) {
            Some(k) => k,
            None => continue,
        };
        let back_rank = if color == Color::White { 0u32 } else { 7u32 };
        if king_sq.rank().to_u32() != back_rank {
            continue;
        }

        let own_pawns = board.by_role(Role::Pawn) & board.by_color(color);
        let kf = king_sq.file().to_u32();
        let mut blocked_escape = true;

        for ef in [kf.wrapping_sub(1), kf.wrapping_add(1)] {
            if ef <= 7 {
                let escape_sq = Square::from_coords(File::new(ef), Rank::new(back_rank));
                if !own_pawns.contains(escape_sq) {
                    blocked_escape = false;
                    break;
                }
            }
        }

        // Also check if king has an escape square on the 2nd/7th rank
        let forward_rank = if color == Color::White { 1u32 } else { 6u32 };
        for ef in [kf, kf.wrapping_sub(1), kf.wrapping_add(1)] {
            if ef <= 7 {
                let escape_sq = Square::from_coords(File::new(ef), Rank::new(forward_rank));
                if board.piece_at(escape_sq).is_none() {
                    blocked_escape = false;
                    break;
                }
            }
        }

        if blocked_escape {
            motifs.push(TacticalMotif {
                motif_type: MotifType::BackRankWeakness,
                target: king_sq.to_string(),
                attacker: String::new(),
                description: format!(
                    "{}'s king is trapped on the back rank",
                    if color == Color::White { "White" } else { "Black" }
                ),
                severity: Severity::Advantage,
                requires_move: None,
            });
        }
    }

    motifs
}

// ── Hanging Pieces ──

fn detect_hanging_pieces(pos: &Chess, color: Color) -> Vec<TacticalMotif> {
    let board = pos.board();
    let opponent = !color;
    let occupied = board.occupied();
    let my_pieces = board.by_color(color);
    let enemy_pieces = board.by_color(opponent);
    let mut motifs = Vec::new();

    for sq in enemy_pieces {
        let our_attackers = (board.attacks_to(sq, color, occupied) & my_pieces).count();
        let their_defenders = (board.attacks_to(sq, opponent, occupied) & enemy_pieces).count();

        if our_attackers > 0 && our_attackers > their_defenders {
            let val = board.piece_at(sq).map(|p| piece_value(p.role)).unwrap_or(0);
            motifs.push(TacticalMotif {
                motif_type: MotifType::HangingPiece,
                target: sq.to_string(),
                attacker: String::new(),
                description: format!("Piece on {} is hanging", sq),
                severity: if val >= 5 { Severity::Decisive } else if val >= 3 { Severity::Advantage } else { Severity::Minor },
                requires_move: None,
            });
        }
    }

    motifs
}

fn role_str(role: Role) -> &'static str {
    match role {
        Role::Pawn => "pawn",
        Role::Knight => "knight",
        Role::Bishop => "bishop",
        Role::Rook => "rook",
        Role::Queen => "queen",
        Role::King => "king",
    }
}

fn piece_value(role: Role) -> i32 {
    match role {
        Role::Pawn => 1,
        Role::Knight => 3,
        Role::Bishop => 3,
        Role::Rook => 5,
        Role::Queen => 9,
        Role::King => 100,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess;

    #[test]
    fn test_no_tactics_start() {
        let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = chess::parse_fen(fen).unwrap();
        let motifs = detect_tactics(&pos);
        // The d2 pawn is pinned by the black queen on d8 — legitimate chess tactic
        let has_d2_pin = motifs.iter().any(|m| {
            m.motif_type == MotifType::Pin && m.attacker == "d2"
        });
        assert!(has_d2_pin, "d2 pawn should be pinned by black queen");
    }
}
