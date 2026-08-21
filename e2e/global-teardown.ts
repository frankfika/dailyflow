import { rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export default function globalTeardown(): void {
  const root = process.env.DAILYFLOW_E2E_ROOT;
  if (!root) return;

  const resolvedRoot = resolve(root);
  const resolvedTmp = resolve(tmpdir());
  const withinTmp = resolvedRoot.startsWith(`${resolvedTmp}/`) || resolvedRoot.startsWith(`${resolvedTmp}\\`);
  if (withinTmp && basename(resolvedRoot).startsWith('dailyflow-playwright-')) {
    rmSync(resolvedRoot, { recursive: true, force: true });
  }
}
