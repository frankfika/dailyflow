#!/usr/bin/env node
/**
 * Record DailyFlow demo (tier-3 real product capture).
 * Each segment waits for the new page to render before recording ends.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = '/tmp/df-demo-recordings';
const BASE = 'http://localhost:3001';
const VIEWPORT = { width: 1920, height: 1080 };

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const segments = [];
function startSeg(name) {
  const t0 = Date.now();
  console.log(`\n▶ ${name}`);
  return { name, t0 };
}
function endSeg(seg) {
  seg.durationMs = Date.now() - seg.t0;
  segments.push(seg);
  console.log(`  ✓ ${seg.name}: ${(seg.durationMs / 1000).toFixed(2)}s`);
}

async function waitSettled(page, ms = 2500) {
  try { await page.waitForLoadState('networkidle', { timeout: 1500 }); } catch {}
  await sleep(ms);
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: OUT, size: VIEWPORT },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="nav-today"]', { timeout: 15000 });
  await page.evaluate(() => {
    localStorage.setItem('df_provider_configs', JSON.stringify({
      configs: [{ id: 'demo-mock', name: 'Demo Local LLM', baseUrl: 'http://127.0.0.1:3031/v1', apiKey: 'sk-demo', model: 'demo-mock-1.0' }],
      activeId: 'demo-mock',
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="nav-today"]', { timeout: 15000 });
  await waitSettled(page, 1500);
  console.log('  AI provider pre-configured');

  // ───── SEG 1: Today ─────
  let s = startSeg('today');
  await waitSettled(page, 4000);
  endSeg(s);

  // ───── SEG 2: Today focus mode ─────
  s = startSeg('today-focus');
  for (let i = 0; i < 2; i++) {
    const allStars = page.locator('svg.lucide-star, .lucide-star');
    if ((await allStars.count()) > i) {
      await allStars.nth(i).click({ timeout: 1500 }).catch(() => {});
    }
    await sleep(500);
  }
  await waitSettled(page, 3000);
  endSeg(s);

  // ───── SEG 3: Notes — switch to Inbox sub-tab ─────
  s = startSeg('notes-inbox');
  await page.click('[data-testid="nav-notes"]', { timeout: 5000 }).catch(() => {});
  await waitSettled(page, 1500);
  const inboxTab = page.locator('button:has-text("Inbox"), button:has-text("待处理来源")').first();
  if ((await inboxTab.count()) > 0) {
    await inboxTab.click({ timeout: 3000 }).catch(() => {});
  }
  await waitSettled(page, 3500);
  endSeg(s);

  // ───── SEG 4: Notes — back to Notes sub-tab (notes list) ─────
  s = startSeg('notes-list');
  const notesTab = page.locator('button:has-text("Notes"), button:has-text("笔记")').first();
  if ((await notesTab.count()) > 0) {
    await notesTab.click({ timeout: 3000 }).catch(() => {});
  }
  await waitSettled(page, 1500);
  endSeg(s);

  // ───── SEG 5: Notes — open Q3 定价策略 ─────
  s = startSeg('notes-detail');
  const q3 = page.locator('text=Q3 定价策略').first();
  if ((await q3.count()) > 0) {
    await q3.click({ timeout: 3000 }).catch(() => {});
  }
  await waitSettled(page, 7500);
  endSeg(s);

  // ───── SEG 6: AI Chat ─────
  s = startSeg('ai-chat');
  await page.click('[data-testid="nav-ai-chat"]', { timeout: 5000 }).catch(() => {});
  await waitSettled(page, 2500);
  const chatInput = page.locator('textarea').first();
  if ((await chatInput.count()) > 0) {
    await chatInput.fill('总结一下今天的 commitment').catch(() => {});
    await sleep(800);
    await chatInput.press('Enter').catch(() => {});
    await waitSettled(page, 6000);
  }
  endSeg(s);

  // ───── SEG 7: Memory ─────
  s = startSeg('memory');
  await page.click('[data-testid="nav-memory"]', { timeout: 5000 }).catch(() => {});
  await waitSettled(page, 3000);
  const memSearch = page.locator('input[placeholder*="Why"], input[placeholder*="search"], input[type="search"]').first();
  if ((await memSearch.count()) > 0) {
    await memSearch.fill('为什么选择两档定价').catch(() => {});
    await waitSettled(page, 4000);
  } else {
    await waitSettled(page, 4000);
  }
  endSeg(s);

  // ───── SEG 8: Mind Map ─────
  s = startSeg('mindmap');
  try {
    await page.click('[data-testid="nav-mindmap"]', { timeout: 5000 }).catch(() => {});
    await waitSettled(page, 2000);
    const mapListItem = page.locator('text=Q3 客户增长').first();
    if ((await mapListItem.count()) > 0) {
      await mapListItem.click({ timeout: 3000 }).catch(() => {});
    } else {
      const mapId = await page.evaluate(async () => {
        const r = await fetch('/api/mindmaps');
        const m = await r.json();
        return m[0]?.id;
      });
      if (mapId) {
        await page.goto(`${BASE}/mindmap/${mapId}`, { waitUntil: 'domcontentloaded' });
      }
    }
    await waitSettled(page, 3500);
  } catch (err) {
    console.error('  ! mindmap seg error:', err.message);
    await waitSettled(page, 3500);
  }
  endSeg(s);

  // ───── SEG 9: Calendar ─────
  s = startSeg('calendar');
  try {
    // Pre-click calendar in mindmap seg to start the data fetch
    // (We're now in mindmap, so go via URL would be faster, but click works)
    await page.click('[data-testid="nav-calendar"]', { timeout: 5000 }).catch(() => {});
    // Wait for calendar data to load (max 12s)
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading calendar'),
      { timeout: 12000 }
    ).catch(() => {});
    await waitSettled(page, 3000);
  } catch (err) {
    console.error('  ! calendar seg error:', err.message);
    await waitSettled(page, 6000);
  }
  endSeg(s);

  await ctx.close();
  await browser.close();

  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm') && f !== 'recording.webm');
  if (files.length === 0) {
    console.error('No webm found');
    process.exit(1);
  }
  const videoPath = path.join(OUT, files[0]);
  fs.renameSync(videoPath, path.join(OUT, 'recording.webm'));

  let cum = 0;
  const cuts = segments.map((seg) => {
    const start = cum;
    const end = cum + seg.durationMs / 1000;
    cum = end;
    return { name: seg.name, start, end };
  });
  fs.writeFileSync(path.join(OUT, 'segments.json'), JSON.stringify(cuts, null, 2));
  console.log('\nSegments:');
  cuts.forEach((c) => console.log(`  ${c.name}: ${c.start.toFixed(2)}s → ${c.end.toFixed(2)}s (${(c.end - c.start).toFixed(2)}s)`));
  console.log(`\nTotal: ${cum.toFixed(2)}s`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
