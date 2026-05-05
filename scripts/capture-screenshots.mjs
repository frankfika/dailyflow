#!/usr/bin/env node
/**
 * DailyFlow Screenshot Capture Script
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshot(page, name, options = {}) {
  const path = join(assetsDir, `${name}.png`);
  const { width = VIEWPORT.width, height = VIEWPORT.height, wait = 1000 } = options;

  await page.setViewportSize({ width, height });
  await sleep(wait);
  await page.screenshot({ path, type: 'png' });

  console.log(`📸 Screenshot saved: ${path}`);
  return path;
}

async function captureScreenshots() {
  // Create assets directory
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  const BASE_URL = 'http://localhost:3002';

  try {
    console.log('\n🚀 Starting screenshot capture from real application...\n');

    // 1. Main page
    console.log('📷 Capturing main page...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await sleep(2000);
    await captureScreenshot(page, 'home', { wait: 2000 });

    // 2. Projects view
    console.log('📷 Capturing projects view...');
    await page.click('text=Projects');
    await sleep(1500);
    await captureScreenshot(page, 'projects', { wait: 1500 });

    // 3. Settings
    console.log('📷 Capturing settings...');
    await page.click('text=Configuration');
    await sleep(1000);
    await captureScreenshot(page, 'settings', { wait: 1000 });

    console.log('\n✨ All screenshots generated!');
    console.log(`📁 Location: ${assetsDir}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
