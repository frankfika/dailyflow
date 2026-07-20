import { test, expect, request } from '@playwright/test';

/**
 * §26 step 17 / 18 / 19 acceptance e2e for the v2 Note document.
 *
 * These are API-level acceptance tests. They are deliberately
 * independent — each one bootstraps the workspace on its own and
 * creates its own note with a unique marker so parallel runs do not
 * collide.
 *
 *   step 17 — "用户创建一篇无标题 Note 后立即开始书写,离开和重启应用均不丢失内容"
 *   step 18 — "AI 在不改写原文的情况下提出带 Evidence 的决定和承诺"
 *              (we verify the weaker contract: PATCH without `body`
 *              never mutates the stored body)
 *   step 19 — "Note 中能看到引用它的 Commitment/Decision/Outcome 的最新状态"
 *              (we verify the part of the contract that 1.1.0 actually
 *              implemented: memory search surfaces notes)
 */

async function bootstrapWorkspace(baseURL: string | undefined): Promise<void> {
  if (!baseURL) throw new Error('baseURL is required');
  const ctx = await request.newContext({ baseURL });
  const createRes = await ctx.post('/api/config/workspaces', {
    data: { name: 'e2e-workspace', path: `${process.env.HOME}/dailyflow-v2` },
  });
  let workspaceId: string;
  if (createRes.ok()) {
    workspaceId = (await createRes.json()).id;
  } else {
    const listRes = await ctx.get('/api/config/workspaces');
    const list = await listRes.json();
    workspaceId = list.workspaces.find(
      (w: { name: string }) => w.name === 'e2e-workspace',
    ).id;
  }
  const activateRes = await ctx.post(`/api/config/workspaces/${workspaceId}/activate`);
  if (!activateRes.ok()) {
    // Re-create the workspace fresh if a previous run left it in a
    // half-state (config written but workspaceRoot not bootstrapped).
    await ctx.post('/api/config/workspaces', {
      data: { name: 'e2e-workspace', path: `${process.env.HOME}/dailyflow-v2` },
    });
    const fresh = await ctx.get('/api/config/workspaces');
    const flist = await fresh.json();
    const wid = flist.workspaces.find((w: { name: string }) => w.name === 'e2e-workspace').id;
    const retry = await ctx.post(`/api/config/workspaces/${wid}/activate`);
    expect(retry.ok()).toBeTruthy();
  }
  await ctx.dispose();
}

// ---------------------------------------------------------------------------
// §26 step 17
// ---------------------------------------------------------------------------

test('§26 step 17 — empty note is created as draft, body persists across reads', async ({ baseURL }) => {
  await bootstrapWorkspace(baseURL);
  const ctx = await request.newContext({ baseURL });

  // 1. Create an empty-body note. The spec says "用户创建一篇无标题 Note 后
  //    立即开始书写" — F-02A: only body is required, every other field is
  //    either inferred or filled lazily.
  const createRes = await ctx.post('/api/v2/notes', { data: { body: '' } });
  expect(createRes.ok()).toBeTruthy();
  const created = (await createRes.json()).note;

  // 2. Verify the inferred state + kind on the empty draft.
  expect(created.state).toBe('draft');
  // inferKind('') returns 'quick' per noteService.ts:132.
  expect(created.kind).toBe('quick');
  expect(created.body).toBe('');
  expect(created.autoSaveVersion).toBe(0);
  expect(created.title).toBeUndefined();

  // 3. First keystroke — write a body via PATCH.
  const firstBody = 'first keystroke after creating a note with no title';
  const patchRes = await ctx.patch(`/api/v2/notes/${created.id}`, {
    data: { expectedAutoSaveVersion: 0, body: firstBody },
  });
  expect(patchRes.ok()).toBeTruthy();
  const patched = (await patchRes.json()).note;
  expect(patched.body).toBe(firstBody);
  expect(patched.autoSaveVersion).toBe(1);

  // 4. Re-fetch via GET — body should round-trip exactly. This is the
  //    "离开和重启应用均不丢失" half of the contract: the server still
  //    has what the client wrote.
  const get1 = await ctx.get(`/api/v2/notes/${created.id}`);
  expect(get1.ok()).toBeTruthy();
  const fetched1 = (await get1.json()).note;
  expect(fetched1.body).toBe(firstBody);
  expect(fetched1.autoSaveVersion).toBe(1);
  expect(fetched1.contentHash).toBe(patched.contentHash);

  // 5. Second GET — still there, no flakiness.
  const get2 = await ctx.get(`/api/v2/notes/${created.id}`);
  expect(get2.ok()).toBeTruthy();
  const fetched2 = (await get2.json()).note;
  expect(fetched2.body).toBe(firstBody);
  expect(fetched2.id).toBe(created.id);
  expect(fetched2.contentHash).toBe(fetched1.contentHash);

  // 6. Confirm it shows up in listNotes(state='draft') too.
  const list = await ctx.get('/api/v2/notes?state=draft');
  expect(list.ok()).toBeTruthy();
  const listJson = await list.json();
  const ids = (listJson.notes as Array<{ id: string }>).map((n) => n.id);
  expect(ids).toContain(created.id);

  await ctx.dispose();
});

