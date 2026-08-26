import { expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1280, height: 800 } });

test('waiting_review survives refresh and SSE resumes from the saved cursor', async ({ page, request }) => {
  const { event, run, proposal } = await seed(request, 'review');
  const streamUrls: string[] = [];
  await page.route(`**/api/v2/events/${event.id}/agent-runs`, route => route.fulfill({ json: { items: [run] } }));
  await page.route(`**/api/v2/events/${event.id}/graph-proposals/pending`, route => route.fulfill({ json: { proposal } }));
  await page.route(`**/api/v2/agent-runs/${run.id}/events**`, route => { streamUrls.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `id: 3\nevent: proposal.ready\ndata: ${JSON.stringify({ schemaVersion: 1, workspaceId: run.workspaceId, runId: run.id, cursor: '3', fingerprint: 'fp3', type: 'proposal.ready', at: new Date().toISOString(), payload: { proposalId: proposal.id } })}\n\n` }); });
  await page.route(`**/api/v2/agent-runs/${run.id}`, route => route.fulfill({ json: { run } }));
  await page.goto('/'); await page.getByTestId('nav-events').click(); await page.getByTestId(`event-card-${event.id}`).click();
  await expect(page.getByTestId('agent-run-recovery-banner')).toBeVisible();
  await page.getByTestId('agent-run-recovery-banner').click();
  await expect(page.getByTestId('agent-run-panel')).toBeVisible();
  await expect.poll(() => streamUrls.length).toBeGreaterThan(0);
  await page.reload(); await page.getByTestId('nav-events').click(); await page.getByTestId(`event-card-${event.id}`).click(); await page.getByTestId('agent-run-recovery-banner').click();
  await expect.poll(() => streamUrls.some(url => url.includes('cursor=3'))).toBeTruthy();
});

test('a running recovered Run can be cancelled once', async ({ page, request }) => {
  const { event, run } = await seed(request, 'running'); let cancels = 0;
  await page.route(`**/api/v2/events/${event.id}/agent-runs`, route => route.fulfill({ json: { items: [run] } }));
  await page.route(`**/api/v2/events/${event.id}/graph-proposals/pending`, route => route.fulfill({ json: { proposal: null } }));
  await page.route(`**/api/v2/agent-runs/${run.id}/events**`, route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.route(`**/api/v2/agent-runs/${run.id}/cancel`, route => { cancels += 1; return route.fulfill({ json: { run: { ...run, status: 'cancelled' } } }); });
  await page.goto('/'); await page.getByTestId('nav-events').click(); await page.getByTestId(`event-card-${event.id}`).click(); await page.getByTestId('agent-run-recovery-banner').click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => cancels).toBe(1);
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
});

async function seed(request: any, suffix: string) {
  const workspace = mkdtempSync(join(tmpdir(), `df-event-recovery-${suffix}-`));
  const workspaceId = `operator-recovery-${suffix}`;
  await request.post('/api/config', { data: { workspaceRoot: workspace, activeWorkspaceId: workspaceId, workspaces: [{ id: workspaceId, name: workspaceId, path: workspace, createdAt: new Date().toISOString() }], language: 'en', v2: { enabled: true, eventFirst: true } } });
  const event = await (await request.post('/api/events', { data: { title: `Recover ${suffix}`, context: 'work' } })).json();
  const run = { id: `eval_01K3${suffix === 'review' ? 'B' : 'C'}AAAAAAAAAAAAAAAAAAAAA`, schemaVersion: 2, workspaceId, eventId: event.id, mindmapId: event.mindmapId, runtimeId: 'deepseek-harness', runtimeVersion: 'fake@1', modelProvider: 'fake', model: 'fixture', promptVersion: '1', phase: suffix === 'review' ? 'review' : 'extract', status: suffix === 'review' ? 'waiting_review' : 'running', contextManifest: [], metrics: {}, idempotencyKey: 'e2e', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const proposal = { id: 'gprop_01K3DAAAAAAAAAAAAAAAAAAAAA', schemaVersion: 1, workspaceId, eventId: event.id, mindmapId: event.mindmapId, agentRunId: run.id, baseRevision: 'e2e', status: 'pending', summary: 'Resume me', riskLevel: 'low', createdAt: new Date().toISOString(), operations: [{ changeId: 'chg_resume', op: 'add_node', tempId: 'temp', parentId: event.rootNodeId, node: { kind: 'branch', text: 'Recovered proposal' }, domainDraft: { entity: 'none' }, evidenceIds: [], confidence: 0.9, reason: 'Resume' }] };
  return { event, run, proposal };
}
