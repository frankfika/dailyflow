use std::process::Command;

use crate::models::{GitStatus, GitSyncResult};

pub fn get_git_status(workspace_root: &str) -> Result<GitStatus, String> {
    // Check if git repo
    Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| format!("Not a git repository or git command failed: {}", e))?;

    // Get current branch
    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;
    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    // Get status
    let status_output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;
    let status_str = String::from_utf8_lossy(&status_output.stdout);

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for line in status_str.lines() {
        if line.len() < 3 {
            continue;
        }
        let status = &line[..2];
        let file = &line[3..];

        if status.as_bytes()[0] != b' ' && status.as_bytes()[0] != b'?' {
            staged.push(file.to_string());
        }
        if status.as_bytes()[1] != b' ' && status.as_bytes()[1] != b'?' {
            unstaged.push(file.to_string());
        }
        if status == "??" {
            untracked.push(file.to_string());
        }
    }

    // Get ahead/behind
    let mut ahead = 0;
    let mut behind = 0;
    if let Ok(output) = Command::new("git")
        .args(["rev-list", "--left-right", "--count", &format!("origin/{}...HEAD", branch)])
        .current_dir(workspace_root)
        .output()
    {
        let out = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = out.trim().split('\t').collect();
        if parts.len() == 2 {
            behind = parts[0].parse().unwrap_or(0);
            ahead = parts[1].parse().unwrap_or(0);
        }
    }

    let has_changes = !staged.is_empty() || !unstaged.is_empty() || !untracked.is_empty();

    Ok(GitStatus {
        has_changes,
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
    })
}

pub fn sync_git(workspace_root: &str, message: &str) -> Result<GitSyncResult, String> {
    // Stage all changes
    let _ = Command::new("git")
        .args(["add", "-A"])
        .current_dir(workspace_root)
        .output();

    // Check if there are changes
    let status_output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;
    let status_str = String::from_utf8_lossy(&status_output.stdout);
    if status_str.trim().is_empty() {
        return Ok(GitSyncResult {
            success: false,
            commit_hash: None,
            message: None,
            error: Some(String::from("No changes to commit")),
            stage: Some(String::from("commit")),
        });
    }

    // Commit
    let commit_output = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;

    if !commit_output.status.success() {
        return Ok(GitSyncResult {
            success: false,
            commit_hash: None,
            message: None,
            error: Some(String::from_utf8_lossy(&commit_output.stderr).to_string()),
            stage: Some(String::from("commit")),
        });
    }

    // Get commit hash
    let hash_output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;
    let commit_hash = String::from_utf8_lossy(&hash_output.stdout).trim().to_string();

    // Push
    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;
    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    let push_output = Command::new("git")
        .args(["push", "origin", &branch])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;

    if !push_output.status.success() {
        return Ok(GitSyncResult {
            success: false,
            commit_hash: Some(commit_hash),
            message: None,
            error: Some(String::from_utf8_lossy(&push_output.stderr).to_string()),
            stage: Some(String::from("push")),
        });
    }

    Ok(GitSyncResult {
        success: true,
        commit_hash: Some(commit_hash),
        message: Some(String::from("Changes committed and pushed successfully")),
        error: None,
        stage: None,
    })
}

pub fn init_git_repo(workspace_root: &str) -> Result<(), String> {
    // Check if already a git repo
    if Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(workspace_root)
        .output()
        .is_ok()
    {
        return Ok(());
    }

    Command::new("git")
        .args(["init"])
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn set_git_remote(workspace_root: &str, repo_url: &str) -> Result<(), String> {
    let result = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(workspace_root)
        .output();

    let args = if result.is_ok() {
        vec!["remote", "set-url", "origin", repo_url]
    } else {
        vec!["remote", "add", "origin", repo_url]
    };

    Command::new("git")
        .args(&args)
        .current_dir(workspace_root)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(())
}
