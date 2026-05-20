use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

pub struct ServerProcess(pub Mutex<Option<Child>>);

pub fn start_server(app_handle: &tauri::AppHandle) -> Result<Child, String> {
    // Get resource path
    let resource_path = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let server_path = resource_path.join("dist-server").join("index.js");

    if !server_path.exists() {
        return Err(format!("Server not found at: {:?}", server_path));
    }

    // On macOS .app bundles don't inherit the user's PATH, so we try common node locations
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
        match Command::new(node_path)
            .arg(&server_path)
            .current_dir(&resource_path)
            .spawn()
        {
            Ok(child) => {
                println!("Server started with PID: {}", child.id());
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
    let server = start_server(&handle)?;
    app.manage(ServerProcess(Mutex::new(Some(server))));
    Ok(())
}
