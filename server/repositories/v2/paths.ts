/**
 * Workspace layout for v2 entities.
 *
 * Spec §12.1: canonical directory structure. All paths are derived from
 * `workspaceRoot`. v2 lives alongside the existing v1 `Daily/` and `Notes/`
 * directories and is fully isolated from them.
 *
 * The .dailyflow/ subdirectory holds:
 *   - index.sqlite (rebuildable cache, not the source of truth)
 *   - audit.jsonl (append-only audit log, used for undo and recovery)
 *   - connector-state.json (connector cursors, tokens, status)
 *   - config.json (shared with v1 via copy-back)
 */
import path from 'path';

export interface V2Layout {
  root: string;
  inbox: string;
  commitments: {
    active: string;
    planned: string;
    waiting: string;
    someday: string;
    completed: string;
    cancelled: string;
    archived: string;
    all: string; // loose files at this level
  };
  meetings: string;
  decisions: string;
  outcomes: string;
  people: string;
  organizations: string;
  projects: string;
  plans: string;
  attachments: string;
  internal: {
    audit: string;
    sqlite: string;
    connectors: string;
    config: string;
  };
  proposals: string;
  runs: string;
}

export function deriveLayout(workspaceRoot: string): V2Layout {
  return {
    root: workspaceRoot,
    inbox: path.join(workspaceRoot, 'Inbox'),
    commitments: {
      active: path.join(workspaceRoot, 'Commitments', 'active'),
      planned: path.join(workspaceRoot, 'Commitments', 'planned'),
      waiting: path.join(workspaceRoot, 'Commitments', 'waiting'),
      someday: path.join(workspaceRoot, 'Commitments', 'someday'),
      completed: path.join(workspaceRoot, 'Commitments', 'completed'),
      cancelled: path.join(workspaceRoot, 'Commitments', 'cancelled'),
      archived: path.join(workspaceRoot, 'Commitments', 'archived'),
      all: path.join(workspaceRoot, 'Commitments'),
    },
    meetings: path.join(workspaceRoot, 'Memory', 'Meetings'),
    decisions: path.join(workspaceRoot, 'Memory', 'Decisions'),
    outcomes: path.join(workspaceRoot, 'Memory', 'Outcomes'),
    people: path.join(workspaceRoot, 'Memory', 'People'),
    organizations: path.join(workspaceRoot, 'Memory', 'Organizations'),
    projects: path.join(workspaceRoot, 'Projects'),
    plans: path.join(workspaceRoot, 'Plans'),
    attachments: path.join(workspaceRoot, 'Attachments'),
    proposals: path.join(workspaceRoot, '.dailyflow', 'proposals'),
    runs: path.join(workspaceRoot, '.dailyflow', 'agent-runs'),
    internal: {
      audit: path.join(workspaceRoot, '.dailyflow', 'audit.jsonl'),
      sqlite: path.join(workspaceRoot, '.dailyflow', 'index.sqlite'),
      connectors: path.join(workspaceRoot, '.dailyflow', 'connector-state.json'),
      config: path.join(workspaceRoot, '.dailyflow', 'config.json'),
    },
  };
}

export function entityPath(layout: V2Layout, kind: 'commitment' | 'source' | 'meeting' | 'decision' | 'outcome' | 'person' | 'project' | 'plan' | 'proposal' | 'run', stateOrStatus: string, id: string, occurredAt?: string): string {
  const safeId = sanitizeId(id);
  switch (kind) {
    case 'commitment': {
      const dir = (layout.commitments as Record<string, string>)[stateOrStatus] ?? layout.commitments.all;
      return path.join(dir, `${safeId}.md`);
    }
    case 'source': {
      // Inbox/YYYY/MM/<id>.md
      const d = occurredAt ? new Date(occurredAt) : new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return path.join(layout.inbox, String(y), m, `${safeId}.md`);
    }
    case 'meeting': {
      const d = occurredAt ? new Date(occurredAt) : new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return path.join(layout.meetings, String(y), m, `${safeId}.md`);
    }
    case 'decision':
      return path.join(layout.decisions, `${safeId}.md`);
    case 'outcome': {
      const d = occurredAt ? new Date(occurredAt) : new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return path.join(layout.outcomes, String(y), m, `${safeId}.md`);
    }
    case 'person':
      return path.join(layout.people, `${safeId}.md`);
    case 'project':
      return path.join(layout.projects, `${safeId}.md`);
    case 'plan': {
      // Plans/YYYY/MM/YYYY-MM-DD.md (one per date; may be revised)
      return path.join(layout.plans, stateOrStatus.slice(0, 4), stateOrStatus.slice(5, 7), `${stateOrStatus}.md`);
    }
    case 'proposal':
      return path.join(layout.proposals, `${safeId}.md`);
    case 'run':
      return path.join(layout.runs, `${safeId}.json`);
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
