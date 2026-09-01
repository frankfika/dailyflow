import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, FileText, Hash, ListTodo, Mic, Plus, Repeat, Send, Sparkles, X } from 'lucide-react';
import type { RecurrenceRule } from '../api/client';
import { getTodayStr } from '../utils/tagColors';

export interface QuickTaskDraft {
  title: string;
  description?: string;
  tags: string[];
  deadline?: string;
  recurrence?: RecurrenceRule;
}

/** One task extracted by the AI brainstorm preview (design v3.1 §2.1). */
export interface BrainPreviewTask {
  id: string;
  title: string;
  deadline?: string;
}

export interface AiAnswer {
  answer: string;
  suggestedTitle?: string;
}

interface TodayInputBarProps {
  language: 'en' | 'zh';
  activeContext: string;
  categories: string[];
  brainDumpText: string;
  setBrainDumpText: (value: string) => void;
  isProcessingBrainDump: boolean;
  /** Extract brainstorm tasks — returns the preview list instead of creating. */
  onBrainExtract: (text: string) => Promise<BrainPreviewTask[]>;
  brainPreviewTasks: BrainPreviewTask[] | null;
  onBrainPreviewAdd: (tasks: BrainPreviewTask[]) => void;
  onBrainPreviewRewrite: (id: string) => void;
  onBrainPreviewRemove: (id: string) => void;
  onBrainPreviewCancel: () => void;
  rewritingPreviewId: string | null;
  /** `?`-prefixed input routes here (design v3.1 §5). */
  onAsk: (question: string) => void;
  aiAnswer: AiAnswer | null;
  onAnswerAdopt?: (title: string) => void;
  onAnswerClose: () => void;
  /** Increment to flip the bar into brainstorm mode (Cmd+B). */
  brainModeSignal?: number;
  /** ⋯ menu — open a new note prefilled with the current draft (§2). */
  onLinkNote?: (draft: string) => void;
  /** ⋯ menu — create a project event from the draft title (§2/§4.2). */
  onDraftToProject?: (title: string) => void;
  /** ⋯ menu — start meeting capture (§2). */
  onMeetingCapture?: () => void;
  onAddTask: (draft: QuickTaskDraft) => void;
  onRegisterFocus?: (focus: () => void) => void;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function nextWeekday(from: Date, target: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  return d;
}

const WEEKDAY_LETTERS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * Persistent bottom input bar (design v3.1 S2): Enter to add, quick deadline
 * presets, quick tags, and a "more" menu holding recurrence + AI brainstorm.
 * Creation itself lives in App (onAddTask) so the bar stays presentational.
 */
export function TodayInputBar({
  language,
  activeContext,
  categories,
  brainDumpText,
  setBrainDumpText,
  isProcessingBrainDump,
  onBrainExtract,
  brainPreviewTasks,
  onBrainPreviewAdd,
  onBrainPreviewRewrite,
  onBrainPreviewRemove,
  onBrainPreviewCancel,
  rewritingPreviewId,
  onAsk,
  aiAnswer,
  onAnswerAdopt,
  onAnswerClose,
  brainModeSignal,
  onLinkNote,
  onDraftToProject,
  onMeetingCapture,
  onAddTask,
  onRegisterFocus,
}: TodayInputBarProps) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [deadline, setDeadline] = useState<string | undefined>(undefined);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [openPop, setOpenPop] = useState<'deadline' | 'tag' | 'more' | null>(null);
  const [brainMode, setBrainMode] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [excludedPreview, setExcludedPreview] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const registerRef = useRef(onRegisterFocus);
  registerRef.current = onRegisterFocus;

  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  useEffect(() => {
    registerRef.current?.(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if ((brainModeSignal ?? 0) > 0) setBrainMode(true);
  }, [brainModeSignal]);

  useEffect(() => {
    if (!openPop) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenPop(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openPop]);

  const toggleTag = (tag: string) => {
    setTags(prev => (prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]));
  };

  const addDraftTag = () => {
    const tag = tagDraft.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags(prev => [...prev, tag]);
    setTagDraft('');
  };

  const recurrenceLabel = () => {
    if (!recurrence) return null;
    if (recurrence.type === 'daily') return t('每天', 'Daily');
    if (recurrence.type === 'weekly') return t('每周', 'Weekly');
    return t('每月', 'Monthly');
  };

  const ask = async (question: string) => {
    if (asking) return;
    setAsking(true);
    try {
      onAsk(question);
    } finally {
      setAsking(false);
    }
  };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    // `?` / `？` prefix asks the AI instead of creating a task (§5).
    if ((trimmed.startsWith('?') || trimmed.startsWith('？')) && trimmed.length > 1) {
      const question = trimmed.replace(/^[?？]\s*/, '');
      setTitle('');
      void ask(question);
      return;
    }
    const lines = trimmed.split('\n');
    const finalTags = [...tags];
    if (!finalTags.some(item => item === 'work' || item === 'life')) finalTags.push(activeContext);
    if (recurrence && !finalTags.includes('recurring')) finalTags.push('recurring');
    onAddTask({
      title: lines[0].trim(),
      description: lines.slice(1).join('\n').trim() || undefined,
      tags: finalTags,
      deadline: deadline || undefined,
      recurrence: recurrence ?? undefined,
    });
    setTitle('');
    setTags([]);
    setDeadline(undefined);
    setRecurrence(null);
    setOpenPop(null);
    inputRef.current?.focus();
  };

