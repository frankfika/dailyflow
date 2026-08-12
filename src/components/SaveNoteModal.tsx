/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SaveNoteModal — AI 消息「保存为笔记」对话框.
 *
 * AIChat 的保存笔记弹窗；内部管理表单 state，父组件只控制 open/close.
 * R3 重构 (2026-07-12): 抽重复 UI, AIChat 命中 < 700 行目标.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { notesApi } from '../api/client';
import { getTodayStr } from '../utils/tagColors';

export interface SaveNoteModalProps {
  isOpen: boolean;
  language: 'en' | 'zh';
  activeContext?: 'work' | 'life';
  initialTitle: string;
  initialContent: string;
  initialLinkedTaskIds?: string[];
  initialLinkedProjectIds?: string[];
  existingNoteId?: string | null;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onClose: () => void;
  onSaved: () => void;
}

type NoteType = 'note' | 'meeting_note' | 'summary';

const EMPTY = { title: '', content: '', type: 'note' as NoteType, tags: ['ai-generated'] as string[], savedNoteId: null as string | null, linkedTaskIds: [] as string[], linkedProjectIds: [] as string[] };

export function SaveNoteModal({
  isOpen,
  language,
  activeContext = 'work',
  initialTitle,
  initialContent,
  initialLinkedTaskIds = [],
  initialLinkedProjectIds = [],
  existingNoteId = null,
  showToast,
  onClose,
  onSaved,
}: SaveNoteModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [type, setType] = useState<NoteType>('note');
  const [tags, setTags] = useState<string[]>(['ai-generated']);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, saving]);

  if (!isOpen) return null;

  const close = () => {
    setTitle(''); setContent(''); setType('note');
    setTags(['ai-generated']);
    onClose();
  };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      if (existingNoteId) {
        await notesApi.update(existingNoteId, {
          title: title.trim(),
          body: content,
          type: type as any,
          tags,
          linkedTaskIds: initialLinkedTaskIds,
          linkedProjectIds: initialLinkedProjectIds,
        });
      } else {
        await notesApi.create({
          title: title.trim(),
          body: content,
          type: type as any,
          date: getTodayStr(),
          context: activeContext,
          tags,
          linkedTaskIds: initialLinkedTaskIds,
          linkedProjectIds: initialLinkedProjectIds,
        });
      }
      showToast(language === 'zh' ? '已保存到笔记' : 'Saved to notes', 'success');
      onSaved();
      close();
    } catch (e) {
      showToast(language === 'zh' ? '保存失败' : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-note-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface-white shadow-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 id="save-note-title" className="text-sm font-bold text-text-heading">
            {language === 'zh' ? '保存为笔记' : 'Save as Note'}
          </h3>
          <button onClick={close} aria-label={language === 'zh' ? '关闭' : 'Close'} className="p-1 text-text-muted hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
          {existingNoteId && (
            <div className="px-3 py-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
              {language === 'zh'
                ? '这条内容已经保存过；保存会更新原笔记，不会创建重复条目。'
                : 'This content was saved before. Saving will update the existing note instead of creating a duplicate.'}
            </div>
          )}
          <div>
            <label htmlFor="save-note-title-input" className="block text-[11px] font-bold text-text-muted mb-1">{language === 'zh' ? '标题' : 'Title'}</label>
            <input
              id="save-note-title-input"
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="save-note-type" className="block text-[11px] font-bold text-text-muted mb-1">{language === 'zh' ? '类型' : 'Type'}</label>
            <select
              id="save-note-type"
              value={type}
              onChange={e => setType(e.target.value as NoteType)}
              className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
            >
              <option value="note">{language === 'zh' ? '笔记' : 'Note'}</option>
              <option value="meeting_note">{language === 'zh' ? '会议' : 'Meeting'}</option>
              <option value="summary">{language === 'zh' ? '总结' : 'Summary'}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-text-muted mb-1">{language === 'zh' ? '标签' : 'Tags'}</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-accent/10 text-accent border border-accent/20">
                  #{tag}
                  <button onClick={() => setTags(tags.filter(t => t !== tag))} className="hover:text-red-500">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                aria-label={language === 'zh' ? '添加标签' : 'Add tag'}
                placeholder={language === 'zh' ? '+ 添加标签' : '+ Add tag'}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
                    if (v && !tags.includes(v)) {
                      setTags([...tags, v]);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
                className="w-24 px-2 py-0.5 text-[11px] border border-border rounded bg-surface focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label htmlFor="save-note-content" className="block text-[11px] font-bold text-text-muted mb-1">{language === 'zh' ? '内容' : 'Content'}</label>
            <textarea
              id="save-note-content"
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent max-h-60 min-h-[120px] resize-y"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={close}
            className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-4 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {language === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// 兼容: 老组件引用 SaveNoteModal 的初始 EMPTY
export { EMPTY as SAVE_NOTE_EMPTY };
