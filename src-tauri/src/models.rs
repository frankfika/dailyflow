use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub tags: Option<Vec<String>>,
    pub project: Option<String>,
    pub deadline: Option<String>,
    pub priority: Option<String>,
    #[serde(rename = "source_date")]
    pub source_date: Option<String>,
    pub line: Option<usize>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DailyNote {
    pub date: String,
    pub content: String,
    pub tasks: Vec<Task>,
    pub last_modified: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub workspace_root: String,
    pub daily_path_template: String,
    pub rollover_trigger: String,
    pub rollover_skip_tags: Vec<String>,
    pub last_rollover_date: Option<String>,
    pub github_repo: Option<String>,
    pub github_token: Option<String>,
    pub active_context: Option<String>,
    pub ai_provider: Option<String>,
    pub ai_api_key: Option<String>,
    pub ai_model: Option<String>,
    pub ai_base_url: Option<String>,
    pub ai_format: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Option<Vec<String>>,
    pub deadline: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RolloverPreview {
    pub from_date: String,
    pub to_date: String,
    pub tasks_to_migrate: Vec<Task>,
    pub target_content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RolloverResult {
    pub success: bool,
    pub migrated_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub has_changes: bool,
    pub branch: String,
    pub ahead: i32,
    pub behind: i32,
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncResult {
    pub success: bool,
    pub commit_hash: Option<String>,
    pub message: Option<String>,
    pub error: Option<String>,
    pub stage: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PathValidationResult {
    pub valid: bool,
    pub created: Option<bool>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub tags: Option<Vec<String>>,
    pub project: Option<String>,
    pub deadline: Option<String>,
    pub priority: Option<String>,
    #[serde(rename = "source_date")]
    pub source_date: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdateInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub deadline: Option<String>,
    pub priority: Option<String>,
    pub project: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub tags: Option<Vec<String>>,
    pub deadline: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUpdateInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub tags: Option<Vec<String>>,
    pub deadline: Option<String>,
}