  const submitBrainDump = async () => {
    if (!brainDumpText.trim() || isProcessingBrainDump) return;
    try {
      const extracted = await onBrainExtract(brainDumpText.trim());
      if (extracted.length > 0) {
        setBrainMode(false);
        setExcludedPreview(new Set());
      }
      // Zero results keeps the draft in place; App surfaces a toast.
    } catch {
      // onBrainExtract already surfaced the failure; keep the draft for retry.
    }
  };

  const now = new Date();
  const deadlinePresets = [
    { label: t('今天', 'Today'), value: toISODate(now) },
    { label: t('明天', 'Tomorrow'), value: toISODate(shiftDays(now, 1)) },
    { label: t('本周五', 'Friday'), value: toISODate(nextWeekday(now, 5)) },
    { label: t('下周一', 'Next Mon'), value: toISODate(shiftDays(nextWeekday(now, 1), 7)) },
  ];

  if (brainPreviewTasks) {
    const included = brainPreviewTasks.filter(item => !excludedPreview.has(item.id));
    return (
      <div ref={rootRef} className="today-input-bar today-input-bar-brain" data-testid="brain-preview-panel">
        <div className="today-input-brain-head">
          <Sparkles className="today-input-icon" aria-hidden="true" />
          <span className="today-input-brain-title">
            {t(`AI 拆解完成 · ${brainPreviewTasks.length} 个任务`, `AI split done · ${brainPreviewTasks.length} tasks`)}
          </span>
          <button
            type="button"
            className="today-input-close"
            onClick={onBrainPreviewCancel}
            aria-label={t('放弃拆解结果', 'Discard results')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="today-input-preview">
          {brainPreviewTasks.map(item => {
            const excluded = excludedPreview.has(item.id);
            return (
              <div key={item.id} className={`today-input-preview-row${excluded ? ' is-excluded' : ''}`} data-testid={`brain-preview-row-${item.id}`}>
                <button
                  type="button"
                  className={`today-input-preview-check${excluded ? '' : ' is-on'}`}
                  aria-label={excluded ? t('加入这项', 'Include this task') : t('不加这项', 'Exclude this task')}
                  onClick={() => setExcludedPreview(prev => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                    return next;
                  })}
                >
                  {excluded ? null : <Check className="h-3 w-3" strokeWidth={2.5} />}
                </button>
                <span className="today-input-preview-title">{item.title}</span>
                <span className="today-input-preview-actions">
                  <button
                    type="button"
                    className="today-input-chipbtn"
                    data-testid={`brain-preview-rewrite-${item.id}`}
                    disabled={rewritingPreviewId !== null}
                    onClick={() => onBrainPreviewRewrite(item.id)}
                  >
                    {rewritingPreviewId === item.id ? t('改写中…', 'Rewriting…') : t('改写', 'Rewrite')}
                  </button>
                  <button
                    type="button"
                    className="today-input-chipbtn"
                    data-testid={`brain-preview-remove-${item.id}`}
                    onClick={() => onBrainPreviewRemove(item.id)}
                  >
                    {t('删除', 'Delete')}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        <div className="today-input-brain-foot">
          <button
            type="button"
            className="today-input-send is-primary"
            data-testid="brain-preview-add"
            disabled={included.length === 0}
            onClick={() => onBrainPreviewAdd(included)}
          >
            {t(`全部加进去（${included.length}）`, `Add all (${included.length})`)}
          </button>
        </div>
      </div>
    );
  }

  if (brainMode) {
    return (
      <div ref={rootRef} className="today-input-bar today-input-bar-brain" data-testid="today-input-bar">
        <div className="today-input-brain-head">
          <Sparkles className="today-input-icon" aria-hidden="true" />
          <span className="today-input-brain-title">{t('AI 脑暴 · 随便写，AI 拆成任务', 'AI Brainstorm · write freely, AI splits it up')}</span>
          <button
            type="button"
            className="today-input-close"
            onClick={() => setBrainMode(false)}
            aria-label={t('退出脑暴', 'Exit brainstorm')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <textarea
          ref={inputRef}
          className="today-input-brain-text"
          data-testid="brain-dump-textarea"
          value={brainDumpText}
          onChange={(e) => setBrainDumpText(e.target.value)}
          placeholder={t('想到什么写什么，一行一件事也行…', 'Dump anything — one idea per line works too…')}
          rows={3}
          autoFocus
        />
        <div className="today-input-brain-foot">
          <button
            type="button"
            className="today-input-send is-primary"
            data-testid="brain-dump-submit"
            disabled={!brainDumpText.trim() || isProcessingBrainDump}
            onClick={() => void submitBrainDump()}
          >
            {isProcessingBrainDump ? t('提取中…', 'Extracting…') : t('提取任务', 'Extract tasks')}
          </button>
        </div>
      </div>
    );
  }

  const tagChoices = categories.filter(item => !['work', 'life', 'tasks'].includes(item));

  return (
    <div ref={rootRef} className="today-input-bar" data-testid="today-input-bar">
      {aiAnswer && (
        <div className="today-input-aians" data-testid="ai-answer-panel">
          <Sparkles className="today-input-icon" aria-hidden="true" />
          <div className="today-input-aians-text">{aiAnswer.answer}</div>
          {aiAnswer.suggestedTitle && onAnswerAdopt && (
            <button
              type="button"
              className="today-input-send is-primary"
              data-testid="ai-answer-adopt"
              onClick={() => onAnswerAdopt(aiAnswer.suggestedTitle!)}
            >
              {t('采纳为任务', 'Add as task')}
            </button>
          )}
          <button
            type="button"
            className="today-input-close"
            onClick={onAnswerClose}
            aria-label={t('关闭回答', 'Close answer')}
            data-testid="ai-answer-close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="today-input-row">
        <Plus className="today-input-icon" aria-hidden="true" />
        <textarea
          ref={inputRef}
          className="today-input-field"
          data-testid="quick-task-input"
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={asking
            ? t('AI 思考中…', 'AI thinking…')
            : t('写下一件事… 输入 ? 向 AI 提问', 'Write the next thing… type ? to ask AI')}
        />
        <button
          type="button"
          className={`today-input-chipbtn${deadline ? ' is-set' : ''}`}
          data-testid="input-deadline"
          aria-label={t('截止时间', 'Deadline')}
          onClick={() => setOpenPop(openPop === 'deadline' ? null : 'deadline')}
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`today-input-chipbtn${tags.length > 0 ? ' is-set' : ''}`}
          data-testid="input-tags"
          aria-label={t('标签', 'Tags')}
          onClick={() => setOpenPop(openPop === 'tag' ? null : 'tag')}
        >
          <Hash className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`today-input-chipbtn${recurrence ? ' is-set' : ''}`}
          data-testid="input-more"
          aria-label={t('重复与 AI 脑暴', 'Recurrence and AI brainstorm')}
          onClick={() => setOpenPop(openPop === 'more' ? null : 'more')}
        >
          <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="today-input-send"
          data-testid="input-send"
          aria-label={t('添加任务', 'Add task')}
          disabled={!title.trim() || asking}
          onClick={submit}
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {(deadline || tags.length > 0 || recurrence) && (
        <div className="today-input-settags">
          {deadline && (
            <button type="button" className="today-input-setchip" onClick={() => setDeadline(undefined)}>
              <Calendar className="h-3 w-3" aria-hidden="true" />
              {deadline}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
          {tags.map(tag => (
            <button key={tag} type="button" className="today-input-setchip" onClick={() => toggleTag(tag)}>
              #{tag}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
          {recurrence && (
            <button type="button" className="today-input-setchip" onClick={() => setRecurrence(null)}>
              <Repeat className="h-3 w-3" aria-hidden="true" />
              {recurrenceLabel()}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {openPop === 'deadline' && (
        <div className="today-input-pop" data-testid="input-deadline-pop">
          {deadlinePresets.map(preset => (
            <button
              key={preset.value}
              type="button"
              className={`today-input-popitem${deadline === preset.value ? ' is-selected' : ''}`}
              onClick={() => { setDeadline(preset.value); setOpenPop(null); }}
            >
              {preset.label}
              {deadline === preset.value && <Check className="h-3 w-3" strokeWidth={2.5} />}
            </button>
          ))}
          <label className="today-input-popcustom">
            {t('自定义', 'Custom')}
            <input
              type="date"
              className="today-input-date"
              value={deadline || ''}
              onChange={(e) => { setDeadline(e.target.value || undefined); setOpenPop(null); }}
            />
          </label>
          {deadline && (
            <button type="button" className="today-input-popitem" onClick={() => { setDeadline(undefined); setOpenPop(null); }}>
              {t('清除截止', 'Clear deadline')}
            </button>
          )}
        </div>
      )}
      {openPop === 'tag' && (
        <div className="today-input-pop" data-testid="input-tag-pop">
          <div className="today-input-popchips">
            {tagChoices.map(tag => (
              <button
                key={tag}
                type="button"
                className={`today-input-tagchip${tags.includes(tag) ? ' is-selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
          <div className="today-input-tagadd">
            <input
              className="today-input-date"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addDraftTag();
                }
              }}
              placeholder={t('新标签，回车添加', 'New tag, Enter to add')}
            />
            <button type="button" className="today-input-send" onClick={addDraftTag} disabled={!tagDraft.trim()}>
              {t('添加', 'Add')}
            </button>
          </div>
        </div>
      )}
      {openPop === 'more' && (
        <div className="today-input-pop" data-testid="input-more-pop">
          <div className="today-input-pophead">{t('重复', 'Repeat')}</div>
          <div className="today-input-popchips">
            <button
              type="button"
              className={`today-input-tagchip${recurrence?.type === 'daily' ? ' is-selected' : ''}`}
              onClick={() => setRecurrence(recurrence?.type === 'daily' ? null : { type: 'daily' })}
            >
              {t('每天', 'Daily')}
            </button>
            <button
              type="button"
              className={`today-input-tagchip${recurrence?.type === 'weekly' ? ' is-selected' : ''}`}
              onClick={() => setRecurrence(recurrence?.type === 'weekly' ? null : { type: 'weekly', weekdays: [1, 2, 3, 4, 5] })}
            >
              {t('每周', 'Weekly')}
            </button>
            <button
              type="button"
              className={`today-input-tagchip${recurrence?.type === 'monthly' ? ' is-selected' : ''}`}
              onClick={() => setRecurrence(recurrence?.type === 'monthly' ? null : { type: 'monthly', dayOfMonth: now.getDate() })}
            >
              {t('每月', 'Monthly')}
            </button>
          </div>
          {recurrence?.type === 'weekly' && (
            <div className="today-input-popchips">
              {WEEKDAY_LETTERS.map((letter, index) => {
                const selected = recurrence.weekdays.includes(index);
                return (
                  <button
                    key={letter}
                    type="button"
                    className={`today-input-tagchip is-small${selected ? ' is-selected' : ''}`}
                    onClick={() => {
                      const next = selected
                        ? recurrence.weekdays.filter(day => day !== index)
                        : [...recurrence.weekdays, index].sort((a, b) => a - b);
                      setRecurrence(next.length > 0 ? { type: 'weekly', weekdays: next } : null);
                    }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          )}
          {recurrence?.type === 'monthly' && (
            <div className="today-input-tagadd">
              <span className="today-input-pophead">{t('每月几号', 'Day of month')}</span>
              <input
                type="number"
                min={1}
                max={31}
                className="today-input-date is-number"
                value={recurrence.dayOfMonth}
                onChange={(e) => {
                  const day = Number(e.target.value);
                  if (day >= 1 && day <= 31) setRecurrence({ type: 'monthly', dayOfMonth: day });
                }}
              />
            </div>
          )}
          <div className="today-input-popdivider" />
          <button type="button" className="today-input-popitem" onClick={() => { setBrainMode(true); setOpenPop(null); }}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('AI 脑暴 · 把想法拆成任务', 'AI Brainstorm · split ideas into tasks')}
          </button>
          {onLinkNote && (
            <button
              type="button"
              className="today-input-popitem"
              data-testid="input-more-link-note"
              onClick={() => { onLinkNote(title.trim()); setOpenPop(null); }}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {title.trim() ? t('关联笔记 · 存为笔记', 'Linked note · save draft as note') : t('关联笔记 · 新建笔记', 'Linked note · new note')}
            </button>
          )}
          {onDraftToProject && (
            <button
              type="button"
              className="today-input-popitem"
              data-testid="input-more-to-project"
              disabled={!title.trim()}
              onClick={() => { onDraftToProject(title.trim()); setOpenPop(null); }}
            >
              <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
              {t('转成项目 · 建事件进画布', 'To project · create event + canvas')}
            </button>
          )}
          {onMeetingCapture && (
            <button
              type="button"
              className="today-input-popitem"
              data-testid="input-more-meeting"
              onClick={() => { onMeetingCapture(); setOpenPop(null); }}
            >
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              {t('会议转写 · 开始记录', 'Meeting capture · start recording')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
