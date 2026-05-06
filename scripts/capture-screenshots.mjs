#!/usr/bin/env node
/**
 * Screenshot capture script for DailyFlow README
 * Captures real screenshots from localhost:3000
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
  const { width = VIEWPORT.width, height = VIEWPORT.height, wait = 1500 } = options;

  await page.setViewportSize({ width, height });
  await sleep(wait);
  await page.screenshot({ path, type: 'png', fullPage: false });

  console.log(`📸 Screenshot saved: ${path}`);
  return path;
}

async function captureScreenshots() {
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  const BASE_URL = 'http://localhost:3000';

  try {
    console.log('\n📷 Starting screenshot capture for DailyFlow...\n');

    // 1. Main/Home page (Today view)
    console.log('📷 Capturing Today view...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    await captureScreenshot(page, 'home', { wait: 2000 });

    // 2. Projects view
    console.log('📷 Capturing Projects view...');
    await page.click('text=Projects', { timeout: 5000 }).catch(() => {});
    await sleep(1500);
    await captureScreenshot(page, 'projects', { wait: 1500 });

    // 3. Settings page
    console.log('📷 Capturing Settings page...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);

    const settingsBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
    await settingsBtn.click().catch(() => {});
    await sleep(1500);
    await captureScreenshot(page, 'settings', { wait: 1500 });

    // 4. Workspace Setup
    console.log('📷 Capturing Workspace Setup...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    await captureScreenshot(page, 'workspace-setup', { wait: 2000 });

    console.log('\n✨ All screenshots captured successfully!');
    console.log(`📁 Location: ${assetsDir}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n⚠️  Make sure app is running at localhost:3000');
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
