import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Loader2, RotateCcw, ShieldCheck, Sparkles, Square, X } from 'lucide-react';
import {
  applyGraphProposal, cancelEventOperatorRun, getEventOperatorRun, getPendingGraphProposal,
  listEventOperatorRuns, rejectGraphProposal, retryEventOperatorRun, startEventOperatorRun,
  subscribeEventOperatorRun,
  type EventGraphProposal, type EventOperatorPhaseId, type EventOperatorRun, type GraphOperation,
} from '../api/client';
import type { ContextRef } from './EventOperatorContextPreview';

type Language = 'zh' | 'en';
type ReviewState = 'accepted' | 'rejected';
const PHASES: EventOperatorPhaseId[] = ['collect', 'retrieve', 'extract', 'resolve', 'prepare', 'review'];
const PHASE_LABEL: Record<EventOperatorPhaseId, { zh: string; en: string }> = {
  collect: { zh: '收集', en: 'Collect' }, retrieve: { zh: '检索', en: 'Retrieve' }, extract: { zh: '提取', en: 'Extract' },
  resolve: { zh: '解析', en: 'Resolve' }, prepare: { zh: '准备', en: 'Prepare' }, review: { zh: '审阅', en: 'Review' },
};

interface Props {
  language: Language; eventId: string; mindmapId: string;
  initialContextRefs?: ContextRef[]; autoStart?: boolean;
  onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void;
  onApplied: () => void; onClose: () => void;
  /** Called before a proposal apply so the parent can snapshot undo history. */
  onBeforeApply?: () => Promise<boolean> | Promise<void> | void;
  onProposalChange?: (proposal: EventGraphProposal | null, selection: Set<string>, activeChangeId: string | null) => void;
}

