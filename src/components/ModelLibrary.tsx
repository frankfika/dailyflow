/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Pencil, Trash2, Check, Loader2, Sparkles, Play, CheckCircle2, Copy,
  Eye, EyeOff, ExternalLink, Info, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  loadProviderConfigs,
  saveProviderConfigs,
  PROVIDER_TEMPLATES,
  type ProviderConfig,
  type ProviderType,
  type ProviderTemplate,
} from '../types/models';
import { aiApi } from '../api/client';

interface ModelLibraryProps {
  language: 'en' | 'zh';
  onProviderActivate?: (config: ProviderConfig) => void;
}

// Brand colors / first-letter avatar for each template name
const PROVIDER_BRAND: Record<string, { bg: string; fg: string; emoji?: string }> = {
  'DeepSeek':                  { bg: 'bg-blue-100',    fg: 'text-blue-700',    emoji: '🐋' },
  'Kimi (Moonshot)':           { bg: 'bg-violet-100',  fg: 'text-violet-700',  emoji: '🌙' },
  'Kimi (Anthropic 格式)':     { bg: 'bg-violet-100',  fg: 'text-violet-700',  emoji: '🌙' },
  'MiniMax':                   { bg: 'bg-rose-100',    fg: 'text-rose-700',    emoji: '🅼' },
  'MiniMax (Anthropic 格式)':  { bg: 'bg-rose-100',    fg: 'text-rose-700',    emoji: '🅼' },
  '智谱 GLM':                  { bg: 'bg-cyan-100',    fg: 'text-cyan-700',    emoji: '🧠' },
  '智谱 GLM (Anthropic 格式)': { bg: 'bg-cyan-100',    fg: 'text-cyan-700',    emoji: '🧠' },
  '豆包 (火山方舟)':           { bg: 'bg-orange-100',  fg: 'text-orange-700',  emoji: '🫘' },
  '阿里云 Qwen':               { bg: 'bg-amber-100',   fg: 'text-amber-700',   emoji: '🐫' },
  '硅基流动 SiliconFlow':      { bg: 'bg-emerald-100', fg: 'text-emerald-700', emoji: '⚡' },
  'Anthropic Claude':          { bg: 'bg-orange-100',  fg: 'text-orange-700',  emoji: '🅰' },
  'OpenAI':                    { bg: 'bg-green-100',   fg: 'text-green-700',   emoji: '🌀' },
  'Google Gemini':             { bg: 'bg-sky-100',     fg: 'text-sky-700',     emoji: '✨' },
  'Groq':                      { bg: 'bg-red-100',     fg: 'text-red-700',     emoji: '🚀' },
  'OpenRouter':                { bg: 'bg-purple-100',  fg: 'text-purple-700',  emoji: '🛣' },
  'Custom':                    { bg: 'bg-stone-100',   fg: 'text-stone-700',   emoji: '⚙️' },
};

function ProviderAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const brand = PROVIDER_BRAND[name] || { bg: 'bg-stone-100', fg: 'text-stone-700', emoji: name.charAt(0).toUpperCase() };
  const dim = size === 'sm' ? 'w-7 h-7 text-sm' : 'w-9 h-9 text-base';
  return (
    <div className={`${dim} ${brand.bg} ${brand.fg} rounded-lg flex items-center justify-center font-bold flex-shrink-0`}>
      {brand.emoji || name.charAt(0).toUpperCase()}
    </div>
  );
}

