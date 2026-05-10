use std::fs;
use std::path::{Path, PathBuf};

use crate::markdown::parse_markdown;
use crate::models::{Config, DailyNote};

pub fn get_daily_note_path(date: &str, config: &Config) -> PathBuf {
    let parts: Vec<&str> = date.split('-').collect();
    let year = parts.get(0).unwrap_or(&"");
    let month = parts.get(1).unwrap_or(&"");

    let file_path = config
        .daily_path_template
        .replace("{year}", year)
        .replace("{month}", month)
        .replace("{date}", date);

    Path::new(&config.workspace_root).join(file_path)
}

pub fn validate_path(file_path: &Path, workspace_root: &str) -> bool {
    // Expand home directory if needed
    let resolved_root = if workspace_root.starts_with('~') {
        if let Some(home) = dirs::home_dir() {
            home.join(workspace_root.trim_start_matches('~'))
        } else {
            PathBuf::from(workspace_root)
        }
    } else {
        PathBuf::from(workspace_root)
    };

    // If workspace doesn't exist yet, allow the path (it will be created later)
    if !resolved_root.exists() {
        return true;
    }

    let resolved_path = file_path.canonicalize().unwrap_or_else(|_| file_path.to_path_buf());
    let resolved_root_canonical = resolved_root.canonicalize().unwrap_or(resolved_root);
    resolved_path.starts_with(&resolved_root_canonical)
}

pub fn read_daily_note(date: &str, config: &Config) -> Result<Option<DailyNote>, String> {
    let file_path = get_daily_note_path(date, config);

    if !validate_path(&file_path, &config.workspace_root) {
        return Err(String::from("Invalid file path"));
    }

    // If the file doesn't exist yet, return None gracefully
    if !file_path.exists() {
        return Ok(None);
    }

    match fs::read_to_string(&file_path) {
        Ok(content) => {
            let tasks = parse_markdown(&content);
            let last_modified = fs::metadata(&file_path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| {
                    chrono::DateTime::from_timestamp(
                        t.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs() as i64,
                        0,
                    )
                })
                .map(|dt| dt.to_rfc3339());

            Ok(Some(DailyNote {
                date: date.to_string(),
                content,
                tasks,
                last_modified,
            }))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn write_daily_note(date: &str, content: &str, config: &Config) -> Result<(), String> {
    let file_path = get_daily_note_path(date, config);

    if !validate_path(&file_path, &config.workspace_root) {
        return Err(String::from("Invalid file path"));
    }

    // Ensure directory exists
    let dir = file_path.parent().ok_or("Invalid file path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    // Atomic write
    let temp_path = file_path.with_extension("tmp");
    fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, &file_path).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn list_daily_notes(config: &Config) -> Result<Vec<String>, String> {
    let parts: Vec<&str> = config.daily_path_template.split('/').collect();
    let base_dir_parts: Vec<&str> = parts
        .iter()
        .take(parts.len().saturating_sub(1))
        .copied()
        .collect();
    let base_dir_no_templates: Vec<&str> = base_dir_parts
        .iter()
        .take_while(|p| !p.contains('{'))
        .copied()
        .collect();
    let base_dir = if base_dir_no_templates.is_empty() {
        "."
    } else {
        &base_dir_no_templates.join("/")
    };

    let full_path = Path::new(&config.workspace_root).join(base_dir);

    let mut results = Vec::new();
    walk_dir(&full_path, &mut results).map_err(|e| e.to_string())?;
    results.sort_by(|a, b| b.cmp(a)); // Reverse chronological
    Ok(results)
}

fn walk_dir(dir: &Path, results: &mut Vec<String>) -> std::io::Result<()> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_dir(&path, results)?;
        } else if path.is_file() {
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                if path.extension().and_then(|s| s.to_str()) == Some("md")
                    && name.len() == 10
                    && name.chars().nth(4) == Some('-')
                    && name.chars().nth(7) == Some('-')
                {
                    results.push(name.to_string());
                }
            }
        }
    }
    Ok(())
}
