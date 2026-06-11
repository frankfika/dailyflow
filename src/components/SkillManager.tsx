/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Pencil, Trash2, Check, Loader2, Zap, Upload, Download, Tag, Info,
  Search, X, BarChart3, GitBranch, Users, Target, CalendarCheck, BookOpen,
  Bot, Code, FileText, MessageSquare, Sparkles, Wrench, Palette, Database,
  PenTool, Lightbulb, Layers, Puzzle, Command,
} from 'lucide-react';
import { promptsApi, type PromptTemplateData } from '../api/client';
import { TagInput } from './TagInput';
import { getUnimportedBuiltInSkills, markBuiltInSkillImported, BUILT_IN_SKILLS } from '../utils/builtInSkills';

const SCOPE_OPTIONS = [
  { value: 'chat', zh: '对话', en: 'Chat' },
  { value: 'format', zh: '格式', en: 'Format' },
  { value: 'note', zh: '笔记', en: 'Note' },
  { value: 'custom', zh: '自定义', en: 'Custom' },
];

const CATEGORIES = [
  { key: 'All', zh: '全部', en: 'All' },
  { key: 'Productivity', zh: '效率', en: 'Productivity' },
  { key: 'Developer Tools', zh: '开发工具', en: 'Developer Tools' },
  { key: 'Content Creation', zh: '内容创作', en: 'Content Creation' },
  { key: 'Data Analysis', zh: '数据分析', en: 'Data Analysis' },
  { key: 'UI Design', zh: 'UI 设计', en: 'UI Design' },
  { key: 'Custom', zh: '自定义', en: 'Custom' },
];

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Productivity: Zap,
  'Developer Tools': Code,
  'Content Creation': PenTool,
  'Data Analysis': BarChart3,
  'UI Design': Palette,
  Custom: Puzzle,
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart: BarChart3,
  GitBranch,
  Users,
  Target,
  CalendarCheck,
  BookOpen,
  Zap,
  Sparkles,
  FileText,
  Code,
  Palette,
  Database,
  Wrench,
  PenTool,
  MessageSquare,
  Bot,
  Puzzle,
  Lightbulb,
  Layers,
  Info,
  Tag,
  Command,
};

function getSkillCategory(skill: PromptTemplateData | typeof BUILT_IN_SKILLS[0]): string {
  if ('category' in skill && skill.category) return skill.category;
  const tags = skill.tags || [];
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  if (tagSet.has('developer-tools') || tagSet.has('dev') || tagSet.has('coding') || tagSet.has('knowledge-base')) return 'Developer Tools';
  if (tagSet.has('content-creation') || tagSet.has('writing') || tagSet.has('blog')) return 'Content Creation';
  if (tagSet.has('data-analysis') || tagSet.has('data') || tagSet.has('analytics')) return 'Data Analysis';
  if (tagSet.has('ui-design') || tagSet.has('design') || tagSet.has('frontend')) return 'UI Design';
  if (tagSet.has('productivity') || tagSet.has('weekly') || tagSet.has('okr') || tagSet.has('task') || tagSet.has('meeting') || tagSet.has('summary') || tagSet.has('daily')) return 'Productivity';
  return 'Custom';
}

function SkillIcon({ name, className = 'w-5 h-5' }: { name?: string; className?: string }) {
  if (name && ICON_MAP[name]) {
    const Icon = ICON_MAP[name];
    return <Icon className={className} />;
  }
  // Fallback: first letter avatar
  const letter = (name || 'S').charAt(0).toUpperCase();
  return (
    <span className={`inline-flex items-center justify-center rounded-md bg-accent/10 text-accent font-bold text-sm ${className}`}>
      {letter}
    </span>
  );
}

interface SkillManagerProps {
  language: 'en' | 'zh';
}

