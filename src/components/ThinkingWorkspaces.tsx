import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrainCircuit, CalendarPlus, CheckCircle2, Compass, GitBranch, Lightbulb, Loader2, Map, Plus, Save, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { aiApi, tasksApi, thinkingWorkspacesApi, type ThinkingWorkspaceData } from '../api/client';
import { getTodayStr } from '../utils/tagColors';
import { generateTaskId, generateShortId } from '../utils/idGenerator';

type Language = 'en' | 'zh';

type Props = {
  language: Language;
  activeContext: 'work' | 'life';
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  currentFileDate: string;
  onTasksCreated?: () => void;
  onSelectedChange?: (id: string) => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
};

const blankDraft = {
  title: '',
  intent: '',
  scratchpad: '',
  type: 'general' as ThinkingWorkspaceData['type'],
  tagsText: '',
};

function localize(language: Language, zh: string, en: string): string {
  return language === 'zh' ? zh : en;
}

function statusLabel(status: ThinkingWorkspaceData['status'], language: Language): string {
  const labels = {
    active: ['进行中', 'Active'],
    paused: ['暂停', 'Paused'],
    completed: ['完成', 'Completed'],
    archived: ['归档', 'Archived'],
  } as const;
  return language === 'zh' ? labels[status][0] : labels[status][1];
}

function todayTimelineEntry(body: string) {
  return { id: generateShortId('tl'), date: getTodayStr(), type: 'log' as const, body };
}

export function buildWorkspaceContext(workspace: ThinkingWorkspaceData): string {
  return [
    `# ${workspace.title}`,
    `Status: ${workspace.status}`,
    workspace.intent ? `## Intent\n${workspace.intent}` : '',
    workspace.scratchpad ? `## Scratchpad\n${workspace.scratchpad}` : '',
    workspace.brief ? `## Brief\n${workspace.brief}` : '',
    workspace.journey ? `## Journey\n${workspace.journey}` : '',
    workspace.tasksMarkdown ? `## Existing Tasks\n${workspace.tasksMarkdown}` : '',
  ].filter(Boolean).join('\n\n');
}

export function extractTaskTitles(markdown: string): string[] {
  return markdown
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[-*]\s+\[[ xX]\]\s+/.test(line))
    .map(line => line.replace(/^[-*]\s+\[[ xX]\]\s+/, '').replace(/\s+\^[\w-]+$/, '').trim())
    .filter(Boolean);
}

