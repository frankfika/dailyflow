/**
 * TeamView — leader read-only view of member work.
 */
import type React from 'react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, RefreshCw, GitBranch, CalendarDays, CheckCircle2, Circle, AlertCircle, Loader2 } from 'lucide-react';
import { teamApi, type TeamMember, type TaskInput, type GitStatus } from '../api/client';

interface TeamViewProps {
  language?: 'zh' | 'en';
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

const TEXT = {
  en: {
    title: 'Team',
    subtitle: 'Read-only view of your team\'s work. Pull the shared repo to refresh.',
    notEnabled: 'Team collaboration is not enabled.',
    notLeader: 'Only the leader can view team members.',
    members: 'Members',
    dates: 'Dates',
    tasks: 'Tasks',
    sync: 'Sync now',
    syncing: 'Syncing…',
    status: 'Git status',
    ahead: 'ahead',
    behind: 'behind',
    dirty: 'uncommitted',
    clean: 'clean',
    noTasks: 'No tasks on this day.',
    noDates: 'No daily notes found.',
    noMembers: 'No team members configured.',
  },
  zh: {
    title: '团队',
    subtitle: '只读查看团队工作。拉取共享仓库以刷新。',
    notEnabled: '未启用团队协作。',
    notLeader: '只有 leader 可以查看团队成员。',
    members: '成员',
    dates: '日期',
    tasks: '任务',
    sync: '立即同步',
    syncing: '同步中…',
    status: 'Git 状态',
    ahead: '领先',
    behind: '落后',
    dirty: '未提交',
    clean: '干净',
    noTasks: '这一天没有任务。',
    noDates: '没有找到日记。',
    noMembers: '没有配置团队成员。',
  },
} as const;

export function TeamView({ language = 'zh', showToast }: TeamViewProps) {
  const isZh = language === 'zh';
  const t = TEXT[language];
  const qc = useQueryClient();
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const config = useQuery({
    queryKey: ['team', 'config'],
    queryFn: () => teamApi.getConfig(),
  });

  const status = useQuery({
    queryKey: ['team', 'status'],
    queryFn: () => teamApi.getStatus(),
    refetchInterval: 30000,
  });

  const sync = useMutation({
    mutationFn: () => teamApi.sync(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      showToast?.(isZh ? '同步完成' : 'Sync complete', 'success');
    },
    onError: (e: Error) => {
      showToast?.(e.message, 'error');
    },
  });

  const dates = useQuery({
    queryKey: ['team', 'dates', selectedMember?.id],
    queryFn: () => teamApi.getMemberDates(selectedMember!.id),
    enabled: Boolean(selectedMember),
  });

  const tasks = useQuery({
    queryKey: ['team', 'tasks', selectedMember?.id, selectedDate],
    queryFn: () => teamApi.getMemberTasks(selectedMember!.id, selectedDate!),
    enabled: Boolean(selectedMember && selectedDate),
  });

  if (config.isLoading) {
    return <Loading />;
  }

  if (!config.data?.enabled) {
    return <EmptyState icon={<Users className="h-6 w-6" />} text={t.notEnabled} />;
  }

  if (config.data.role !== 'leader') {
    return <EmptyState icon={<AlertCircle className="h-6 w-6" />} text={t.notLeader} />;
  }

  const members = config.data.members;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4" data-testid="team-scroll-region">
      <header className="px-1 pt-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{isZh ? '团队协作' : 'Team collaboration'}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text-heading)]">{t.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">{t.subtitle}</p>
      </header>

      <GitStatusBar status={status.data?.status} syncing={sync.isPending} onSync={() => sync.mutate()} t={t} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--color-border)] bg-surface p-3">
          <h2 className="mb-2 text-sm font-medium text-[var(--color-text-heading)]">{t.members}</h2>
          {members.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t.noMembers}</p>
          ) : (
            <ul className="space-y-1">
              {members.map((member) => (
                <li key={member.id}>
                  <button
                    onClick={() => { setSelectedMember(member); setSelectedDate(null); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectedMember?.id === member.id ? 'bg-accent text-white' : 'hover:bg-black/[0.03] text-[var(--color-text-main)]'}`}
                  >
                    <Users className="h-4 w-4" />
                    {member.name || member.id}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-surface p-3">
          <h2 className="mb-2 text-sm font-medium text-[var(--color-text-heading)]">{t.dates}</h2>
          {!selectedMember ? (
            <p className="text-sm text-[var(--color-text-muted)]">{isZh ? '选择一名成员' : 'Select a member'}</p>
          ) : dates.isLoading ? (
            <Loading />
          ) : dates.data?.dates.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t.noDates}</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {dates.data?.dates.map((date) => (
                <li key={date}>
                  <button
                    onClick={() => setSelectedDate(date)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectedDate === date ? 'bg-accent text-white' : 'hover:bg-black/[0.03] text-[var(--color-text-main)]'}`}
                  >
                    <CalendarDays className="h-4 w-4" />
                    {date}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-surface p-3 lg:col-span-1">
          <h2 className="mb-2 text-sm font-medium text-[var(--color-text-heading)]">{t.tasks}</h2>
          {!selectedDate ? (
            <p className="text-sm text-[var(--color-text-muted)]">{isZh ? '选择一个日期' : 'Select a date'}</p>
          ) : tasks.isLoading ? (
            <Loading />
          ) : tasks.data?.tasks.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t.noTasks}</p>
          ) : (
            <ul className="space-y-2">
              {tasks.data?.tasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-[var(--color-border)] p-3">
                  <TaskRow task={task} memberId={selectedMember!.id} date={selectedDate} language={language} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TaskRow({ task, memberId, date, language }: { task: TaskInput; memberId: string; date: string; language: 'zh' | 'en' }) {
  const done = task.status === 'done';
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 text-left"
      >
        {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--color-success)]" /> : <Circle className="mt-0.5 h-4 w-4 text-[var(--color-text-muted)]" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${done ? 'line-through opacity-60' : 'text-[var(--color-text-heading)]'}`}>{task.title}</p>
          {task.description && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{task.description}</p>}
          {task.tags && task.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span key={tag} className="rounded bg-black/[0.045] px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)]">#{tag}</span>
              ))}
            </div>
          )}
        </div>
      </button>
      {expanded && <TaskTimeline memberId={memberId} date={date} taskId={task.id} language={language} />}
    </div>
  );
}