export function AgentRunPanel({ language, eventId, mindmapId, initialContextRefs = [], autoStart = false, onNotice, onApplied, onClose, onProposalChange, onBeforeApply }: Props) {
  const zh = language === 'zh';
  const [proposal, setProposal] = useState<EventGraphProposal | null>(null);
  const [run, setRun] = useState<EventOperatorRun | null>(null);
  const [review, setReview] = useState<Record<string, ReviewState>>({});
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [streamState, setStreamState] = useState<'idle' | 'connected' | 'reconnecting'>('idle');
  const [started, setStarted] = useState(false);
  const submitLock = useRef(false);
  const autoStartRef = useRef(false);
  const selection = useMemo(() => new Set(Object.entries(review).filter(([, state]) => state === 'accepted').map(([id]) => id)), [review]);
  const activeOp = proposal?.operations.find((op) => op.changeId === activeChangeId) ?? null;

  const setProposalReady = useCallback((next: EventGraphProposal | null) => {
    setProposal(next);
    if (next) {
      // Review starts neutral/rejected. "Accept all" is deliberately not the
      // default; the explicit low-risk action is the only batch selector.
      setReview(Object.fromEntries(next.operations.map((op) => [op.changeId, 'rejected'])));
      setActiveChangeId(next.operations[0]?.changeId ?? null);
    }
  }, []);
  useEffect(() => { onProposalChange?.(proposal, selection, activeChangeId); }, [activeChangeId, onProposalChange, proposal, selection]);
  const refresh = useCallback(async () => {
    const [pending, runs] = await Promise.all([getPendingGraphProposal(eventId), listEventOperatorRuns(eventId)]);
    // Do not let a slower initial "pending: null" response erase a proposal
    // returned by the concurrently started Run.
    if (pending.proposal) setProposalReady(pending.proposal);
    setRun((current) => current ?? runs.items[0] ?? null);
    if (pending.proposal) setStarted(true);
  }, [eventId, setProposalReady]);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);

  // Durable run recovery. Polling is a compatibility fallback when SSE is unavailable.
  useEffect(() => {
    if (!run || !['queued', 'starting', 'running', 'applying'].includes(run.status)) return;
    const timer = window.setInterval(() => void getEventOperatorRun(run.id).then(({ run: next }) => {
      setRun(next);
      if (next.status === 'waiting_review') void getPendingGraphProposal(eventId).then(({ proposal }) => setProposalReady(proposal));
    }).catch(() => {}), 1500);
    return () => window.clearInterval(timer);
  }, [eventId, run?.id, run?.status, setProposalReady]);

  useEffect(() => {
    if (!run || !['queued', 'starting', 'running', 'waiting_review', 'applying'].includes(run.status)) { setStreamState('idle'); return; }
    const key = `dailyflow:agent-run-cursor:${run.id}`;
    let cursor: string | undefined;
    try { cursor = sessionStorage.getItem(key) ?? undefined; } catch { /* optional */ }
    return subscribeEventOperatorRun(run.id, cursor, {
      onOpen: () => setStreamState('connected'),
      onError: () => setStreamState('reconnecting'),
      onEvent: (event) => {
        try { sessionStorage.setItem(key, event.cursor); } catch { /* optional */ }
        if (event.type === 'proposal.ready') void getPendingGraphProposal(eventId).then(({ proposal }) => setProposalReady(proposal));
        void getEventOperatorRun(run.id).then(({ run }) => setRun(run)).catch(() => {});
      },
    });
  }, [eventId, run?.id, run?.status, setProposalReady]);

  const start = useCallback(async () => {
    if (submitLock.current) return;
    submitLock.current = true; setLoading(true); setStarted(true);
    try {
      const result = await startEventOperatorRun(eventId, { mindmapId, trigger: initialContextRefs.some((ref) => ref.type === 'note') ? 'meeting_note' : 'event_canvas', selectedContextRefs: initialContextRefs, templateMaxOps: 6 });
      setRun(result.run); setProposalReady(result.proposal);
      onNotice?.(result.proposal ? (zh ? '建议已生成，请逐项审阅。' : 'Suggestions ready for review.') : (zh ? 'Run 已启动，可离开页面后恢复。' : 'Run started and can be resumed later.'), 'info');
    } catch (error) { onNotice?.(error instanceof Error ? error.message : (zh ? '启动失败' : 'Failed to start'), 'error'); }
    finally { setLoading(false); submitLock.current = false; }
  }, [eventId, initialContextRefs, mindmapId, onNotice, setProposalReady, zh]);
  useEffect(() => { if (autoStart && !autoStartRef.current) { autoStartRef.current = true; void start(); } }, [autoStart, start]);

  async function apply() {
    if (!proposal || submitLock.current) return;
    submitLock.current = true; setLoading(true);
    try {
      if (onBeforeApply) await onBeforeApply();
      const result = await applyGraphProposal(eventId, proposal.id, { selection: [...selection], userOverrides: overrides });
      if (result.staleChangeIds.length) { onNotice?.(zh ? '事件已变化；冲突项不能批量接受，请重新生成。' : 'The event changed. Conflicted items cannot be applied; regenerate.', 'error'); return; }
      onNotice?.(zh ? `已生成 ${result.createdCommitments} 个承诺，并更新画布。` : `Generated ${result.createdCommitments} commitments and updated the canvas.`, 'success');
      setProposalReady(null); onApplied(); onClose();
    } catch (error) { onNotice?.(error instanceof Error ? error.message : (zh ? '提交失败' : 'Apply failed'), 'error'); }
    finally { setLoading(false); submitLock.current = false; }
  }
  async function rejectAll() {
    if (!proposal || submitLock.current) return;
    submitLock.current = true; setLoading(true);
    try { await rejectGraphProposal(eventId, proposal.id); setProposalReady(null); onApplied(); onNotice?.(zh ? '建议已拒绝。' : 'Proposal rejected.', 'info'); }
    catch (error) { onNotice?.(error instanceof Error ? error.message : (zh ? '拒绝失败' : 'Reject failed'), 'error'); }
    finally { setLoading(false); submitLock.current = false; }
  }
  function acceptLowRisk() {
    if (!proposal || proposal.riskLevel === 'high') return;
    setReview((prev) => ({ ...prev, ...Object.fromEntries(proposal.operations.filter(isLowRisk).map((op) => [op.changeId, 'accepted'])) }));
  }
  const acceptedOps = proposal?.operations.filter((op) => selection.has(op.changeId)) ?? [];
  const entityCount = acceptedOps.filter((op) => op.domainDraft?.entity && op.domainDraft.entity !== 'none').length;

  return <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-surface-elevated shadow-2xl" data-testid="agent-run-panel">
    <header className="flex items-start justify-between border-b border-border px-5 py-4"><div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><h2 className="text-sm font-semibold text-text-heading">{zh ? 'AI 推进' : 'AI Push forward'}</h2>{run && <StatusPill status={run.status} language={language} />}{streamState !== 'idle' && <span className={`h-1.5 w-1.5 rounded-full ${streamState === 'connected' ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`} title={streamState === 'connected' ? 'SSE connected' : 'SSE reconnecting'} />}</div><p className="mt-1 text-[11px] text-text-muted">{run?.modelProvider ? `${run.modelProvider} · ${run.model}` : (zh ? '未配置模型时不会伪装真实推理，请到设置完成配置' : 'Model inference is unavailable until configured in Settings')}</p></div><button onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="rounded-lg p-1.5 text-text-muted hover:bg-surface"><X className="h-4 w-4" /></button></header>
    {run && <RunTimeline run={run} language={language} onRunChange={setRun} />}
    {run?.error && <div className="mx-5 mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800"><div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /><div><p className="font-medium">{run.error.message}</p><p className="mt-1 opacity-75">{zh ? `写入：无 · ${run.error.retryable ? '可重试' : '不可重试'}` : `Writes: none · ${run.error.retryable ? 'Retryable' : 'Not retryable'}`}</p></div></div>{run.error.retryable && <button type="button" onClick={() => void retryEventOperatorRun(run.id).then(({ run }) => setRun(run))} className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium"><RotateCcw className="h-3 w-3" />{zh ? '重试' : 'Retry'}</button>}</div>}
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {!proposal ? <div className="flex min-h-72 flex-col items-center justify-center gap-4 text-center"><p className="max-w-sm text-sm text-text-muted">{run && ['queued', 'starting', 'running', 'applying'].includes(run.status) ? (zh ? 'Run 正在后台运行。关闭面板或切换页面后仍可恢复。' : 'The run continues in the background and can be resumed after navigation.') : (zh ? '还没有待审阅建议。' : 'No suggestions await review.')}</p><button onClick={() => void start()} disabled={loading || Boolean(run && ['queued', 'starting', 'running'].includes(run.status))} data-testid="agent-run-start" className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{started && loading ? (zh ? '正在启动…' : 'Starting…') : (zh ? '开始 AI 拆解' : 'Start AI breakdown')}</button></div> : <>
        <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-text-secondary">{proposal.summary}</p><button type="button" onClick={acceptLowRisk} disabled={proposal.riskLevel === 'high'} className="shrink-0 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-40" data-testid="agent-accept-low-risk">{zh ? '接受低风险建议' : 'Accept low-risk'}</button></div>
        <div className="space-y-2">{proposal.operations.map((op) => <ReviewRow key={op.changeId} op={op} state={review[op.changeId] ?? 'rejected'} active={activeChangeId === op.changeId} onOpen={() => setActiveChangeId(op.changeId)} onState={(state) => setReview((prev) => ({ ...prev, [op.changeId]: state }))} />)}</div>
        {activeOp && <NodeInspector op={activeOp} eventId={eventId} language={language} values={overrides[activeOp.changeId] ?? {}} onChange={(values) => setOverrides((prev) => ({ ...prev, [activeOp.changeId]: values }))} onAccept={() => setReview((prev) => ({ ...prev, [activeOp.changeId]: 'accepted' }))} onReject={() => setReview((prev) => ({ ...prev, [activeOp.changeId]: 'rejected' }))} />}
      </>}
    </div>
    {proposal && <footer className="border-t border-border px-5 py-4"><div className="mb-3 flex items-center justify-between text-xs text-text-muted"><span>{zh ? `已选择 ${selection.size} / ${proposal.operations.length}` : `${selection.size} / ${proposal.operations.length} selected`}</span><span>{zh ? `将变更 ${acceptedOps.length} 个节点 · ${entityCount} 个实体` : `${acceptedOps.length} nodes · ${entityCount} entities`}</span></div><div className="flex justify-end gap-2"><button onClick={() => void rejectAll()} disabled={loading} className="rounded-lg px-3.5 py-2 text-sm text-text-secondary hover:bg-surface" data-testid="agent-run-reject">{zh ? '全部拒绝' : 'Reject all'}</button><button onClick={() => void apply()} disabled={loading || selection.size === 0} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50" data-testid="agent-run-apply">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{zh ? `提交审阅（${selection.size}）` : `Apply review (${selection.size})`}</button></div></footer>}
  </div>;
}

function isLowRisk(op: GraphOperation) { return op.confidence >= 0.85 && op.op === 'add_node' && op.node?.kind !== 'waiting' && op.domainDraft?.entity !== 'waiting_commitment'; }
function StatusPill({ status, language }: { status: string; language: Language }) { const zh = language === 'zh'; return <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">{{ queued: zh ? '排队' : 'Queued', starting: zh ? '启动' : 'Starting', running: zh ? '运行中' : 'Running', waiting_review: zh ? '待审阅' : 'Review', applying: zh ? '提交中' : 'Applying', succeeded: zh ? '完成' : 'Done', failed: zh ? '失败' : 'Failed', cancelled: zh ? '已停止' : 'Stopped' }[status] ?? status}</span>; }
function RunTimeline({ run, language, onRunChange }: { run: EventOperatorRun; language: Language; onRunChange: (run: EventOperatorRun) => void }) { const index = PHASES.indexOf(run.phase); const active = ['queued', 'starting', 'running', 'waiting_review', 'applying'].includes(run.status); return <div className="border-b border-border bg-background/50 px-5 py-3"><div className="flex items-center">{PHASES.map((phase, i) => <div key={phase} className="flex min-w-0 flex-1 items-center"><div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] ${i < index || run.status === 'succeeded' ? 'bg-emerald-500 text-white' : i === index ? 'bg-accent text-white ring-4 ring-accent/10' : 'bg-black/5 text-text-muted'}`}>{i < index || run.status === 'succeeded' ? <Check className="h-3 w-3" /> : i + 1}</div>{i < PHASES.length - 1 && <div className={`h-px flex-1 ${i < index ? 'bg-emerald-400' : 'bg-border'}`} />}</div>)}</div><div className="mt-1.5 flex justify-between text-[9px] text-text-muted">{PHASES.map((phase) => <span key={phase}>{PHASE_LABEL[phase][language]}</span>)}</div><div className="mt-2 flex items-center justify-between text-[10px] text-text-muted"><span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-600" />{language === 'zh' ? `白名单工具 · ${run.metrics?.toolCalls ?? 0} 次调用` : `Allowlisted tools · ${run.metrics?.toolCalls ?? 0} calls`}</span>{active && run.status !== 'waiting_review' && <button type="button" onClick={() => void cancelEventOperatorRun(run.id).then(({ run }) => onRunChange(run))} className="inline-flex items-center gap-1 text-red-600"><Square className="h-3 w-3" />{language === 'zh' ? '停止' : 'Stop'}</button>}</div></div>; }
function ReviewRow({ op, state, active, onOpen, onState }: { op: GraphOperation; state: ReviewState; active: boolean; onOpen: () => void; onState: (state: ReviewState) => void }) { return <div className={`flex items-center gap-2 rounded-xl border p-2.5 ${active ? 'border-accent/50 bg-accent/[0.04]' : 'border-border'} ${state === 'rejected' ? 'opacity-55' : ''}`}><button type="button" onClick={() => onState(state === 'accepted' ? 'rejected' : 'accepted')} className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${state === 'accepted' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'}`} data-testid={`agent-suggestion-${op.changeId}`} aria-label="select suggestion">{state === 'accepted' && <Check className="h-3 w-3" />}</button><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium text-text-heading">{op.node?.text ?? op.patch?.text ?? op.reason}</span><span className="mt-0.5 block text-[10px] text-text-muted">{op.op} · {Math.round(op.confidence * 100)}% · {op.reason}</span></button><ChevronRight className="h-4 w-4 text-text-muted" /></div>; }
function NodeInspector({ op, eventId, language, values, onChange, onAccept, onReject }: { op: GraphOperation; eventId: string; language: Language; values: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void; onAccept: () => void; onReject: () => void }) { const zh = language === 'zh'; const title = String(values.text ?? op.node?.text ?? op.patch?.text ?? ''); const dueAt = String(values.dueAt ?? op.domainDraft?.dueAt ?? ''); return <section className="mt-4 rounded-xl border border-border bg-background/60 p-4" data-testid="proposal-node-inspector"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-text-heading">{zh ? '节点 Inspector' : 'Node Inspector'}</h3><span className="text-[10px] text-text-muted">{op.op}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div><span className="text-text-muted">{zh ? '父节点' : 'Parent'}</span><p className="truncate text-text-heading">{op.parentId ?? op.newParentId ?? eventId}</p></div><div><span className="text-text-muted">Confidence</span><p className="text-text-heading">{Math.round(op.confidence * 100)}%</p></div></div><label className="mt-3 block text-[11px] text-text-muted">{zh ? '标题（仅本地，提交后写入）' : 'Title (local until apply)'}<input value={title} onChange={(event) => onChange({ ...values, text: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-heading outline-none focus:border-accent" /></label>{(op.node?.kind === 'task' || op.node?.kind === 'waiting') && <label className="mt-2 block text-[11px] text-text-muted">{zh ? '截止 / 复查时间' : 'Due / review date'}<input value={dueAt} onChange={(event) => onChange({ ...values, dueAt: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm" placeholder="YYYY-MM-DD" /></label>}{op.op === 'update_node' && <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-lg bg-red-50 p-2"><span className="text-red-600">Before</span><p>{op.nodeId}</p></div><div className="rounded-lg bg-emerald-50 p-2"><span className="text-emerald-600">After</span><p>{title}</p></div></div>}<p className="mt-3 text-xs text-text-secondary"><span className="font-medium">{zh ? '理由：' : 'Reason: '}</span>{op.reason}</p><div className="mt-2 text-[11px] text-text-muted">Evidence: {op.evidenceIds?.length ? op.evidenceIds.join(', ') : (zh ? '无引用' : 'No references')}</div><div className="mt-3 flex gap-2"><button type="button" onClick={onReject} className="rounded-md border border-border px-2.5 py-1.5 text-xs">{zh ? '拒绝' : 'Reject'}</button><button type="button" onClick={onAccept} className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs text-white">{zh ? '接受' : 'Accept'}</button></div></section>; }
