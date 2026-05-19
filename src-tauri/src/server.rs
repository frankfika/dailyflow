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

    let child = Command::new("node")
        .arg(&server_path)
        .current_dir(resource_path)
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    println!("Server started with PID: {}", child.id());

    Ok(child)
}

pub fn setup_server(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let server = start_server(&handle)?;
    app.manage(ServerProcess(Mutex::new(Some(server))));
    Ok(())
}
