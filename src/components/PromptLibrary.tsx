/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Pencil, Trash2, X, Check, Loader2, Sparkles } from 'lucide-react';
import { promptsApi, type PromptTemplateData } from '../api/client';

const SCOPE_OPTIONS = [
  { value: 'format', label: '格式', labelEn: 'Format' },
  { value: 'date-range', label: '日期范围', labelEn: 'Date Range' },
  { value: 'project', label: '项目', labelEn: 'Project' },
  { value: 'person', label: '人员', labelEn: 'Person' },
  { value: 'custom', label: '自定义', labelEn: 'Custom' },
];

interface PromptLibraryProps {
  language: 'en' | 'zh';
}

export function PromptLibrary({ language }: PromptLibraryProps) {
  const [prompts, setPrompts] = useState<PromptTemplateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // New/Edit form state
  const [formName, setFormName] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formScope, setFormScope] = useState('format');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    setIsLoading(true);
    try {
      const data = await promptsApi.getAll();
      setPrompts(data);
    } catch (err) {
      console.error('Failed to load prompts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPrompts = filterScope === 'all'
    ? prompts
    : prompts.filter(p => p.scope === filterScope);

  const handleCreate = async () => {
    if (!formName.trim() || !formPrompt.trim()) return;
    setSaving(true);
    try {
      await promptsApi.create({ name: formName.trim(), prompt: formPrompt.trim(), scope: formScope });
      await loadPrompts();
      resetForm();
    } catch (err) {
      console.error('Failed to create prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formName.trim() || !formPrompt.trim()) return;
    setSaving(true);
    try {
      await promptsApi.update(id, { name: formName.trim(), prompt: formPrompt.trim(), scope: formScope });
      await loadPrompts();
      setEditingId(null);
      resetForm();
    } catch (err) {
      console.error('Failed to update prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(language === 'zh' ? '确定删除这个提示词？' : 'Delete this prompt?')) return;
    try {
      await promptsApi.delete(id);
      await loadPrompts();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
    }
  };

  const startEdit = (prompt: PromptTemplateData) => {
    setEditingId(prompt.id);
    setFormName(prompt.name);
    setFormPrompt(prompt.prompt);
    setFormScope(prompt.scope);
    setIsCreating(false);
  };

  const resetForm = () => {
    setFormName('');
    setFormPrompt('');
    setFormScope('format');
    setIsCreating(false);
    setEditingId(null);
  };

  const getScopeLabel = (scope: string) => {
    const opt = SCOPE_OPTIONS.find(o => o.value === scope);
    return language === 'zh' ? (opt?.label || scope) : (opt?.labelEn || scope);
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <Sparkles className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-sans font-semibold text-text-heading">
            {language === 'zh' ? '提示词库' : 'Prompt Library'}
          </h2>
        </div>
        <p className="text-sm text-text-muted">
          {language === 'zh' ? '管理 AI 格式化提示词模板' : 'Manage AI formatting prompt templates'}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        {[{ value: 'all', label: language === 'zh' ? '全部' : 'All' }, ...SCOPE_OPTIONS].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterScope(opt.value)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
              filterScope === opt.value
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'bg-surface text-text-muted border-border hover:border-accent/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="py-20 text-center text-text-muted">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">{language === 'zh' ? '加载中...' : 'Loading...'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="wait">
              {filteredPrompts.map(prompt => (
                <motion.div
                  key={prompt.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="bg-surface-white border border-border rounded-md p-4"
                >
                  {editingId === prompt.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={formName}
                          onChange={e => setFormName(e.target.value)}
                          placeholder={language === 'zh' ? '名称' : 'Name'}
                          className="flex-1 px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                        />
                        <select
                          value={formScope}
                          onChange={e => setFormScope(e.target.value)}
                          className="px-2 py-1.5 text-xs border border-border rounded bg-surface"
                        >
                          {SCOPE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        value={formPrompt}
                        onChange={e => setFormPrompt(e.target.value)}
                        placeholder={language === 'zh' ? '提示词内容...' : 'Prompt content...'}
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none font-mono"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={resetForm}
                          className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
                        >
                          {language === 'zh' ? '取消' : 'Cancel'}
                        </button>
                        <button
                          onClick={() => handleUpdate(prompt.id)}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          {language === 'zh' ? '保存' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-text-heading">{prompt.name}</h3>
                          <span className="px-2 py-0.5 text-xs font-bold bg-accent/10 text-accent rounded">
                            {getScopeLabel(prompt.scope)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(prompt)}
                            className="p-1.5 text-text-muted hover:text-accent transition-colors"
                            title={language === 'zh' ? '编辑' : 'Edit'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(prompt.id)}
                            className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
                            title={language === 'zh' ? '删除' : 'Delete'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-text-muted font-mono leading-relaxed whitespace-pre-wrap bg-surface rounded p-2 border border-border">
                        {prompt.prompt}
                      </p>
                      <p className="text-xs text-text-muted/60 mt-2">
                        {language === 'zh' ? '创建于' : 'Created'} {new Date(prompt.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
                      </p>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredPrompts.length === 0 && (
              <div className="py-12 text-center text-text-muted">
                <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {filterScope === 'all'
                    ? (language === 'zh' ? '暂无提示词' : 'No prompts yet')
                    : (language === 'zh' ? `暂无${getScopeLabel(filterScope)}类型提示词` : `No ${filterScope} prompts`)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add prompt button / form */}
      <div className="px-6 py-4 border-t border-border">
        {isCreating ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-white border border-border rounded-md p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={language === 'zh' ? '提示词名称' : 'Prompt name'}
                className="flex-1 px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                autoFocus
              />
              <select
                value={formScope}
                onChange={e => setFormScope(e.target.value)}
                className="px-2 py-1.5 text-xs border border-border rounded bg-surface"
              >
                {SCOPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={formPrompt}
              onChange={e => setFormPrompt(e.target.value)}
              placeholder={language === 'zh' ? '提示词内容...' : 'Prompt content...'}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none font-mono"
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={resetForm}
                className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formName.trim() || !formPrompt.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {language === 'zh' ? '创建' : 'Create'}
              </button>
            </div>
          </motion.div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent/10 text-accent border border-accent/20 rounded-md text-xs font-bold hover:bg-accent/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {language === 'zh' ? '添加提示词' : 'Add Prompt'}
          </button>
        )}
      </div>
    </div>
  );
}