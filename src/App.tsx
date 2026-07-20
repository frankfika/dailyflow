/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Check, CornerUpRight, Briefcase, Calendar, AlignLeft, Trash2, Edit2, Settings, Sparkles, Loader2, ChevronDown, ChevronRight, ChevronLeft, X, Plus, Menu, AlertCircle, Eye, EyeOff, RefreshCw, Search, Download } from 'lucide-react';
import { filesApi, tasksApi, rolloverApi, configApi, notesApi, aiApi, recurringApi, workspacesApi } from './api/client';
import type { Workspace } from './api/client';
import { API_BASE } from './config/api';
import { getActiveAiConfig } from './types/models';
import { getTodayStr } from './utils/tagColors';
import { TaskCard } from './components/TaskCard';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { MeetingCapture } from './components/MeetingCapture';
import { RolloverPreviewModal } from './components/RolloverPreviewModal';
import { TaskInputPanel } from './components/TaskInputPanel';
import { WorkspaceSetup } from './components/WorkspaceSetup';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
import { ContextSwitcher } from './components/ContextSwitcher';
import { Notes } from './components/Notes';
import { AIChat } from './components/AIChat';
import { DailyNoteCards } from './components/DailyNoteCards';
import { TodayBacklog } from './components/TodayBacklog';
import { NoteEditor } from './components/NoteEditor';
import { Capsules } from './components/Capsules';
import { UpdateNotificationModal } from './components/UpdateNotificationModal';
import type { NoteData } from './api/client';
import { checkForUpdates, downloadUpdate, relaunchApp, type UpdateInfo } from './api/updater';
import { filterTasksByContext, filterNotesByContext } from './utils/contextFilter';
import { useMeetingCapture } from './hooks/useMeetingCapture';

type Task = {
  id: string;
  title: string;
  description?: string;
  /** Legacy single comment. New code uses `comments`. */
  comment?: string;
  /** Timestamped inline comments (rendered as `> [ts] text` under the task). */
  comments?: { text: string; timestamp: string }[];
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
};

