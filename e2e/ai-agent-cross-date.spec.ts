/**
 * §AI — Cross-date task operations via the AI agent.
 *
 * Real browser, real backend, stubbed LLM. These scenarios exercise the
 * fallback path in `aiToolExecutor.ts` that hits the server's
 * `/api/tasks/search` endpoint: today's visible projection only contains
 * tasks scheduled for today, so when the model references a task written
 * days/weeks ago the executor must consult the cross-date index.
 *
 * Each scenario:
 *   1. Spins up its own OpenAI-compatible stub on a free port.
 *   2. Seeds localStorage.df_model_center so the app boots with the stub
 *      as the chat provider.
 *   3. Bootstraps a unique workspace via POST /api/config/workspaces.
 *   4. Pre-seeds tasks on multiple daily notes (today, today-15, today-30)
 *      via POST /api/tasks so the cross-date search index has entries to
 *      surface.
 *   5. Drives the AI chat overlay and verifies both UI (action cards)
 *      and backend state (real CRUD persisted to the file-backed daily
 *      notes).
 */
import { test, expect, request, type Page, type APIRequestContext } from '@playwright/test';
import { startAiStub, providerConfigSeed, type AiStub } from './helpers/aiAgentStub';

const FRONTEND_BASE = `http://127.0.0.1:${process.env.DAILYFLOW_E2E_WEB_PORT ?? 47831}`;

/** Local-date helpers — must match what the frontend's `getTodayStr()` produces. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function offsetDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Bootstrapped {
  api: APIRequestContext;
  workspaceId: string;
  workspacePath: string;
}

/**
 * Each scenario gets its own workspace under the e2e root so parallel
 * runs (or back-to-back runs) cannot collide. The unique name doubles as
 * the `df_landing_tab` discriminator so the first-run flow does not
 * hijack us.
 */
async function bootstrapWorkspace(name: string): Promise<Bootstrapped> {
  const path = `${process.env.DAILYFLOW_E2E_ROOT}/ai-cross-date-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const api = await request.newContext({ baseURL: FRONTEND_BASE });
  const createRes = await api.post('/api/config/workspaces', { data: { name, path } });
  expect(createRes.ok(), `create workspace ${name}`).toBeTruthy();
  const workspaceId = (await createRes.json()).workspace.id;
  const activate = await api.post(`/api/config/workspaces/${workspaceId}/activate`);
  expect(activate.ok(), `activate ${name}`).toBeTruthy();
  return { api, workspaceId, workspacePath: path };
}

/**
 * Pre-seed a task on a given daily note. Returns the task id (the backend
 * generates ids from the marker so we read them back from the response).
 */
async function seedTask(
  api: APIRequestContext,
  date: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await api.post('/api/tasks', {
    data: { date, task: { title, status: 'todo', ...extra } },
  });
  expect(res.ok(), `seed task ${title} on ${date}: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const id = body.task?.id ?? body.id ?? body.taskId;
  return String(id);
}

/** Inject the stub provider into localStorage before the React app boots. */
async function installStubProvider(page: Page, stub: AiStub): Promise<void> {
  await page.addInitScript((seed) => {
    window.localStorage.setItem('df_model_center', seed);
  }, providerConfigSeed(stub.url));
}

async function openAiChat(page: Page): Promise<void> {
  // The seeded workspace is already active so the first-run flow is
  // bypassed and we land directly on the Today tab.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('nav-ai-chat').click();
  await expect(page.getByTestId('full-ai-chat')).toBeVisible();
  await expect(page.getByTestId('chat-message-scroll-region')).toBeVisible();
}

/** Send a message and click the send button. The two-round protocol then runs. */
async function sendAndWait(page: Page, message: string): Promise<void> {
  const textarea = page.locator('[data-testid="full-ai-chat"] textarea');
  await textarea.fill(message);
  await page.locator('[aria-label="Send message"], [aria-label="发送消息"]').click();
}

async function waitForCardCount(page: Page, n: number, timeout = 10_000): Promise<void> {
  await expect(page.locator('[data-testid="ai-tool-cards"]')).toBeVisible({ timeout });
  await expect
    .poll(
      async () =>
        page.locator('[data-testid^="ai-tool-card-"]:not([data-testid="ai-tool-cards"])').count(),
      { timeout, message: `expect ${n} action card(s)` },
    )
    .toBe(n);
}

