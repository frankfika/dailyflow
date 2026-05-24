/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Check, CornerUpRight, Briefcase, Calendar, AlignLeft, Trash2, Edit2, Settings, Sparkles, Loader2, ChevronDown, ChevronRight, ChevronLeft, X, Plus, Menu, AlertCircle, Eye, EyeOff, RefreshCw, Search, Download } from 'lucide-react';
import { filesApi, tasksApi, rolloverApi, gitApi, configApi, notesApi, aiApi } from './api/client';
import { API_BASE, DEFAULT_MODEL } from './config/api';
import { getTodayStr } from './utils/tagColors';
import { TaskCard } from './components/TaskCard';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { RolloverPreviewModal } from './components/RolloverPreviewModal';
import { TaskInputPanel } from './components/TaskInputPanel';
import { WorkspaceSetup } from './components/WorkspaceSetup';
import { ContextSwitcher } from './components/ContextSwitcher';
import { Notes } from './components/Notes';
import { PromptLibrary } from './components/PromptLibrary';
import { DailyNoteCards } from './components/DailyNoteCards';
import { NoteEditor } from './components/NoteEditor';
import type { NoteData } from './api/client';
import { filterTasksByContext, filterNotesByContext } from './utils/contextFilter';

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

async function verifyGithubConnection(repoUrl: string, token: string): Promise<boolean> {
  if (!repoUrl || !token) return false;
  try {
    const repoPath = repoUrl
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '');
    const [owner, repo] = repoPath.split('/');
    if (!owner || !repo) return false;
    const res = await fetch(`${API_BASE.github}/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function formatTimeAgo(isoString: string, lang: 'en' | 'zh'): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return lang === 'zh' ? '刚刚' : 'just now';
  if (diffMin < 60) return lang === 'zh' ? `${diffMin}分钟前` : `${diffMin}m ago`;
  if (diffHour < 24) return lang === 'zh' ? `${diffHour}小时前` : `${diffHour}h ago`;
  return lang === 'zh' ? `${diffDay}天前` : `${diffDay}d ago`;
}

export default function App() {
  const todayStr = getTodayStr();
  const [currentFileDate, setCurrentFileDate] = useState(todayStr);
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [markdown, setMarkdown] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyNotes, setDailyNotes] = useState<NoteData[]>([]);
  const [showQuickNoteEditor, setShowQuickNoteEditor] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'notes' | 'ai'>('today');
  const [activeAiConfigId, setActiveAiConfigId] = useState<string>('default');

  const taskLinkedNotesCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const note of dailyNotes) {
      for (const taskId of note.linkedTaskIds) {
        map[taskId] = (map[taskId] || 0) + 1;
      }
    }
    return map;
  }, [dailyNotes]);
  const [lastSyncedMD, setLastSyncedMD] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [gitHasChanges, setGitHasChanges] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [gitLastCommitTime, setGitLastCommitTime] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === 'error' ? 5000 : 3500);
  };
  const [brainDumpText, setBrainDumpText] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTagsList, setNewTaskTagsList] = useState<string[]>([]);
  const [tagInputValue, setTagInputValue] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState<string>('');
  const [isProcessingBrainDump, setIsProcessingBrainDump] = useState(false);

  const [rolloverBanner, setRolloverBanner] = useState<{ count: number; fromDate: string } | null>(null);
  const [showRolloverPreview, setShowRolloverPreview] = useState(false);
  const [rolloverPreview, setRolloverPreview] = useState<{ tasksToMigrate: any[]; fromDate: string } | null>(null);
  const [isRollingOver, setIsRollingOver] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const [syncInterval, setSyncInterval] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [showWorkspaceSetup, setShowWorkspaceSetup] = useState(false);
  const [showDoneByCategory, setShowDoneByCategory] = useState<Record<string, boolean>>({});
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [githubRepoInput, setGithubRepoInput] = useState<string>('');
  const [githubToken, setGithubToken] = useState<string>('');
  const [showGithubToken, setShowGithubToken] = useState<boolean>(false);
  const [githubVerifyStatus, setGithubVerifyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [githubVerifyMsg, setGithubVerifyMsg] = useState<string>('');
  const [githubConnected, setGithubConnected] = useState<boolean>(false);
  const [aiProvider, setAiProvider] = useState<'deepseek' | 'anthropic' | 'openai' | 'custom'>('deepseek');
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [aiModel, setAiModel] = useState<string>('');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>('');
  const [aiFormat, setAiFormat] = useState<'openai' | 'anthropic'>('openai');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [aiVerifyStatus, setAiVerifyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiVerifyMsg, setAiVerifyMsg] = useState<string>('');
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [configTab, setConfigTab] = useState<'general' | 'ai' | 'github' | 'about'>('general');
  const [rolloverTrigger, setRolloverTrigger] = useState<'manual' | 'on_app_open'>('manual');
  const [activeContext, setActiveContext] = useState<'work' | 'life'>('work');
  const [updateAvailable, setUpdateAvailable] = useState(false);
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

        // Verify GitHub connection if repo and token are configured
        if (config.githubRepo && config.githubToken) {
          const ok = await verifyGithubConnection(config.githubRepo, config.githubToken);
          setGithubConnected(ok);
        }
      } catch (e) {
        // ignore
      }
    };
    checkFirstRun();
    loadConfigData();
  }, []);

  // Auto-check for updates on app start (silently, only for Settings badge)
  useEffect(() => {
    const autoCheckUpdate = async () => {
      try {
        const { checkForUpdates } = await import('./api/updater');
        const info = await checkForUpdates();
        setUpdateAvailable(info.hasUpdate);
      } catch (error) {
        console.error('Failed to auto-check for updates:', error);
      }
    };
    const timer = setTimeout(autoCheckUpdate, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Poll git status when connected
  useEffect(() => {
    if (!githubConnected) return;
    const checkGitStatus = async () => {
      try {
        const status = await gitApi.getStatus();
        setGitHasChanges(status.hasChanges);
        if (status.lastCommitTime) {
          setGitLastCommitTime(status.lastCommitTime);
        }
      } catch {
        // workspace might not be a git repo yet
      }
    };
    checkGitStatus();
    
    // Also periodically update the formatted time string without making network requests
    const timeUpdateInterval = setInterval(() => {
      // Force a re-render so formatTimeAgo updates
      setGitLastCommitTime(prev => prev ? new Date(prev).toISOString() : null);
    }, 60000); // every minute

    const interval = setInterval(checkGitStatus, 10000);
    return () => {
      clearInterval(interval);
      clearInterval(timeUpdateInterval);
    };
  }, [githubConnected]);

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
      // Auto rollover: only when loading today's date
      if (date === getTodayStr()) {
        try {
          const rolloverResult = await rolloverApi.apply(date);
          if (rolloverResult.migratedCount > 0) {
            setRolloverBanner({ count: rolloverResult.migratedCount, fromDate: date });
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

      // Load notes for this date
      try {
        const dateNotes = await notesApi.getByDate(date);
        setDailyNotes(dateNotes);
      } catch {
        setDailyNotes([]);
      }
    } catch (e) {
      console.error('Failed to load tasks', e);
      setLoadError('Failed to load tasks. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  }, [language]);

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

  const hasChanges = markdown !== lastSyncedMD || gitHasChanges;

  const processBrainDump = async () => {
    if (!brainDumpText.trim()) return;
    setIsProcessingBrainDump(true);
    try {
      if (!aiApiKey || !aiProvider) {
        throw new Error('AI provider not configured');
      }

      const { summary: content } = await aiApi.summarize({
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel || undefined,
        baseUrl: aiBaseUrl || undefined,
        systemPrompt: 'You are a task extraction assistant. Output ONLY a valid JSON array of tasks. Each task object must have: title (string), tags (string array), project (string, optional), deadline (YYYY-MM-DD string, optional), priority ("high"|"medium"|"low", optional). Do not include any markdown formatting or explanation outside the JSON.',
        userPrompt: `Extract a list of actionable tasks from the following text. Return ONLY a JSON array:\n\n"${brainDumpText}"`,
        format: (aiProvider === 'anthropic' || (aiProvider === 'custom' && aiFormat === 'anthropic')) ? 'anthropic' : 'openai',
      });

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
      showToast(language === 'zh' ? 'AI 处理失败' : 'Failed to process with AI.', 'error');
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
        setLastSyncTime(new Date().toISOString());
        showToast(
          language === 'zh'
            ? `✓ 已推送到 GitHub (${result.commitHash?.substring(0, 7)})`
            : `✓ Pushed to GitHub (${result.commitHash?.substring(0, 7)})`,
          'success'
        );
      } else {
        const errorMsg = result.stage === 'commit'
          ? (language === 'zh' ? '提交失败' : 'Commit failed')
          : (language === 'zh' ? '推送失败' : 'Push failed');
        showToast(`${errorMsg}: ${result.error}`, 'error');
      }
    } catch (e: any) {
      console.error('Sync failed', e);
      showToast(
        language === 'zh' ? `同步失败: ${e.message}` : `Sync failed: ${e.message}`,
        'error'
      );
    } finally {
      setIsSyncing(false);
      // Refresh git status
      try {
        const status = await gitApi.getStatus();
        setGitHasChanges(status.hasChanges);
      } catch {}
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
      showToast(language === 'zh' ? '任务已更新' : 'Task updated', 'success');
    } catch (e) {
      console.error('Failed to edit task', e);
      showToast(language === 'zh' ? '更新失败' : 'Failed to update task', 'error');
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
      showToast(language === 'zh' ? '任务已删除' : 'Task deleted', 'success');
    } catch (e) {
      console.error('Failed to delete task', e);
      showToast(language === 'zh' ? '删除失败' : 'Failed to delete task', 'error');
    }
  };

  const handleManualRollover = async () => {
    try {
      const preview = await rolloverApi.preview(currentFileDate);
      if (!preview || preview.tasksToMigrate.length === 0) {
        showToast(language === 'zh' ? '没有需要迁移的任务' : 'No tasks to migrate', 'info');
        return;
      }
      setRolloverPreview({ tasksToMigrate: preview.tasksToMigrate, fromDate: preview.fromDate });
      setShowRolloverPreview(true);
    } catch (e) {
      console.error('Failed to preview rollover', e);
      showToast(language === 'zh' ? '预览失败' : 'Preview failed', 'error');
    }
  };

  const handleConfirmRollover = async () => {
    setIsRollingOver(true);
    try {
      const result = await rolloverApi.apply(currentFileDate);
      setShowRolloverPreview(false);
      setRolloverPreview(null);
      if (result.migratedCount > 0) {
        showToast(
          language === 'zh' ? `已迁移 ${result.migratedCount} 个任务` : `Migrated ${result.migratedCount} tasks`,
          'success'
        );
        // Refresh
        const data = await filesApi.get(currentFileDate);
        if (data) {
          setMarkdown(data.content);
          setTasks(data.tasks as Task[]);
          setLastSyncedMD(data.content);
          setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
        }
      }
    } catch (e) {
      console.error('Rollover failed', e);
      showToast(language === 'zh' ? '迁移失败' : 'Rollover failed', 'error');
    } finally {
      setIsRollingOver(false);
    }
  };

  // Work context: show work tasks + tasks without work/life (default to work)
  // Life context: only show life tasks
  const contextFilteredTasks = filterTasksByContext(tasks, activeContext);
  const todayTasks = contextFilteredTasks.filter(t => t.status !== 'migrated');
  const systemTags = ['work', 'life', 'delayed', 'tasks'];
  const categories = Array.from(new Set(todayTasks.flatMap(t => (t.tags || []).filter(tag => !systemTags.includes(tag)))));

  const allDates = Object.keys(filesMap).sort((a, b) => b.localeCompare(a));
  const recentThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.9 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3.5 rounded-md text-sm font-sans font-bold shadow-sm pointer-events-none flex items-center gap-2.5 ${
              toast.type === 'error' ? 'bg-stone-50 text-stone-600 border border-stone-200 shadow-sm' :
              toast.type === 'info' ? 'bg-surface border border-border text-text-main shadow-sm' :
              'bg-stone-50 text-stone-600 border border-stone-200 shadow-sm'
            }`}
          >
            {toast.type === 'success' && <Check className="w-5 h-5" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>


      <RolloverPreviewModal
        show={showRolloverPreview}
        preview={rolloverPreview}
        isRollingOver={isRollingOver}
        language={language}
        onClose={() => setShowRolloverPreview(false)}
        onConfirm={handleConfirmRollover}
      />

      <Sidebar
        language={language}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentFileDate={currentFileDate}
        setCurrentFileDate={setCurrentFileDate}
        filesMap={filesMap}
        setFilesMap={setFilesMap}
        recentDates={recentDates}
        archivedMonths={archivedMonths}
        expandedArchiveMonths={expandedArchiveMonths}
        toggleArchiveMonth={toggleArchiveMonth}
        showToast={showToast}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-background relative overflow-hidden min-w-0 w-full transition-colors duration-700">
          <>
        <header className={`h-20 px-4 md:px-8 lg:px-12 flex items-center justify-between border-b border-border  z-10 shrink-0 transition-colors duration-700 bg-background`}>
          <div className="flex items-center gap-3 md:gap-4 text-xs font-sans  font-bold overflow-hidden whitespace-nowrap">
            <button className="p-2 -ml-2 text-text-muted hover:text-text-main shrink-0" onClick={() => setIsSidebarOpen(prev => !prev)}>
              <Menu className="w-5 h-5"/>
            </button>
            <button 
              onClick={() => {
                setActiveTab('today');
                setCurrentFileDate(getTodayStr());
              }}
              className="text-text-muted opacity-60 hover:opacity-100 hover:text-text-main transition-all hidden sm:inline shrink-0 cursor-pointer"
              title={language === 'zh' ? '返回今日任务' : 'Return to today'}
            >
              {language === 'zh' ? '每日任务' : 'Daily Tasks'}
            </button>
            {activeTab === 'today' ? (
              <>
                <span className="text-text-muted opacity-40 hidden sm:inline shrink-0">/</span>
                <span className="text-accent truncate">{currentFileDate}.md</span>
              </>
            ) : activeTab === 'ai' ? (
              <>
                <span className="text-text-muted opacity-40 hidden sm:inline shrink-0">/</span>
                <span className="text-accent truncate">AI</span>
              </>
            ) : (
              <>
                <span className="text-text-muted opacity-40 hidden sm:inline shrink-0">/</span>
                <span className="text-accent truncate">{language === 'zh' ? '笔记' : 'Notes'}</span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-3 md:gap-4">
            {githubConnected && (
              <button
                onClick={handleGitSync}
                disabled={isSyncing || !hasChanges}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-bold  bg-surface border border-border rounded hover:bg-surface-white transition-colors disabled:opacity-50"
                title={language === 'zh' ? '同步到 GitHub' : 'Sync to GitHub'}
              >
                {isSyncing ? (
                  <Loader2 className="w-3 h-3 animate-spin text-accent" />
                ) : hasChanges ? (
                  <div className="w-2 h-2 rounded bg-orange-400 animate-pulse" />
                ) : (
                  <div className="w-2 h-2 rounded bg-green-400" />
                )}
                <span className="text-text-muted">
                  {isSyncing
                    ? (language === 'zh' ? '同步中' : 'Syncing')
                    : hasChanges
                    ? (language === 'zh' ? '待同步' : 'Unsynced')
                    : (lastSyncTime || gitLastCommitTime)
                    ? (language === 'zh'
                        ? `已同步 ${formatTimeAgo(lastSyncTime || gitLastCommitTime!, language)}`
                        : `Synced ${formatTimeAgo(lastSyncTime || gitLastCommitTime!, language)}`)
                    : (language === 'zh' ? '已同步' : 'Synced')}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="relative p-2 text-text-muted hover:text-text-main transition-colors rounded-md hover:bg-surface"
              title={language === 'zh' ? '设置' : 'Settings'}
              data-testid="settings-button"
            >
              <Settings className="w-4.5 h-4.5" />
              {updateAvailable && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-stone-500 rounded" />
              )}
            </button>
            <ContextSwitcher
              activeContext={activeContext}
              onChange={setActiveContext}
              language={language}
            />
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
                <AlertCircle className="w-10 h-10 text-stone-500" />
                <p className="font-sans text-sm text-stone-500">{loadError}</p>
                <button
                  onClick={() => loadTasksForDate(currentFileDate)}
                  className="mt-2 px-4 py-2 bg-accent text-white rounded text-xs font-bold "
                >
                  {language === 'zh' ? '重试' : 'Retry'}
                </button>
              </div>
            )}
            {/* Empty state */}
            {!isLoading && !loadError && tasks.length === 0 && activeTab === 'today' && (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <Calendar className="w-12 h-12 text-text-muted opacity-30" />
                <p className="font-sans italic text-xl text-text-muted">{language === 'zh' ? '今天还没有任务' : 'No tasks for today'}</p>
                <p className="font-sans text-sm text-text-muted opacity-60">{language === 'zh' ? '使用下方的输入框添加您的第一个任务' : 'Add your first task using the input below'}</p>
              </div>
            )}
            {!isLoading && !loadError && (
              activeTab === 'today' ? (
                <motion.div
                  key="visual-today"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-10"
                >
                  <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/50 pb-6">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 mr-2">
                        <button
                          onClick={() => {
                            const d = new Date(`${currentFileDate}T00:00:00Z`);
                            d.setUTCDate(d.getUTCDate() - 1);
                            setCurrentFileDate(d.toISOString().split('T')[0]);
                          }}
                          className="p-1.5 text-text-muted hover:text-text-main hover:bg-surface rounded-md transition-colors"
                          title={language === 'zh' ? '前一天' : 'Previous Day'}
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            const d = new Date(`${currentFileDate}T00:00:00Z`);
                            d.setUTCDate(d.getUTCDate() + 1);
                            const nextDate = d.toISOString().split('T')[0];
                            if (nextDate <= getTodayStr()) {
                              setCurrentFileDate(nextDate);
                            } else {
                              showToast(language === 'zh' ? '已经是最新一天' : 'Already on latest day', 'info');
                            }
                          }}
                          disabled={currentFileDate >= getTodayStr()}
                          className="p-1.5 text-text-muted hover:text-text-main hover:bg-surface rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={language === 'zh' ? '后一天' : 'Next Day'}
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                      <h1 className="text-xl font-sans font-medium text-text-heading tracking-tight flex items-baseline gap-2">
                        <span>{new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${currentFileDate}T00:00:00Z`))}{language === 'zh' ? '' : ','}</span>
                        <span className="text-text-muted">
                          {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${currentFileDate}T00:00:00Z`))}
                        </span>
                      </h1>
                      {currentFileDate === getTodayStr() && (
                      <button
                        onClick={handleManualRollover}
                        title={language === 'zh' ? '手动迁移历史未完成任务' : 'Migrate unfinished tasks from past'}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs  font-bold text-text-muted hover:text-accent hover:bg-accent/10 border border-border/50 hover:border-accent/30 transition-all"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {language === 'zh' ? '迁移' : 'Rollover'}
                      </button>
                      )}
                    </div>
                    {categories.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSelectedCategory(null)}
                          className={`px-3 py-1.5 rounded text-xs  font-bold transition-all ${
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
                            className={`px-3 py-1.5 rounded text-xs  font-bold transition-all ${
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

                  {/* Auto-rollover Banner */}
                  {rolloverBanner && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-md bg-stone-50 border border-stone-200 text-stone-700 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <CornerUpRight className="w-4 h-4 shrink-0" />
                        <span className="font-medium">
                          {language === 'zh'
                            ? `已从 ${rolloverBanner.fromDate} 迁移 ${rolloverBanner.count} 个未完成任务`
                            : `Migrated ${rolloverBanner.count} unfinished tasks from ${rolloverBanner.fromDate}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { setRolloverBanner(null); handleManualRollover(); }}
                          className="text-xs  font-bold text-stone-600 hover:text-stone-800 hover:underline"
                        >
                          {language === 'zh' ? '查看详情' : 'Details'}
                        </button>
                        <button onClick={() => setRolloverBanner(null)} className="text-stone-400 hover:text-stone-700">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  )}


                  {/* FAB: Add Task */}
                  {!showTaskInput && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setShowTaskInput(true)}
                      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded bg-accent text-white shadow-sm hover:shadow-sm flex items-center justify-center transition-shadow"
                      title={language === 'zh' ? '添加任务 (Cmd+N)' : 'Add Task (Cmd+N)'}
                    >
                      <Plus className="w-6 h-6" />
                    </motion.button>
                  )}

                  {/* Task Input Panel */}
                  <TaskInputPanel
                    showTaskInput={showTaskInput}
                    setShowTaskInput={setShowTaskInput}
                    showBrainDump={showBrainDump}
                    setShowBrainDump={setShowBrainDump}
                    language={language}
                    newTaskTitle={newTaskTitle}
                    setNewTaskTitle={setNewTaskTitle}
                    newTaskTagsList={newTaskTagsList}
                    setNewTaskTagsList={setNewTaskTagsList}
                    tagInputValue={tagInputValue}
                    setTagInputValue={setTagInputValue}
                    newTaskDeadline={newTaskDeadline}
                    setNewTaskDeadline={setNewTaskDeadline}
                    brainDumpText={brainDumpText}
                    setBrainDumpText={setBrainDumpText}
                    isProcessingBrainDump={isProcessingBrainDump}
                    processBrainDump={processBrainDump}
                    currentFileDate={currentFileDate}
                    activeContext={activeContext}
                    categories={categories}
                    systemTags={systemTags}
                    setTasks={setTasks}
                    setMarkdown={setMarkdown}
                    setLastSyncedMD={setLastSyncedMD}
                    setFilesMap={setFilesMap}
                    showToast={showToast}
                  />
                  {categories.map(category => {
                    if (selectedCategory && selectedCategory !== category) return null;
                    const catTasks = todayTasks.filter(t => {
                      const taskCategories = (t.tags || []).filter(tag => !systemTags.includes(tag));
                      return taskCategories[0] === category;
                    });

                    const pendingCatTasks = catTasks.filter(t => t.status !== 'done');
                    const doneCatTasks = catTasks.filter(t => t.status === 'done');
                    if (pendingCatTasks.length === 0 && doneCatTasks.length === 0) return null;

                    const showDone = showDoneByCategory[category] ?? false;

                    return (
                      <div key={category} className="space-y-5">
                        <h2 className="font-sans text-xs  text-text-muted font-bold flex items-center space-x-3 mt-8 mb-4">
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
                                linkedNotesCount={taskLinkedNotesCount[task.id] || 0}
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
                              className="flex items-center gap-1.5 text-xs  font-bold text-text-muted hover:text-text-main transition-colors"
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
                                      linkedNotesCount={taskLinkedNotesCount[task.id] || 0}
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
                    const uncategorized = todayTasks.filter(t => {
                      const taskCategories = (t.tags || []).filter(tag => !systemTags.includes(tag));
                      return taskCategories.length === 0;
                    });
                    if (uncategorized.length === 0) return null;
                    if (selectedCategory) return null;
                    const pending = uncategorized.filter(t => t.status !== 'done');
                    const done = uncategorized.filter(t => t.status === 'done');
                    const showDone = showDoneByCategory['__uncategorized__'] ?? false;
                    return (
                      <div className="space-y-5">
                        <h2 className="font-sans text-xs  text-text-muted font-bold flex items-center space-x-3 mt-8 mb-4">
                          <span>{language === 'zh' ? '收集箱' : 'Inbox'}</span>
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
                                linkedNotesCount={taskLinkedNotesCount[task.id] || 0}
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
                              className="flex items-center gap-1.5 text-xs  font-bold text-text-muted hover:text-text-main transition-colors"
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
                                      linkedNotesCount={taskLinkedNotesCount[task.id] || 0}
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

                  {/* 已迁移任务区域 */}
                  {(() => {
                    const migratedTasks = contextFilteredTasks.filter(t => t.status === 'migrated');
                    if (migratedTasks.length === 0) return null;
                    const showMigrated = showDoneByCategory['__migrated__'] ?? false;
                    return (
                      <div className="space-y-3 mt-8">
                        <button
                          onClick={() => setShowDoneByCategory(prev => ({ ...prev, '__migrated__': !prev['__migrated__'] }))}
                          className="flex items-center gap-1.5 text-xs  font-bold text-text-muted hover:text-text-main transition-colors"
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showMigrated ? 'rotate-180' : ''}`} />
                          <CornerUpRight className="w-3 h-3" />
                          {language === 'zh' ? `已迁移 (${migratedTasks.length})` : `Migrated (${migratedTasks.length})`}
                        </button>
                        {showMigrated && (
                          <p className="text-[11px] text-text-muted/70 pl-5 -mt-1">
                            {language === 'zh' ? '这些任务已被迁移到更新的日期' : 'These tasks were moved to a newer date'}
                          </p>
                        )}
                        <AnimatePresence>
                          {showMigrated && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-3 overflow-hidden">
                              {migratedTasks.map(task => (
                                <div key={task.id} className="flex items-center gap-3 px-4 py-3 rounded-md bg-background border border-border/30 opacity-50">
                                  <CornerUpRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                                  <span className="text-sm text-text-muted line-through flex-1 truncate">{task.title}</span>
                                  {task.source_date && (
                                    <button
                                      onClick={() => setCurrentFileDate(task.source_date!)}
                                      className="text-xs text-accent hover:underline shrink-0"
                                    >
                                      {language === 'zh' ? `查看 ${task.source_date}` : `View ${task.source_date}`}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })()}

                  {/* Daily Tasks */}
                  <DailyNoteCards
                    notes={filterNotesByContext(dailyNotes, activeContext)}
                    language={language}
                    activeContext={activeContext}
                    onViewAll={() => setActiveTab('notes')}
                  />

                </motion.div>
              ) : activeTab === 'ai' ? (
                <motion.div
                  key="ai-features"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="h-full"
                >
                  <PromptLibrary
                    language={language}
                    activeAiConfigId={activeAiConfigId}
                    onAiConfigChange={(id) => setActiveAiConfigId(id)}
                  />
                </motion.div>
              ) : (
                <Notes
                  activeContext={activeContext}
                  language={language}
                  aiProvider={aiProvider}
                  aiApiKey={aiApiKey}
                  aiModel={aiModel}
                  aiBaseUrl={aiBaseUrl}
                />
              )
            )}
          </div>
        </div>
        </>
       </main>

      <SettingsModal
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        language={language}
        configTab={configTab}
        setConfigTab={setConfigTab}
        workspaceRoot={workspaceRoot}
        setWorkspaceRoot={setWorkspaceRoot}
        setLanguage={setLanguage}
        aiProvider={aiProvider}
        setAiProvider={setAiProvider}
        aiApiKey={aiApiKey}
        setAiApiKey={setAiApiKey}
        aiModel={aiModel}
        setAiModel={setAiModel}
        aiBaseUrl={aiBaseUrl}
        setAiBaseUrl={setAiBaseUrl}
        aiFormat={aiFormat}
        setAiFormat={setAiFormat}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        aiVerifyStatus={aiVerifyStatus}
        setAiVerifyStatus={setAiVerifyStatus}
        aiVerifyMsg={aiVerifyMsg}
        setAiVerifyMsg={setAiVerifyMsg}
        syncInterval={syncInterval}
        setSyncInterval={setSyncInterval}
        githubRepoInput={githubRepoInput}
        setGithubRepoInput={setGithubRepoInput}
        githubToken={githubToken}
        setGithubToken={setGithubToken}
        showGithubToken={showGithubToken}
        setShowGithubToken={setShowGithubToken}
        githubVerifyStatus={githubVerifyStatus}
        setGithubVerifyStatus={setGithubVerifyStatus}
        githubVerifyMsg={githubVerifyMsg}
        setGithubVerifyMsg={setGithubVerifyMsg}
        setGithubRepo={setGithubRepo}
        setGithubConnected={setGithubConnected}
        setFilesMap={setFilesMap}
        setTasks={setTasks}
        setMarkdown={setMarkdown}
        setLastSyncedMD={setLastSyncedMD}
        currentFileDate={currentFileDate}
        verifyGithubConnection={verifyGithubConnection}
        filesApi={filesApi}
      />


       {/* Quick Note Editor */}
       {showQuickNoteEditor && (
         <div className="fixed inset-0 z-50 bg-background">
           <NoteEditor
             language={language}
             activeContext={activeContext}
             availableTasks={tasks.map(t => ({ id: t.id, title: t.title }))}
             availableTags={[]}
             onSave={async (data) => {
               try {
                 await notesApi.create(data);
                 setShowQuickNoteEditor(false);
                 // Refresh daily notes if the note is for today
                 if (data.date === currentFileDate) {
                   const dateNotes = await notesApi.getByDate(currentFileDate);
                   setDailyNotes(dateNotes);
                 }
                 showToast(language === 'zh' ? '笔记已保存' : 'Note saved', 'success');
               } catch (err) {
                 console.error('Failed to save note:', err);
                 showToast(language === 'zh' ? '保存失败' : 'Failed to save note', 'error');
               }
             }}
             onClose={() => setShowQuickNoteEditor(false)}
           />
         </div>
       )}
     </div>
  );
}

