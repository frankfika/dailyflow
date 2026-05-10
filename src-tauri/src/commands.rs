use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::config;
use crate::filesystem;
use crate::git_service;
use crate::markdown;
use crate::models::*;
use crate::projects;
use crate::rollover;
use crate::state::AppState;

// File operations
#[tauri::command]
pub fn get_daily_note(date: String, state: State<AppState>) -> Result<Option<DailyNote>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    filesystem::read_daily_note(&date, &config)
}

#[tauri::command]
pub fn create_daily_note(
    date: String,
    content: String,
    state: State<AppState>,
) -> Result<(), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    filesystem::write_daily_note(&date, &content, &config)
}

#[tauri::command]
pub fn update_daily_note(
    date: String,
    content: String,
    state: State<AppState>,
) -> Result<(), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    filesystem::write_daily_note(&date, &content, &config)
}

#[tauri::command]
pub fn list_daily_notes(state: State<AppState>) -> Result<Vec<String>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    filesystem::list_daily_notes(&config)
}

// Task operations
#[tauri::command]
pub fn get_tasks(date: String, state: State<AppState>) -> Result<Vec<Task>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    match filesystem::read_daily_note(&date, &config)? {
        Some(note) => Ok(note.tasks),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
pub fn update_task_status(
    task_id: String,
    date: String,
    status: String,
    state: State<AppState>,
) -> Result<(), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let note = match filesystem::read_daily_note(&date, &config)? {
        Some(n) => n,
        None => return Err(String::from("File not found")),
    };

    let task = note
        .tasks
        .iter()
        .find(|t| t.id == task_id)
        .ok_or("Task not found")?;

    let line = task.line.ok_or("Task line not found")?;
    let new_content = markdown::update_task_in_markdown(&note.content, line, &status);
    filesystem::write_daily_note(&date, &new_content, &config)?;
    Ok(())
}

#[tauri::command]
pub fn create_task(
    date: String,
    task: TaskInput,
    state: State<AppState>,
) -> Result<Task, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let note = filesystem::read_daily_note(&date, &config)?;
    let original_content = note.map(|n| n.content).unwrap_or_default();

    let task_model = Task {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        tags: task.tags,
        project: task.project,
        deadline: task.deadline,
        priority: task.priority,
        source_date: task.source_date,
        line: None,
    };

    let new_content = markdown::append_task_to_markdown(&original_content, &task_model, Some(&date));
    filesystem::write_daily_note(&date, &new_content, &config)?;
    Ok(task_model)
}

#[tauri::command]
pub fn edit_task(
    task_id: String,
    date: String,
    updates: TaskUpdateInput,
    state: State<AppState>,
) -> Result<(), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let note = match filesystem::read_daily_note(&date, &config)? {
        Some(n) => n,
        None => return Err(String::from("File not found")),
    };

    let task = note
        .tasks
        .iter()
        .find(|t| t.id == task_id)
        .ok_or("Task not found")?;

    let line = task.line.ok_or("Task line not found")?;

    let new_content = if updates.tags.is_some()
        || updates.deadline.is_some()
        || updates.priority.is_some()
        || updates.project.is_some()
    {
        markdown::edit_task_full_in_markdown(&note.content, line, &updates, Some(&date))
    } else {
        markdown::edit_task_in_markdown(
            &note.content,
            line,
            &updates.title.unwrap_or_else(|| task.title.clone()),
            updates.description.as_deref(),
        )
    };

    filesystem::write_daily_note(&date, &new_content, &config)?;
    Ok(())
}

#[tauri::command]
pub fn delete_task(
    task_id: String,
    date: String,
    state: State<AppState>,
) -> Result<(), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let note = match filesystem::read_daily_note(&date, &config)? {
        Some(n) => n,
        None => return Err(String::from("File not found")),
    };

    let task = note
        .tasks
        .iter()
        .find(|t| t.id == task_id)
        .ok_or("Task not found")?;

    let line = task.line.ok_or("Task line not found")?;
    let new_content = markdown::remove_task_from_markdown(&note.content, line);
    filesystem::write_daily_note(&date, &new_content, &config)?;
    Ok(())
}

// Rollover
#[tauri::command]
pub fn preview_rollover(
    to_date: String,
    state: State<AppState>,
) -> Result<Option<RolloverPreview>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    rollover::preview_rollover(&to_date, &config)
}

#[tauri::command]
pub fn apply_rollover(
    to_date: String,
    state: State<AppState>,
) -> Result<RolloverResult, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    rollover::apply_rollover(&to_date, &config)
}

// Config
#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<Config, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(config: Config, state: State<AppState>) -> Result<(), String> {
    config::save_config(&config)?;
    let mut current = state.config.lock().map_err(|e| e.to_string())?;
    *current = config;
    Ok(())
}

#[tauri::command]
pub fn validate_path(path: String) -> Result<PathValidationResult, String> {
    let p = std::path::Path::new(&path);

    if let Ok(metadata) = std::fs::metadata(p) {
        if metadata.is_dir() {
            Ok(PathValidationResult {
                valid: true,
                created: Some(false),
                error: None,
            })
        } else {
            Ok(PathValidationResult {
                valid: false,
                created: None,
                error: Some(String::from("Path is not a directory")),
            })
        }
    } else {
        // Try to create
        match std::fs::create_dir_all(p) {
            Ok(_) => Ok(PathValidationResult {
                valid: true,
                created: Some(true),
                error: None,
            }),
            Err(e) => Ok(PathValidationResult {
                valid: false,
                created: None,
                error: Some(e.to_string()),
            }),
        }
    }
}

#[tauri::command]
pub async fn choose_folder(app: AppHandle) -> Result<Option<String>, String> {
    let result = app.dialog().file().blocking_pick_folder();
    Ok(result.map(|p| p.to_string()))
}

#[tauri::command]
pub fn check_first_run(state: State<AppState>) -> Result<bool, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;

    // Only check if workspace is configured
    let workspace = std::path::Path::new(&config.workspace_root);
    if !workspace.exists() {
        return Ok(true);
    }

    Ok(false)
}

// Projects
#[tauri::command]
pub fn get_all_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    projects::get_all_projects(&config.workspace_root)
}

#[tauri::command]
pub fn create_project(
    project: ProjectInput,
    state: State<AppState>,
) -> Result<Project, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    projects::create_project(&config.workspace_root, &project)
}

#[tauri::command]
pub fn update_project(
    id: String,
    updates: ProjectUpdateInput,
    state: State<AppState>,
) -> Result<Project, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    projects::update_project(&config.workspace_root, &id, &updates)
}

#[tauri::command]
pub fn delete_project(id: String, state: State<AppState>) -> Result<(), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    projects::delete_project(&config.workspace_root, &id)
}

// Git
#[tauri::command]
pub fn get_git_status(state: State<AppState>) -> Result<GitStatus, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    git_service::get_git_status(&config.workspace_root)
}

#[tauri::command]
pub fn sync_git(message: String, state: State<AppState>) -> Result<GitSyncResult, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    git_service::sync_git(&config.workspace_root, &message)
}

#[tauri::command]
pub fn init_git_repo(state: State<AppState>) -> Result<(), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    git_service::init_git_repo(&config.workspace_root)
}

#[tauri::command]
pub fn set_git_remote(repo_url: String, state: State<AppState>) -> Result<(), String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    git_service::set_git_remote(&config.workspace_root, &repo_url)
}
