import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, FileText, Mic, Sparkles, Calendar, Clock, Check,
  Link2, Tag, Users, ArrowLeft, Eye, Edit3, Trash2,
  Wand2, Loader2, MessageSquare, ListChecks, ChevronDown,
  Maximize2, Minimize2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { NoteData, PromptTemplateData } from '../api/client';
import { promptsApi, aiApi } from '../api/client';
import { getActiveAiConfig } from '../types/models';
import { getTagColor } from '../utils/tagColors';
import { TagInput } from './TagInput';

interface AvailableTask {
  id: string;
  title: string;
}

interface NoteEditorProps {
  note?: NoteData | null;
  language: 'en' | 'zh';
  activeContext: 'work' | 'life';
  availableTasks?: AvailableTask[];
  availableTags?: string[];
  aiApiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string;
  defaultDate?: string;
  defaultLinkedTaskIds?: string[];
  defaultTitle?: string;
  defaultType?: NoteData['type'];
  initialPreview?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onSave: (data: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'mentions'>) => void;
  onClose: () => void;
  onDelete?: () => void;
  onSendToChat?: (payload: { title: string; body: string; type: NoteData['type']; noteId?: string }) => void;
}

const typeOptions = [
  { value: 'note' as const, icon: FileText, label: 'Note', labelZh: '笔记' },
  { value: 'meeting_note' as const, icon: Mic, label: 'Meeting', labelZh: '会议' },
  { value: 'summary' as const, icon: Sparkles, label: 'Summary', labelZh: '总结' },
];

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  language,
  activeContext,
  availableTasks = [],
  availableTags = [],
  aiApiKey,
  aiModel,
  aiBaseUrl,
  defaultDate,
  defaultLinkedTaskIds,
  defaultTitle,
  defaultType,
  initialPreview,
  isMaximized,
  onToggleMaximize,
  onSave,
  onClose,
  onDelete,
  onSendToChat,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  // Resolve AI config live from the active provider store; fall back to props.
  // Props can go stale because they only refresh on mount / provider-changed events.
  const resolveAiConfig = () => {
    const active = getActiveAiConfig();
    return {
      apiKey: active?.apiKey || aiApiKey || '',
      model: active?.model || aiModel || undefined,
      baseUrl: active?.baseUrl || aiBaseUrl || '',
    };
  };

  const [type, setType] = useState<NoteData['type']>(note?.type || defaultType || 'note');
  const [title, setTitle] = useState(note?.title || defaultTitle || '');
  const [body, setBody] = useState(note?.body || '');
  const [date, setDate] = useState(note?.date || defaultDate || today);
  const [time, setTime] = useState(note?.time || nowTime);
  const [endTime, setEndTime] = useState(note?.endTime || '');
  const [tags, setTags] = useState<string[]>(note?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [participants, setParticipants] = useState<string[]>(note?.participants || []);
  const [participantInput, setParticipantInput] = useState('');
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>(note?.linkedTaskIds || defaultLinkedTaskIds || []);
  const [previewMode, setPreviewMode] = useState(initialPreview ?? false);
  const [showMeta, setShowMeta] = useState(true);

  // AI Format state
  const [formatPrompts, setFormatPrompts] = useState<PromptTemplateData[]>([]);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatError, setFormatError] = useState('');
  const formatBtnRef = useRef<HTMLButtonElement>(null);

  // Inline AI Edit state
  const [showAiEditPanel, setShowAiEditPanel] = useState(false);
  const [aiEditResult, setAiEditResult] = useState('');
  const [isAiEditing, setIsAiEditing] = useState(false);
  const aiEditBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    promptsApi.getAll()
      .then(data => {
        const formatOnes = data.filter(p => p.scope === 'format');
        setFormatPrompts(formatOnes);
      })
      .catch(err => console.error('Failed to load format prompts:', err));
  }, []);

  // Close format panel on click outside
  useEffect(() => {
    if (!showFormatPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (formatBtnRef.current && !formatBtnRef.current.contains(e.target as Node)) {
        setShowFormatPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFormatPanel]);

  const handleSave = () => {
    if (!title.trim()) return;
    // Only prepend H1 if body doesn't already start with one
    const firstLine = body.trimStart().split('\n')[0];
    const hasH1 = firstLine.startsWith('# ');
    const fullBody = hasH1 ? body : `# ${title}\n\n${body}`;
    onSave({
      title: title.trim(),
      body: fullBody,
      type,
      date,
      time: time || undefined,
      endTime: endTime || undefined,
      context: activeContext,
      tags,
      linkedTaskIds,
      linkedProjectIds: [],
      participants: type === 'meeting_note' ? participants : undefined,
    });
  };

  const handleFormat = async (promptId: string) => {
    const { apiKey, model, baseUrl } = resolveAiConfig();
    if (!apiKey || !baseUrl) {
      setFormatError(language === 'zh' ? 'AI 未配置，请在设置中配置 AI 提供商和 API Key' : 'AI not configured. Please set up AI provider and API Key in Settings.');
      return;
    }

    const promptTemplate = formatPrompts.find(p => p.id === promptId);
    if (!promptTemplate) return;

    setIsFormatting(true);
    setFormatError('');
    setShowFormatPanel(false);

    try {
      const systemPrompt = language === 'zh'
        ? '你是一位专业的笔记整理助手。请根据用户要求对笔记进行格式化整理，返回完整的 Markdown 格式内容。保留原标题作为一级标题。'
        : 'You are a professional note formatting assistant. Please format and reorganize the note according to the user\'s request. Return the complete content in Markdown format. Preserve the original title as a level-1 heading.';
      const userPrompt = `${promptTemplate.prompt}\n\n---\n\n${body}`;

      const { summary } = await aiApi.summarize({
        apiKey,
        model,
        baseUrl,
        systemPrompt,
        userPrompt,
      });

      setBody(summary);
    } catch (err: any) {
      console.error('Format failed:', err);
      setFormatError(err.message || String(err));
    } finally {
      setIsFormatting(false);
    }
  };

  // Built-in smart AI actions — independent of user Skills library.
  // Each action runs the AI and may also reshape note metadata (type, etc.).
  const handleInlineAiEdit = async (action: 'polish' | 'continue' | 'summarize' | 'todos') => {
    const { apiKey, model, baseUrl } = resolveAiConfig();
    if (!apiKey || !baseUrl) {
      setFormatError(language === 'zh' ? 'AI 未配置，请在设置中配置 AI 提供商和 API Key' : 'AI not configured. Please set up AI provider and API Key in Settings.');
      return;
    }
    if (!body.trim()) {
      setFormatError(language === 'zh' ? '正文为空，无法编辑' : 'Body is empty');
      return;
    }
    setIsAiEditing(true);
    setShowAiEditPanel(false);
    setFormatError('');

    const cfg = {
      polish: {
        zh: '润色优化以下笔记。修正语法，提升表达清晰度，保持原意和结构不变。返回完整 Markdown，保留一级标题。',
        en: 'Polish this note. Fix grammar, improve clarity, preserve meaning and structure. Return full Markdown, preserve level-1 heading.',
      },
      continue: {
        zh: '基于以下笔记的上下文和风格，续写后续内容。保持一致的语气和格式。返回续写部分（不需要重复原文）。',
        en: 'Continue writing based on the context and style of the note below. Maintain consistent tone and format. Return only the continuation (do not repeat original text).',
      },
      summarize: {
        zh: '把以下内容总结为结构化摘要：核心要点、关键决策、风险与未决事项、下一步。返回完整 Markdown，保留一级标题。',
        en: 'Summarize into a structured brief: key points, decisions, risks/open issues, next steps. Return full Markdown, preserve level-1 heading.',
      },
      todos: {
        zh: '从笔记中提取所有待办事项、行动项、承诺，整理成清晰的 Markdown 任务清单（- [ ] 格式），保留上下文。返回完整 Markdown，保留一级标题。',
        en: 'Extract all action items, todos, and commitments. Output as Markdown task list (- [ ] format), preserve context. Return full Markdown, preserve level-1 heading.',
      },
    } as const;

    try {
      const { zh, en } = cfg[action];
      const systemPrompt = language === 'zh'
        ? '你是一位专业的笔记编辑助手。返回完整的 Markdown 内容，无任何前后修饰。'
        : 'You are a professional note editing assistant. Return only the complete Markdown content with no preamble.';
      const userPrompt = `${language === 'zh' ? zh : en}\n\n---\n\n${body}`;

      const { summary } = await aiApi.summarize({
        apiKey,
        model,
        baseUrl,
        systemPrompt,
        userPrompt,
      });
      setAiEditResult(summary);
      setShowAiEditPanel(true);
    } catch (err: any) {
      console.error('Inline AI edit failed:', err);
      setFormatError(err.message || String(err));
    } finally {
      setIsAiEditing(false);
    }
  };

  const runSmartAction = async (action: 'meeting' | 'todos' | 'summary' | 'polish') => {
    const { apiKey, model, baseUrl } = resolveAiConfig();
    if (!apiKey || !baseUrl) {
      setFormatError(language === 'zh' ? 'AI 未配置，请在设置中配置 AI 提供商和 API Key' : 'AI not configured. Please set up AI provider and API Key in Settings.');
      return;
    }
    if (!body.trim()) {
      setFormatError(language === 'zh' ? '正文为空，无法整理' : 'Body is empty');
      return;
    }
    setIsFormatting(true);
    setFormatError('');
    setShowFormatPanel(false);

    const cfg = {
      meeting: {
        zh: '你是会议纪要专家。把以下原始会议记录整理为标准会议纪要：会议主题、时间、参会人员、议题、关键决定、待办事项（每项标负责人和截止日期）、下次会议安排。返回完整 Markdown，保留一级标题。',
        en: 'You are a meeting-notes expert. Reformat the raw meeting record into: topic, time, participants, agenda, decisions, action items (each with owner & due date), next meeting. Return full Markdown, preserve level-1 heading.',
        type: 'meeting_note' as NoteData['type'],
      },
      todos: {
        zh: '从笔记中提取所有待办事项、行动项、承诺，整理成清晰的 Markdown 任务清单（- [ ] 格式），保留上下文。返回完整 Markdown，保留一级标题。',
        en: 'Extract all action items, todos, and commitments. Output as Markdown task list (- [ ] format), preserve context. Return full Markdown, preserve level-1 heading.',
        type: 'note' as NoteData['type'],
      },
      summary: {
        zh: '把以下内容总结为结构化摘要：核心要点、关键决策、风险与未决事项、下一步。返回完整 Markdown，保留一级标题。',
        en: 'Summarize into a structured brief: key points, decisions, risks/open issues, next steps. Return full Markdown, preserve level-1 heading.',
        type: 'summary' as NoteData['type'],
      },
      polish: {
        zh: '润色优化以下笔记。修正语法，提升表达清晰度，保持原意和结构不变。返回完整 Markdown，保留一级标题。',
        en: 'Polish this note. Fix grammar, improve clarity, preserve meaning and structure. Return full Markdown, preserve level-1 heading.',
        type, // keep current
      },
    } as const;

    try {
      const { zh, en, type: nextType } = cfg[action];
      const systemPrompt = language === 'zh'
        ? '你是一位专业的笔记整理助手。返回完整的 Markdown 内容，无任何前后修饰。'
        : 'You are a professional note formatting assistant. Return only the complete Markdown content with no preamble.';
      const userPrompt = `${language === 'zh' ? zh : en}\n\n---\n\n${body}`;

      const { summary } = await aiApi.summarize({
        apiKey,
        model,
        baseUrl,
        systemPrompt,
        userPrompt,
      });
      setBody(summary);
      if (nextType !== type) setType(nextType);
    } catch (err: any) {
      console.error('Smart action failed:', err);
      setFormatError(err.message || String(err));
    } finally {
      setIsFormatting(false);
    }
  };

  const hasUnsavedChanges = note
    ? (
        note.title !== title ||
        note.body !== body ||
        note.type !== type ||
        JSON.stringify(note.tags || []) !== JSON.stringify(tags) ||
        JSON.stringify(note.linkedTaskIds || []) !== JSON.stringify(linkedTaskIds)
      )
    : (
        title.trim() !== '' ||
        body.trim() !== '' ||
        type !== 'note' ||
        tags.length > 0 ||
        linkedTaskIds.length > 0 ||
        participants.length > 0
      );

  const handleSendToChat = () => {
    if (!onSendToChat) return;
    if (hasUnsavedChanges) {
      const ok = window.confirm(
        language === 'zh'
          ? '笔记有未保存的修改，确定要发送到对话吗？'
          : 'This note has unsaved changes. Send to chat anyway?'
      );
      if (!ok) return;
    }
    onSendToChat({ title, body, type, noteId: note?.id });
  };

  const addTag = (value: string) => {
    const t = value.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
  };

  const addParticipant = (value: string) => {
    const p = value.trim();
    if (p && !participants.includes(p)) setParticipants([...participants, p]);
  };

  const bodyWithoutHeading = body.trimStart().startsWith('# ')
    ? body.trimStart().replace(/^#\s+.*\n?/, '').trimStart()
    : body;

  return (
    <div className="flex flex-col h-full w-full bg-surface-white">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-text-muted hover:text-text-heading transition-colors text-xs font-bold "
          >
            <ArrowLeft className="w-4 h-4" />
            {language === 'zh' ? '返回' : 'Back'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading hover:bg-surface rounded-md transition-colors"
              title={isMaximized ? (language === 'zh' ? '还原' : 'Restore') : (language === 'zh' ? '最大化' : 'Maximize')}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          {onDelete && note && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold  text-stone-500 hover:bg-stone-50 rounded-md transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {language === 'zh' ? '删除' : 'Delete'}
            </button>
          )}

          {/* AI Assistant button — built-in smart actions + custom prompts */}
          <div className="relative">
            <button
              ref={formatBtnRef}
              onClick={() => {
                if (isFormatting) return;
                setShowFormatPanel(!showFormatPanel);
                setFormatError('');
              }}
              disabled={isFormatting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/10 rounded-md transition-colors disabled:opacity-50"
            >
              {isFormatting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              {language === 'zh' ? 'AI 助手' : 'AI Assist'}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            <AnimatePresence>
              {showFormatPanel && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 bg-surface-white border border-border rounded-md shadow-lg p-2 z-30 min-w-[260px]"
                >
                  <p className="text-[10px] uppercase tracking-wide text-text-muted font-bold px-2 py-1">
                    {language === 'zh' ? '智能整理' : 'Smart actions'}
                  </p>
                  <button
                    onClick={() => runSmartAction('meeting')}
                    className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-accent/10 text-left transition-colors"
                  >
                    <Mic className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-heading">{language === 'zh' ? '整理为会议纪要' : 'Format as meeting notes'}</div>
                      <div className="text-[11px] text-text-muted">{language === 'zh' ? '原始记录 → 议题/决定/待办' : 'Raw record → topics / decisions / actions'}</div>
                    </div>
                  </button>
                  <button
                    onClick={() => runSmartAction('todos')}
                    className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-accent/10 text-left transition-colors"
                  >
                    <ListChecks className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-heading">{language === 'zh' ? '提取待办' : 'Extract todos'}</div>
                      <div className="text-[11px] text-text-muted">{language === 'zh' ? '抽取所有 action items' : 'Pull out all action items'}</div>
                    </div>
                  </button>
                  <button
                    onClick={() => runSmartAction('summary')}
                    className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-accent/10 text-left transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-heading">{language === 'zh' ? '生成总结' : 'Generate summary'}</div>
                      <div className="text-[11px] text-text-muted">{language === 'zh' ? '要点 / 决策 / 风险 / 下一步' : 'Key points / decisions / risks / next'}</div>
                    </div>
                  </button>
                  <button
                    onClick={() => runSmartAction('polish')}
                    className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-accent/10 text-left transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-heading">{language === 'zh' ? '润色优化' : 'Polish'}</div>
                      <div className="text-[11px] text-text-muted">{language === 'zh' ? '修语法、提清晰度' : 'Fix grammar, improve clarity'}</div>
                    </div>
                  </button>

                  {formatPrompts.length > 0 && (
                    <>
                      <div className="border-t border-border/60 my-1.5" />
                      <p className="text-[10px] uppercase tracking-wide text-text-muted font-bold px-2 py-1">
                        {language === 'zh' ? '自定义 Skill' : 'Custom skills'}
                      </p>
                      <div className="flex flex-wrap gap-1 px-1">
                        {formatPrompts.map(p => (
                          <button
                            key={p.id}
                            onClick={() => handleFormat(p.id)}
                            className="px-2 py-0.5 rounded-md text-[11px] font-bold border bg-surface text-text-muted border-border hover:border-accent/50 hover:text-accent transition-all"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Inline AI Edit */}
          <div className="relative">
            <button
              ref={aiEditBtnRef}
              onClick={() => {
                if (isAiEditing) return;
                setShowAiEditPanel(!showAiEditPanel);
                setFormatError('');
              }}
              disabled={isAiEditing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors disabled:opacity-50"
              title={language === 'zh' ? 'AI 编辑' : 'AI Edit'}
            >
              {isAiEditing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Edit3 className="w-3.5 h-3.5" />
              )}
              {language === 'zh' ? 'AI 编辑' : 'AI Edit'}
            </button>

            <AnimatePresence>
              {showAiEditPanel && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 bg-surface-white border border-border rounded-md shadow-lg p-2 z-30 min-w-[280px] max-w-sm"
                >
                  {aiEditResult ? (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wide text-text-muted font-bold px-2 py-1">
                        {language === 'zh' ? 'AI 编辑结果' : 'AI Edit Result'}
                      </p>
                      <div className="px-2 py-1.5 max-h-48 overflow-y-auto text-xs text-text-heading bg-surface rounded border border-border whitespace-pre-wrap font-mono">
                        {aiEditResult}
                      </div>
                      <div className="flex items-center gap-1.5 px-2 pt-1">
                        <button
                          onClick={() => {
                            setBody(aiEditResult);
                            setAiEditResult('');
                            setShowAiEditPanel(false);
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                        >
                          {language === 'zh' ? '替换' : 'Replace'}
                        </button>
                        <button
                          onClick={() => {
                            setBody(prev => prev + '\n\n' + aiEditResult);
                            setAiEditResult('');
                            setShowAiEditPanel(false);
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold border border-border rounded hover:border-accent/50 hover:text-accent transition-colors"
                        >
                          {language === 'zh' ? '追加' : 'Append'}
                        </button>
                        <button
                          onClick={() => { setAiEditResult(''); }}
                          className="px-2.5 py-1 text-[11px] text-text-muted hover:text-text-heading transition-colors"
                        >
                          {language === 'zh' ? '返回' : 'Back'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wide text-text-muted font-bold px-2 py-1">
                        {language === 'zh' ? 'AI 编辑' : 'AI Edit'}
                      </p>
                      <button
                        onClick={() => handleInlineAiEdit('polish')}
                        className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-accent/10 text-left transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-text-heading">{language === 'zh' ? '润色优化' : 'Polish'}</div>
                          <div className="text-[11px] text-text-muted">{language === 'zh' ? '修语法、提清晰度' : 'Fix grammar, improve clarity'}</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleInlineAiEdit('continue')}
                        className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-accent/10 text-left transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-text-heading">{language === 'zh' ? '续写' : 'Continue'}</div>
                          <div className="text-[11px] text-text-muted">{language === 'zh' ? '基于上下文续写内容' : 'Continue writing from context'}</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleInlineAiEdit('summarize')}
                        className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-accent/10 text-left transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-text-heading">{language === 'zh' ? '总结摘要' : 'Summarize'}</div>
                          <div className="text-[11px] text-text-muted">{language === 'zh' ? '要点 / 决策 / 下一步' : 'Key points / decisions / next'}</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleInlineAiEdit('todos')}
                        className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-accent/10 text-left transition-colors"
                      >
                        <ListChecks className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-text-heading">{language === 'zh' ? '提取待办' : 'Extract todos'}</div>
                          <div className="text-[11px] text-text-muted">{language === 'zh' ? '抽取所有 action items' : 'Pull out all action items'}</div>
                        </div>
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Send to AI Chat */}
          {onSendToChat && (
            <button
              onClick={handleSendToChat}
              disabled={!body.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors disabled:opacity-40"
              title={language === 'zh' ? '把这篇笔记发到 AI 对话继续讨论' : 'Continue this note as an AI chat'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {language === 'zh' ? '发到对话' : 'Send to Chat'}
            </button>
          )}

          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold  text-text-muted hover:text-text-heading hover:bg-surface rounded-md transition-colors"
          >
            {previewMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {previewMode
              ? (language === 'zh' ? '编辑' : 'Edit')
              : (language === 'zh' ? '预览' : 'Preview')}
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded-md text-xs font-bold  hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" />
            {language === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </div>

      {/* Format error banner */}
      <AnimatePresence>
        {formatError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-6 py-2 bg-stone-50 border-b border-stone-200 text-xs text-stone-600 shrink-0"
          >
            {formatError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {/* Title */}
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={language === 'zh' ? '标题...' : 'Title...'}
            className="w-full bg-transparent outline-none font-sans text-3xl text-text-heading placeholder:text-text-muted/40"
          />

          {/* Metadata summary row (always visible, compact) */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Type — compact dropdown chip; AI Assist auto-sets it, manual change is rare */}
            <div className="relative group">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NoteData['type'])}
                className="appearance-none flex items-center gap-1 pl-7 pr-7 py-1 rounded-md text-xs font-bold border bg-surface text-text-muted border-border hover:border-accent/50 cursor-pointer focus:outline-none focus:border-accent"
                title={language === 'zh' ? '类型' : 'Type'}
              >
                {typeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {language === 'zh' ? opt.labelZh : opt.label}
                  </option>
                ))}
              </select>
              {/* Leading icon */}
              {(() => {
                const opt = typeOptions.find(o => o.value === type);
                const Icon = opt?.icon || FileText;
                return (
                  <Icon className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" />
                );
              })()}
              <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
            </div>

            {/* Date */}
            <label className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-surface text-text-muted text-xs">
              <Calendar className="w-3 h-3" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-transparent outline-none text-xs font-mono"
              />
            </label>

            {/* Time */}
            <label className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-surface text-text-muted text-xs">
              <Clock className="w-3 h-3" />
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="bg-transparent outline-none text-xs font-mono"
              />
            </label>

            {type === 'meeting_note' && (
              <label className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-surface text-text-muted text-xs">
                <span className="text-[9px]">→</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="bg-transparent outline-none text-xs font-mono"
                />
              </label>
            )}

            {/* Tags preview */}
            {tags.length > 0 && (
              <div className="flex items-center gap-1">
                <Tag className="w-3 h-3 text-text-muted" />
                {tags.map(tag => (
                  <span
                    key={tag}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getTagColor(tag)}`}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Expand meta button */}
            <button
              onClick={() => setShowMeta(!showMeta)}
              className="text-xs text-accent font-bold  hover:underline"
            >
              {showMeta
                ? (language === 'zh' ? '收起 ▲' : 'Less ▲')
                : (language === 'zh' ? '更多 ▼' : 'More ▼')}
            </button>
          </div>

          {/* Expanded metadata */}
          {showMeta && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3 pb-2"
            >
              {/* Tags editor */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted flex items-center gap-1 mb-1">
                  <Tag className="w-3 h-3" />
                  {language === 'zh' ? '标签' : 'Tags'}
                </label>
                <TagInput
                  tags={tags}
                  onChange={setTags}
                  availableTags={availableTags}
                  language={language}
                />
              </div>

              {/* Participants (meeting only) */}
              {type === 'meeting_note' && (
                <div className="space-y-1.5">
                  <label className="text-xs  font-bold text-text-muted flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {language === 'zh' ? '参会人' : 'Participants'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {participants.map(p => (
                      <span key={p} className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">
                        @{p}
                        <X className="w-2.5 h-2.5 cursor-pointer hover:text-stone-500" onClick={() => setParticipants(participants.filter(x => x !== p))} />
                      </span>
                    ))}
                    <input
                      value={participantInput}
                      onChange={e => setParticipantInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing && participantInput.trim()) {
                          e.preventDefault();
                          addParticipant(participantInput);
                          setParticipantInput('');
                        }
                      }}
                      placeholder={language === 'zh' ? '+ 添加参会人' : '+ Add participant'}
                      className="bg-surface border border-border rounded px-2.5 py-1 text-xs outline-none focus:border-accent w-28 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Linked Tasks */}
              {availableTasks.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs  font-bold text-text-muted flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    {language === 'zh' ? '关联任务' : 'Linked Tasks'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableTasks.map(task => (
                      <button
                        key={task.id}
                        onClick={() => {
                          setLinkedTaskIds(prev =>
                            prev.includes(task.id)
                              ? prev.filter(id => id !== task.id)
                              : [...prev, task.id]
                          );
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold border transition-all ${
                          linkedTaskIds.includes(task.id)
                            ? 'bg-accent/10 text-accent border-accent/30'
                            : 'bg-surface text-text-muted border-border hover:border-accent/30'
                        }`}
                      >
                        {linkedTaskIds.includes(task.id) && <Check className="w-3 h-3" />}
                        <span className="truncate max-w-[180px]">{task.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </motion.div>
          )}

          {/* Divider */}
          <div className="border-t border-border/50" />

          {/* Content area */}
          <div className="min-h-[300px] relative">
            {isFormatting && (
              <div className="absolute inset-0 z-10 bg-surface/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 rounded">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
                <span className="text-xs font-bold text-text-muted">
                  {language === 'zh' ? 'AI 整理中...' : 'AI formatting...'}
                </span>
              </div>
            )}
            {previewMode ? (
              <div className="prose prose-slate max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyWithoutHeading || body}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={language === 'zh'
                  ? '开始写作... 支持 Markdown 语法'
                  : 'Start writing... Markdown supported'}
                className="w-full h-[calc(100vh-280px)] min-h-[300px] bg-transparent outline-none text-sm text-text-main resize-none font-mono leading-relaxed"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
