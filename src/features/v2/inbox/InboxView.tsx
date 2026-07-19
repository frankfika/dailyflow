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
  applyProposal,
  rejectProposal,
  createCommitment,
  V2ApiError,
  type SourceItem,
  type Proposal,
  type Commitment,
  type ProposedChange,
  type Evidence,
} from '../api/client';
import { Card, Button, Badge, StateView } from '../components/States';

export function InboxView() {
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['v2-inbox'],
    queryFn: () => listInbox(),
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['v2-inbox'] });
    qc.invalidateQueries({ queryKey: ['v2-proposals'] });
  }, [qc]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <CaptureBox onSaved={refresh} />
      <SourcesList
        items={inbox.data?.items ?? []}
        loading={inbox.isLoading}
        error={inbox.error ? { code: 'load', message: (inbox.error as Error).message } : null}
        onRefresh={refresh}
        onChanged={refresh}
      />
    </div>
  );
}

function CaptureBox({ onSaved }: { onSaved: () => void }) {
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
      setError({ code: 'empty', message: '请输入内容' });
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
          placeholder="标题（可选）"
          className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-sm"
        />
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="把要处理的内容粘贴到这里：会议纪要、消息、想法…"
          className="min-h-[120px] rounded-lg border border-[var(--color-border)] bg-transparent p-3 text-sm"
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--color-text-muted)]">
            AI 会在后台异步分析；未配置时仍会保存原文。
          </div>
          <Button onClick={submit} disabled={capture.isPending}>
            {capture.isPending ? '保存中…' : '保存到 Inbox'}
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
}: {
  items: SourceItem[];
  loading: boolean;
  error: { message: string; code?: string } | null;
  onRefresh: () => void;
  onChanged: () => void;
}) {
  if (loading || error) {
    return (
      <StateView loading={loading} error={error} onRetry={onRefresh}>
        {null}
      </StateView>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <div className="text-sm text-[var(--color-text-muted)]">
          没有等待处理的内容。你可以粘贴会议纪要、消息或脑中的事情。
        </div>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map(s => (
        <SourceCard key={s.id} source={s} onChanged={onChanged} />
      ))}
    </div>
  );
}

function SourceCard({ source, onChanged }: { source: SourceItem; onChanged: () => void }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [fallback, setFallback] = useState<{ reason?: string } | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const process = useMutation({
    mutationFn: () => processSource(source.id),
    onSuccess: r => {
      setProposal(r.proposal);
      setEvidence(r.evidence);
      setFallback(r.fallback ? { reason: r.fallbackReason } : null);
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
              {source.processingStatus}
            </Badge>
            <div className="text-sm font-medium">{source.title ?? '（无标题）'}</div>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {new Date(source.createdAt).toLocaleString()}
          </div>
        </div>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-2 text-xs dark:bg-white/5">
          {source.body?.slice(0, 600)}
        </pre>

        {error && <div className="text-xs text-red-600">{error.code}: {error.message}</div>}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => process.mutate()}
            disabled={process.isPending}
          >
            {process.isPending ? '处理中…' : proposal ? '重新分析' : 'AI 分析'}
          </Button>
          <ManualCreateButton sourceId={source.id} onCreated={onChanged} />
        </div>

        {fallback && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
            AI 未配置或不可用 ({fallback.reason ?? 'no_provider'})。请手动处理，或在「设置」中配置 Provider。
          </div>
        )}

        {proposal && proposal.changes.length > 0 && (
          <ProposalReview
            proposal={proposal}
            evidence={evidence}
            onChanged={() => {
              setProposal(null);
              setEvidence([]);
              onChanged();
            }}
            onReject={() => {
              rejectProposal(proposal.id, 'user_rejected').then(() => {
                setProposal(null);
                setEvidence([]);
                onChanged();
              }).catch(() => {/* surface later */});
            }}
          />
        )}
      </div>
    </Card>
  );
}

