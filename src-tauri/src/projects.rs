use std::fs;
use std::path::{Path, PathBuf};

use crate::models::{Project, ProjectInput, ProjectUpdateInput};

fn get_projects_dir(workspace_root: &str) -> Result<PathBuf, String> {
    let dir = Path::new(workspace_root).join("Projects");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn parse_project_file(content: &str, file_path: &str) -> Project {
    let lines: Vec<&str> = content.split('\n').collect();

    let mut project = Project {
        id: String::new(),
        name: String::new(),
        description: None,
        status: String::from("active"),
        created_at: String::new(),
        updated_at: String::new(),
        tags: None,
        deadline: None,
        file_path: Some(file_path.to_string()),
    };

    if let Some(first) = lines.first() {
        if let Some(title) = first.strip_prefix("# ") {
            project.name = title.trim().to_string();
        }
    }

    let mut in_metadata = false;
    let mut description_lines = Vec::new();

    for line in lines.iter().skip(1) {
        let trimmed = line.trim();
        if trimmed == "---" {
            in_metadata = !in_metadata;
            continue;
        }

        if in_metadata {
            if let Some((key, value)) = trimmed.split_once(':') {
                let value = value.trim();
                match key.trim() {
                    "status" => project.status = value.to_string(),
                    "created" => project.created_at = value.to_string(),
                    "updated" => project.updated_at = value.to_string(),
                    "deadline" => project.deadline = Some(value.to_string()),
                    "tags" => {
                        project.tags = Some(value.split(',').map(|t| t.trim().to_string()).collect());
                    }
                    _ => {}
                }
            }
        } else if !trimmed.is_empty() && !trimmed.starts_with('#') {
            description_lines.push(trimmed.to_string());
        }
    }

    project.description = if description_lines.is_empty() {
        None
    } else {
        Some(description_lines.join("\n"))
    };

    // ID from filename
    let filename = Path::new(file_path).file_stem().and_then(|s| s.to_str()).unwrap_or("");
    project.id = filename.to_string();

    project
}

fn generate_project_file(project: &Project) -> String {
    let mut lines = vec![
        format!("# {}", project.name),
        String::new(),
        String::from("---"),
        format!("status: {}", project.status),
        format!("created: {}", project.created_at),
        format!("updated: {}", project.updated_at),
    ];

    if let Some(deadline) = &project.deadline {
        lines.push(format!("deadline: {}", deadline));
    }

    if let Some(tags) = &project.tags {
        if !tags.is_empty() {
            lines.push(format!("tags: {}", tags.join(", ")));
        }
    }

    lines.push(String::from("---"));
    lines.push(String::new());

    if let Some(description) = &project.description {
        lines.push(description.clone());
    }

    lines.join("\n")
}

pub fn get_all_projects(workspace_root: &str) -> Result<Vec<Project>, String> {
    let projects_dir = get_projects_dir(workspace_root)?;
    let mut projects = Vec::new();

    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(content) = fs::read_to_string(&path) {
                    let file_path = path.to_string_lossy().to_string();
                    let project = parse_project_file(&content, &file_path);
                    projects.push(project);
                }
            }
        }
    }

    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(projects)
}

pub fn get_project_by_id(workspace_root: &str, id: &str) -> Result<Option<Project>, String> {
    let projects_dir = get_projects_dir(workspace_root)?;
    let file_path = projects_dir.join(format!("{}.md", id));

    match fs::read_to_string(&file_path) {
        Ok(content) => {
            let path_str = file_path.to_string_lossy().to_string();
            Ok(Some(parse_project_file(&content, &path_str)))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn create_project(workspace_root: &str, data: &ProjectInput) -> Result<Project, String> {
    let projects_dir = get_projects_dir(workspace_root)?;
    let id = data.name.to_lowercase().replace(' ', "-");
    let now = chrono::Utc::now().to_rfc3339();

    let project = Project {
        id: id.clone(),
        name: data.name.clone(),
        description: data.description.clone(),
        status: if data.status.is_empty() {
            String::from("active")
        } else {
            data.status.clone()
        },
        created_at: now.clone(),
        updated_at: now,
        tags: data.tags.clone(),
        deadline: data.deadline.clone(),
        file_path: None,
    };

    let file_path = projects_dir.join(format!("{}.md", id));
    let content = generate_project_file(&project);
    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    let mut project = project;
    project.file_path = Some(file_path.to_string_lossy().to_string());
    Ok(project)
}

pub fn update_project(
    workspace_root: &str,
    id: &str,
    updates: &ProjectUpdateInput,
) -> Result<Project, String> {
    let project = get_project_by_id(workspace_root, id)?;
    let mut project = match project {
        Some(p) => p,
        None => return Err(String::from("Project not found")),
    };

    if let Some(name) = &updates.name {
        project.name = name.clone();
    }
    if let Some(description) = &updates.description {
        project.description = Some(description.clone());
    }
    if let Some(status) = &updates.status {
        project.status = status.clone();
    }
    if let Some(tags) = &updates.tags {
        project.tags = Some(tags.clone());
    }
    if let Some(deadline) = &updates.deadline {
        project.deadline = Some(deadline.clone());
    }
    if updates.description.is_none() && updates.name.is_none() && updates.status.is_none() && updates.tags.is_none() && updates.deadline.is_none() {
        // No updates provided
    }

    project.updated_at = chrono::Utc::now().to_rfc3339();

    let content = generate_project_file(&project);
    if let Some(file_path) = &project.file_path {
        fs::write(file_path, content).map_err(|e| e.to_string())?;
    }

    Ok(project)
}

pub fn delete_project(workspace_root: &str, id: &str) -> Result<(), String> {
    let project = get_project_by_id(workspace_root, id)?;
    if let Some(project) = project {
        if let Some(file_path) = project.file_path {
            fs::remove_file(file_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