async function waitForStreamingToStop(page: Page, timeout = 10_000): Promise<void> {
  // The send button shows a stop icon while streaming and a send icon when
  // idle; polling for the send-button visibility is the cheapest signal.
  await expect
    .poll(
      async () => {
        const sendBtn = page.locator('[aria-label="Send message"], [aria-label="发送消息"]');
        const stopBtn = page.locator('[aria-label="Stop"], [aria-label="停止"]');
        return (await sendBtn.count()) > 0 && (await stopBtn.count()) === 0;
      },
      { timeout, message: 'streaming should stop' },
    )
    .toBe(true);
}

test.describe('AI agent — cross-date task operations', () => {
  let stub: AiStub;

  test.afterEach(async () => {
    if (stub) await stub.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario A: search_tasks surfaces tasks from today, today-15, today-30.
  // Today's visible projection only sees today's task, so the executor
  // must consult `/api/tasks/search` and find all three.
  // ──────────────────────────────────────────────────────────────────────
  test('A — search_tasks falls back to cross-date search and lists tasks from multiple dates', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const TODAY = todayStr();
    const D_MINUS_15 = offsetDate(-15);
    const D_MINUS_30 = offsetDate(-30);
    const MARKER = `unique-marker-xyz-${Date.now()}`;

    const { api } = await bootstrapWorkspace('cross-date-search');

    // Pre-seed one task per date, all sharing the unique marker so the
    // stub's single search query hits all three.
    await seedTask(api, D_MINUS_30, `${MARKER} archive`, { tags: ['work'] });
    await seedTask(api, D_MINUS_15, `${MARKER} mid`, { priority: 'medium' });
    await seedTask(api, TODAY, `${MARKER} fresh`, { priority: 'high' });

    stub.respond([
      // Round 1: a single search call. The executor returns matches with
      // their `source_date` so the assistant can list them.
      { toolCalls: [{ name: 'search_tasks', arguments: { query: MARKER } }] },
      { summary: `Found 3 tasks matching "${MARKER}" across your history.` },
    ]);

    await openAiChat(page);
    await sendAndWait(page, `Find any tasks with marker ${MARKER}`);

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    // The action card must show all three tasks with their respective
    // dates — that's the cross-date fallback contract.
    const card = page.locator('[data-testid="ai-tool-card-search_tasks"]');
    await expect(card).toBeVisible();
    const cardText = await card.innerText();
    expect(cardText).toContain(D_MINUS_30);
    expect(cardText).toContain(D_MINUS_15);
    expect(cardText).toContain(TODAY);
    expect(cardText).toMatch(/3/);

    // Both rounds fired and the search call really hit the backend.
    expect(stub.consumed()).toBe(2);

    await api.dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario B: complete_task by id — the id was discovered via cross-date
  // search, so the executor's resolveTask path must locate it on the
  // remote date and PATCH /api/tasks/:taskId with the correct host date.
  // ──────────────────────────────────────────────────────────────────────
  test('B — complete_task with an id from another date marks the task done on disk', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const TODAY = todayStr();
    const D_MINUS_15 = offsetDate(-15);
    const MARKER = `cross-date-complete-${Date.now()}`;

    const { api } = await bootstrapWorkspace('cross-date-complete');

    // Seed: today gets a distractor (visible projection can see it), the
    // "real" target is 15 days back and is only visible via search.
    await seedTask(api, D_MINUS_15, `${MARKER} archive work`, { tags: ['work'] });
    const distractorId = await seedTask(api, TODAY, `distractor-${Date.now()}`, {});

    // Round 1: search to demonstrate the cross-date path and to surface
    // the remote id the assistant would otherwise have to dig up.
    stub.respond([
      { toolCalls: [{ name: 'search_tasks', arguments: { query: MARKER } }] },
      { summary: `I see "${MARKER} archive work" and a distractor on today; which one?` },
    ]);

    await openAiChat(page);
    await sendAndWait(page, `Find anything matching ${MARKER}`);
    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    // Pull the older task's id straight from the cross-date index so we
    // can construct the round-2 tool call with the right value (this
    // mirrors what the model would have seen via round-1's tool_result).
    const searchRes = await api.get(`/api/tasks/search?q=${encodeURIComponent(MARKER)}`);
    expect(searchRes.ok()).toBeTruthy();
    const hits = (await searchRes.json()).tasks as Array<{ id: string; source_date: string; title: string }>;
    const target = hits.find((h) => h.source_date === D_MINUS_15 && h.title.includes(MARKER));
    expect(target, 'cross-date index exposes the older task').toBeTruthy();
    const remoteId = target!.id;

    // Round 2: complete the task by its remote id. The executor's
    // resolveTask must consult the cross-date search (local pool only
    // contains today's distractor) and PATCH the right host date.
    stub.enqueue([
      { toolCalls: [{ name: 'complete_task', arguments: { task_id: remoteId } }] },
      { summary: 'Marked done.' },
    ]);
    await sendAndWait(page, 'Mark the one from 15 days ago as done');
    await waitForCardCount(page, 2);
    await waitForStreamingToStop(page);

    await expect(page.locator('[data-testid="ai-tool-card-complete_task"]')).toBeVisible();

    // Backend must now reflect the completion on the correct date.
    const check = await api.get(`/api/tasks/search?id=${encodeURIComponent(remoteId)}`);
    expect(check.ok()).toBeTruthy();
    const after = (await check.json()).tasks as Array<{ id: string; status: string }>;
    expect(after[0]?.status).toBe('done');

    // The distractor on today must remain untouched.
    const todayList = await api.get(`/api/tasks/${TODAY}`);
    const todayTasks = (await todayList.json()).tasks as Array<{ id: string; status: string }>;
    const d = todayTasks.find((t) => t.id === distractorId);
    expect(d?.status).toBe('todo');

    await api.dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario C: complete_task with an ambiguous title_query that matches
  // multiple cross-date entries. The executor's `match()` function must
  // return `ambiguous` with all candidates, and the card must show them
  // without mutating any task.
  // ──────────────────────────────────────────────────────────────────────
  test('C — complete_task with ambiguous title_query surfaces candidates and completes none', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const TODAY = todayStr();
    const D_MINUS_15 = offsetDate(-15);
    const D_MINUS_30 = offsetDate(-30);
    const SHARED_TITLE = `cross-date-ambiguous-${Date.now()}`;

    const { api } = await bootstrapWorkspace('cross-date-ambiguous');

    // Three tasks with the same title on three different dates. Only
    // one is on today's note, so the executor must consult the
    // cross-date search to even see all three — which is exactly the
    // path we want to verify.
    await seedTask(api, D_MINUS_30, SHARED_TITLE);
    await seedTask(api, D_MINUS_15, SHARED_TITLE);
    await seedTask(api, TODAY, SHARED_TITLE);

    // Capture pre-state ids so we can verify nothing changed.
    const preRes = await api.get(`/api/tasks/search?q=${encodeURIComponent(SHARED_TITLE)}`);
    const preIds = ((await preRes.json()).tasks as Array<{ id: string; status: string }>)
      .map((t) => t.id);

    stub.respond([
      { toolCalls: [{ name: 'complete_task', arguments: { title_query: SHARED_TITLE } }] },
      { summary: `Three tasks share the title "${SHARED_TITLE}" — please pick one.` },
    ]);

    await openAiChat(page);
    await sendAndWait(page, `Mark ${SHARED_TITLE} as done`);
    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    const card = page.locator('[data-testid="ai-tool-card-complete_task"]');
    await expect(card).toBeVisible();

    // Failure contract: the executor reports ambiguity with the
    // candidate list, so the card must read as a non-success and list
    // all three dates (the same fallback path as the search).
    const cardText = await card.innerText();
    expect(cardText).toMatch(/ambiguous|候选|match/i);
    expect(cardText).toContain(D_MINUS_30);
    expect(cardText).toContain(D_MINUS_15);
    expect(cardText).toContain(TODAY);

    // Every pre-existing task must still be `todo` — ambiguity must
    // never resolve to a guess.
    const postRes = await api.get(`/api/tasks/search?q=${encodeURIComponent(SHARED_TITLE)}`);
    const postIds = ((await postRes.json()).tasks as Array<{ id: string; status: string }>)
      .map((t) => t.id);
    expect(postIds.sort()).toEqual(preIds.sort());
    for (const id of preIds) {
      const after = await api.get(`/api/tasks/search?id=${encodeURIComponent(id)}`);
      const rows = (await after.json()).tasks as Array<{ id: string; status: string }>;
      expect(rows[0]?.status).toBe('todo');
    }

    await api.dispose();
  });
});