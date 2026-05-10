use crate::models::{Task, TaskUpdateInput};

fn hash_str(s: &str) -> String {
    let mut hash: i32 = 0;
    for c in s.chars() {
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(c as i32);
    }
    format!("{}", hash.unsigned_abs().to_string())
}

/// Find the end index of a task's description block.
/// Returns the index of the first line that does NOT belong to the description.
fn find_description_end(lines: &[&str], start_idx: usize) -> usize {
    let mut idx = start_idx;
    while idx < lines.len() {
        let line = lines[idx];

        // New task line -> stop
        if line.trim_start().starts_with("- [") || line.trim_start().starts_with("* [") {
            break;
        }

        let is_empty = line.trim().is_empty();
        let is_indented = line.starts_with("  ") || line.starts_with('\t');

        if !is_empty && !is_indented {
            break;
        }

        if is_indented {
            idx += 1;
            continue;
        }

        // Empty line: look ahead
        let mut next_idx = idx + 1;
        while next_idx < lines.len() && lines[next_idx].trim().is_empty() {
            next_idx += 1;
        }

        if next_idx >= lines.len() {
            break;
        }
        let next_line = lines[next_idx];
        if next_line.trim_start().starts_with("- [") || next_line.trim_start().starts_with("* [") {
            break;
        }
        if !next_line.starts_with("  ") && !next_line.starts_with('\t') {
            break;
        }

        idx += 1;
    }
    idx
}

/// Serialize a task to a markdown line (with optional description).
fn task_to_line(task: &Task, current_date: Option<&str>) -> String {
    let checkbox = if task.status == "done" { "x" } else { " " };
    let mut line = format!("- [{}] {}", checkbox, task.title);

    if let Some(tags) = &task.tags {
        let filtered: Vec<&String> = tags.iter().filter(|t| !t.is_empty() && t.as_str() != "tasks").collect();
        if !filtered.is_empty() {
            let tag_str: Vec<String> = filtered.iter().map(|t| format!("#{}", t.replace(' ', "-"))).collect();
            line.push(' ');
            line.push_str(&tag_str.join(" "));
        }
    }

    if let Some(project) = &task.project {
        line.push_str(&format!(" #project:{}", project.replace(' ', "_")));
    }
    if let Some(deadline) = &task.deadline {
        line.push_str(&format!(" #deadline:{}", deadline));
    }
    if let Some(priority) = &task.priority {
        line.push_str(&format!(" #priority:{}", priority));
    }

    let skip_source = current_date.map_or(false, |d| {
        task.source_date.as_deref() == Some(d)
    });
    if !skip_source {
        if let Some(source_date) = &task.source_date {
            line.push_str(&format!(" ↗ migrated:{}", source_date));
        }
    }

    line.push_str(&format!(" ^id-{}", task.id));

    if let Some(desc) = &task.description {
        if !desc.is_empty() {
            for desc_line in desc.split('\n') {
                line.push('\n');
                line.push_str("  ");
                line.push_str(desc_line);
            }
        }
    }

    line
}

