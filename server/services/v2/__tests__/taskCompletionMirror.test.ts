/**
 * Task-Completion → MindMap mirror (Sprint 1 Gap 7).
 *
 * Tests the pure helpers and the mirror walk using the v1 mindmap
 * service directly (no V2Repository needed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock the config service BEFORE importing the mindmap service so
// withDir() picks up our test workspaceRoot.
vi.mock('../../config.js', () => ({
  loadConfig: vi.fn(async () => ({
    workspaceRoot: process.env.DAILYFLOW_TEST_WS ?? '/tmp',
    workspaces: [],
    activeWorkspaceId: '',
  })),
  saveConfig: vi.fn(async () => undefined),
}));

import { createMindMap, getMindMap } from '../../mindmaps.js';
import type { MindMap } from '../../../types/mindmap.js';
import {
  appendCompletionNote,
  formatCompletionBlock,
  mirrorTaskCompletionToMindmap,
} from '../taskCompletionMirror.js';

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-mirror-'));
  process.env.DAILYFLOW_TEST_WS = workspace;
});

afterEach(async () => {
  vi.clearAllMocks();
  await fs.rm(workspace, { recursive: true, force: true });
});

async function seedMap(nodes: MindMap['nodes']): Promise<string> {
  const map: MindMap = {
    id: 'placeholder',
    title: 'Test',
    rootId: nodes[0]?.id ?? 'root',
    nodes,
    edges: [],
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const created = await createMindMap(map);
  return created.id;
}

describe('formatCompletionBlock', () => {
  it('renders header + timestamp + summary', () => {
    const block = formatCompletionBlock('2026-08-20T09:15:00.000Z', 'user confirmed v2 roadmap');
    expect(block).toContain('## 完成 · 2026-08-20');
    expect(block).toContain('2026-08-20T09:15:00.000Z');
    expect(block).toContain('user confirmed v2 roadmap');
  });

  it('omits summary line when outcomeSummary missing', () => {
    const block = formatCompletionBlock('2026-08-20T09:15:00.000Z');
    expect(block).toContain('## 完成 · 2026-08-20');
    expect(block).not.toContain('user confirmed');
  });
});

describe('appendCompletionNote', () => {
  it('preserves existing note + appends block', () => {
    const out = appendCompletionNote('Original thought', '## 完成');
    expect(out).toContain('Original thought');
    expect(out).toContain('## 完成');
  });

  it('returns just the block when no existing note', () => {
    expect(appendCompletionNote('', '## 完成')).toBe('## 完成');
    expect(appendCompletionNote(undefined, '## 完成')).toBe('## 完成');
  });
});

describe('mirrorTaskCompletionToMindmap', () => {
  it('marks linked task-kind node as done and appends note', async () => {
    const taskId = 't_abc123';
    const mid = await seedMap([
      { id: 'root', text: 'Project', position: { x: 0, y: 0 } },
      { id: 'n1', text: 'write doc', kind: 'task', taskId, position: { x: 0, y: 0 }, status: 'in-progress' },
    ]);

    const result = await mirrorTaskCompletionToMindmap(null as never, {
      taskId,
      completedAt: '2026-08-20T09:15:00.000Z',
      outcomeSummary: 'doc shipped',
    });

    expect(result.mirroredNodeIds).toEqual(['n1']);
    expect(result.mindmapIds).toEqual([mid]);

    const after = await getMindMap(mid);
    const node = after?.nodes.find((n) => n.id === 'n1');
    expect(node?.status).toBe('done');
    expect(node?.note).toContain('## 完成 · 2026-08-20');
    expect(node?.note).toContain('doc shipped');
  });

  it('returns empty when no node links the taskId', async () => {
    const taskId = 't_orphan';
    await seedMap([
      { id: 'root', text: 'Project', position: { x: 0, y: 0 } },
      { id: 'n1', text: 'unrelated', kind: 'task', taskId: 't_other', position: { x: 0, y: 0 } },
    ]);

    const result = await mirrorTaskCompletionToMindmap(null as never, {
      taskId,
      completedAt: '2026-08-20T09:15:00.000Z',
    });

    expect(result.mirroredNodeIds).toEqual([]);
    expect(result.mindmapIds).toEqual([]);
  });

  it('mirrors across multiple mindmaps', async () => {
    const taskId = 't_shared';
    const m1 = await seedMap([
      { id: 'root', text: 'A', position: { x: 0, y: 0 } },
      { id: 'n1', text: 'A1', kind: 'task', taskId, position: { x: 0, y: 0 } },
    ]);
    const m2 = await seedMap([
      { id: 'root', text: 'B', position: { x: 0, y: 0 } },
      { id: 'n2', text: 'B1', kind: 'task', taskId, position: { x: 0, y: 0 } },
    ]);

    const result = await mirrorTaskCompletionToMindmap(null as never, {
      taskId,
      completedAt: '2026-08-20T09:15:00.000Z',
    });

    expect(new Set(result.mirroredNodeIds)).toEqual(new Set(['n1', 'n2']));
    expect(new Set(result.mindmapIds)).toEqual(new Set([m1, m2]));
  });

  it('does not touch non-task nodes (question / risk / etc.)', async () => {
    const taskId = 't_taskish';
    await seedMap([
      { id: 'root', text: 'Project', position: { x: 0, y: 0 } },
      { id: 'n1', text: 'a question', kind: 'question', taskId, position: { x: 0, y: 0 } },
      { id: 'n2', text: 'a risk', kind: 'risk', taskId, position: { x: 0, y: 0 } },
    ]);

    const result = await mirrorTaskCompletionToMindmap(null as never, {
      taskId,
      completedAt: '2026-08-20T09:15:00.000Z',
    });

    expect(result.mirroredNodeIds).toEqual([]);
  });
});
