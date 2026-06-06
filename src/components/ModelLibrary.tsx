/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Plus, Pencil, Trash2, Check, Loader2, Sparkles, Play, CheckCircle2,
  ExternalLink, Info, X,
} from 'lucide-react';
import {
  loadProviderConfigs,
  saveProviderConfigs,
  PROVIDER_TEMPLATES,
  type ProviderConfig,
  type ProviderTemplate,
} from '../types/models';
import { aiApi } from '../api/client';

interface ModelLibraryProps {
  language: 'en' | 'zh';
  onProviderActivate?: (config: ProviderConfig) => void;
}

const PROVIDER_BRAND: Record<string, { bg: string; fg: string; abbr: string }> = {
  'DeepSeek':                  { bg: 'bg-blue-50',     fg: 'text-blue-700',    abbr: 'DS' },
  'Kimi (Moonshot)':           { bg: 'bg-violet-50',   fg: 'text-violet-700',  abbr: 'KM' },
  'MiniMax':                   { bg: 'bg-rose-50',     fg: 'text-rose-700',    abbr: 'MM' },
  'MiniMax (海外)':            { bg: 'bg-rose-50',     fg: 'text-rose-700',    abbr: 'MM' },
  '智谱 GLM':                  { bg: 'bg-cyan-50',     fg: 'text-cyan-700',    abbr: '智谱' },
  '豆包 (火山方舟)':           { bg: 'bg-orange-50',   fg: 'text-orange-700',  abbr: '豆包' },
  '阿里云 Qwen':               { bg: 'bg-amber-50',    fg: 'text-amber-700',   abbr: 'Qw' },
  '硅基流动 SiliconFlow':      { bg: 'bg-emerald-50',  fg: 'text-emerald-700', abbr: 'SF' },
  'Anthropic Claude':          { bg: 'bg-orange-50',   fg: 'text-orange-700',  abbr: 'A' },
  'OpenAI':                    { bg: 'bg-stone-100',   fg: 'text-stone-700',   abbr: 'AI' },
  'Google Gemini':             { bg: 'bg-sky-50',      fg: 'text-sky-700',     abbr: 'GG' },
  'Groq':                      { bg: 'bg-red-50',      fg: 'text-red-700',     abbr: 'Gq' },
  'OpenRouter':                { bg: 'bg-purple-50',   fg: 'text-purple-700',  abbr: 'OR' },
  'Custom':                    { bg: 'bg-stone-50',    fg: 'text-stone-600',   abbr: '+' },
};

function ProviderAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const brand = PROVIDER_BRAND[name] || {
    bg: 'bg-stone-100',
    fg: 'text-stone-700',
    abbr: name.slice(0, 2).toUpperCase(),
  };
  const dim = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-[13px]';
  return (
    <div className={`${dim} ${brand.bg} ${brand.fg} rounded-md flex items-center justify-center font-bold flex-shrink-0 border border-current/10`}>
      {brand.abbr}
    </div>
  );
}

