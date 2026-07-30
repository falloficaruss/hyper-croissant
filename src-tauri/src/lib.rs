pub mod analysis;
pub mod chess;
pub mod commands;
pub mod engine;
pub mod error;
pub mod game;
pub mod llm;

use std::sync::Mutex;

use tauri::Manager;
use tracing::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    info!("Starting Oropis...");

    tauri::Builder::new()
        .plugin(tauri_plugin_shell::init())
        .manage(engine::EngineManager::new())
        .manage(Mutex::new(analysis::PositionCache::new(1024)))
        .manage(llm::LlmState::new())
        .setup(|app| {
            let store = game::GameStore::open(app.handle())
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_engine,
            commands::stop_engine,
            commands::go_position,
            commands::stop_analysis,
            commands::get_legal_moves,
            commands::validate_position,
            commands::make_move_command,
            commands::make_moves_command,
            commands::get_game_from_pgn,
            commands::set_engine_option,
            commands::analyze_position_command,
            commands::compare_moves_command,
            commands::get_cached_analysis,
            commands::analyze_eval_swing_command,
            commands::save_game,
            commands::load_game,
            commands::list_games,
            commands::delete_game,
            commands::import_pgn,
            commands::export_pgn,
            commands::game_data_to_pgn,
            commands::save_api_key,
            commands::load_api_key,
            commands::has_api_key,
            commands::delete_api_key,
            commands::llm_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Oropis");
}
