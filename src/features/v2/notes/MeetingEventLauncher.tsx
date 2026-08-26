import { useState } from 'react';
import { ArrowRight, Loader2, Sparkles, X } from 'lucide-react';
import type { NoteDocument } from '../api/client';
import { useCreateEvent, useEvents } from '../hooks/useEvents';

export function MeetingEventLauncher({ note, language = 'en', onNotice }: { note: NoteDocument; language?: 'zh' | 'en'; onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void }) {
  const zh = language === 'zh';
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const events = useEvents();
  const create = useCreateEvent();
  const active = (events.data?.events ?? []).filter((event) => event.status === 'active');

  function go(eventId: string) {
    const detail = { eventId, contextRefs: [{ type: 'note', id: note.id }], trigger: 'meeting_note' };
    try { sessionStorage.setItem(`dailyflow:event-operator-context:${eventId}`, JSON.stringify(detail)); } catch { /* optional */ }
    window.dispatchEvent(new CustomEvent('df:open-event-operator', { detail }));
    setOpen(false);
  }
  async function createAndGo() {
    setCreating(true);
    try {
      const created = await create.mutateAsync({ title: note.title?.trim() || (zh ? '会议推进' : 'Meeting follow-up'), context: 'work' });
      onNotice?.(zh ? '已创建 Event，进入上下文确认。' : 'Event created. Review context before starting.', 'success');
      go(created.id);
    } catch (error) { onNotice?.(error instanceof Error ? error.message : (zh ? '创建失败' : 'Create failed'), 'error'); }
    finally { setCreating(false); }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-medium text-accent" data-testid="meeting-ai-push"><Sparkles className="h-3.5 w-3.5" />{zh ? 'AI 推进会议' : 'AI push meeting'}</button>
    {open && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" onClick={() => setOpen(false)}><div className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated shadow-2xl" onClick={(event) => event.stopPropagation()} data-testid="meeting-event-launcher"><header className="flex items-start justify-between border-b border-border p-4"><div><h3 className="text-sm font-semibold text-text-heading">{zh ? '把会议关联到 Event' : 'Link meeting to an Event'}</h3><p className="mt-1 text-xs text-text-muted">{zh ? '不会直接创建孤立任务。选择现有 Event，或先创建一个。' : 'No orphan tasks are created. Choose an Event or create one first.'}</p></div><button onClick={() => setOpen(false)} aria-label={zh ? '关闭' : 'Close'}><X className="h-4 w-4" /></button></header><div className="space-y-3 p-4">{active.length > 0 && <label className="block text-xs text-text-muted">{zh ? '现有 Event' : 'Existing Event'}<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-heading"><option value="">{zh ? '选择…' : 'Choose…'}</option>{active.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}<button type="button" onClick={() => selectedId && go(selectedId)} disabled={!selectedId} className="flex w-full items-center justify-between rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40">{zh ? '更新所选 Event' : 'Update selected Event'}<ArrowRight className="h-4 w-4" /></button><button type="button" onClick={() => void createAndGo()} disabled={creating} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-text-heading">{creating && <Loader2 className="h-4 w-4 animate-spin" />}{zh ? '创建新 Event 并继续' : 'Create Event & continue'}</button></div></div></div>}
  </>;
}