/// Parse markdown content into a list of tasks.
pub fn parse_markdown(md: &str) -> Vec<Task> {
    let lines: Vec<&str> = md.split('\n').collect();
    let mut tasks: Vec<Task> = Vec::new();

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // Parse task line: - [ ] or - [x]
        let trimmed = line.trim_start();
        if (trimmed.starts_with("- [") || trimmed.starts_with("* [")) && trimmed.len() > 5 {
            let bracket_end = trimmed.find(']').unwrap_or(0);
            if bracket_end >= 3 {
                let checkbox_content = &trimmed[2..bracket_end];
                let is_done = checkbox_content.to_lowercase().contains('x');
                let rest = trimmed[bracket_end + 1..].trim_start();
                let task_line_index = i;

                let mut content = rest.to_string();

                // Extract explicit ID (^id-...)
                let explicit_id = if let Some(id_start) = content.find("^id-") {
                    let id_part = &content[id_start + 4..];
                    let id_end = id_part.find(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
                        .unwrap_or(id_part.len());
                    let id = id_part[..id_end].to_string();
                    content = content.replace(&format!("^id-{}", id), "").trim().to_string();
                    Some(id)
                } else {
                    None
                };

                // Extract priority
                let priority = if let Some(m) = extract_pattern(&content, "#priority:") {
                    let val = m.clone();
                    content = content.replace(&format!("#priority:{}", val), "").trim().to_string();
                    Some(val)
                } else {
                    None
                };

                // Extract deadline
                let deadline = if let Some(m) = extract_pattern(&content, "#deadline:") {
                    let val = m.clone();
                    content = content.replace(&format!("#deadline:{}", val), "").trim().to_string();
                    Some(val)
                } else {
                    None
                };

                // Extract project
                let project = if let Some(m) = extract_pattern(&content, "#project:") {
                    let val = m.replace('_', " ");
                    let raw = extract_pattern(&content, "#project:").unwrap();
                    content = content.replace(&format!("#project:{}", raw), "").trim().to_string();
                    Some(val)
                } else {
                    None
                };

                // Extract migrated source_date
                let source_date = if let Some(pos) = content.find("↗ migrated:") {
                    let after = &content[pos + "↗ migrated:".len()..];
                    let end = after.find(|c: char| c.is_whitespace()).unwrap_or(after.len());
                    let val = after[..end].to_string();
                    content = content.replace(&format!("↗ migrated:{}", val), "").trim().to_string();
                    Some(val)
                } else {
                    None
                };

                // Extract remaining tags (#word)
                // Simple tag extraction: find all #word patterns
                let tag_re_content = content.clone();
                let mut tag_positions: Vec<(usize, usize)> = Vec::new();
                let bytes = tag_re_content.as_bytes();
                let mut ci = 0;
                while ci < bytes.len() {
                    if bytes[ci] == b'#' {
                        let start = ci;
                        ci += 1;
                        while ci < bytes.len() && (bytes[ci].is_ascii_alphanumeric() || bytes[ci] == b'_' || bytes[ci] == b'-') {
                            ci += 1;
                        }
                        if ci > start + 1 {
                            tag_positions.push((start, ci));
                        }
                    } else {
                        ci += 1;
                    }
                }

                let mut clean_content = tag_re_content.clone();
                // Collect tags and remove from content (process in reverse to preserve indices)
                let mut tags_found: Vec<String> = Vec::new();
                for &(start, end) in tag_positions.iter() {
                    let tag = &tag_re_content[start + 1..end];
                    tags_found.push(tag.to_lowercase());
                }
                for &(start, end) in tag_positions.iter().rev() {
                    clean_content.replace_range(start..end, "");
                }
                // Clean up extra spaces
                let title: String = clean_content.split_whitespace().collect::<Vec<&str>>().join(" ");
                let extracted_tags = tags_found;

                // Parse description
                let desc_start = i + 1;
                let desc_end = find_description_end(&lines, desc_start);
                let desc_lines: Vec<&str> = lines[desc_start..desc_end]
                    .iter()
                    .map(|l| l.trim())
                    .collect();
                let description = if desc_lines.is_empty() {
                    None
                } else {
                    let joined = desc_lines.join("\n");
                    if joined.trim().is_empty() { None } else { Some(joined) }
                };

                let id = explicit_id.unwrap_or_else(|| {
                    format!("t{}_{}", task_line_index, hash_str(&title))
                });

                tasks.push(Task {
                    id,
                    title,
                    description,
                    status: if is_done { "done".to_string() } else { "todo".to_string() },
                    tags: if extracted_tags.is_empty() { None } else { Some(extracted_tags) },
                    project,
                    deadline,
                    priority,
                    source_date,
                    line: Some(task_line_index),
                });

                i = desc_end;
                continue;
            }
        }

        i += 1;
    }

    tasks
}

/// Extract the value after a prefix like "#deadline:" up to the next whitespace.
fn extract_pattern(content: &str, prefix: &str) -> Option<String> {
    if let Some(pos) = content.find(prefix) {
        let after = &content[pos + prefix.len()..];
        let end = after.find(|c: char| c.is_whitespace()).unwrap_or(after.len());
        if end > 0 {
            return Some(after[..end].to_string());
        }
    }
    None
}

/// Generate markdown from a list of tasks.
pub fn generate_markdown(tasks: &[Task], current_date: Option<&str>) -> String {
    let mut md = String::from("## Tasks\n\n");
    for task in tasks {
        md.push_str(&task_to_line(task, current_date));
        md.push('\n');
    }
    md
}

