/**
 * One-shot script: fix historical source_date markers.
 *
 * Problem: before the fix, rollover always set source_date = fromDate (yesterday),
 * overwriting the original date. So a task created on May 1 that rolled over
 * May 1→2→3→4 would show "migrated:2026-05-03" instead of "migrated:2026-05-01".
 *
 * Strategy:
 * 1. Scan all daily files chronologically
 * 2. For each task (identified by stable ^id-xxx or title hash), record the
 *    earliest date it appeared as a todo (not migrated from somewhere else)
 * 3. Rewrite migrated markers to point to that earliest date
 *
 * Usage: npx tsx server/scripts/fix-source-dates.ts
 */

import { loadConfig } from '../services/config.js';
import { listDailyNotes, readDailyNote, writeDailyNote } from '../services/fileSystem.js';

interface TaskRecord {
  earliestDate: string;
  title: string;
}

async function main() {
  const config = await loadConfig();
  const allDates = await listDailyNotes(config);
  const sortedDates = [...allDates].sort();

  // Phase 1: build a map of taskId/title → earliest appearance date
  const taskOrigins = new Map<string, TaskRecord>();

  for (const date of sortedDates) {
    const note = await readDailyNote(date, config);
    if (!note) continue;

    for (const task of note.tasks) {
      const key = task.id;
      if (!taskOrigins.has(key)) {
        // First time seeing this task — check if it already has a source_date
        // (meaning it was migrated from an even earlier date)
        const origin = task.source_date || date;
        taskOrigins.set(key, { earliestDate: origin, title: task.title });
      }
    }
  }

  // Phase 2: rewrite files where migrated markers are wrong
  let totalFixed = 0;
  let filesFixed = 0;

  for (const date of sortedDates) {
    const note = await readDailyNote(date, config);
    if (!note) continue;

    let content = note.content;
    let changed = false;

    for (const task of note.tasks) {
      if (task.line === undefined) continue;
      if (!task.source_date) continue;
      if (task.source_date === date) continue;

      const origin = taskOrigins.get(task.id);
      if (!origin) continue;

      const correctDate = origin.earliestDate;
      if (correctDate === task.source_date) continue;

      // Fix the marker in this line
      const lines = content.split('\n');
      const line = lines[task.line];
      if (!line) continue;

      const fixed = line.replace(
        /↗\s*migrated:\S+/,
        `↗ migrated:${correctDate}`
      );

      if (fixed !== line) {
        lines[task.line] = fixed;
        content = lines.join('\n');
        changed = true;
        totalFixed++;
      }
    }

    if (changed) {
      await writeDailyNote(date, content, config);
      filesFixed++;
      console.log(`  Fixed: ${date}`);
    }
  }

  console.log(`\nDone. Fixed ${totalFixed} task(s) across ${filesFixed} file(s).`);
  if (totalFixed === 0) {
    console.log('No historical data needed fixing.');
  }
}

main().catch(err => {
  console.error('Fix script failed:', err);
  process.exit(1);
});
