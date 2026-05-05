import { motion } from 'motion/react';
import { X, Sparkles, Loader2, Calendar, Plus, Edit2, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AISummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'zh';
  onGenerate: (startDate: string, endDate: string, prompt: string) => Promise<void>;
  summary: string | null;
  isGenerating: boolean;
}

interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
}

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'default',
    name: 'Default Summary',
    prompt: 'Please analyze my daily notes and provide insights about my work patterns, progress, and key achievements.',
  },
  {
    id: 'productivity',
    name: 'Productivity Analysis',
    prompt: 'Analyze my productivity patterns, identify peak performance times, and suggest improvements.',
  },
  {
    id: 'goals',
    name: 'Goal Progress',
    prompt: 'Review my progress towards goals, identify completed tasks, and highlight areas needing attention.',
  },
];

export function AISummaryModal({
  isOpen,
  onClose,
  language,
  onGenerate,
  summary,
  isGenerating,
}: AISummaryModalProps) {
  const [dateRangeMode, setDateRangeMode] = useState<'preset' | 'custom'>('preset');
  const [presetRange, setPresetRange] = useState<'7days' | '30days' | 'all'>('7days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [templates, setTemplates] = useState<PromptTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState('default');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);

  useEffect(() => {
    // Load templates from localStorage
    const saved = localStorage.getItem('aiSummaryTemplates');
    if (saved) {
      try {
        setTemplates(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load templates', e);
      }
    }
  }, []);

  const saveTemplates = (newTemplates: PromptTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem('aiSummaryTemplates', JSON.stringify(newTemplates));
  };

  const handleGenerate = async () => {
    let start = '';
    let end = '';

    if (dateRangeMode === 'preset') {
      const today = new Date();
      end = today.toISOString().split('T')[0];

      if (presetRange === '7days') {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        start = sevenDaysAgo.toISOString().split('T')[0];
      } else if (presetRange === '30days') {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        start = thirtyDaysAgo.toISOString().split('T')[0];
      } else {
        start = '';
      }
    } else {
      start = startDate;
      end = endDate;
    }

    const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
    const prompt = customPrompt || selectedTemplate?.prompt || DEFAULT_TEMPLATES[0].prompt;

    await onGenerate(start, end, prompt);
  };

  const handleAddTemplate = () => {
    const newTemplate: PromptTemplate = {
      id: Date.now().toString(),
      name: language === 'zh' ? '新模板' : 'New Template',
      prompt: '',
    };
    setEditingTemplate(newTemplate);
    setShowTemplateEditor(true);
  };

  const handleSaveTemplate = (template: PromptTemplate) => {
    const existing = templates.find(t => t.id === template.id);
    if (existing) {
      saveTemplates(templates.map(t => t.id === template.id ? template : t));
    } else {
      saveTemplates([...templates, template]);
    }
    setShowTemplateEditor(false);
    setEditingTemplate(null);
  };

  const handleDeleteTemplate = (id: string) => {
    if (DEFAULT_TEMPLATES.some(t => t.id === id)) {
      alert(language === 'zh' ? '无法删除默认模板' : 'Cannot delete default template');
      return;
    }
    if (confirm(language === 'zh' ? '确定要删除这个模板吗？' : 'Are you sure you want to delete this template?')) {
      saveTemplates(templates.filter(t => t.id !== id));
      if (selectedTemplateId === id) {
        setSelectedTemplateId('default');
      }
    }
  };

  const t = {
    title: language === 'zh' ? 'AI 洞察' : 'AI Summary',
    dateRange: language === 'zh' ? '日期范围' : 'Date Range',
    preset: language === 'zh' ? '预设' : 'Preset',
    custom: language === 'zh' ? '自定义' : 'Custom',
    last7Days: language === 'zh' ? '最近 7 天' : 'Last 7 Days',
    last30Days: language === 'zh' ? '最近 30 天' : 'Last 30 Days',
    allTime: language === 'zh' ? '全部时间' : 'All Time',
    startDate: language === 'zh' ? '开始日期' : 'Start Date',
    endDate: language === 'zh' ? '结束日期' : 'End Date',
    promptTemplate: language === 'zh' ? '提示词模板' : 'Prompt Template',
    customPrompt: language === 'zh' ? '自定义提示词' : 'Custom Prompt',
    customPromptPlaceholder: language === 'zh' ? '输入自定义提示词（可选）' : 'Enter custom prompt (optional)',
    addTemplate: language === 'zh' ? '添加模板' : 'Add Template',
    generate: language === 'zh' ? '生成洞察' : 'Generate Insights',
    generating: language === 'zh' ? '正在分析洞察...' : 'Analyzing insights...',
    noSummary: language === 'zh' ? '选择日期范围和提示词模板，然后生成总结。' : 'Select date range and prompt template, then generate summary.',
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-background rounded-2xl border border-border w-full max-w-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-accent" />
            {t.title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date Range Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">{t.dateRange}</label>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setDateRangeMode('preset')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                dateRangeMode === 'preset'
                  ? 'bg-accent text-white'
                  : 'bg-accent/10 text-accent hover:bg-accent/20'
              }`}
            >
              {t.preset}
            </button>
            <button
              onClick={() => setDateRangeMode('custom')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                dateRangeMode === 'custom'
                  ? 'bg-accent text-white'
                  : 'bg-accent/10 text-accent hover:bg-accent/20'
              }`}
            >
              {t.custom}
            </button>
          </div>

          {dateRangeMode === 'preset' ? (
            <div className="flex gap-2">
              <button
                onClick={() => setPresetRange('7days')}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  presetRange === '7days'
                    ? 'bg-accent/20 text-accent border-2 border-accent'
                    : 'bg-background border border-border hover:border-accent/50'
                }`}
              >
                {t.last7Days}
              </button>
              <button
                onClick={() => setPresetRange('30days')}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  presetRange === '30days'
                    ? 'bg-accent/20 text-accent border-2 border-accent'
                    : 'bg-background border border-border hover:border-accent/50'
                }`}
              >
                {t.last30Days}
              </button>
              <button
                onClick={() => setPresetRange('all')}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  presetRange === 'all'
                    ? 'bg-accent/20 text-accent border-2 border-accent'
                    : 'bg-background border border-border hover:border-accent/50'
                }`}
              >
                {t.allTime}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-2">{t.startDate}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2">{t.endDate}</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* Prompt Template Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">{t.promptTemplate}</label>
            <button
              onClick={handleAddTemplate}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              {t.addTemplate}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {templates.map(template => (
              <div
                key={template.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                  selectedTemplateId === template.id
                    ? 'bg-accent/10 border-accent'
                    : 'bg-background border-border hover:border-accent/50'
                }`}
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{template.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{template.prompt}</div>
                </div>
                <div className="flex items-center gap-2">
                  {!DEFAULT_TEMPLATES.some(t => t.id === template.id) && (
                    <>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setEditingTemplate(template);
                          setShowTemplateEditor(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-accent/10 text-accent transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteTemplate(template.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Prompt */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">{t.customPrompt}</label>
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder={t.customPromptPlaceholder}
            rows={3}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors resize-none"
          />
        </div>

        {/* Summary Display */}
        <div className="mb-6 min-h-[300px] border border-border rounded-xl p-6 bg-accent/5">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center h-full text-accent">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <span className="text-sm font-medium">{t.generating}</span>
            </div>
          ) : summary ? (
            <div className="prose prose-sm max-w-none">
              {summary}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Sparkles className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm text-center">{t.noSummary}</p>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {t.generate}
          </button>
        </div>

        {/* Template Editor Modal */}
        {showTemplateEditor && editingTemplate && (
          <TemplateEditor
            template={editingTemplate}
            language={language}
            onSave={handleSaveTemplate}
            onClose={() => {
              setShowTemplateEditor(false);
              setEditingTemplate(null);
            }}
          />
        )}
      </motion.div>
    </div>
  );
}

// Template Editor Component
interface TemplateEditorProps {
  template: PromptTemplate;
  language: 'en' | 'zh';
  onSave: (template: PromptTemplate) => void;
  onClose: () => void;
}

function TemplateEditor({ template, language, onSave, onClose }: TemplateEditorProps) {
  const [name, setName] = useState(template.name);
  const [prompt, setPrompt] = useState(template.prompt);

  const t = {
    title: language === 'zh' ? '编辑模板' : 'Edit Template',
    nameLabel: language === 'zh' ? '模板名称' : 'Template Name',
    namePlaceholder: language === 'zh' ? '输入模板名称' : 'Enter template name',
    promptLabel: language === 'zh' ? '提示词' : 'Prompt',
    promptPlaceholder: language === 'zh' ? '输入提示词内容' : 'Enter prompt content',
    save: language === 'zh' ? '保存' : 'Save',
    cancel: language === 'zh' ? '取消' : 'Cancel',
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-background rounded-2xl border border-border w-full max-w-lg p-6 shadow-2xl"
      >
        <h3 className="text-xl font-bold mb-4">{t.title}</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t.nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t.promptLabel}</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t.promptPlaceholder}
              rows={6}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => onSave({ ...template, name, prompt })}
            disabled={!name.trim() || !prompt.trim()}
            className="flex-1 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {t.save}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors"
          >
            {t.cancel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
