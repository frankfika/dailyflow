#!/usr/bin/env node
/**
 * Capture README screenshots from a real running DailyFlow app.
 *
 * Usage:
 *   DAILYFLOW_BASE_URL=http://localhost:5173 node scripts/capture-screenshots.mjs
 *
 * This script intentionally does not generate mocked screens. Start the real app
 * first, then capture from localhost.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const assetsDir = join(rootDir, 'docs', 'assets');
const baseUrl = process.env.DAILYFLOW_BASE_URL || 'http://localhost:5173';

const shots = [
  { path: '/', name: 'home.png' },
  { path: '/projects', name: 'projects.png' },
  { path: '/settings', name: 'settings.png' },
];

async function main() {
  await mkdir(assetsDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  for (const shot of shots) {
    const url = new URL(shot.path, baseUrl).toString();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.screenshot({ path: join(assetsDir, shot.name), fullPage: true });
      console.log(`captured ${url} -> docs/assets/${shot.name}`);
    } catch (error) {
      console.error(`failed to capture ${url}`);
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
      break;
    }
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