export function ModelLibrary({ language, onProviderActivate }: ModelLibraryProps) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ProviderConfig>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [filterRegion, setFilterRegion] = useState<'all' | 'cn' | 'global' | 'aggregator' | 'custom'>('all');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; status: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const store = loadProviderConfigs();
    setConfigs(store.configs);
    setActiveId(store.activeId);
  }, []);

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
    setForm({ name: '', apiKey: '', baseUrl: '', model: '' });
    setSelectedTemplate('');
    setFilterRegion('all');
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
    setForm({});
    setSelectedTemplate('');
  };

  const applyTemplate = (template: ProviderTemplate) => {
    setSelectedTemplate(template.name);
    setForm(prev => ({
      ...prev,
      name: template.name === 'Custom' ? prev.name || '' : template.name,
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
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        systemPrompt: 'Reply with OK.',
        userPrompt: 'hi',
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

  const filteredTemplates = useMemo(() => {
    if (filterRegion === 'all') return PROVIDER_TEMPLATES;
    return PROVIDER_TEMPLATES.filter(t => t.region === filterRegion);
  }, [filterRegion]);

  const activeTemplate = useMemo(
    () => PROVIDER_TEMPLATES.find(t => t.name === selectedTemplate),
    [selectedTemplate]
  );

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
      {!drawerOpen && (
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-text-muted">
            {configs.length > 0
              ? (language === 'zh'
                  ? `已配置 ${configs.length} 个 · 当前使用 ${configs.find(c => c.id === activeId)?.name || '—'}`
                  : `${configs.length} configured · using ${configs.find(c => c.id === activeId)?.name || '—'}`)
              : (language === 'zh' ? '连接模型供应商，一键切换' : 'Connect AI providers and switch instantly')}
          </p>
          <button
            onClick={openAddDrawer}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded-md hover:bg-accent/90 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            {language === 'zh' ? '添加' : 'Add'}
          </button>
        </div>
      )}

      {!drawerOpen && (
        <div className="flex-1 overflow-y-auto p-6">
          {configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <Sparkles className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-medium mb-1">
              {language === 'zh' ? '还没有配置模型供应商' : 'No provider configured yet'}
            </p>
            <p className="text-xs opacity-60 mb-4">
              {language === 'zh' ? '点击右上角「添加」开始' : 'Click "Add" above to start'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedConfigs.map(config => (
              <motion.div
                key={config.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative bg-surface-white border rounded-lg p-4 transition-all group ${
                  activeId === config.id
                    ? 'border-accent/40 shadow-sm'
                    : 'border-border hover:border-accent/30'
                }`}
              >
                {activeId === config.id && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-accent rounded-r"></div>
                )}

                <div className="flex items-start gap-3">
                  <ProviderAvatar name={config.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm text-text-heading">{config.name}</h3>
                      {activeId === config.id && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 rounded">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          {language === 'zh' ? '使用中' : 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-muted/80 font-mono truncate">
                      {config.model}
                    </div>
                    {config.notes && (
                      <p className="text-xs text-text-muted mt-1">{config.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[10px] text-text-muted font-mono truncate">{config.baseUrl}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {activeId !== config.id && (
                      <button
                        onClick={() => handleActivate(config)}
                        className="px-2.5 py-1 text-[11px] font-bold bg-accent text-white rounded-md hover:bg-accent/90 transition-colors"
                      >
                        {language === 'zh' ? '切换' : 'Activate'}
                      </button>
                    )}

                    <button
                      onClick={() => handleTest(config)}
                      disabled={testingId === config.id}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border rounded-md transition-colors disabled:opacity-50 bg-surface border-border hover:border-accent/30 text-text-heading"
                    >
                      {testingId === config.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      {language === 'zh' ? '测试' : 'Test'}
                    </button>
                  </div>
                </div>

                {testResult?.id === config.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className={`mt-2 px-3 py-1.5 rounded-md text-[11px] ${
                      testResult.status === 'success'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
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
      )}

      {drawerOpen && (
        <div className="flex-1 flex flex-col overflow-hidden bg-surface-white">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
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

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {!editingId && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider">
                    {language === 'zh' ? '选择供应商' : 'Choose Provider'}
                  </label>
                  <span className="text-[10px] text-text-muted">
                    {filteredTemplates.length} {language === 'zh' ? '个模板' : 'templates'}
                  </span>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {(['all', 'cn', 'global', 'aggregator', 'custom'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setFilterRegion(r)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                        filterRegion === r
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface text-text-muted border-border hover:border-accent/30 hover:text-text-heading'
                      }`}
                    >
                      {r === 'all' ? (language === 'zh' ? '全部' : 'All') :
                       r === 'cn' ? (language === 'zh' ? '国内' : 'China') :
                       r === 'global' ? (language === 'zh' ? '海外' : 'Global') :
                       r === 'aggregator' ? (language === 'zh' ? '聚合' : 'Aggregator') :
                       (language === 'zh' ? '自定义' : 'Custom')}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {filteredTemplates.map(t => {
                    const isSelected = selectedTemplate === t.name;
                    const isCustom = t.region === 'custom';
                    return (
                      <button
                        key={t.name}
                        onClick={() => applyTemplate(t)}
                        title={isCustom ? (language === 'zh' ? '手动填写' : 'Manual') : `${t.name} · ${t.model || ''}`}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                          isCustom ? 'border-dashed' : ''
                        } ${
                          isSelected
                            ? 'bg-accent/10 border-accent/40'
                            : 'bg-surface border-border hover:border-accent/30 hover:bg-surface-white'
                        }`}
                      >
                        <ProviderAvatar name={t.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[11px] font-bold truncate ${isSelected ? 'text-accent' : 'text-text-heading'}`}>
                            {isCustom ? (language === 'zh' ? '自定义' : 'Custom') : t.name}
                          </div>
                          {!isCustom && (
                            <div className="text-[9px] text-text-muted truncate font-mono">
                              {t.model || '—'}
                            </div>
                          )}
                        </div>
                        {isSelected && <Check className="w-3 h-3 text-accent flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>

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

            {!editingId && <div className="border-t border-border/60 my-2" />}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-heading mb-1.5">
                  {language === 'zh' ? '名称' : 'Name'}
                </label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder={language === 'zh' ? '配置名称' : 'Config name'}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                />
              </div>


              <div>
                <label className="block text-xs font-medium text-text-heading mb-1.5">
                  Base URL
                </label>
                <input
                  type="text"
                  value={form.baseUrl || ''}
                  onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-heading mb-1.5">Model ID</label>
                  <input
                    type="text"
                    value={form.model || ''}
                    onChange={e => setForm({ ...form, model: e.target.value })}
                    placeholder={language === 'zh' ? '例如 gpt-4o' : 'e.g. gpt-4o'}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-heading mb-1.5">API Key</label>
                  <input
                    type="password"
                    value={form.apiKey || ''}
                    onChange={e => setForm({ ...form, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-heading mb-1.5">
                  {language === 'zh' ? '备注（可选）' : 'Notes (optional)'}
                </label>
                <textarea
                  value={form.notes || ''}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder={language === 'zh' ? '描述这个配置的用途...' : 'Describe this config...'}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all resize-none"
                />
              </div>
            </div>
          </div>


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
        </div>
      )}
    </div>
  );
}

