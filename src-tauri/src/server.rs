use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

pub struct ServerProcess {
    child: Mutex<Option<Child>>,
    port: AtomicU16,
    shutting_down: AtomicBool,
}

impl ServerProcess {
    pub fn new(child: Child, port: u16) -> Self {
        Self {
            child: Mutex::new(Some(child)),
            port: AtomicU16::new(port),
            shutting_down: AtomicBool::new(false),
        }
    }

    pub fn port(&self) -> u16 {
        self.port.load(Ordering::SeqCst)
    }

    fn set_port(&self, port: u16) {
        self.port.store(port, Ordering::SeqCst);
    }

    pub fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        if let Some(mut child) = self.child.lock().ok().and_then(|mut guard| guard.take()) {
            if let Err(error) = child.kill() {
                eprintln!("Failed to stop local server process {}: {}", child.id(), error);
            }
            let _ = child.wait();
        }
    }

    /// Briefly lock the state and report whether the child has exited.
    /// Called from the watchdog; never holds the lock long enough to block
    /// `shutdown`.
    fn poll_exited(&self) -> Option<bool> {
        let mut guard = self.child.lock().ok()?;
        match guard.as_mut() {
            Some(child) => Some(child.try_wait().ok().flatten().is_some()),
            None => None, // shutdown took the child
        }
    }

    fn replace(&self, child: Child) {
        if let Ok(mut guard) = self.child.lock() {
            *guard = Some(child);
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

/// Grab a free TCP port from the OS so two DailyFlow launches (or a watchdog
/// respawn racing a lingering process) can never collide on a fixed port.
fn pick_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(47832)
}

/// Spawn the sidecar on a fresh free port. Returns the child and the port so
/// the caller can publish it to the webview.
pub fn start_server(app_handle: &tauri::AppHandle) -> Result<(Child, u16), String> {
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

    let port = pick_free_port();

    // 1. Prefer the Node runtime bundled with the app (production builds).
    if let Some(node_path) = bundled_node_path(&resource_path) {
        ensure_executable(&node_path)?;
        let mut command = Command::new(&node_path);
        command.arg(&script_path).current_dir(&resource_path);
        command.env("NODE_ENV", "production");
        command.env("PORT", port.to_string());
        if let Some(path) = bundled_lark_cli.as_deref() {
            command.env("LARK_CLI_PATH", path);
        }
        match command.spawn() {
            Ok(child) => {
                println!(
                    "Server started with bundled Node runtime, PID: {} port: {}",
                    child.id(),
                    port
                );
                return Ok((child, port));
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
        command.env("NODE_ENV", "production");
        command.env("PORT", port.to_string());
        if let Some(path) = bundled_lark_cli.as_deref() {
            command.env("LARK_CLI_PATH", path);
        }
        match command.spawn() {
            Ok(child) => {
                println!("Server started with system Node fallback, PID: {} port: {}", child.id(), port);
                return Ok((child, port));
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
        Ok((server, port)) => {
            app.manage(ServerProcess::new(server, port));
            // Watchdog: the sidecar can die mid-session (crash, OOM). Poll
            // without holding the lock; a non-zero exit means a crash, so
            // respawn after a short backoff on a FRESH port (pick_free_port
            // runs again inside start_server). A clean exit (code 0) means
            // the server retired itself deliberately — do not respawn.
            let watchdog_handle = handle;
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(500));
                let Some(state) = watchdog_handle.try_state::<ServerProcess>() else {
                    return;
                };
                match state.poll_exited() {
                    Some(false) | None => continue,
                    Some(true) => {}
                }
                if state.shutting_down.load(Ordering::SeqCst) {
                    return;
                }
                eprintln!("[watchdog] local server exited unexpectedly; restarting…");
                std::thread::sleep(Duration::from_secs(2));
                match start_server(&watchdog_handle) {
                    Ok((child, port)) => {
                        eprintln!("[watchdog] local server restarted, PID: {} port: {}", child.id(), port);
                        state.set_port(port);
                        state.replace(child);
                    }
                    Err(error) => {
                        eprintln!("[watchdog] restart failed: {}", error);
                    }
                }
            });
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
