use crate::chess::{self, MoveData, MoveResult, PositionData};
use crate::engine::{EngineCommand, EngineConfig, EngineManager};
use crate::error::HyperCroissantError;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn start_engine(
    config: EngineConfig,
    manager: State<'_, EngineManager>,
    app_handle: AppHandle,
) -> Result<(), HyperCroissantError> {
    manager.start(config, app_handle).await
}

#[tauri::command]
pub async fn stop_engine(manager: State<'_, EngineManager>) -> Result<(), HyperCroissantError> {
    manager.stop().await
}

#[tauri::command]
pub async fn go_position(
    fen: String,
    moves: Vec<String>,
    depth: Option<u32>,
    manager: State<'_, EngineManager>,
) -> Result<(), HyperCroissantError> {
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
pub async fn stop_analysis(manager: State<'_, EngineManager>) -> Result<(), HyperCroissantError> {
    manager.send_command(EngineCommand::Stop).await
}

#[tauri::command]
pub async fn get_legal_moves(fen: String) -> Result<Vec<MoveData>, HyperCroissantError> {
    let pos = chess::parse_fen(&fen).map_err(HyperCroissantError::InvalidFen)?;
    Ok(chess::get_legal_moves(&pos))
}

#[tauri::command]
pub async fn validate_position(fen: String) -> Result<PositionData, HyperCroissantError> {
    chess::get_position_data(&fen).map_err(HyperCroissantError::InvalidFen)
}

#[tauri::command]
pub async fn make_move_command(
    fen: String,
    uci_move: String,
) -> Result<MoveResult, HyperCroissantError> {
    let pos = chess::parse_fen(&fen).map_err(HyperCroissantError::InvalidFen)?;
    chess::make_move_with_data(&pos, &uci_move).map_err(HyperCroissantError::InvalidMove)
}

#[tauri::command]
pub async fn make_moves_command(
    fen: String,
    uci_moves: Vec<String>,
) -> Result<MoveResult, HyperCroissantError> {
    chess::make_moves_sequence(&fen, &uci_moves).map_err(HyperCroissantError::InvalidMove)
}

#[tauri::command]
pub async fn get_game_from_pgn(pgn: String) -> Result<chess::GameData, HyperCroissantError> {
    chess::pgn_to_game(&pgn).map_err(HyperCroissantError::InvalidPgn)
}

#[tauri::command]
pub async fn set_engine_option(
    name: String,
    value: String,
    manager: State<'_, EngineManager>,
) -> Result<(), HyperCroissantError> {
    manager
        .send_command(EngineCommand::SetOption { name, value })
        .await
}

use std::sync::Mutex as StdMutex;
use crate::analysis::{self, EngineLineInfo, StructuredAnalysis, MoveComparison, ScoreData, PositionCache};

#[tauri::command]
pub async fn analyze_position_command(
    fen: String,
    engine_lines: Vec<EngineLineInfo>,
    cache: State<'_, StdMutex<PositionCache>>,
) -> Result<StructuredAnalysis, HyperCroissantError> {
    let pos = chess::parse_fen(&fen).map_err(HyperCroissantError::InvalidFen)?;

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
) -> Result<MoveComparison, HyperCroissantError> {
    let pos = chess::parse_fen(&fen).map_err(HyperCroissantError::InvalidFen)?;
    analysis::compare_moves(&pos, &user_move, &engine_move, user_score, engine_score)
        .map_err(|e| HyperCroissantError::InvalidMove(e))
}