/// Update the checkbox status of a task at the given line.
pub fn update_task_in_markdown(md: &str, task_line: usize, new_status: &str) -> String {
    let mut lines: Vec<&str> = md.split('\n').collect();
    if task_line < lines.len() {
        let line = lines[task_line];
        let trimmed = line.trim_start();
        if (trimmed.starts_with("- [") || trimmed.starts_with("* [")) && trimmed.find(']').is_some() {
            let checkbox = if new_status == "done" { "x" } else { " " };
            // Replace [x] or [ ] with new checkbox
            let new_line = replace_checkbox(line, checkbox);
            lines[task_line] = Box::leak(new_line.into_boxed_str());
        }
    }
    lines.join("\n")
}

fn replace_checkbox(line: &str, checkbox: &str) -> String {
    // Find the first [ ] or [x] pattern and replace it
    if let Some(open) = line.find('[') {
        if let Some(close) = line[open..].find(']') {
            let close_abs = open + close;
            let mut result = line.to_string();
            result.replace_range(open + 1..close_abs, checkbox);
            return result;
        }
    }
    line.to_string()
}

/// Edit a task's title (and optionally description), preserving all metadata.
pub fn edit_task_in_markdown(
    md: &str,
    task_line: usize,
    new_title: &str,
    new_description: Option<&str>,
) -> String {
    let lines: Vec<&str> = md.split('\n').collect();
    if task_line >= lines.len() {
        return md.to_string();
    }

    let line = lines[task_line];
    let trimmed = line.trim_start();
    if !trimmed.starts_with("- [") && !trimmed.starts_with("* [") {
        return md.to_string();
    }

    let bracket_end = match trimmed.find(']') {
        Some(p) => p,
        None => return md.to_string(),
    };
    let checkbox = &trimmed[2..bracket_end];
    let original_content = trimmed[bracket_end + 1..].trim_start();

    // Extract all metadata parts to preserve
    let meta_parts = extract_all_meta(original_content);
    let meta_suffix = if meta_parts.is_empty() {
        String::new()
    } else {
        format!(" {}", meta_parts.join(" "))
    };

    let indent = &line[..line.len() - line.trim_start().len()];
    let bullet = if trimmed.starts_with("* [") { "*" } else { "-" };
    let new_line = format!("{}{} [{}] {}{}", indent, bullet, checkbox, new_title, meta_suffix);

    let desc_end = find_description_end(&lines, task_line + 1);

    let mut result_lines: Vec<String> = Vec::new();
    result_lines.extend(lines[..task_line].iter().map(|l| l.to_string()));
    result_lines.push(new_line);

    match new_description {
        None => {
            // Keep existing description
            result_lines.extend(lines[task_line + 1..desc_end].iter().map(|l| l.to_string()));
        }
        Some(desc) => {
            if !desc.is_empty() {
                for dl in desc.split('\n') {
                    result_lines.push(format!("  {}", dl));
                }
            }
        }
    }

    result_lines.extend(lines[desc_end..].iter().map(|l| l.to_string()));
    result_lines.join("\n")
}

/// Extract all metadata tokens from a task line content (tags, project, deadline, priority, migrated, id).
fn extract_all_meta(content: &str) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();

    // Collect special patterns first (order matters for display)
    let special_prefixes = ["#priority:", "#deadline:", "#project:", "↗ migrated:", "^id-"];

    for prefix in &special_prefixes {
        if let Some(pos) = content.find(prefix) {
            let after = &content[pos + prefix.len()..];
            let end = after.find(|c: char| c.is_whitespace()).unwrap_or(after.len());
            let val = &after[..end];
            parts.push(format!("{}{}", prefix, val));
        }
    }

    // Collect regular tags (#word) that aren't special prefixes
    let bytes = content.as_bytes();
    let mut ci = 0;
    while ci < bytes.len() {
        if bytes[ci] == b'#' {
            let tag_start = ci;
            ci += 1;
            while ci < bytes.len() && (bytes[ci].is_ascii_alphanumeric() || bytes[ci] == b'_' || bytes[ci] == b'-') {
                ci += 1;
            }
            if ci > tag_start + 1 {
                let tag_str = &content[tag_start..ci];
                // Skip special prefixes
                let is_special = tag_str.starts_with("#priority:")
                    || tag_str.starts_with("#deadline:")
                    || tag_str.starts_with("#project:");
                if !is_special {
                    parts.push(tag_str.to_string());
                }
            }
        } else {
            ci += 1;
        }
    }

    parts
}

