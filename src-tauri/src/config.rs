use std::fs;
use std::path::PathBuf;

use crate::models::Config;

pub fn get_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".dailyflow")
        .join("config.json")
}

pub fn ensure_config_dir() -> Result<(), String> {
    let path = get_config_path();
    let dir = path.parent().ok_or("Invalid config path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_config() -> Result<Config, String> {
    let path = get_config_path();

    let mut config: Config = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    } else {
        Config::default()
    };

    // Fill defaults
    if config.workspace_root.is_empty() {
        if let Some(home) = dirs::home_dir() {
            config.workspace_root = home.join("Desktop").join("DailyFlow").to_string_lossy().to_string();
        } else {
            config.workspace_root = String::from("./DailyFlow");
        }
    }
    if config.daily_path_template.is_empty() {
        config.daily_path_template = String::from("Daily/{year}/{month}/{date}.md");
    }
    if config.rollover_trigger.is_empty() {
        config.rollover_trigger = String::from("manual");
    }
    if config.rollover_skip_tags.is_empty() {
        config.rollover_skip_tags = vec![String::from("no-rollover")];
    }

    Ok(config)
}

pub fn save_config(config: &Config) -> Result<(), String> {
    ensure_config_dir()?;
    let path = get_config_path();
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}
