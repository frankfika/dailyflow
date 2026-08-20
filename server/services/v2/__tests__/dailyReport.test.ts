/**
 * Tests for the dailyReport service (Sprint 1 Gap 5 — Daily 闭环).
 *
 * Coverage required by the spec:
 *   1. renderDailyReport is pure: same input => same output.
 *   2. renderDailyReport renders completed/in-progress/postponed correctly.
 *   3. writeDailyReport creates the Journal/ directory and persists the file.
 *   4. readDailyReport returns null when missing, the body when present.
 *   5. generateAndSaveDailyReport snapshots v2 commitments and writes the
 *      report under Journal/YYYY-MM-DD.md.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { createCommitment } from '../commitmentService';
import {
  assertIsoDate,
  generateAndSaveDailyReport,
  listDailyReports,
  readDailyReport,
  renderDailyReport,
  resolveJournalPath,
  writeDailyReport,
  type DailyReportInput,
} from '../dailyReport';
import { V2Repository } from '../../../repositories/v2/repository';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-daily-report-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

const FIXED_CLOCK = new Date('2026-08-20T09:15:00.000Z');

function makeSnapshot(overrides: Partial<DailyReportInput> = {}): DailyReportInput {
  return {
    date: '2026-08-20',
    completedTasks: [
      { id: 'c1', title: '发布 v2.0', tags: ['launch', 'work'] },
      { id: 'c2', title: '客户演示', tags: ['work'] },
    ],
    inProgressTasks: [
      { id: 'p1', title: '整合用户反馈', progress: '已收集 12 条' },
    ],
    postponedTasks: [
      { id: 'w1', title: '迁移旧数据库', reason: '等待运维确认' },
    ],
    reflection: '进展：v2.0 已发布，演示顺利。\n卡点：反馈响应慢。\n启发：先把质量门做扎实。',
    generatedAt: FIXED_CLOCK,
    ...overrides,
  };
}

describe('renderDailyReport (pure)', () => {
  it('is deterministic — same input produces identical Markdown', () => {
    const a = renderDailyReport(makeSnapshot());
    const b = renderDailyReport(makeSnapshot());
    expect(a).toBe(b);
  });

  it('contains the expected sections and groups completed tasks by tag', () => {
    const md = renderDailyReport(makeSnapshot());
    expect(md).toContain('# 日报 · 2026-08-20');
    expect(md).toContain('## 元信息');
    expect(md).toContain('## ✅ 今日完成');
    expect(md).toContain('## ⏰ 进行中');
    expect(md).toContain('## ⛔ 推迟 / 取消');
    expect(md).toContain('## 💭 今日复盘');
    expect(md).toContain('## 🎯 明日聚焦');
    // The two completed tasks share the "work" tag → at least one bucket.
    expect((md.match(/### /g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(md).toMatch(/### launch/);
    expect(md).toContain('**发布 v2.0**');
    expect(md).toContain('#launch #work');
    expect(md).toContain('**整合用户反馈** — 已收集 12 条');
    expect(md).toContain('**迁移旧数据库** — 原因：等待运维确认');
    // The clock is formatted in local time, but the value 09:15 stays in the body.
    expect(md).toMatch(/生成时间：\d{2}:\d{2}/);
    // Completion rate: 2 / 4 = 50%.
    expect(md).toContain('50% (2/4)');
  });

  it('rejects an invalid date up front', () => {
    expect(() => assertIsoDate('2026/08/20', 'date')).toThrow();
    expect(() =>
      renderDailyReport({ ...makeSnapshot(), date: 'yesterday' }),
    ).toThrow(/YYYY-MM-DD/);
  });
});

describe('writeDailyReport / readDailyReport (IO)', () => {
  it('creates the Journal/ folder on first write and reads the file back', async () => {
    const snapshot = makeSnapshot();
    const markdown = renderDailyReport(snapshot);
    const result = await writeDailyReport(workspace, { markdown, date: snapshot.date });

    expect(result.filePath).toBe(resolveJournalPath(workspace, snapshot.date));
    expect(result.byteSize).toBeGreaterThan(0);

    const onDisk = await fs.readFile(result.filePath, 'utf8');
    expect(onDisk).toBe(markdown);

    const read = await readDailyReport(workspace, snapshot.date);
    expect(read).toBe(markdown);
  });

  it('returns null when the report does not exist', async () => {
    const missing = await readDailyReport(workspace, '2026-08-20');
    expect(missing).toBeNull();
  });
});

describe('generateAndSaveDailyReport (high-level)', () => {
  it('snapshots v2 commitments and persists Journal/YYYY-MM-DD.md', async () => {
    await createCommitment(repo, workspaceId, { title: '完成的事', outcome: '做', state: 'active' });
    await createCommitment(repo, workspaceId, { title: '等待审核', outcome: '等', state: 'active' });
    await createCommitment(repo, workspaceId, { title: '改天再说', outcome: '稍后', state: 'active' });
    await createCommitment(repo, workspaceId, { title: '已取消', outcome: '取消', state: 'active' });

    const all = await repo.listCommitments();
    const [a, b, c, d] = all;
    await repo.saveCommitment({ ...a, state: 'completed' }, {
      auditKind: 'commitment.transition',
      auditEntity: { type: 'commitment', id: a.id },
    });
    await repo.saveCommitment({ ...b, state: 'waiting' }, {
      auditKind: 'commitment.transition',
      auditEntity: { type: 'commitment', id: b.id },
    });
    await repo.saveCommitment({ ...c, state: 'someday' }, {
      auditKind: 'commitment.transition',
      auditEntity: { type: 'commitment', id: c.id },
    });
    await repo.saveCommitment({ ...d, state: 'cancelled' }, {
      auditKind: 'commitment.transition',
      auditEntity: { type: 'commitment', id: d.id },
    });

    const result = await generateAndSaveDailyReport(
      repo,
      workspace,
      '2026-08-20',
      '今天很充实',
    );

    expect(result.filePath).toBe(resolveJournalPath(workspace, '2026-08-20'));
    const body = await fs.readFile(result.filePath, 'utf8');
    expect(body).toContain('**完成的事**');
    expect(body).toContain('**等待审核**');
    expect(body).toContain('**改天再说**');
    expect(body).toContain('**已取消**');
    expect(body).toContain('今天很充实');
    const audit = await repo.audit.readAll();
    const dailyEntries = audit.filter((e) => e.kind === 'daily_report.create');
    expect(dailyEntries).toHaveLength(1);
    expect(dailyEntries[0].entity).toEqual({ type: 'daily_report', id: '2026-08-20' });
    expect(dailyEntries[0].data.byteSize).toBe(result.byteSize);
  });

  it('lists reports by year / month and tolerates missing folders', async () => {
    await expect(listDailyReports(workspace, 2026)).resolves.toEqual([]);
    await expect(listDailyReports(workspace, 2026, 8)).resolves.toEqual([]);

    await generateAndSaveDailyReport(repo, workspace, '2026-08-19', 'a');
    await generateAndSaveDailyReport(repo, workspace, '2026-08-20', 'b');

    const aug = await listDailyReports(workspace, 2026, 8);
    expect(aug.map((r) => r.date)).toEqual(['2026-08-19', '2026-08-20']);
    const allYear = await listDailyReports(workspace, 2026);
    expect(allYear).toHaveLength(2);
    const noMatch = await listDailyReports(workspace, 2025);
    expect(noMatch).toEqual([]);
  });
});
