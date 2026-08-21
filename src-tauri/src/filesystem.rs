use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

    workspace_path(&config.workspace_root).join(file_path)
}

fn workspace_path(workspace_root: &str) -> PathBuf {
    if workspace_root.starts_with('~') {
        if let Some(home) = dirs::home_dir() {
            home.join(workspace_root.trim_start_matches('~'))
        } else {
            PathBuf::from(workspace_root)
        }
    } else {
        PathBuf::from(workspace_root)
    }
}

fn valid_date(date: &str) -> bool {
    let bytes = date.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes.iter().enumerate().all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit())
}

fn nearest_existing(path: &Path) -> Option<&Path> {
    let mut cursor = Some(path);
    while let Some(candidate) = cursor {
        if candidate.exists() {
            return Some(candidate);
        }
        cursor = candidate.parent();
    }
    None
}

pub fn validate_path(file_path: &Path, workspace_root: &str) -> bool {
    let resolved_root = workspace_path(workspace_root);

    if !resolved_root.exists() {
        return file_path.starts_with(&resolved_root)
            && !file_path.components().any(|part| matches!(part, std::path::Component::ParentDir));
    }

    let Ok(root) = resolved_root.canonicalize() else { return false };
    let candidate = if file_path.exists() {
        file_path
    } else {
        file_path.parent().unwrap_or(file_path)
    };
    let Some(existing) = nearest_existing(candidate) else { return false };
    existing.canonicalize().is_ok_and(|path| path.starts_with(root))
}

pub fn read_daily_note(date: &str, config: &Config) -> Result<Option<DailyNote>, String> {
    if !valid_date(date) {
        return Err(String::from("Invalid date"));
    }
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
    if !valid_date(date) {
        return Err(String::from("Invalid date"));
    }
    let file_path = get_daily_note_path(date, config);

    if !validate_path(&file_path, &config.workspace_root) {
        return Err(String::from("Invalid file path"));
    }

    // Ensure directory exists
    let dir = file_path.parent().ok_or("Invalid file path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    if !validate_path(&file_path, &config.workspace_root) {
        return Err(String::from("Invalid file path"));
    }

    // Atomic write
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_path = dir.join(format!(".dailyflow-{}-{}.tmp", std::process::id(), nonce));
    fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    replace_file(&temp_path, &file_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        e.to_string()
    })?;

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

    let full_path = workspace_path(&config.workspace_root).join(base_dir);

    let mut results = Vec::new();
    walk_dir(&full_path, &mut results).map_err(|e| e.to_string())?;
    results.sort_by(|a, b| b.cmp(a)); // Reverse chronological
    Ok(results)
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(source, target)
}

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let moved = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_date_path_traversal() {
        assert!(!valid_date("../../tmp/x"));
        assert!(!valid_date("2026-01-0/"));
        assert!(valid_date("2026-08-22"));
    }
}
