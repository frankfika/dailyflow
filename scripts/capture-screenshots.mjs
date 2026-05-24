#!/usr/bin/env node
/**
 * Screenshot capture script for DailyFlow README
 * Captures real screenshots from running application
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
const BASE_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshot(page, name, options = {}) {
  const path = join(assetsDir, `${name}.png`);
  const { width = VIEWPORT.width, height = VIEWPORT.height, wait = 1500 } = options;

  await page.setViewportSize({ width, height });
  await sleep(wait);
  await page.screenshot({ path, type: 'png', fullPage: false });
  console.log(`📸 Saved: ${path}`);
  return path;
}

async function captureScreenshots() {
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  console.log('🚀 Starting browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  try {
    // 1. Main/Home page - Daily view with tasks
    console.log('\n📷 Capturing main daily view...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(2000);
    await captureScreenshot(page, 'home', { wait: 2000 });

    // 2. Projects view
    console.log('📷 Capturing projects view...');
    await page.click('text=Projects', { timeout: 5000 }).catch(() => {});
    await sleep(1500);
    await captureScreenshot(page, 'projects', { wait: 1500 });

    // 3. Notes view
    console.log('📷 Capturing notes view...');
    await page.click('text=Notes', { timeout: 5000 }).catch(() => {});
    await sleep(1500);
    await captureScreenshot(page, 'notes', { wait: 1500 });

    // 4. Settings modal - About tab
    console.log('📷 Capturing settings/about...');
    await page.click('[aria-label="Settings"]', { timeout: 5000 }).catch(() => {});
    await sleep(1000);
    await captureScreenshot(page, 'settings', { wait: 1500 });
    await page.keyboard.press('Escape');
    await sleep(500);

    console.log('\n✨ All screenshots captured!');
    console.log(`📁 Location: ${assetsDir}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);