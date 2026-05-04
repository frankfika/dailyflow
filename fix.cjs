const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');
content = content.replace(/\(selectedCategory \|\| 'Inbox'\)/g, "(selectedCategory || 'Tasks')");
fs.writeFileSync('src/App.tsx', content);
