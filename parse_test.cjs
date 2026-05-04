const MOCK_FILES = {
  '2026-05-04': `## Work

- [ ] Complete secondplanet deployment #project:Investment #deadline:2026-05-10 #priority:high ↗ migrated:2026-05-02
- [ ] Review Q2 financial models #project:Fundraising ↗ migrated:2026-05-03

## Personal

- [x] Buy groceries (coffee, oat milk) ↗ migrated:2026-05-03
`
};
function parseMarkdown(md) {
  const lines = md.split('\n');
  const tasks = [];
  let currentCategory = 'Tasks';
  
  lines.forEach((line, index) => {
    const categoryMatch = line.match(/^##\s+(.+)$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim().toLowerCase();
      return;
    }
    
    // Support either '- [ ]' or '- [x]'
    const taskMatch = line.match(/^\s*[-*]\s+\[([xX ]+)\]\s+(.*)$/);
    if (taskMatch) {
      const isDone = taskMatch[1].toLowerCase() === 'x';
      let content = taskMatch[2];
      
      const priorityMatch = content.match(/#priority:(high|medium|low)/);
      const priority = priorityMatch ? priorityMatch[1] : undefined;
      content = content.replace(/#priority:(high|medium|low)/, '').trim();
      
      const deadlineMatch = content.match(/#deadline:([^\s]+)/);
      const deadline = deadlineMatch ? deadlineMatch[1] : undefined;
      content = content.replace(/#deadline:[^\s]+/, '').trim();
      
      const projectMatch = content.match(/#project:([^\s]+)/);
      const project = projectMatch ? projectMatch[1].replace(/_/g, ' ') : undefined;
      content = content.replace(/#project:[^\s]+/, '').trim();
      
      const migratedMatch = content.match(/↗ migrated:([^\s]+)/);
      let source_date = undefined;
      if (migratedMatch) {
        source_date = migratedMatch[1];
        content = content.replace(/↗ migrated:[^\s]+/, '').trim();
      }

      const tagsMatch = content.match(/#([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g);
      const extractedTags = tagsMatch ? tagsMatch.map(t => t.slice(1).toLowerCase()) : [];
      content = content.replace(/#([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g, '').trim();

      const tags = new Set();
      if (currentCategory && currentCategory !== 'tasks' && currentCategory !== 'inbox') {
         tags.add(currentCategory);
      }
      extractedTags.forEach(t => tags.add(t));

      tasks.push({
        id: `t${index}_${Math.random().toString(36).substr(2, 5)}`, // Generate unique ID
        title: content,
        status: isDone ? 'done' : 'todo',
        tags: Array.from(tags),
        project,
        deadline,
        priority,
        source_date
      });
    }
  });
  
  return tasks;
}

function generateMarkdown(tasks) {
  let md = '## Tasks\n\n';

  tasks.forEach(task => {
    let line = `- [${task.status === 'done' ? 'x' : ' '}] ${task.title}`;
    if (task.tags && task.tags.length > 0) {
       const filteredTags = task.tags.filter(t => t && t !== 'tasks');
       if (filteredTags.length > 0) {
         line += ` ${filteredTags.map(t => `#${t.replace(/\s+/g, '-')}`).join(' ')}`;
       }
    }
    if (task.project) line += ` #project:${task.project.replace(/ /g, '_')}`;
    if (task.deadline) line += ` #deadline:${task.deadline}`;
    if (task.priority) line += ` #priority:${task.priority}`;
    if (task.source_date && task.source_date !== '2026-05-04') line += ` ↗ migrated:${task.source_date}`;
    md += line + '\n';
  });
  return md;
}

let t = parseMarkdown(MOCK_FILES['2026-05-04']);
console.log(JSON.stringify(t, null, 2));
console.log(generateMarkdown(t));
