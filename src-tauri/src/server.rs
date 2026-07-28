use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

pub struct ServerProcess(pub Mutex<Option<Child>>);

impl ServerProcess {
    pub fn shutdown(&self) {
        if let Some(mut child) = self.0.lock().ok().and_then(|mut guard| guard.take()) {
            if let Err(error) = child.kill() {
                eprintln!("Failed to stop local server process {}: {}", child.id(), error);
            }
            let _ = child.wait();
        }
    }
}

/// Locate the bundled Node runtime in the app resources directory.
/// On Windows the binary has a `.exe` extension; on other platforms it has none.
fn bundled_node_path(resource_dir: &Path) -> Option<PathBuf> {
    let names = if cfg!(target_os = "windows") {
        ["node", "node.exe"].as_slice()
    } else {
        ["node"].as_slice()
    };
    let directories = [
        resource_dir.join("dist-server"),
        resource_dir.join("_up_").join("dist-server"),
        resource_dir.to_path_buf(),
    ];
    for directory in directories {
        for name in names {
            let path = directory.join(name);
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

/// Locate the official lark-cli connector bundled with the desktop app.
fn bundled_lark_cli_path(resource_dir: &Path) -> Option<PathBuf> {
    let names: &[&str] = if cfg!(target_os = "windows") {
        &["lark-cli.exe", "lark-cli"]
    } else {
        &["lark-cli"]
    };
    let directories = [
        resource_dir.join("dist-server"),
        resource_dir.join("_up_").join("dist-server"),
        resource_dir.to_path_buf(),
    ];
    directories
        .into_iter()
        .flat_map(|directory| names.iter().map(move |name| directory.join(name)))
        .find(|path| path.exists())
}

/// Locate the bundled server script (used as a development fallback).
fn bundled_script_path(resource_dir: &Path) -> Option<PathBuf> {
    let direct = resource_dir.join("dist-server").join("index.cjs");
    let up_fallback = resource_dir.join("_up_").join("dist-server").join("index.cjs");

    if direct.exists() {
        Some(direct)
    } else if up_fallback.exists() {
        Some(up_fallback)
    } else {
        None
    }
}

/// Ensure a file is executable on Unix-like systems.
#[cfg(unix)]
fn ensure_executable(path: &Path) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let mut permissions = metadata.permissions();
    let mode = permissions.mode();
    if mode & 0o111 == 0 {
        permissions.set_mode(mode | 0o755);
        fs::set_permissions(path, permissions).map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    Ok(())
}

#[cfg(windows)]
fn ensure_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

pub fn start_server(app_handle: &tauri::AppHandle) -> Result<Child, String> {
    let resource_path = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let script_path = bundled_script_path(&resource_path).ok_or_else(|| {
        format!(
            "Server script not found in resource dir: {:?}",
            resource_path
        )
    })?;

    let bundled_lark_cli = bundled_lark_cli_path(&resource_path);
    if let Some(path) = bundled_lark_cli.as_deref() {
        ensure_executable(path)?;
    }

    // 1. Prefer the Node runtime bundled with the app (production builds).
    if let Some(node_path) = bundled_node_path(&resource_path) {
        ensure_executable(&node_path)?;
        let mut command = Command::new(&node_path);
        command.arg(&script_path).current_dir(&resource_path);
        if let Some(path) = bundled_lark_cli.as_deref() {
            command.env("LARK_CLI_PATH", path);
        }
        match command.spawn() {
            Ok(child) => {
                println!("Server started with bundled Node runtime, PID: {}", child.id());
                return Ok(child);
            }
            Err(e) => {
                eprintln!(
                    "Failed to start server with bundled Node runtime: {}. Falling back to system Node.",
                    e
                );
            }
        }
    }

    // 2. Development fallback: use the system Node binary to run the bundled script.
    let node_candidates: Vec<&str> = if cfg!(target_os = "macos") {
        vec![
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
            "node",
        ]
    } else {
        vec!["node"]
    };

    let mut last_err = String::new();
    for node_path in &node_candidates {
        let mut command = Command::new(node_path);
        command.arg(&script_path).current_dir(&resource_path);
        if let Some(path) = bundled_lark_cli.as_deref() {
            command.env("LARK_CLI_PATH", path);
        }
        match command.spawn() {
            Ok(child) => {
                println!("Server started with system Node fallback, PID: {}", child.id());
                return Ok(child);
            }
            Err(e) => {
                last_err = format!("Failed to start server with '{}': {}", node_path, e);
            }
        }
    }

    Err(last_err)
}

pub fn setup_server(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    match start_server(&handle) {
        Ok(server) => {
            app.manage(ServerProcess(Mutex::new(Some(server))));
            Ok(())
        }
        Err(e) => {
            let message = format!(
                "DailyFlow could not start its local server.\n\n{}\n\nThe app may not work correctly until this is resolved.",
                e
            );
            eprintln!("{}", message);
            // Show a user-visible error dialog when the server fails to start.
            let _ = handle.dialog().message(message).title("Server Error").show(|_| {});
            Err(e.into())
        }
    }
}
