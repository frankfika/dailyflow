/**
 * Memory v2 — searchable aggregation of confirmed work context.
 *
 * Spec §7.4: Memory is the long-term, post-confirmation work context. It
 * groups Commitments, Projects, Meetings, People, Decisions, Outcomes.
 * The search bar returns hits with snippets and source IDs — never just
 * a filename.
 */
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  searchMemory,
  listCommitments,
  listLegacyTasks,
  migrateLegacyTask,
  V2ApiError,
  type MemoryHit,
  type LegacyTaskView,
  type Commitment,
} from '../api/client';
import { Card, Button, Badge, StateView } from '../components/States';
import { queryKeys } from '../../../queryKeys';
import { openEntity } from '../../../components/EntityContextDrawer';

export function MemoryView({ workspaceId = 'default', language = 'zh' }: { workspaceId?: string; language?: 'zh' | 'en' }) {
  const isZh = language === 'zh';
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);
  const search = useQuery({
    queryKey: queryKeys.memory(workspaceId, debouncedQ),
    queryFn: ({ signal }) => searchMemory(debouncedQ, signal),
    enabled: debouncedQ.length > 0,
  });
  const commitments = useQuery({
    queryKey: queryKeys.commitments(workspaceId, { state: 'open' }),
    queryFn: () => listCommitments({ state: 'open' }),
  });
  const legacy = useQuery({
    queryKey: queryKeys.today(workspaceId, 'legacy'),
    queryFn: () => listLegacyTasks(),
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">{isZh ? '搜索' : 'Search'}</div>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={isZh ? '例如：“为什么决定用两档定价” / “Q3 计划”' : 'For example: “Why did we choose two-tier pricing?” / “Q3 plan”'}
            className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-sm"
          />
          <div className="text-xs text-[var(--color-text-muted)]">
            {isZh ? '搜索结果会带原文片段和来源，不会只返回文件路径。' : 'Results include source excerpts and references, not just file paths.'}
          </div>
        </div>
      </Card>

      {q.length > 0 && (
        <Card>
          <div className="text-sm font-medium">{isZh ? '结果' : 'Results'}（{search.data?.hits.length ?? 0}）</div>
          {search.isLoading ? (
            <div className="text-sm text-[var(--color-text-muted)]">{isZh ? '搜索中…' : 'Searching…'}</div>
          ) : search.error ? (
            <div className="text-xs text-red-600">{(search.error as Error).message}</div>
          ) : (search.data?.hits.length ?? 0) === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)]">
              {isZh ? '没有找到匹配内容。' : 'No matching content found.'}
            </div>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {(search.data?.hits ?? []).map((h, i) => (
                <SearchHit key={i} hit={h} workspaceId={workspaceId} isZh={isZh} />
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <div className="text-sm font-medium">{isZh ? '已确认事项' : 'Confirmed work items'}</div>
        {commitments.isLoading ? (
          <div className="text-sm text-[var(--color-text-muted)]">{isZh ? '加载中…' : 'Loading…'}</div>
        ) : commitments.error ? (
          <div className="text-xs text-red-600">{(commitments.error as Error).message}</div>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {(commitments.data?.items ?? []).slice(0, 20).map(c => (
              <li key={c.id} className="rounded-md border border-[var(--color-border)] p-2">
                <div className="flex items-center gap-2">
                  <Badge tone="info">{c.state}</Badge>
                  <span className="font-medium">{c.title}</span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">{c.outcome}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="text-sm font-medium">{isZh ? '旧版每日任务' : 'Legacy daily tasks'}</div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {isZh
            ? '这些任务仍可读取和完成；也可以迁移为结构化事项，原文件不会被破坏。'
            : 'These tasks remain readable and actionable. You can migrate one into a structured work item without damaging the original file.'}
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {legacy.isLoading ? (
            <div className="text-sm text-[var(--color-text-muted)]">{isZh ? '加载中…' : 'Loading…'}</div>
          ) : legacy.error ? (
            <div className="text-xs text-red-600">{(legacy.error as Error).message}</div>
          ) : (legacy.data?.items.length ?? 0) === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)]">{isZh ? '没有需要迁移的旧任务。' : 'No legacy tasks to migrate.'}</div>
          ) : (
            (legacy.data?.items ?? []).slice(0, 30).map(t => (
              <LegacyTaskRow key={t.id} task={t} isZh={isZh} onMigrated={() => legacy.refetch()} />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function SearchHit({ hit, workspaceId, isZh }: { hit: MemoryHit; workspaceId: string; isZh: boolean }) {
  return (
    <li
      className="cursor-pointer rounded-md border border-[var(--color-border)] p-2 text-sm hover:bg-black/[0.03]"
      onClick={() => openEntity({ workspaceId, type: hit.type, id: hit.id, label: hit.title })}
      onKeyDown={e => { if (e.key === 'Enter') openEntity({ workspaceId, type: hit.type, id: hit.id, label: hit.title }); }}
      tabIndex={0}
      role="button"
    >
      <div className="flex items-center gap-2">
        <Badge>{memoryTypeLabel(hit.type, isZh)}</Badge>
        <span className="font-medium">{hit.title}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{isZh ? '相关度' : 'score'} {hit.score}</span>
      </div>
      <div className="mt-1 text-xs italic">"{hit.snippet}"</div>
      <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">
        {isZh ? '来源' : 'sources'}: {hit.sourceIds.length} · {isZh ? '证据' : 'evidence'}: {hit.evidenceIds.length}
      </div>
    </li>
  );
}

function LegacyTaskRow({ task, onMigrated, isZh }: { task: LegacyTaskView; onMigrated: () => void; isZh: boolean }) {
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] p-2 text-xs">
      <div className="min-w-0">
        <span className="font-medium">{task.title}</span>
        <span className="ml-2 text-[var(--color-text-muted)]">({task.date}#{task.line})</span>
        {task.deadline && <Badge tone="info">@ {task.deadline}</Badge>}
        {error && <div className="mt-1 text-red-600">{error}</div>}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          setMigrating(true);
          setError(null);
          try {
            await migrateLegacyTask(task.date, task.line);
            onMigrated();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setMigrating(false);
          }
        }}
        disabled={migrating}
      >
        {migrating ? (isZh ? '迁移中…' : 'Migrating…') : (isZh ? '迁移为事项' : 'Migrate to work item')}
      </Button>
    </div>
  );
}

function memoryTypeLabel(type: string, isZh: boolean): string {
  const labels: Record<string, [string, string]> = {
    commitment: ['事项', 'Work item'],
    project: ['项目', 'Project'],
    person: ['联系人', 'Person'],
    decision: ['决定', 'Decision'],
    outcome: ['结果', 'Outcome'],
    source: ['来源', 'Source'],
    note: ['笔记', 'Note'],
  };
  return labels[type]?.[isZh ? 0 : 1] ?? type;
}
