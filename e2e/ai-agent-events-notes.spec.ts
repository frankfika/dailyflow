/**
 * §AI — Events + Notes CRUD via the AI agent.
 *
 * Mirrors ai-agent-tasks.spec.ts but covers the events / topic-space and
 * notes surfaces. Real browser + real backend + stubbed LLM.
 *
 * Each scenario:
 *   1. Spins up its own OpenAI-compatible stub on a free port.
 *   2. Seeds localStorage.df_model_center so the app boots with the stub
 *      as the chat provider.
 *   3. Bootstraps a unique workspace via POST /api/config/workspaces.
 *   4. Drives the AI chat overlay and verifies both UI (action cards
 *      render with success / failure state) and backend state (real CRUD
 *      persisted to the file-backed workspace).
 */
import { test, expect, request, type Page, type APIRequestContext } from '@playwright/test';
import { startAiStub, providerConfigSeed, type AiStub } from './helpers/aiAgentStub';

const FRONTEND_BASE = `http://127.0.0.1:${process.env.DAILYFLOW_E2E_WEB_PORT ?? 47831}`;
const TODAY = new Date().toISOString().slice(0, 10);

async function bootstrapWorkspace(name: string) {
  // Unique workspace name + Date.now() suffix to keep parallel runs
  // (and back-to-back runs) from colliding. The frontend's activeContext
  // defaults to "work" so the seeded events/notes live in that scope.
  const path = `${process.env.DAILYFLOW_E2E_ROOT}/ai-events-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const api = await request.newContext({ baseURL: FRONTEND_BASE });
  const createRes = await api.post('/api/config/workspaces', { data: { name, path } });
  expect(createRes.ok(), `create workspace ${name}`).toBeTruthy();
  const workspaceId = (await createRes.json()).workspace.id;
  const activate = await api.post(`/api/config/workspaces/${workspaceId}/activate`);
  expect(activate.ok()).toBeTruthy();
  return { api, workspaceId };
}

/** Pre-seed an event via the real backend so the AI has a real target. */
async function seedEvent(api: APIRequestContext, title: string): Promise<{ id: string; mindmapId: string; title: string }> {
  const res = await api.post('/api/events', { data: { title, context: 'work' } });
  expect(res.ok(), `seed event ${title}`).toBeTruthy();
  const event = await res.json();
  return { id: event.id, mindmapId: event.mindmapId ?? event.id, title };
}

/** Pre-seed a note via the real backend so search_notes has data to find. */
async function seedNote(api: APIRequestContext, title: string, body: string, context: 'work' | 'life' = 'work'): Promise<string> {
  const res = await api.post('/api/notes', {
    data: { title, body, type: 'note', date: TODAY, context, tags: [] },
  });
  expect(res.ok(), `seed note ${title}`).toBeTruthy();
  const note = await res.json();
  return String(note.id);
}

/** Inject the stub provider into localStorage before the React app boots. */
async function installStubProvider(page: Page, stub: AiStub) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem('df_model_center', seed);
  }, providerConfigSeed(stub.url));
}

async function openAiChat(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('nav-ai-chat').click();
  await expect(page.getByTestId('full-ai-chat')).toBeVisible();
  await expect(page.getByTestId('chat-message-scroll-region')).toBeVisible();
}

/** Click "New Chat" between scenarios so messages don't accumulate. */
async function startNewChat(page: Page) {
  // The "New Chat" button has either the English or Chinese label.
  const btn = page.locator('[data-testid="full-ai-chat"]').getByRole('button', { name: /New Chat|新对话/ });
  await btn.click();
}

/** Send a message and click the send button. The two-round protocol then runs. */
async function sendAndWait(page: Page, message: string) {
  const textarea = page.locator('[data-testid="full-ai-chat"] textarea');
  await textarea.fill(message);
  await page.locator('[aria-label="Send message"], [aria-label="发送消息"]').click();
}

async function waitForCardCount(page: Page, n: number, timeout = 10_000) {
  await expect(page.locator('[data-testid="ai-tool-cards"]')).toBeVisible({ timeout });
  await expect
    .poll(
      async () =>
        page.locator('[data-testid^="ai-tool-card-"]:not([data-testid="ai-tool-cards"])').count(),
      { timeout, message: `expect ${n} action card(s)` },
    )
    .toBe(n);
}

async function waitForStreamingToStop(page: Page, timeout = 10_000) {
  // The send button shows a stop icon while streaming and a send icon when
  // idle; polling for the send-button visibility is the cheapest signal.
  await expect
    .poll(
      async () => {
        const sendBtn = page.locator('[aria-label="Send message"], [aria-label="发送消息"]');
        const stopBtn = page.locator('[aria-label="Stop generating"], [aria-label="停止生成"]');
        return (await sendBtn.count()) > 0 && (await stopBtn.count()) === 0;
      },
      { timeout, message: 'streaming should stop' },
    )
    .toBe(true);
}

test.describe('AI agent — events + notes CRUD', () => {
  let stub: AiStub;

  test.afterEach(async () => {
    if (stub) await stub.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 1: create_event — emits a tool call that creates an event,
  // then a grounded reply. Backend /api/events must contain the new event.
  // ──────────────────────────────────────────────────────────────────────
  test('1 — create_event: new event surfaces in /api/events list', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const title = 'AI: Launch v3';
    stub.respond([
      { toolCalls: [{ name: 'create_event', arguments: { title } }] },
      { summary: `Created event ${title}.` },
    ]);

    const { api } = await bootstrapWorkspace('agent-create-event');
    await openAiChat(page);
    await sendAndWait(page, `Create an event titled "${title}"`);

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);
    await expect(page.locator('[data-testid="ai-tool-card-create_event"]')).toBeVisible();
    await expect(page.locator(`text=Created event ${title}.`)).toBeVisible();

    // Both rounds fired.
    expect(stub.consumed()).toBe(2);

    // Backend now lists the new event.
    const listRes = await api.get('/api/events');
    expect(listRes.ok()).toBeTruthy();
    const listJson = await listRes.json();
    // The server returns either an array or { events: [...] } — be defensive.
    const events: Array<{ title: string }> = Array.isArray(listJson)
      ? listJson
      : (listJson.events ?? []);
    expect(events.some((e) => e.title === title), `event "${title}" present in /api/events`).toBe(true);

    await api.dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 2: add_task_to_event — append a node task to an existing event
  // and verify it lands on today's items + the event detail carries the node.
  // ──────────────────────────────────────────────────────────────────────
  test('2 — add_task_to_event: node task lands on today via the canvas route', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api } = await bootstrapWorkspace('agent-event-task');
    // Pre-create the event so the executor's title resolver finds it.
    const ev = await seedEvent(api, 'AI: Launch v3');

    stub.respond([
      {
        toolCalls: [{
          name: 'add_task_to_event',
          arguments: { event_title: 'AI: Launch v3', title: 'Draft press release', date: TODAY },
        }],
      },
      { summary: 'Added "Draft press release" to "AI: Launch v3".' },
    ]);

    await openAiChat(page);
    await startNewChat(page);
    await sendAndWait(page, 'Add "Draft press release" to the Launch v3 event');

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);
    await expect(page.locator('[data-testid="ai-tool-card-add_task_to_event"]')).toBeVisible();

    // Backend event detail must show the new node.
    const detailRes = await api.get(`/api/events/${encodeURIComponent(ev.id)}`);
    expect(detailRes.ok(), 'GET /api/events/{id}').toBeTruthy();
    const detail = await detailRes.json();
    const detailEvent = detail.event ?? detail;
    const nodes: Array<{ text: string }> = detailEvent?.nodes ?? [];
    expect(
      nodes.some((n) => (n.text ?? '').toLowerCase().includes('draft press release')),
      'event detail contains the new node',
    ).toBe(true);

    // today-items must include the task scheduled for TODAY.
    const todayRes = await api.get(`/api/events/today-items?date=${TODAY}`);
    expect(todayRes.ok()).toBeTruthy();
    const todayJson = await todayRes.json();
    const items: Array<{ title: string; eventTitle?: string }> = todayJson.items ?? todayJson;
    const found = items.find((it) => (it.title ?? '').toLowerCase().includes('draft press release'));
    expect(found, 'today-items contains the event-node task').toBeTruthy();

    await api.dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 3: update_event — rename an existing event in place.
  // ──────────────────────────────────────────────────────────────────────
  test('3 — update_event: rename persists', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api } = await bootstrapWorkspace('agent-rename-event');
    await seedEvent(api, 'AI: Old name');

    stub.respond([
      {
        toolCalls: [{
          name: 'update_event',
          arguments: { title_query: 'AI: Old name', new_title: 'AI: New name' },
        }],
      },
      { summary: 'Renamed to "AI: New name".' },
    ]);

    await openAiChat(page);
    await startNewChat(page);
    await sendAndWait(page, 'Rename "AI: Old name" to "AI: New name"');

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);
    await expect(page.locator('[data-testid="ai-tool-card-update_event"]')).toBeVisible();

    const listRes = await api.get('/api/events');
    const listJson = await listRes.json();
    const events: Array<{ title: string }> = Array.isArray(listJson) ? listJson : (listJson.events ?? []);
    expect(events.some((e) => e.title === 'AI: New name')).toBe(true);
    expect(events.some((e) => e.title === 'AI: Old name')).toBe(false);

    await api.dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 4: delete_event confirm gating — first call without confirm
  // must refuse (event still present), second call with confirm:true deletes.
  // ──────────────────────────────────────────────────────────────────────
  test('4 — delete_event confirm gating: no confirm => no delete', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api } = await bootstrapWorkspace('agent-delete-event');
    await seedEvent(api, 'AI: Doomed');

    // Round 1: missing confirm — executor must refuse.
    stub.respond([
      { toolCalls: [{ name: 'delete_event', arguments: { title_query: 'AI: Doomed' } }] },
      { summary: 'I will not delete without your explicit confirmation.' },
    ]);

    await openAiChat(page);
    await startNewChat(page);
    await sendAndWait(page, 'Delete the doomed event');

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    const failCard = page.locator('[data-testid="ai-tool-card-delete_event"]');
    await expect(failCard).toBeVisible();
    await expect(failCard).toContainText(/confirm/i);
    await expect(failCard).toHaveAttribute('class', /amber-/);

    // Event still on disk.
    const after1 = await api.get('/api/events');
    const ev1 = await after1.json();
    const events1: Array<{ title: string }> = Array.isArray(ev1) ? ev1 : (ev1.events ?? []);
    expect(events1.some((e) => e.title === 'AI: Doomed'), 'event still present after refused delete').toBe(true);

    // Round 2: explicit confirm.
    stub.enqueue([
      { toolCalls: [{ name: 'delete_event', arguments: { title_query: 'AI: Doomed', confirm: true } }] },
      { summary: 'Deleted the doomed event.' },
    ]);
    await sendAndWait(page, 'Yes, delete it');

    await waitForCardCount(page, 2);
    await waitForStreamingToStop(page);

    const after2 = await api.get('/api/events');
    const ev2 = await after2.json();
    const events2: Array<{ title: string }> = Array.isArray(ev2) ? ev2 : (ev2.events ?? []);
    expect(events2.some((e) => e.title === 'AI: Doomed'), 'event removed after confirmed delete').toBe(false);

    await api.dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 5: create_note — emits a tool call that creates a note, then
  // a grounded reply. Backend /api/notes must contain the new note.
  // ──────────────────────────────────────────────────────────────────────
  test('5 — create_note: note persists and is retrievable', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const title = 'AI: Weekly plan';
    // The body is passed as a single string with a literal "\n" sequence
    // (matching the spec). JSON.stringify + JSON.parse will round-trip it
    // verbatim — the note body written to disk matches what the model
    // emitted.
    const body = '# Plan\\n- Ship';

    stub.respond([
      { toolCalls: [{ name: 'create_note', arguments: { title, body, type: 'note' } }] },
      { summary: `Saved note "${title}".` },
    ]);

    const { api } = await bootstrapWorkspace('agent-create-note');
    await openAiChat(page);
    await startNewChat(page);
    await sendAndWait(page, `Save a note titled "${title}"`);

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);
    await expect(page.locator('[data-testid="ai-tool-card-create_note"]')).toBeVisible();

    // List notes for today's window — the new note must appear with the
    // expected title and body.
    const listRes = await api.get(`/api/notes?startDate=${TODAY}&endDate=${TODAY}`);
    expect(listRes.ok()).toBeTruthy();
    const notes = (await listRes.json()) as Array<{ id: string; title: string; body: string }>;
    const created = notes.find((n) => n.title === title);
    expect(created, `note "${title}" present in /api/notes`).toBeTruthy();
    // The executor passes the body argument through verbatim; the literal
    // "\\n" survives JSON round-trip as the two-character sequence "\n".
    expect(created!.body).toBe('# Plan\\n- Ship');

    // Also confirm GET /api/notes/:id returns the note.
    const single = await api.get(`/api/notes/${encodeURIComponent(created!.id)}`);
    expect(single.ok()).toBeTruthy();
    const fetched = await single.json();
    expect(fetched.title).toBe(title);

    await api.dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 6: search_notes — pre-seeded note surfaces in the result card.
  // ──────────────────────────────────────────────────────────────────────
  test('6 — search_notes: pre-seeded note surfaces in the result card', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api } = await bootstrapWorkspace('agent-search-note');
    await seedNote(api, 'AI: Roadmap', 'Q3 plans', 'work');

    stub.respond([
      { toolCalls: [{ name: 'search_notes', arguments: { query: 'Roadmap' } }] },
      { summary: 'Found your AI: Roadmap note.' },
    ]);

    await openAiChat(page);
    await startNewChat(page);
    await sendAndWait(page, 'Find my Roadmap note');

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    const card = page.locator('[data-testid="ai-tool-card-search_notes"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('AI: Roadmap');

    await api.dispose();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 7: delete_note confirm gating — first call without confirm
  // must refuse (note still present), second call with confirm:true deletes
  // and GET /api/notes/:id returns 404.
  // ──────────────────────────────────────────────────────────────────────
  test('7 — delete_note confirm gating: no confirm => no delete', async ({ page }) => {
    stub = await startAiStub();
    await installStubProvider(page, stub);

    const { api } = await bootstrapWorkspace('agent-delete-note');
    const noteId = await seedNote(api, 'AI: Doomed note', 'Body text', 'work');

    // Round 1: missing confirm — executor must refuse.
    stub.respond([
      { toolCalls: [{ name: 'delete_note', arguments: { note_id: noteId } }] },
      { summary: 'I will not delete without your explicit confirmation.' },
    ]);

    await openAiChat(page);
    await startNewChat(page);
    await sendAndWait(page, 'Delete the doomed note');

    await waitForCardCount(page, 1);
    await waitForStreamingToStop(page);

    const failCard = page.locator('[data-testid="ai-tool-card-delete_note"]');
    await expect(failCard).toBeVisible();
    await expect(failCard).toContainText(/confirm/i);

    // Note still exists.
    const after1 = await api.get(`/api/notes/${encodeURIComponent(noteId)}`);
    expect(after1.ok(), 'note still present after refused delete').toBeTruthy();

    // Round 2: explicit confirm.
    stub.enqueue([
      { toolCalls: [{ name: 'delete_note', arguments: { note_id: noteId, confirm: true } }] },
      { summary: 'Deleted the note.' },
    ]);
    await sendAndWait(page, 'Yes, delete it');

    await waitForCardCount(page, 2);
    await waitForStreamingToStop(page);

    // After a successful delete, GET /api/notes/:id returns 404.
    const after2 = await api.get(`/api/notes/${encodeURIComponent(noteId)}`);
    expect(after2.status(), 'GET /api/notes/:id after delete').toBe(404);

    // And the note no longer surfaces in the notes list.
    const listRes = await api.get(`/api/notes?startDate=${TODAY}&endDate=${TODAY}`);
    const remaining = (await listRes.json()) as Array<{ id: string }>;
    expect(remaining.some((n) => n.id === noteId)).toBe(false);

    await api.dispose();
  });
});