export function ModelLibrary({ language, onProviderActivate }: ModelLibraryProps) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [filterRegion, setFilterRegion] = useState<'all' | 'cn' | 'global' | 'aggregator'>('all');

  const [form, setForm] = useState<Partial<ProviderConfig>>({ type: 'openai-compatible' });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; status: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const store = loadProviderConfigs();
    setConfigs(store.configs);
    setActiveId(store.activeId);
  }, []);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (drawerOpen) {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [drawerOpen]);

  const persist = (newConfigs: ProviderConfig[], newActiveId: string | null) => {
    saveProviderConfigs({ configs: newConfigs, activeId: newActiveId });
    setConfigs(newConfigs);
    setActiveId(newActiveId);
  };

  const openAddDrawer = () => {
    setForm({ type: 'openai-compatible', name: '', apiKey: '', baseUrl: '', model: '' });
    setSelectedTemplate('');
    setShowAllTemplates(false);
    setEditingId(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (config: ProviderConfig) => {
    setForm(config);
    setSelectedTemplate('');
    setEditingId(config.id);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setForm({ type: 'openai-compatible' });
    setSelectedTemplate('');
  };

  const applyTemplate = (template: ProviderTemplate) => {
    setSelectedTemplate(template.name);
    setForm(prev => ({
      ...prev,
      name: template.name === 'Custom' ? prev.name || '' : template.name,
      type: template.type,
      baseUrl: template.baseUrl,
      model: template.model,
    }));
  };

  const handleSave = () => {
    if (!form.name?.trim() || !form.apiKey?.trim() || !form.baseUrl?.trim() || !form.model?.trim()) return;
    const now = new Date().toISOString();

    if (editingId) {
      const updated = configs.map(c =>
        c.id === editingId ? { ...c, ...form, id: editingId, updatedAt: now } as ProviderConfig : c
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
      const newActiveId = configs.length === 0 ? newConfig.id : activeId;
      persist(updated, newActiveId);
      if (newActiveId === newConfig.id) onProviderActivate?.(newConfig);
    }

    closeDrawer();
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

  const handleCopy = (text: string) => navigator.clipboard.writeText(text);

  const maskKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '****';
    return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
  };

  const popularTemplates = useMemo(() => PROVIDER_TEMPLATES.filter(t => t.popular), []);
  const moreTemplates = useMemo(
    () => PROVIDER_TEMPLATES.filter(t => !t.popular && (filterRegion === 'all' || t.region === filterRegion)),
    [filterRegion]
  );

  const activeTemplate = useMemo(
    () => PROVIDER_TEMPLATES.find(t => t.name === selectedTemplate),
    [selectedTemplate]
  );

  // Sort configs: active first, then by createdAt
  const sortedConfigs = useMemo(() => {
    return [...configs].sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return 0;
    });
  }, [configs, activeId]);

  const formIsValid = !!(form.name?.trim() && form.apiKey?.trim() && form.baseUrl?.trim() && form.model?.trim());

  return (
    <div className="h-full flex flex-col bg-surface relative">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-sans font-semibold text-text-heading">
              {language === 'zh' ? '模型供应商' : 'Model Providers'}
            </h2>
          </div>
          <p className="text-sm text-text-muted">
            {configs.length > 0
              ? (language === 'zh'
                  ? `已配置 ${configs.length} 个 · 当前使用 ${configs.find(c => c.id === activeId)?.name || '—'}`
                  : `${configs.length} configured · using ${configs.find(c => c.id === activeId)?.name || '—'}`)
              : (language === 'zh' ? '管理多个 AI 供应商配置，一键切换' : 'Manage multiple AI provider configs, switch with one click')}
          </p>
        </div>
        <button
          onClick={openAddDrawer}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          {language === 'zh' ? '添加供应商' : 'Add Provider'}
        </button>
      </div>

      {/* List (scrollable) */}
      <div className="flex-1 overflow-y-auto p-6">
        {configs.length === 0 ? (
          <div className="py-20 text-center text-text-muted">
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <h3 className="text-base font-semibold mb-2">
              {language === 'zh' ? '还没有任何模型供应商' : 'No provider configured yet'}
            </h3>
            <p className="text-sm opacity-70 mb-4">
              {language === 'zh' ? '点击右上方「添加供应商」开始' : 'Click "Add Provider" above to start'}
            </p>
            <button
              onClick={openAddDrawer}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {language === 'zh' ? '添加供应商' : 'Add Provider'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedConfigs.map(config => (
              <motion.div
                key={config.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative bg-surface-white border rounded-lg p-4 transition-all ${
                  activeId === config.id
                    ? 'border-accent/40 shadow-sm'
                    : 'border-border hover:border-accent/30'
                }`}
              >
                {/* Active left bar */}
                {activeId === config.id && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-accent rounded-r"></div>
                )}

                <div className="flex items-start gap-3">
                  <ProviderAvatar name={config.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm text-text-heading">{config.name}</h3>
                      {activeId === config.id && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-accent text-white rounded">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          {language === 'zh' ? '使用中' : 'Active'}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-surface text-text-muted rounded border border-border">
                        {config.type === 'anthropic' ? 'Anthropic' : 'OpenAI Compatible'}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted/80 font-mono truncate">
                      {config.model} · {config.baseUrl}
                    </div>
                    {config.notes && (
                      <p className="text-xs text-text-muted mt-1.5">{config.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditDrawer(config)}
                      className="p-1.5 text-text-muted hover:text-accent hover:bg-surface rounded transition-colors"
                      title={language === 'zh' ? '编辑' : 'Edit'}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="p-1.5 text-text-muted hover:text-red-500 hover:bg-surface rounded transition-colors"
                      title={language === 'zh' ? '删除' : 'Delete'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Details (collapsible — show API key etc) */}
                <details className="mt-3 group">
                  <summary className="text-[11px] text-text-muted cursor-pointer hover:text-accent select-none list-none flex items-center gap-1">
                    <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                    {language === 'zh' ? '查看详情' : 'Show details'}
                  </summary>
                  <div className="space-y-1.5 mt-2 text-xs pl-4">
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-16 flex-shrink-0">Model:</span>
                      <span className="font-mono text-text-heading flex-1 truncate">{config.model}</span>
                      <button onClick={() => handleCopy(config.model)} className="p-1 text-text-muted hover:text-accent">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-16 flex-shrink-0">URL:</span>
                      <span className="font-mono text-text-heading flex-1 truncate">{config.baseUrl}</span>
                      <button onClick={() => handleCopy(config.baseUrl)} className="p-1 text-text-muted hover:text-accent">
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
                        className="p-1 text-text-muted hover:text-accent"
                      >
                        {showKey[config.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </details>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
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

                {testResult?.id === config.id && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-3 p-2.5 rounded text-xs ${
                      testResult.status === 'success'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-amber-50 border border-amber-200 text-amber-800'
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

      {/* —— Right drawer: add / edit form —— */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
              className="absolute inset-0 bg-black/30 z-40"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-background border-l border-border shadow-2xl z-50 flex flex-col"
            >
              {/* Drawer header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  {selectedTemplate && <ProviderAvatar name={selectedTemplate} size="sm" />}
                  <div>
                    <h3 className="text-sm font-bold text-text-heading">
                      {editingId
                        ? (language === 'zh' ? '编辑供应商' : 'Edit Provider')
                        : (language === 'zh' ? '添加供应商' : 'Add Provider')}
                    </h3>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {editingId
                        ? (language === 'zh' ? '修改后立即生效' : 'Changes apply immediately')
                        : (language === 'zh' ? '从模板开始或自定义配置' : 'Pick a template or configure manually')}
                    </p>
                  </div>
                </div>
                <button onClick={closeDrawer} className="p-1.5 text-text-muted hover:text-red-500 transition-colors rounded hover:bg-surface">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer scrollable body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {!editingId && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-text-muted uppercase tracking-wider">
                        {language === 'zh' ? '热门推荐' : 'Popular'}
                      </label>
                      <button
                        onClick={() => setShowAllTemplates(s => !s)}
                        className="flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"
                      >
                        {showAllTemplates
                          ? (language === 'zh' ? '收起' : 'Show less')
                          : (language === 'zh' ? `查看全部 (${PROVIDER_TEMPLATES.length - popularTemplates.length}+)` : `Show all (${PROVIDER_TEMPLATES.length - popularTemplates.length}+)`)}
                        {showAllTemplates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Popular row */}
                    <div className="grid grid-cols-1 gap-1.5">
                      {popularTemplates.map(t => {
                        const isSelected = selectedTemplate === t.name;
                        return (
                          <button
                            key={t.name}
                            onClick={() => applyTemplate(t)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-accent/10 border-accent/40'
                                : 'bg-surface border-border hover:border-accent/30 hover:bg-surface-white'
                            }`}
                          >
                            <ProviderAvatar name={t.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-bold ${isSelected ? 'text-accent' : 'text-text-heading'}`}>
                                {t.name}
                              </div>
                              <div className="text-[10px] text-text-muted truncate font-mono">
                                {t.model || (language === 'zh' ? '自由填写' : 'Fill in freely')}
                              </div>
                            </div>
                            {t.type === 'anthropic' && (
                              <span className="px-1 py-0 text-[9px] font-bold rounded bg-orange-50 text-orange-600 border border-orange-200">
                                Anthropic
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* All templates (expandable) */}
                    <AnimatePresence initial={false}>
                      {showAllTemplates && (
                        <motion.div
                          key="more"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-3 space-y-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(['all', 'cn', 'global', 'aggregator'] as const).map(r => (
                                <button
                                  key={r}
                                  onClick={() => setFilterRegion(r)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                    filterRegion === r
                                      ? 'bg-accent text-white border-accent'
                                      : 'bg-surface text-text-muted border-border hover:border-accent/30'
                                  }`}
                                >
                                  {r === 'all' ? (language === 'zh' ? '全部' : 'All') :
                                   r === 'cn' ? (language === 'zh' ? '国内' : 'China') :
                                   r === 'global' ? (language === 'zh' ? '海外' : 'Global') :
                                   (language === 'zh' ? '聚合站' : 'Aggregator')}
                                </button>
                              ))}
                            </div>
                            <div className="grid grid-cols-1 gap-1.5">
                              {moreTemplates.map(t => {
                                const isSelected = selectedTemplate === t.name;
                                return (
                                  <button
                                    key={t.name}
                                    onClick={() => applyTemplate(t)}
                                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${
                                      isSelected
                                        ? 'bg-accent/10 border-accent/40'
                                        : 'bg-surface border-border hover:border-accent/30 hover:bg-surface-white'
                                    }`}
                                  >
                                    <ProviderAvatar name={t.name} size="sm" />
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-[12px] font-bold ${isSelected ? 'text-accent' : 'text-text-heading'}`}>
                                        {t.name}
                                      </div>
                                      <div className="text-[10px] text-text-muted truncate font-mono">{t.model || '—'}</div>
                                    </div>
                                    {t.type === 'anthropic' && (
                                      <span className="px-1 py-0 text-[9px] font-bold rounded bg-orange-50 text-orange-600 border border-orange-200">
                                        Anthropic
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Template hint */}
                    {activeTemplate?.hint && (
                      <div className="flex items-start gap-1.5 px-2.5 py-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{activeTemplate.hint}</span>
                      </div>
                    )}
                    {activeTemplate?.apiKeyUrl && (
                      <a
                        href={activeTemplate.apiKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {language === 'zh' ? `获取 ${activeTemplate.name} API Key` : `Get ${activeTemplate.name} API key`}
                      </a>
                    )}
                  </div>
                )}

                {/* Form fields */}
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                        {language === 'zh' ? '名称' : 'Name'} *
                      </label>
                      <input
                        type="text"
                        value={form.name || ''}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder={language === 'zh' ? '配置名称' : 'Config name'}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                        {language === 'zh' ? 'API 类型' : 'API Type'} *
                      </label>
                      <select
                        value={form.type || 'openai-compatible'}
                        onChange={e => setForm({ ...form, type: e.target.value as ProviderType })}
                        className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:border-accent"
                      >
                        <option value="openai-compatible">OpenAI Compatible</option>
                        <option value="anthropic">Anthropic</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                      Base URL *
                    </label>
                    <input
                      type="text"
                      value={form.baseUrl || ''}
                      onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:border-accent font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                      Model ID *
                    </label>
                    <input
                      type="text"
                      value={form.model || ''}
                      onChange={e => setForm({ ...form, model: e.target.value })}
                      placeholder={language === 'zh' ? '例如：gpt-4o, claude-sonnet-4-20250514' : 'e.g. gpt-4o'}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:border-accent font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                      API Key *
                    </label>
                    <input
                      type="password"
                      value={form.apiKey || ''}
                      onChange={e => setForm({ ...form, apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:border-accent font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                      {language === 'zh' ? '备注（可选）' : 'Notes (optional)'}
                    </label>
                    <textarea
                      value={form.notes || ''}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      placeholder={language === 'zh' ? '描述这个配置的用途...' : 'Describe this config...'}
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:border-accent resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Sticky bottom action bar */}
              <div className="px-5 py-3 border-t border-border bg-surface-white flex items-center justify-between flex-shrink-0">
                <button
                  onClick={closeDrawer}
                  className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formIsValid}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-3 h-3" />
                  {editingId ? (language === 'zh' ? '保存' : 'Save') : (language === 'zh' ? '添加并使用' : 'Add & Use')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
