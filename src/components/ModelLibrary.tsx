/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Pencil, Trash2, X, Check, Loader2, Sparkles, Play, CheckCircle2, Copy, Eye, EyeOff } from 'lucide-react';
import {
  loadProviderConfigs,
  saveProviderConfigs,
  PROVIDER_TEMPLATES,
  type ProviderConfig,
  type ProviderType,
} from '../types/models';
import { aiApi } from '../api/client';

interface ModelLibraryProps {
  language: 'en' | 'zh';
  onProviderActivate?: (config: ProviderConfig) => void;
}

export function ModelLibrary({ language, onProviderActivate }: ModelLibraryProps) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  // Form state
  const [form, setForm] = useState<Partial<ProviderConfig>>({
    type: 'openai-compatible',
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('Custom');

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; status: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const store = loadProviderConfigs();
    setConfigs(store.configs);
    setActiveId(store.activeId);
  }, []);

  const persist = (newConfigs: ProviderConfig[], newActiveId: string | null) => {
    saveProviderConfigs({ configs: newConfigs, activeId: newActiveId });
    setConfigs(newConfigs);
    setActiveId(newActiveId);
  };

  const startAdd = () => {
    setForm({
      type: 'openai-compatible',
      name: '',
      apiKey: '',
      baseUrl: '',
      model: '',
    });
    setSelectedTemplate('Custom');
    setIsAdding(true);
    setEditingId(null);
  };

  const applyTemplate = (templateName: string) => {
    setSelectedTemplate(templateName);
    const template = PROVIDER_TEMPLATES.find(t => t.name === templateName);
    if (template) {
      setForm(prev => ({
        ...prev,
        name: template.name === 'Custom' ? prev.name || '' : template.name,
        type: template.type,
        baseUrl: template.baseUrl,
        model: template.model,
      }));
    }
  };

  const handleSave = () => {
    if (!form.name?.trim() || !form.apiKey?.trim() || !form.baseUrl?.trim() || !form.model?.trim()) {
      return;
    }

    const now = new Date().toISOString();

    if (editingId) {
      const updated = configs.map(c =>
        c.id === editingId
          ? { ...c, ...form, id: editingId, updatedAt: now } as ProviderConfig
          : c
      );
      persist(updated, activeId);
    } else {
      const newConfig: ProviderConfig = {
        id: `provider_${Date.now()}`,
        name: form.name.trim(),
        type: form.type as ProviderType,
        apiKey: form.apiKey.trim(),
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        notes: form.notes?.trim(),
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...configs, newConfig];
      // Auto-activate first config
      const newActiveId = configs.length === 0 ? newConfig.id : activeId;
      persist(updated, newActiveId);
      if (newActiveId === newConfig.id) {
        onProviderActivate?.(newConfig);
      }
    }

    setIsAdding(false);
    setEditingId(null);
    setForm({ type: 'openai-compatible' });
  };

  const handleEdit = (config: ProviderConfig) => {
    setForm(config);
    setSelectedTemplate('Custom');
    setEditingId(config.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm(language === 'zh' ? '确定删除此供应商配置？' : 'Delete this provider config?')) return;
    const updated = configs.filter(c => c.id !== id);
    let newActiveId = activeId;
    if (activeId === id) {
      newActiveId = updated[0]?.id || null;
      if (newActiveId) {
        const next = updated.find(c => c.id === newActiveId);
        if (next) onProviderActivate?.(next);
      }
    }
    persist(updated, newActiveId);
  };

  const handleActivate = (config: ProviderConfig) => {
    persist(configs, config.id);
    onProviderActivate?.(config);
  };

  const handleTest = async (config: ProviderConfig) => {
    setTestingId(config.id);
    setTestResult(null);

    try {
      const { summary } = await aiApi.summarize({
        provider: config.type === 'anthropic' ? 'anthropic' : 'custom',
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        systemPrompt: 'Reply with OK.',
        userPrompt: 'hi',
        format: config.type === 'anthropic' ? 'anthropic' : 'openai',
      });

      setTestResult({
        id: config.id,
        status: 'success',
        message: language === 'zh' ? `连接成功: ${summary.slice(0, 50)}` : `Connected: ${summary.slice(0, 50)}`,
      });
    } catch (err: any) {
      setTestResult({
        id: config.id,
        status: 'error',
        message: err.message || String(err),
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const maskKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '****';
    return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-sans font-semibold text-text-heading">
              {language === 'zh' ? '模型供应商' : 'Model Providers'}
            </h2>
          </div>
          <p className="text-sm text-text-muted">
            {language === 'zh' ? '管理多个 AI 供应商配置，一键切换' : 'Manage multiple AI provider configs, switch with one click'}
          </p>
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {language === 'zh' ? '添加供应商' : 'Add Provider'}
        </button>
      </div>

      {/* Add/Edit form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-border overflow-hidden"
          >
            <div className="p-6 bg-surface-white space-y-3">
              <h3 className="text-sm font-semibold text-text-heading mb-3">
                {editingId
                  ? (language === 'zh' ? '编辑供应商' : 'Edit Provider')
                  : (language === 'zh' ? '添加供应商' : 'Add Provider')}
              </h3>

              {/* Template quick select */}
              {!editingId && (
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    {language === 'zh' ? '快速模板' : 'Quick Template'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PROVIDER_TEMPLATES.map(t => (
                      <button
                        key={t.name}
                        onClick={() => applyTemplate(t.name)}
                        className={`px-2.5 py-1 rounded text-xs font-bold border transition-all ${
                          selectedTemplate === t.name
                            ? 'bg-accent/10 text-accent border-accent/30'
                            : 'bg-surface text-text-muted border-border hover:border-accent/30'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    {language === 'zh' ? '名称' : 'Name'} *
                  </label>
                  <input
                    type="text"
                    value={form.name || ''}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder={language === 'zh' ? '配置名称' : 'Config name'}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">
                    {language === 'zh' ? 'API 类型' : 'API Type'} *
                  </label>
                  <select
                    value={form.type || 'openai-compatible'}
                    onChange={e => setForm({ ...form, type: e.target.value as ProviderType })}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                  >
                    <option value="openai-compatible">OpenAI Compatible</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted mb-1.5">
                  Base URL *
                </label>
                <input
                  type="text"
                  value={form.baseUrl || ''}
                  onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted mb-1.5">
                  Model ID *
                </label>
                <input
                  type="text"
                  value={form.model || ''}
                  onChange={e => setForm({ ...form, model: e.target.value })}
                  placeholder={language === 'zh' ? '例如：gpt-4o, claude-sonnet-4-20250514' : 'e.g. gpt-4o, claude-sonnet-4-20250514'}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted mb-1.5">
                  API Key *
                </label>
                <input
                  type="password"
                  value={form.apiKey || ''}
                  onChange={e => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted mb-1.5">
                  {language === 'zh' ? '备注（可选）' : 'Notes (optional)'}
                </label>
                <textarea
                  value={form.notes || ''}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder={language === 'zh' ? '描述这个配置的用途...' : 'Describe this config...'}
                  rows={2}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => { setIsAdding(false); setEditingId(null); setForm({ type: 'openai-compatible' }); }}
                  className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name?.trim() || !form.apiKey?.trim() || !form.baseUrl?.trim() || !form.model?.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                  {editingId ? (language === 'zh' ? '保存' : 'Save') : (language === 'zh' ? '添加' : 'Add')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider list */}
      <div className="flex-1 overflow-y-auto p-6">
        {configs.length === 0 ? (
          <div className="py-20 text-center text-text-muted">
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <h3 className="text-base font-semibold mb-2">
              {language === 'zh' ? '暂无供应商配置' : 'No provider configs yet'}
            </h3>
            <p className="text-sm opacity-70 mb-4">
              {language === 'zh' ? '点击「添加供应商」开始配置 AI 模型' : 'Click "Add Provider" to configure your AI model'}
            </p>
            <button
              onClick={startAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {language === 'zh' ? '添加供应商' : 'Add Provider'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map(config => (
              <motion.div
                key={config.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-surface-white border rounded-lg p-4 transition-all ${
                  activeId === config.id
                    ? 'border-accent/50 shadow-sm'
                    : 'border-border hover:border-accent/30'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm text-text-heading">{config.name}</h3>
                      {activeId === config.id && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-accent/10 text-accent rounded">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          {language === 'zh' ? '使用中' : 'Active'}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-surface text-text-muted rounded border border-border">
                        {config.type === 'anthropic' ? 'Anthropic' : 'OpenAI Compatible'}
                      </span>
                    </div>
                    {config.notes && (
                      <p className="text-xs text-text-muted mb-2">{config.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(config)}
                      className="p-1.5 text-text-muted hover:text-accent transition-colors"
                      title={language === 'zh' ? '编辑' : 'Edit'}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
                      title={language === 'zh' ? '删除' : 'Delete'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Config details */}
                <div className="space-y-1.5 mb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted w-16 flex-shrink-0">Model:</span>
                    <span className="font-mono text-text-heading flex-1 truncate">{config.model}</span>
                    <button
                      onClick={() => handleCopy(config.model)}
                      className="p-1 text-text-muted hover:text-accent transition-colors"
                      title={language === 'zh' ? '复制' : 'Copy'}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted w-16 flex-shrink-0">URL:</span>
                    <span className="font-mono text-text-heading flex-1 truncate">{config.baseUrl}</span>
                    <button
                      onClick={() => handleCopy(config.baseUrl)}
                      className="p-1 text-text-muted hover:text-accent transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted w-16 flex-shrink-0">API Key:</span>
                    <span className="font-mono text-text-heading flex-1 truncate">
                      {showKey[config.id] ? config.apiKey : maskKey(config.apiKey)}
                    </span>
                    <button
                      onClick={() => setShowKey(prev => ({ ...prev, [config.id]: !prev[config.id] }))}
                      className="p-1 text-text-muted hover:text-accent transition-colors"
                    >
                      {showKey[config.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {activeId !== config.id && (
                    <button
                      onClick={() => handleActivate(config)}
                      className="flex-1 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                    >
                      {language === 'zh' ? '切换到此配置' : 'Activate'}
                    </button>
                  )}
                  <button
                    onClick={() => handleTest(config)}
                    disabled={testingId === config.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded transition-colors disabled:opacity-50 ${
                      activeId === config.id ? 'flex-1 justify-center' : ''
                    } bg-surface border-border hover:border-accent/30 text-text-heading`}
                  >
                    {testingId === config.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    {language === 'zh' ? '测试连接' : 'Test'}
                  </button>
                </div>

                {/* Test result */}
                {testResult?.id === config.id && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-3 p-2.5 rounded text-xs ${
                      testResult.status === 'success'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}
                  >
                    {testResult.message}
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