/// Full edit of a task including all attributes.
pub fn edit_task_full_in_markdown(
    md: &str,
    task_line: usize,
    updates: &TaskUpdateInput,
    current_date: Option<&str>,
) -> String {
    let lines: Vec<&str> = md.split('\n').collect();
    if task_line >= lines.len() {
        return md.to_string();
    }

    let line = lines[task_line];
    let trimmed = line.trim_start();
    if !trimmed.starts_with("- [") && !trimmed.starts_with("* [") {
        return md.to_string();
    }

    let bracket_end = match trimmed.find(']') {
        Some(p) => p,
        None => return md.to_string(),
    };
    let checkbox = &trimmed[2..bracket_end];
    let original_content = trimmed[bracket_end + 1..].trim_start();

    // Extract original ID and migrated marker
    let task_id = if let Some(pos) = original_content.find("^id-") {
        let after = &original_content[pos + 4..];
        let end = after.find(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
            .unwrap_or(after.len());
        Some(after[..end].to_string())
    } else {
        None
    };

    let source_date_from_migrated = if let Some(pos) = original_content.find("↗ migrated:") {
        let after = &original_content[pos + "↗ migrated:".len()..];
        let end = after.find(|c: char| c.is_whitespace()).unwrap_or(after.len());
        Some(after[..end].to_string())
    } else {
        None
    };

    // Determine title: use update or strip metadata from original
    let title = if let Some(t) = &updates.title {
        t.clone()
    } else {
        strip_all_meta(original_content)
    };

    let indent = &line[..line.len() - line.trim_start().len()];
    let bullet = if trimmed.starts_with("* [") { "*" } else { "-" };
    let mut new_line = format!("{}{} [{}] {}", indent, bullet, checkbox, title);

    // Add tags
    if let Some(tags) = &updates.tags {
        let filtered: Vec<&String> = tags.iter().filter(|t| !t.is_empty() && t.as_str() != "tasks").collect();
        if !filtered.is_empty() {
            let tag_str: Vec<String> = filtered.iter().map(|t| format!("#{}", t.replace(' ', "-"))).collect();
            new_line.push(' ');
            new_line.push_str(&tag_str.join(" "));
        }
    }

    if let Some(project) = &updates.project {
        new_line.push_str(&format!(" #project:{}", project.replace(' ', "_")));
    }
    if let Some(deadline) = &updates.deadline {
        new_line.push_str(&format!(" #deadline:{}", deadline));
    }
    if let Some(priority) = &updates.priority {
        new_line.push_str(&format!(" #priority:{}", priority));
    }

    // Preserve migrated marker
    if let Some(sd) = &source_date_from_migrated {
        let skip = current_date.map_or(false, |d| d == sd.as_str());
        if !skip {
            new_line.push_str(&format!(" ↗ migrated:{}", sd));
        }
    }

    // Preserve ID
    if let Some(id) = &task_id {
        new_line.push_str(&format!(" ^id-{}", id));
    }

    let desc_end = find_description_end(&lines, task_line + 1);

    let mut result_lines: Vec<String> = Vec::new();
    result_lines.extend(lines[..task_line].iter().map(|l| l.to_string()));
    result_lines.push(new_line);

    match &updates.description {
        None => {
            // Keep existing description
            result_lines.extend(lines[task_line + 1..desc_end].iter().map(|l| l.to_string()));
        }
        Some(desc) => {
            if !desc.is_empty() {
                for dl in desc.split('\n') {
                    result_lines.push(format!("  {}", dl));
                }
            }
        }
    }

    result_lines.extend(lines[desc_end..].iter().map(|l| l.to_string()));
    result_lines.join("\n")
}

/// Strip all metadata tokens from a task line content, returning just the title.
fn strip_all_meta(content: &str) -> String {
    let mut s = content.to_string();

    // Remove special patterns
    for prefix in &["#priority:", "#deadline:", "#project:", "↗ migrated:", "^id-"] {
        while let Some(pos) = s.find(prefix) {
            let after = &s[pos + prefix.len()..];
            let end = after.find(|c: char| c.is_whitespace()).unwrap_or(after.len());
            let full = format!("{}{}", prefix, &after[..end]);
            s = s.replace(&full, "");
        }
    }

    // Remove remaining #tags
    let bytes_copy: Vec<u8> = s.as_bytes().to_vec();
    let mut result = String::new();
    let mut ci = 0;
    while ci < bytes_copy.len() {
        if bytes_copy[ci] == b'#' {
            let _tag_start = ci;
            ci += 1;
            while ci < bytes_copy.len() && (bytes_copy[ci].is_ascii_alphanumeric() || bytes_copy[ci] == b'_' || bytes_copy[ci] == b'-') {
                ci += 1;
            }
            // skip this tag
        } else {
            result.push(bytes_copy[ci] as char);
            ci += 1;
        }
    }

    result.split_whitespace().collect::<Vec<&str>>().join(" ")
}

/// Append a new task to the end of the markdown content.
pub fn append_task_to_markdown(md: &str, task: &Task, current_date: Option<&str>) -> String {
    let line = task_to_line(task, current_date);
    if md.is_empty() {
        return format!("{}\n", line);
    }
    let trimmed = md.trim_end_matches('\n');
    format!("{}\n{}\n", trimmed, line)
}

/// Remove the task at the given line (and its description) from the markdown.
pub fn remove_task_from_markdown(md: &str, task_line: usize) -> String {
    let lines: Vec<&str> = md.split('\n').collect();
    if task_line >= lines.len() {
        return md.to_string();
    }
    let desc_end = find_description_end(&lines, task_line + 1);

    let mut result: Vec<&str> = Vec::new();
    result.extend_from_slice(&lines[..task_line]);
    result.extend_from_slice(&lines[desc_end..]);
    result.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Task;

    fn make_task(id: &str, title: &str) -> Task {
        Task {
            id: id.to_string(),
            title: title.to_string(),
            description: None,
            status: "todo".to_string(),
            tags: None,
            project: None,
            deadline: None,
            priority: None,
            source_date: None,
            line: None,
        }
    }

    #[test]
    fn test_parse_simple_task() {
        let md = "## Tasks\n\n- [ ] Buy groceries ^id-abc123\n";
        let tasks = parse_markdown(md);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Buy groceries");
        assert_eq!(tasks[0].id, "abc123");
        assert_eq!(tasks[0].status, "todo");
    }

    #[test]
    fn test_parse_done_task() {
        let md = "- [x] Done task ^id-done1\n";
        let tasks = parse_markdown(md);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].status, "done");
    }

    #[test]
    fn test_parse_task_with_metadata() {
        let md = "- [ ] My task #tag1 #project:MyProject #deadline:2026-05-10 #priority:high ^id-t1\n";
        let tasks = parse_markdown(md);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "My task");
        assert_eq!(tasks[0].project.as_deref(), Some("MyProject"));
        assert_eq!(tasks[0].deadline.as_deref(), Some("2026-05-10"));
        assert_eq!(tasks[0].priority.as_deref(), Some("high"));
    }

    #[test]
    fn test_append_task() {
        let md = "## Tasks\n\n- [ ] Existing task ^id-e1\n";
        let task = make_task("new1", "New task");
        let result = append_task_to_markdown(md, &task, None);
        assert!(result.contains("Existing task"));
        assert!(result.contains("New task"));
    }

    #[test]
    fn test_append_to_empty() {
        let task = make_task("t1", "First task");
        let result = append_task_to_markdown("", &task, None);
        assert!(result.contains("First task"));
    }

    #[test]
    fn test_remove_task() {
        let md = "## Tasks\n\n- [ ] Task A ^id-a\n- [ ] Task B ^id-b\n- [ ] Task C ^id-c\n";
        let tasks = parse_markdown(md);
        assert_eq!(tasks.len(), 3);
        let line_b = tasks[1].line.unwrap();
        let result = remove_task_from_markdown(md, line_b);
        let remaining = parse_markdown(&result);
        assert_eq!(remaining.len(), 2);
        assert!(remaining.iter().any(|t| t.title == "Task A"));
        assert!(remaining.iter().any(|t| t.title == "Task C"));
        assert!(!remaining.iter().any(|t| t.title == "Task B"));
    }

    #[test]
    fn test_update_task_status() {
        let md = "- [ ] My task ^id-t1\n";
        let tasks = parse_markdown(md);
        let line = tasks[0].line.unwrap();
        let result = update_task_in_markdown(md, line, "done");
        assert!(result.contains("[x]"));
    }

    #[test]
    fn test_remove_task_with_description() {
        let md = "- [ ] Task A ^id-a\n  Description line\n- [ ] Task B ^id-b\n";
        let tasks = parse_markdown(md);
        let line_a = tasks[0].line.unwrap();
        let result = remove_task_from_markdown(md, line_a);
        let remaining = parse_markdown(&result);
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].title, "Task B");
    }
}
