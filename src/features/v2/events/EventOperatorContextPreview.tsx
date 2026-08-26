import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, FileText, Loader2, LockKeyhole, X } from 'lucide-react';
import type { EventDetail } from '../../../api/client';
import { getEventOperatorHealth, type EventOperatorHealth } from '../api/client';

export type ContextRef = { type: string; id: string };

interface Props {
  event: EventDetail;
  language: 'zh' | 'en';
  defaultRefs?: ContextRef[];
  onCancel: () => void;
  onConfirm: (refs: ContextRef[]) => void;
}

export function EventOperatorContextPreview({ event, language, defaultRefs = [], onCancel, onConfirm }: Props) {
  const [health, setHealth] = useState<EventOperatorHealth | null>(null);
  const [checking, setChecking] = useState(true);
  // EventDetail intentionally does not guess domain refs from legacy task IDs.
  // Only refs handed off by a trusted source (for example a meeting Note) are selectable.
  const candidates = useMemo<ContextRef[]>(() => defaultRefs, [defaultRefs]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(candidates.map((item) => `${item.type}:${item.id}`)));

  useEffect(() => {
    let live = true;
    getEventOperatorHealth().then((value) => { if (live) setHealth(value); }).catch(() => {}).finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, []);

  const zh = language === 'zh';
  const openCount = event.nodes.filter((node) => node.execution?.status === 'todo').length;
  const noteCount = candidates.filter((item) => item.type === 'note').length;
  const model = health?.health.modelConfigured
    ? `${health.runtime}${health.health.version ? ` ${health.health.version}` : ''}`
    : (zh ? '模型尚未配置' : 'Model not configured');
  const canStart = health?.health.ready === true && health.health.modelConfigured === true;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4" onClick={onCancel} data-testid="event-operator-context-preview">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-elevated shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-border px-5 py-4">
          <div><h2 className="text-base font-semibold text-text-heading">{zh ? '确认 AI 上下文' : 'Confirm AI context'}</h2><p className="mt-1 text-xs text-text-muted">{zh ? '确认后才会创建 Run；取消不会写入任何内容。' : 'A run is created only after confirmation. Cancel writes nothing.'}</p></div>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-text-muted hover:bg-surface" aria-label={zh ? '取消' : 'Cancel'}><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            <ContextStat label="Event" value="1" />
            <ContextStat label={zh ? '笔记 / Evidence' : 'Notes / Evidence'} value={String(noteCount)} />
            <ContextStat label={zh ? '开放承诺' : 'Open commitments'} value={String(openCount)} />
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-text-heading"><Bot className="h-4 w-4 text-accent" />{checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : model}</div>
            <div className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-text-muted"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />{zh ? '只发送下列已选类别；API Key、完整工作区和隐藏思维链不会进入上下文。' : 'Only selected categories are sent. API keys, the full workspace, and hidden reasoning are excluded.'}</div>
          </div>
          {!checking && !canStart && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{zh ? '请先到「设置 → AI 模型」配置并通过 Runtime 诊断；未配置时不会把模板冒充真实模型结果。' : 'Configure a model and pass Runtime diagnostics in Settings first. Template output is never presented as real inference.'}</p>}
          {candidates.length > 0 && <div><p className="mb-2 text-xs font-medium text-text-heading">{zh ? '额外上下文（可取消）' : 'Additional context (optional)'}</p><div className="max-h-36 space-y-1 overflow-y-auto">{candidates.map((item) => { const key = `${item.type}:${item.id}`; return <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface"><input type="checkbox" checked={selected.has(key)} onChange={() => setSelected((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; })} className="accent-accent" /><FileText className="h-3.5 w-3.5 text-text-muted" /><span className="truncate">{item.type} · {item.id}</span></label>; })}</div></div>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4"><button type="button" onClick={onCancel} className="rounded-lg px-3.5 py-2 text-sm text-text-secondary hover:bg-surface">{zh ? '取消' : 'Cancel'}</button><button type="button" disabled={!canStart} onClick={() => onConfirm(candidates.filter((item) => selected.has(`${item.type}:${item.id}`)))} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" />{zh ? '确认并开始' : 'Confirm & start'}</button></footer>
      </div>
    </div>
  );
}

function ContextStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-background/60 p-3"><div className="text-lg font-semibold tabular-nums text-text-heading">{value}</div><div className="mt-0.5 text-[10px] text-text-muted">{label}</div></div>;
}
