import { chromium } from 'playwright';
const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const dir = mkdtempSync(join(tmpdir(), 'df-mmt-'));
mkdirSync(join(dir, '.dailyflow'), { recursive: true });
const now = new Date();
const yyyy = now.getUTCFullYear();
const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
mkdirSync(join(dir, 'Daily', String(yyyy), mm), { recursive: true });
writeFileSync(join(dir, 'Daily', String(yyyy), mm, `${yyyy}-${mm}-01.md`), '# test\n');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('fit') || t.includes('pos') || t.includes('reLayout') || t.includes('mindmap') || t.includes('layout')) {
    console.log('[browser]', m.type(), t);
  }
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.request.post('http://localhost:3000/api/config', {
  data: {
    workspaceRoot: dir,
    activeWorkspaceId: 'visual',
    workspaces: [{ id: 'visual', name: 'visual', path: dir, createdAt: '2026-01-01T00:00:00Z' }],
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  },
});
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.getByTestId('nav-mindmap').click();
await page.waitForTimeout(500);

const swot = page.getByTestId('mindmap-template-swot');
await swot.click();
await page.waitForTimeout(2500);

// Inspect the actual viewport
const viewport = await page.evaluate(() => {
  const vp = document.querySelector('.react-flow__viewport');
  if (!vp) return null;
  return vp.getAttribute('style');
});
console.log('Viewport style:', viewport);

// Inspect the actual node positions
const positions = await page.evaluate(() => {
  const nodes = document.querySelectorAll('.react-flow__node');
  return Array.from(nodes).slice(0, 8).map((n) => ({
    id: n.getAttribute('data-id'),
    transform: n.style.transform,
  }));
});
console.log('First nodes:', JSON.stringify(positions, null, 2));

// Get the tpl-b0 bounding box
const tplb0 = page.locator('[data-testid="mindmap-node-tpl-b0"]');
const box = await tplb0.boundingBox();
console.log('tpl-b0 bounding box:', box);

const swotNode = page.locator('[data-testid="mindmap-node-tpl-root"]');
const rootBox = await swotNode.boundingBox();
console.log('tpl-root bounding box:', rootBox);

await browser.close();
