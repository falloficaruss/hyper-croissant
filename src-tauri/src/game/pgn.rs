use crate::chess::{self, GameData};
use crate::game::store::{GameStore, SavedGame, SavedGameSummary};
use crate::error::HyperCroissantError;

/// Parse and import one or more games from PGN text into the store.
pub fn import_pgn_text(
    store: &GameStore,
    pgn: &str,
) -> Result<Vec<SavedGameSummary>, HyperCroissantError> {
    let games = chess::pgn_to_games(pgn).map_err(HyperCroissantError::InvalidPgn)?;
    let mut summaries = Vec::with_capacity(games.len());

    for game in games {
        let pgn_text = chess::game_to_pgn(&game);
        let saved = store
            .save_new(&game, &pgn_text)
            .map_err(|e| HyperCroissantError::GameStoreError(e))?;
        summaries.push(saved.into_summary());
    }

    Ok(summaries)
}

/// Export a saved game as PGN text (prefer stored PGN; rebuild if empty).
pub fn saved_game_to_pgn(game: &SavedGame) -> String {
    if !game.pgn.trim().is_empty() {
        return game.pgn.clone();
    }
    // Fallback: rebuild from headers + empty movetext if needed
    let data = GameData {
        headers: game.headers.clone(),
        moves: Vec::new(),
        initial_fen: game.initial_fen.clone(),
        final_fen: game.initial_fen.clone(),
    };
    chess::game_to_pgn(&data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::GameStore;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db() -> (GameStore, std::path::PathBuf) {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("hc-pgn-test-{}.db", nanos));
        let store = GameStore::open_path(&path).unwrap();
        (store, path)
    }

    #[test]
    fn import_single_game() {
        let (store, path) = temp_db();
        let pgn = r#"[Event "Test"]
[White "A"]
[Black "B"]
[Result "1-0"]
[ECO "C20"]

1. e4 e5 1-0
"#;
        let imported = import_pgn_text(&store, pgn).unwrap();
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].white.as_deref(), Some("A"));
        assert_eq!(imported[0].eco.as_deref(), Some("C20"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn import_multi_game() {
        let (store, path) = temp_db();
        let pgn = r#"[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 1-0

[White "C"]
[Black "D"]
[Result "0-1"]

1. d4 d5 0-1
"#;
        let imported = import_pgn_text(&store, pgn).unwrap();
        assert_eq!(imported.len(), 2);
        assert_eq!(imported[0].white.as_deref(), Some("A"));
        assert_eq!(imported[1].white.as_deref(), Some("C"));
        let _ = std::fs::remove_file(path);
    }
}