function ManualCreateButton({ sourceId, onCreated }: { sourceId: string; onCreated: () => void }) {
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
        手动创建 Commitment
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-[var(--color-border)] p-2 text-xs">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="承诺标题"
        className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
      />
      <textarea
        value={outcome}
        onChange={e => setOutcome(e.target.value)}
        placeholder="期望结果（outcome）"
        className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1">
          <span>截止</span>
          <input
            type="date"
            value={dueAt}
            onChange={e => setDueAt(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5"
          />
        </label>
        <label className="flex items-center gap-1">
          <span>优先级</span>
          <select
            value={importance}
            onChange={e => setImportance(e.target.value as 'critical' | 'high' | 'normal' | 'low')}
            className="rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5"
          >
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="normal">normal</option>
            <option value="low">low</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
        <Button size="sm" onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
          {create.isPending ? '创建中…' : '创建'}
        </Button>
      </div>
      {create.error && <div className="text-xs text-red-600">{(create.error as Error).message}</div>}
    </div>
  );
}

function ProposalReview({
  proposal,
  evidence,
  onChanged,
  onReject,
}: {
  proposal: Proposal;
  evidence: Evidence[];
  onChanged: () => void;
  onReject: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(proposal.changes.filter(c => c.confidence >= 0.85).map(c => c.changeId))
  );
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});

  const apply = useMutation({
    mutationFn: () =>
      applyProposal(proposal.id, {
        selection: Array.from(selected),
        userOverride: edits,
      }),
    onSuccess: onChanged,
  });

  const evidenceByChange = new Map<string, Evidence[]>();
  for (const c of proposal.changes) {
    const matched = evidence.filter(e => c.evidenceIds.includes(e.id));
    if (matched.length > 0) evidenceByChange.set(c.changeId, matched);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-2 text-xs">
      <div className="flex items-center justify-between text-sm font-medium">
        <div>AI 建议（{proposal.changes.length} 项）</div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onReject}>全部拒绝</Button>
          <Button size="sm" onClick={() => apply.mutate()} disabled={selected.size === 0 || apply.isPending}>
            {apply.isPending ? '应用中…' : `应用 ${selected.size} 项`}
          </Button>
        </div>
      </div>
      {apply.error && <div className="text-xs text-red-600">{(apply.error as Error).message}</div>}
      <div className="flex flex-col gap-2">
        {proposal.changes.map(c => (
          <ChangeReview
            key={c.changeId}
            change={c}
            checked={selected.has(c.changeId)}
            onCheck={v => {
              const next = new Set(selected);
              if (v) next.add(c.changeId);
              else next.delete(c.changeId);
              setSelected(next);
            }}
            evidence={evidenceByChange.get(c.changeId) ?? []}
            onEdit={(field, value) => {
              setEdits(prev => ({
                ...prev,
                [c.changeId]: { ...(prev[c.changeId] ?? {}), [field]: value },
              }));
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ChangeReview({
  change,
  checked,
  onCheck,
  evidence,
  onEdit,
}: {
  change: ProposedChange;
  checked: boolean;
  onCheck: (v: boolean) => void;
  evidence: Evidence[];
  onEdit: (field: string, value: unknown) => void;
}) {
  const draft = change.draft;
  return (
    <div className="rounded-md border border-[var(--color-border)] p-2">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)} className="mt-1" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={change.confidence >= 0.85 ? 'success' : change.confidence >= 0.6 ? 'info' : 'warning'}>
              {(change.confidence * 100).toFixed(0)}%
            </Badge>
            <span className="font-medium">{change.entity}.{change.op}</span>
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{change.reason}</div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {Object.entries(draft).slice(0, 6).map(([field, value]) => (
              <div key={field} className="text-xs">
                <div className="text-[10px] uppercase text-[var(--color-text-muted)]">{field}</div>
                <input
                  type="text"
                  defaultValue={String(value ?? '')}
                  onChange={e => onEdit(field, e.target.value)}
                  className="w-full rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-xs"
                />
              </div>
            ))}
          </div>
          {evidence.length > 0 && (
            <div className="mt-2 rounded bg-black/5 p-1 text-[11px] italic dark:bg-white/5">
              “{evidence[0]!.quote}”
            </div>
          )}
        </div>
      </label>
    </div>
  );
}
