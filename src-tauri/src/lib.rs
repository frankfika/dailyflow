mod commands;
mod config;
mod filesystem;
mod git_service;
mod markdown;
mod models;
mod projects;
mod rollover;
mod server;
mod state;

use state::AppState;
use std::sync::Mutex;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            config: Mutex::new(config::load_config().unwrap_or_default()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_daily_note,
            commands::create_daily_note,
            commands::update_daily_note,
            commands::list_daily_notes,
            commands::get_tasks,
            commands::update_task_status,
            commands::create_task,
            commands::edit_task,
            commands::delete_task,
            commands::preview_rollover,
            commands::apply_rollover,
            commands::get_config,
            commands::save_config,
            commands::validate_path,
            commands::choose_folder,
            commands::check_first_run,
            commands::get_all_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::get_git_status,
            commands::sync_git,
            commands::init_git_repo,
            commands::set_git_remote,
        ])
        .setup(|app| {
            // Ensure config directory exists
            let _ = config::ensure_config_dir();

            // Start Express server
            if let Err(e) = server::setup_server(app) {
                eprintln!("Failed to start server: {}", e);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
