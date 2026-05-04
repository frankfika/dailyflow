import fs from 'fs';
const code = fs.readFileSync('src/App.tsx', 'utf8');
const lines = code.split('\n');

let startLine = lines.findIndex(l => l.includes('{/* New Task Input */}'));
let endLine = -1;
let depth = 0;
for(let i = startLine; i < lines.length; i++) {
  if (lines[i].includes('<motion.div')) depth++;
  if (lines[i].includes('</motion.div>')) {
    depth--;
    if (depth === 0) {
      endLine = i;
      break;
    }
  }
}

console.log('Start Line:', startLine, 'End Line:', endLine);

if (startLine !== -1 && endLine !== -1) {
  let chunkToMove = lines.slice(startLine, endLine + 1);
  // remove chunk
  lines.splice(startLine, endLine - startLine + 1);
  
  // find insertion point: after Rollover Notification
  let insertLine = lines.findIndex(l => l.includes('{categories.map(category => {'));
  if (insertLine !== -1) {
    lines.splice(insertLine, 0, ...chunkToMove);
    fs.writeFileSync('src/App.tsx', lines.join('\n'));
    console.log('Moved successfully');
  } else {
    console.log('Insertion point not found');
  }
} else {
  console.log('Chunk not found');
}
