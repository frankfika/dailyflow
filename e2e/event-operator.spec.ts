import { expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('Context Preview → proposal overlay → partial review → one apply → Today', async ({ page, request }) => {
  const workspace = mkdtempSync(join(tmpdir(), 'df-event-operator-e2e-'));
  await request.post('/api/config', { data: { workspaceRoot: workspace, activeWorkspaceId: 'event-operator-e2e', workspaces: [{ id: 'event-operator-e2e', name: 'Operator', path: workspace, createdAt: new Date().toISOString() }], language: 'en', v2: { enabled: true, eventFirst: true } } });
  const event = await (await request.post('/api/events', { data: { title: 'Ship operator', context: 'work' } })).json();
  const run = fakeRun(event.id, event.mindmapId, 'waiting_review', 'review');
  const proposal = fakeProposal(event.id, event.mindmapId, run.id, event.rootNodeId);
  let applyCalls = 0;

  await page.route('**/api/v2/agent-runtime/health', route => route.fulfill({ json: { runtime: 'fake-e2e', health: { ready: true, modelConfigured: true, toolkitSafe: true, runtimeVersion: 'fake@1' } } }));
  await page.route(`**/api/v2/events/${event.id}/agent-runs`, async route => route.request().method() === 'POST'
    ? route.fulfill({ json: { run, proposal, events: [], mode: 'waiting_review' } })
    : route.fulfill({ json: { items: [] } }));
  await page.route(`**/api/v2/events/${event.id}/graph-proposals/pending`, route => route.fulfill({ json: { proposal: null } }));
  await page.route(`**/api/v2/events/${event.id}/graph-proposals/${proposal.id}/apply`, async route => {
    applyCalls += 1;
    const body = route.request().postDataJSON();
    expect(body.selection).toEqual(['chg_low']);
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({ json: { proposal: { ...proposal, status: 'partially_accepted', acceptedChangeIds: body.selection }, createdCommitments: 1, appliedChanges: body.selection, staleChangeIds: [], affectedSurfaces: ['events', 'today', 'proposals'] } });
  });
  await page.route('**/api/events/today-items?**', route => route.fulfill({ json: { items: [{ kind: 'event-node', id: 'today-ai', eventId: event.id, mindmapId: event.mindmapId, nodeId: 'node-ai', taskId: 'task-ai', title: 'Publish release note', status: 'todo', scheduledDate: new Date().toISOString().slice(0, 10), eventTitle: event.title, path: [], effectiveTags: [] }] } }));

  await page.goto('/');
  await page.getByTestId('nav-events').click();
  await page.getByTestId(`event-card-${event.id}`).click();
  await page.getByTestId('event-agent-run-open').click();
  await expect(page.getByTestId('event-operator-context-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm & start' }).click();
  await expect(page.getByTestId('agent-run-panel')).toBeVisible();
  await expect(page.getByText('Collect', { exact: true })).toBeVisible();
  await expect(page.getByTestId('proposal-node-chg_low')).toBeVisible();
  await page.getByTestId('agent-accept-low-risk').click();
  await expect(page.getByTestId('agent-run-apply')).toContainText('(1)');
  await page.getByTestId('agent-run-apply').dblclick();
  await expect.poll(() => applyCalls).toBe(1);
  await page.getByTestId('nav-today').click();
  await expect(page.getByText('Publish release note', { exact: true })).toBeVisible();
});

function fakeRun(eventId: string, mindmapId: string, status: string, phase: string) { return { id: 'eval_01K3AAAAAAAAAAAAAAAAAAAAAA', schemaVersion: 2, workspaceId: 'event-operator-e2e', eventId, mindmapId, runtimeId: 'deepseek-harness', runtimeVersion: 'fake@1', modelProvider: 'fake', model: 'fixture', promptVersion: '1', phase, status, contextManifest: [], metrics: { toolCalls: 2 }, idempotencyKey: 'e2e', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }
function fakeProposal(eventId: string, mindmapId: string, runId: string, rootId: string) { return { id: 'gprop_01K3AAAAAAAAAAAAAAAAAAAAA', schemaVersion: 1, workspaceId: 'event-operator-e2e', eventId, mindmapId, agentRunId: runId, baseRevision: 'e2e', status: 'pending', summary: 'Two next steps', riskLevel: 'low', createdAt: new Date().toISOString(), operations: [{ changeId: 'chg_low', op: 'add_node', tempId: 'temp-low', parentId: rootId, node: { kind: 'task', text: 'Publish release note' }, domainDraft: { entity: 'commitment', title: 'Publish release note', state: 'active' }, evidenceIds: [], confidence: 0.91, reason: 'Concrete next step' }, { changeId: 'chg_high', op: 'move_node', nodeId: rootId, newParentId: rootId, confidence: 0.55, reason: 'Needs individual review' }] }; }
