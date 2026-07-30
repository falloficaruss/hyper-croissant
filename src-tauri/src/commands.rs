use crate::chess::{self, MoveData, MoveResult, PositionData};
use crate::engine::{EngineCommand, EngineConfig, EngineManager};
use crate::error::OropisError;
use crate::game::{self, GameStore, SavedGame, SavedGameSummary};
use crate::llm::{self, LlmChatRequest, LlmState};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn start_engine(
    config: EngineConfig,
    manager: State<'_, EngineManager>,
    app_handle: AppHandle,
) -> Result<(), OropisError> {
    manager.start(config, app_handle).await
}

#[tauri::command]
pub async fn stop_engine(manager: State<'_, EngineManager>) -> Result<(), OropisError> {
    manager.stop().await
}

#[tauri::command]
pub async fn go_position(
    fen: String,
    moves: Vec<String>,
    depth: Option<u32>,
    manager: State<'_, EngineManager>,
) -> Result<(), OropisError> {
    manager
        .send_command(EngineCommand::Position { fen, moves })
        .await?;
    let infinite = depth.is_none();
    manager
        .send_command(EngineCommand::Go {
            depth,
            movetime: None,
            infinite,
        })
        .await
}

#[tauri::command]
pub async fn stop_analysis(manager: State<'_, EngineManager>) -> Result<(), OropisError> {
    manager.send_command(EngineCommand::Stop).await
}

#[tauri::command]
pub async fn get_legal_moves(fen: String) -> Result<Vec<MoveData>, OropisError> {
    let pos = chess::parse_fen(&fen).map_err(OropisError::InvalidFen)?;
    Ok(chess::get_legal_moves(&pos))
}

#[tauri::command]
pub async fn validate_position(fen: String) -> Result<PositionData, OropisError> {
    chess::get_position_data(&fen).map_err(OropisError::InvalidFen)
}

#[tauri::command]
pub async fn make_move_command(
    fen: String,
    uci_move: String,
) -> Result<MoveResult, OropisError> {
    let pos = chess::parse_fen(&fen).map_err(OropisError::InvalidFen)?;
    chess::make_move_with_data(&pos, &uci_move).map_err(OropisError::InvalidMove)
}

#[tauri::command]
pub async fn make_moves_command(
    fen: String,
    uci_moves: Vec<String>,
) -> Result<MoveResult, OropisError> {
    chess::make_moves_sequence(&fen, &uci_moves).map_err(OropisError::InvalidMove)
}

#[tauri::command]
pub async fn get_game_from_pgn(pgn: String) -> Result<chess::GameData, OropisError> {
    chess::pgn_to_game(&pgn).map_err(OropisError::InvalidPgn)
}

// ── Game library (Phase 8) ──────────────────────────────────────────

#[tauri::command]
pub async fn save_game(
    pgn: String,
    id: Option<i64>,
    store: State<'_, GameStore>,
) -> Result<SavedGameSummary, OropisError> {
    let game = chess::pgn_to_game(&pgn).map_err(OropisError::InvalidPgn)?;
    let canonical = chess::game_to_pgn(&game);
    let saved = match id {
        Some(existing_id) => store
            .update(existing_id, &game, &canonical)
            .map_err(|e| {
                if e.contains("not found") {
                    OropisError::GameNotFound(existing_id)
                } else {
                    OropisError::GameStoreError(e)
                }
            })?,
        None => store
            .save_new(&game, &canonical)
            .map_err(OropisError::GameStoreError)?,
    };
    Ok(saved.into_summary())
}

#[tauri::command]
pub async fn load_game(
    id: i64,
    store: State<'_, GameStore>,
) -> Result<SavedGame, OropisError> {
    store
        .load(id)
        .map_err(OropisError::GameStoreError)?
        .ok_or(OropisError::GameNotFound(id))
}

#[tauri::command]
pub async fn list_games(
    query: Option<String>,
    store: State<'_, GameStore>,
) -> Result<Vec<SavedGameSummary>, OropisError> {
    store
        .list(query.as_deref())
        .map_err(OropisError::GameStoreError)
}

#[tauri::command]
pub async fn delete_game(
    id: i64,
    store: State<'_, GameStore>,
) -> Result<(), OropisError> {
    let deleted = store
        .delete(id)
        .map_err(OropisError::GameStoreError)?;
    if !deleted {
        return Err(OropisError::GameNotFound(id));
    }
    Ok(())
}

#[tauri::command]
pub async fn import_pgn(
    pgn: String,
    store: State<'_, GameStore>,
) -> Result<Vec<SavedGameSummary>, OropisError> {
    game::import_pgn_text(&store, &pgn)
}

#[tauri::command]
pub async fn export_pgn(
    id: i64,
    store: State<'_, GameStore>,
) -> Result<String, OropisError> {
    let saved = store
        .load(id)
        .map_err(OropisError::GameStoreError)?
        .ok_or(OropisError::GameNotFound(id))?;
    Ok(game::saved_game_to_pgn(&saved))
}

