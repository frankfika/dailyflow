/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MessageBubble — 单条 AI/用户消息气泡 + 底部操作栏.
 *
 * 从 AIChat 抽出的单条消息展示。
 */

import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bookmark, Bot, CalendarPlus, Check, CheckCircle2, Copy,
  ListTodo, Pencil, PlusCircle, RotateCcw, Search, StickyNote, Trash2, User, XCircle, Zap,
} from 'lucide-react';
import type { ChatMessage, ChatToolRecord } from '../types/chat';
import { copyMessageContent, createTaskProposalsFromMessage } from '../utils/chatActions';

/** Icon + bilingual label per tool family, so cards read like UI actions. */
const TOOL_META: Record<string, { icon: typeof Zap; zh: string; en: string }> = {
  list_today_tasks: { icon: ListTodo, zh: '查看今日任务', en: 'List today' },
  search_tasks: { icon: Search, zh: '搜索任务', en: 'Search tasks' },
  search_notes: { icon: Search, zh: '搜索笔记', en: 'Search notes' },
  create_task: { icon: PlusCircle, zh: '新建任务', en: 'Create task' },
  create_note: { icon: StickyNote, zh: '新建笔记', en: 'Create note' },
  create_event: { icon: CalendarPlus, zh: '新建事件', en: 'Create event' },
  update_task: { icon: Pencil, zh: '修改任务', en: 'Update task' },
  update_event: { icon: Pencil, zh: '修改事件', en: 'Update event' },
  complete_task: { icon: Check, zh: '完成任务', en: 'Complete task' },
  add_task_to_event: { icon: ListTodo, zh: '任务加入事件', en: 'Add to event' },
  delete_task: { icon: Trash2, zh: '删除任务', en: 'Delete task' },
  delete_note: { icon: Trash2, zh: '删除笔记', en: 'Delete note' },
  delete_event: { icon: Trash2, zh: '删除事件', en: 'Delete event' },
};

/** Compact arg digest — the title/id the action was about, nothing else. */
function summarizeArgs(record: ChatToolRecord): string {
  const a = record.args || {};
  const title = [a.new_title, a.title, a.title_query, a.event_title, a.query, a.note_id, a.task_id, a.event_id]
    .find(v => typeof v === 'string' && v.trim());
  return title ? String(title).slice(0, 60) : '';
}

function ToolCallCard({ record, language }: { record: ChatToolRecord; language: 'en' | 'zh' }) {
  const meta = TOOL_META[record.name] ?? { icon: Zap, zh: record.name, en: record.name };
  const Icon = meta.icon;
  return (
    <div
      data-testid={`ai-tool-card-${record.name}`}
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[13px] ${
        record.success
          ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
          : 'border-amber-200 bg-amber-50/70 text-amber-900'
      }`}
    >
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white ${
        record.success ? 'bg-emerald-500' : 'bg-amber-500'
      }`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-bold">
          <span>{language === 'zh' ? meta.zh : meta.en}</span>
          {record.success
            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            : <XCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
        </div>
        {summarizeArgs(record) && (
          <div className="mt-0.5 truncate text-[12px] font-semibold opacity-80">{summarizeArgs(record)}</div>
        )}
        <div className="mt-0.5 whitespace-pre-wrap text-[12px] leading-snug opacity-90">{record.message}</div>
      </div>
    </div>
  );
}

export interface MessageBubbleProps {
  message: ChatMessage;
  language: 'en' | 'zh';
  activeContext?: 'work' | 'life';
  notes: any[];
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onRetry: () => void;
  onSaveAsNote: (msg: ChatMessage) => void;
  onOpenSettings: () => void;
}

export function MessageBubble({
  message, language, activeContext, notes, showToast, onRetry, onSaveAsNote, onOpenSettings,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <User className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-text-heading mb-1.5">
              {language === 'zh' ? '你' : 'You'}
            </div>
            <div className="text-[15px] text-text-heading leading-[1.7] whitespace-pre-wrap">
              {message.content}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Assistant message
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-surface-white border border-border text-text-heading flex items-center justify-center flex-shrink-0 shadow-sm">
          <Bot className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-bold text-text-heading">AI</span>
            {message.modelName && <span className="text-[11px] text-text-muted">· {message.modelName}</span>}
            {message.skillName && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                <Zap className="w-2.5 h-2.5" />
                {message.skillName}
              </span>
            )}
          </div>
          {/* Executed AI actions — real CRUD results shown as cards. */}
          {message.toolCalls && message.toolCalls.length > 0 && !message.error && (
            <div className="mb-2.5 space-y-1.5" data-testid="ai-tool-cards">
              {message.toolCalls.map((record, index) => (
                <ToolCallCard key={`${record.name}-${index}`} record={record} language={language} />
              ))}
            </div>
          )}
          {message.error ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-amber-700 text-xs font-bold">!</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-amber-800 mb-1">
                    {language === 'zh' ? '调用未完成' : 'Request did not complete'}
                  </div>
                  <div className="text-[13px] text-amber-900 whitespace-pre-wrap leading-[1.6]">{message.error}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={onOpenSettings}
                      className="px-2.5 py-1 text-[12px] font-bold bg-amber-200 text-amber-900 rounded hover:bg-amber-300 transition-colors"
                    >
                      {language === 'zh' ? '打开模型设置' : 'Open Model Settings'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-text-heading leading-[1.7] text-[15px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                hr: () => <hr className="my-3 border-border/50" />,
                code: ({ children, className }) => (
                  <code className={`${className ? 'block bg-surface p-2 rounded text-xs overflow-x-auto my-2' : 'bg-surface px-1 py-0.5 rounded text-xs'}`}>
                    {children}
                  </code>
                ),
                pre: ({ children }) => <pre className="whitespace-pre-wrap">{children}</pre>,
              }}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          {!message.error && (
            <div className="flex items-center gap-1 mt-2">
              <button
                onClick={() => copyMessageContent(message.content, { language, showToast })}
                className="flex items-center gap-1 px-2 py-1 text-[12px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
              >
                <Copy className="w-3 h-3" />
                {language === 'zh' ? '复制' : 'Copy'}
              </button>
              <button
                onClick={() => onSaveAsNote(message)}
                className="flex items-center gap-1 px-2 py-1 text-[12px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
              >
                <Bookmark className="w-3 h-3" />
                {language === 'zh' ? '保存为笔记' : 'Save as note'}
              </button>
              <button
                onClick={() => createTaskProposalsFromMessage(message.content, { activeContext: activeContext ?? 'work', language, showToast })}
                className="flex items-center gap-1 px-2 py-1 text-[12px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
              >
                <PlusCircle className="w-3 h-3" />
                {language === 'zh' ? '生成事项建议' : 'Propose items'}
              </button>
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2 py-1 text-[12px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                {language === 'zh' ? '重复提问' : 'Retry'}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