function TaskTimeline({ memberId, date, taskId, language }: { memberId: string; date: string; taskId: string; language: 'zh' | 'en' }) {
  const timeline = useQuery({
    queryKey: ['team', 'timeline', memberId, date, taskId],
    queryFn: () => teamApi.getTaskTimeline(memberId, date, taskId),
  });
  if (timeline.isLoading) return <Loading />;
  const items = timeline.data?.timeline ?? [];
  if (items.length === 0) {
    return <p className="text-xs text-[var(--color-text-muted)]">{language === 'zh' ? '暂无历史记录' : 'No history yet'}</p>;
  }
  return (
    <ul className="space-y-1 border-l border-[var(--color-border)] pl-3">
      {items.map((item, idx) => (
        <li key={idx} className="text-xs">
          <span className="font-medium text-[var(--color-text-heading)]">{formatTimelineChange(item.change, language)}</span>
          <span className="ml-2 text-[var(--color-text-muted)]">{new Date(item.date).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</span>
          <p className="text-[var(--color-text-muted)]">{item.message} — {item.author}</p>
        </li>
      ))}
    </ul>
  );
}

function formatTimelineChange(change: string, language: 'zh' | 'en'): string {
  const map: Record<string, Record<string, string>> = {
    created: { zh: '创建', en: 'Created' },
    updated: { zh: '更新', en: 'Updated' },
    completed: { zh: '完成', en: 'Completed' },
    reopened: { zh: '重新打开', en: 'Reopened' },
    migrated: { zh: '迁移', en: 'Migrated' },
    unknown: { zh: '变更', en: 'Changed' },
  };
  return map[change]?.[language] || change;
}

function GitStatusBar({
  status,
  syncing,
  onSync,
  t,
}: {
  status?: GitStatus;
  syncing: boolean;
  onSync: () => void;
  t: (typeof TEXT)['zh' | 'en'];
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-surface p-3">
      <div className="flex items-center gap-3 text-sm">
        <GitBranch className="h-4 w-4 text-[var(--color-text-muted)]" />
        <span className="text-[var(--color-text-heading)]">{t.status}</span>
        {status ? (
          <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            {status.dirty ? <span className="rounded bg-warning/10 px-1.5 py-0.5 text-warning">{t.dirty}</span> : <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">{t.clean}</span>}
            {status.ahead > 0 && <span>{status.ahead} {t.ahead}</span>}
            {status.behind > 0 && <span>{status.behind} {t.behind}</span>}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">—</span>
        )}
      </div>
      <button
        onClick={onSync}
        disabled={syncing}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {syncing ? t.syncing : t.sync}
      </button>
    </div>
  );
}

function Loading() {
  return <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /></div>;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
