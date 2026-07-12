/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MessageBubble — 单条 AI/用户消息气泡 + 底部操作栏.
 *
 * 从 AIChat 抽出 (R3 重构, 2026-07-12). 共享给 AIChat 和 FloatingAIPanel.
 */

import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Bookmark, PlusCircle, RotateCcw, User, Bot, Zap } from 'lucide-react';
import type { ChatMessage } from '../types/chat';
import { copyMessageContent, createTasksFromMessage } from '../utils/chatActions';

export interface MessageBubbleProps {
  message: ChatMessage;
  language: 'en' | 'zh';
  activeContext?: 'work' | 'life';
  notes: any[];
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onRetry: () => void;
  onSaveAsNote: (msg: ChatMessage) => void;
  onOpenSettings: () => void;
  /** 给 FloatingAIPanel 用, 跟 AIChat 的 px 间距略小 */
  compact?: boolean;
}

export function MessageBubble({
  message, language, activeContext, notes, showToast, onRetry, onSaveAsNote, onOpenSettings, compact,
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
            {message.modelName && <span className="text-[10px] text-text-muted">· {message.modelName}</span>}
            {message.skillName && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                <Zap className="w-2.5 h-2.5" />
                {message.skillName}
              </span>
            )}
          </div>
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
                      className="px-2.5 py-1 text-[11px] font-bold bg-amber-200 text-amber-900 rounded hover:bg-amber-300 transition-colors"
                    >
                      {language === 'zh' ? '打开模型设置' : 'Open Model Settings'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`text-text-heading leading-[1.7] ${compact ? 'text-sm' : 'text-[15px]'}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                p: ({ children }) => <p className={compact ? 'mb-1.5 last:mb-0' : 'mb-2 last:mb-0'}>{children}</p>,
                ul: ({ children }) => <ul className={`list-disc ${compact ? 'pl-4 mb-1.5' : 'pl-5 mb-2'}`}>{children}</ul>,
                ol: ({ children }) => <ol className={`list-decimal ${compact ? 'pl-4 mb-1.5' : 'pl-5 mb-2'}`}>{children}</ol>,
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                h1: ({ children }) => <h1 className={`${compact ? 'text-base' : 'text-lg'} font-bold mt-3 mb-2`}>{children}</h1>,
                h2: ({ children }) => <h2 className={`${compact ? 'text-sm' : 'text-base'} font-bold mt-3 mb-2`}>{children}</h2>,
                h3: ({ children }) => <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-bold mt-2 mb-1`}>{children}</h3>,
                hr: () => <hr className="my-3 border-border/50" />,
                code: ({ children, className }) => (
                  <code className={`${className ? `block bg-surface ${compact ? 'p-1.5' : 'p-2'} rounded ${compact ? 'text-[11px]' : 'text-xs'} overflow-x-auto my-2` : `bg-surface px-1 py-0.5 rounded ${compact ? 'text-[11px]' : 'text-xs'}`}`}>
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
                className={`flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors`}
              >
                <Copy className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                {language === 'zh' ? '复制' : 'Copy'}
              </button>
              <button
                onClick={() => onSaveAsNote(message)}
                className={`flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors`}
              >
                <Bookmark className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                {language === 'zh' ? '保存为笔记' : 'Save as note'}
              </button>
              <button
                onClick={() => createTasksFromMessage(message.content, { activeContext, language, showToast })}
                className={`flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors`}
              >
                <PlusCircle className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                {language === 'zh' ? '创建任务' : 'Create tasks'}
              </button>
              <button
                onClick={onRetry}
                className={`flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors`}
              >
                <RotateCcw className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                {language === 'zh' ? '重复提问' : 'Retry'}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
