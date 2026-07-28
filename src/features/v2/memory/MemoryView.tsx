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

export function MemoryView({ workspaceId = 'default' }: { workspaceId?: string }) {
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
          <div className="text-sm font-medium">搜索</div>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder='例如："为什么决定用两档定价" / "Zhang" / "Q3 计划"'
            className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-sm"
          />
          <div className="text-xs text-[var(--color-text-muted)]">
            搜索结果会带原文片段和来源 ID；不会返回"只有文件路径"。
          </div>
        </div>
      </Card>

      {q.length > 0 && (
        <Card>
          <div className="text-sm font-medium">结果（{search.data?.hits.length ?? 0}）</div>
          {search.isLoading ? (
            <div className="text-sm text-[var(--color-text-muted)]">搜索中…</div>
          ) : search.error ? (
            <div className="text-xs text-red-600">{(search.error as Error).message}</div>
          ) : (search.data?.hits.length ?? 0) === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)]">
              没有找到匹配。我不会假装知道 — 没有结果就是没有。
            </div>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {(search.data?.hits ?? []).map((h, i) => (
                <SearchHit key={i} hit={h} workspaceId={workspaceId} />
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <div className="text-sm font-medium">已确认的 Commitment</div>
        {commitments.isLoading ? (
          <div className="text-sm text-[var(--color-text-muted)]">加载中…</div>
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
        <div className="text-sm font-medium">旧工作区（v1 Daily）</div>
        <div className="text-xs text-[var(--color-text-muted)]">
          这些 checkbox 任务继续可读、可完成；你可以把任意一项迁移为 v2 Commitment，原文件不会被破坏。
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {legacy.isLoading ? (
            <div className="text-sm text-[var(--color-text-muted)]">加载中…</div>
          ) : legacy.error ? (
            <div className="text-xs text-red-600">{(legacy.error as Error).message}</div>
          ) : (legacy.data?.items.length ?? 0) === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)]">没有需要迁移的旧任务。</div>
          ) : (
            (legacy.data?.items ?? []).slice(0, 30).map(t => (
              <LegacyTaskRow key={t.id} task={t} onMigrated={() => legacy.refetch()} />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function SearchHit({ hit, workspaceId }: { hit: MemoryHit; workspaceId: string }) {
  return (
    <li
      className="cursor-pointer rounded-md border border-[var(--color-border)] p-2 text-sm hover:bg-black/[0.03]"
      onClick={() => openEntity({ workspaceId, type: hit.type, id: hit.id, label: hit.title })}
      onKeyDown={e => { if (e.key === 'Enter') openEntity({ workspaceId, type: hit.type, id: hit.id, label: hit.title }); }}
      tabIndex={0}
      role="button"
    >
      <div className="flex items-center gap-2">
        <Badge>{hit.type}</Badge>
        <span className="font-medium">{hit.title}</span>
        <span className="text-xs text-[var(--color-text-muted)]">score {hit.score}</span>
      </div>
      <div className="mt-1 text-xs italic">"{hit.snippet}"</div>
      <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">
        id: {hit.id} · sources: {hit.sourceIds.length} · evidence: {hit.evidenceIds.length}
      </div>
    </li>
  );
}

function LegacyTaskRow({ task, onMigrated }: { task: LegacyTaskView; onMigrated: () => void }) {
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
        {migrating ? '迁移中…' : '迁移为 Commitment'}
      </Button>
    </div>
  );
}
