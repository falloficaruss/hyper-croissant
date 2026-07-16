pub mod analysis;
pub mod chess;
pub mod commands;
pub mod engine;
pub mod error;

use std::sync::Mutex;

use tracing::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    info!("Starting Hyper-Croissant...");

    tauri::Builder::new()
        .plugin(tauri_plugin_shell::init())
        .manage(engine::EngineManager::new())
        .manage(Mutex::new(analysis::PositionCache::new(1024)))
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hyper-Croissant");
}
