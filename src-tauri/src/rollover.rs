use crate::filesystem::{list_daily_notes, read_daily_note, write_daily_note};
use crate::markdown::{append_task_to_markdown, generate_markdown, update_task_in_markdown};
use crate::models::{Config, RolloverPreview, RolloverResult, Task};

pub fn preview_rollover(to_date: &str, config: &Config) -> Result<Option<RolloverPreview>, String> {
    let all_dates = list_daily_notes(config)?;
    let previous_dates: Vec<String> = all_dates
        .into_iter()
        .filter(|d| d.as_str() < to_date)
        .collect();

    if previous_dates.is_empty() {
        return Ok(None);
    }

    let mut all_tasks_to_migrate: Vec<Task> = Vec::new();
    let earliest_from_date = previous_dates.first().cloned().unwrap_or_default();

    for from_date in &previous_dates {
        let from_note = match read_daily_note(from_date, config)? {
            Some(n) => n,
            None => continue,
        };

        let tasks_to_migrate: Vec<&Task> = from_note.tasks.iter().filter(|task| {
            if task.status == "done" {
                return false;
            }
            if let Some(tags) = &task.tags {
                if tags.iter().any(|t| config.rollover_skip_tags.contains(t)) {
                    return false;
                }
            }
            true
        }).collect();

        for task in tasks_to_migrate {
            let needs_delayed = task.deadline.as_ref().map_or(true, |d| d.as_str() < to_date);
            let mut tags = task.tags.clone().unwrap_or_default();
            if needs_delayed {
                tags.retain(|t| t != "delayed");
                tags.push(String::from("delayed"));
            }

            all_tasks_to_migrate.push(Task {
                id: format!("t_{}_{}", chrono::Utc::now().timestamp_millis(), rand_str()),
                title: task.title.clone(),
                description: task.description.clone(),
                status: task.status.clone(),
                tags: Some(tags),
                project: task.project.clone(),
                deadline: task.deadline.clone(),
                priority: task.priority.clone(),
                source_date: Some(from_date.clone()),
                line: None,
            });
        }
    }

    if all_tasks_to_migrate.is_empty() {
        return Ok(None);
    }

    let target_content = generate_markdown(&all_tasks_to_migrate, Some(to_date));

    Ok(Some(RolloverPreview {
        from_date: earliest_from_date,
        to_date: to_date.to_string(),
        tasks_to_migrate: all_tasks_to_migrate,
        target_content,
    }))
}

pub fn apply_rollover(to_date: &str, config: &Config) -> Result<RolloverResult, String> {
    let all_dates = list_daily_notes(config)?;
    let previous_dates: Vec<String> = all_dates
        .into_iter()
        .filter(|d| d.as_str() < to_date)
        .collect();

    if previous_dates.is_empty() {
        return Ok(RolloverResult {
            success: true,
            migrated_count: 0,
        });
    }

    let to_note = read_daily_note(to_date, config)?;
    let mut new_content = to_note.map(|n| n.content).unwrap_or_default();
    let mut total_migrated = 0;

    for from_date in &previous_dates {
        let from_note = match read_daily_note(from_date, config)? {
            Some(n) => n,
            None => continue,
        };

        let tasks_to_migrate: Vec<&Task> = from_note.tasks.iter().filter(|task| {
            if task.status == "done" {
                return false;
            }
            if let Some(tags) = &task.tags {
                if tags.iter().any(|t| config.rollover_skip_tags.contains(t)) {
                    return false;
                }
            }
            true
        }).collect();

        if tasks_to_migrate.is_empty() {
            continue;
        }

        let migrated_tasks: Vec<Task> = tasks_to_migrate.iter().map(|task| {
            let needs_delayed = task.deadline.as_ref().map_or(true, |d| d.as_str() < to_date);
            let mut tags = task.tags.clone().unwrap_or_default();
            if needs_delayed {
                tags.retain(|t| t != "delayed");
                tags.push(String::from("delayed"));
            }

            Task {
                id: format!("t_{}_{}", chrono::Utc::now().timestamp_millis(), rand_str()),
                title: task.title.clone(),
                description: task.description.clone(),
                status: task.status.clone(),
                tags: Some(tags),
                project: task.project.clone(),
                deadline: task.deadline.clone(),
                priority: task.priority.clone(),
                source_date: Some(from_date.clone()),
                line: None,
            }
        }).collect();

        if new_content.trim().is_empty() {
            new_content = generate_markdown(&migrated_tasks, Some(to_date));
        } else {
            for task in &migrated_tasks {
                new_content = append_task_to_markdown(&new_content, task, Some(to_date));
            }
        }

        // Mark source tasks as done
        let mut from_content = from_note.content;
        let mut sorted_tasks: Vec<&Task> = tasks_to_migrate.clone();
        sorted_tasks.sort_by(|a, b| b.line.unwrap_or(0).cmp(&a.line.unwrap_or(0)));

        for task in sorted_tasks {
            if let Some(line) = task.line {
                from_content = update_task_in_markdown(&from_content, line, "done");
            }
        }
        write_daily_note(from_date, &from_content, config)?;

        total_migrated += tasks_to_migrate.len();
    }

    if total_migrated > 0 {
        write_daily_note(to_date, &new_content, config)?;
    }

    Ok(RolloverResult {
        success: true,
        migrated_count: total_migrated,
    })
}

fn rand_str() -> String {
    let mut s = String::new();
    let chars = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut n = now;
    for _ in 0..6 {
        s.push(chars[(n % 36) as usize] as char);
        n /= 36;
    }
    s
}
