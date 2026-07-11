/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Granola × DailyFlow — Phase 1 meeting capture modal.
 *
 * MVP flow (no real audio yet — Phase 2 swaps transcribe for whisper.cpp):
 *   1. User fills meeting title + participants + pastes raw transcript.
 *   2. "转录" mock call → timestamped segments.
 *   3. "整理" AI call (proxied) → Markdown note + action items.
 *   4. User reviews / edits Markdown, picks which action items to add as
 *      today's tasks.
 *   5. "保存" creates the meeting_note and (optionally) the picked tasks.
 *
 * NOTE: The component deliberately mirrors the language of the existing
 * AI Summary / NoteEditor panels so the UX feels native to DailyFlow.
 */
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Users, Clock, FileText, X, Loader2, Sparkles, Plus, Check, ListChecks } from 'lucide-react';
import { meetingsApi, notesApi, tasksApi, type MeetingActionItem, type MeetingSegment } from '../api/client';
import { getActiveAiConfig } from '../types/models';
import { getFriendlyAiErrorMessage } from '../utils/aiErrorMessage';

type Step = 'input' | 'organize' | 'review' | 'saving';

interface MeetingCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'zh';
  activeContext: 'work' | 'life';
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** Called after the meeting_note is saved so the parent can refresh. */
  onSaved?: () => void;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function nowDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function MeetingCapture({ isOpen, onClose, language, activeContext, showToast, onSaved }: MeetingCaptureProps) {
  // Form state
  const [title, setTitle] = useState('');
  const [participantsText, setParticipantsText] = useState('');
  const [transcript, setTranscript] = useState('');

  // Pipeline state
  const [step, setStep] = useState<Step>('input');
  const [segments, setSegments] = useState<MeetingSegment[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([]);
  const [pickedItems, setPickedItems] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  const participants = useMemo(
    () => participantsText.split(/[,，\n]/).map(p => p.trim()).filter(Boolean),
    [participantsText]
  );

  // Reset on open so the next meeting starts clean.
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setParticipantsText('');
      setTranscript('');
      setSegments([]);
      setMarkdown('');
      setActionItems([]);
      setPickedItems(new Set());
      setError('');
      setStep('input');
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement;
      const isEditing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditing || e.isComposing) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const runTranscribe = async () => {
    if (!transcript.trim()) {
      setError(language === 'zh' ? '请先粘贴会议转录文本' : 'Paste a transcript first.');
      return;
    }
    setError('');
    try {
      const result = await meetingsApi.transcribe({
        text: transcript,
        date: nowDateStr(),
        participants,
      });
      setSegments(result.segments);
      setStep('organize');
    } catch (e: any) {
      console.error('Transcribe failed:', e);
      setError(e?.message || String(e));
    }
  };

  const runOrganize = async () => {
    const cfg = getActiveAiConfig();
    if (!cfg || !cfg.apiKey || !cfg.baseUrl) {
      setError(language === 'zh'
        ? 'AI 未配置，请在「模型 & Skills」配置 API Key 后再整理。'
        : 'AI not configured. Add an API key in "Models & Skills" first.');
      return;
    }
    setError('');
    try {
      const result = await meetingsApi.summarize({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        transcript,
        segments,
        title: title.trim() || (language === 'zh' ? '未命名会议' : 'Untitled meeting'),
        participants,
        date: nowDateStr(),
        time: nowTimeStr(),
        language,
      });
      setMarkdown(result.markdown);
      setActionItems(result.actionItems);
      // Default: pick all action items so user has to opt out, not opt in.
      setPickedItems(new Set(result.actionItems.map((_, i) => i)));
      setStep('review');
    } catch (e: any) {
      console.error('Organize failed:', e);
      const raw = e?.message || String(e);
      setError(getFriendlyAiErrorMessage(raw, language, 'AI'));
    }
  };

  const togglePick = (idx: number) => {
    setPickedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError(language === 'zh' ? '请填写会议标题' : 'Meeting title is required.');
      return;
    }
    setError('');
    setStep('saving');
    try {
      const today = nowDateStr();
      const note = await notesApi.create({
        title: title.trim(),
        body: markdown,
        type: 'meeting_note',
        date: today,
        time: nowTimeStr(),
        context: activeContext,
        tags: ['meeting'],
        linkedTaskIds: [],
        linkedProjectIds: [],
        participants: participants.length ? participants : undefined,
      });

      // Create the picked action items as today's tasks. Best-effort: a single
      // task failure should not roll back the saved note.
      const picked = actionItems.filter((_, i) => pickedItems.has(i));
      const createdIds: string[] = [];
      for (const item of picked) {
        try {
          await tasksApi.create(today, {
            title: item.title,
            tags: ['meeting-link', `meeting:${note.id.slice(0, 8)}`, activeContext],
            priority: item.priority || 'medium',
          });
        } catch (taskErr) {
          console.warn('Failed to create action item task:', taskErr);
        }
      }

      // If the server returned linkedTaskIds we can try to attach them, but
      // tasksApi.create returns void so we keep the note as-is. The
      // #meeting-link:note-id tag is enough for back-references in Phase 1.
      void createdIds;

      showToast(
        language === 'zh'
          ? `会议已保存${picked.length ? `，已加 ${picked.length} 个 task 到今天` : ''}`
          : `Meeting saved${picked.length ? `, ${picked.length} task${picked.length > 1 ? 's' : ''} added to today` : ''}`,
        'success'
      );
      onSaved?.();
      onClose();
    } catch (e: any) {
      console.error('Save failed:', e);
      setError(e?.message || String(e));
      setStep('review');
    }
  };

  const stepLabel = (s: Step): string => {
    if (language === 'zh') {
      return s === 'input' ? '1/3 录入' : s === 'organize' ? '2/3 整理中…' : s === 'review' ? '3/3 复核' : '保存中…';
    }
    return s === 'input' ? '1/3 Input' : s === 'organize' ? '2/3 Organize…' : s === 'review' ? '3/3 Review' : 'Saving…';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          className="bg-background w-full max-w-3xl max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-accent/10 text-accent flex items-center justify-center">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-heading">
                  {language === 'zh' ? '会议 Capture' : 'Meeting Capture'}
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {stepLabel(step)} · {language === 'zh' ? 'Granola Phase 1 (mock 转录)' : 'Granola Phase 1 (mock transcribe)'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-text-muted hover:text-red-500 transition-colors rounded hover:bg-surface"
              aria-label="close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 whitespace-pre-line">
                {error}
              </div>
            )}

            {step === 'input' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    {language === 'zh' ? '会议标题' : 'Meeting title'}
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={language === 'zh' ? '例：Q3 GTM sync' : 'e.g. Q3 GTM sync'}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    <Users className="w-3 h-3 inline mr-1" />
                    {language === 'zh' ? '参会人 (逗号分隔)' : 'Participants (comma-separated)'}
                  </label>
                  <input
                    value={participantsText}
                    onChange={e => setParticipantsText(e.target.value)}
                    placeholder={language === 'zh' ? '例：Alex, Sam, Jess' : 'e.g. Alex, Sam, Jess'}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    <FileText className="w-3 h-3 inline mr-1" />
                    {language === 'zh' ? '会议转录 (粘贴纯文本 / Phase 1 mock)' : 'Transcript (paste plain text / Phase 1 mock)'}
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <textarea
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    rows={10}
                    placeholder={language === 'zh'
                      ? 'Alex: 我们 Q3 主推 ICP 改成 PLG?\nSam: 我觉得 enterprise 还是大头。\n…'
                      : 'Alex: Should we push PLG as Q3 ICP?\nSam: I think enterprise is still the majority.\n…'}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent resize-y font-mono"
                  />
                  <p className="text-[10px] text-text-muted mt-1">
                    {language === 'zh'
                      ? '提示: 「Name: 说话」格式会被自动识别为不同 speaker。'
                      : 'Tip: Lines starting with "Name: " are detected as different speakers.'}
                  </p>
                </div>
              </>
            )}

            {step === 'organize' && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
                <p className="text-sm text-text-muted">
                  {language === 'zh' ? '正在让 AI 整理会议纪要 + 提取 action items…' : 'AI is organizing the note + extracting action items…'}
                </p>
                {segments.length > 0 && (
                  <p className="text-[11px] text-text-muted">
                    {language === 'zh' ? `${segments.length} 段已就绪` : `${segments.length} segments ready`}
                  </p>
                )}
              </div>
            )}

            {(step === 'review' || step === 'saving') && (
              <>
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    {language === 'zh' ? '会议纪要 (Markdown)' : 'Meeting note (Markdown)'}
                  </label>
                  <textarea
                    value={markdown}
                    onChange={e => setMarkdown(e.target.value)}
                    disabled={step === 'saving'}
                    rows={12}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent resize-y font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ListChecks className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                      {language === 'zh' ? 'Action Items (勾选要加入今天的)' : 'Action Items (pick which to add to today)'}
                    </span>
                    <span className="h-px bg-border flex-1" />
                  </div>
                  {actionItems.length === 0 ? (
                    <div className="text-xs text-text-muted italic px-2 py-3">
                      {language === 'zh' ? '未提取到 action items。' : 'No action items extracted.'}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {actionItems.map((item, i) => {
                        const picked = pickedItems.has(i);
                        return (
                          <button
                            key={i}
                            onClick={() => togglePick(i)}
                            disabled={step === 'saving'}
                            className={`w-full flex items-start gap-2 px-3 py-2 text-left border-2 rounded-lg transition-all ${
                              picked
                                ? 'border-accent bg-accent/10'
                                : 'border-border hover:border-accent/40 bg-surface-white'
                            }`}
                          >
                            <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                              picked ? 'bg-accent text-white' : 'border-2 border-border'
                            }`}>
                              {picked && <Check className="w-3 h-3" strokeWidth={3} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-text-heading">{item.title}</div>
                              {(item.owner || item.due) && (
                                <div className="text-[10px] text-text-muted mt-0.5">
                                  {item.owner && <span>{item.owner}</span>}
                                  {item.owner && item.due && <span> · </span>}
                                  {item.due && <span>{item.due}</span>}
                                </div>
                              )}
                            </div>
                            {item.priority && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                item.priority === 'high'
                                  ? 'bg-red-100 text-red-700'
                                  : item.priority === 'low'
                                  ? 'bg-stone-100 text-stone-600'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {item.priority}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-surface-white">
            <div className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>{nowDateStr()} · {nowTimeStr()}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={step === 'saving'}
                className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors disabled:opacity-50"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              {step === 'input' && (
                <button
                  onClick={runTranscribe}
                  disabled={!transcript.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-accent text-accent rounded hover:bg-accent/10 transition-colors disabled:opacity-50"
                >
                  <FileText className="w-3 h-3" />
                  {language === 'zh' ? '转录 (mock)' : 'Transcribe (mock)'}
                </button>
              )}
              {step === 'organize' && (
                <button
                  onClick={runOrganize}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {language === 'zh' ? '整理' : 'Organize'}
                </button>
              )}
              {step === 'review' && (
                <button
                  onClick={runOrganize}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-accent text-accent rounded hover:bg-accent/10 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {language === 'zh' ? '重新整理' : 'Re-organize'}
                </button>
              )}
              {step === 'review' && (
                <button
                  onClick={handleSave}
                  disabled={!title.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  {language === 'zh' ? '保存会议笔记' : 'Save meeting note'}
                </button>
              )}
              {step === 'saving' && (
                <button
                  disabled
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded opacity-50"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {language === 'zh' ? '保存中…' : 'Saving…'}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
