/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ChatInputArea — AI 聊天输入区 (textarea + context pills + skill/model picker + send).
 *
 * 从 AIChat 抽出 (R3 重构, 2026-07-12), 让父组件聚焦在 layout/session 管理.
 */

import { useState } from 'react';
import { Paperclip, Mic, Zap, ChevronDown, Bot, Calendar, FileText, Folder, X, Send, StopCircle } from 'lucide-react';
import type { ChatSession, ContextItem } from '../types/chat';
import type { PromptTemplateData } from '../api/client';
import type { ProviderConfig } from '../types/models';

export interface ChatInputAreaProps {
  language: 'en' | 'zh';
  activeSession: ChatSession | null;
  inputValue: string;
  isStreaming: boolean;
  isComposing: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onOpenContextPicker: () => void;
  onCreateMeetingNote?: () => void;  // AIChat-only
  onOpenSettings: () => void;
  onRemoveContext: (id: string) => void;

  // Skills
  skills: PromptTemplateData[];
  pendingSkillId: string | null;
  activeSkill: PromptTemplateData | null;
  onSelectSkill: (id: string) => void;
  onClearPendingSkill: () => void;

  // Providers
  providers: ProviderConfig[];
  activeProvider: ProviderConfig | null;
  onChangeProvider: (id: string) => void;

  // Draft source
  draftSourceTitle: string | null;
  onClearDraftSource: () => void;

  textareaRef: React.RefObject<HTMLTextAreaElement>;
  compact?: boolean;
}

