#!/usr/bin/env tsx
/**
 * `npm run migrate:event-first -- [dry-run|apply|verify] [--backup-dir=<dir>] [--verify]`
 *
 *   dry-run   = produce JSON report, no writes.
 *   apply     = write backup + apply report; --backup-dir is REQUIRED
 *   verify    = re-compare current workspace with the last apply report
 */
import { parseArgs } from 'util';
import path from 'path';
import {
  dryRun,
  apply,
  verify,
  ApplyRequiresBackupDirError,
  type MigrationReport,
} from '../services/migrateEventFirst.js';

function print(report: MigrationReport | (MigrationReport & { ok: boolean })) {
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'backup-dir': { type: 'string' },
      'verify': { type: 'boolean', default: false },
      'from': { type: 'string' },
      'to': { type: 'string' },
    },
    allowPositionals: true,
  });
  const mode = (positionals[0] ?? 'dry-run') as 'dry-run' | 'apply' | 'verify';
  try {
    let r: any;
    if (mode === 'apply') {
      r = await apply({ backupDir: values['backup-dir'] ?? '', scanFrom: values.from, scanTo: values.to });
      if (values.verify) {
        r = await verify({ scanFrom: values.from, scanTo: values.to });
      }
    } else if (mode === 'verify') {
      r = await verify({ scanFrom: values.from, scanTo: values.to });
    } else {
      r = await dryRun({ scanFrom: values.from, scanTo: values.to });
    }
    print(r);
    if (mode === 'verify' && r.ok === false) process.exit(2);
  } catch (err) {
    if (err instanceof ApplyRequiresBackupDirError) {
      console.error(`error: ${err.message} (pass --backup-dir for apply mode)`);
      process.exit(2);
    }
    throw err;
  }
}

void main();
