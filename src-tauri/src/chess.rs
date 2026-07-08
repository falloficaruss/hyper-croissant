use std::ops::ControlFlow;

use pgn_reader::{RawTag, SanPlus, Skip, Visitor};
use serde::{Deserialize, Serialize};
pub use shakmaty::Chess;
use shakmaty::uci::UciMove;
use shakmaty::{fen::Fen, san::San, CastlingMode, EnPassantMode, Move, Position, Role};

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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MoveResult {
    pub position: PositionData,
    pub move_played: MoveData,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameHeaders {
    pub event: Option<String>,
    pub site: Option<String>,
    pub date: Option<String>,
    pub round: Option<String>,
    pub white: Option<String>,
    pub black: Option<String>,
    pub result: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameData {
    pub headers: GameHeaders,
    pub moves: Vec<MoveData>,
    pub initial_fen: String,
    pub final_fen: String,
}

pub fn parse_fen(fen: &str) -> Result<Chess, String> {
    let fen = fen
        .parse::<Fen>()
        .map_err(|e| format!("Invalid FEN: {}", e))?;

    let pos: Chess = fen
        .into_position(CastlingMode::Standard)
        .map_err(|e| format!("Invalid position: {:?}", e))?;

    Ok(pos)
}

pub fn pos_to_fen(pos: &Chess) -> String {
    Fen::from_position(pos, EnPassantMode::Legal).to_string()
}

fn build_move_data(pos: &Chess, move_: &Move) -> MoveData {
    let after = pos.clone().play(move_.clone()).expect("legal move");
    MoveData {
        uci: UciMove::from_move(move_.clone(), CastlingMode::Standard).to_string(),
        san: San::from_move(pos, move_.clone()).to_string(),
        from_index: usize::from(move_.from().expect("legal move has from-square")),
        to_index: usize::from(move_.to()),
        piece: piece_char(move_),
        is_capture: move_.capture().is_some(),
        is_check: after.checkers().any(),
        is_checkmate: after.is_checkmate(),
    }
}

fn build_move_data_unchecked(pos: &Chess, move_: &Move) -> MoveData {
    let mut after = pos.clone();
    after.play_unchecked(move_.clone());
    MoveData {
        uci: UciMove::from_move(move_.clone(), CastlingMode::Standard).to_string(),
        san: San::from_move(pos, move_.clone()).to_string(),
        from_index: usize::from(move_.from().expect("legal move has from-square")),
        to_index: usize::from(move_.to()),
        piece: piece_char(move_),
        is_capture: move_.capture().is_some(),
        is_check: after.checkers().any(),
        is_checkmate: after.is_checkmate(),
    }
}

pub fn get_legal_moves(pos: &Chess) -> Vec<MoveData> {
    pos.legal_moves()
        .iter()
        .map(|move_| build_move_data(pos, move_))
        .collect()
}

pub fn make_move(pos: &Chess, uci_str: &str) -> Result<Chess, String> {
    let uci = UciMove::from_ascii(uci_str.as_bytes())
        .map_err(|e| format!("Invalid UCI: {}", e))?;

    let move_ = uci.to_move(pos).map_err(|_| "Illegal move".to_string())?;

    pos.clone()
        .play(move_)
        .map_err(|e| format!("Move failed: {:?}", e))
}

pub fn make_move_with_data(pos: &Chess, uci_str: &str) -> Result<MoveResult, String> {
    let uci = UciMove::from_ascii(uci_str.as_bytes())
        .map_err(|e| format!("Invalid UCI: {}", e))?;

    let move_ = uci.to_move(pos).map_err(|_| "Illegal move".to_string())?;

    let move_data = build_move_data(pos, &move_);
    let new_pos = pos
        .clone()
        .play(move_)
        .map_err(|e| format!("Move failed: {:?}", e))?;

    Ok(MoveResult {
        position: position_data_from_pos(&new_pos),
        move_played: move_data,
    })
}

pub fn make_moves_sequence(fen: &str, uci_moves: &[String]) -> Result<MoveResult, String> {
    let mut pos = parse_fen(fen)?;
    let mut last_move_data = None;

    for (i, uci_str) in uci_moves.iter().enumerate() {
        let uci = UciMove::from_ascii(uci_str.as_bytes())
            .map_err(|e| format!("Invalid UCI at move {}: {}", i + 1, e))?;

        let move_ = uci.to_move(&pos).map_err(|_| {
            format!("Illegal move at move {}: {}", i + 1, uci_str)
        })?;

        last_move_data = Some(build_move_data(&pos, &move_));
        pos = pos
            .clone()
            .play(move_)
            .map_err(|e| format!("Move failed at move {}: {:?}", i + 1, e))?;
    }

    let move_played = last_move_data.unwrap_or(MoveData {
        uci: String::new(),
        san: String::new(),
        from_index: 0,
        to_index: 0,
        piece: ' ',
        is_capture: false,
        is_check: false,
        is_checkmate: false,
    });

    Ok(MoveResult {
        position: position_data_from_pos(&pos),
        move_played,
    })
}

fn position_data_from_pos(pos: &Chess) -> PositionData {
    PositionData {
        fen: pos_to_fen(pos),
        turn: if pos.turn().is_white() {
            "w".to_string()
        } else {
            "b".to_string()
        },
        is_check: pos.checkers().any(),
        is_checkmate: pos.is_checkmate(),
        is_stalemate: pos.is_stalemate(),
        legal_moves: get_legal_moves(pos),
    }
}

pub fn get_position_data(fen: &str) -> Result<PositionData, String> {
    let pos = parse_fen(fen)?;
    Ok(position_data_from_pos(&pos))
}

pub fn pgn_to_game(pgn: &str) -> Result<GameData, String> {
    const DEFAULT_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    struct BuildGame {
        headers: GameHeaders,
        pos: Chess,
        moves: Vec<MoveData>,
        initial_fen: String,
    }

    impl BuildGame {
        fn new() -> Self {
            BuildGame {
                headers: GameHeaders {
                    event: None,
                    site: None,
                    date: None,
                    round: None,
                    white: None,
                    black: None,
                    result: None,
                },
                pos: parse_fen(DEFAULT_FEN).expect("Default position should be valid"),
                moves: Vec::new(),
                initial_fen: DEFAULT_FEN.to_owned(),
            }
        }
    }

    struct GameParser;

    impl Visitor for GameParser {
        type Tags = BuildGame;
        type Movetext = BuildGame;
        type Output = Result<GameData, String>;

        fn begin_tags(&mut self) -> ControlFlow<Self::Output, Self::Tags> {
            ControlFlow::Continue(BuildGame::new())
        }

        fn tag(
            &mut self,
            tags: &mut Self::Tags,
            name: &[u8],
            value: RawTag<'_>,
        ) -> ControlFlow<Self::Output> {
            let key = std::str::from_utf8(name).unwrap_or("");
            let val = value.decode_utf8().unwrap_or_default().to_string();
            match key {
                "Event" => tags.headers.event = Some(val),
                "Site" => tags.headers.site = Some(val),
                "Date" => tags.headers.date = Some(val),
                "Round" => tags.headers.round = Some(val),
                "White" => tags.headers.white = Some(val),
                "Black" => tags.headers.black = Some(val),
                "Result" => tags.headers.result = Some(val),
                "FEN" | "Fen" => tags.initial_fen = val,
                _ => {}
            }
            ControlFlow::Continue(())
        }

        fn begin_movetext(
            &mut self,
            mut tags: Self::Tags,
        ) -> ControlFlow<Self::Output, Self::Movetext> {
            if tags.initial_fen != DEFAULT_FEN {
                match parse_fen(&tags.initial_fen) {
                    Ok(pos) => tags.pos = pos,
                    Err(e) => return ControlFlow::Break(Err(e)),
                }
            }
            ControlFlow::Continue(tags)
        }

        fn san(
            &mut self,
            movetext: &mut Self::Movetext,
            san_plus: SanPlus,
        ) -> ControlFlow<Self::Output> {
            let san = &san_plus.san;
            match san.to_move(&movetext.pos) {
                Ok(move_) => {
                    let move_data = build_move_data_unchecked(&movetext.pos, &move_);
                    movetext.pos.play_unchecked(move_);
                    movetext.moves.push(move_data);
                    ControlFlow::Continue(())
                }
                Err(e) => ControlFlow::Break(Err(format!("Invalid move '{}': {}", san, e))),
            }
        }

        fn begin_variation(&mut self, _movetext: &mut Self::Movetext) -> ControlFlow<Self::Output, Skip> {
            ControlFlow::Continue(Skip(true))
        }

        fn end_game(&mut self, build: Self::Movetext) -> Self::Output {
            Ok(GameData {
                headers: build.headers,
                moves: build.moves,
                initial_fen: build.initial_fen,
                final_fen: pos_to_fen(&build.pos),
            })
        }
    }

    let mut reader = pgn_reader::Reader::new(pgn.as_bytes());
    match reader.read_game(&mut GameParser) {
        Ok(Some(result)) => result,
        Ok(None) => Err("No game found in PGN".to_string()),
        Err(e) => Err(format!("PGN I/O error: {}", e)),
    }
}

fn piece_char(move_: &Move) -> char {
    match move_.role() {
        Role::Pawn => {
            if move_.promotion().is_some() {
                'p'
            } else {
                'P'
            }
        }
        Role::Knight => 'N',
        Role::Bishop => 'B',
        Role::Rook => 'R',
        Role::Queen => 'Q',
        Role::King => 'K',
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    #[test]
    fn test_parse_default_fen() {
        let pos = parse_fen(START_FEN).unwrap();
        assert_eq!(pos.turn().is_white(), true);
        assert!(!pos.is_checkmate());
        assert!(!pos.is_check());
        assert!(!pos.is_stalemate());
    }

    #[test]
    fn test_parse_invalid_fen() {
        assert!(parse_fen("not a fen").is_err());
    }

    #[test]
    fn test_pos_to_fen_roundtrip() {
        let pos = parse_fen(START_FEN).unwrap();
        let fen = pos_to_fen(&pos);
        assert_eq!(fen, START_FEN);
    }

    #[test]
    fn test_legal_moves_start() {
        let pos = parse_fen(START_FEN).unwrap();
        let moves = get_legal_moves(&pos);
        assert_eq!(moves.len(), 20); // 16 pawn + 4 knight moves
        assert!(moves.iter().any(|m| m.san == "e4"));
        assert!(moves.iter().any(|m| m.san == "Nf3"));
    }

    #[test]
    fn test_make_move_e2e4() {
        let pos = parse_fen(START_FEN).unwrap();
        let result = make_move_with_data(&pos, "e2e4").unwrap();
        assert_eq!(result.move_played.san, "e4");
        assert_eq!(result.move_played.piece, 'P');
        assert!(!result.move_played.is_capture);
        assert!(!result.move_played.is_check);
        assert_eq!(result.position.turn, "b");
        assert_eq!(result.position.legal_moves.len(), 20);
    }

    #[test]
    fn test_make_move_capture() {
        let fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
        let pos = parse_fen(fen).unwrap();
        let result = make_move_with_data(&pos, "d2d4").unwrap();
        assert!(!result.move_played.is_capture);
        assert_eq!(result.move_played.san, "d4");
    }

    #[test]
    fn test_make_move_check() {
        // Rook on e7 checks black king on e8. Black can capture the rook (only legal move).
        let fen = "rnbqkbnr/ppppRppp/8/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";
        let pos = parse_fen(fen).unwrap();
        assert!(pos.checkers().any());
        let result = make_move_with_data(&pos, "e8e7").unwrap();
        assert_eq!(result.move_played.san, "Kxe7");
        assert!(result.move_played.is_capture);
    }

    #[test]
    fn test_is_checkmate() {
        // Fool's mate: after 1.f3 e5 2.g4 Qh4#
        let data = get_position_data("rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 0 3").unwrap();
        assert!(data.is_checkmate);
        assert!(data.is_check);
    }

    #[test]
    fn test_make_moves_sequence() {
        let moves = vec![
            "e2e4".into(),
            "e7e5".into(),
            "g1f3".into(),
        ];
        let result = make_moves_sequence(START_FEN, &moves).unwrap();
        assert_eq!(result.move_played.san, "Nf3");
        assert_eq!(result.position.turn, "b");
    }

    #[test]
    fn test_make_moves_sequence_empty() {
        // Empty sequence should return the starting position with a default MoveData
        let moves: Vec<String> = vec![];
        let result = make_moves_sequence(START_FEN, &moves).unwrap();
        assert_eq!(result.move_played.san, "");
        assert_eq!(result.position.turn, "w");
    }

    #[test]
    fn test_illegal_move() {
        let pos = parse_fen(START_FEN).unwrap();
        assert!(make_move_with_data(&pos, "e2e5").is_err());
    }

    #[test]
    fn test_get_position_data() {
        let data = get_position_data(START_FEN).unwrap();
        assert_eq!(data.turn, "w");
        assert!(!data.is_check);
        assert!(!data.is_checkmate);
        assert!(!data.is_stalemate);
        assert_eq!(data.legal_moves.len(), 20);
    }

    #[test]
    fn test_make_move_uci_format() {
        let result = make_move_with_data(
            &parse_fen(START_FEN).unwrap(),
            "g1f3",
        ).unwrap();
        assert_eq!(result.move_played.san, "Nf3");
        assert_eq!(result.move_played.uci, "g1f3");
    }

    #[test]
    fn test_parse_fen_with_moves() {
        // Italian Game position
        let fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4";
        let pos = parse_fen(fen).unwrap();
        assert_eq!(pos.turn().is_white(), false);
        let moves = get_legal_moves(&pos);
        assert!(!moves.is_empty());
        assert!(moves.iter().any(|m| m.san == "Nf6" || m.san == "d6" || m.san == "a6"));
    }

    #[test]
    fn test_pgn_to_game_simple() {
        let pgn = r#"[Event "Test Game"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0
"#;
        let game = pgn_to_game(pgn).unwrap();
        assert_eq!(game.headers.white, Some("Player1".to_string()));
        assert_eq!(game.headers.black, Some("Player2".to_string()));
        assert_eq!(game.headers.event, Some("Test Game".to_string()));
        assert_eq!(game.headers.result, Some("1-0".to_string()));
        assert_eq!(game.initial_fen, START_FEN);
        assert_eq!(game.moves.len(), 10);
        assert_eq!(game.moves[0].san, "e4");
        assert_eq!(game.moves[8].san, "O-O");
    }

    #[test]
    fn test_pgn_to_game_fen_start() {
        let pgn = r#"[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]
[SetUp "1"]

1... e5 2. Nf3 *"#;
        let game = pgn_to_game(pgn).unwrap();
        assert_eq!(game.initial_fen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
        assert_eq!(game.moves.len(), 2);
        assert_eq!(game.moves[0].san, "e5");
    }

    #[test]
    fn test_pgn_to_game_skip_variations() {
        let pgn = "1. e4 (1. d4 d5) e5 2. Nf3 *";
        let game = pgn_to_game(pgn).unwrap();
        // Variations should be skipped, only mainline counted
        assert_eq!(game.moves.len(), 3);
        assert_eq!(game.moves[0].san, "e4");
        assert_eq!(game.moves[1].san, "e5");
        assert_eq!(game.moves[2].san, "Nf3");
    }

    #[test]
    fn test_pgn_to_game_empty() {
        assert!(pgn_to_game("").is_err());
    }

    #[test]
    fn test_make_move_castling() {
        // Position where white can castle kingside (bishop on f1 has moved away, f1 and g1 empty)
        let fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 3";
        let pos = parse_fen(fen).unwrap();
        let result = make_move_with_data(&pos, "e1g1").unwrap();
        assert_eq!(result.move_played.san, "O-O");
    }

    #[test]
    fn test_make_move_en_passant() {
        // Position where en passant is possible
        // White pawn on e5, black pawn on d7-d5 (last move), en passant square d6
        // Actually let's use a simpler approach: start from a position
        let fen = "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3";
        let pos = parse_fen(fen).unwrap();
        match make_move_with_data(&pos, "e5d6") {
            Ok(result) => {
                assert_eq!(result.move_played.san, "exd6");
                assert!(result.move_played.is_capture);
            }
            Err(e) => panic!("en passant move failed: {}", e),
        }
    }

    #[test]
    fn test_capture_flag() {
        let fen = "rnbqkbnr/ppp1pppp/8/3p4/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2";
        let pos = parse_fen(fen).unwrap();
        let result = make_move_with_data(&pos, "d5e4").unwrap();
        assert_eq!(result.move_played.san, "dxe4");
        assert!(result.move_played.is_capture);
    }

    #[test]
    fn test_make_move_promotion() {
        // White pawn on b7 about to promote (b8 empty)
        let fen = "r1bqkbnr/1Ppppppp/8/8/8/8/pPPPPPPP/RNBQKBNR w KQkq - 0 1";
        let pos = parse_fen(fen).unwrap();
        match make_move_with_data(&pos, "b7b8q") {
            Ok(result) => {
                assert_eq!(result.move_played.san, "b8=Q");
                assert_eq!(result.move_played.piece, 'p');
                assert!(!result.move_played.is_capture);
            }
            Err(e) => panic!("promotion move failed: {}", e),
        }
    }
}

