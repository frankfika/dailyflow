import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, Hash, Plus, Repeat, Send, Sparkles, X } from 'lucide-react';
import type { RecurrenceRule } from '../api/client';
import { getTodayStr } from '../utils/tagColors';

export interface QuickTaskDraft {
  title: string;
  description?: string;
  tags: string[];
  deadline?: string;
  recurrence?: RecurrenceRule;
}

interface TodayInputBarProps {
  language: 'en' | 'zh';
  activeContext: string;
  categories: string[];
  brainDumpText: string;
  setBrainDumpText: (value: string) => void;
  isProcessingBrainDump: boolean;
  processBrainDump: () => Promise<void>;
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
  processBrainDump,
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

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const registerRef = useRef(onRegisterFocus);
  registerRef.current = onRegisterFocus;

  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  useEffect(() => {
    registerRef.current?.(() => inputRef.current?.focus());
  }, []);

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

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
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
      await processBrainDump();
      setBrainMode(false);
    } catch {
      // processBrainDump already surfaced the failure; keep the draft for retry.
    }
  };

  const now = new Date();
  const deadlinePresets = [
    { label: t('今天', 'Today'), value: toISODate(now) },
    { label: t('明天', 'Tomorrow'), value: toISODate(shiftDays(now, 1)) },
    { label: t('本周五', 'Friday'), value: toISODate(nextWeekday(now, 5)) },
    { label: t('下周一', 'Next Mon'), value: toISODate(shiftDays(nextWeekday(now, 1), 7)) },
  ];

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
          placeholder={t('写下一件事…', 'Write the next thing…')}
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
          disabled={!title.trim()}
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
        </div>
      )}
    </div>
  );
}
