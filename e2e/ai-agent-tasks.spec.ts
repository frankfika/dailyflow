/**
 * §AI — Tasks CRUD via the AI agent.
 *
 * Real browser, real backend, stubbed LLM. The AI flow is:
 *   user types → POST /api/ai/summarize → backend proxies to a stub
 *   OpenAI-compatible /v1/chat/completions → model returns prose +
 *   <tool_call> blocks → frontend parses + executes against real APIs.
 *
 * Each scenario sets up its own stub + provider config + workspace and
 * verifies both UI (action cards render) and backend state (real CRUD
 * mutations hit the file-backed workspace).
 */
import { test, expect, request, type Page, type APIRequestContext } from '@playwright/test';
import { startAiStub, providerConfigSeed, type AiStub } from './helpers/aiAgentStub';

const FRONTEND_BASE = `http://127.0.0.1:${process.env.DAILYFLOW_E2E_WEB_PORT ?? 47831}`;
const TODAY = new Date().toISOString().slice(0, 10);

interface Bootstrapped {
  api: APIRequestContext;
  workspaceId: string;
  workspacePath: string;
}

async function bootstrapWorkspace(name: string): Promise<Bootstrapped> {
  const path = `${process.env.DAILYFLOW_E2E_ROOT}/ai-tasks-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const api = await request.newContext({ baseURL: FRONTEND_BASE });
  const createRes = await api.post('/api/config/workspaces', {
    data: { name, path },
  });
  if (!createRes.ok()) {
    const body = await createRes.text();
    throw new Error(`create workspace ${name} returned ${createRes.status()}: ${body}`);
  }
  const workspaceId = (await createRes.json()).workspace.id;
  const activate = await api.post(`/api/config/workspaces/${workspaceId}/activate`);
  if (!activate.ok()) {
    throw new Error(`activate ${name} returned ${activate.status()}`);
  }
  return { api, workspaceId, workspacePath: path };
}

async function seedTask(api: APIRequestContext, date: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await api.post('/api/tasks', {
    data: { date, task: { title, status: 'todo', ...extra } },
  });
  expect(res.ok(), `seed task ${title}`).toBeTruthy();
  const body = await res.json();
  // POST returns either {task:{id}} or the task itself — be defensive.
  const id = body.task?.id ?? body.id ?? body.taskId;
  return String(id);
}

/** Inject the stub provider into localStorage before the app boots. */
async function installStubProvider(page: Page, stub: AiStub) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem('df_model_center', seed);
  }, providerConfigSeed(stub.url));
}

async function openAiChat(page: Page) {
  // The seeded workspace is already active (first-run flow is bypassed).
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('nav-ai-chat').click();
  await expect(page.getByTestId('full-ai-chat')).toBeVisible();
  await expect(page.getByTestId('chat-message-scroll-region')).toBeVisible();
}

/** Send a message and wait for both rounds of the agent to settle. */
async function sendAndWait(page: Page, message: string) {
  const textarea = page.locator('[data-testid="full-ai-chat"] textarea');
  await textarea.fill(message);
  await page.locator('[aria-label="Send message"], [aria-label="发送消息"]').click();
}

async function waitForCardCount(page: Page, n: number, timeout = 8000) {
  await expect(page.locator('[data-testid="ai-tool-cards"]')).toBeVisible({ timeout });
  await expect
    .poll(async () =>
      page.locator('[data-testid^="ai-tool-card-"]:not([data-testid="ai-tool-cards"])').count(),
      { timeout, message: `expect ${n} action card(s)` },
    )
    .toBe(n);
}

async function waitForStreamingToStop(page: Page, timeout = 8000) {
  // The send button shows a stop icon while streaming and a send icon when
  // idle. We can also poll for the absence of the streaming loader.
  await expect
    .poll(async () => {
      const sendBtn = page.locator('[aria-label="Send message"], [aria-label="发送消息"]');
      const stopBtn = page.locator('[aria-label="Stop"], [aria-label="停止"]');
      return (await sendBtn.count()) > 0 && (await stopBtn.count()) === 0;
    }, { timeout, message: 'streaming should stop' })
    .toBe(true);
}

test.describe('AI agent — tasks CRUD', () => {
  let stub: AiStub;

  test.afterEach(async () => {
    if (stub) await stub.close();
  });

  test('list_today_tasks — empty today returns success card + plain reply', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);
    stub.respond([
      { toolCalls: [{ name: 'list_today_tasks', arguments: {} }] },
      { summary: 'Today is empty — nothing on your plate.' },
    ]);

    const { api } = await bootstrapWorkspace('agent-list-empty');
    await openAiChat(page);
    await sendAndWait(page, 'What is on my plate today?');

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    await expect(page.locator('[data-testid="ai-tool-card-list_today_tasks"]')).toBeVisible();
    await expect(page.locator('text=Today is empty')).toBeVisible();

    // Both rounds fired; round 2 must contain the grounded tool_result block.
    expect(stub.consumed()).toBe(2);
    const round2 = stub.lastRequestBody();
    expect(JSON.stringify(round2?.messages ?? [])).toContain('tool_result');

    await api.dispose();
  });

  test('create_task — title lands in the file-backed daily note + UI refreshes', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);
    const title = `AI-task-${Date.now()}`;
    stub.respond([
      { toolCalls: [{ name: 'create_task', arguments: { title, priority: 'high', tags: 'work,deep' } }] },
      { summary: `Created "${title}".` },
    ]);

    const { api } = await bootstrapWorkspace('agent-create');
    await openAiChat(page);
    await sendAndWait(page, `Please add a task called ${title}`);

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    // The card + assistant reply render.
    await expect(page.locator('[data-testid="ai-tool-card-create_task"]')).toBeVisible();
    await expect(page.locator(`text=Created "${title}"`)).toBeVisible();

    // Backend now persists the task on today's daily note.
    const listRes = await api.get(`/api/tasks/${TODAY}`);
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    const found = (list.tasks as Array<{ title: string }>).find((t) => t.title === title);
    expect(found, `task ${title} present in ${TODAY} note`).toBeTruthy();

    await api.dispose();
  });

  test('search_tasks + complete_task — UI refresh after a complete cycle', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api, workspacePath } = await bootstrapWorkspace('agent-search-complete');
    // Pre-seed a task so the search/resolve path has something concrete.
    await seedTask(api, TODAY, 'AI-search-target');

    stub.respond([
      // Round 1: search.
      { toolCalls: [{ name: 'search_tasks', arguments: { query: 'AI-search' } }] },
      { summary: 'Found your AI-search-target.' },
    ]);

    await openAiChat(page);
    await sendAndWait(page, 'Find any task mentioning AI-search');
    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);
    await expect(page.locator('text=AI-search-target').first()).toBeVisible();
    await expect(page.locator('[data-testid="ai-tool-card-search_tasks"]')).toBeVisible();

    // Round 2: complete it by query (model has seen the id in round 1's
    // tool result, but resolving by query exercises the full match path).
    stub.enqueue([
      { toolCalls: [{ name: 'complete_task', arguments: { title_query: 'AI-search-target' } }] },
      { summary: 'Marked it done.' },
    ]);
    await sendAndWait(page, 'Now mark it done');
    await waitForCardCount(page, 2); // both rounds visible
    await waitForStreamingToStop(page);

    // Backend now reflects the completion.
    const afterRes = await api.get(`/api/tasks/${TODAY}`);
    expect(afterRes.ok()).toBeTruthy();
    const after = await afterRes.json();
    const target = (after.tasks as Array<{ title: string; status: string }>).find((t) => t.title === 'AI-search-target');
    expect(target?.status).toBe('done');

    // The workspace path proves the file write actually hit disk.
    expect(workspacePath).toContain('agent-search-complete');

    await api.dispose();
  });

  test('update_task — backend reflects the new title and priority', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api } = await bootstrapWorkspace('agent-update');
    await seedTask(api, TODAY, 'AI-old-title');

    stub.respond([
      { toolCalls: [{ name: 'update_task', arguments: { title_query: 'AI-old-title', new_title: 'AI-new-title', priority: 'medium' } }] },
      { summary: 'Renamed to AI-new-title.' },
    ]);

    await openAiChat(page);
    await sendAndWait(page, 'Rename "AI-old-title" to "AI-new-title" with medium priority');
    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);
    await expect(page.locator('[data-testid="ai-tool-card-update_task"]')).toBeVisible();

    const after = await api.get(`/api/tasks/${TODAY}`);
    const tasks = (await after.json()).tasks as Array<{ title: string; priority?: string }>;
    const renamed = tasks.find((t) => t.title === 'AI-new-title');
    expect(renamed, 'task renamed in daily note').toBeTruthy();
    expect(renamed?.priority).toBe('medium');

    await api.dispose();
  });

  test('delete_task confirm gating — no confirm => no mutation', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api } = await bootstrapWorkspace('agent-delete-gate');
    await seedTask(api, TODAY, 'AI-doomed');

    stub.respond([
      // Round 1: model forgets confirm=true. Should fail safely.
      { toolCalls: [{ name: 'delete_task', arguments: { title_query: 'AI-doomed' } }] },
      { summary: 'Refused to delete without your explicit confirmation.' },
    ]);

    await openAiChat(page);
    await sendAndWait(page, 'Delete the doomed task');
    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    // The card must reflect failure, and the task must still be on disk.
    await expect(page.locator('[data-testid="ai-tool-card-delete_task"]')).toContainText(/confirm/i);
    const afterFirst = await api.get(`/api/tasks/${TODAY}`);
    const tasks1 = (await afterFirst.json()).tasks as Array<{ title: string }>;
    expect(tasks1.some((t) => t.title === 'AI-doomed')).toBe(true);

    // Round 2: explicit confirmation.
    stub.enqueue([
      { toolCalls: [{ name: 'delete_task', arguments: { title_query: 'AI-doomed', confirm: true } }] },
      { summary: 'Deleted.' },
    ]);
    await sendAndWait(page, 'Yes, delete it');
    await waitForCardCount(page, 2);
    await waitForStreamingToStop(page);

    const afterSecond = await api.get(`/api/tasks/${TODAY}`);
    const tasks2 = (await afterSecond.json()).tasks as Array<{ title: string }>;
    expect(tasks2.some((t) => t.title === 'AI-doomed')).toBe(false);

    await api.dispose();
  });

  test('ambiguous title — model returns candidates instead of guessing', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api } = await bootstrapWorkspace('agent-ambiguous');
    await seedTask(api, TODAY, 'AI-Review PR 1');
    await seedTask(api, TODAY, 'AI-Review PR 2');

    stub.respond([
      { toolCalls: [{ name: 'complete_task', arguments: { title_query: 'AI-Review PR' } }] },
      { summary: 'Two tasks matched — please pick one.' },
    ]);

    await openAiChat(page);
    await sendAndWait(page, 'Complete the review PR task');
    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    const card = page.locator('[data-testid="ai-tool-card-complete_task"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText(/ambiguous|候选|match/i);

    // Neither task should have been completed (no guessing).
    const after = await api.get(`/api/tasks/${TODAY}`);
    const tasks = (await after.json()).tasks as Array<{ title: string; status: string }>;
    expect(tasks.find((t) => t.title === 'AI-Review PR 1')?.status).toBe('todo');
    expect(tasks.find((t) => t.title === 'AI-Review PR 2')?.status).toBe('todo');

    await api.dispose();
  });
});