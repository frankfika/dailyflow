import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, FileText, Mic, Sparkles, Calendar, Clock, Check,
  Link2, Tag, Users, ArrowLeft, Eye, Edit3, Trash2,
  Wand2, Loader2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { NoteData, PromptTemplateData } from '../api/client';
import { promptsApi, aiApi } from '../api/client';
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
  aiProvider?: 'deepseek' | 'anthropic' | 'openai' | 'custom';
  aiApiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string;
  onSave: (data: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'mentions'>) => void;
  onClose: () => void;
  onDelete?: () => void;
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
  aiProvider,
  aiApiKey,
  aiModel,
  aiBaseUrl,
  onSave,
  onClose,
  onDelete,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  const [type, setType] = useState<NoteData['type']>(note?.type || 'note');
  const [title, setTitle] = useState(note?.title || '');
  const [body, setBody] = useState(note?.body || '');
  const [date, setDate] = useState(note?.date || today);
  const [time, setTime] = useState(note?.time || nowTime);
  const [endTime, setEndTime] = useState(note?.endTime || '');
  const [tags, setTags] = useState<string[]>(note?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [participants, setParticipants] = useState<string[]>(note?.participants || []);
  const [participantInput, setParticipantInput] = useState('');
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>(note?.linkedTaskIds || []);
  const [previewMode, setPreviewMode] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  // AI Format state
  const [formatPrompts, setFormatPrompts] = useState<PromptTemplateData[]>([]);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatError, setFormatError] = useState('');
  const formatBtnRef = useRef<HTMLButtonElement>(null);

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
    const fullBody = body.startsWith('# ') ? body : `# ${title}\n\n${body}`;
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
    if (!aiProvider || !aiApiKey) {
      setFormatError(language === 'zh' ? 'AI 未配置，请在设置中配置 AI 提供商和 API Key' : 'AI not configured. Please set up AI provider and API Key in Settings.');
      return;
    }

    const promptTemplate = formatPrompts.find(p => p.id === promptId);
    if (!promptTemplate) return;

    setIsFormatting(true);
    setFormatError('');
    setShowFormatPanel(false);

    try {
      const isAnthropicFormat = aiProvider === 'anthropic' || (aiProvider === 'custom' && aiModel?.includes('claude'));
      const systemPrompt = language === 'zh'
        ? '你是一位专业的笔记整理助手。请根据用户要求对笔记进行格式化整理，返回完整的 Markdown 格式内容。保留原标题作为一级标题。'
        : 'You are a professional note formatting assistant. Please format and reorganize the note according to the user\'s request. Return the complete content in Markdown format. Preserve the original title as a level-1 heading.';
      const userPrompt = `${promptTemplate.prompt}\n\n---\n\n${body}`;

      const { summary } = await aiApi.summarize({
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        baseUrl: aiBaseUrl,
        systemPrompt,
        userPrompt,
        format: isAnthropicFormat ? 'anthropic' : 'openai',
      });

      setBody(summary);
    } catch (err: any) {
      console.error('Format failed:', err);
      setFormatError(err.message || String(err));
    } finally {
      setIsFormatting(false);
    }
  };

  const addTag = (value: string) => {
    const t = value.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
  };

  const addParticipant = (value: string) => {
    const p = value.trim();
    if (p && !participants.includes(p)) setParticipants([...participants, p]);
  };

  const bodyWithoutHeading = body.startsWith('# ')
    ? body.split('\n').slice(1).join('\n').trim()
    : body;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
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
          {onDelete && note && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold  text-stone-500 hover:bg-stone-50 rounded-md transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {language === 'zh' ? '删除' : 'Delete'}
            </button>
          )}

          {/* AI Format button */}
          <div className="relative">
            <button
              ref={formatBtnRef}
              onClick={() => {
                if (isFormatting) return;
                setShowFormatPanel(!showFormatPanel);
                setFormatError('');
              }}
              disabled={isFormatting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold  text-accent hover:bg-accent/10 rounded-md transition-colors disabled:opacity-50"
            >
              {isFormatting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              {language === 'zh' ? 'AI 整理' : 'AI Format'}
            </button>

            <AnimatePresence>
              {showFormatPanel && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 bg-surface-white border border-border rounded-md shadow-sm p-3 z-30 min-w-[220px]"
                >
                  <p className="text-xs  text-text-muted font-bold mb-2">
                    {language === 'zh' ? '选择整理方式' : 'Choose format style'}
                  </p>
                  {formatPrompts.length === 0 ? (
                    <p className="text-xs text-text-muted py-1">
                      {language === 'zh' ? '暂无格式提示词' : 'No format prompts yet'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {formatPrompts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleFormat(p.id)}
                          className="px-2.5 py-1 rounded-md text-xs font-bold border bg-surface text-text-muted border-border hover:border-accent/50 hover:text-accent transition-all"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
            {/* Type */}
            <div className="flex items-center gap-1">
              {typeOptions.map(opt => {
                const Icon = opt.icon;
                const active = type === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setType(opt.value)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold  border transition-all ${
                      active
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface text-text-muted border-border hover:border-accent/50'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {language === 'zh' ? opt.labelZh : opt.label}
                  </button>
                );
              })}
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
                        if ((e.key === 'Enter' || e.key === ',') && participantInput.trim()) {
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
          <div className="min-h-[300px]">
            {previewMode ? (
              <div className="prose prose-slate max-w-none">
                <ReactMarkdown>{bodyWithoutHeading || body}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                value={bodyWithoutHeading}
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
