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
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="nav-workspaces"]', { timeout: 15000 });
    await sleep(3000);
    await captureScreenshot(page, 'home', { wait: 2000 });

    // 2. Workspaces view (new v1.0.0 Thinking Workspaces)
    console.log('📷 Capturing Thinking Workspaces view...');
    const workspacesLink = await page.$('[data-testid="nav-workspaces"]');
    if (workspacesLink) {
      await workspacesLink.click();
      await sleep(2000);
      await captureScreenshot(page, 'workspaces', { wait: 2000 });
    } else {
      console.log('  ⚠️ Workspaces nav not found');
    }

    // 3. Notes view
    console.log('📷 Capturing notes view...');
    const notesLink = await page.$('text=Notes');
    if (notesLink) {
      await notesLink.click();
      await sleep(1500);
      await captureScreenshot(page, 'notes', { wait: 1500 });
    }

    // 4. Prompt Library
    console.log('📷 Capturing prompt library...');
    const promptLib = await page.$('text=Prompt Library');
    if (promptLib) {
      await promptLib.click();
      await sleep(1500);
      await captureScreenshot(page, 'ai-prompts', { wait: 1500 });
    }

    // 5. AI Chat panel
    console.log('📷 Capturing AI Chat...');
    const aiChatLink = await page.$('text=AI Chat');
    if (!aiChatLink) {
      const aiChatLink2 = await page.$('text=Chat');
      if (aiChatLink2) await aiChatLink2.click();
    } else {
      await aiChatLink.click();
    }
    await sleep(1500);
    await captureScreenshot(page, 'ai-chat', { wait: 1500 });

    // 6. Settings/About
    console.log('📷 Capturing settings/about...');
    const settingsBtn = await page.$('[data-testid="settings-button"]');
    if (settingsBtn) {
      await settingsBtn.click();
      await sleep(1000);
      const aboutTab = await page.$('text=About');
      if (aboutTab) await aboutTab.click();
      await sleep(500);
      await captureScreenshot(page, 'settings', { wait: 1500 });
    }

    console.log('\n✨ All screenshots captured!');
    console.log(`📁 Location: ${assetsDir}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);