// ---------------------------------------------------------------------------
// §26 step 18
// ---------------------------------------------------------------------------

test('§26 step 18 — PATCH without body never rewrites the stored body', async ({ baseURL }) => {
  await bootstrapWorkspace(baseURL);
  const ctx = await request.newContext({ baseURL });

  // Mark every body in this test with a unique token so we never confuse
  // it with another test's data even if the list has older notes.
  const token = `step18-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const originalBody = `My original thought. ${token}. The user typed this; nothing else should change it.`;

  // 1. Create a note with the user's body.
  const createRes = await ctx.post('/api/v2/notes', {
    data: { body: originalBody, kind: 'general', state: 'active' },
  });
  expect(createRes.ok()).toBeTruthy();
  const note = (await createRes.json()).note;
  expect(note.body).toBe(originalBody);

  // 2. Simulate the AI-side flow: a PATCH that updates only metadata
  //    (kind, pinned) and never sends a `body` field. Per
  //    noteService.ts update() the body's `parsed.body ?? existing.body`
  //    line guarantees the body is preserved verbatim.
  const patchRes = await ctx.patch(`/api/v2/notes/${note.id}`, {
    data: {
      expectedAutoSaveVersion: note.autoSaveVersion,
      kind: 'project',
      pinned: true,
    },
  });
  expect(patchRes.ok()).toBeTruthy();
  const patched = (await patchRes.json()).note;
  expect(patched.body).toBe(originalBody);
  expect(patched.kind).toBe('project');
  expect(patched.pinned).toBe(true);
  expect(patched.autoSaveVersion).toBe(note.autoSaveVersion + 1);

  // 3. Re-fetch — still the same bytes, contentHash unchanged.
  const get = await ctx.get(`/api/v2/notes/${note.id}`);
  expect(get.ok()).toBeTruthy();
  const fetched = (await get.json()).note;
  expect(fetched.body).toBe(originalBody);
  expect(fetched.contentHash).toBe(note.contentHash);
  expect(fetched.kind).toBe('project');
  expect(fetched.pinned).toBe(true);

  // 4. A second PATCH that sends body=null... wait, body is non-nullable
  //    in the schema; only title/date are nullable. Repeat the no-body
  //    PATCH one more time to prove idempotence.
  const patch2 = await ctx.patch(`/api/v2/notes/${note.id}`, {
    data: { expectedAutoSaveVersion: fetched.autoSaveVersion, pinned: false },
  });
  expect(patch2.ok()).toBeTruthy();
  const patched2 = (await patch2.json()).note;
  expect(patched2.body).toBe(originalBody);
  expect(patched2.pinned).toBe(false);

  await ctx.dispose();
});

// ---------------------------------------------------------------------------
// §26 step 19
// ---------------------------------------------------------------------------

test('§26 step 19 — memory search surfaces notes with a matching snippet', async ({ baseURL }) => {
  await bootstrapWorkspace(baseURL);
  const ctx = await request.newContext({ baseURL });

  // Use a very specific marker so we never confuse this note with any
  // other "acceptance"-bearing note from prior runs.
  const marker = `accept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = `v2 spec acceptance for Note backlinks via memory. marker=${marker}.`;

  // 1. Create the note.
  const createRes = await ctx.post('/api/v2/notes', {
    data: { body, kind: 'general', state: 'active' },
  });
  expect(createRes.ok()).toBeTruthy();
  const note = (await createRes.json()).note;

  // 2. /memory/search with the exact marker — should return at least one
  //    hit whose type is "note" and whose id is our note's id.
  const searchRes = await ctx.get(
    `/api/v2/memory/search?q=${encodeURIComponent(marker)}`,
  );
  expect(searchRes.ok()).toBeTruthy();
  const searchJson = await searchRes.json();
  const hits: Array<{
    type: string;
    id: string;
    title: string;
    snippet: string;
    score: number;
  }> = searchJson.hits;
  expect(hits.length).toBeGreaterThan(0);
  const noteHit = hits.find((h) => h.type === 'note' && h.id === note.id);
  expect(noteHit, `expected a note hit for ${note.id}, got types=${hits.map((h) => h.type).join(',')}`).toBeDefined();
  expect(noteHit!.snippet).toContain(marker);
  expect(noteHit!.score).toBeGreaterThan(0);

  // 3. /memory/search with a token from inside the body. The snippet
  //    extraction in memoryService.ts preserves a window around the
  //    matched token, so a single distinctive word is enough to be
  //    certain the body is being indexed and surfaced.
  const token = 'backlinks';
  const search2 = await ctx.get(
    `/api/v2/memory/search?q=${encodeURIComponent(token)}`,
  );
  expect(search2.ok()).toBeTruthy();
  const hits2: Array<{ type: string; id: string; snippet: string }> =
    (await search2.json()).hits;
  const noteHit2 = hits2.find((h) => h.type === 'note' && h.id === note.id);
  expect(noteHit2).toBeDefined();
  expect(noteHit2!.snippet.toLowerCase()).toContain('acceptance');

  await ctx.dispose();
});
