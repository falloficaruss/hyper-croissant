use shakmaty::{CastlingMode, Chess, Move, Position, Role, fen::Fen, san::San};
use shakmaty::uci::UciMove;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MoveData {
    pub uci: String,
    pub san: String,
    pub from_index: usize,
    pub to_index: usize,
    pub piece: char,
    pub is_capture: bool,
    pub is_check: bool,
    pub is_checkmate: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PositionData {
    pub fen: String,
    pub turn: String,
    pub is_check: bool,
    pub is_checkmate: bool,
    pub is_stalemate: bool,
    pub legal_moves: Vec<MoveData>,
}

pub fn parse_fen(fen: &str) -> Result<Chess, String> {
    let fen = fen.parse::<Fen>()
        .map_err(|e| format!("Invalid FEN: {}", e))?;

    let pos: Chess = fen.into_position(CastlingMode::Standard)
        .map_err(|e| format!("Invalid position: {:?}", e))?;

    Ok(pos)
}

pub fn get_legal_moves(pos: &Chess) -> Vec<MoveData> {
    let mut moves = Vec::new();

    for move_ in pos.legal_moves() {
        let after = pos.clone().play(&move_).expect("legal move");
        let san = San::from_move(pos, &move_).to_string();

        moves.push(MoveData {
            uci: UciMove::from_move(&move_, CastlingMode::Standard).to_string(),
            san,
            from_index: usize::from(move_.from().expect("legal move has from-square")),
            to_index: usize::from(move_.to() ),
            piece: piece_char(&move_),
            is_capture: move_.capture().is_some(),
            is_check: after.checkers().any(),
            is_checkmate: after.is_checkmate(),
        });
    }

    moves
}

pub fn make_move(pos: &Chess, uci_str: &str) -> Result<Chess, String> {
    let uci = UciMove::from_ascii(uci_str.as_bytes())
        .map_err(|e| format!("Invalid UCI: {}", e))?;

    let move_ = uci.to_move(pos)
        .map_err(|_| "Illegal move".to_string())?;

    pos.clone()
        .play(&move_)
        .map_err(|e| format!("Move failed: {:?}", e))
}

pub fn get_position_data(fen: &str) -> Result<PositionData, String> {
    let pos = parse_fen(fen)?;

    Ok(PositionData {
        fen: fen.to_string(),
        turn: if pos.turn().is_white() { "w".to_string() } else { "b".to_string() },
        is_check: pos.checkers().any(),
        is_checkmate: pos.is_checkmate(),
        is_stalemate: pos.is_stalemate(),
        legal_moves: get_legal_moves(&pos),
    })
}

fn piece_char(move_: &Move) -> char {
    match move_.role() {
        Role::Pawn => if move_.promotion().is_some() { 'p' } else { 'P' },
        Role::Knight => 'N',
        Role::Bishop => 'B',
        Role::Rook => 'R',
        Role::Queen => 'Q',
        Role::King => 'K',
    }
}