/// Export arbitrary in-memory game data (current board session) as PGN.
#[tauri::command]
pub async fn game_data_to_pgn(game: chess::GameData) -> Result<String, OropisError> {
    Ok(chess::game_to_pgn(&game))
}

#[tauri::command]
pub async fn set_engine_option(
    name: String,
    value: String,
    manager: State<'_, EngineManager>,
) -> Result<(), OropisError> {
    manager
        .send_command(EngineCommand::SetOption { name, value })
        .await
}

use std::sync::Mutex as StdMutex;
use crate::analysis::{
    self, CachedAnalysis, EngineLineInfo, EvalSwing, MoveComparison, PositionCache, ScoreData,
    StructuredAnalysis,
};

#[tauri::command]
pub async fn analyze_position_command(
    fen: String,
    engine_lines: Vec<EngineLineInfo>,
    cache: State<'_, StdMutex<PositionCache>>,
) -> Result<StructuredAnalysis, OropisError> {
    let pos = chess::parse_fen(&fen).map_err(OropisError::InvalidFen)?;

    // Check cache
    let norm_fen = PositionCache::normalize_fen(&fen);
    {
        let cached = cache.lock().unwrap();
        if let Some(entry) = cached.get(&norm_fen) {
            return Ok(StructuredAnalysis {
                fen: norm_fen,
                features: entry.features.clone(),
                concepts: entry.concepts.clone(),
                tactics: entry.tactics.clone(),
                engine_lines,
            });
        }
    }

    // Compute analysis
    let result = analysis::analyze_position(&pos, &engine_lines);

    // Cache
    let mut cached = cache.lock().unwrap();
    cached.insert(
        norm_fen,
        analysis::CachedAnalysis {
            features: result.features.clone(),
            concepts: result.concepts.clone(),
            tactics: result.tactics.clone(),
        },
    );

    Ok(result)
}

#[tauri::command]
pub async fn compare_moves_command(
    fen: String,
    user_move: String,
    engine_move: String,
    user_score: Option<ScoreData>,
    engine_score: Option<ScoreData>,
) -> Result<MoveComparison, OropisError> {
    let pos = chess::parse_fen(&fen).map_err(OropisError::InvalidFen)?;
    analysis::compare_moves(&pos, &user_move, &engine_move, user_score, engine_score)
        .map_err(|e| OropisError::InvalidMove(e))
}

#[tauri::command]
pub async fn get_cached_analysis(
    fen: String,
    cache: State<'_, StdMutex<PositionCache>>,
) -> Result<Option<CachedAnalysis>, OropisError> {
    let norm_fen = PositionCache::normalize_fen(&fen);
    let cached = cache.lock().unwrap();
    Ok(cached.get(&norm_fen).cloned())
}

#[tauri::command]
pub async fn analyze_eval_swing_command(
    fen_before: String,
    user_move: String,
    eval_before: Option<ScoreData>,
    eval_after: Option<ScoreData>,
    cache: State<'_, StdMutex<PositionCache>>,
) -> Result<EvalSwing, OropisError> {
    // Cache hit (scores are part of the result; recompute if scores differ)
    {
        let cached = cache.lock().unwrap();
        if let Some(entry) = cached.get_swing(&fen_before, &user_move) {
            let scores_match = entry.eval_before == eval_before && entry.eval_after == eval_after;
            if scores_match {
                return Ok(entry.clone());
            }
        }
    }

    let pos = chess::parse_fen(&fen_before).map_err(OropisError::InvalidFen)?;
    let swing = analysis::analyze_eval_swing(&pos, &user_move, eval_before, eval_after)
        .map_err(OropisError::InvalidMove)?;

    let mut cached = cache.lock().unwrap();
    cached.insert_swing(swing.clone());
    Ok(swing)
}

#[tauri::command]
pub async fn save_api_key(
    provider: String,
    key: String,
    state: State<'_, LlmState>,
) -> Result<(), OropisError> {
    state.keychain().save(&provider, &key)
}

#[tauri::command]
pub async fn load_api_key(
    provider: String,
    state: State<'_, LlmState>,
) -> Result<Option<String>, OropisError> {
    state.keychain().load(&provider)
}

#[tauri::command]
pub async fn has_api_key(
    provider: String,
    state: State<'_, LlmState>,
) -> Result<bool, OropisError> {
    state.keychain().has(&provider)
}

#[tauri::command]
pub async fn delete_api_key(
    provider: String,
    state: State<'_, LlmState>,
) -> Result<(), OropisError> {
    state.keychain().delete(&provider)
}

#[tauri::command]
pub async fn llm_chat(
    request: LlmChatRequest,
    on_chunk: Channel<String>,
    state: State<'_, LlmState>,
) -> Result<String, OropisError> {
    let channel = if request.stream { Some(&on_chunk) } else { None };
    llm::chat(&state, &request, channel).await
}
