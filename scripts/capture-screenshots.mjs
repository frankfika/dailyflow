#!/usr/bin/env node
/**
 * Screenshot capture script for DailyFlow README
 * Captures real screenshots from the running application
 *
 * Prerequisites:
 *   npm run dev    (frontend on port 5173)
 *   npm run server (backend on port 3003)
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const assetsDir = join(rootDir, 'docs', 'assets');

const VIEWPORT = { width: 1280, height: 800 };
const BASE_URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshots() {
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    // 1. Main page
    console.log('📷 Capturing home page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await sleep(2000);
    await page.screenshot({ path: join(assetsDir, 'home.png'), type: 'png' });
    console.log('  ✓ home.png');

    // 2. Add task panel
    console.log('📷 Capturing add task...');
    await page.click('button[title*="Add Task"]');
    await sleep(1000);
    await page.screenshot({ path: join(assetsDir, 'add-task.png'), type: 'png' });
    console.log('  ✓ add-task.png');

    // 3. Close task input, switch to Projects
    await page.keyboard.press('Escape');
    await sleep(500);
    const projectsNav = page.locator('text=Projects Focus').first();
    await projectsNav.click();
    await sleep(1500);
    await page.screenshot({ path: join(assetsDir, 'projects.png'), type: 'png' });
    console.log('  ✓ projects.png');

    // 4. Markdown view
    console.log('📷 Capturing markdown view...');
    await page.click('button:has-text("Raw Markdown")');
    await sleep(1000);
    await page.screenshot({ path: join(assetsDir, 'markdown-view.png'), type: 'png' });
    console.log('  ✓ markdown-view.png');

    console.log(`\n✨ All screenshots saved to ${assetsDir}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