async function verifyGithubConnection(repoUrl: string, token: string): Promise<boolean> {
  if (!repoUrl || !token) return false;
  try {
    const repoPath = repoUrl
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '');
    const [owner, repo] = repoPath.split('/');
    if (!owner || !repo) return false;
    const response = await fetch(`${API_BASE.github}/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default function App() {
  const todayStr = getTodayStr();
  const [currentFileDate, setCurrentFileDate] = useState(todayStr);
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [markdown, setMarkdown] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyNotes, setDailyNotes] = useState<NoteData[]>([]);
  // All notes for the current context, used by AI chat/floating panel so they
  // can find and reference notes beyond just the currently selected date.
  const [contextNotes, setContextNotes] = useState<NoteData[]>([]);
  const [showQuickNoteEditor, setShowQuickNoteEditor] = useState(false);
  const [quickNoteDefaultType, setQuickNoteDefaultType] = useState<NoteData['type'] | undefined>(undefined);
  const [isNoteEditorMaximized, setIsNoteEditorMaximized] = useState(false);
  const [editingDailyNote, setEditingDailyNote] = useState<NoteData | null>(null);
  const [prefillLinkedTaskId, setPrefillLinkedTaskId] = useState<string | null>(null);
  const [notesFilterByTaskId, setNotesFilterByTaskId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState<{ text: string; key: string; sourceTitle?: string; contextText?: string; contextLabel?: string; noteId?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'today' | 'notes' | 'ai-chat' | 'capsules'>('today');
  const [focusTaskIds, setFocusTaskIds] = useState<string[]>([]);
  // Phase 2 M1: ⌘⇧R global shortcut opens the meeting capture modal. The
  // modal lives at the App level so it can be opened from any tab, not just
  // the AI Chat tab. AIChat's "会议" button calls `openMeetingCapture` below
  // to trigger it. (The hint state and ⌘⇧R listener live in useMeetingCapture.)

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
  const [, setIsSyncing] = useState(false);
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

  const [showRolloverPreview, setShowRolloverPreview] = useState(false);
  const [rolloverPreview, setRolloverPreview] = useState<{ tasksToMigrate: any[]; fromDate: string } | null>(null);
  const [isRollingOver, setIsRollingOver] = useState(false);

  const [lastAddedCategory, setLastAddedCategory] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const [syncInterval, setSyncInterval] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [showWorkspaceSetup, setShowWorkspaceSetup] = useState(false);
  const [showDoneByCategory, setShowDoneByCategory] = useState<Record<string, boolean>>({});
  const [hideDoneTasks, setHideDoneTasks] = useState(false);
  const [completionPromptTaskIds, setCompletionPromptTaskIds] = useState<Set<string>>(new Set());
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [githubRepoInput, setGithubRepoInput] = useState<string>('');
  const [githubToken, setGithubToken] = useState<string>('');
  const [showGithubToken, setShowGithubToken] = useState<boolean>(false);
  const [githubVerifyStatus, setGithubVerifyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [githubVerifyMsg, setGithubVerifyMsg] = useState<string>('');
  const [, setGithubConnected] = useState(false);
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [aiModel, setAiModel] = useState<string>('');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>('');
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const [configTab, setConfigTab] = useState<'general' | 'sync' | 'about'>('general');
  const [rolloverTrigger, setRolloverTrigger] = useState<'manual' | 'on_app_open'>('manual');
  const [activeContext, setActiveContext] = useState<'work' | 'life'>('work');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [ipfsEnabled, setIpfsEnabled] = useState<boolean>(false);
  const [ipfsApiKey, setIpfsApiKey] = useState<string>('');
  const [ipfsGateway, setIpfsGateway] = useState<string>('');
  const markdownRef = React.useRef(markdown);

  const focusStorageKey = `df_focus_${activeWorkspaceId || 'default'}_${activeContext}_${currentFileDate}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(focusStorageKey);
      setFocusTaskIds(saved ? JSON.parse(saved) : []);
    } catch {
      setFocusTaskIds([]);
    }
  }, [focusStorageKey]);

  useEffect(() => {
    setSelectedCategory(null);
  }, [currentFileDate, activeContext]);

  const updateFocusTaskIds = useCallback((ids: string[]) => {
    const next = ids.slice(0, 3);
    setFocusTaskIds(next);
    try {
      localStorage.setItem(focusStorageKey, JSON.stringify(next));
    } catch {
      // Local focus planning is a progressive enhancement.
    }
  }, [focusStorageKey]);

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
        setWorkspaceRoot(config.workspaceRoot || '');
        setWorkspaces(config.workspaces || []);
        setActiveWorkspaceId(config.activeWorkspaceId || '');
        setActiveContext(config.activeContext === 'life' ? 'life' : 'work');
        setRolloverTrigger(config.rolloverTrigger || 'manual');
        setIpfsEnabled(Boolean(config.ipfsEnabled));
        setIpfsApiKey(config.ipfsApiKey || '');
        setIpfsGateway(config.ipfsGateway || '');

        // AI: read from ModelLibrary store first; fall back to providerConfigs in backend config
        const active = getActiveAiConfig();
        if (active) {
          setAiApiKey(active.apiKey);
          setAiModel(active.model);
          setAiBaseUrl(active.baseUrl);
        } else if (config.providerConfigs) {
          try {
            const store = JSON.parse(config.providerConfigs);
            localStorage.setItem('df_provider_configs', JSON.stringify(store));
            const activeCfg = store.configs?.find((c: any) => c.id === store.activeId);
            if (activeCfg) {
              setAiApiKey(activeCfg.apiKey || '');
              setAiModel(activeCfg.model || '');
              setAiBaseUrl(activeCfg.baseUrl || '');
            }
            window.dispatchEvent(new CustomEvent('df:provider-changed'));
          } catch { /* ignore */ }
        } else {
          setAiApiKey('');
          setAiModel('');
          setAiBaseUrl('');
        }

        // Restore last opened date for the active workspace
        if (config.activeWorkspaceId) {
          try {
            const lastDate = localStorage.getItem(`df_last_date_${config.activeWorkspaceId}`);
            if (lastDate) setCurrentFileDate(lastDate);
          } catch { /* ignore */ }
        }

      } catch (e) {
        // ignore
      }
    };
    checkFirstRun();
    loadConfigData();
  }, []);

  // Restore display settings (font size, weight, family) from localStorage
  useEffect(() => {
    try {
      const textScale = localStorage.getItem('df_text_scale');
      if (textScale !== null) {
        const val = parseInt(textScale, 10);
        document.documentElement.style.setProperty('--text-scale', (0.8 + val * 0.04).toString());
      }
      const fontWeight = localStorage.getItem('df_font_weight');
      if (fontWeight !== null) {
        const weights = [400, 500, 600];
        document.documentElement.style.setProperty('--font-weight-base', weights[parseInt(fontWeight, 10)].toString());
      }
      const selectedFont = localStorage.getItem('df_selected_font');
      if (selectedFont) {
        const fonts: Record<string, string> = {
          system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          inter: '"Inter", "Noto Sans SC", -apple-system, sans-serif',
          serif: '"Georgia", "Noto Serif SC", serif',
        };
        if (fonts[selectedFont]) {
          document.documentElement.style.setProperty('--font-sans', fonts[selectedFont]);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Sync AI state with ModelLibrary's active provider whenever it changes
  useEffect(() => {
    const sync = () => {
      const active = getActiveAiConfig();
      if (!active) return;
      setAiApiKey(active.apiKey);
      setAiModel(active.model);
      setAiBaseUrl(active.baseUrl);
    };
    window.addEventListener('df:provider-changed', sync);
    return () => window.removeEventListener('df:provider-changed', sync);
  }, []);

  // Auto-check for updates on app start (silently, only for Settings badge)
  useEffect(() => {
    const autoCheckUpdate = async () => {
      try {
        const info = await checkForUpdates();
        setUpdateAvailable(info.hasUpdate);
        if (info.hasUpdate) {
          setUpdateInfo(info);
          // Check if this version was skipped
          const skippedVersion = localStorage.getItem('dailyflow_skipped_version');
          if (skippedVersion !== info.latestVersion) {
            // Show modal only if not skipped
            setShowUpdateModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to auto-check for updates:', error);
      }
    };
    const timer = setTimeout(autoCheckUpdate, 3000);
    return () => clearTimeout(timer);
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
      // Auto rollover: only when loading today's date
      if (date === getTodayStr()) {
        try {
          await recurringApi.instantiate(date);
        } catch (e) {
          console.error('Recurring instantiation failed', e);
        }
        try {
          await rolloverApi.apply(date, activeContext);
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

  // Remember the last opened date per workspace
  useEffect(() => {
    if (!activeWorkspaceId) return;
    try {
      localStorage.setItem(`df_last_date_${activeWorkspaceId}`, currentFileDate);
    } catch { /* ignore */ }
  }, [activeWorkspaceId, currentFileDate]);

  const reloadFileList = useCallback(async () => {
    try {
      const files = await filesApi.list();
      const map: Record<string, string> = {};
      await Promise.allSettled(
        files.map(async (f) => {
          const data = await filesApi.get(f);
          if (data) map[f] = data.content;
        })
      );
      setFilesMap(map);
    } catch (e) {
      console.error('Failed to reload file list', e);
    }
  }, []);

  const loadContextNotes = useCallback(async () => {
    try {
      const data = await notesApi.getAll({ context: activeContext });
      setContextNotes(data);
    } catch (e) {
      console.error('Failed to load context notes:', e);
    }
  }, [activeContext]);

  // Load all notes for the current context whenever the context changes or the
  // user opens the AI chat tab, so the chat can reference any note.
  useEffect(() => {
    loadContextNotes();
  }, [activeContext, loadContextNotes]);

  useEffect(() => {
    if (activeTab === 'ai-chat') {
      loadContextNotes();
    }
  }, [activeTab, loadContextNotes]);

  const handleSwitchWorkspace = useCallback(async (id: string) => {
    if (id === activeWorkspaceId) return;
    setIsSwitchingWorkspace(true);
    try {
      const ws = await workspacesApi.activate(id);
      setActiveWorkspaceId(id);
      setWorkspaceRoot(ws.path);

      // Reset state for new workspace
      setMarkdown('');
      setLastSyncedMD('');
      setTasks([]);
      setDailyNotes([]);
      setFilesMap({});
      // Restore last date for this workspace, fallback to today
      let nextDate = getTodayStr();
      try {
        const saved = localStorage.getItem(`df_last_date_${id}`);
        if (saved) nextDate = saved;
      } catch { /* ignore */ }

      await reloadFileList();
      setCurrentFileDate(nextDate);

      showToast(
        language === 'zh' ? `已切换到 ${ws.name}` : `Switched to ${ws.name}`,
        'success'
      );

    } catch (e: any) {
      showToast(
        e.message || (language === 'zh' ? '切换笔记本失败' : 'Failed to switch workspace'),
        'error'
      );
    } finally {
      setIsSwitchingWorkspace(false);
    }
  }, [activeWorkspaceId, language, reloadFileList]);

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

  // Keyboard shortcuts: Cmd/Ctrl+N to toggle task input, ⌘⇧R to open
  // Meeting Capture (Granola Phase 2), Escape to close. The ⌘⇧R handler
  // + first-use hint live in `useMeetingCapture` so this body stays focused
  // on the App-level shortcuts.
  const { isOpen: showMeetingCapture, open: openMeetingCapture, close: closeMeetingCapture } = useMeetingCapture({ language, showToast });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setShowTaskInput(prev => !prev);
        return;
      }
      if (e.key === 'Escape') {
        setShowTaskInput(false);
        setShowBrainDump(false);
        // Don't auto-close the meeting modal on Escape — its own component
        // handles Esc (and refuses to close mid-recording).
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [language, showToast]);

  const processBrainDump = async () => {
    if (!brainDumpText.trim()) return;
    setIsProcessingBrainDump(true);
    try {
      if (!aiApiKey || !aiBaseUrl) {
        throw new Error('AI provider not configured');
      }

      const { summary: content } = await aiApi.summarize({
        apiKey: aiApiKey,
        model: aiModel || undefined,
        baseUrl: aiBaseUrl,
        systemPrompt: 'You are a task extraction assistant. Output ONLY a valid JSON array of tasks. Each task object must have: title (string), tags (string array), project (string, optional), deadline (YYYY-MM-DD string, optional), priority ("high"|"medium"|"low", optional). Do not include any markdown formatting or explanation outside the JSON.',
        userPrompt: `Extract a list of actionable tasks from the following text. Return ONLY a JSON array:\n\n"${brainDumpText}"`,
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
    const wasUndone = task.status !== 'done';
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
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
        // Prompt for completion comment when task is newly done and has no comment yet
        // (check both legacy single `comment` and the timestamped `comments` list).
        const hasAnyComment = !!task.comment || !!(task.comments && task.comments.length > 0);
        if (wasUndone && !hasAnyComment) {
          const suppressed = (() => {
            try { return sessionStorage.getItem('df_suppress_completion_comments') === '1'; } catch { return false; }
          })();
          if (!suppressed) {
            setCompletionPromptTaskIds(prev => new Set(prev).add(id));
          }
        }
        return;
      } catch (e) {
        lastError = e;
        // 404 / 漂移：重试前先同步一次
        try {
          const data = await filesApi.get(currentFileDate);
          if (data) {
            setMarkdown(data.content);
            setTasks(data.tasks as Task[]);
            setLastSyncedMD(data.content);
            setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
          }
        } catch {}
        if (attempt < 2) {
          await sleep(150);
          continue;
        }
      }
    }
    console.error('Failed to toggle task', lastError);
    showToast(language === 'zh' ? '切换失败，请重试' : 'Toggle failed — please retry', 'error');
  };

  const handleEditTask = async (
    id: string,
    updates: {
      title?: string;
      description?: string;
      comment?: string;
      comments?: { text: string; timestamp: string }[];
      tags?: string[];
      deadline?: string;
      priority?: 'high' | 'medium' | 'low';
      project?: string;
    }
  ) => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await tasksApi.edit(id, currentFileDate, updates);
        // 成功后重新拉取最新 markdown，避免和别人的并发编辑漂移
        const data = await filesApi.get(currentFileDate);
        if (data) {
          setMarkdown(data.content);
          setTasks(data.tasks as Task[]);
          setLastSyncedMD(data.content);
          setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
        }
        showToast(language === 'zh' ? '任务已更新' : 'Task updated', 'success');
        return;
      } catch (e: any) {
        lastError = e;
        // 404 通常意味着 task id 已失效（文件被外部重写），重试前先同步一次
        if (e?.status === 404) {
          try {
            const data = await filesApi.get(currentFileDate);
            if (data) {
              setMarkdown(data.content);
              setTasks(data.tasks as Task[]);
              setLastSyncedMD(data.content);
              setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
            }
          } catch {}
        }
        if (attempt < 2) {
          await sleep(150);
          continue;
        }
      }
    }
    console.error('Failed to edit task', lastError);
    // 最后再同步一次，保证 UI 不显示过期状态
    try {
      const data = await filesApi.get(currentFileDate);
      if (data) {
        setMarkdown(data.content);
        setTasks(data.tasks as Task[]);
        setLastSyncedMD(data.content);
        setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
      }
    } catch {}
    showToast(language === 'zh' ? '更新失败，请重试' : 'Failed to update task — please retry', 'error');
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
      const preview = await rolloverApi.preview(currentFileDate, activeContext);
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
      const result = await rolloverApi.apply(currentFileDate, activeContext);
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
  const backlogTasks = todayTasks.filter(t => !focusTaskIds.includes(t.id));
  const systemTags = ['work', 'life', 'delayed', 'tasks'];
  const categories = Array.from(new Set(todayTasks.flatMap(t => (t.tags || []).filter(tag => !systemTags.includes(tag)))));
  if (lastAddedCategory && categories.includes(lastAddedCategory)) {
    const idx = categories.indexOf(lastAddedCategory);
    categories.splice(idx, 1);
    categories.unshift(lastAddedCategory);
  }

  const handleGenerateDailyPlan = async (brief: string): Promise<{ taskIds: string[]; summary: string }> => {
    if (!aiApiKey || !aiBaseUrl) {
      throw new Error('AI provider not configured');
    }
    const openTasks = todayTasks
      .filter(task => task.status !== 'done')
      .map(task => ({
        id: task.id,
        title: task.title,
        priority: task.priority || null,
        deadline: task.deadline || null,
        sourceDate: task.source_date || null,
        tags: (task.tags || []).filter(tag => !systemTags.includes(tag)),
      }))
      .slice(0, 60);
    if (openTasks.length === 0) {
      throw new Error('No open tasks');
    }

    const outputLanguage = language === 'zh' ? 'Simplified Chinese' : 'English';
    const { summary: raw } = await aiApi.summarize({
      apiKey: aiApiKey,
      model: aiModel || undefined,
      baseUrl: aiBaseUrl,
      maxTokens: 800,
      systemPrompt: [
        'You are the planning intelligence inside a daily focus product.',
        'Choose at most 3 tasks that make a realistic, coherent day.',
        'Respect the user brief above raw urgency. Prefer meaningful progress over clearing the oldest debt.',
        'Use only exact task ids from the supplied list.',
        `Write the summary in ${outputLanguage}, in one concise sentence explaining the tradeoff.`,
        'Return ONLY JSON: {"taskIds":["id"],"summary":"why these, what can wait"}.',
      ].join(' '),
      userPrompt: JSON.stringify({
        date: currentFileDate,
        context: activeContext,
        userBrief: brief || (language === 'zh' ? '没有额外限制，请给我一个现实可完成的计划。' : 'No extra constraints. Build a realistic plan.'),
        openTasks,
      }),
    });

    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    const parsed = JSON.parse(start >= 0 && end >= start ? jsonText.slice(start, end + 1) : jsonText);
    const proposedIds: unknown[] = Array.isArray(parsed.taskIds) ? parsed.taskIds : [];
    const validIds: string[] = Array.from(new Set(
      proposedIds.filter((id): id is string => typeof id === 'string' && openTasks.some(task => task.id === id)),
    )).slice(0, 3);
    if (validIds.length === 0) throw new Error('AI returned no valid task ids');
    return {
      taskIds: validIds,
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : (language === 'zh' ? '这是今天最现实的一组推进组合，其余事项可以等待。' : 'This is the most realistic combination for today; the rest can wait.'),
    };
  };

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

  // Handle update actions
  const handleUpdate = async (onProgress: (downloaded: number, total: number) => void) => {
    try {
      await downloadUpdate(onProgress);
      await relaunchApp();
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Update failed. Please try again.', 'error');
      throw error;
    }
  };

  const handleSkipVersion = () => {
    if (updateInfo?.latestVersion) {
      localStorage.setItem('dailyflow_skipped_version', updateInfo.latestVersion);
    }
    setShowUpdateModal(false);
  };

  const handleCloseUpdateModal = () => {
    setShowUpdateModal(false);
  };

  // Show workspace setup if first run
  if (showWorkspaceSetup) {
    return <WorkspaceSetup onComplete={handleWorkspaceSetupComplete} language={language} />;
  }

  return (
    <div
      className="h-screen w-full flex overflow-hidden text-text-main relative transition-colors duration-700 bg-transparent"
    >
      <div className="ambient-bg" aria-hidden="true" />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1.0] }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl text-[13px] font-medium pointer-events-none flex items-center gap-2.5 native-toast ${
              toast.type === 'error' ? 'text-[var(--color-danger)]' :
              toast.type === 'info' ? 'text-[var(--color-info)]' :
              'text-[var(--color-success)]'
            }`}
          >
            {toast.type === 'success' && <Check className="w-4 h-4" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
            <span className="text-text-main">{toast.message}</span>
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
        workspaceSwitcher={
          workspaces.length > 0 ? (
            <WorkspaceSwitcher
              language={language}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onActivate={handleSwitchWorkspace}
              onAdded={ws => setWorkspaces(prev => [...prev, ws])}
              onRenamed={(id, name) => setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w))}
              onRemoved={(id, nextActive) => {
                setWorkspaces(prev => prev.filter(w => w.id !== id));
                if (!nextActive) {
                  // Last workspace removed — fall back to first-run setup.
                  setActiveWorkspaceId('');
                  setWorkspaceRoot('');
                  setIsFirstRun(true);
                  setShowWorkspaceSetup(true);
                } else if (id === activeWorkspaceId) {
                  handleSwitchWorkspace(nextActive);
                }
              }}
              showToast={showToast}
            />
          ) : null
        }
        activeContext={activeContext}
        onContextChange={setActiveContext}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen bg-background/40 backdrop-blur-3xl relative overflow-hidden min-w-0 w-full transition-colors duration-700">
        {/* Floating toggle button — show sidebar when hidden (Codex style) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-3.5 left-3.5 z-20 p-2 rounded-lg text-text-muted hover:text-text-heading hover:bg-black/5 transition-all active:scale-95"
            title={language === 'zh' ? '显示侧边栏' : 'Show sidebar'}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className={`flex-1 w-full min-h-0 ${activeTab === 'ai-chat' || activeTab === 'capsules' ? 'overflow-hidden' : 'overflow-y-auto p-4 md:p-8 lg:p-12 pb-32'}`}>
          <div className={activeTab === 'ai-chat' || activeTab === 'capsules' ? 'w-full h-full' : 'max-w-3xl mx-auto w-full'}>
            {/* Loading state */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="empty-state-icon p-3">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                </div>
                <span className="font-sans text-sm text-text-muted">{language === 'zh' ? '加载中...' : 'Loading...'}</span>
              </div>
            )}
            {/* Error state */}
            {!isLoading && loadError && (
              <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
                <div className="empty-state-icon p-4">
                  <AlertCircle className="w-7 h-7 text-text-muted/60" />
                </div>
                <p className="font-sans text-sm text-text-muted">{loadError}</p>
                <button
                  onClick={() => loadTasksForDate(currentFileDate)}
                  className="mt-2 px-4 py-2 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 transition-colors shadow-sm"
                >
                  {language === 'zh' ? '重试' : 'Retry'}
                </button>
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
                  <div className="mb-8 border-b border-border/60 pb-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-0.5 mr-2 p-0.5 rounded-lg bg-surface/60 border border-border/60">
                        <button
                          onClick={() => {
                            const d = new Date(`${currentFileDate}T00:00:00Z`);
                            d.setUTCDate(d.getUTCDate() - 1);
                            setCurrentFileDate(d.toISOString().split('T')[0]);
                          }}
                          className="p-1.5 text-text-muted hover:text-text-heading hover:bg-black/5 rounded-md transition-all active:scale-95"
                          title={language === 'zh' ? '前一天' : 'Previous Day'}
                        >
                          <ChevronLeft className="w-4 h-4" />
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
                          className="p-1.5 text-text-muted hover:text-text-heading hover:bg-black/5 rounded-md transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={language === 'zh' ? '后一天' : 'Next Day'}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                      <h1 className="text-xl font-sans font-semibold text-text-heading tracking-tight flex items-baseline gap-2">
                        <span>{new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${currentFileDate}T00:00:00Z`))}{language === 'zh' ? '' : ','}</span>
                        <span className="text-text-muted font-normal">
                          {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${currentFileDate}T00:00:00Z`))}
                        </span>
                      </h1>
                      {currentFileDate === getTodayStr() && (
                      <button
                        onClick={handleManualRollover}
                        title={language === 'zh' ? '回顾并处理历史未完成事项' : 'Review unfinished items from earlier days'}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-muted hover:text-accent hover:bg-accent/10 border border-border/60 hover:border-accent/20 transition-all active:scale-95"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {language === 'zh' ? '整理遗留' : 'Review leftovers'}
                      </button>
                      )}
                      {currentFileDate !== getTodayStr() && (
                      <button
                        onClick={() => setCurrentFileDate(getTodayStr())}
                        title={language === 'zh' ? '回到今天' : 'Go to today'}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-accent hover:text-accent hover:bg-accent/10 border border-accent/20 transition-all active:scale-95"
                      >
                        <Calendar className="w-3 h-3" />
                        {language === 'zh' ? '今天' : 'Today'}
                      </button>
                      )}
                    </div>
                    {categories.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSelectedCategory(null)}
                          className={`category-chip px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            selectedCategory === null
                              ? 'bg-text-heading text-white shadow-sm'
                              : 'bg-surface text-text-muted hover:text-text-heading border border-border/60'
                          }`}
                        >
                          {language === 'zh' ? '全部' : 'All'}
                        </button>
                        {categories.map(c => (
                          <button
                            key={c}
                            onClick={() => setSelectedCategory(selectedCategory === c ? null : c)}
                            className={`category-chip px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              selectedCategory === c
                                ? 'bg-accent text-white shadow-sm'
                                : 'bg-surface text-text-muted hover:text-text-heading border border-border/60'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <TodayBacklog
                    tasks={todayTasks}
                    focusTaskIds={focusTaskIds}
                    onFocusTaskIdsChange={updateFocusTaskIds}
                    onToggleTask={handleToggleTask}
                    onEditTask={handleEditTask}
                    onDeleteTask={handleDeleteTask}
                    onCreateLinkedNote={(taskId) => {
                      setEditingDailyNote(null);
                      setPrefillLinkedTaskId(taskId);
                      setShowQuickNoteEditor(true);
                    }}
                    onShowLinkedNotes={(taskId) => {
                      setNotesFilterByTaskId(taskId);
                      setActiveTab('notes');
                    }}
                    linkedNotesCount={(taskId) => taskLinkedNotesCount[taskId] || 0}
                    onAddTask={() => setShowTaskInput(true)}
                    language={language}
                    isToday={currentFileDate === getTodayStr()}
                    aiAvailable={Boolean(aiApiKey && aiBaseUrl)}
                    onGenerateAIPlan={handleGenerateDailyPlan}
                    onConfigureAI={() => setActiveTab('ai-chat')}
                  />

                  {/* Today's Notes */}
                  <DailyNoteCards
                    notes={filterNotesByContext(dailyNotes, activeContext)}
                    language={language}
                    activeContext={activeContext}
                    onViewAll={() => setActiveTab('notes')}
                    onAddNote={() => { setEditingDailyNote(null); setQuickNoteDefaultType(undefined); setShowQuickNoteEditor(true); }}
                    onAddMeetingNote={() => { setEditingDailyNote(null); setQuickNoteDefaultType('meeting_note'); setShowQuickNoteEditor(true); }}
                    onNoteClick={(n) => { setEditingDailyNote(n); setQuickNoteDefaultType(undefined); setShowQuickNoteEditor(true); }}
                  />

                </motion.div>
              ) : activeTab === 'ai-chat' ? (
                <motion.div
                  key="ai-chat"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="h-full"
                >
                  <AIChat
                    language={language}
                    activeContext={activeContext}
                    tasks={contextFilteredTasks}
                    notes={contextNotes}
                    filesMap={filesMap}
                    showToast={showToast}
                    initialDraft={chatDraft}
                    onDraftConsumed={() => setChatDraft(null)}
                    onOpenMeetingCapture={openMeetingCapture}
                    onNoteCreated={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      notesApi.getByDate(today).then(dateNotes => {
                        setDailyNotes(prev => {
                          const others = prev.filter(n => n.date !== today);
                          return [...others, ...dateNotes];
                        });
                      }).catch(err => console.error('Failed to refresh daily notes:', err));
                      loadContextNotes();
                    }}
                  />
                </motion.div>
              ) : activeTab === 'capsules' ? (
                <motion.div
                  key="capsules"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="h-full"
                >
                  <Capsules language={language} showToast={showToast} />
                </motion.div>
              ) : (
                <Notes
                  activeContext={activeContext}
                  language={language}
                  aiApiKey={aiApiKey}
                  aiModel={aiModel}
                  aiBaseUrl={aiBaseUrl}
                  filterByTaskId={notesFilterByTaskId}
                  onClearTaskFilter={() => setNotesFilterByTaskId(null)}
                  onNotesChanged={loadContextNotes}
                  onSendToChat={({ title, body, type, noteId }) => {
                    const noteTitle = title || (language === 'zh' ? '（无标题）' : '(untitled)');
                    const prompt = type === 'meeting_note'
                      ? (language === 'zh' ? '基于这份会议笔记继续讨论：' : 'Continue from this meeting note:')
                      : type === 'summary'
                      ? (language === 'zh' ? '基于这份总结继续讨论：' : 'Continue from this summary:')
                      : (language === 'zh' ? '基于这份笔记继续讨论：' : 'Continue from this note:');
                    setChatDraft({
                      text: prompt,
                      key: `${Date.now()}`,
                      sourceTitle: title,
                      contextText: noteId ? undefined : `# ${noteTitle}\n\n${body}`,
                      contextLabel: noteTitle,
                      noteId,
                    });
                    setActiveTab('ai-chat');
                  }}
                />
              )
            )}
          </div>
        </div>

        {/* FAB: Add Task */}
        {activeTab === 'today' && !showTaskInput && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setShowTaskInput(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl bg-accent text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-shadow active:shadow-md"
            title={language === 'zh' ? '添加任务 (Cmd+N)' : 'Add Task (Cmd+N)'}
          >
            <Plus className="w-6 h-6" />
          </motion.button>
        )}

        {/* Task Input Panel */}
        {activeTab === 'today' && (
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
            setLastAddedCategory={setLastAddedCategory}
          />
        )}
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
        ipfsEnabled={ipfsEnabled}
        setIpfsEnabled={setIpfsEnabled}
        ipfsApiKey={ipfsApiKey}
        setIpfsApiKey={setIpfsApiKey}
        ipfsGateway={ipfsGateway}
        setIpfsGateway={setIpfsGateway}
        showToast={showToast}
      />

      {/* Update Notification Modal */}
      {showUpdateModal && updateInfo && (
        <UpdateNotificationModal
          updateInfo={updateInfo}
          onClose={handleCloseUpdateModal}
          onUpdate={handleUpdate}
          onSkipVersion={handleSkipVersion}
        />
      )}

       {/* Quick Note Editor */}
       {showQuickNoteEditor && (
         <div className="fixed inset-0 z-50 bg-black/15 backdrop-blur-md flex items-center justify-center p-4 sm:p-8">
           <div className={`w-full ${isNoteEditorMaximized ? 'max-w-none h-screen' : 'max-w-5xl h-[85vh]'} floating-card overflow-hidden flex flex-col transition-all duration-200`}>
             <NoteEditor
             language={language}
             activeContext={activeContext}
             note={editingDailyNote || undefined}
             defaultDate={currentFileDate}
             defaultLinkedTaskIds={prefillLinkedTaskId ? [prefillLinkedTaskId] : undefined}
             defaultTitle={prefillLinkedTaskId ? tasks.find(t => t.id === prefillLinkedTaskId)?.title : undefined}
             defaultType={quickNoteDefaultType}
             availableTasks={tasks.map(t => ({ id: t.id, title: t.title }))}
             availableTags={[]}
             aiApiKey={aiApiKey}
             aiModel={aiModel}
             aiBaseUrl={aiBaseUrl}
             isMaximized={isNoteEditorMaximized}
             onToggleMaximize={() => setIsNoteEditorMaximized(v => !v)}
             onSendToChat={({ title, body, type, noteId }) => {
               const noteTitle = title || (language === 'zh' ? '（无标题）' : '(untitled)');
               const prompt = type === 'meeting_note'
                 ? (language === 'zh' ? '基于这份会议笔记继续讨论：' : 'Continue from this meeting note:')
                 : type === 'summary'
                 ? (language === 'zh' ? '基于这份总结继续讨论：' : 'Continue from this summary:')
                 : (language === 'zh' ? '基于这份笔记继续讨论：' : 'Continue from this note:');
               setChatDraft({
                 text: prompt,
                 key: `${Date.now()}`,
                 sourceTitle: title,
                 contextText: noteId ? undefined : `# ${noteTitle}\n\n${body}`,
                 contextLabel: noteTitle,
                 noteId,
               });
                setShowQuickNoteEditor(false);
                setEditingDailyNote(null);
                setPrefillLinkedTaskId(null);
                setQuickNoteDefaultType(undefined);
                setActiveTab('ai-chat');
              }}
              onSave={async (data) => {
                try {
                  if (editingDailyNote) {
                    await notesApi.update(editingDailyNote.id, data);
                  } else {
                    await notesApi.create(data);
                  }
                  setShowQuickNoteEditor(false);
                  setEditingDailyNote(null);
                  setPrefillLinkedTaskId(null);
                  setQuickNoteDefaultType(undefined);
                 // Refresh daily notes if the note is for today
                 if (data.date === currentFileDate) {
                   const dateNotes = await notesApi.getByDate(currentFileDate);
                   setDailyNotes(dateNotes);
                 }
                 loadContextNotes();
                 showToast(language === 'zh' ? '笔记已保存' : 'Note saved', 'success');
               } catch (err) {
                 console.error('Failed to save note:', err);
                 showToast(language === 'zh' ? '保存失败' : 'Failed to save note', 'error');
               }
             }}
              onClose={() => { setShowQuickNoteEditor(false); setEditingDailyNote(null); setPrefillLinkedTaskId(null); setQuickNoteDefaultType(undefined); }}
            />
            </div>
          </div>
        )}

      {/* Phase 2 M1: Meeting Capture modal — owned by App.tsx so the ⌘⇧R
          global shortcut works from any tab. AIChat's toolbar button calls
          onOpenMeetingCapture to set the same state. */}
      <MeetingCapture
        isOpen={showMeetingCapture}
        language={language}
        activeContext={activeContext}
        showToast={showToast}
        onSaved={() => {
          // Refresh daily notes so a meeting saved for today shows up
          // immediately in the Today tab.
          const today = new Date().toISOString().slice(0, 10);
          notesApi.getByDate(today).then(dateNotes => {
            setDailyNotes(prev => {
              const others = prev.filter(n => n.date !== today);
              return [...others, ...dateNotes];
            });
          }).catch(err => console.error('Failed to refresh daily notes:', err));
          loadContextNotes();
        }}
        onClose={closeMeetingCapture}
      />
      </div>
   );
}
