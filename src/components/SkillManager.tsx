/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Pencil, Trash2, Check, Loader2, Zap, Upload, Download } from 'lucide-react';
import { promptsApi, type PromptTemplateData } from '../api/client';

const SCOPE_OPTIONS = [
  { value: 'format', zh: '格式', en: 'Format' },
  { value: 'date-range', zh: '日期范围', en: 'Date Range' },
  { value: 'project', zh: '项目', en: 'Project' },
  { value: 'person', zh: '人员', en: 'Person' },
  { value: 'custom', zh: '自定义', en: 'Custom' },
];

interface SkillManagerProps {
  language: 'en' | 'zh';
}

export function SkillManager({ language }: SkillManagerProps) {
  const [skills, setSkills] = useState<PromptTemplateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ name: string; prompt: string; scope: string }>({
    name: '',
    prompt: '',
    scope: 'format',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  // Parse markdown with optional frontmatter:
  //   ---
  //   name: My Skill
  //   scope: format
  //   ---
  //   <prompt body>
  // Falls back to: first H1/H2 as name, rest as prompt; or filename as name.
  const parseSkillMarkdown = (text: string, fallbackName: string): { name: string; prompt: string; scope: string } | null => {
    const trimmed = text.replace(/^﻿/, '');
    let name = '';
    let scope = 'format';
    let body = trimmed;

    const fmMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (fmMatch) {
      const fm = fmMatch[1];
      body = fmMatch[2] || '';
      const nameLine = fm.match(/^name:\s*(.+)$/m);
      const scopeLine = fm.match(/^scope:\s*(.+)$/m);
      if (nameLine) name = nameLine[1].trim().replace(/^["']|["']$/g, '');
      if (scopeLine) {
        const s = scopeLine[1].trim().replace(/^["']|["']$/g, '');
        if (SCOPE_OPTIONS.some(o => o.value === s)) scope = s;
      }
    }

    if (!name) {
      const heading = body.match(/^#{1,3}\s+(.+)$/m);
      if (heading) {
        name = heading[1].trim();
        body = body.replace(heading[0], '').trim();
      }
    }
    if (!name) name = fallbackName.replace(/\.(md|markdown|txt)$/i, '').trim();
    body = body.trim();
    if (!body) return null;
    return { name, prompt: body, scope };
  };

  const handleImportFiles = async (files: FileList) => {
    setImportError(null);
    const errors: string[] = [];
    let imported = 0;
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = parseSkillMarkdown(text, file.name);
        if (!parsed) { errors.push(file.name); continue; }
        await promptsApi.create(parsed);
        imported++;
      } catch (err) {
        console.error('Import failed for', file.name, err);
        errors.push(file.name);
      }
    }
    if (imported > 0) await load();
    if (errors.length) {
      setImportError(language === 'zh' ? `${errors.length} 个文件导入失败` : `${errors.length} file(s) failed to import`);
      setTimeout(() => setImportError(null), 4000);
    }
  };

  const handleExport = (skill: PromptTemplateData) => {
    const md = `---\nname: ${skill.name}\nscope: ${skill.scope}\n---\n\n${skill.prompt}\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${skill.name.replace(/[/\\?%*:|"<>]/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await promptsApi.getAll();
      setSkills(data);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startAdd = () => {
    setForm({ name: '', prompt: '', scope: 'format' });
    setIsAdding(true);
    setEditingId(null);
  };

  const startEdit = (skill: PromptTemplateData) => {
    setForm({ name: skill.name, prompt: skill.prompt, scope: skill.scope });
    setEditingId(skill.id);
    setIsAdding(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await promptsApi.update(editingId, {
          name: form.name.trim(),
          prompt: form.prompt.trim(),
          scope: form.scope,
        });
      } else {
        await promptsApi.create({
          name: form.name.trim(),
          prompt: form.prompt.trim(),
          scope: form.scope,
        });
      }
      await load();
      setIsAdding(false);
      setEditingId(null);
      setForm({ name: '', prompt: '', scope: 'format' });
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(language === 'zh' ? '删除此 Skill？' : 'Delete this skill?')) return;
    try {
      await promptsApi.delete(id);
      await load();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filtered = filterScope === 'all' ? skills : skills.filter(s => s.scope === filterScope);

  const getScopeLabel = (scope: string) => {
    const opt = SCOPE_OPTIONS.find(o => o.value === scope);
    return language === 'zh' ? (opt?.zh || scope) : (opt?.en || scope);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-muted truncate">
            {language === 'zh'
              ? '管理 AI Skill（提示词），在对话中应用以获得专业输出'
              : 'Manage AI skills (prompts) to get professional outputs in chats'}
          </p>
          {importError && (
            <p className="text-[11px] text-red-500 mt-0.5">{importError}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length) {
                handleImportFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-text-muted bg-surface border border-border rounded hover:border-accent/40 hover:text-accent transition-colors"
            title={language === 'zh' ? '导入 .md Skill 文件' : 'Import .md skill files'}
          >
            <Upload className="w-3.5 h-3.5" />
            {language === 'zh' ? '导入' : 'Import'}
          </button>
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {language === 'zh' ? '添加 Skill' : 'Add Skill'}
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap">
        {[{ value: 'all', label: language === 'zh' ? '全部' : 'All' }, ...SCOPE_OPTIONS.map(s => ({ value: s.value, label: language === 'zh' ? s.zh : s.en }))].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterScope(opt.value)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${
              filterScope === opt.value
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'bg-surface text-text-muted border-border hover:border-accent/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Add/Edit form */}
      <AnimatePresence initial={false}>
        {isAdding && (
          <motion.div
            key="skill-form"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="border-b border-border"
          >
            <div className="p-5 bg-surface-white space-y-3">
              <h4 className="text-sm font-semibold text-text-heading">
                {editingId ? (language === 'zh' ? '编辑 Skill' : 'Edit Skill') : (language === 'zh' ? '新建 Skill' : 'New Skill')}
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-text-muted mb-1">
                    {language === 'zh' ? '名称' : 'Name'} *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder={language === 'zh' ? '例如：周报总结' : 'e.g. Weekly Summary'}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-text-muted mb-1">
                    {language === 'zh' ? '范围' : 'Scope'}
                  </label>
                  <select
                    value={form.scope}
                    onChange={e => setForm({ ...form, scope: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                  >
                    {SCOPE_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>
                        {language === 'zh' ? s.zh : s.en}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-text-muted mb-1">
                  {language === 'zh' ? '提示词内容' : 'Prompt Content'} *
                </label>
                <textarea
                  value={form.prompt}
                  onChange={e => setForm({ ...form, prompt: e.target.value })}
                  placeholder={language === 'zh' ? '请按以下要求处理...' : 'Process the content as follows...'}
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none font-mono"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => { setIsAdding(false); setEditingId(null); }}
                  className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.prompt.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  {editingId ? (language === 'zh' ? '保存' : 'Save') : (language === 'zh' ? '创建' : 'Create')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2">
        {isLoading ? (
          <div className="py-8 text-center text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-text-muted">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm mb-3">
              {filterScope === 'all'
                ? (language === 'zh' ? '暂无 Skill' : 'No skills yet')
                : (language === 'zh' ? '暂无此类型 Skill' : 'No skills of this type')}
            </p>
            {filterScope === 'all' && (
              <div className="flex items-center justify-center gap-2 text-xs">
                <button
                  onClick={startAdd}
                  className="px-3 py-1 rounded bg-accent text-white font-bold hover:bg-accent/90 transition-colors"
                >
                  {language === 'zh' ? '+ 新建' : '+ Create'}
                </button>
                <span className="opacity-50">{language === 'zh' ? '或' : 'or'}</span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 rounded border border-border font-bold hover:border-accent/40 hover:text-accent transition-colors"
                >
                  {language === 'zh' ? '导入 .md' : 'Import .md'}
                </button>
              </div>
            )}
          </div>
        ) : (
          filtered.map(skill => (
            <motion.div
              key={skill.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface-white border border-border rounded p-3 hover:border-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-accent" />
                  <h4 className="text-sm font-bold text-text-heading">{skill.name}</h4>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-accent/10 text-accent rounded">
                    {getScopeLabel(skill.scope)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleExport(skill)}
                    className="p-1 text-text-muted hover:text-accent transition-colors"
                    title={language === 'zh' ? '导出为 .md' : 'Export as .md'}
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => startEdit(skill)}
                    className="p-1 text-text-muted hover:text-accent transition-colors"
                    title={language === 'zh' ? '编辑' : 'Edit'}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(skill.id)}
                    className="p-1 text-text-muted hover:text-red-500 transition-colors"
                    title={language === 'zh' ? '删除' : 'Delete'}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-text-muted font-mono leading-relaxed line-clamp-3">
                {skill.prompt}
              </p>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