export function ChatInputArea({
  language, activeSession, inputValue, isStreaming, isComposing,
  onInputChange, onSend, onStop, onKeyDown,
  onOpenContextPicker, onCreateMeetingNote, onOpenSettings, onRemoveContext,
  skills, pendingSkillId, activeSkill, onSelectSkill, onClearPendingSkill,
  providers, activeProvider, onChangeProvider,
  draftSourceTitle, onClearDraftSource, textareaRef, compact = false,
}: ChatInputAreaProps) {
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);

  return (
    <div className={`${compact ? 'px-3 pb-3 pt-2' : 'px-4 md:px-8 pb-4 md:pb-6 pt-2'} shrink-0`}>
      <div className="w-full">
        {activeSession && activeSession.contextItems.length > 0 && (
          <div className="mb-1.5 flex items-center gap-1.5 flex-wrap px-1">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted/70 font-bold mr-0.5">
              {language === 'zh' ? '上下文' : 'Context'}
            </span>
            {activeSession.contextItems.map((item: ContextItem) => (
              <span key={item.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-accent/10 border border-accent/20 text-accent rounded-full">
                {item.type === 'today-tasks' && <Calendar className="w-3 h-3" />}
                {item.type === 'date-tasks' && <Calendar className="w-3 h-3" />}
                {item.type === 'note' && <FileText className="w-3 h-3" />}
                {item.type === 'project' && <Folder className="w-3 h-3" />}
                {item.type === 'custom-text' && <FileText className="w-3 h-3" />}
                <span className="max-w-[160px] truncate font-medium">{item.label}</span>
                <button onClick={() => onRemoveContext(item.id)} className="text-accent/70 hover:text-red-500 transition-colors ml-0.5">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {pendingSkillId && activeSkill && (
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-accent/10 text-accent rounded">
              <Zap className="w-3 h-3" />
              {language === 'zh' ? '应用 Skill: ' : 'Skill: '}{activeSkill.name}
            </span>
            <button onClick={onClearPendingSkill} className="text-[11px] text-text-muted hover:text-red-500">
              {language === 'zh' ? '移除' : 'Remove'}
            </button>
          </div>
        )}

        {draftSourceTitle && (
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
              <FileText className="w-3 h-3" />
              {language === 'zh' ? '来自笔记: ' : 'From note: '}{draftSourceTitle}
            </span>
            <button onClick={onClearDraftSource} className="text-[11px] text-text-muted hover:text-red-500">
              {language === 'zh' ? '清除' : 'Clear'}
            </button>
          </div>
        )}

        <div className="bg-surface-white border border-border rounded-2xl shadow-sm focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10 transition-all">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={e => { onInputChange(e.target.value); onClearDraftSource(); }}
            onCompositionStart={() => {/* isComposing handled by parent */}}
            onCompositionEnd={() => {/* isComposing handled by parent */}}
            onKeyDown={onKeyDown}
            placeholder={compact
              ? (language === 'zh' ? '给 DailyFlow 发消息…' : 'Message DailyFlow…')
              : (language === 'zh' ? '问点什么…  Enter 发送 / Shift+Enter 换行' : 'Ask anything…  Enter to send · Shift+Enter for new line')}
            rows={compact ? 1 : 2}
            className={`w-full bg-transparent focus:outline-none resize-none placeholder:text-text-muted/60 leading-relaxed ${compact ? 'px-4 pt-3 pb-2 text-sm' : 'px-5 pt-4 pb-2 text-[15px]'}`}
          />

          <div className="flex items-center gap-1.5 px-3 pb-3">
            <button
              onClick={onOpenContextPicker}
              className={`relative flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                (activeSession?.contextItems.length || 0) > 0
                  ? 'text-accent bg-accent/10 hover:bg-accent/15'
                  : 'text-text-muted hover:text-accent hover:bg-accent/5'
              }`}
            >
              <Paperclip className="w-3.5 h-3.5" />
              {language === 'zh' ? '上下文' : 'Context'}
              {(activeSession?.contextItems.length || 0) > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-accent text-white">
                  {activeSession!.contextItems.length}
                </span>
              )}
            </button>

            {!compact && onCreateMeetingNote && (
              <button
                onClick={onCreateMeetingNote}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-text-muted hover:text-accent hover:bg-accent/5 transition-colors"
                title={language === 'zh' ? '新建会议记录并打开录音' : 'Create a meeting note and open recording'}
              >
                <Mic className="w-3.5 h-3.5" />
                {language === 'zh' ? '会议' : 'Meeting'}
              </button>
            )}

            {/* Skill picker */}
            {!compact && <div className="relative">
              <button
                onClick={() => { setShowSkillMenu(!showSkillMenu); setShowModelMenu(false); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  pendingSkillId ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-accent hover:bg-accent/5'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                {pendingSkillId && activeSkill ? activeSkill.name : (language === 'zh' ? 'Skill' : 'Skill')}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showSkillMenu && (
                <div className="absolute bottom-full mb-1.5 left-0 w-72 bg-surface-white border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto z-50">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted/80 font-bold border-b border-border">
                    {language === 'zh' ? 'Skills（提示词预设）' : 'Skills (prompt presets)'}
                  </div>
                  {skills.length === 0 ? (
                    <div className="p-4 text-xs text-text-muted">
                      <p className="mb-2">{language === 'zh' ? '还没有 Skill。' : 'No skills yet.'}</p>
                      <button onClick={() => { setShowSkillMenu(false); onOpenSettings(); }} className="text-accent font-bold hover:underline">
                        {language === 'zh' ? '+ 在「模型 & Skills 设置」中添加' : '+ Manage in Models & Skills'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {skills.map(skill => (
                        <button
                          key={skill.id}
                          onClick={() => { onSelectSkill(skill.id); setShowSkillMenu(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors ${
                            pendingSkillId === skill.id ? 'bg-accent/10 text-accent' : ''
                          }`}
                          title={skill.description || ''}
                        >
                          <div className="font-bold">{skill.name}</div>
                          <div className="text-[10px] text-text-muted truncate">
                            {skill.description || (skill.systemPrompt || skill.prompt || '').slice(0, 60) + '…'}
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={() => { setShowSkillMenu(false); onOpenSettings(); }}
                        className="w-full text-left px-3 py-2 text-[11px] font-bold text-accent border-t border-border hover:bg-accent/5"
                      >
                        {language === 'zh' ? '管理 Skills…' : 'Manage skills…'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>}

            {/* Model picker */}
            {!compact && <div className="relative ml-auto">
              <button
                onClick={() => { setShowModelMenu(!showModelMenu); setShowSkillMenu(false); }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-accent hover:bg-accent/5 rounded-lg transition-colors"
              >
                <Bot className="w-3.5 h-3.5" />
                {activeProvider?.name || (language === 'zh' ? '选择模型' : 'Pick model')}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showModelMenu && (
                <div className="absolute bottom-full mb-1.5 right-0 w-72 bg-surface-white border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto z-50">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted/80 font-bold border-b border-border">
                    {language === 'zh' ? '模型供应商' : 'Providers'}
                  </div>
                  {providers.length === 0 ? (
                    <div className="p-4 text-xs text-text-muted">
                      <p className="mb-2">{language === 'zh' ? '还没有添加任何模型。' : 'No providers yet.'}</p>
                      <button onClick={() => { setShowModelMenu(false); onOpenSettings(); }} className="text-accent font-bold hover:underline">
                        {language === 'zh' ? '+ 添加供应商' : '+ Add provider'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {providers.map(p => (
                        <button
                          key={p.id}
                          onClick={() => onChangeProvider(p.id)}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors ${
                            activeProvider?.id === p.id ? 'bg-accent/10 text-accent' : ''
                          }`}
                        >
                          <div className="font-bold flex items-center gap-1">
                            {p.name}
                            {activeProvider?.id === p.id && <span className="ml-auto text-[10px]">✓</span>}
                          </div>
                          <div className="text-[10px] text-text-muted truncate font-mono">{p.model}</div>
                        </button>
                      ))}
                      <button
                        onClick={() => { setShowModelMenu(false); onOpenSettings(); }}
                        className="w-full text-left px-3 py-2 text-[11px] font-bold text-accent border-t border-border hover:bg-accent/5"
                      >
                        {language === 'zh' ? '管理供应商…' : 'Manage providers…'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>}

            <button
              onClick={isStreaming ? onStop : onSend}
              disabled={!isStreaming && !inputValue.trim()}
              className={`${compact ? 'ml-auto' : ''} p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isStreaming ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-accent text-white hover:bg-accent/90'
              }`}
            >
              {isStreaming ? <StopCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {!compact && <p className="text-[10px] text-text-muted/70 text-center mt-2">
          {language === 'zh'
            ? `通过「模型 & Skills 设置」管理供应商与提示词预设`
            : `Manage providers & prompt presets in "Models & Skills"`}
        </p>}
      </div>
    </div>
  );
}
