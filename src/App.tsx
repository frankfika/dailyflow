/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, CornerUpRight, Briefcase, Calendar, AlignLeft, FileText, LayoutDashboard, Trash2, Edit2, Settings, Sparkles, Loader2, ChevronDown, ChevronRight, X, Plus, Menu, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-markdown';
import 'prismjs/themes/prism.css';
import { filesApi, tasksApi, rolloverApi, gitApi, configApi } from './api/client';
import { WorkspaceSetup } from './components/WorkspaceSetup';
import { Projects } from './components/Projects';
import { AISummaryModal } from './components/AISummaryModal';
import { ContextSwitcher } from './components/ContextSwitcher';

type Task = {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
};

// Data is now loaded from backend API

const TAG_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-rose-100 text-rose-700 border-rose-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-pink-100 text-pink-700 border-pink-200",
  "bg-indigo-100 text-indigo-700 border-indigo-200",
];

const getTagColor = (tag: string) => {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
};

function getTodayStr(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

export default function App() {
  const todayStr = getTodayStr();
  const [currentFileDate, setCurrentFileDate] = useState(todayStr);
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [markdown, setMarkdown] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'projects' | 'mindmap'>('today');
  const [currentView, setCurrentView] = useState<'daily' | 'projects'>('daily');
  const [viewMode, setViewMode] = useState<'visual' | 'markdown'>('visual');
  const [lastSyncedMD, setLastSyncedMD] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };
  const [brainDumpText, setBrainDumpText] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTagsList, setNewTaskTagsList] = useState<string[]>([]);
  const [tagInputValue, setTagInputValue] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState<string>('');
  const [isProcessingBrainDump, setIsProcessingBrainDump] = useState(false);

  const [showAISummary, setShowAISummary] = useState(false);
  const [summaryPeriod, setSummaryPeriod] = useState<'7days' | '30days' | 'all'>('7days');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const [syncInterval, setSyncInterval] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allPendingTasks, setAllPendingTasks] = useState<Task[]>([]);
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [showWorkspaceSetup, setShowWorkspaceSetup] = useState(false);
  const [showDoneByCategory, setShowDoneByCategory] = useState<Record<string, boolean>>({});
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [githubRepoInput, setGithubRepoInput] = useState<string>('');
  const [githubToken, setGithubToken] = useState<string>('');
  const [showGithubToken, setShowGithubToken] = useState<boolean>(false);
  const [githubVerifyStatus, setGithubVerifyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [githubVerifyMsg, setGithubVerifyMsg] = useState<string>('');
  const [aiProvider, setAiProvider] = useState<'deepseek' | 'anthropic' | 'openai' | 'custom'>('deepseek');
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [aiModel, setAiModel] = useState<string>('');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>('');
  const [aiFormat, setAiFormat] = useState<'openai' | 'anthropic'>('openai');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [configTab, setConfigTab] = useState<'general' | 'ai' | 'github'>('general');
  const [rolloverTrigger, setRolloverTrigger] = useState<'manual' | 'on_app_open'>('manual');
  const [activeContext, setActiveContext] = useState<'work' | 'life'>('work');
  const markdownRef = React.useRef(markdown);

  // Check first run on mount
  useEffect(() => {
    const checkFirstRun = async () => {
      try {
        const response = await fetch('/api/config/check-first-run');
        const data = await response.json();
        setIsFirstRun(data.isFirstRun);
        setShowWorkspaceSetup(data.isFirstRun);
      } catch (e) {
        console.error('Failed to check first run', e);
        setIsFirstRun(false);
      }
    };
    const loadConfigData = async () => {
      try {
        const config = await configApi.get();
        setGithubRepo(config.githubRepo || null);
        setGithubRepoInput(config.githubRepo || '');
        setGithubToken(config.githubToken || '');
        setAiProvider(config.aiProvider || 'deepseek');
        setAiApiKey(config.aiApiKey || '');
        setAiModel(config.aiModel || '');
        setAiBaseUrl(config.aiBaseUrl || '');
        setAiFormat(config.aiFormat || 'openai');
        setWorkspaceRoot(config.workspaceRoot || '');
        setActiveContext(config.activeContext === 'life' ? 'life' : 'work');
        setRolloverTrigger(config.rolloverTrigger || 'manual');
      } catch (e) {
        // ignore
      }
    };
    checkFirstRun();
    loadConfigData();
  }, []);

  // Save activeContext when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-context', activeContext);
    
    const saveActiveContext = async () => {
      try {
        const config = await configApi.get();
        await configApi.update({
          ...config,
          activeContext,
        });
      } catch (e) {
        console.error('Failed to save activeContext', e);
      }
    };
    // Only save if we've already loaded config (isFirstRun is not null)
    if (isFirstRun !== null) {
      saveActiveContext();
    }
  }, [activeContext, isFirstRun]);

  // Load file list on mount
  useEffect(() => {
    // Skip loading if showing workspace setup
    if (showWorkspaceSetup) return;

    let cancelled = false;
    const loadFileList = async () => {
      try {
        const files = await filesApi.list();
        const map: Record<string, string> = {};
        // Load content for all files in parallel
        await Promise.allSettled(
          files.map(async (f) => {
            const data = await filesApi.get(f);
            if (data) map[f] = data.content;
          })
        );
        if (!cancelled) {
          setFilesMap(prev => ({ ...prev, ...map }));
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Failed to load file list', e);
          setLoadError('Failed to load files. Is the backend running?');
        }
      }
    };
    loadFileList();
    return () => { cancelled = true; };
  }, []);

  // Load current date's tasks from API
  const loadTasksForDate = useCallback(async (date: string) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Auto rollover unfinished tasks from previous dates only when configured
      if (rolloverTrigger === 'on_app_open') {
        try {
          const rolloverResult = await rolloverApi.apply(date);
          if (rolloverResult.migratedCount > 0) {
            console.log(`Auto-rollover: migrated ${rolloverResult.migratedCount} tasks`);
          }
        } catch (rolloverErr) {
          console.error('Auto-rollover failed', rolloverErr);
        }
      }

      const data = await filesApi.get(date);
      if (data) {
        setMarkdown(data.content);
        setTasks(data.tasks as Task[]);
        setLastSyncedMD(data.content);
        setFilesMap(prev => ({ ...prev, [date]: data.content }));
      } else {
        setMarkdown('');
        setTasks([]);
        setLastSyncedMD('');
      }
    } catch (e) {
      console.error('Failed to load tasks', e);
      setLoadError('Failed to load tasks. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  }, [rolloverTrigger]);

  useEffect(() => {
    loadTasksForDate(currentFileDate);
  }, [currentFileDate, loadTasksForDate]);

  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);

  useEffect(() => {
    if (syncInterval > 0) {
      const intervalId = setInterval(() => {
        setIsSyncing(true);
        setTimeout(() => {
          setLastSyncedMD(markdownRef.current);
          filesApi.update(currentFileDate, markdownRef.current).catch(console.error);
          setIsSyncing(false);
        }, 1500);
      }, syncInterval * 60000);
      return () => clearInterval(intervalId);
    }
  }, [syncInterval, currentFileDate]);

  // Keyboard shortcut: Cmd/Ctrl+N to toggle task input, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setShowTaskInput(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowTaskInput(false);
        setShowBrainDump(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load all pending tasks for projects view when switching to projects tab
  useEffect(() => {
    if (activeTab !== 'projects') return;
    let cancelled = false;
    const loadAllPending = async () => {
      try {
        const files = await filesApi.list();
        if (cancelled) return;
        const results = await Promise.all(files.map(f => filesApi.get(f)));
        if (cancelled) return;
        const pending: Task[] = [];
        results.forEach((data) => {
          if (!data) return;
          (data.tasks as Task[]).forEach((t) => {
            if (t.status === 'todo') {
              pending.push({ ...t, source_date: t.source_date || data.date });
            }
          });
        });
        if (!cancelled) setAllPendingTasks(pending);
      } catch (e) {
        if (!cancelled) console.error('Failed to load pending tasks', e);
      }
    };
    loadAllPending();
    return () => { cancelled = true; };
  }, [activeTab, currentFileDate]);

  const hasChanges = markdown !== lastSyncedMD;

  const generateAISummary = async () => {
    setIsGeneratingSummary(true);
    setAiSummary(null);
    try {
      const isAnthropicFormat = aiProvider === 'anthropic' || (aiProvider === 'custom' && aiFormat === 'anthropic');
      const allDates = Object.keys(filesMap).sort((a,b) => b.localeCompare(a));
      let filteredDates = allDates;

      const now = new Date('2026-05-04T00:00:00Z');
      if (summaryPeriod === '7days') {
        filteredDates = allDates.filter(d => {
           const date = new Date(`${d}T00:00:00Z`);
           const diffTime = Math.abs(now.getTime() - date.getTime());
           const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
           return diffDays <= 7;
        });
      } else if (summaryPeriod === '30days') {
        filteredDates = allDates.filter(d => {
           const date = new Date(`${d}T00:00:00Z`);
           const diffTime = Math.abs(now.getTime() - date.getTime());
           const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
           return diffDays <= 30;
        });
      }

      let contextStr = "Here are my notes and tasks for the selected period:\n\n";
      filteredDates.forEach(date => {
         contextStr += `--- Date: ${date} ---\n${filesMap[date]}\n\n`;
      });

      // Determine API endpoint and model based on provider
      let apiUrl = '';
      let model = aiModel;

      if (aiProvider === 'deepseek') {
        apiUrl = 'https://api.deepseek.com/chat/completions';
        model = model || 'deepseek-chat';
      } else if (isAnthropicFormat) {
        apiUrl = 'https://api.anthropic.com/v1/messages';
        model = model || 'claude-3-5-sonnet-20241022';
      } else if (aiProvider === 'openai') {
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        model = model || 'gpt-4o';
      } else if (aiProvider === 'custom' && aiBaseUrl) {
        apiUrl = aiBaseUrl;
        model = model || 'default';
      }

      if (!apiUrl || !aiApiKey) {
        throw new Error('AI provider not configured. Please set up AI configuration in Settings.');
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiApiKey}`,
          ...(isAnthropicFormat ? { 'anthropic-version': '2023-06-01' } : {}),
        },
        body: JSON.stringify({
          model,
          ...(isAnthropicFormat ? {
            max_tokens: 2048,
            messages: [
              { role: 'user', content: `You are my personal assistant. Based on my markdown notes for the selected time period, write a concise but insightful summary of what I achieved, what projects I focused on, and how my time was spent. Use casual, encouraging, and clear language. Format the response nicely in Markdown.\n\n${contextStr}` },
            ],
          } : {
            messages: [
              { role: 'system', content: 'You are a helpful personal assistant. Summarize notes concisely in Markdown.' },
              { role: 'user', content: `You are my personal assistant. Based on my markdown notes for the selected time period, write a concise but insightful summary of what I achieved, what projects I focused on, and how my time was spent. Use casual, encouraging, and clear language. Format the response nicely in Markdown.\n\n${contextStr}` },
            ],
          }),
        }),
      });

      if (!res.ok) throw new Error(`AI API error: ${res.status}`);
      const data = await res.json();

      // Extract response based on provider
      let summary = '';
      if (isAnthropicFormat) {
        summary = data.content?.[0]?.text?.trim() || "No summary generated.";
      } else {
        summary = data.choices?.[0]?.message?.content?.trim() || "No summary generated.";
      }

      setAiSummary(summary);
    } catch (e: any) {
      console.error(e);
      setAiSummary(`Failed to generate AI summary: ${e.message}. Please check your AI configuration in Settings.`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const processBrainDump = async () => {
    if (!brainDumpText.trim()) return;
    setIsProcessingBrainDump(true);
    try {
      const isAnthropicFormat = aiProvider === 'anthropic' || (aiProvider === 'custom' && aiFormat === 'anthropic');
      // Determine API endpoint and model based on provider
      let apiUrl = '';
      let model = aiModel;

      if (aiProvider === 'deepseek') {
        apiUrl = 'https://api.deepseek.com/chat/completions';
        model = model || 'deepseek-chat';
      } else if (isAnthropicFormat) {
        apiUrl = 'https://api.anthropic.com/v1/messages';
        model = model || 'claude-3-5-sonnet-20241022';
      } else if (aiProvider === 'openai') {
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        model = model || 'gpt-4o';
      } else if (aiProvider === 'custom' && aiBaseUrl) {
        apiUrl = aiBaseUrl;
        model = model || 'default';
      }

      if (!apiUrl || !aiApiKey) {
        throw new Error('AI provider not configured');
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiApiKey}`,
          ...(isAnthropicFormat ? { 'anthropic-version': '2023-06-01' } : {}),
        },
        body: JSON.stringify({
          model,
          ...(isAnthropicFormat ? {
            max_tokens: 2048,
            messages: [
              { role: 'user', content: `Extract a list of actionable tasks from the following text. Return ONLY a JSON array. Each task object must have: title (string), tags (string array), project (string, optional), deadline (YYYY-MM-DD string, optional), priority ("high"|"medium"|"low", optional).\n\n"${brainDumpText}"` },
            ],
          } : {
            messages: [
              { role: 'system', content: 'You are a task extraction assistant. Output ONLY a valid JSON array of tasks. Each task object must have: title (string), tags (string array), project (string, optional), deadline (YYYY-MM-DD string, optional), priority ("high"|"medium"|"low", optional). Do not include any markdown formatting or explanation outside the JSON.' },
              { role: 'user', content: `Extract a list of actionable tasks from the following text. Return ONLY a JSON array:\n\n"${brainDumpText}"` },
            ],
          }),
        }),
      });

      if (!res.ok) throw new Error(`AI API error: ${res.status}`);
      const data = await res.json();

      // Extract response based on provider
      let content = '';
      if (isAnthropicFormat) {
        content = data.content?.[0]?.text?.trim() || '';
      } else {
        content = data.choices?.[0]?.message?.content?.trim() || '';
      }

      // Strip markdown code fences if present
      const jsonStr = content.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      const extracted = JSON.parse(jsonStr) as any[];

      const newTasks: Task[] = extracted.map((t, idx) => {
        const tags = Array.isArray(t.tags) && t.tags.length > 0
          ? t.tags.map((tag: string) => tag.toLowerCase())
          : [];
        if (!tags.some((tag: string) => ['work', 'life'].includes(tag))) {
          tags.push(activeContext);
        }
        return {
          id: `t_${Date.now()}_${idx}`,
          title: t.title,
          status: 'todo',
          tags,
          source_date: currentFileDate,
          project: t.project,
          deadline: t.deadline,
          priority: t.priority as any
        };
      });

      // Add new tasks via API
      for (const nt of newTasks) {
        await tasksApi.create(currentFileDate, nt);
      }
      // Refresh markdown and re-sync tasks with server-side parsed IDs
      const fileData = await filesApi.get(currentFileDate);
      if (fileData) {
        setMarkdown(fileData.content);
        setTasks(fileData.tasks as Task[]);
        setLastSyncedMD(fileData.content);
        setFilesMap(prev => ({ ...prev, [currentFileDate]: fileData.content }));
      }
      setBrainDumpText('');
      setShowBrainDump(false);
      setShowTaskInput(false);
    } catch (e) {
      console.error(e);
      alert("Failed to process with AI.");
    } finally {
      setIsProcessingBrainDump(false);
    }
  };

  // When date changes, load tasks
  const handleToggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newStatus = task.status === 'todo' ? 'done' : 'todo';
    try {
      await tasksApi.updateStatus(id, currentFileDate, newStatus);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
      // Refresh markdown after task change
      const data = await filesApi.get(currentFileDate);
      if (data) {
        setMarkdown(data.content);
        setTasks(data.tasks as Task[]);
        setLastSyncedMD(data.content);
        setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
      }
    } catch (e) {
      console.error('Failed to toggle task', e);
    }
  };

  const handleGitSync = async () => {
    setIsSyncing(true);
    try {
      // 1. 先保存当前文件到后端
      await filesApi.update(currentFileDate, markdown);
      setLastSyncedMD(markdown);

      // 2. 生成提交信息
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0];
      const commitMessage = `Update daily notes: ${dateStr} ${timeStr}`;

      // 3. 调用 Git 同步 API
      const result = await gitApi.sync(commitMessage);

      if (result.success) {
        alert(language === 'zh'
          ? `成功提交并推送到 GitHub!\n提交哈希: ${result.commitHash?.substring(0, 7)}`
          : `Successfully committed and pushed to GitHub!\nCommit: ${result.commitHash?.substring(0, 7)}`
        );
      } else {
        const errorMsg = result.stage === 'commit'
          ? (language === 'zh' ? '提交失败' : 'Commit failed')
          : (language === 'zh' ? '推送失败' : 'Push failed');
        alert(`${errorMsg}: ${result.error}`);
      }
    } catch (e: any) {
      console.error('Sync failed', e);
      alert(language === 'zh'
        ? `同步失败: ${e.message}`
        : `Sync failed: ${e.message}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEditTask = async (
    id: string,
    updates: {
      title?: string;
      description?: string;
      tags?: string[];
      deadline?: string;
      priority?: 'high' | 'medium' | 'low';
      project?: string;
    }
  ) => {
    try {
      await tasksApi.edit(id, currentFileDate, updates);
      // Refresh markdown and re-sync tasks (server may have stable IDs)
      const data = await filesApi.get(currentFileDate);
      if (data) {
        setMarkdown(data.content);
        setTasks(data.tasks as Task[]);
        setLastSyncedMD(data.content);
        setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
      }
    } catch (e) {
      console.error('Failed to edit task', e);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await tasksApi.delete(id, currentFileDate);
      // Refresh markdown and re-sync tasks
      const data = await filesApi.get(currentFileDate);
      if (data) {
        setMarkdown(data.content);
        setTasks(data.tasks as Task[]);
        setLastSyncedMD(data.content);
        setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
      }
    } catch (e) {
      console.error('Failed to delete task', e);
    }
  };

  // Work context: show work tasks + tasks without work/life (default to work)
  // Life context: only show life tasks
  const contextFilteredTasks = activeContext === 'life'
    ? tasks.filter(t => t.tags?.includes('life'))
    : tasks.filter(t => t.tags?.includes('work') || !t.tags?.some(tag => ['work', 'life'].includes(tag)));
  const todayTasks = contextFilteredTasks.filter(t => t.status !== 'migrated');
  const categories = Array.from(new Set(todayTasks.flatMap(t => (t.tags || []).filter(tag => !['work', 'life'].includes(tag)))));

  const allDates = Object.keys(filesMap).sort((a, b) => b.localeCompare(a));
  const recentThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recentDates = allDates.filter(d => d >= recentThreshold);
  const archivedDates = allDates.filter(d => d < recentThreshold);
  
  const archivedMonths: Record<string, string[]> = {};
  archivedDates.forEach(d => {
    const dateObj = new Date(`${d}T00:00:00Z`);
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const monthName = monthFormatter.format(dateObj); // e.g. "April 2026"
    if (!archivedMonths[monthName]) archivedMonths[monthName] = [];
    archivedMonths[monthName].push(d);
  });

  const [expandedArchiveMonths, setExpandedArchiveMonths] = useState<Record<string, boolean>>({});

  const toggleArchiveMonth = (month: string) => {
    setExpandedArchiveMonths(prev => ({ ...prev, [month]: !prev[month] }));
  };

  // Handle workspace setup completion
  const handleWorkspaceSetupComplete = () => {
    setShowWorkspaceSetup(false);
    setIsFirstRun(false);
    // Reload the app
    window.location.reload();
  };

  // Show workspace setup if first run
  if (showWorkspaceSetup) {
    return <WorkspaceSetup onComplete={handleWorkspaceSetupComplete} language={language} />;
  }

  return (
    <div
      className="h-screen w-full flex overflow-hidden text-text-main relative transition-colors duration-700 bg-background"
    >
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-xl text-sm font-sans font-medium shadow-lg pointer-events-none ${
              toast.type === 'error' ? 'bg-red-500 text-white' :
              toast.type === 'info' ? 'bg-surface border border-border text-text-main' :
              'bg-accent text-white'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-20 lg:hidden backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed lg:relative inset-y-0 left-0 w-64 flex flex-col shrink-0 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-700 ${isSidebarOpen ? 'translate-x-0 lg:ml-0 border-r border-border' : '-translate-x-full lg:ml-[-16rem] border-r-0'} bg-surface`}>
        <div className="p-8 w-64">
          <div className="flex flex-col gap-1 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent text-white flex items-center justify-center font-serif text-lg font-bold rounded-lg shadow-sm">D</div>
              <span className="font-sans text-xs uppercase tracking-widest font-bold text-text-heading">DailyFlow</span>
            </div>
            <div className="mt-2 pl-11 text-[10px] uppercase tracking-widest font-bold text-text-muted opacity-80">
              {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date('2026-05-04T00:00:00Z'))}
            </div>
          </div>
          
          <nav className="space-y-8 pb-6">
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-4 flex items-center justify-between">
                <span>{language === 'zh' ? '时间轴' : 'Timeline'}</span>
                <button
                  onClick={async () => {
                    const today = getTodayStr();
                    if (filesMap[today]) {
                      setCurrentFileDate(today);
                      showToast(language === 'zh' ? '已是最新一天' : 'Already on latest day', 'info');
                      return;
                    }
                    try {
                      await filesApi.create(today, '## Tasks\n');
                      setFilesMap(prev => ({ ...prev, [today]: '## Tasks\n' }));
                      setCurrentFileDate(today);
                      showToast(language === 'zh' ? '已创建今日日记' : 'Created today\'s note', 'success');
                    } catch (e) {
                      console.error('Failed to create note', e);
                      showToast(language === 'zh' ? '创建失败' : 'Failed to create note', 'error');
                    }
                  }}
                  className="p-1 rounded-md bg-text-muted/10 text-text-muted hover:bg-accent/10 hover:text-accent transition-colors flex items-center gap-1"
                  title="New Daily Note"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </h3>
              <ul className="space-y-3 text-sm font-sans">
                {recentDates.map(date => {
                  const weekday = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
                  return (
                    <li
                      key={date}
                      onClick={() => setCurrentFileDate(date)}
                      className={`flex items-center gap-3 font-semibold cursor-pointer transition-opacity ${currentFileDate === date ? 'text-accent opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                    >
                      {currentFileDate === date && <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>}
                      <span className={currentFileDate !== date ? "ml-4" : ""}>
                        {date}
                        <span className="ml-1.5 text-[10px] opacity-50 font-normal">{weekday}</span>
                      </span>
                    </li>
                  );
                })}

                {Object.keys(archivedMonths).length > 0 && (
                  <li className="pt-2">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold block mb-3">{language === 'zh' ? '归档' : 'Archive'}</span>
                    <ul className="space-y-2">
                      {Object.keys(archivedMonths).map(monthName => (
                        <li key={monthName} className="space-y-2">
                          <button 
                            onClick={() => toggleArchiveMonth(monthName)}
                            className="flex items-center gap-2 text-xs font-bold text-text-muted opacity-80 hover:opacity-100 transition-opacity w-full text-left"
                          >
                            {expandedArchiveMonths[monthName] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span className="ml-[2px]">{monthName}</span>
                          </button>
                          {expandedArchiveMonths[monthName] && (
                            <ul className="space-y-3 pl-4 border-l border-border/50 ml-6 pb-2">
                              {archivedMonths[monthName].map(date => {
                                const weekday = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
                                return (
                                  <li
                                    key={date}
                                    onClick={() => setCurrentFileDate(date)}
                                    className={`flex items-center gap-3 font-semibold cursor-pointer text-xs transition-opacity ${currentFileDate === date ? 'text-accent opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                                  >
                                    {currentFileDate === date && <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>}
                                    <span className={currentFileDate !== date ? "" : ""}>
                                      {date}
                                      <span className="ml-1.5 text-[10px] opacity-50 font-normal">{weekday}</span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-4">{language === 'zh' ? '工作区' : 'Workspace'}</h3>
              <ul className="space-y-3 text-sm font-sans">
                <li 
                  onClick={() => { setActiveTab('today'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 cursor-pointer transition-opacity ${activeTab === 'today' ? 'text-text-heading font-semibold opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                >
                  <span className="ml-4">{language === 'zh' ? '每日笔记' : 'Daily Notes'}</span>
                </li>
                <li 
                  onClick={() => { setActiveTab('projects'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 cursor-pointer transition-opacity ${activeTab === 'projects' ? 'text-text-heading font-semibold opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                >
                  <span className="ml-4">{language === 'zh' ? '项目概览' : 'Projects Focus'}</span>
                </li>
              </ul>
            </div>

            {categories.length > 0 && (
              <div>
                <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-4">{language === 'zh' ? '分类' : 'Categories'}</h3>
                <ul className="space-y-3 text-sm font-sans">
                  {categories.map(c => (
                    <li
                       key={c}
                       onClick={() => {
                         setActiveTab('today');
                         setSelectedCategory(selectedCategory === c ? null : c);
                         setIsSidebarOpen(false);
                       }}
                       className={`flex items-center gap-3 cursor-pointer transition-colors ${selectedCategory === c ? 'text-accent font-semibold' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                    >
                      <div className={`ml-4 w-3 h-3 rounded-sm flex-shrink-0 border flex items-center justify-center transition-colors ${selectedCategory === c ? 'bg-accent border-accent text-white' : 'border-border'}`}>
                         {selectedCategory === c && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                      </div>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>
          <li 
            className="pt-2 mt-auto lg:hidden"
          >
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="flex w-full items-center gap-3 p-3 mt-4 rounded-xl cursor-pointer hover:bg-accent/10 transition-colors text-text-muted justify-center border border-border"
            >
              <X className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                {language === 'zh' ? '关闭' : 'Close'}
              </span>
            </button>
          </li>
        </div>

        <div className="mt-auto p-8 border-t border-border flex flex-col gap-4">
          <div>
            <span className="text-[10px] uppercase font-sans tracking-widest font-bold text-text-muted opacity-60">{language === 'zh' ? '版本控制' : 'Version Control'}</span>

            {!githubRepo ? (
              /* 未配置 GitHub 仓库时显示引导 */
              <div className="mt-3 p-3 rounded-xl bg-accent/5 border border-accent/20">
                <p className="text-[10px] text-text-muted leading-relaxed mb-2">
                  {language === 'zh'
                    ? '配置 GitHub 仓库，自动备份你的笔记。'
                    : 'Connect a GitHub repo to back up your notes automatically.'}
                </p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="w-full py-1.5 rounded-lg bg-accent text-white text-[10px] uppercase tracking-widest font-bold hover:bg-accent/90 transition-colors"
                >
                  {language === 'zh' ? '→ 前往 Configuration 配置' : '→ Go to Configuration'}
                </button>
              </div>
            ) : (
              /* 已配置时显示同步状态 */
              <>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${hasChanges ? 'bg-orange-400 animate-pulse' : 'bg-accent-highlight border border-[#edcdb6]'}`}></div>
                    <span className="text-xs font-medium text-text-main pr-1">
                      {hasChanges
                        ? (language === 'zh' ? '未提交的更改' : 'Uncommitted changes')
                        : (language === 'zh' ? '已是最新' : 'Up to date')}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-text-muted mt-1 truncate opacity-60" title={githubRepo}>
                  {githubRepo.replace('https://github.com/', '')}
                </p>
              </>
            )}
          </div>

          {githubRepo && (
            <button
              onClick={handleGitSync}
              disabled={isSyncing || !hasChanges}
              className="w-full bg-surface-white border border-border text-text-main py-2.5 rounded-xl text-[10px] uppercase tracking-widest font-bold shadow-sm hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
            >
              {isSyncing ? (language === 'zh' ? '正在同步...' : 'Syncing...') : (language === 'zh' ? '提交到 GitHub' : 'Commit to GitHub')}
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-background relative overflow-hidden min-w-0 w-full transition-colors duration-700">
        {currentView === 'projects' ? (
          <Projects language={language} activeContext={activeContext} />
        ) : (
          <>
        <header className={`h-20 px-4 md:px-8 lg:px-12 flex items-center justify-between border-b border-border backdrop-blur-md z-10 shrink-0 transition-colors duration-700 bg-background/80`}>
          <div className="flex items-center gap-3 md:gap-4 text-xs font-sans tracking-widest font-bold uppercase overflow-hidden whitespace-nowrap">
            <button className="p-2 -ml-2 text-text-muted hover:text-text-main shrink-0" onClick={() => setIsSidebarOpen(prev => !prev)}>
              <Menu className="w-5 h-5"/>
            </button>
            <span className="text-text-muted opacity-60 hidden sm:inline shrink-0">{language === 'zh' ? '每日笔记' : 'Daily Notes'}</span>
            <span className="text-text-muted opacity-40 hidden sm:inline shrink-0">/</span>
            <span className="text-accent truncate">{currentFileDate}.md</span>
          </div>
          
          <div className="flex items-center gap-3 md:gap-4">
            <ContextSwitcher
              activeContext={activeContext}
              onChange={setActiveContext}
              language={language}
            />
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex bg-surface rounded-full p-1 border border-border"
            >
              <button
                onClick={() => setViewMode('visual')}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-full text-[10px] font-sans uppercase tracking-widest font-bold transition-all ${viewMode === 'visual' ? 'bg-white shadow-sm text-accent' : 'text-text-muted hover:text-text-main'}`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === 'zh' ? '可视化页面' : 'Visual'}</span>
              </button>
              <button
                onClick={() => setViewMode('markdown')}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-full text-[10px] font-sans uppercase tracking-widest font-bold transition-all ${viewMode === 'markdown' ? 'bg-white shadow-sm text-accent' : 'text-text-muted hover:text-text-main'}`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === 'zh' ? 'Markdown 原文' : 'Raw Markdown'}</span>
              </button>
            </motion.div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto w-full p-4 md:p-8 lg:p-12 pb-32">
          <div className="max-w-4xl mx-auto w-full">
            {/* Loading state */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
                <span className="font-sans text-sm text-text-muted">{language === 'zh' ? '加载中...' : 'Loading...'}</span>
              </div>
            )}
            {/* Error state */}
            {!isLoading && loadError && (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <AlertCircle className="w-10 h-10 text-red-400" />
                <p className="font-sans text-sm text-red-500">{loadError}</p>
                <button
                  onClick={() => loadTasksForDate(currentFileDate)}
                  className="mt-2 px-4 py-2 bg-accent text-white rounded-full text-xs font-bold uppercase tracking-widest"
                >
                  {language === 'zh' ? '重试' : 'Retry'}
                </button>
              </div>
            )}
            {/* Empty state */}
            {!isLoading && !loadError && tasks.length === 0 && viewMode === 'visual' && activeTab === 'today' && (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <Calendar className="w-12 h-12 text-text-muted opacity-30" />
                <p className="font-serif italic text-xl text-text-muted">{language === 'zh' ? '今天还没有任务' : 'No tasks for today'}</p>
                <p className="font-sans text-sm text-text-muted opacity-60">{language === 'zh' ? '使用下方的输入框添加您的第一个任务' : 'Add your first task using the input below'}</p>
              </div>
            )}
            {!isLoading && !loadError && (viewMode === 'visual' ? (
              activeTab === 'today' ? (
                <motion.div
                  key="visual-today"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-10"
                >
                  <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/50 pb-6">
                    <h1 className="text-xl font-serif font-medium text-text-heading tracking-tight flex items-baseline gap-2">
                      <span>{new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${currentFileDate}T00:00:00Z`))}{language === 'zh' ? '' : ','}</span>
                      <span className="text-text-muted">
                        {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${currentFileDate}T00:00:00Z`))}
                      </span>
                    </h1>
                    
                    {categories.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSelectedCategory(null)}
                          className={`px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all ${
                            selectedCategory === null 
                              ? 'bg-text-heading text-white shadow-sm' 
                              : 'bg-surface text-text-muted hover:bg-surface-white hover:text-text-main border border-border/50'
                          }`}
                        >
                          {language === 'zh' ? '全部' : 'All'}
                        </button>
                        {categories.map(c => (
                          <button
                            key={c}
                            onClick={() => setSelectedCategory(selectedCategory === c ? null : c)}
                            className={`px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all ${
                              selectedCategory === c
                                ? 'bg-accent text-white shadow-sm'
                                : 'bg-surface text-text-muted hover:bg-surface-white hover:text-text-main border border-border/50'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>


                  {/* FAB: Add Task */}
                  {!showTaskInput && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setShowTaskInput(true)}
                      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-accent text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-shadow"
                      title={language === 'zh' ? '添加任务 (Cmd+N)' : 'Add Task (Cmd+N)'}
                    >
                      <Plus className="w-6 h-6" />
                    </motion.button>
                  )}

                  {/* Task Input Panel */}
                  {showTaskInput && (
                    <>
                      <div
                        className="fixed inset-0 bg-black/10 z-40 sm:hidden"
                        onClick={() => { setShowTaskInput(false); setShowBrainDump(false); }}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed inset-x-0 bottom-0 z-50 p-4 bg-background/95 backdrop-blur-md border-t border-border shadow-[0_-10px_20px_rgba(0,0,0,0.05)] sm:sticky sm:bottom-4 sm:p-0 sm:bg-transparent sm:backdrop-blur-none sm:border-none sm:shadow-none space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-text-muted">{language === 'zh' ? '按 Esc 关闭' : 'Press Esc to close'}</span>
                          <button
                            onClick={() => { setShowTaskInput(false); setShowBrainDump(false); }}
                            className="text-text-muted hover:text-text-heading p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {showBrainDump && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-surface border border-accent/20 rounded-[24px] p-6 shadow-sm overflow-hidden"
                          >
                             <div className="flex justify-between items-center mb-4">
                               <div className="flex items-center gap-2">
                                 <Sparkles className="w-4 h-4 text-accent" />
                                 <span className="font-sans text-[10px] uppercase font-bold tracking-widest text-accent">{language === 'zh' ? 'AI 脑暴' : 'AI Brain Dump'}</span>
                               </div>
                               <button onClick={() => setShowBrainDump(false)} className="text-text-muted hover:text-text-heading"><Trash2 className="w-4 h-4" /></button>
                             </div>
                             <textarea
                               autoFocus
                               className="w-full bg-background border border-border/50 rounded-xl p-4 text-sm font-sans outline-none focus:border-accent resize-none min-h-[120px]"
                               placeholder={language === 'zh' ? "在这里写下您的想法。AI 将提取任务，分类，并设置截止日期/项目...（例如 周五给妈妈打电话，并审查第三季度融资幻灯片）" : "Dump your scatterbrained thoughts here. The AI will extract tasks, categorize them, and set deadlines/projects... (e.g. Need to call mom on Friday, also review Q3 deck for Fundraising)"}
                               value={brainDumpText}
                               onChange={e => setBrainDumpText(e.target.value)}
                             />
                             <div className="mt-4 flex justify-end">
                               <button
                                 onClick={processBrainDump}
                                 disabled={isProcessingBrainDump || !brainDumpText.trim()}
                                 className="bg-accent text-white px-6 py-2 rounded-full font-sans text-[10px] font-bold uppercase tracking-widest shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                               >
                                 {isProcessingBrainDump ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                 <span>{isProcessingBrainDump ? (language === 'zh' ? '处理中...' : 'Processing...') : (language === 'zh' ? '提取任务' : 'Extract Tasks')}</span>
                               </button>
                             </div>
                          </motion.div>
                        )}

                        <div className="relative rounded-2xl bg-surface-white flex flex-col p-3 sm:p-4 border border-border focus-within:border-accent/40 focus-within:shadow-md shadow-sm transition-all duration-300 gap-3">
                          <div className="flex flex-1 items-start bg-surface/50 rounded-xl p-3 sm:p-4 focus-within:bg-surface-white transition-colors border border-transparent focus-within:border-border/50">
                            <div className="text-accent/60 mr-2 sm:mr-3 hidden sm:block mt-1">
                              <Plus className="w-5 h-5" />
                            </div>
                            <textarea
                              autoFocus
                              placeholder={language === 'zh' ? "在此添加新任务，亦可换行添加描述..." : "Add a new task here, use new lines for description..."}
                              className="w-full py-1 outline-none font-semibold placeholder:text-text-muted/60 text-text-heading bg-transparent text-[14px] sm:text-[15px] resize-none overflow-hidden block min-h-[24px]"
                              value={newTaskTitle}
                              rows={1}
                              onChange={e => {
                                setNewTaskTitle(e.target.value);
                                e.target.style.height = 'inherit';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey && newTaskTitle.trim()) {
                                  e.preventDefault();
                                  document.getElementById('add-task-btn')?.click();
                                }
                              }}
                            />
                          </div>

                          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center w-full gap-2 pb-1 px-1">
                              {/* Quick Tag Selection */}
                              <div className="flex-1 flex flex-col gap-2">
                                {/* Selected Tags */}
                                {newTaskTagsList.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {newTaskTagsList.map(tag => (
                                      <span key={tag} className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold flex items-center gap-1 group border ${getTagColor(tag)} cursor-default`}>
                                        {tag}
                                        <X className="w-3 h-3 cursor-pointer opacity-50 hover:opacity-100" onClick={() => setNewTaskTagsList(prev => prev.filter(t => t !== tag))} />
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Available Tags as Buttons */}
                                <div className="flex flex-wrap gap-1.5">
                                  {categories.filter(c => !newTaskTagsList.includes(c)).map(cat => (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => {
                                        if (!newTaskTagsList.includes(cat)) {
                                          setNewTaskTagsList([...newTaskTagsList, cat]);
                                        }
                                      }}
                                      className={`px-2.5 py-1.5 rounded-lg text-[10px] uppercase font-bold transition-all border ${getTagColor(cat)} opacity-60 hover:opacity-100 hover:scale-105 active:scale-95`}
                                    >
                                      + {cat}
                                    </button>
                                  ))}

                                  {/* Custom Tag Input */}
                                  <div className="flex items-center gap-1 bg-surface rounded-lg border border-border/80 focus-within:border-accent px-2 py-1 transition-colors">
                                    <input
                                      type="text"
                                      className="bg-transparent text-[10px] uppercase tracking-widest font-bold outline-none text-text-heading placeholder:text-text-muted/60 w-20"
                                      placeholder={language === 'zh' ? '自定义...' : 'Custom...'}
                                      value={tagInputValue}
                                      onChange={e => setTagInputValue(e.target.value)}
                                      onKeyDown={e => {
                                        if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && tagInputValue.trim()) {
                                          e.preventDefault();
                                          const newTag = tagInputValue.trim().toLowerCase();
                                          if (!newTaskTagsList.includes(newTag)) {
                                            setNewTaskTagsList([...newTaskTagsList, newTag]);
                                          }
                                          setTagInputValue('');
                                        } else if (e.key === 'Enter' && !tagInputValue.trim() && newTaskTitle.trim()) {
                                          e.preventDefault();
                                          document.getElementById('add-task-btn')?.click();
                                        }
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                                {/* Deadline Button */}
                                <label className={`flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 rounded-xl border transition-all h-[42px] cursor-pointer ${newTaskDeadline ? 'bg-[#faedec] text-[#a15f5f] border-[#ecd5d5]' : 'bg-surface text-text-muted border-border/80 hover:bg-surface-white'} focus-within:ring-2 ring-accent/20`}>
                                  <Calendar className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${newTaskDeadline ? 'opacity-100' : 'opacity-70'}`} />
                                  <input
                                    type="date"
                                    className={`bg-transparent outline-none border-none text-[10px] sm:text-[11px] uppercase tracking-widest font-bold cursor-pointer w-full min-w-[70px] sm:min-w-[120px] ${newTaskDeadline ? 'text-[#a15f5f]' : 'text-text-muted'}`}
                                    value={newTaskDeadline}
                                    onChange={e => setNewTaskDeadline(e.target.value)}
                                    onClick={(e) => {
                                      try { (e.target as HTMLInputElement).showPicker(); } catch(err){}
                                    }}
                                  />
                                </label>

                                {/* AI Button */}
                                <button
                                  onClick={() => setShowBrainDump(!showBrainDump)}
                                  className="bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-100 flex items-center justify-center rounded-xl transition-colors h-[42px] w-[42px] shrink-0 shadow-sm"
                                  title={language === 'zh' ? 'AI 收集箱' : 'AI Brain Dump'}
                                >
                                  <Sparkles className="w-4 h-4" />
                                </button>

                                {/* Submit button */}
                                <button
                                  id="add-task-btn"
                                  disabled={!newTaskTitle.trim()}
                                  onClick={() => {
                                    if (newTaskTitle.trim()) {
                                      const titleLines = newTaskTitle.trim().split('\n');
                                      const title = titleLines[0].trim();
                                      const description = titleLines.slice(1).join('\n').trim() || undefined;

                                      const tags = [...newTaskTagsList];
                                      if (tagInputValue.trim()) {
                                        const newTag = tagInputValue.trim().toLowerCase();
                                        if (!tags.includes(newTag)) tags.push(newTag);
                                      }
                                      if (!tags.some(t => ['work', 'life'].includes(t))) {
                                        tags.push(activeContext);
                                      }

                                      const finalDeadline = newTaskDeadline || currentFileDate;

                                      const newTask: Task = {
                                        id: `t_${Date.now()}`,
                                        title,
                                        description,
                                        status: 'todo',
                                        tags,
                                        deadline: finalDeadline,
                                        source_date: currentFileDate
                                      };
                                      // Optimistic UI update
                                      setTasks(prev => [...prev, newTask]);
                                      // Create via API
                                      tasksApi.create(currentFileDate, newTask).then(() => {
                                        // Refresh markdown AND tasks with server-side stable IDs
                                        return filesApi.get(currentFileDate);
                                      }).then(data => {
                                        if (data) {
                                          setMarkdown(data.content);
                                          setTasks(data.tasks as Task[]);
                                          setLastSyncedMD(data.content);
                                          setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
                                        }
                                      }).catch(console.error);
                                      setNewTaskTitle('');
                                      setNewTaskTagsList([]);
                                      setTagInputValue('');
                                      setNewTaskDeadline('');
                                      setShowTaskInput(false);
                                    }
                                  }}
                                  className={`px-4 sm:px-6 h-[42px] w-full sm:w-auto rounded-xl text-[12px] uppercase font-sans tracking-widest font-black flex items-center justify-center gap-2 transition-all duration-200 shrink-0 ${
                                    newTaskTitle.trim() ? "bg-accent text-white hover:bg-accent/90 shadow-md hover:-translate-y-[1px] active:translate-y-0" : "bg-surface-white text-text-muted/50 border border-border/80 cursor-not-allowed"
                                  } flex-1 sm:flex-none`}
                                >
                                  <span>{language === 'zh' ? '添加任务' : 'Add Task'}</span>
                                  <CornerUpRight className={`w-4 h-4 ${newTaskTitle.trim() ? 'opacity-80' : 'opacity-0'} hidden sm:block transition-opacity`} />
                                </button>
                              </div>
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                  {categories.map(category => {
                    if (selectedCategory && selectedCategory !== category) return null;
                    const catTasks = todayTasks.filter(t => t.tags?.includes(category));

                    const pendingCatTasks = catTasks.filter(t => t.status !== 'done');
                    const doneCatTasks = catTasks.filter(t => t.status === 'done');
                    if (pendingCatTasks.length === 0 && doneCatTasks.length === 0) return null;

                    const showDone = showDoneByCategory[category] ?? false;

                    return (
                      <div key={category} className="space-y-5">
                        <h2 className="font-sans text-[10px] uppercase tracking-widest text-text-muted font-bold flex items-center space-x-3 mt-8 mb-4">
                          <span>{category}</span>
                          <span className="h-px bg-border flex-1 block w-full"></span>
                        </h2>

                        <div className="space-y-4">
                          <AnimatePresence>
                            {pendingCatTasks.slice().reverse().map(task => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                language={language}
                                categories={categories}
                                currentFileDate={currentFileDate}
                                onToggle={() => handleToggleTask(task.id)}
                                onEdit={(updates) => handleEditTask(task.id, updates)}
                                onDelete={() => handleDeleteTask(task.id)}
                              />
                            ))}
                          </AnimatePresence>
                        </div>

                        {doneCatTasks.length > 0 && (
                          <div className="mt-2">
                            <button
                              onClick={() => setShowDoneByCategory(prev => ({ ...prev, [category]: !prev[category] }))}
                              className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-text-muted hover:text-text-main transition-colors"
                            >
                              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showDone ? 'rotate-180' : ''}`} />
                              {language === 'zh' ? `已完成 (${doneCatTasks.length})` : `Done (${doneCatTasks.length})`}
                            </button>
                            <AnimatePresence>
                              {showDone && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden space-y-4 mt-3"
                                >
                                  {doneCatTasks.slice().reverse().map(task => (
                                    <TaskCard
                                      key={task.id}
                                      task={task}
                                      language={language}
                                      categories={categories}
                                      currentFileDate={currentFileDate}
                                      onToggle={() => handleToggleTask(task.id)}
                                      onEdit={(updates) => handleEditTask(task.id, updates)}
                                      onDelete={() => handleDeleteTask(task.id)}
                                    />
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* 兜底：显示没有任何 category tag 的任务 */}
                  {(() => {
                    const uncategorized = todayTasks.filter(t =>
                      !categories.some(c => t.tags?.includes(c))
                    );
                    if (uncategorized.length === 0) return null;
                    if (selectedCategory) return null;
                    const pending = uncategorized.filter(t => t.status !== 'done');
                    const done = uncategorized.filter(t => t.status === 'done');
                    const showDone = showDoneByCategory['__uncategorized__'] ?? false;
                    return (
                      <div className="space-y-5">
                        <h2 className="font-sans text-[10px] uppercase tracking-widest text-text-muted font-bold flex items-center space-x-3 mt-8 mb-4">
                          <span>{language === 'zh' ? 'Tasks' : 'Tasks'}</span>
                          <span className="h-px bg-border flex-1 block w-full"></span>
                        </h2>
                        <div className="space-y-4">
                          <AnimatePresence>
                            {pending.slice().reverse().map(task => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                language={language}
                                categories={categories}
                                currentFileDate={currentFileDate}
                                onToggle={() => handleToggleTask(task.id)}
                                onEdit={(updates) => handleEditTask(task.id, updates)}
                                onDelete={() => handleDeleteTask(task.id)}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                        {done.length > 0 && (
                          <div className="mt-2">
                            <button
                              onClick={() => setShowDoneByCategory(prev => ({ ...prev, '__uncategorized__': !prev['__uncategorized__'] }))}
                              className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-text-muted hover:text-text-main transition-colors"
                            >
                              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showDone ? 'rotate-180' : ''}`} />
                              {language === 'zh' ? `已完成 (${done.length})` : `Done (${done.length})`}
                            </button>
                            <AnimatePresence>
                              {showDone && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 mt-4 overflow-hidden">
                                  {done.slice().reverse().map(task => (
                                    <TaskCard
                                      key={task.id}
                                      task={task}
                                      language={language}
                                      categories={categories}
                                      currentFileDate={currentFileDate}
                                      onToggle={() => handleToggleTask(task.id)}
                                      onEdit={(updates) => handleEditTask(task.id, updates)}
                                      onDelete={() => handleDeleteTask(task.id)}
                                    />
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </motion.div>
              ) : activeTab === 'projects' ? (
                <motion.div
                  key="visual-projects"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-12"
                >
                  <div className="mb-8">
                    <h1 className="text-4xl font-serif font-light text-text-heading tracking-tight italic mb-2">
                       {language === 'zh' ? '项目概览' : 'Projects Focus'}
                    </h1>
                    <p className="text-text-muted font-sans text-sm">
                       {language === 'zh' ? '按类别查看所有待办任务。' : 'View all pending tasks organized by category.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {(() => {
                      const filteredPending = activeContext === 'life'
                        ? allPendingTasks.filter(t => t.tags?.includes('life'))
                        : allPendingTasks.filter(t => t.tags?.includes('work') || !t.tags?.some(tag => ['work', 'life'].includes(tag)));
                      const projectCats = Array.from(new Set(filteredPending.flatMap(t => t.tags || [])));

                      if (projectCats.length === 0) {
                        return (
                          <div className="col-span-full py-20 text-center bg-surface-white rounded-[32px] border border-border/50 shadow-sm mt-8">
                            <Briefcase className="w-12 h-12 text-text-muted mx-auto mb-6 opacity-30 stroke-[1.5]" />
                            <h3 className="font-serif italic text-3xl text-text-muted font-light">{language === 'zh' ? '暂无活跃项目。' : 'No active projects.'}</h3>
                          </div>
                        );
                      }

                      return projectCats.map(cat => {
                        const catTasks = filteredPending.filter(t => t.tags?.includes(cat));
                        return (
                          <div key={cat} className="bg-surface-white rounded-[32px] border border-border shadow-sm p-6 overflow-hidden flex flex-col h-[500px]">
                            <h2 className="flex items-center gap-3 text-[14px] uppercase tracking-widest font-bold text-text-heading mb-6 shrink-0">
                               <Briefcase className="w-4 h-4 text-accent" />
                               <span className="truncate">{cat}</span>
                               <span className="ml-auto text-[10px] text-text-muted bg-surface px-2 py-1 rounded-full">{catTasks.length}</span>
                            </h2>
                            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                              {catTasks.slice().reverse().map(task => (
                                <div key={task.id + task.source_date} className="p-4 rounded-2xl bg-surface border border-border/50 hover:border-accent/40 transition-colors">
                                  <div className="flex items-start gap-3">
                                    <div className="w-5 h-5 rounded border border-border/80 flex items-center justify-center shrink-0 mt-0.5 bg-background shadow-inner"></div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-text-heading text-sm break-words leading-tight">{task.title}</p>
                                      <p className="text-[10px] text-text-muted font-sans font-bold tracking-widest uppercase mt-3 flex items-center gap-1.5 opacity-60">
                                        <Calendar className="w-3 h-3" />
                                        {task.source_date}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </motion.div>
              ) : (
                <div className="py-32 text-center bg-surface-white rounded-[48px] border border-border/50 shadow-sm mt-8">
                  <h2 className="editorial-hero text-5xl text-text-muted italic mb-6 leading-tight">{language === 'zh' ? '正在建设中' : 'Under Construction'}</h2>
                  <p className="font-sans text-[10px] font-bold text-text-muted uppercase tracking-widest">{activeTab} {language === 'zh' ? '视图敬请期待。' : 'view coming soon.'}</p>
                </div>
              )
            ) : (
              /* Markdown Editor View */
              <motion.div
                key="markdown-editor"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-white rounded-[32px] border border-border/50 p-10 shadow-sm"
              >
                <div className="font-mono text-sm leading-relaxed text-text-heading">
                  <Editor
                    value={markdown}
                    onValueChange={code => setMarkdown(code)}
                    highlight={code => Prism.highlight(code, Prism.languages.markdown, 'markdown')}
                    padding={10}
                    style={{
                       fontFamily: '"JetBrains Mono", monospace',
                       fontSize: 15,
                       backgroundColor: 'transparent',
                       minHeight: '400px',
                       outline: 'none'
                     }}
                     className="focus:outline-none editor-container"
                   />
                 </div>
               </motion.div>
             )
            )}
          </div>
        </div>
        </>
        )}
       </main>

       {showAISummary && (
         <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="bg-surface-white border border-border shadow-xl rounded-[32px] p-8 max-w-2xl w-full relative flex flex-col max-h-[85vh]"
           >
             <button onClick={() => setShowAISummary(false)} className="absolute top-8 right-8 text-text-muted hover:text-text-heading transition-colors">
               <X className="w-5 h-5" />
             </button>
             <h2 className="font-serif text-3xl text-text-heading italic mb-6 flex items-center gap-3">
                <Sparkles className="w-7 h-7 text-accent" />
                {language === 'zh' ? 'AI 洞察' : 'AI Summary'}
             </h2>
             
             <div className="flex gap-2 mb-6">
                <button 
                  onClick={() => setSummaryPeriod('7days')}
                  className={`px-4 py-2 font-sans font-bold text-xs uppercase tracking-widest rounded-full transition-colors ${summaryPeriod === '7days' ? 'bg-accent text-white shadow-sm' : 'bg-surface text-text-muted hover:text-text-heading border border-border'}`}
                >
                  {language === 'zh' ? '最近 7 天' : 'Last 7 Days'}
                </button>
                <button 
                  onClick={() => setSummaryPeriod('30days')}
                  className={`px-4 py-2 font-sans font-bold text-xs uppercase tracking-widest rounded-full transition-colors ${summaryPeriod === '30days' ? 'bg-accent text-white shadow-sm' : 'bg-surface text-text-muted hover:text-text-heading border border-border'}`}
                >
                  {language === 'zh' ? '最近 30 天' : 'Last 30 Days'}
                </button>
                <button 
                  onClick={() => setSummaryPeriod('all')}
                  className={`px-4 py-2 font-sans font-bold text-xs uppercase tracking-widest rounded-full transition-colors ${summaryPeriod === 'all' ? 'bg-accent text-white shadow-sm' : 'bg-surface text-text-muted hover:text-text-heading border border-border'}`}
                >
                  {language === 'zh' ? '全部时间' : 'All Time'}
                </button>
             </div>

             <div className="flex-1 overflow-y-auto min-h-[300px] border border-border/50 rounded-2xl p-6 bg-surface mb-6 relative">
               {isGeneratingSummary ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-accent">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <span className="font-sans font-bold text-xs uppercase tracking-widest animate-pulse">{language === 'zh' ? '正在分析洞察...' : 'Analyzing insights...'}</span>
                  </div>
               ) : aiSummary ? (
                  <div className="markdown-body font-sans text-sm text-text-main prose prose-slate max-w-none">
                    <ReactMarkdown>{aiSummary}</ReactMarkdown>
                  </div>
               ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted opacity-60">
                    <Sparkles className="w-8 h-8 mb-4 stroke-[1.5]" />
                    <span className="font-sans font-medium text-sm text-center max-w-sm">
                       {language === 'zh' ? '选择一个时间段并生成总结，以发现您的工作模式并可视化您的进展。' : 'Select a time period and generate a summary to uncover patterns in your work and visualize your progress.'}
                    </span>
                  </div>
               )}
             </div>

             <div className="flex justify-end pt-2">
                <button 
                  onClick={generateAISummary}
                  disabled={isGeneratingSummary}
                  className="bg-text-heading text-white px-6 py-3 rounded-full font-sans font-bold text-[11px] uppercase tracking-widest shadow-sm flex items-center gap-2 disabled:opacity-50 transition-transform active:scale-95"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{language === 'zh' ? '生成洞察' : 'Generate Insights'}</span>
                </button>
             </div>
           </motion.div>
         </div>
       )}

       {showSettings && (
         <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <motion.div
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="bg-surface-white border border-border shadow-xl rounded-[24px] w-full max-w-2xl relative flex flex-col max-h-[90vh]"
           >
             {/* Header with Close Button */}
             <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
               <h2 className="font-serif text-2xl text-text-heading italic">
                 {language === 'zh' ? '全局设置' : 'Configuration'}
               </h2>
               <button
                 onClick={() => setShowSettings(false)}
                 className="p-2 text-text-muted hover:text-text-heading transition-colors rounded-lg hover:bg-surface"
               >
                 <X className="w-5 h-5" />
               </button>
             </div>

             {/* Tabs */}
             <div className="flex border-b border-border px-6">
               <button
                 onClick={() => setConfigTab('general')}
                 className={`py-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                   configTab === 'general'
                     ? 'border-accent text-accent'
                     : 'border-transparent text-text-muted hover:text-text-heading'
                 }`}
               >
                 {language === 'zh' ? '通用' : 'General'}
               </button>
               <button
                 onClick={() => setConfigTab('ai')}
                 className={`py-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                   configTab === 'ai'
                     ? 'border-accent text-accent'
                     : 'border-transparent text-text-muted hover:text-text-heading'
                 }`}
               >
                 AI
               </button>
               <button
                 onClick={() => setConfigTab('github')}
                 className={`py-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                   configTab === 'github'
                     ? 'border-accent text-accent'
                     : 'border-transparent text-text-muted hover:text-text-heading'
                 }`}
               >
                 GitHub
               </button>
             </div>

             {/* Scrollable Content */}
             <div className="overflow-y-auto p-6 space-y-5">
               {configTab === 'general' && (
                 <div className="space-y-5">
                {/* Workspace Path */}
                <div>
                   <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted mb-2">
                     {language === 'zh' ? '工作区路径' : 'Workspace Path'}
                   </h3>
                   <div className="flex gap-2">
                     <input
                       type="text"
                       value={workspaceRoot}
                       onChange={e => setWorkspaceRoot(e.target.value)}
                       placeholder={language === 'zh' ? '工作区目录路径' : 'Workspace directory path'}
                       className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono"
                     />
                     <button
                       onClick={async () => {
                         try {
                           const res = await fetch('/api/config/choose-folder');
                           if (res.ok) {
                             const data = await res.json();
                             if (data.path) {
                               setWorkspaceRoot(data.path);
                             }
                           } else {
                             const error = await res.json();
                             alert(error.error || 'Failed to open folder picker');
                           }
                         } catch (e: any) {
                           alert('Failed to open folder picker: ' + e.message);
                         }
                       }}
                       className="px-3 py-2 bg-accent text-white rounded-lg text-xs uppercase font-bold tracking-widest hover:bg-accent/90 transition-colors whitespace-nowrap"
                     >
                       {language === 'zh' ? '浏览' : 'Browse'}
                     </button>
                   </div>
                   <p className="text-xs text-text-muted mt-1">{language === 'zh' ? '修改后需重启应用生效' : 'Restart app after changing'}</p>
                </div>

                <hr className="border-border" />

                {/* Language */}
                <div>
                   <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted mb-2">
                     {language === 'zh' ? '界面语言' : 'Language'}
                   </h3>
                   <div className="flex bg-surface p-1 rounded-lg shadow-inner border border-border/50 gap-1">
                     <button
                       onClick={() => setLanguage('en')}
                       className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${language === 'en' ? 'bg-white shadow-sm text-text-heading' : 'text-text-muted hover:text-text-main'}`}
                     >
                       English
                     </button>
                     <button
                       onClick={() => setLanguage('zh')}
                       className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${language === 'zh' ? 'bg-white shadow-sm text-text-heading' : 'text-text-muted hover:text-text-main'}`}
                     >
                       中文
                     </button>
                   </div>
                </div>
                </div>
              )}

              {configTab === 'ai' && (
                <div className="space-y-5">
                  {/* AI Configuration */}
                <div>
                   <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted mb-2">
                     {language === 'zh' ? 'AI 模型配置' : 'AI Model Configuration'}
                   </h3>

                   {/* Provider Selection */}
                   <select
                     value={aiProvider}
                     onChange={e => {
                       const provider = e.target.value as 'deepseek' | 'anthropic' | 'openai' | 'custom';
                       setAiProvider(provider);
                       // Set default models
                       if (provider === 'deepseek') setAiModel('deepseek-chat');
                       else if (provider === 'anthropic') setAiModel('claude-3-5-sonnet-20241022');
                       else if (provider === 'openai') setAiModel('gpt-4o');
                     }}
                     className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors mb-2"
                   >
                     <option value="deepseek">DeepSeek</option>
                     <option value="anthropic">Anthropic (Claude)</option>
                     <option value="openai">OpenAI (GPT)</option>
                     <option value="custom">{language === 'zh' ? '自定义' : 'Custom'}</option>
                   </select>

                   {/* API Key */}
                   <div className="relative mb-2">
                     <input
                       type={showApiKey ? "text" : "password"}
                       value={aiApiKey}
                       onChange={e => setAiApiKey(e.target.value)}
                       placeholder={language === 'zh' ? 'API Key' : 'API Key'}
                       className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-accent transition-colors font-mono"
                     />
                     <button
                       type="button"
                       onClick={() => setShowApiKey(!showApiKey)}
                       className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-heading transition-colors p-1"
                     >
                       {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                     </button>
                   </div>

                   {/* Model Name */}
                   <input
                     type="text"
                     value={aiModel}
                     onChange={e => setAiModel(e.target.value)}
                     placeholder={language === 'zh' ? '模型名称 (可选)' : 'Model name (optional)'}
                     className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono mb-2"
                   />

                   {/* Custom Base URL */}
                   {aiProvider === 'custom' && (
                     <input
                       type="text"
                       value={aiBaseUrl}
                       onChange={e => setAiBaseUrl(e.target.value)}
                       placeholder={language === 'zh' ? 'API 端点 URL' : 'API Endpoint URL'}
                       className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono mb-2"
                     />
                   )}

                   {/* Format Selection for Custom */}
                   {aiProvider === 'custom' && (
                     <select
                       value={aiFormat}
                       onChange={e => setAiFormat(e.target.value as 'openai' | 'anthropic')}
                       className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors mb-2"
                     >
                       <option value="openai">OpenAI Format</option>
                       <option value="anthropic">Anthropic Format</option>
                     </select>
                   )}

                   <p className="text-xs text-text-muted mt-1">
                     {language === 'zh' ? '用于 AI 总结和 Brain Dump 功能。' : 'Used for AI Summary and Brain Dump features. '}
                     {aiProvider === 'deepseek' && (
                       <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                         {language === 'zh' ? '获取 DeepSeek API Key' : 'Get DeepSeek API Key'}
                       </a>
                     )}
                     {aiProvider === 'anthropic' && (
                       <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                         {language === 'zh' ? '获取 Anthropic API Key' : 'Get Anthropic API Key'}
                       </a>
                     )}
                     {aiProvider === 'openai' && (
                       <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                         {language === 'zh' ? '获取 OpenAI API Key' : 'Get OpenAI API Key'}
                       </a>
                     )}
                   </p>
                </div>
                </div>
              )}

              {configTab === 'github' && (
                <div className="space-y-5">
                  <hr className="border-border" />

                  {/* GitHub Sync */}
                <div>
                   <div className="flex items-center justify-between mb-2">
                     <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted">
                       {language === 'zh' ? 'GitHub 同步' : 'GitHub Sync'}
                     </h3>
                     <span className="text-[9px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold">Beta</span>
                   </div>

                   {/* Detailed Tutorial */}
                   <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-3">
                     <p className="text-xs text-text-main font-medium mb-2">
                       {language === 'zh' ? '📖 详细配置步骤：' : '📖 Detailed Setup Guide:'}
                     </p>
                     <ol className="text-xs text-text-muted space-y-2 list-decimal list-inside">
                       <li>
                         <strong>{language === 'zh' ? '创建 GitHub 仓库' : 'Create GitHub Repository'}</strong>
                         <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                           <li>{language === 'zh' ? '访问 github.com，点击右上角 "+" → "New repository"' : 'Go to github.com, click "+" → "New repository"'}</li>
                           <li>{language === 'zh' ? '输入仓库名称（如 dailyflow-notes）' : 'Enter repository name (e.g., dailyflow-notes)'}</li>
                           <li>{language === 'zh' ? '选择 "Private"（私有仓库）' : 'Select "Private" repository'}</li>
                           <li>{language === 'zh' ? '点击 "Create repository"' : 'Click "Create repository"'}</li>
                         </ul>
                       </li>
                       <li>
                         <strong>{language === 'zh' ? '生成 Personal Access Token' : 'Generate Personal Access Token'}</strong>
                         <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                           <li>{language === 'zh' ? '访问 github.com/settings/tokens' : 'Go to github.com/settings/tokens'}</li>
                           <li>{language === 'zh' ? '点击 "Generate new token" → "Generate new token (classic)"' : 'Click "Generate new token" → "Generate new token (classic)"'}</li>
                           <li>{language === 'zh' ? '输入 Note（如 "DailyFlow Sync"）' : 'Enter Note (e.g., "DailyFlow Sync")'}</li>
                           <li>{language === 'zh' ? '勾选 "repo" 权限（完整仓库访问）' : 'Check "repo" scope (full repository access)'}</li>
                           <li>{language === 'zh' ? '点击 "Generate token"，复制生成的 token' : 'Click "Generate token", copy the generated token'}</li>
                         </ul>
                       </li>
                       <li>
                         <strong>{language === 'zh' ? '填写配置并测试' : 'Fill Configuration and Test'}</strong>
                         <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                           <li>{language === 'zh' ? '在下方填写仓库名称（格式：username/repo-name）' : 'Fill in repository name below (format: username/repo-name)'}</li>
                           <li>{language === 'zh' ? '粘贴刚才复制的 Personal Access Token' : 'Paste the Personal Access Token you just copied'}</li>
                           <li>{language === 'zh' ? '点击 "测试连接" 验证配置是否正确' : 'Click "Test Connection" to verify configuration'}</li>
                         </ul>
                       </li>
                     </ol>
                   </div>

                   <div className="space-y-3">
                     {/* Sync Interval */}
                     <div>
                       <label className="text-xs text-text-muted mb-1 block">
                         {language === 'zh' ? '同步频率' : 'Sync Frequency'}
                       </label>
                       <select
                         value={syncInterval}
                         onChange={e => setSyncInterval(Number(e.target.value))}
                         className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
                       >
                         <option value={0}>{language === 'zh' ? '手动同步' : 'Manual Sync'}</option>
                         <option value={1}>{language === 'zh' ? '每 1 分钟' : 'Every 1 minute'}</option>
                         <option value={5}>{language === 'zh' ? '每 5 分钟' : 'Every 5 minutes'}</option>
                         <option value={10}>{language === 'zh' ? '每 10 分钟' : 'Every 10 minutes'}</option>
                       </select>
                     </div>

                     {/* Repository */}
                     <div>
                       <label className="text-xs text-text-muted mb-1 block">
                         {language === 'zh' ? '仓库名称' : 'Repository Name'}
                       </label>
                       <input
                         type="text"
                         value={githubRepoInput}
                         onChange={e => setGithubRepoInput(e.target.value)}
                         placeholder={language === 'zh' ? "username/dailyflow-notes" : "username/dailyflow-notes"}
                         className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono"
                       />
                     </div>

                     {/* Token */}
                     <div>
                       <label className="text-xs text-text-muted mb-1 block">
                         Personal Access Token
                       </label>
                       <div className="relative">
                         <input
                           type={showGithubToken ? "text" : "password"}
                           value={githubToken}
                           onChange={e => setGithubToken(e.target.value)}
                           placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                           className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-accent transition-colors font-mono"
                         />
                         <button
                           type="button"
                           onClick={() => setShowGithubToken(!showGithubToken)}
                           className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-heading transition-colors p-1"
                         >
                           {showGithubToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                         </button>
                       </div>
                     </div>

                     {/* Test Connection Button */}
                     <button
                       onClick={async () => {
                         if (!githubRepoInput || !githubToken) {
                           setGithubVerifyStatus('error');
                           setGithubVerifyMsg(language === 'zh' ? '请填写仓库名称和 Token' : 'Please fill in repository name and token');
                           return;
                         }

                         setGithubVerifyStatus('loading');
                         setGithubVerifyMsg('');

                         try {
                           const [owner, repo] = githubRepoInput.split('/');
                           if (!owner || !repo) {
                             throw new Error(language === 'zh' ? '仓库名称格式错误，应为 username/repo-name' : 'Invalid repository format, should be username/repo-name');
                           }

                           const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                             headers: {
                               'Authorization': `Bearer ${githubToken}`,
                               'Accept': 'application/vnd.github.v3+json',
                             },
                           });

                           if (res.ok) {
                             const data = await res.json();
                             setGithubVerifyStatus('success');
                             setGithubVerifyMsg(language === 'zh'
                               ? `✓ 连接成功！仓库：${data.full_name}${data.private ? ' (私有)' : ' (公开)'}`
                               : `✓ Connection successful! Repository: ${data.full_name}${data.private ? ' (private)' : ' (public)'}`
                             );
                           } else if (res.status === 404) {
                             setGithubVerifyStatus('error');
                             setGithubVerifyMsg(language === 'zh' ? '✗ 仓库不存在或无权访问' : '✗ Repository not found or no access');
                           } else if (res.status === 401) {
                             setGithubVerifyStatus('error');
                             setGithubVerifyMsg(language === 'zh' ? '✗ Token 无效或已过期' : '✗ Invalid or expired token');
                           } else {
                             setGithubVerifyStatus('error');
                             setGithubVerifyMsg(language === 'zh' ? `✗ 验证失败：${res.status}` : `✗ Verification failed: ${res.status}`);
                           }
                         } catch (e: any) {
                           setGithubVerifyStatus('error');
                           setGithubVerifyMsg(language === 'zh' ? `✗ 错误：${e.message}` : `✗ Error: ${e.message}`);
                         }
                       }}
                       disabled={githubVerifyStatus === 'loading'}
                       className="w-full py-2 bg-surface border border-border rounded-lg text-xs uppercase font-bold tracking-widest hover:bg-surface-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                     >
                       {githubVerifyStatus === 'loading' ? (
                         <>
                           <Loader2 className="w-3.5 h-3.5 animate-spin" />
                           <span>{language === 'zh' ? '验证中...' : 'Verifying...'}</span>
                         </>
                       ) : (
                         <span>{language === 'zh' ? '测试连接' : 'Test Connection'}</span>
                       )}
                     </button>

                     {/* Verification Result */}
                     {githubVerifyMsg && (
                       <div className={`text-xs p-2 rounded-lg ${
                         githubVerifyStatus === 'success'
                           ? 'bg-green-50 text-green-700 border border-green-200'
                           : 'bg-red-50 text-red-700 border border-red-200'
                       }`}>
                         {githubVerifyMsg}
                       </div>
                     )}
                   </div>
                </div>
                </div>
              )}
             </div>

             {/* Footer with Save Button */}
             <div className="border-t border-border p-4 flex justify-end gap-3">
               <button
                 onClick={() => setShowSettings(false)}
                 className="px-5 py-2 font-sans font-bold text-xs uppercase tracking-widest text-text-muted hover:text-text-heading transition-colors"
               >
                 {language === 'zh' ? '取消' : 'Cancel'}
               </button>
               <button
                 onClick={async () => {
                   const oldWorkspaceRoot = workspaceRoot;
                   setShowSettings(false);
                   try {
                     const config = await configApi.get();
                     const workspaceChanged = oldWorkspaceRoot !== config.workspaceRoot;

                     await configApi.update({
                       ...config,
                       workspaceRoot: workspaceRoot.trim(),
                       githubRepo: githubRepoInput.trim() || undefined,
                       githubToken: githubToken.trim() || undefined,
                       aiProvider,
                       aiApiKey: aiApiKey.trim(),
                       aiModel: aiModel.trim(),
                       aiBaseUrl: aiBaseUrl.trim(),
                       aiFormat,
                     });
                     setGithubRepo(githubRepoInput.trim() || null);

                     // If workspace path changed, reload everything
                     if (workspaceChanged) {
                       // Clear current state
                       setFilesMap({});
                       setTasks([]);
                       setMarkdown('');

                       // Reload file list from new workspace
                       try {
                         const files = await filesApi.list();
                         const newFilesMap: Record<string, string> = {};
                         for (const file of files) {
                           const data = await filesApi.get(file);
                           if (data) {
                             newFilesMap[file] = data.content;
                           }
                         }
                         setFilesMap(newFilesMap);

                         // Switch to today's date
                         const today = getTodayStr();
                         setCurrentFileDate(today);

                         // Load today's file if it exists
                         if (newFilesMap[today]) {
                           const data = await filesApi.get(today);
                           if (data) {
                             setMarkdown(data.content);
                             setTasks(data.tasks as Task[]);
                             setLastSyncedMD(data.content);
                           }
                         }
                       } catch (e) {
                         console.error('Failed to reload workspace:', e);
                         alert(language === 'zh'
                           ? '重新加载工作区失败，请检查路径是否正确'
                           : 'Failed to reload workspace. Please check if the path is correct.');
                       }
                     }
                   } catch (e) {
                     console.error('Failed to save config:', e);
                     alert(language === 'zh'
                       ? '保存配置失败'
                       : 'Failed to save configuration');
                   }
                 }}
                 className="bg-accent text-white px-6 py-2 rounded-full font-sans font-bold text-xs uppercase tracking-widest shadow-sm hover:bg-accent/90 transition-colors"
               >
                 {language === 'zh' ? '保存' : 'Save'}
               </button>
             </div>
           </motion.div>
         </div>
       )}
     </div>
  );
}

interface TaskCardProps {
  task: Task;
  language: 'en' | 'zh';
  categories: string[];
  currentFileDate: string;
  onToggle: () => void;
  onEdit: (updates: {
    title?: string;
    description?: string;
    tags?: string[];
    deadline?: string;
    priority?: 'high' | 'medium' | 'low';
    project?: string;
  }) => void;
  onDelete: () => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, language, categories, currentFileDate, onToggle, onEdit, onDelete }) => {
  const isDone = task.status === 'done';
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(task.title + (task.description ? '\n' + task.description : ''));
  const [editTags, setEditTags] = useState<string[]>(task.tags || []);
  const [editDeadline, setEditDeadline] = useState<string>(task.deadline || '');
  const [tagInputValue, setTagInputValue] = useState('');

  // Sync local state when task prop changes from backend update
  useEffect(() => {
    if (!isEditing) {
      setEditContent(task.title + (task.description ? '\n' + task.description : ''));
      setEditTags(task.tags || []);
      setEditDeadline(task.deadline || '');
    }
  }, [task, isEditing]);

  const submitEdit = () => {
    if (editContent.trim()) {
      const lines = editContent.trim().split('\n');
      const newTitle = lines[0].trim();
      const newDesc = lines.slice(1).join('\n').trim() || ""; // pass empty string instead of undefined to clear description

      onEdit({
        title: newTitle,
        description: newDesc,
        tags: editTags,
        deadline: editDeadline || undefined,
      });
    } else {
      setEditContent(task.title + (task.description ? '\n' + task.description : ''));
    }
    setIsEditing(false);
  };
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.01 }}
      className={`group relative floating-card rounded-[24px] p-6 flex items-start space-x-5
        ${isDone ? 'bg-background border-border/30 shadow-none opacity-60' : 'bg-surface-white border-border/80'}`}
    >
      <button 
        onClick={onToggle}
        className="mt-1 flex-shrink-0 hover:scale-110 transition-transform focus:outline-none"
      >
        {isDone ? (
          <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shadow-sm">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-border flex items-center justify-center text-transparent hover:border-accent hover:text-accent transition-colors">
            <Check className="w-3.5 h-3.5" />
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0 pr-[72px] sm:pr-16 xl:pr-8">
        {isEditing ? (
          <div className="space-y-4">
            {/* Title and Description */}
            <textarea
              autoFocus
              ref={(el) => {
                if (el) {
                  el.style.height = 'inherit';
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                e.target.style.height = 'inherit';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setEditContent(task.title + (task.description ? '\n' + task.description : ''));
                  setEditTags(task.tags || []);
                  setEditDeadline(task.deadline || '');
                  setIsEditing(false);
                }
              }}
              rows={1}
              placeholder={language === 'zh' ? '任务标题...' : 'Task title...'}
              className="bg-transparent border-b border-border focus:border-accent outline-none font-serif text-xl leading-snug w-full text-text-heading resize-none overflow-hidden min-h-[32px] pb-1 transition-colors"
            />

            {/* Metadata Grid (Deadline & Tags) */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Deadline */}
              <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${editDeadline ? 'bg-[#faedec] text-[#a15f5f] border-[#ecd5d5]' : 'bg-surface text-text-muted border-border hover:bg-surface-white'}`}>
                <Calendar className="w-3.5 h-3.5" />
                <input
                  type="date"
                  className="bg-transparent outline-none border-none text-[10px] uppercase tracking-widest font-bold cursor-pointer"
                  value={editDeadline}
                  onChange={e => setEditDeadline(e.target.value)}
                />
                {editDeadline && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setEditDeadline('');
                    }}
                    className="ml-1 text-[#a15f5f] opacity-60 hover:opacity-100 hover:text-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </label>

              {/* Selected Tags */}
              {editTags.map(tag => (
                <span key={tag} className={`px-2.5 py-1.5 rounded-lg text-[10px] uppercase font-bold flex items-center gap-1.5 group border ${getTagColor(tag)} cursor-default`}>
                  {tag}
                  <X className="w-3 h-3 cursor-pointer opacity-50 hover:opacity-100" onClick={() => setEditTags(prev => prev.filter(t => t !== tag))} />
                </span>
              ))}

              {/* Add Tags */}
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.filter(c => !editTags.includes(c)).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      if (!editTags.includes(cat)) {
                        setEditTags([...editTags, cat]);
                      }
                    }}
                    className={`px-2 py-1.5 rounded-lg text-[10px] uppercase font-bold transition-all border ${getTagColor(cat)} opacity-50 hover:opacity-100 hover:scale-105 active:scale-95`}
                  >
                    + {cat}
                  </button>
                ))}

                <input
                  type="text"
                  className="bg-surface border border-border focus:border-accent rounded-lg px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold outline-none text-text-heading placeholder:text-text-muted w-24 transition-colors"
                  placeholder={language === 'zh' ? '+ 自定义' : '+ Custom'}
                  value={tagInputValue}
                  onChange={e => setTagInputValue(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && tagInputValue.trim()) {
                      e.preventDefault();
                      const newTag = tagInputValue.trim().toLowerCase();
                      if (!editTags.includes(newTag)) {
                        setEditTags([...editTags, newTag]);
                      }
                      setTagInputValue('');
                    }
                  }}
                />
              </div>
            </div>

            {/* Save/Cancel Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-border/50">
              <button
                onClick={() => {
                  setEditContent(task.title + (task.description ? '\n' + task.description : ''));
                  setEditTags(task.tags || []);
                  setEditDeadline(task.deadline || '');
                  setIsEditing(false);
                }}
                className="px-4 py-1.5 text-text-muted hover:text-text-heading text-xs uppercase font-bold tracking-widest transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={submitEdit}
                className="px-6 py-1.5 bg-accent text-white rounded-lg text-xs uppercase font-bold tracking-widest hover:bg-accent/90 transition-colors shadow-sm"
              >
                {language === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3 
              onDoubleClick={() => !isDone && setIsEditing(true)}
              className={`font-serif text-xl leading-snug transition-colors cursor-text ${isDone ? 'text-text-muted line-through' : 'text-text-heading hover:text-accent'}`}
              title={language === 'zh' ? '双击编辑' : 'Double-click to edit'}
            >
              {task.title}
            </h3>
            {task.description && (
              <div 
                onDoubleClick={() => !isDone && setIsEditing(true)}
                className={`mt-2 text-[13px] tracking-wide whitespace-pre-wrap leading-relaxed cursor-text ${isDone ? 'text-text-muted/60' : 'text-text-muted/90 max-w-[90%]'}`}
              >
                {task.description}
              </div>
            )}
          </div>
        )}
        
        {(!isDone && (task.project || task.deadline || task.priority || task.source_date !== currentFileDate || (task.tags && task.tags.length > 0))) && (
          <div className="flex flex-wrap gap-2 mt-4 mt-3">
            {task.source_date && task.source_date !== currentFileDate && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-accent-highlight text-[#966b4d] text-[10px] font-sans font-bold tracking-widest uppercase border border-[#edcdb6]">
                <CornerUpRight className="w-3 h-3" />
                <span>{language === 'zh' ? '已结转' : 'Migrated'}</span>
              </span>
            )}
            {task.tags && task.tags.filter((t: string) => t !== 'tasks').map((tag: string) => (
              <span key={tag} className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-sans font-bold tracking-widest uppercase border ${getTagColor(tag)}`}>
                <span>#{tag}</span>
              </span>
            ))}
            {task.project && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-surface text-text-main text-[10px] font-sans font-bold tracking-widest uppercase border border-border">
                <Briefcase className="w-3 h-3 opacity-60" />
                <span>{task.project}</span>
              </span>
            )}
            {task.deadline && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[#faedec] text-[#a15f5f] border border-[#ecd5d5] text-[10px] font-sans font-bold tracking-widest uppercase">
                <Calendar className="w-3 h-3" />
                <span>{task.deadline}</span>
              </span>
            )}
            {task.priority === 'high' && (
              <span className="inline-flex items-center justify-center space-x-1 px-2.5 py-1 rounded-md bg-accent text-white text-[10px] font-sans font-bold tracking-widest uppercase shadow-sm shadow-accent/20">
                <span>Priority</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute xl:top-6 sm:top-[22px] top-[14px] xl:right-6 sm:right-6 right-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center xl:space-x-2 space-x-1">
        {!isDone && !isEditing && (
          <button onClick={() => setIsEditing(true)} className="p-2 sm:p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg sm:bg-surface border border-border/50 sm:border-transparent bg-surface-white sm:bg-transparent shadow-sm sm:shadow-none">
            <Edit2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        )}
        <button onClick={onDelete} className="p-2 sm:p-1.5 text-text-muted hover:text-red-500 transition-colors rounded-lg sm:bg-surface hover:bg-red-50 border border-border/50 sm:border-transparent bg-surface-white sm:bg-transparent shadow-sm sm:shadow-none">
          <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
