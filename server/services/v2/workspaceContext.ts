/**
 * Workspace context loader for v2.
 *
 * The v2 stack coexists with v1: it reads the same `config.json` (so the
 * user's chosen workspace folder is honored) but **never writes to v1
 * files**. All v2 mutations go to the new directory tree.
 *
 * Spec §18: legacy workspace opens, views, and edits must not regress.
 */
import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from '../config.js';
import { V2Repository, type WorkspaceContext } from '../../repositories/v2/repository.js';
import { deriveLayout } from '../../repositories/v2/paths.js';

export interface V2BootstrapOptions {
  /** Override workspace root (used by tests). */
  workspaceRoot?: string;
  /** Override workspace id (used by tests). */
  workspaceId?: string;
}

export interface V2Bootstrap {
  ctx: WorkspaceContext;
  repo: V2Repository;
  /** True if the v2 directory structure had to be created. */
  freshWorkspace: boolean;
}

const V2_WORKSPACE_ID = 'ws_v2_default';

export async function bootstrapV2(opts: V2BootstrapOptions = {}): Promise<V2Bootstrap> {
  let workspaceRoot = opts.workspaceRoot;
  let workspaceId = opts.workspaceId ?? V2_WORKSPACE_ID;

  if (!workspaceRoot) {
    const cfg = await loadConfig();
    if (!cfg.workspaceRoot) {
      throw new Error('DailyFlow workspace is not configured. Set workspaceRoot in ~/.dailyflow/config.json.');
    }
    workspaceRoot = cfg.workspaceRoot;
    if (cfg.activeWorkspaceId) workspaceId = cfg.activeWorkspaceId;
  }

  const layout = deriveLayout(workspaceRoot);

  let fresh = false;
  try {
    await fs.access(path.join(workspaceRoot, '.dailyflow'));
  } catch {
    fresh = true;
  }

  // Pre-create the directory tree on first access. Safe and idempotent.
  for (const dir of [
    layout.inbox,
    layout.commitments.active,
    layout.commitments.planned,
    layout.commitments.waiting,
    layout.commitments.someday,
    layout.commitments.completed,
    layout.commitments.cancelled,
    layout.commitments.archived,
    layout.meetings,
    layout.outcomes,
    layout.people,
    layout.organizations,
    layout.projects,
    layout.plans,
    layout.attachments,
    layout.proposals,
    layout.runs,
    layout.runEvents,
    layout.graphProposals,
    path.dirname(layout.internal.audit),
  ]) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Append a bootstrap audit marker so the v2 timeline has a known first event.
  const repo = new V2Repository({ root: workspaceRoot, workspaceId });
  const existing = await repo.audit.readAll();
  if (existing.length === 0) {
    await repo.audit.append({
      kind: 'file.write',
      actor: 'system',
      data: { event: 'v2_bootstrap', version: 1 },
    });
  }

  return {
    ctx: { root: workspaceRoot, workspaceId },
    repo,
    freshWorkspace: fresh,
  };
}
