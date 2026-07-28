use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::chess::{GameData, GameHeaders};

/// Lightweight row for the game library list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedGameSummary {
    pub id: i64,
    pub white: Option<String>,
    pub black: Option<String>,
    pub event: Option<String>,
    pub site: Option<String>,
    pub date: Option<String>,
    pub round: Option<String>,
    pub result: Option<String>,
    pub eco: Option<String>,
    pub move_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Full saved game including PGN text.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedGame {
    pub id: i64,
    pub headers: GameHeaders,
    pub pgn: String,
    pub initial_fen: String,
    pub move_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

impl SavedGame {
    pub fn into_summary(self) -> SavedGameSummary {
        SavedGameSummary {
            id: self.id,
            white: self.headers.white,
            black: self.headers.black,
            event: self.headers.event,
            site: self.headers.site,
            date: self.headers.date,
            round: self.headers.round,
            result: self.headers.result,
            eco: self.headers.eco,
            move_count: self.move_count,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

/// SQLite-backed game library.
pub struct GameStore {
    conn: Mutex<Connection>,
    #[allow(dead_code)]
    path: PathBuf,
}

impl GameStore {
    /// Open (or create) the game database in the app data directory.
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
        let path = dir.join("games.db");
        Self::open_path(&path)
    }

    /// Open a database at an explicit path (used by tests).
    pub fn open_path(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("Failed to open database: {e}"))?;
        let store = GameStore {
            conn: Mutex::new(conn),
            path: path.to_path_buf(),
        };
        store.init_schema()?;
        Ok(store)
    }

    fn init_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                white TEXT,
                black TEXT,
                event TEXT,
                site TEXT,
                date TEXT,
                round TEXT,
                result TEXT,
                eco TEXT,
                pgn TEXT NOT NULL,
                initial_fen TEXT NOT NULL,
                move_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_games_white ON games(white);
            CREATE INDEX IF NOT EXISTS idx_games_black ON games(black);
            CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
            CREATE INDEX IF NOT EXISTS idx_games_eco ON games(eco);
            CREATE INDEX IF NOT EXISTS idx_games_updated ON games(updated_at DESC);
            "#,
        )
        .map_err(|e| format!("Failed to init schema: {e}"))?;
        Ok(())
    }

    fn now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    }

    /// Insert a new game from parsed data + canonical PGN text.
    pub fn save_new(&self, game: &GameData, pgn: &str) -> Result<SavedGame, String> {
        let now = Self::now();
        let move_count = game.moves.len() as i64;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute(
            r#"
            INSERT INTO games (
                white, black, event, site, date, round, result, eco,
                pgn, initial_fen, move_count, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            "#,
            params![
                game.headers.white,
                game.headers.black,
                game.headers.event,
                game.headers.site,
                game.headers.date,
                game.headers.round,
                game.headers.result,
                game.headers.eco,
                pgn,
                game.initial_fen,
                move_count,
                now,
                now,
            ],
        )
        .map_err(|e| format!("Failed to insert game: {e}"))?;

        let id = conn.last_insert_rowid();
        Ok(SavedGame {
            id,
            headers: game.headers.clone(),
            pgn: pgn.to_string(),
            initial_fen: game.initial_fen.clone(),
            move_count,
            created_at: now,
            updated_at: now,
        })
    }

    /// Update an existing game in place.
    pub fn update(&self, id: i64, game: &GameData, pgn: &str) -> Result<SavedGame, String> {
        let now = Self::now();
        let move_count = game.moves.len() as i64;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let rows = conn
            .execute(
                r#"
                UPDATE games SET
                    white = ?1, black = ?2, event = ?3, site = ?4, date = ?5,
                    round = ?6, result = ?7, eco = ?8, pgn = ?9, initial_fen = ?10,
                    move_count = ?11, updated_at = ?12
                WHERE id = ?13
                "#,
                params![
                    game.headers.white,
                    game.headers.black,
                    game.headers.event,
                    game.headers.site,
                    game.headers.date,
                    game.headers.round,
                    game.headers.result,
                    game.headers.eco,
                    pgn,
                    game.initial_fen,
                    move_count,
                    now,
                    id,
                ],
            )
            .map_err(|e| format!("Failed to update game: {e}"))?;

        if rows == 0 {
            return Err(format!("Game not found: {id}"));
        }

        let created_at: i64 = conn
            .query_row(
                "SELECT created_at FROM games WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to read created_at: {e}"))?;

        Ok(SavedGame {
            id,
            headers: game.headers.clone(),
            pgn: pgn.to_string(),
            initial_fen: game.initial_fen.clone(),
            move_count,
            created_at,
            updated_at: now,
        })
    }

    /// Load a full saved game by id.
    pub fn load(&self, id: i64) -> Result<Option<SavedGame>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            r#"
            SELECT id, white, black, event, site, date, round, result, eco,
                   pgn, initial_fen, move_count, created_at, updated_at
            FROM games WHERE id = ?1
            "#,
            params![id],
            |row| {
                Ok(SavedGame {
                    id: row.get(0)?,
                    headers: GameHeaders {
                        white: row.get(1)?,
                        black: row.get(2)?,
                        event: row.get(3)?,
                        site: row.get(4)?,
                        date: row.get(5)?,
                        round: row.get(6)?,
                        result: row.get(7)?,
                        eco: row.get(8)?,
                    },
                    pgn: row.get(9)?,
                    initial_fen: row.get(10)?,
                    move_count: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to load game: {e}"))
    }

    /// List games, optionally filtered by a free-text query (player/event/eco/date/result).
    pub fn list(&self, query: Option<&str>) -> Result<Vec<SavedGameSummary>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let q = query.map(str::trim).filter(|s| !s.is_empty());

        let mut stmt = if q.is_some() {
            conn.prepare(
                r#"
                SELECT id, white, black, event, site, date, round, result, eco,
                       move_count, created_at, updated_at
                FROM games
                WHERE white LIKE ?1 ESCAPE '\'
                   OR black LIKE ?1 ESCAPE '\'
                   OR event LIKE ?1 ESCAPE '\'
                   OR site LIKE ?1 ESCAPE '\'
                   OR date LIKE ?1 ESCAPE '\'
                   OR result LIKE ?1 ESCAPE '\'
                   OR eco LIKE ?1 ESCAPE '\'
                   OR round LIKE ?1 ESCAPE '\'
                ORDER BY updated_at DESC, id DESC
                "#,
            )
            .map_err(|e| format!("Failed to prepare list query: {e}"))?
        } else {
            conn.prepare(
                r#"
                SELECT id, white, black, event, site, date, round, result, eco,
                       move_count, created_at, updated_at
                FROM games
                ORDER BY updated_at DESC, id DESC
                "#,
            )
            .map_err(|e| format!("Failed to prepare list query: {e}"))?
        };

        let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<SavedGameSummary> {
            Ok(SavedGameSummary {
                id: row.get(0)?,
                white: row.get(1)?,
                black: row.get(2)?,
                event: row.get(3)?,
                site: row.get(4)?,
                date: row.get(5)?,
                round: row.get(6)?,
                result: row.get(7)?,
                eco: row.get(8)?,
                move_count: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        };

        let rows = if let Some(q) = q {
            let pattern = format!("%{}%", escape_like(q));
            let mapped = stmt
                .query_map(params![pattern], map_row)
                .map_err(|e| format!("Failed to list games: {e}"))?;
            mapped.collect::<Result<Vec<_>, _>>()
        } else {
            let mapped = stmt
                .query_map([], map_row)
                .map_err(|e| format!("Failed to list games: {e}"))?;
            mapped.collect::<Result<Vec<_>, _>>()
        }
        .map_err(|e| format!("Failed to list games: {e}"))?;

        Ok(rows)
    }

    /// Delete a game by id. Returns true if a row was removed.
    pub fn delete(&self, id: i64) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows = conn
            .execute("DELETE FROM games WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete game: {e}"))?;
        Ok(rows > 0)
    }
}

fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess::{self, GameData, GameHeaders, MoveData};

    fn temp_store() -> (GameStore, PathBuf) {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("hc-store-test-{}.db", nanos));
        let store = GameStore::open_path(&path).unwrap();
        (store, path)
    }

    fn sample_game() -> GameData {
        chess::pgn_to_game(
            r#"[Event "Club Night"]
[Site "Local"]
[Date "2024.01.15"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 1-0
"#,
        )
        .unwrap()
    }

    #[test]
    fn save_load_delete() {
        let (store, path) = temp_store();
        let game = sample_game();
        let pgn = chess::game_to_pgn(&game);

        let saved = store.save_new(&game, &pgn).unwrap();
        assert!(saved.id > 0);
        assert_eq!(saved.move_count, 4);
        assert_eq!(saved.headers.white.as_deref(), Some("Alice"));
        assert_eq!(saved.headers.eco.as_deref(), Some("C50"));

        let loaded = store.load(saved.id).unwrap().unwrap();
        assert_eq!(loaded.headers.black.as_deref(), Some("Bob"));
        assert!(loaded.pgn.contains("e4"));

        assert!(store.delete(saved.id).unwrap());
        assert!(store.load(saved.id).unwrap().is_none());
        assert!(!store.delete(saved.id).unwrap());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn update_and_list_filter() {
        let (store, path) = temp_store();
        let game = sample_game();
        let pgn = chess::game_to_pgn(&game);
        let saved = store.save_new(&game, &pgn).unwrap();

        let mut updated_game = game.clone();
        updated_game.headers.white = Some("Alicia".to_string());
        let updated_pgn = chess::game_to_pgn(&updated_game);
        let updated = store.update(saved.id, &updated_game, &updated_pgn).unwrap();
        assert_eq!(updated.headers.white.as_deref(), Some("Alicia"));

        let all = store.list(None).unwrap();
        assert_eq!(all.len(), 1);

        let filtered = store.list(Some("alic")).unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].white.as_deref(), Some("Alicia"));

        let none = store.list(Some("zzz-no-match")).unwrap();
        assert!(none.is_empty());

        let eco = store.list(Some("C50")).unwrap();
        assert_eq!(eco.len(), 1);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn update_missing_errors() {
        let (store, path) = temp_store();
        let game = GameData {
            headers: GameHeaders {
                event: None,
                site: None,
                date: None,
                round: None,
                white: Some("X".into()),
                black: Some("Y".into()),
                result: Some("*".into()),
                eco: None,
            },
            moves: Vec::<MoveData>::new(),
            initial_fen: chess::START_FEN.to_string(),
            final_fen: chess::START_FEN.to_string(),
        };
        let err = store.update(9999, &game, "*\n").unwrap_err();
        assert!(err.contains("not found"));
        let _ = std::fs::remove_file(path);
    }
}
