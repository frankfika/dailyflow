/**
 * Memory v2 — searchable aggregation of confirmed work context.
 *
 * Spec §7.4: Memory is the long-term, post-confirmation work context. It
 * groups Commitments, Projects, Meetings, People, Decisions, Outcomes.
 * The search bar returns hits with snippets and source IDs — never just
 * a filename.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  searchMemory,
  listCommitments,
  listLegacyTasks,
  migrateLegacyTask,
  type MemoryHit,
  type LegacyTaskView,
} from '../api/client';
import { Card, Button, Badge } from '../components/States';
import { queryKeys } from '../../../queryKeys';
import { openEntity } from '../../../components/EntityContextDrawer';

export function MemoryView({ workspaceId = 'default', language = 'zh' }: { workspaceId?: string; language?: 'zh' | 'en' }) {
  const isZh = language === 'zh';
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [legacyExpanded, setLegacyExpanded] = useState(false);
  const [legacyVisibleCount, setLegacyVisibleCount] = useState(8);
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
    <div
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4"
      data-testid="memory-scroll-region"
    >
      <header className="px-1 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          {isZh ? '工作上下文' : 'Work context'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text-heading)]">
          {isZh ? '记忆' : 'Memory'}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">
          {isZh ? '查找过去工作的背景、决定与来源。' : 'Find the context, decisions, and sources behind past work.'}
        </p>
      </header>

      <Card>
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">{isZh ? '搜索' : 'Search'}</div>
          <input
            type="text"
            aria-label={isZh ? '搜索工作记忆' : 'Search work memory'}
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
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">{isZh ? '已确认事项' : 'Confirmed work items'}</div>
          {!commitments.isLoading && !commitments.error && (
            <Badge>{commitments.data?.items.length ?? 0}</Badge>
          )}
        </div>
        {commitments.isLoading ? (
          <div className="text-sm text-[var(--color-text-muted)]">{isZh ? '加载中…' : 'Loading…'}</div>
        ) : commitments.error ? (
          <div className="text-xs text-red-600">{(commitments.error as Error).message}</div>
        ) : (commitments.data?.items.length ?? 0) === 0 ? (
          <div className="mt-2 text-sm text-[var(--color-text-muted)]">
            {isZh ? '暂无进行中的已确认事项。' : 'No open confirmed work items yet.'}
          </div>
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              {isZh ? '旧版每日任务' : 'Legacy daily tasks'}
              {!legacy.isLoading && !legacy.error && <Badge>{legacy.data?.items.length ?? 0}</Badge>}
            </div>
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">
              {isZh
                ? '按需查看并迁移旧任务；原文件不会被破坏。'
                : 'Review and migrate old tasks when needed; original files stay untouched.'}
            </div>
          </div>
          {!legacy.isLoading && !legacy.error && (legacy.data?.items.length ?? 0) > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLegacyExpanded(value => !value)}
              aria-expanded={legacyExpanded}
            >
              {legacyExpanded
                ? (isZh ? '收起' : 'Collapse')
                : (isZh ? `查看 ${legacy.data?.items.length ?? 0} 项` : `Review ${legacy.data?.items.length ?? 0} legacy tasks`)}
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-1" data-testid="legacy-task-list">
          {legacy.isLoading ? (
            <div className="text-sm text-[var(--color-text-muted)]">{isZh ? '加载中…' : 'Loading…'}</div>
          ) : legacy.error ? (
            <div className="text-xs text-red-600">{(legacy.error as Error).message}</div>
          ) : (legacy.data?.items.length ?? 0) === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)]">{isZh ? '没有需要迁移的旧任务。' : 'No legacy tasks to migrate.'}</div>
          ) : legacyExpanded ? (
            <>
              {(legacy.data?.items ?? []).slice(0, legacyVisibleCount).map(t => (
                <LegacyTaskRow key={t.id} task={t} isZh={isZh} onMigrated={() => legacy.refetch()} />
              ))}
              {legacyVisibleCount < (legacy.data?.items.length ?? 0) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLegacyVisibleCount(count => count + 12)}
                >
                  {isZh
                    ? `再显示 ${Math.min(12, (legacy.data?.items.length ?? 0) - legacyVisibleCount)} 项`
                    : `Show ${Math.min(12, (legacy.data?.items.length ?? 0) - legacyVisibleCount)} more`}
                </Button>
              )}
            </>
          ) : null}
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