export function SkillManager({ language }: SkillManagerProps) {
  const [skills, setSkills] = useState<PromptTemplateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'marketplace' | 'installed'>('marketplace');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    systemPrompt: string;
    scope: string;
    icon: string;
    version: string;
    author: string;
    tags: string[];
    type: 'prompt' | 'agent';
    commands: string;
  }>({
    name: '',
    description: '',
    systemPrompt: '',
    scope: 'chat',
    icon: '',
    version: '',
    author: '',
    tags: [],
    type: 'prompt',
    commands: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [builtInSkills, setBuiltInSkills] = useState(BUILT_IN_SKILLS);

  useEffect(() => {
    load();
    setBuiltInSkills(getUnimportedBuiltInSkills());
  }, []);

  // Parse markdown with optional frontmatter supporting AgentSkill fields.
  const parseSkillMarkdown = (text: string, fallbackName: string): Omit<PromptTemplateData, 'id' | 'createdAt' | 'updatedAt'> | null => {
    const trimmed = text.replace(/^﻿/, '');
    let name = '';
    let description = '';
    let scope = 'chat';
    let icon = '';
    let version = '';
    let author = '';
    let tags: string[] | undefined;
    let body = trimmed;

    let getLine = (_key: string): string => '';
    const fmMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (fmMatch) {
      const fm = fmMatch[1];
      body = fmMatch[2] || '';

      getLine = (key: string) => {
        const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
      };

      name = getLine('name');
      description = getLine('description');
      const s = getLine('scope');
      if (s && SCOPE_OPTIONS.some(o => o.value === s)) scope = s;
      icon = getLine('icon');
      version = getLine('version');
      author = getLine('author');

      const tagsLine = getLine('tags');
      if (tagsLine) {
        try {
          tags = JSON.parse(tagsLine.replace(/'/g, '"')) as string[];
        } catch {
          tags = tagsLine.split(/,\s*/).map(t => t.trim()).filter(Boolean);
        }
      }
    }

    // Agent skill detection: frontmatter type=agent or no-frontmatter + markdown headings
    const skillType: 'prompt' | 'agent' =
      fmMatch && getLine('type') === 'agent' ? 'agent' : 'prompt';

    // Parse commands (e.g. commands: ["/weekly", "/wr"])
    let commands: string[] | undefined;
    if (fmMatch) {
      const cmdLine = getLine('commands');
      if (cmdLine) {
        try {
          commands = JSON.parse(cmdLine.replace(/'/g, '"')) as string[];
        } catch {
          commands = cmdLine.split(/,\s*/).map(t => t.trim()).filter(Boolean);
        }
      }
    }

    if (!name) {
      const heading = body.match(/^#{1,3}\s+(.+)$/m);
      if (heading) {
        name = heading[1].trim();
        if (!fmMatch) {
          // For agent skills without frontmatter, keep the heading in body as knowledge
        } else {
          body = body.replace(heading[0], '').trim();
        }
      }
    }
    if (!name) name = fallbackName.replace(/\.(md|markdown|txt)$/i, '').trim();
    body = body.trim();
    if (!body) return null;

    return {
      name,
      description,
      systemPrompt: body,
      scope,
      icon: icon || undefined,
      version: version || undefined,
      author: author || undefined,
      tags: tags && tags.length > 0 ? tags : undefined,
      type: skillType,
      commands: commands && commands.length > 0 ? commands : undefined,
    };
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

  const handleImportFromText = async () => {
    if (!pasteText.trim()) return;
    setImportError(null);
    setPasting(true);
    try {
      let text = pasteText.trim();
      // If it looks like a URL, try to fetch it
      if (text.match(/^https?:\/\/.+\.(md|markdown|txt)$/i) || text.match(/^https:\/\/raw\.githubusercontent\.com\//i)) {
        const res = await fetch(text);
        if (!res.ok) throw new Error('Failed to fetch URL');
        text = await res.text();
      }
      const parsed = parseSkillMarkdown(text, 'pasted-skill');
      if (!parsed) throw new Error('Invalid skill markdown');
      await promptsApi.create(parsed);
      await load();
      setPasteText('');
      setActiveTab('installed');
    } catch (err: any) {
      setImportError(err.message || (language === 'zh' ? '导入失败' : 'Import failed'));
      setTimeout(() => setImportError(null), 4000);
    } finally {
      setPasting(false);
    }
  };

  const handleImportBuiltIn = async (skill: typeof BUILT_IN_SKILLS[0]) => {
    try {
      const parsed = parseSkillMarkdown(skill.markdown, skill.name);
      if (!parsed) return;
      await promptsApi.create(parsed);
      markBuiltInSkillImported(skill.id);
      setBuiltInSkills(prev => prev.filter(s => s.id !== skill.id));
      await load();
      setActiveTab('installed');
    } catch (err) {
      console.error('Built-in skill import failed:', err);
    }
  };

  const handleExport = (skill: PromptTemplateData) => {
    const tagsStr = skill.tags && skill.tags.length > 0 ? `\ntags: [${skill.tags.map(t => `"${t}"`).join(', ')}]` : '';
    const typeStr = skill.type === 'agent' ? `\ntype: agent` : '';
    const commandsStr = skill.commands && skill.commands.length > 0 ? `\ncommands: [${skill.commands.map(c => `"${c}"`).join(', ')}]` : '';
    const md = `---\nname: ${skill.name}\ndescription: ${skill.description || ''}\nscope: ${skill.scope}${skill.icon ? `\nicon: ${skill.icon}` : ''}${skill.version ? `\nversion: ${skill.version}` : ''}${skill.author ? `\nauthor: ${skill.author}` : ''}${tagsStr}${typeStr}${commandsStr}\ncreated: ${skill.createdAt}${skill.updatedAt ? `\nupdatedAt: ${skill.updatedAt}` : ''}\n---\n\n${skill.systemPrompt || skill.prompt || ''}\n`;
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
    setForm({ name: '', description: '', systemPrompt: '', scope: 'chat', icon: '', version: '', author: '', tags: [], type: 'prompt', commands: '' });
    setIsAdding(true);
    setEditingId(null);
  };

  const startEdit = (skill: PromptTemplateData) => {
    setForm({
      name: skill.name,
      description: skill.description || '',
      systemPrompt: skill.systemPrompt || skill.prompt || '',
      scope: skill.scope,
      icon: skill.icon || '',
      version: skill.version || '',
      author: skill.author || '',
      tags: skill.tags || [],
      type: skill.type || 'prompt',
      commands: skill.commands ? skill.commands.join(', ') : '',
    });
    setEditingId(skill.id);
    setIsAdding(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) return;
    setSaving(true);
    try {
      const commandsArr = form.commands.split(/,\s*/).map(s => s.trim()).filter(Boolean);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        systemPrompt: form.systemPrompt.trim(),
        scope: form.scope,
        icon: form.icon.trim() || undefined,
        version: form.version.trim() || undefined,
        author: form.author.trim() || undefined,
        tags: form.tags.length > 0 ? form.tags : undefined,
        type: form.type,
        commands: commandsArr.length > 0 ? commandsArr : undefined,
      };
      if (editingId) {
        await promptsApi.update(editingId, payload);
      } else {
        await promptsApi.create(payload);
      }
      await load();
      setIsAdding(false);
      setEditingId(null);
      setForm({ name: '', description: '', systemPrompt: '', scope: 'chat', icon: '', version: '', author: '', tags: [], type: 'prompt', commands: '' });
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

  // Filter logic
  const installedIds = new Set(skills.map(s => s.name));

  const marketplaceSkills = builtInSkills.filter(b => !installedIds.has(b.name));

  const filterBySearch = (list: (PromptTemplateData | typeof BUILT_IN_SKILLS[0])[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
  };

  const filterByCategory = (list: (PromptTemplateData | typeof BUILT_IN_SKILLS[0])[]) => {
    if (selectedCategory === 'All') return list;
    return list.filter(s => getSkillCategory(s) === selectedCategory);
  };

  const displayedMarketplace = filterByCategory(filterBySearch(marketplaceSkills));
  const displayedInstalled = filterByCategory(filterBySearch(skills));

  const formValid = !!(form.name.trim() && form.systemPrompt.trim());

  const renderSkillCard = (skill: PromptTemplateData | typeof BUILT_IN_SKILLS[0], isInstalled: boolean) => {
    const category = getSkillCategory(skill);
    const CatIcon = CATEGORY_ICONS[category] || Puzzle;
    const isBuiltIn = !isInstalled;

    return (
      <motion.div
        key={isInstalled ? (skill as PromptTemplateData).id : (skill as typeof BUILT_IN_SKILLS[0]).id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="group bg-surface-white border border-border rounded-xl p-4 hover:border-accent/30 hover:shadow-sm transition-all flex flex-col gap-3"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
            <SkillIcon name={(skill as any).icon || ''} className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-text-heading truncate">{skill.name}</h4>
            <p className="text-[11px] text-text-muted line-clamp-2 mt-0.5">{(skill as any).description || (language === 'zh' ? '暂无描述' : 'No description')}</p>
          </div>
          <div className="flex-shrink-0">
            {isBuiltIn ? (
              <button
                onClick={() => handleImportBuiltIn(skill as typeof BUILT_IN_SKILLS[0])}
                className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent/90 transition-colors"
                title={language === 'zh' ? '安装' : 'Install'}
              >
                <Plus className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleExport(skill as PromptTemplateData)}
                  className="p-1.5 text-text-muted hover:text-accent transition-colors"
                  title={language === 'zh' ? '导出' : 'Export'}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => startEdit(skill as PromptTemplateData)}
                  className="p-1.5 text-text-muted hover:text-accent transition-colors"
                  title={language === 'zh' ? '编辑' : 'Edit'}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete((skill as PromptTemplateData).id)}
                  className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
                  title={language === 'zh' ? '删除' : 'Delete'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-surface text-text-muted border border-border">
            <CatIcon className="w-2.5 h-2.5" />
            {language === 'zh'
              ? CATEGORIES.find(c => c.key === category)?.zh || category
              : CATEGORIES.find(c => c.key === category)?.en || category}
          </span>
          {(skill as any).type === 'agent' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
              Agent
            </span>
          )}
          {(skill as any).version && (
            <span className="text-[10px] text-text-muted font-mono">v{(skill as any).version}</span>
          )}
          {(skill as any).author && (
            <span className="text-[10px] text-text-muted">@{(skill as any).author}</span>
          )}
        </div>

        {/* Tags */}
        {(skill as any).tags && (skill as any).tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {(skill as any).tags.map((tag: string) => (
              <span key={tag} className="text-[10px] text-text-muted bg-surface border border-border rounded px-1.5 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="px-5 py-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border">
            <button
              onClick={() => setActiveTab('marketplace')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeTab === 'marketplace'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text-heading'
              }`}
            >
              {language === 'zh' ? '技能市场' : 'Skills Marketplace'}
            </button>
            <button
              onClick={() => setActiveTab('installed')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeTab === 'installed'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text-heading'
              }`}
            >
              {language === 'zh' ? '已安装' : 'Installed'}
              {skills.length > 0 && (
                <span className="ml-1.5 px-1 py-0.5 rounded-full bg-accent/20 text-[10px]">{skills.length}</span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={language === 'zh' ? '搜索技能...' : 'Search skills...'}
                className="pl-8 pr-3 py-1.5 text-xs border border-border rounded bg-surface focus:outline-none focus:border-accent w-40 sm:w-56"
              />
            </div>
            {/* Upload */}
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-surface text-text-heading border border-border rounded hover:border-accent/40 hover:text-accent transition-colors"
              title={language === 'zh' ? '上传 Skill' : 'Upload Skill'}
            >
              <Upload className="w-3 h-3" />
              {language === 'zh' ? '上传' : 'Upload'}
            </button>
            <button
              onClick={startAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
              title={language === 'zh' ? '新建 Skill' : 'New Skill'}
            >
              <Plus className="w-3 h-3" />
              {language === 'zh' ? '新建' : 'New'}
            </button>
          </div>
        </div>

        {/* Paste import row (compact) */}
        <div className="flex items-center gap-2">
          <input
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleImportFromText(); }}
            placeholder={language === 'zh' ? '粘贴 Markdown 或 GitHub Raw URL...' : 'Paste markdown or GitHub raw URL...'}
            className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-border rounded bg-surface focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleImportFromText}
            disabled={pasting || !pasteText.trim()}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-surface text-text-heading border border-border rounded hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-50"
          >
            {pasting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {language === 'zh' ? '导入' : 'Import'}
          </button>
          {importError && (
            <span className="text-[11px] text-red-500 shrink-0">{importError}</span>
          )}
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                selectedCategory === cat.key
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-text-muted border-border hover:border-accent/30'
              }`}
            >
              {language === 'zh' ? cat.zh : cat.en}
            </button>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex items-center justify-center p-4"
            onClick={() => { setIsAdding(false); setEditingId(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15 }}
              className="bg-surface-white border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h4 className="text-sm font-bold text-text-heading">
                  {editingId ? (language === 'zh' ? '编辑 Skill' : 'Edit Skill') : (language === 'zh' ? '新建 Skill' : 'New Skill')}
                </h4>
                <button
                  onClick={() => { setIsAdding(false); setEditingId(null); }}
                  className="p-1 text-text-muted hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3 overflow-y-auto">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-text-muted mb-1">
                      {language === 'zh' ? '名称' : 'Name'} *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder={language === 'zh' ? '例如：周报生成器' : 'e.g. Weekly Summary'}
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
                    {language === 'zh' ? '描述' : 'Description'}
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder={language === 'zh' ? '这个 Skill 在什么场景下触发？' : 'When should this skill be used?'}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted mb-1">Icon</label>
                    <input
                      type="text"
                      value={form.icon}
                      onChange={e => setForm({ ...form, icon: e.target.value })}
                      placeholder="Zap"
                      className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted mb-1">Version</label>
                    <input
                      type="text"
                      value={form.version}
                      onChange={e => setForm({ ...form, version: e.target.value })}
                      placeholder="1.0"
                      className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted mb-1">Author</label>
                    <input
                      type="text"
                      value={form.author}
                      onChange={e => setForm({ ...form, author: e.target.value })}
                      placeholder="your-name"
                      className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text-muted mb-1">Tags</label>
                  <TagInput
                    tags={form.tags}
                    onChange={tags => setForm({ ...form, tags })}
                    language={language}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted mb-1">
                      {language === 'zh' ? '类型' : 'Type'}
                    </label>
                    <select
                      value={form.type}
                      onChange={e => setForm({ ...form, type: e.target.value as 'prompt' | 'agent' })}
                      className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                    >
                      <option value="prompt">{language === 'zh' ? 'Prompt (角色/指令)' : 'Prompt (Role/Instruction)'}</option>
                      <option value="agent">{language === 'zh' ? 'Agent (知识库/上下文)' : 'Agent (Knowledge/Context)'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted mb-1">
                      {language === 'zh' ? '快捷命令 (用逗号分隔)' : 'Commands (comma separated)'}
                    </label>
                    <input
                      value={form.commands}
                      onChange={e => setForm({ ...form, commands: e.target.value })}
                      placeholder={language === 'zh' ? '/weekly, /wr' : '/weekly, /wr'}
                      className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text-muted mb-1">
                    {form.type === 'agent'
                      ? (language === 'zh' ? '知识库内容 (Knowledge Base)' : 'Knowledge Base')
                      : (language === 'zh' ? '系统提示词 (System Prompt)' : 'System Prompt')} *
                  </label>
                  <textarea
                    value={form.systemPrompt}
                    onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
                    placeholder={form.type === 'agent'
                      ? (language === 'zh'
                        ? '## Overview\n项目概述...\n\n## Common Commands\n常用命令...'
                        : '## Overview\nProject overview...\n\n## Common Commands\nCommands...')
                      : (language === 'zh' ? '请按以下要求处理...' : 'Process the content as follows...')}
                    rows={5}
                    className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none font-mono"
                  />
                </div>
              </div>
              <div className="px-5 py-3 border-t border-border flex items-center gap-2 justify-end">
                <button
                  onClick={() => { setIsAdding(false); setEditingId(null); }}
                  className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formValid}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  {editingId ? (language === 'zh' ? '保存' : 'Save') : (language === 'zh' ? '创建' : 'Create')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="py-12 text-center text-text-muted">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        ) : activeTab === 'marketplace' ? (
          displayedMarketplace.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {searchQuery || selectedCategory !== 'All'
                  ? (language === 'zh' ? '没有匹配的技能' : 'No matching skills')
                  : (language === 'zh' ? '所有内置技能已安装' : 'All built-in skills are installed')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayedMarketplace.map(skill => renderSkillCard(skill, false))}
            </div>
          )
        ) : (
          displayedInstalled.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm mb-3">{language === 'zh' ? '暂无已安装 Skill' : 'No installed skills yet'}</p>
              <button
                onClick={() => setActiveTab('marketplace')}
                className="px-4 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
              >
                {language === 'zh' ? '去技能市场看看' : 'Browse Marketplace'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayedInstalled.map(skill => renderSkillCard(skill, true))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
