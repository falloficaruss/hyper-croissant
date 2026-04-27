use tracing::info;

mod chess;
mod commands;
mod engine;
mod error;

fn main() {
    tracing_subscriber::fmt::init();

    info!("Starting Hyper-Croissant...");

    tauri::Builder::new()
        .plugin(tauri_plugin_shell::init())
        .manage(engine::EngineManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_engine,
            commands::stop_engine,
            commands::go_position,
            commands::stop_analysis,
            commands::get_legal_moves,
            commands::validate_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hyper-Croissant");
}
