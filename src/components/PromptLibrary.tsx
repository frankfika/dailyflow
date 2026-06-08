/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Pencil, Trash2, X, Check, Loader2, Sparkles, Settings, Play, ChevronDown } from 'lucide-react';
import { promptsApi, aiApi, type PromptTemplateData } from '../api/client';

const SCOPE_OPTIONS = [
  { value: 'format', label: '格式', labelEn: 'Format' },
  { value: 'date-range', label: '日期范围', labelEn: 'Date Range' },
  { value: 'project', label: '项目', labelEn: 'Project' },
  { value: 'person', label: '人员', labelEn: 'Person' },
  { value: 'custom', label: '自定义', labelEn: 'Custom' },
];

interface AiConfig {
  id: string;
  name: string;
  provider: 'deepseek' | 'anthropic' | 'openai' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string;
  isDefault?: boolean;
}

interface PromptLibraryProps {
  language: 'en' | 'zh';
  activeAiConfigId?: string;
  onAiConfigChange?: (configId: string) => void;
}

export function PromptLibrary({ language, activeAiConfigId = 'default', onAiConfigChange }: PromptLibraryProps) {
  const [prompts, setPrompts] = useState<PromptTemplateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<string>('all');

  // AI Configs
  const [aiConfigs, setAiConfigs] = useState<AiConfig[]>([]);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);

  // Form state for prompts - use Map to store per-prompt state
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptForms, setPromptForms] = useState<Map<string, { name: string; prompt: string; scope: string }>>(new Map());
  const [saving, setSaving] = useState(false);

  // Get form state for a specific prompt
  const getPromptForm = (promptId: string) => {
    return promptForms.get(promptId) || { name: '', prompt: '', scope: 'format' };
  };

  // Update form state for a specific prompt
  const updatePromptForm = (promptId: string, updates: Partial<{ name: string; prompt: string; scope: string }>) => {
    setPromptForms(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(promptId) || { name: '', prompt: '', scope: 'format' };
      newMap.set(promptId, { ...current, ...updates });
      return newMap;
    });
  };

  // Clear form state for a specific prompt
  const clearPromptForm = (promptId: string) => {
    setPromptForms(prev => {
      const newMap = new Map(prev);
      newMap.delete(promptId);
      return newMap;
    });
  };

  // Test prompt state
  const [testingPromptId, setTestingPromptId] = useState<string | null>(null);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [testError, setTestError] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // Config form state
  const [configForm, setConfigForm] = useState<Partial<AiConfig>>({});

  useEffect(() => {
    loadPrompts();
    loadAiConfigs();
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

  const loadAiConfigs = () => {
    try {
      const saved = localStorage.getItem('df_ai_configs');
      if (saved) {
        setAiConfigs(JSON.parse(saved));
      } else {
        // Default config
        const defaultConfig: AiConfig = {
          id: 'default',
          name: language === 'zh' ? '默认配置' : 'Default',
          provider: 'deepseek',
          apiKey: '',
          model: 'deepseek-chat',
          isDefault: true,
        };
        setAiConfigs([defaultConfig]);
        localStorage.setItem('df_ai_configs', JSON.stringify([defaultConfig]));
      }
    } catch (e) {
      console.error('Failed to load AI configs:', e);
    }
  };

  const activeConfig = aiConfigs.find(c => c.id === activeAiConfigId) || aiConfigs[0];

  const filteredPrompts = filterScope === 'all'
    ? prompts
    : prompts.filter(p => p.scope === filterScope);

  // Prompt handlers
  const handleCreatePrompt = async () => {
    const createForm = getPromptForm('__create__');
    if (!createForm.name.trim() || !createForm.prompt.trim()) return;
    setSaving(true);
    try {
      await promptsApi.create({
        name: createForm.name.trim(),
        description: '',
        systemPrompt: createForm.prompt.trim(),
        scope: createForm.scope,
      });
      await loadPrompts();
      resetPromptForm();
    } catch (err) {
      console.error('Failed to create prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePrompt = async (id: string) => {
    const form = getPromptForm(id);
    if (!form.name.trim() || !form.prompt.trim()) return;
    setSaving(true);
    try {
      await promptsApi.update(id, { name: form.name.trim(), prompt: form.prompt.trim(), scope: form.scope });
      await loadPrompts();
      setEditingPromptId(null);
      clearPromptForm(id);
    } catch (err) {
      console.error('Failed to update prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrompt = async (id: string) => {
    if (!confirm(language === 'zh' ? '确定删除这个提示词？' : 'Delete this prompt?')) return;
    try {
      await promptsApi.delete(id);
      await loadPrompts();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
    }
  };

  const startEditPrompt = (prompt: PromptTemplateData) => {
    // Initialize form with prompt data
    setPromptForms(prev => {
      const newMap = new Map(prev);
      newMap.set(prompt.id, {
        name: prompt.name,
        prompt: prompt.prompt,
        scope: prompt.scope,
      });
      return newMap;
    });
    setEditingPromptId(prompt.id);
    setIsCreatingPrompt(false);
  };

  const resetPromptForm = () => {
    clearPromptForm('__create__');
    setIsCreatingPrompt(false);
    if (editingPromptId) {
      clearPromptForm(editingPromptId);
      setEditingPromptId(null);
    }
  };

  // AI Config handlers
  const saveAiConfig = (config: AiConfig) => {
    const updated = aiConfigs.map(c => c.id === config.id ? config : c);
    if (!updated.find(c => c.id === config.id)) {
      updated.push(config);
    }
    setAiConfigs(updated);
    localStorage.setItem('df_ai_configs', JSON.stringify(updated));
    setEditingConfigId(null);
    setConfigForm({});
  };

  const deleteAiConfig = (id: string) => {
    if (aiConfigs.length <= 1) {
      alert(language === 'zh' ? '至少保留一个配置' : 'At least one config required');
      return;
    }
    const updated = aiConfigs.filter(c => c.id !== id);
    setAiConfigs(updated);
    localStorage.setItem('df_ai_configs', JSON.stringify(updated));
    if (activeAiConfigId === id && onAiConfigChange) {
      onAiConfigChange(updated[0].id);
    }
  };

  // Test prompt
  const handleTestPrompt = async (prompt: PromptTemplateData) => {
    if (!testInput.trim()) {
      setTestError(language === 'zh' ? '请输入测试内容' : 'Please enter test content');
      return;
    }
    if (!activeConfig?.apiKey) {
      setTestError(language === 'zh' ? '请先配置 AI API Key' : 'Please configure AI API Key first');
      return;
    }

    setTestingPromptId(prompt.id);
    setIsTesting(true);
    setTestError('');
    setTestOutput('');

    try {
      const { summary } = await aiApi.summarize({
        apiKey: activeConfig.apiKey,
        model: activeConfig.model,
        baseUrl: activeConfig.baseUrl,
        systemPrompt: language === 'zh'
          ? '你是一位专业的笔记整理助手。请根据用户要求对笔记进行格式化整理，返回完整的 Markdown 格式内容。'
          : 'You are a professional note formatting assistant. Please format and reorganize notes according to user requirements.',
        userPrompt: `${prompt.prompt}\n\n---\n\n${testInput}`,
      });

      setTestOutput(summary);
    } catch (err: any) {
      setTestError(err.message || String(err));
    } finally {
      setIsTesting(false);
    }
  };

  const getScopeLabel = (scope: string) => {
    const opt = SCOPE_OPTIONS.find(o => o.value === scope);
    return language === 'zh' ? (opt?.label || scope) : (opt?.labelEn || scope);
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex items-center justify-between">
        <div>
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
        <button
          onClick={() => setShowAiSettings(!showAiSettings)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-surface border border-border rounded hover:bg-surface-white transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          {showAiSettings ? (language === 'zh' ? '关闭设置' : 'Close Settings') : (language === 'zh' ? 'AI 配置' : 'AI Config')}
        </button>
      </div>

      {/* AI Settings Panel */}
      <AnimatePresence>
        {showAiSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-border overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-heading">
                  {language === 'zh' ? 'AI 配置管理' : 'AI Configurations'}
                </h3>
                <button
                  onClick={() => {
                    const newId = `config_${Date.now()}`;
                    setConfigForm({
                      id: newId,
                      name: language === 'zh' ? '新配置' : 'New Config',
                      provider: 'deepseek',
                      apiKey: '',
                      model: 'deepseek-chat',
                    });
                    setEditingConfigId(newId);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-accent hover:bg-accent/10 rounded transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {language === 'zh' ? '添加配置' : 'Add Config'}
                </button>
              </div>

              {/* Config list */}
              <div className="space-y-2">
                {aiConfigs.map(config => (
                  <div key={config.id} className="flex items-center gap-3 p-3 bg-surface-white border border-border rounded-md">
                    {editingConfigId === config.id ? (
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={configForm.name || ''}
                            onChange={e => setConfigForm({ ...configForm, name: e.target.value })}
                            placeholder={language === 'zh' ? '配置名称' : 'Config Name'}
                            className="flex-1 px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                          />
                          <button
                            onClick={() => saveAiConfig({ ...config, ...configForm } as AiConfig)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setEditingConfigId(null); setConfigForm({}); }}
                            className="p-1.5 text-text-muted hover:bg-surface rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={configForm.provider || 'deepseek'}
                            onChange={e => setConfigForm({ ...configForm, provider: e.target.value as any })}
                            className="px-2 py-1 text-xs border border-border rounded bg-surface"
                          >
                            <option value="deepseek">DeepSeek</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="openai">OpenAI</option>
                            <option value="custom">{language === 'zh' ? '自定义' : 'Custom'}</option>
                          </select>
                          <input
                            type="text"
                            value={configForm.model || ''}
                            onChange={e => setConfigForm({ ...configForm, model: e.target.value })}
                            placeholder={language === 'zh' ? '模型' : 'Model'}
                            className="flex-1 px-2 py-1 text-xs border border-border rounded bg-surface focus:outline-none focus:border-accent"
                          />
                        </div>
                        <input
                          type="password"
                          value={configForm.apiKey || ''}
                          onChange={e => setConfigForm({ ...configForm, apiKey: e.target.value })}
                          placeholder={language === 'zh' ? 'API Key' : 'API Key'}
                          className="w-full px-2 py-1 text-xs border border-border rounded bg-surface focus:outline-none focus:border-accent"
                        />
                        {configForm.provider === 'custom' && (
                          <input
                            type="text"
                            value={configForm.baseUrl || ''}
                            onChange={e => setConfigForm({ ...configForm, baseUrl: e.target.value })}
                            placeholder={language === 'zh' ? 'Base URL (可选)' : 'Base URL (optional)'}
                            className="w-full px-2 py-1 text-xs border border-border rounded bg-surface focus:outline-none focus:border-accent"
                          />
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 cursor-pointer" onClick={() => onAiConfigChange?.(config.id)}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-text-heading">{config.name}</span>
                            {activeAiConfigId === config.id && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-accent/10 text-accent rounded">
                                {language === 'zh' ? '使用中' : 'Active'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted">
                            {config.provider} / {config.model || '-'}
                          </div>
                        </div>
                        <button
                          onClick={() => { setEditingConfigId(config.id); setConfigForm(config); }}
                          className="p-1.5 text-text-muted hover:text-accent transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!config.isDefault && (
                          <button
                            onClick={() => deleteAiConfig(config.id)}
                            className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Active config indicator */}
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span>{language === 'zh' ? '当前使用' : 'Using'}:</span>
                <span className="font-semibold text-accent">{activeConfig?.name || '-'}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add prompt form at top */}
      <div className="px-6 py-4 border-b border-border">
        {isCreatingPrompt ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-white border border-border rounded-md p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={getPromptForm('__create__').name}
                onChange={e => updatePromptForm('__create__', { name: e.target.value })}
                placeholder={language === 'zh' ? '提示词名称' : 'Prompt name'}
                className="flex-1 px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                autoFocus
              />
              <select
                value={getPromptForm('__create__').scope}
                onChange={e => updatePromptForm('__create__', { scope: e.target.value })}
                className="px-2 py-1.5 text-xs border border-border rounded bg-surface"
              >
                {SCOPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={getPromptForm('__create__').prompt}
              onChange={e => updatePromptForm('__create__', { prompt: e.target.value })}
              placeholder={language === 'zh' ? '提示词内容...' : 'Prompt content...'}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none font-mono"
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={resetPromptForm}
                className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleCreatePrompt}
                disabled={saving || !getPromptForm('__create__').name.trim() || !getPromptForm('__create__').prompt.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {language === 'zh' ? '创建' : 'Create'}
              </button>
            </div>
          </motion.div>
        ) : (
          <button
            onClick={() => setIsCreatingPrompt(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent/10 text-accent border border-accent/20 rounded-md text-xs font-bold hover:bg-accent/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {language === 'zh' ? '添加提示词' : 'Add Prompt'}
          </button>
        )}
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

      {/* Prompt list */}
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
                  {editingPromptId === prompt.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={getPromptForm(prompt.id).name}
                          onChange={e => updatePromptForm(prompt.id, { name: e.target.value })}
                          placeholder={language === 'zh' ? '名称' : 'Name'}
                          className="flex-1 px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                        />
                        <select
                          value={getPromptForm(prompt.id).scope}
                          onChange={e => updatePromptForm(prompt.id, { scope: e.target.value })}
                          className="px-2 py-1.5 text-xs border border-border rounded bg-surface"
                        >
                          {SCOPE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        value={getPromptForm(prompt.id).prompt}
                        onChange={e => updatePromptForm(prompt.id, { prompt: e.target.value })}
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none font-mono"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={resetPromptForm} className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading">
                          {language === 'zh' ? '取消' : 'Cancel'}
                        </button>
                        <button
                          onClick={() => handleUpdatePrompt(prompt.id)}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50"
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
                            onClick={() => startEditPrompt(prompt)}
                            className="p-1.5 text-text-muted hover:text-accent transition-colors"
                            title={language === 'zh' ? '编辑' : 'Edit'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePrompt(prompt.id)}
                            className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
                            title={language === 'zh' ? '删除' : 'Delete'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-text-muted font-mono leading-relaxed whitespace-pre-wrap bg-surface rounded p-2 border border-border mb-3">
                        {prompt.prompt}
                      </p>
                      <p className="text-xs text-text-muted/60 mb-2">
                        {language === 'zh' ? '创建于' : 'Created'} {new Date(prompt.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
                      </p>

                      {/* Test prompt section */}
                      <div className="border-t border-border/50 pt-3 mt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Play className="w-3.5 h-3.5 text-accent" />
                          <span className="text-xs font-bold text-text-muted">
                            {language === 'zh' ? '测试提示词' : 'Test Prompt'}
                          </span>
                        </div>
                        <textarea
                          value={testingPromptId === prompt.id ? testInput : ''}
                          onChange={e => { setTestInput(e.target.value); setTestingPromptId(prompt.id); }}
                          placeholder={language === 'zh' ? '输入测试内容...' : 'Enter test content...'}
                          rows={2}
                          className="w-full px-2 py-1.5 text-xs border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none mb-2"
                        />
                        <button
                          onClick={() => handleTestPrompt(prompt)}
                          disabled={isTesting || !testInput.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 transition-colors disabled:opacity-50"
                        >
                          {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          {language === 'zh' ? '运行测试' : 'Run Test'}
                        </button>

                        {/* Test output */}
                        {testingPromptId === prompt.id && (testOutput || testError) && (
                          <div className="mt-3 p-3 bg-surface rounded border border-border">
                            {testError && (
                              <p className="text-xs text-red-500">{testError}</p>
                            )}
                            {testOutput && (
                              <div>
                                <p className="text-xs font-bold text-text-muted mb-1">{language === 'zh' ? '结果' : 'Result'}:</p>
                                <pre className="text-xs font-mono whitespace-pre-wrap bg-background p-2 rounded border border-border max-h-[200px] overflow-y-auto">
                                  {testOutput}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
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
    </div>
  );
}