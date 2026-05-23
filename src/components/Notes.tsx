import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, FileText, Mic, Sparkles, X, ChevronDown, Loader2, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { notesApi, tasksApi, promptsApi, aiApi, type NoteData, type PromptTemplateData } from '../api/client';
import { NoteCard } from './NoteCard';
import { NoteEditor } from './NoteEditor';

interface NotesProps {
  activeContext: 'work' | 'life';
  language: 'en' | 'zh';
  aiProvider?: 'deepseek' | 'anthropic' | 'openai' | 'custom';
  aiApiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string;
}

type TypeFilter = 'all' | 'note' | 'meeting_note' | 'summary';

export const Notes: React.FC<NotesProps> = ({ activeContext, language, aiProvider, aiApiKey, aiModel, aiBaseUrl }) => {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [editingNote, setEditingNote] = useState<NoteData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [mentionFilter, setMentionFilter] = useState<string | null>(null);
  const [allMentions, setAllMentions] = useState<string[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [availableTasks, setAvailableTasks] = useState<{ id: string; title: string }[]>([]);

  // AI Summary generator state
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const [summaryPeriod, setSummaryPeriod] = useState<'7days' | '30days' | 'all'>('7days');
  const [prompts, setPrompts] = useState<PromptTemplateData[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState<string>('');
  const [summaryError, setSummaryError] = useState<string>('');

  const loadNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: any = { context: activeContext };
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (mentionFilter) filters.mention = mentionFilter;
      const data = await notesApi.getAll(filters);
      setNotes(data);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeContext, typeFilter, mentionFilter]);

  const loadMentions = useCallback(async () => {
    try {
      const mentions = await notesApi.getMentions();
      setAllMentions(mentions);
    } catch (err) {
      console.error('Failed to load mentions:', err);
    }
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);
  useEffect(() => { loadMentions(); }, [loadMentions]);

  useEffect(() => {
    promptsApi.getAll()
      .then(data => {
        setPrompts(data);
        if (data.length > 0) setSelectedPromptId(data[0].id);
      })
      .catch(err => console.error('Failed to load prompts:', err));
  }, []);

  useEffect(() => {
    if (viewMode === 'edit' && editingNote) {
      tasksApi.getByDate(editingNote.date)
        .then(data => setAvailableTasks(data.map((t: any) => ({ id: t.id, title: t.title }))))
        .catch(err => console.error('Failed to load tasks:', err));
    } else if (viewMode === 'edit') {
      const today = new Date().toISOString().slice(0, 10);
      tasksApi.getByDate(today)
        .then(data => setAvailableTasks(data.map((t: any) => ({ id: t.id, title: t.title }))))
        .catch(err => console.error('Failed to load tasks:', err));
    }
  }, [viewMode, editingNote]);

  const handleSave = async (data: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'mentions'>) => {
    try {
      if (editingNote) {
        await notesApi.update(editingNote.id, data);
      } else {
        await notesApi.create(data);
      }
      setViewMode('list');
      setEditingNote(null);
      loadNotes();
      loadMentions();
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await notesApi.delete(id);
      setViewMode('list');
      setEditingNote(null);
      loadNotes();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const generateSummary = async () => {
    if (!aiProvider || !aiApiKey) {
      setSummaryError(language === 'zh' ? 'AI 未配置，请在设置中配置 AI 提供商和 API Key' : 'AI not configured. Please set up AI provider and API Key in Settings.');
      return;
    }
    if (!selectedPromptId) {
      setSummaryError(language === 'zh' ? '请选择提示词模板' : 'Please select a prompt template.');
      return;
    }

    setIsGeneratingSummary(true);
    setGeneratedSummary('');
    setSummaryError('');

    try {
      const promptTemplate = prompts.find(p => p.id === selectedPromptId);
      if (!promptTemplate) throw new Error('Prompt template not found');

      // Filter notes by period
      const now = new Date();
      let filteredNotes = notes;
      if (summaryPeriod === '7days') {
        const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredNotes = notes.filter(n => new Date(n.date) >= cutoff);
      } else if (summaryPeriod === '30days') {
        const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredNotes = notes.filter(n => new Date(n.date) >= cutoff);
      }

      if (filteredNotes.length === 0) {
        throw new Error(language === 'zh' ? '选定时间范围内没有笔记' : 'No notes in selected period.');
      }

      // Build context
      const grouped = filteredNotes.reduce<Record<string, NoteData[]>>((acc, note) => {
        if (!acc[note.date]) acc[note.date] = [];
        acc[note.date].push(note);
        return acc;
      }, {});

      let contextStr = '';
      Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).forEach(([date, dateNotes]) => {
        contextStr += `--- ${date} ---\n`;
        dateNotes.forEach(note => {
          contextStr += `# ${note.title}\n${note.body}\n\n`;
        });
      });

      const isAnthropicFormat = aiProvider === 'anthropic' || (aiProvider === 'custom' && aiModel?.includes('claude'));
      const systemPrompt = 'You are a helpful assistant that summarizes notes concisely in Markdown.';
      const userPrompt = `${promptTemplate.prompt}\n\nHere are the notes:\n\n${contextStr}`;

      const { summary } = await aiApi.summarize({
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        baseUrl: aiBaseUrl,
        systemPrompt,
        userPrompt,
        format: isAnthropicFormat ? 'anthropic' : 'openai',
      });

      setGeneratedSummary(summary);
    } catch (err: any) {
      console.error('Summary generation failed:', err);
      setSummaryError(err.message || String(err));
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const saveSummaryAsNote = async () => {
    if (!generatedSummary.trim()) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const promptName = prompts.find(p => p.id === selectedPromptId)?.name || 'Summary';
      await notesApi.create({
        title: `${promptName} - ${today}`,
        body: `# ${promptName} - ${today}\n\n${generatedSummary}`,
        type: 'summary',
        date: today,
        context: activeContext,
        tags: ['ai-generated', 'summary'],
        linkedTaskIds: [],
        linkedProjectIds: [],
      });
      setGeneratedSummary('');
      setShowSummaryPanel(false);
      loadNotes();
    } catch (err) {
      console.error('Failed to save summary:', err);
    }
  };

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(n => n.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.mentions.some(m => m.toLowerCase().includes(q))
      );
    }
    if (tagFilter) {
      result = result.filter(n => n.tags.includes(tagFilter));
    }
    return result;
  }, [notes, searchQuery, tagFilter]);

  // Group by date
  const grouped = filteredNotes.reduce<Record<string, NoteData[]>>((acc, note) => {
    if (!acc[note.date]) acc[note.date] = [];
    acc[note.date].push(note);
    return acc;
  }, {});

  const typeFilters: { value: TypeFilter; icon: typeof FileText; label: string; labelZh: string }[] = [
    { value: 'all', icon: FileText, label: 'All', labelZh: '全部' },
    { value: 'note', icon: FileText, label: 'Notes', labelZh: '笔记' },
    { value: 'meeting_note', icon: Mic, label: 'Meetings', labelZh: '会议' },
    { value: 'summary', icon: Sparkles, label: 'Summaries', labelZh: '总结' },
  ];

  return (
    <motion.div
      key="notes-view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {viewMode === 'edit' ? (
        <div className="flex flex-col">
          <NoteEditor
            note={editingNote}
            language={language}
            activeContext={activeContext}
            availableTasks={availableTasks}
            availableTags={allTags}
            aiProvider={aiProvider}
            aiApiKey={aiApiKey}
            aiModel={aiModel}
            aiBaseUrl={aiBaseUrl}
            onSave={handleSave}
            onClose={() => { setViewMode('list'); setEditingNote(null); }}
            onDelete={editingNote ? () => handleDelete(editingNote.id) : undefined}
          />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="font-sans text-3xl text-text-heading italic">
              {language === 'zh' ? '笔记' : 'Notes'}
            </h1>
            <button
              onClick={() => { setEditingNote(null); setViewMode('edit'); }}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-md text-xs font-bold  hover:bg-accent/90 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              {language === 'zh' ? '新建' : 'New'}
            </button>
          </div>

      {/* Filter bar */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={language === 'zh' ? '搜索笔记、@人名、标签...' : 'Search notes, @mentions, tags...'}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-md text-sm text-text-main outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Type + Mention filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {typeFilters.map(f => {
            const Icon = f.icon;
            return (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-xs font-bold  border transition-all ${
                  typeFilter === f.value
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface text-text-muted border-border hover:border-accent/50'
                }`}
                title={language === 'zh' ? f.labelZh : f.label}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{language === 'zh' ? f.labelZh : f.label}</span>
              </button>
            );
          })}

          {/* Mention filter */}
          {allMentions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowMentionDropdown(!showMentionDropdown)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold  border transition-all ${
                  mentionFilter
                    ? 'bg-accent/10 text-accent border-accent/30'
                    : 'bg-surface text-text-muted border-border hover:border-accent/50'
                }`}
              >
                {mentionFilter ? `@${mentionFilter}` : (language === 'zh' ? '@人员' : '@Person')}
                <ChevronDown className="w-3 h-3" />
              </button>

              {showMentionDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full left-0 mt-1 bg-surface-white border border-border rounded-md shadow-sm py-1 z-20 min-w-[140px]"
                >
                  {mentionFilter && (
                    <button
                      onClick={() => { setMentionFilter(null); setShowMentionDropdown(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-text-muted hover:bg-surface transition-colors"
                    >
                      {language === 'zh' ? '清除筛选' : 'Clear filter'}
                    </button>
                  )}
                  {allMentions.map(m => (
                    <button
                      key={m}
                      onClick={() => { setMentionFilter(m); setShowMentionDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors ${
                        mentionFilter === m ? 'text-accent font-bold' : 'text-text-main'
                      }`}
                    >
                      @{m}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>
          )}

          {/* Active filter badges */}
          {mentionFilter && (
            <button
              onClick={() => setMentionFilter(null)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-accent/10 text-accent text-xs font-bold hover:bg-accent/20 transition-colors"
            >
              @{mentionFilter}
              <X className="w-2.5 h-2.5" />
            </button>
          )}
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-accent/10 text-accent text-xs font-bold hover:bg-accent/20 transition-colors"
            >
              #{tagFilter}
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className={`px-2.5 py-1 rounded text-xs font-bold  border transition-all ${
                  tagFilter === tag
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface text-text-muted border-border hover:border-accent/50'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI Summary Generator */}
      <div className="bg-surface-white border border-border rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowSummaryPanel(!showSummaryPanel)}
            className="flex items-center gap-2 text-text-heading hover:text-accent transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span className="font-sans text-sm italic">
              {language === 'zh' ? 'AI 总结生成器' : 'AI Summary Generator'}
            </span>
          </button>
          {!showSummaryPanel && (
            <span className="text-xs text-text-muted">
              {language === 'zh' ? '基于当前筛选的笔记生成结构化总结' : 'Generate structured summary from filtered notes'}
            </span>
          )}
        </div>

        {showSummaryPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3"
          >
            {/* Period selector */}
            <div className="flex items-center gap-2">
              {(['7days', '30days', 'all'] as const).map(period => (
                <button
                  key={period}
                  onClick={() => setSummaryPeriod(period)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold  border transition-all ${
                    summaryPeriod === period
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface text-text-muted border-border hover:border-accent/50'
                  }`}
                >
                  {period === '7days' ? (language === 'zh' ? '最近 7 天' : 'Last 7 Days') :
                   period === '30days' ? (language === 'zh' ? '最近 30 天' : 'Last 30 Days') :
                   (language === 'zh' ? '全部时间' : 'All Time')}
                </button>
              ))}
            </div>

            {/* Prompt selector */}
            {prompts.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted  font-bold">
                  {language === 'zh' ? '提示词:' : 'Prompt:'}
                </span>
                {prompts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPromptId(p.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
                      selectedPromptId === p.id
                        ? 'bg-accent/10 text-accent border-accent/30'
                        : 'bg-surface text-text-muted border-border hover:border-accent/30'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* Generate button + result */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={generateSummary}
                  disabled={isGeneratingSummary}
                  className="flex items-center gap-2 px-4 py-2 bg-text-heading text-white rounded-md text-xs font-bold  hover:bg-text-heading/90 transition-colors disabled:opacity-50"
                >
                  {isGeneratingSummary ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {language === 'zh' ? '生成中...' : 'Generating...'}
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3.5 h-3.5" />
                      {language === 'zh' ? '生成总结' : 'Generate Summary'}
                    </>
                  )}
                </button>
                {generatedSummary && (
                  <button
                    onClick={saveSummaryAsNote}
                    className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-md text-xs font-bold  hover:bg-accent/90 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {language === 'zh' ? '保存为笔记' : 'Save as Note'}
                  </button>
                )}
              </div>

              {summaryError && (
                <p className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-md px-3 py-2">
                  {summaryError}
                </p>
              )}

              {generatedSummary && (
                <div className="bg-surface border border-border rounded-md p-4 max-h-[300px] overflow-y-auto">
                  <div className="prose prose-slate prose-sm max-w-none">
                    <ReactMarkdown>{generatedSummary}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="py-20 text-center text-text-muted text-sm">
          {language === 'zh' ? '加载中...' : 'Loading...'}
        </div>
      ) : filteredNotes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 text-center"
        >
          <FileText className="w-12 h-12 text-border mx-auto mb-4" />
          <p className="text-text-muted text-sm">
            {searchQuery || mentionFilter || tagFilter
              ? (language === 'zh' ? '没有匹配的笔记' : 'No matching notes')
              : (language === 'zh' ? '还没有笔记，创建第一条吧' : 'No notes yet. Create your first one.')}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          <AnimatePresence>
            {Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([date, dateNotes]) => (
              <div key={date} className="space-y-3">
                <h3 className="font-sans text-xs  text-text-muted font-bold pl-1">
                  {date}
                </h3>
                <div className="space-y-3">
                  <AnimatePresence>
                    {dateNotes.map((note, index) => (
                      <motion.div
                        key={note.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ delay: index * 0.05, duration: 0.2 }}
                      >
                        <NoteCard
                          note={note}
                          language={language}
                          activeContext={activeContext}
                          onEdit={() => { setEditingNote(note); setViewMode('edit'); }}
                          onDelete={() => handleDelete(note.id)}
                          onMentionClick={(m) => setMentionFilter(m)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  )}
</motion.div>
  );
};
