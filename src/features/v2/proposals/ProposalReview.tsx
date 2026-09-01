import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  applyProposal,
  getProposal,
  rejectProposal,
  type Evidence,
  type Proposal,
  type ProposedChange,
} from '../api/client';
import { Badge, Button } from '../components/States';

type ProposalReviewProps = {
  proposal: Proposal;
  evidence?: Evidence[];
  language?: 'zh' | 'en';
  initiallyExpanded?: boolean;
  onChanged: () => void;
};

export function ProposalReview({
  proposal,
  evidence,
  language = 'zh',
  initiallyExpanded = false,
  onChanged,
}: ProposalReviewProps) {
  const isZh = language === 'zh';
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(proposal.changes.filter(change => change.confidence >= 0.85).map(change => change.changeId)),
  );
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [idempotencyKey] = useState(
    () => `proposal-accept:${proposal.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
  );
  const details = useQuery({
    queryKey: ['proposal-review', proposal.workspaceId, proposal.id],
    queryFn: () => getProposal(proposal.id),
    enabled: expanded && evidence === undefined,
  });
  const resolvedEvidence = evidence ?? details.data?.evidence ?? [];

  const apply = useMutation({
    mutationFn: () => applyProposal(proposal.id, {
      idempotencyKey,
      selection: Array.from(selected),
      userOverride: edits,
    }),
    onSuccess: onChanged,
  });
  const reject = useMutation({
    mutationFn: () => rejectProposal(proposal.id, 'user_rejected'),
    onSuccess: onChanged,
  });

  const evidenceByChange = useMemo(() => {
    const map = new Map<string, Evidence[]>();
    for (const change of proposal.changes) {
      const matched = resolvedEvidence.filter(item => change.evidenceIds.includes(item.id));
      if (matched.length > 0) map.set(change.changeId, matched);
    }
    return map;
  }, [proposal.changes, resolvedEvidence]);

  const busy = apply.isPending || reject.isPending;
  return (
    <article className="rounded-xl border border-border bg-surface/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-heading">
              {proposalKindLabel(proposal.kind, isZh)}
            </span>
            <Badge tone="warning">
              {proposal.changes.length} {isZh ? '项建议' : 'suggestions'}
            </Badge>
          </div>
          <div className="mt-1 text-[12px] text-text-muted">
            {expanded
              ? (isZh ? '逐项确认、编辑或取消选择' : 'Review, edit, or deselect each change')
              : (isZh ? '展开查看具体修改和写入位置' : 'Expand to inspect changes and destinations')}
          </div>
        </button>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(value => !value)}>
          {expanded ? (isZh ? '收起' : 'Collapse') : (isZh ? '审核' : 'Review')}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2">
          {details.isLoading && evidence === undefined && (
            <div className="text-xs text-text-muted">{isZh ? '正在加载证据…' : 'Loading evidence…'}</div>
          )}
          {proposal.changes.map(change => (
            <ChangeReview
              key={change.changeId}
              change={change}
              checked={selected.has(change.changeId)}
              evidence={evidenceByChange.get(change.changeId) ?? []}
              isZh={isZh}
              onCheck={checked => {
                setSelected(previous => {
                  const next = new Set(previous);
                  if (checked) next.add(change.changeId);
                  else next.delete(change.changeId);
                  return next;
                });
              }}
              onEdit={(field, value) => {
                setEdits(previous => ({
                  ...previous,
                  [change.changeId]: { ...(previous[change.changeId] ?? {}), [field]: value },
                }));
              }}
            />
          ))}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.mutate()}>
              {reject.isPending ? (isZh ? '拒绝中…' : 'Rejecting…') : (isZh ? '全部拒绝' : 'Reject all')}
            </Button>
            <Button size="sm" disabled={busy || selected.size === 0} onClick={() => apply.mutate()}>
              {apply.isPending
                ? (isZh ? '应用中…' : 'Applying…')
                : (isZh ? `应用 ${selected.size} 项` : `Apply ${selected.size}`)}
            </Button>
          </div>
          {(apply.error || reject.error || details.error) && (
            <div className="text-xs text-red-600">
              {(apply.error || reject.error || details.error as Error)?.message}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ChangeReview({
  change,
  checked,
  evidence,
  isZh,
  onCheck,
  onEdit,
}: {
  change: ProposedChange;
  checked: boolean;
  evidence: Evidence[];
  isZh: boolean;
  onCheck: (checked: boolean) => void;
  onEdit: (field: string, value: unknown) => void;
}) {
  return (
    <div className={`rounded-lg border p-3 ${checked ? 'border-accent/30 bg-accent/[0.03]' : 'border-border opacity-70'}`}>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={checked} onChange={event => onCheck(event.target.checked)} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={change.confidence >= 0.85 ? 'success' : change.confidence >= 0.6 ? 'info' : 'warning'}>
              {(change.confidence * 100).toFixed(0)}%
            </Badge>
            <span className="font-medium text-text-heading">
              {changeLabel(change, isZh)}
            </span>
            <span className="text-[11px] text-text-muted">
              {isZh ? '写入：' : 'Destination: '}{destinationLabel(change.entity, isZh)}
            </span>
          </div>
          <div className="mt-1 text-[12px] leading-5 text-text-muted">{change.reason}</div>
          {change.targetId && (
            <div className="mt-1 text-[11px] text-text-muted">
              {isZh ? '目标实体：' : 'Target: '}{change.targetId}
            </div>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(change.draft).slice(0, 8).map(([field, value]) => (
              <label key={field} className="text-xs">
                <span className="mb-0.5 block text-[11px] uppercase text-text-muted">{field}</span>
                <input
                  type="text"
                  defaultValue={String(value ?? '')}
                  onChange={event => onEdit(field, event.target.value)}
                  className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-accent/40"
                />
              </label>
            ))}
          </div>
          {evidence.length > 0 && (
            <blockquote className="mt-2 rounded-md bg-black/5 px-2 py-1.5 text-[12px] italic dark:bg-white/5">
              “{evidence[0]!.quote}”
            </blockquote>
          )}
        </div>
      </label>
    </div>
  );
}

function proposalKindLabel(kind: Proposal['kind'], isZh: boolean): string {
  const labels: Record<Proposal['kind'], [string, string]> = {
    extract_commitments: ['提取事项', 'Extract work'],
    triage: ['整理事项', 'Triage work'],
    daily_plan: ['今日计划', 'Daily plan'],
    replan: ['调整计划', 'Replan'],
    close_loop: ['完成后的后续', 'Follow-up'],
    merge_entities: ['合并重复对象', 'Merge duplicates'],
  };
  return labels[kind]?.[isZh ? 0 : 1] ?? kind;
}

function changeLabel(change: ProposedChange, isZh: boolean): string {
  const op = {
    create: isZh ? '创建' : 'Create',
    update: isZh ? '更新' : 'Update',
    merge: isZh ? '合并' : 'Merge',
    archive: isZh ? '归档' : 'Archive',
    transition: isZh ? '改变状态' : 'Change state',
  }[change.op];
  const entity = {
    commitment: isZh ? '事项' : 'work item',
    outcome: isZh ? '结果' : 'outcome',
    project: isZh ? '项目' : 'project',
    person: isZh ? '联系人' : 'person',
    decision: isZh ? '决定' : 'decision',
    plan: isZh ? '计划' : 'plan',
    evidence: isZh ? '证据' : 'evidence',
    source: isZh ? '来源' : 'source',
  }[change.entity];
  return `${op}${isZh ? '' : ' '}${entity}`;
}

function destinationLabel(entity: ProposedChange['entity'], isZh: boolean): string {
  if (entity === 'plan') return isZh ? '今天 / 计划' : 'Today / Plan';
  if (entity === 'decision' || entity === 'outcome' || entity === 'person' || entity === 'project') {
    return isZh ? '记忆库' : 'Memory';
  }
  if (entity === 'source' || entity === 'evidence') return isZh ? '笔记 / 来源' : 'Notes / Sources';
  return isZh ? '今天 / 待处理' : 'Today / Needs attention';
}