export function ThinkingWorkspaces({ language, activeContext, aiApiKey, aiModel, aiBaseUrl, currentFileDate, onTasksCreated, onSelectedChange, showToast }: Props) {
  const [workspaces, setWorkspaces] = useState<ThinkingWorkspaceData[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [taskPreview, setTaskPreview] = useState<string[]>([]);

  const selected = useMemo(() => workspaces.find(w => w.id === selectedId) || workspaces[0] || null, [workspaces, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(w => [w.title, w.intent, w.scratchpad, w.brief, w.journey, ...(w.tags || [])].some(v => (v || '').toLowerCase().includes(q)));
  }, [workspaces, query]);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await thinkingWorkspacesApi.getAll();
      setWorkspaces(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
    } catch (e: any) {
      showToast(e.message || localize(language, '加载思考空间失败', 'Failed to load workspaces'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setTaskPreview([]);
    onSelectedChange?.(selectedId);
  }, [selectedId, onSelectedChange]);

  const createWorkspace = async () => {
    if (!draft.title.trim()) return;
    setIsCreating(true);
    try {
      const created = await thinkingWorkspacesApi.create({
        title: draft.title.trim(),
        intent: draft.intent.trim(),
        scratchpad: draft.scratchpad.trim(),
        type: draft.type,
        status: 'active',
        tags: draft.tagsText.split(',').map(t => t.trim()).filter(Boolean),
        timeline: [todayTimelineEntry(localize(language, '创建思考空间。', 'Workspace created.'))],
      });
      setWorkspaces(prev => [created, ...prev]);
      setSelectedId(created.id);
      setDraft(blankDraft);
      showToast(localize(language, '已创建思考空间', 'Workspace created'), 'success');
    } catch (e: any) {
      showToast(e.message || localize(language, '创建失败', 'Failed to create workspace'), 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const updateSelected = async (updates: Partial<ThinkingWorkspaceData>, toast = false) => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const updated = await thinkingWorkspacesApi.update(selected.id, updates);
      setWorkspaces(prev => prev.map(w => w.id === updated.id ? updated : w));
      if (toast) showToast(localize(language, '已保存', 'Saved'), 'success');
    } catch (e: any) {
      showToast(e.message || localize(language, '保存失败', 'Save failed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const runAi = async (kind: 'brief' | 'journey' | 'mindmap' | 'tasks') => {
    const target = workspaces.find(w => w.id === selectedId) || null;
    if (!target) return;
    if (!aiApiKey || !aiBaseUrl) {
      showToast(localize(language, '请先配置 AI Provider', 'Configure an AI provider first'), 'error');
      return;
    }
    setAiBusy(kind);
    try {
      const context = buildWorkspaceContext(target);
      const prompts = {
        brief: {
          system: 'You organize messy thinking into a concise structured brief. Return Markdown only. Sections: Goal, Context, Success Criteria, Constraints, Missing Information, Next Clarifying Question.',
          user: `Create a clear brief for this workspace. Keep it practical and concise.\n\n${context}`,
        },
        journey: {
          system: 'You turn a brief into an execution journey. Return Markdown only. Include Phases, Milestones, Risks, This Week, Today\'s Smallest Next Action.',
          user: `Plan a journey for this workspace. Make it actionable but do not over-schedule.\n\n${context}`,
        },
        mindmap: {
          system: 'Return ONLY a Mermaid mindmap code block body, starting with mindmap. No backticks. Use short Chinese or English labels matching user language.',
          user: `Generate a Mermaid mindmap for this workspace. Include goal, inputs, risks, resources, decisions, and next actions.\n\n${context}`,
        },
        tasks: {
          system: 'Generate 3-7 tiny next-action tasks as Markdown checkboxes. Each task should be doable in 15-60 minutes. Return ONLY checkbox lines, no explanation.',
          user: `Generate next actions from this workspace.\n\n${context}`,
        },
      }[kind];
      const { summary } = await aiApi.summarize({ apiKey: aiApiKey, model: aiModel || undefined, baseUrl: aiBaseUrl, systemPrompt: prompts.system, userPrompt: prompts.user });
      if (kind === 'brief') await updateSelected({ brief: summary, timeline: [...(target.timeline || []), todayTimelineEntry(localize(language, 'AI 整理了 Brief。', 'AI drafted the brief.'))] });
      if (kind === 'journey') await updateSelected({ journey: summary, timeline: [...(target.timeline || []), todayTimelineEntry(localize(language, 'AI 规划了推进路径。', 'AI drafted the journey.'))] });
      if (kind === 'mindmap') await updateSelected({ mindmapMarkdown: summary.replace(/^```mermaid\s*/i, '').replace(/```$/i, '').trim(), timeline: [...(target.timeline || []), todayTimelineEntry(localize(language, 'AI 生成了脑图。', 'AI generated a mind map.'))] });
      if (kind === 'tasks') setTaskPreview(extractTaskTitles(summary));
    } catch (e: any) {
      showToast(e.message || localize(language, 'AI 处理失败', 'AI failed'), 'error');
    } finally {
      setAiBusy(null);
    }
  };

  const createPreviewTasks = async () => {
    if (!selected || taskPreview.length === 0) return;
    try {
      for (let i = 0; i < taskPreview.length; i++) {
        await tasksApi.create(currentFileDate, {
          id: generateTaskId(),
          title: `${taskPreview[i]} #workspace:${selected.id}`,
          status: 'todo',
          tags: [activeContext],
          project: selected.projectId,
          source_date: currentFileDate,
        });
      }
      const newTaskLines = taskPreview.map(t => `- [ ] ${t}`).join('\n');
      await updateSelected({
        tasksMarkdown: [selected.tasksMarkdown, newTaskLines].filter(Boolean).join('\n'),
        timeline: [...(selected.timeline || []), todayTimelineEntry(localize(language, `生成 ${taskPreview.length} 个下一步任务。`, `Created ${taskPreview.length} next-action tasks.`))],
      });
      setTaskPreview([]);
      onTasksCreated?.();
      showToast(localize(language, '已投放到今日任务', 'Added to today'), 'success');
    } catch (e: any) {
      showToast(e.message || localize(language, '创建任务失败', 'Failed to create tasks'), 'error');
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!confirm(localize(language, '确定删除这个思考空间吗？Markdown 文件也会删除。', 'Delete this workspace and its Markdown file?'))) return;
    try {
      await thinkingWorkspacesApi.delete(selected.id);
      setWorkspaces(prev => prev.filter(w => w.id !== selected.id));
      setSelectedId('');
      showToast(localize(language, '已删除', 'Deleted'), 'success');
    } catch (e: any) {
      showToast(e.message || localize(language, '删除失败', 'Delete failed'), 'error');
    }
  };

  return (
    <div className="min-h-full -m-4 md:-m-8 lg:-m-12 p-4 md:p-8 lg:p-10 bg-[radial-gradient(circle_at_10%_0%,rgba(35,135,123,0.12),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.94),rgba(246,242,234,0.82))]">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] border border-black/10 bg-[#111] text-white p-6 md:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          <div className="absolute inset-0 opacity-30 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.16),transparent)]" />
          <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-white/55 mb-3"><BrainCircuit className="w-4 h-4" /> Workspaces</div>
              <h1 className="text-3xl md:text-5xl font-serif tracking-tight leading-none">{localize(language, '先想清楚，再拆成任务。', 'Think first. Then make tasks.')}</h1>
              <p className="mt-4 text-sm md:text-base text-white/65 max-w-2xl leading-relaxed">{localize(language, '这里不是任务列表，而是目标、问题、方案和零散想法的作战室。AI 帮你整理路径，再把下一步投放到 Today。', 'This is not a todo list. It is a war room for goals, questions, plans, and loose thoughts. AI shapes the journey, then sends the next actions to Today.')}</p>
            </div>
            <button onClick={() => document.getElementById('new-workspace-title')?.focus()} className="w-fit flex items-center gap-2 px-4 py-2 rounded-full bg-white text-[#111] text-sm font-semibold hover:scale-[1.02] active:scale-95 transition-transform"><Plus className="w-4 h-4" />{localize(language, '新建思考空间', 'New Workspace')}</button>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5">
          <aside className="space-y-4">
            <section className="rounded-3xl border border-border/70 bg-white/75 backdrop-blur-xl p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-accent" />{localize(language, '捕获一个事项', 'Capture an item')}</h2>
              <div className="space-y-3">
                <input id="new-workspace-title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={localize(language, '例如：规划客户 PoC 方案', 'e.g. Plan customer PoC proposal')} className="w-full px-3 py-2 rounded-xl bg-surface border border-border/70 outline-none text-sm focus:border-accent" />
                <textarea value={draft.intent} onChange={e => setDraft({ ...draft, intent: e.target.value })} placeholder={localize(language, '这件事想解决什么？', 'What should this solve?')} rows={3} className="w-full px-3 py-2 rounded-xl bg-surface border border-border/70 outline-none text-sm resize-none focus:border-accent" />
                <textarea value={draft.scratchpad} onChange={e => setDraft({ ...draft, scratchpad: e.target.value })} placeholder={localize(language, '先把零散想法丢进来...', 'Drop loose thoughts here...')} rows={4} className="w-full px-3 py-2 rounded-xl bg-surface border border-border/70 outline-none text-sm resize-none focus:border-accent" />
                <input value={draft.tagsText} onChange={e => setDraft({ ...draft, tagsText: e.target.value })} placeholder={localize(language, '标签，用逗号分隔', 'Tags, comma separated')} className="w-full px-3 py-2 rounded-xl bg-surface border border-border/70 outline-none text-sm focus:border-accent" />
                <button disabled={!draft.title.trim() || isCreating} onClick={createWorkspace} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-text-heading text-white text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-all">{isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{localize(language, '创建', 'Create')}</button>
              </div>
            </section>

            <section className="rounded-3xl border border-border/70 bg-white/70 backdrop-blur-xl p-3 shadow-sm">
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={localize(language, '搜索思考空间', 'Search workspaces')} className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface border border-border/60 outline-none text-sm focus:border-accent" />
              </div>
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {isLoading && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>}
                {!isLoading && filtered.length === 0 && <p className="text-xs text-text-muted text-center py-8">{localize(language, '还没有思考空间', 'No workspaces yet')}</p>}
                {filtered.map(w => (
                  <button key={w.id} onClick={() => setSelectedId(w.id)} className={`w-full text-left p-3 rounded-2xl border transition-all ${selected?.id === w.id ? 'bg-[#111] text-white border-[#111] shadow-lg' : 'bg-white/60 text-text-main border-border/50 hover:border-accent/30 hover:bg-white'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{w.title}</div>
                        <div className={`mt-1 text-[11px] ${selected?.id === w.id ? 'text-white/55' : 'text-text-muted'}`}>{statusLabel(w.status, language)} · {new Date(w.updatedAt).toLocaleDateString()}</div>
                      </div>
                      <Compass className={`w-4 h-4 shrink-0 ${selected?.id === w.id ? 'text-white/70' : 'text-accent'}`} />
                    </div>
                    {w.intent && <p className={`mt-2 text-xs line-clamp-2 leading-relaxed ${selected?.id === w.id ? 'text-white/65' : 'text-text-muted'}`}>{w.intent}</p>}
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="min-w-0">
            {!selected ? (
              <div className="h-full min-h-[520px] rounded-[32px] border border-dashed border-border bg-white/50 flex flex-col items-center justify-center text-center p-10">
                <Lightbulb className="w-10 h-10 text-text-muted/50 mb-4" />
                <h3 className="text-lg font-semibold text-text-heading">{localize(language, '创建一个思考空间', 'Create a thinking workspace')}</h3>
                <p className="text-sm text-text-muted mt-2 max-w-md">{localize(language, '从目标、问题或一段零散想法开始。', 'Start from a goal, a question, or a loose thought.')}</p>
              </div>
            ) : (
              <WorkspaceDetail
                workspace={selected}
                language={language}
                isSaving={isSaving}
                aiBusy={aiBusy}
                taskPreview={taskPreview}
                setTaskPreview={setTaskPreview}
                onUpdate={updateSelected}
                onDelete={deleteSelected}
                onAi={runAi}
                onCreateTasks={createPreviewTasks}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function WorkspaceDetail({ workspace, language, isSaving, aiBusy, taskPreview, setTaskPreview, onUpdate, onDelete, onAi, onCreateTasks }: {
  workspace: ThinkingWorkspaceData;
  language: Language;
  isSaving: boolean;
  aiBusy: string | null;
  taskPreview: string[];
  setTaskPreview: (tasks: string[]) => void;
  onUpdate: (updates: Partial<ThinkingWorkspaceData>, toast?: boolean) => void;
  onDelete: () => void;
  onAi: (kind: 'brief' | 'journey' | 'mindmap' | 'tasks') => void;
  onCreateTasks: () => void;
}) {
  const [local, setLocal] = useState(workspace);
  useEffect(() => setLocal(workspace), [workspace.id, workspace.updatedAt]);

  const save = () => onUpdate(local, true);
  const setField = <K extends keyof ThinkingWorkspaceData>(key: K, value: ThinkingWorkspaceData[K]) => setLocal(prev => ({ ...prev, [key]: value }));

  const aiButton = (kind: 'brief' | 'journey' | 'mindmap' | 'tasks', icon: React.ReactNode, zh: string, en: string) => (
    <button onClick={() => onAi(kind)} disabled={!!aiBusy} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/15 disabled:opacity-50 active:scale-95 transition-all">
      {aiBusy === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}{localize(language, zh, en)}
    </button>
  );

  return (
    <motion.div key={workspace.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[32px] border border-border/70 bg-white/80 backdrop-blur-2xl shadow-[0_20px_70px_rgba(0,0,0,0.08)] overflow-hidden">
      <div className="p-5 md:p-6 border-b border-border/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(248,246,239,0.75))]">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <input value={local.title} onChange={e => setField('title', e.target.value)} className="w-full bg-transparent outline-none text-2xl md:text-3xl font-serif text-text-heading tracking-tight" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select value={local.status} onChange={e => setField('status', e.target.value as ThinkingWorkspaceData['status'])} className="px-3 py-1.5 rounded-full bg-white border border-border text-xs font-medium outline-none">
                {(['active','paused','completed','archived'] as const).map(s => <option key={s} value={s}>{statusLabel(s, language)}</option>)}
              </select>
              <input value={(local.tags || []).join(', ')} onChange={e => setField('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))} placeholder={localize(language, '标签', 'Tags')} className="px-3 py-1.5 rounded-full bg-white border border-border text-xs outline-none min-w-[180px]" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={isSaving} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-text-heading text-white text-xs font-semibold disabled:opacity-60 active:scale-95 transition-all">{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{localize(language, '保存', 'Save')}</button>
            <button onClick={onDelete} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 active:scale-95 transition-all"><Trash2 className="w-4 h-4" />{localize(language, '删除', 'Delete')}</button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {aiButton('brief', <Wand2 className="w-4 h-4" />, '帮我理清这件事', 'Clarify')}
          {aiButton('journey', <GitBranch className="w-4 h-4" />, '规划推进路径', 'Plan Journey')}
          {aiButton('tasks', <CalendarPlus className="w-4 h-4" />, '生成下一步任务', 'Next Tasks')}
          {aiButton('mindmap', <Map className="w-4 h-4" />, '生成脑图', 'Mind Map')}
        </div>
      </div>

      <div className="p-5 md:p-6 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="space-y-5 min-w-0">
          <EditorBlock title="Intent" icon={<Compass className="w-4 h-4" />} value={local.intent} onChange={v => setField('intent', v)} placeholder={localize(language, '这个空间想解决什么问题？', 'What should this workspace solve?')} />
          <EditorBlock title="Scratchpad" icon={<Lightbulb className="w-4 h-4" />} value={local.scratchpad} onChange={v => setField('scratchpad', v)} placeholder={localize(language, '把零散想法、链接、疑问先丢进来...', 'Drop loose thoughts, links, questions...')} rows={7} />
          <EditorBlock title="Brief" icon={<Sparkles className="w-4 h-4" />} value={local.brief || ''} onChange={v => setField('brief', v)} placeholder={localize(language, 'AI 整理后的结构化摘要会出现在这里。', 'AI brief appears here.')} rows={7} />
          <EditorBlock title="Journey" icon={<GitBranch className="w-4 h-4" />} value={local.journey || ''} onChange={v => setField('journey', v)} placeholder={localize(language, '阶段、风险、里程碑和下一步。', 'Phases, risks, milestones, and next actions.')} rows={8} />
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-border/70 bg-surface/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-heading flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-accent" />Tasks</h3>
              <button onClick={() => onAi('tasks')} className="text-[11px] font-semibold text-accent hover:underline">{localize(language, '生成', 'Generate')}</button>
            </div>
            <textarea value={local.tasksMarkdown || ''} onChange={e => setField('tasksMarkdown', e.target.value)} rows={8} placeholder="- [ ] ..." className="w-full bg-white/75 border border-border/60 rounded-2xl p-3 text-xs leading-relaxed outline-none resize-none focus:border-accent" />
            <AnimatePresence>
              {taskPreview.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mt-3 p-3 rounded-2xl bg-accent/10 border border-accent/20 space-y-2">
                  <div className="text-xs font-semibold text-accent">{localize(language, '任务预览', 'Task preview')}</div>
                  {taskPreview.map((t, i) => <label key={i} className="flex items-start gap-2 text-xs text-text-main"><input type="checkbox" checked readOnly className="mt-0.5" />{t}</label>)}
                  <div className="flex gap-2 pt-1">
                    <button onClick={onCreateTasks} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold">{localize(language, '投放到 Today', 'Send to Today')}</button>
                    <button onClick={() => setTaskPreview([])} className="px-3 py-1.5 rounded-lg bg-white text-text-muted text-xs font-semibold">{localize(language, '取消', 'Cancel')}</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="rounded-3xl border border-border/70 bg-surface/70 p-4">
            <h3 className="text-sm font-semibold text-text-heading flex items-center gap-2 mb-3"><Map className="w-4 h-4 text-accent" />Mind Map</h3>
            <textarea value={local.mindmapMarkdown || ''} onChange={e => setField('mindmapMarkdown', e.target.value)} rows={10} placeholder="mindmap\n  root((...))" className="w-full bg-[#111] text-white/85 border border-black/10 rounded-2xl p-3 text-xs font-mono leading-relaxed outline-none resize-none focus:border-accent" />
          </div>

          <div className="rounded-3xl border border-border/70 bg-surface/70 p-4">
            <h3 className="text-sm font-semibold text-text-heading mb-3">Timeline</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {(local.timeline || []).slice().reverse().map(entry => (
                <div key={entry.id} className="pl-3 border-l-2 border-accent/30">
                  <div className="text-[11px] font-semibold text-text-muted">{entry.date} · {entry.type}</div>
                  <div className="text-xs text-text-main mt-1 leading-relaxed whitespace-pre-wrap">{entry.body}</div>
                </div>
              ))}
              {(local.timeline || []).length === 0 && <p className="text-xs text-text-muted">{localize(language, '还没有推进记录', 'No timeline yet')}</p>}
            </div>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}

function EditorBlock({ title, icon, value, onChange, placeholder, rows = 5 }: { title: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-surface/70 p-4">
      <h3 className="text-sm font-semibold text-text-heading flex items-center gap-2 mb-3">{icon}{title}</h3>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="w-full bg-white/75 border border-border/60 rounded-2xl p-3 text-sm leading-relaxed outline-none resize-y min-h-[120px] focus:border-accent" />
    </div>
  );
}
