// E2E smoke test for Topic Space (Phase 1).
// Run with: `npx playwright test e2e/topic-spaces.spec.ts --workers=1`
//
// Verifies that the MindMap view renders the new topic tab strip with
// "全部" / "未分类" pills, and that the user can create a new topic via
// the "+ 新主题" flow and see it become the active tab. Captures a
// screenshot for visual review.

import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('topic spaces: 全部 / 未分类 pills, create flow, auto-select', async ({ page, request }) => {
  const ws = mkdtempSync(join(tmpdir(), 'df-topic-spaces-'));
  mkdirSync(join(ws, '.dailyflow'), { recursive: true });
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  mkdirSync(join(ws, 'Daily', String(yyyy), mm), { recursive: true });
  writeFileSync(join(ws, 'Daily', String(yyyy), mm, `${today}.md`), `# ${today}\n`);

  // Capture network responses for debugging.
  const networkLog: Array<{ method: string; url: string; status: number; body: string }> = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/topic-spaces')) {
      try {
        networkLog.push({
          method: resp.request().method(),
          url,
          status: resp.status(),
          body: await resp.text(),
        });
      } catch {
        networkLog.push({ method: resp.request().method(), url, status: resp.status(), body: '<unread>' });
      }
    }
  });

  // Capture console messages for debugging.
  const consoleLog: Array<{ type: string; text: string }> = [];
  page.on('console', (msg) => {
    consoleLog.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    consoleLog.push({ type: 'pageerror', text: String(err) });
  });

  const cfgRes = await request.post('http://localhost:3000/api/config', {
    data: {
      workspaceRoot: ws,
      activeWorkspaceId: 'ts',
      workspaces: [{ id: 'ts', name: 'ts', path: ws, createdAt: '2026-01-01T00:00:00Z' }],
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    },
  });
  if (!cfgRes.ok()) {
    throw new Error('Failed to seed workspace: ' + (await cfgRes.text()));
  }

  // 1. Open the MindMap tab.
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByTestId('nav-mindmap').click();
  await page.waitForTimeout(500);

  // 2. The TopicTabs strip is visible with the two pinned pills.
  const tabs = page.getByTestId('topic-tabs');
  await expect(tabs).toBeVisible();
  await expect(page.getByTestId('topic-tab-all')).toBeVisible();
  await expect(page.getByTestId('topic-tab-unclassified')).toBeVisible();
  // 全部 is the default active tab.
  await expect(page.getByTestId('topic-tab-all')).toHaveAttribute('data-active', 'true');

  // 3. Click 未分类 — it should become active and 全部 should not.
  await page.getByTestId('topic-tab-unclassified').click();
  await expect(page.getByTestId('topic-tab-unclassified')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('topic-tab-all')).toHaveAttribute('data-active', 'false');

  // 4. Open the create input and submit a topic.
  await page.getByTestId('topic-tab-create').click();
  const input = page.getByTestId('topic-tab-create-input');
  await expect(input).toBeVisible();
  await input.fill('Phase 1 Smoke');
  await page.getByTestId('topic-tab-create-confirm').click();

  // 5. Wait for the create POST to complete.
  await page.waitForResponse(
    (r) => r.url().includes('/api/topic-spaces') && r.request().method() === 'POST',
    { timeout: 10000 },
  ).catch(() => null);
  // Give React time to re-render with the new list.
  await page.waitForTimeout(1000);

  // 6. Capture the resulting view regardless of the post-create state so
  // we always have a visual artifact.
  await page.screenshot({
    path: '/Users/fangchen/Baidu/GitHub/dailyflow/visual-topic-spaces-1-created.png',
    fullPage: true,
  });

  // 7. Network log for the orchestrator. Dump the topic-spaces responses
  // so any future failure is easy to diagnose.
  console.log('[topic-spaces e2e] network log:');
  for (const entry of networkLog) {
    console.log(`  ${entry.method} ${entry.url} → ${entry.status} ${entry.body.slice(0, 200)}`);
  }
  console.log('[topic-spaces e2e] console log:');
  for (const entry of consoleLog) {
    console.log(`  [${entry.type}] ${entry.text}`);
  }

  // 8. The new tab is the one whose label text matches what we just
  // typed. We can't pin by id (it's server-generated) so we use a
  // text-based locator inside the TopicTabs strip.
  const newTab = page.locator('[data-testid="topic-tabs"] button', { hasText: 'Phase 1 Smoke' });
  await expect(newTab).toBeVisible();

  // Diagnostic: print all buttons inside the topic-tabs strip and their
  // data-active state so future failures are easy to read.
  const allTabs = await page.locator('[data-testid="topic-tabs"] button').evaluateAll((els) =>
    els.map((el) => ({
      testid: el.getAttribute('data-testid'),
      active: el.getAttribute('data-active'),
      text: (el.textContent || '').trim().slice(0, 40),
    })),
  );
  console.log('[topic-spaces e2e] tabs after create:', JSON.stringify(allTabs, null, 2));

  await expect(newTab).toHaveAttribute('data-active', 'true');
});

