#!/usr/bin/env node
/**
 * Reset the dev / e2e workspace to a clean state.
 *
 * Use case (audit #4 — dev data accumulation): the e2e tests
 * (note-acceptance, notes-view-visual, notes-focus-mode, sidebar-viewports)
 * all hit the same `e2e-workspace` and leave 200+ Notes + 350+ Notes from
 * earlier test runs behind. After enough runs the seeded acceptance
 * markers get clipped off the end of /memory/search results, and the
 * page's "Today's notes" list becomes a wall of `Visual test note`
 * duplicates.
 *
 * This script:
 *   1) Calls POST /api/v2/reset with the literal confirm phrase so the
 *      server wipes `Inbox/`, `Commitments/`, `Memory/`, `Projects/`,
 *      `Plans/`, `Attachments/`, and the v2 `.dailyflow/` tree, then
 *      re-bootstraps.
 *   2) Re-creates and re-activates the `e2e-workspace` so the page
 *      doesn't fall back to WorkspaceSetup on the next run.
 *
 * Run with: `node scripts/reset-workspace.mjs`
 * Default port: 3003. Override with `DAILYFLOW_PORT=...`.
 */
const PORT = process.env.DAILYFLOW_PORT ?? '3003';
const BASE = `http://localhost:${PORT}`;

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  // 1) reset the active workspace (the server is single-workspace
  //    today, so this wipes whatever the dev / e2e server is pointing
  //    at).
  const reset = await api('/api/v2/reset', {
    method: 'POST',
    body: JSON.stringify({ confirm: 'RESET WORKSPACE' }),
  });
  console.log('[reset] ok=%s, cleared=%d entities, resetAt=%s',
    reset.ok, reset.cleared.length, reset.resetAt);
  for (const k of Object.keys(reset.preResetCounts)) {
    console.log(`  ${k}: ${reset.preResetCounts[k]}`);
  }

  // 2) re-create + activate the e2e workspace so the next browser
  //    session doesn't land on the WorkspaceSetup modal.
  const wsPath = `${process.env.HOME}/dailyflow-v2`;
  let id;
  try {
    const created = await api('/api/config/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'e2e-workspace', path: wsPath }),
    });
    id = created.workspace?.id;
  } catch (e) {
    // 409 duplicate: look up the existing one and reuse it.
    if (e.message.includes('Workspace already exists')) {
      const list = await api('/api/config/workspaces');
      const existing = (list.workspaces || []).find(
        (w) => w.name === 'e2e-workspace',
      );
      if (!existing) throw new Error('duplicate but not found in list');
      id = existing.id;
      console.log('[reset] workspace already exists, reusing id=%s', id);
    } else {
      throw e;
    }
  }
  if (!id) throw new Error('workspace id missing after create/reuse');
  const act = await api(`/api/config/workspaces/${id}/activate`, { method: 'POST' });
  console.log('[reset] reactivated workspace id=%s, activeWorkspaceId=%s',
    id, act.workspace?.id);
  console.log('[reset] done — e2e suite ready for the next run');
}

main().catch((e) => {
  console.error('[reset] FAILED:', e.message);
  process.exit(1);
});
