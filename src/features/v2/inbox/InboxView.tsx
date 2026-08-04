/**
 * Inbox v2 — Capture, list, and process sources.
 *
 * Spec §7.3: Inbox is the only entry for unprocessed, unconfirmed, or
 * re-decision content. Each item must have a clear action.
 *
 * The view supports:
 *   - Quick capture (text → SourceItem)
 *   - List of saved sources grouped by processing status
 *   - Process button (runs Extractor → Proposal)
 *   - Proposal review (accept / edit / reject) inline
 *   - Manual "create commitment" fallback when AI is unavailable
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  captureInput,
  listInbox,
  processSource,
  createCommitment,
  listProposals,
  listJobs,
  createNote,
  V2ApiError,
  type SourceItem,
  type Proposal,
  type Commitment,
  type Evidence,
} from '../api/client';
import { Card, Button, Badge, StateView } from '../components/States';
import { queryKeys } from '../../../queryKeys';
import { useWorkspaceScope } from '../../../workspaceScope';
import { ProposalReview } from '../proposals/ProposalReview';

export function InboxView({ language = 'zh' }: { language?: 'zh' | 'en' }) {
  const workspaceId = useWorkspaceScope();
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: queryKeys.inbox(workspaceId),
    queryFn: () => listInbox(),
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.inbox(workspaceId) });
    qc.invalidateQueries({ queryKey: queryKeys.proposalsRoot(workspaceId) });
  }, [qc, workspaceId]);

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4"
      data-testid="inbox-scroll-region"
    >
      <Card>
        <div className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
          <div className="text-sm font-medium text-text-heading">{language === 'zh' ? 'Inbox 是待处理来源，不是笔记列表' : 'Inbox is for unprocessed sources, not your note list'}</div>
          <div>{language === 'zh' ? '把消息、录音转写或临时想法先放这里；确认后可以转成笔记，或直接创建任务。笔记和任务的关联在笔记编辑器的“关联任务”里维护。' : 'Capture messages, transcripts, or rough ideas here first. Once confirmed, turn them into a note or a task. Link notes and tasks from the note editor.'}</div>
        </div>
      </Card>
      <CaptureBox language={language} onSaved={refresh} />
      <SourcesList
        items={inbox.data?.items ?? []}
        loading={inbox.isLoading}
        error={inbox.error ? { code: 'load', message: (inbox.error as Error).message } : null}
        onRefresh={refresh}
        onChanged={refresh}
        language={language}
      />
    </div>
  );
}

function CaptureBox({ onSaved, language }: { onSaved: () => void; language: 'zh' | 'en' }) {
  const isZh = language === 'zh';
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const capture = useMutation({
    mutationFn: () =>
      captureInput({
        kind: 'quick_capture',
        title: title.trim() || undefined,
        body: text.trim(),
      }),
    onSuccess: () => {
      setText('');
      setTitle('');
      setError(null);
      onSaved();
    },
    onError: (e: Error) => {
      if (e instanceof V2ApiError) setError(e.body);
      else setError({ message: e.message });
    },
  });

  const submit = () => {
    if (!text.trim()) {
      setError({ code: 'empty', message: isZh ? '请输入内容' : 'Enter some content' });
      return;
    }
    capture.mutate();
  };

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={isZh ? '标题（可选）' : 'Title (optional)'}
          className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-sm"
        />
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={isZh ? '把要处理的内容粘贴到这里：会议纪要、消息、想法…' : 'Paste something to process: meeting notes, messages, or ideas…'}
          className="min-h-[120px] rounded-lg border border-[var(--color-border)] bg-transparent p-3 text-sm"
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--color-text-muted)]">
            {isZh ? 'AI 会在后台分析；未配置时仍会保存原文。' : 'AI analyzes in the background; the original is saved even without AI.'}
          </div>
          <Button onClick={submit} disabled={capture.isPending}>
            {capture.isPending ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存到待处理来源' : 'Save to inbox')}
          </Button>
        </div>
        {error && (
          <div className="text-xs text-red-600">
            {error.code}: {error.message}
          </div>
        )}
      </div>
    </Card>
  );
}

function SourcesList({
  items,
  loading,
  error,
  onRefresh,
  onChanged,
  language,
}: {
  items: SourceItem[];
  loading: boolean;
  error: { message: string; code?: string } | null;
  onRefresh: () => void;
  onChanged: () => void;
  language: 'zh' | 'en';
}) {
  if (loading || error) {
    return (
      <StateView loading={loading} error={error} onRetry={onRefresh} language={language}>
        {null}
      </StateView>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <div className="text-sm text-[var(--color-text-muted)]">
          {language === 'zh'
            ? '没有等待处理的内容。你可以粘贴会议纪要、消息或脑中的事情。'
            : 'Nothing is waiting to be processed. Paste meeting notes, messages, or ideas above.'}
        </div>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map(s => (
        <SourceCard key={s.id} source={s} onChanged={onChanged} language={language} />
      ))}
    </div>
  );
}

function SourceCard({ source, onChanged, language }: { source: SourceItem; onChanged: () => void; language: 'zh' | 'en' }) {
  const isZh = language === 'zh';
  const workspaceId = useWorkspaceScope();
  const qc = useQueryClient();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [fallback, setFallback] = useState<{ reason?: string } | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const persistedProposals = useQuery({
    queryKey: queryKeys.proposals(workspaceId, { status: 'pending', sourceId: source.id }),
    queryFn: () => listProposals({ status: 'pending' }),
  });
  const persistedJobs = useQuery({
    queryKey: queryKeys.jobs(workspaceId, { entityType: 'source', entityId: source.id }),
    queryFn: () => listJobs(),
    refetchInterval: query => {
      const job = query.state.data?.items.find(item => item.entityRef.type === 'source' && item.entityRef.id === source.id);
      return job && ['queued', 'running'].includes(job.status) ? 1500 : false;
    },
  });
  const sourceJob = persistedJobs.data?.items.find(item => item.entityRef.type === 'source' && item.entityRef.id === source.id);

  useEffect(() => {
    if (proposal) return;
    const saved = persistedProposals.data?.items.find(item => item.sourceIds.includes(source.id));
    if (saved) setProposal(saved);
  }, [persistedProposals.data, proposal, source.id]);

  const process = useMutation({
    mutationFn: () => processSource(source.id),
    onSuccess: r => {
      setProposal(r.proposal);
      setEvidence(r.evidence);
      setFallback(r.fallback ? { reason: r.fallbackReason } : null);
      qc.invalidateQueries({ queryKey: queryKeys.jobsRoot(workspaceId) });
      qc.invalidateQueries({ queryKey: queryKeys.proposalsRoot(workspaceId) });
    },
    onError: (e: Error) => {
      if (e instanceof V2ApiError) setError(e.body);
      else setError({ message: e.message });
    },
  });

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge tone={source.processingStatus === 'needs_review' ? 'warning' : 'default'}>
              {sourceStatusLabel(source.processingStatus, isZh)}
            </Badge>
            <div className="text-sm font-medium">{source.title ?? (isZh ? '（无标题）' : '(Untitled)')}</div>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {new Date(source.createdAt).toLocaleString()}
          </div>
        </div>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-2 text-xs dark:bg-white/5">
          {source.body?.slice(0, 600)}
        </pre>

        {error && <div className="text-xs text-red-600">{error.code}: {error.message}</div>}
        {sourceJob && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Badge tone={sourceJob.status === 'failed' ? 'danger' : sourceJob.status === 'waiting_review' ? 'warning' : 'info'}>
              {jobStatusLabel(sourceJob.status, isZh)}
            </Badge>
            <span>{isZh ? '后台任务' : 'Job'} {sourceJob.id}{sourceJob.progress !== undefined ? ` · ${sourceJob.progress}%` : ''}</span>
            {sourceJob.error && <span className="text-red-600">{sourceJob.error.message}</span>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => process.mutate()}
            disabled={process.isPending || sourceJob?.status === 'queued' || sourceJob?.status === 'running'}
          >
            {process.isPending || sourceJob?.status === 'queued' || sourceJob?.status === 'running'
              ? (isZh ? '处理中…' : 'Processing…')
              : proposal ? (isZh ? '查看建议' : 'Review suggestions') : (isZh ? 'AI 分析' : 'Analyze with AI')}
          </Button>
          <CreateNoteFromSourceButton source={source} onCreated={onChanged} language={language} />
          <ManualCreateButton sourceId={source.id} onCreated={onChanged} language={language} />
        </div>

        {fallback && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
            {isZh
              ? `AI 未配置或不可用（${fallback.reason ?? '无可用模型'}）。请手动处理，或在“设置”中配置模型。`
              : `AI is unavailable (${fallback.reason ?? 'no provider'}). Process this manually or configure a model in Settings.`}
          </div>
        )}

        {proposal && proposal.changes.length > 0 && (
          <ProposalReview
            proposal={proposal}
            evidence={evidence.length > 0 ? evidence : undefined}
            language={language}
            initiallyExpanded
            onChanged={() => {
              setProposal(null);
              setEvidence([]);
              onChanged();
            }}
          />
        )}
      </div>
    </Card>
  );
}

function CreateNoteFromSourceButton({ source, onCreated, language }: { source: SourceItem; onCreated: () => void; language: 'zh' | 'en' }) {
  const isZh = language === 'zh';
  const create = useMutation({
    mutationFn: () => createNote({
      title: source.title,
      body: source.body ?? '',
      kind: source.kind === 'meeting_audio' || source.kind === 'meeting_transcript' ? 'meeting' : 'general',
      state: 'draft',
      sourceIds: [source.id],
    }),
    onSuccess: () => onCreated(),
  });
  return (
    <Button size="sm" variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}>
      {create.isPending ? (isZh ? '创建中…' : 'Creating…') : (isZh ? '转为笔记' : 'Turn into note')}
    </Button>
  );
}

function ManualCreateButton({ sourceId, onCreated, language }: { sourceId: string; onCreated: () => void; language: 'zh' | 'en' }) {
  const isZh = language === 'zh';
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [importance, setImportance] = useState<'critical' | 'high' | 'normal' | 'low'>('normal');

  const create = useMutation({
    mutationFn: () =>
      createCommitment({
        title: title.trim(),
        outcome: outcome.trim() || title.trim(),
        state: 'active',
        importance,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        dueConfidence: dueAt ? 'explicit' : 'unknown',
        sourceIds: [sourceId],
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setOutcome('');
      setDueAt('');
      onCreated();
    },
  });

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {isZh ? '手动创建事项' : 'Create work item manually'}
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-[var(--color-border)] p-2 text-xs">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={isZh ? '事项标题' : 'Work item title'}
        className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
      />
      <textarea
        value={outcome}
        onChange={e => setOutcome(e.target.value)}
        placeholder={isZh ? '期望结果' : 'Expected outcome'}
        className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1">
          <span>{isZh ? '截止' : 'Due'}</span>
          <input
            type="date"
            value={dueAt}
            onChange={e => setDueAt(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5"
          />
        </label>
        <label className="flex items-center gap-1">
          <span>{isZh ? '优先级' : 'Priority'}</span>
          <select
            value={importance}
            onChange={e => setImportance(e.target.value as 'critical' | 'high' | 'normal' | 'low')}
            className="rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5"
          >
            <option value="critical">{isZh ? '紧急' : 'Critical'}</option>
            <option value="high">{isZh ? '高' : 'High'}</option>
            <option value="normal">{isZh ? '普通' : 'Normal'}</option>
            <option value="low">{isZh ? '低' : 'Low'}</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {isZh ? '取消' : 'Cancel'}
        </Button>
        <Button size="sm" onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
          {create.isPending ? (isZh ? '创建中…' : 'Creating…') : (isZh ? '创建' : 'Create')}
        </Button>
      </div>
      {create.error && <div className="text-xs text-red-600">{(create.error as Error).message}</div>}
    </div>
  );
}

function sourceStatusLabel(status: SourceItem['processingStatus'], isZh: boolean): string {
  const labels: Record<SourceItem['processingStatus'], [string, string]> = {
    saved: ['已保存', 'Saved'],
    processing: ['处理中', 'Processing'],
    needs_review: ['待审核', 'Needs review'],
    processed: ['已处理', 'Processed'],
    failed: ['失败', 'Failed'],
  };
  return labels[status][isZh ? 0 : 1];
}

function jobStatusLabel(status: string, isZh: boolean): string {
  const labels: Record<string, [string, string]> = {
    queued: ['排队中', 'Queued'],
    running: ['运行中', 'Running'],
    waiting_review: ['待审核', 'Needs review'],
    succeeded: ['已完成', 'Succeeded'],
    failed: ['失败', 'Failed'],
    cancelled: ['已取消', 'Cancelled'],
  };
  return labels[status]?.[isZh ? 0 : 1] ?? status;
}
