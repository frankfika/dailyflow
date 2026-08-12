import { rmSync } from 'node:fs';

export default function globalTeardown(): void {
  const root = process.env.DAILYFLOW_E2E_ROOT;
  if (root?.startsWith('/tmp/') || root?.includes('/T/dailyflow-playwright-')) {
    rmSync(root, { recursive: true, force: true });
  }
}
