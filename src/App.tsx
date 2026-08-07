/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Check, CornerUpRight, Briefcase, Calendar, AlignLeft, Trash2, Edit2, Settings, Sparkles, Loader2, ChevronDown, ChevronRight, ChevronLeft, X, Plus, Menu, AlertCircle, Eye, EyeOff, RefreshCw, Search, Download, MessageCircle } from 'lucide-react';
import { filesApi, tasksApi, rolloverApi, configApi, notesApi, aiApi, workspacesApi, dailyApi, dispatchDomainEvent, DOMAIN_EVENTS } from './api/client';
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
import { AIChat } from './components/AIChat';
import { TodayBacklog } from './components/TodayBacklog';
import { CalendarWorkspace } from './components/CalendarWorkspace';
import { NoteEditor } from './components/NoteEditor';
import { UpdateNotificationModal } from './components/UpdateNotificationModal';
import { MindMapView } from './components/MindMap';
import { NotesView } from './features/v2/notes/NotesView';
import { MemoryView } from './features/v2/memory/MemoryView';
import { InboxView } from './features/v2/inbox/InboxView';
import type { NoteData } from './api/client';
import { checkForUpdates, downloadUpdate, relaunchApp, type UpdateInfo } from './api/updater';
import { filterTasksByContext, filterNotesByContext } from './utils/contextFilter';
import { useMeetingCapture } from './hooks/useMeetingCapture';
import { EntityContextDrawer, type EntityRef } from './components/EntityContextDrawer';
import { WorkspaceScopeProvider } from './workspaceScope';
import { TopicTabs, type TopicTabValue } from './components/TopicTabs/TopicTabs';
import { useTopicSpaces, useCreateTopicSpace, useUpdateTopicSpace } from './hooks/useTopicSpaces';
import { useUpdateTaskSpace } from './hooks/useMindMapActions';
import { TaskListView } from './components/TopicSpaceView/TaskListView';
import { TagFilterRow } from './components/TopicSpaceView/TagFilterRow';

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
  // Phase 2 (Topic Spaces): the Topic Space this task is bound to.
  // The server keeps it in memory for now (no markdown marker); the
  // list view filters by it and the unlink button clears it.
  spaceId?: string;
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
  const [showFloatingChat, setShowFloatingChat] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'calendar' | 'notes' | 'ai-chat' | 'memory' | 'mindmap'>('today');
  const [notesSurface, setNotesSurface] = useState<'notes' | 'inbox'>('notes');
  const [focusTaskIds, setFocusTaskIds] = useState<string[]>([]);
  // Topic Space v2 (Phase 1): the active tab in the MindMap header.
  //   - null → 全部
  //   - '__unclassified__' → 未分类
  //   - any other id → that specific space
  // We default to null on first render so the user starts on "全部",
  // matching the pre-Phase-1 behavior. The active space resets when
  // the workspace changes (see the effect below).
  const [activeSpaceId, setActiveSpaceId] = useState<TopicTabValue>(null);
  // Topic Space v2 (Phase 2): the dual view (mindmap / list). The
  // active space owns the truth (via `defaultView`); this local state
  // is a transient override the user can flip without persisting (we
  // only write back to the server when the user actively clicks the
  // toggle). When `activeSpaceId` is null / '__unclassified__' the
  // mindmap view is forced (the list view makes no sense for "全部").
  const [viewOverride, setViewOverride] = useState<'mindmap' | 'list' | null>(null);
  // Tag filter (Phase 3) — applies to both mindmap and list view. We
  // keep it local because it's a per-session preference, not a property
  // of the space.
  const [tagFilter, setTagFilter] = useState<string[]>([]);
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
  // Background sync is intentionally disabled until it has version-aware
  // writes. Saving a captured date/content pair on a timer can overwrite a
  // different date after the user navigates.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [entityDrawerRef, setEntityDrawerRef] = useState<EntityRef | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, type === 'error' ? 5000 : 3500);
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
  const [language, setLanguage] = useState<'en' | 'zh'>(() => {
    try {
      return localStorage.getItem('df_language') === 'zh' ? 'zh' : 'en';
    } catch {
      return 'en';
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRevisionRef = useRef(0);
  const initializedDaysRef = useRef(new Set<string>());
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
  // Topic Space v2 (Phase 1): load the spaces for the current context so
  // the MindMap tab can render the topic strip. The hook is global
  // (not workspace-scoped) so the same data shows up under every
  // workspace switch — the server keeps spaces in their own folder.
  const topicSpacesQuery = useTopicSpaces({ context: activeContext });
  const topicSpaces = topicSpacesQuery.data ?? [];
  const createTopicSpace = useCreateTopicSpace();
  // The auto-select-on-create effect has been folded into
  // `handleCreateTopic` itself: the `useTopicSpaces` cache update fires
  // *before* `mutateAsync` resolves, so a ref set after the await
  // would be invisible to the effect on the first render. Switching
  // directly in the handler is both simpler and race-free.
  const handleCreateTopic = useCallback(
    async (title: string) => {
      const created = await createTopicSpace.mutateAsync({
        title,
        context: activeContext,
        defaultView: 'mindmap',
        status: 'active',
      });
      setActiveSpaceId(created.id);
    },
    [createTopicSpace, activeContext],
  );

  // Phase 2: derive the active space object (if any) so the view
  // switcher can read its `defaultView` and the list view can render
  // the right title.
  const activeSpace = useMemo(() => {
    if (!activeSpaceId || activeSpaceId === '__unclassified__') return null;
    return topicSpaces.find((s) => s.id === activeSpaceId) ?? null;
  }, [activeSpaceId, topicSpaces]);
  const activeView: 'mindmap' | 'list' = (() => {
    if (!activeSpace) return 'mindmap';
    if (viewOverride) return viewOverride;
    return activeSpace.defaultView;
  })();

  const updateTopicSpace = useUpdateTopicSpace();
  const updateTaskSpaceMut = useUpdateTaskSpace();

  // Phase 2: flip the active space's `defaultView`. The server persists
  // it so the next time the user opens the space the same view shows up.
  // Optimistic local update keeps the UI snappy; on error we restore.
  const handleSetView = useCallback(
    async (view: 'mindmap' | 'list') => {
      if (!activeSpace) return;
      setViewOverride(view);
      try {
        await updateTopicSpace.mutateAsync({
          id: activeSpace.id,
          patch: { defaultView: view },
        });
      } catch (err) {
        // Revert on failure.
        setViewOverride(null);
        showToast(
          language === 'zh' ? '切换视图失败' : 'Failed to switch view',
          'error',
        );
        console.error('[topic-spaces] set view failed:', err);
      }
    },
    [activeSpace, updateTopicSpace, showToast, language],
  );

  // Phase 2: open a task in TodayView. The Task card lives on a given
  // date (source_date) and the only way to "open" it is to switch to
  // the Today tab with that date pre-selected.
  const handleOpenTask = useCallback(
    (taskId: string, date: string) => {
      void taskId;
      setCurrentFileDate(date);
      setActiveTab('today');
    },
    [],
  );

  // Phase 2: unlink a task from the active space. The server keeps
  // `Task.spaceId` in-memory; the in-place `tasks` state is patched
  // directly so the list view re-renders without a round-trip.
  const handleUnlinkTask = useCallback(
    async (taskId: string) => {
      try {
        await updateTaskSpaceMut.mutateAsync({ taskId, spaceId: null });
        setTasks((cur) =>
          cur.map((t) => (t.id === taskId ? { ...t, spaceId: undefined } : t)),
        );
      } catch (err) {
        showToast(
          language === 'zh' ? '解除绑定失败' : 'Failed to unlink',
          'error',
        );
        console.error('[topic-spaces] unlink failed:', err);
      }
    },
    [updateTaskSpaceMut, showToast, language],
  );

  // Phase 2: build the "tasks bound to this space" list. We source it
  // from today's task list (the same list TodayView shows) filtered by
  // `spaceId`. The spec acknowledges this is a Phase 2 simplification;
  // a future Phase 4 enhancement will scan across days.
  const tasksInActiveSpace = useMemo(() => {
    if (!activeSpace) return [] as Task[];
    return (tasks as Array<Task & { spaceId?: string }>).filter(
      (t) => t.spaceId === activeSpace.id,
    );
  }, [tasks, activeSpace]);

  // Phase 2: tags available to the filter row. We merge the space's own
  // `tags` (set on creation) with tags scraped from its bound tasks.
  // The `tag` field on a kind: 'tag' node would also be a source but
  // we don't have node access here without the mind map loaded — for
  // now the simplest signal is "tags of the space's tasks".
  const spaceTagPool = useMemo(() => {
    const pool = new Set<string>();
    for (const t of tasksInActiveSpace) {
      for (const tag of t.tags ?? []) {
        if (!['tasks', 'work', 'life'].includes(tag)) pool.add(tag);
      }
    }
    if (activeSpace) {
      for (const tag of activeSpace.tags ?? []) pool.add(tag);
    }
    return Array.from(pool).sort();
  }, [tasksInActiveSpace, activeSpace]);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [ipfsEnabled, setIpfsEnabled] = useState<boolean>(false);
  const [ipfsApiKey, setIpfsApiKey] = useState<string>('');
  const [ipfsGateway, setIpfsGateway] = useState<string>('');

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

  useEffect(() => {
    try {
      localStorage.setItem('df_language', language);
    } catch {
      // Language persistence is a progressive enhancement.
    }
  }, [language]);

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
  }, []);

  useEffect(() => {
    const open = (event: Event) => setEntityDrawerRef((event as CustomEvent<EntityRef>).detail || null);
    const close = () => setEntityDrawerRef(null);
    const openOriginal = (event: Event) => {
      const entity = (event as CustomEvent<EntityRef>).detail;
      if (!entity) return;
      setEntityDrawerRef(null);
      if (entity.type === 'note') {
        setActiveTab('notes');
        setNotesSurface('notes');
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('df:select-note', { detail: { id: entity.id } })), 0);
      } else if (entity.type === 'source' || entity.type === 'proposal' || entity.type === 'job') {
        setActiveTab('notes');
        setNotesSurface('inbox');
      } else if (entity.type === 'calendar_event') {
        setActiveTab('calendar');
      } else {
        setActiveTab('today');
      }
    };
    window.addEventListener('df:open-entity', open);
    window.addEventListener('df:close-entity', close);
    window.addEventListener('df:entity-open-original', openOriginal);
    return () => {
      window.removeEventListener('df:open-entity', open);
      window.removeEventListener('df:close-entity', close);
      window.removeEventListener('df:entity-open-original', openOriginal);
    };
  }, []);

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
        // GitHub tokens are intentionally session-only and never loaded from
        // DailyFlow's plaintext config file.
        setGithubToken('');
        setWorkspaceRoot(config.workspaceRoot || '');
        const configuredWorkspaces = config.workspaces || [];
        setWorkspaces(configuredWorkspaces);
        setActiveWorkspaceId(config.activeWorkspaceId || '');
        // Keep the shell consistent with the backend. If the workspace list
        // was cleared or the config became incomplete, do not leave users in
        // a dashboard where Task/Note creation fails and the workspace
        // switcher silently disappears. Route them to the recovery/setup UI.
        if (configuredWorkspaces.length === 0 || !config.activeWorkspaceId || !config.workspaceRoot) {
          setIsFirstRun(true);
          setShowWorkspaceSetup(true);
        }
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
            dispatchDomainEvent(DOMAIN_EVENTS.aiProviderChanged, { source: 'config-load' });
          } catch { /* ignore */ }
        } else {
          setAiApiKey('');
          setAiModel('');
          setAiBaseUrl('');
        }

        // DailyFlow always opens on Today. Restoring a historical date while
        // the active navigation item still says "Today" creates a misleading
        // empty first screen and hides the primary capture action.

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
    window.addEventListener(DOMAIN_EVENTS.aiProviderChanged, sync);
    return () => window.removeEventListener(DOMAIN_EVENTS.aiProviderChanged, sync);
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
        // Guard: do not echo a partial config back if the server has no
        // workspaces yet. saveConfig() treats an empty workspaces array
        // as "reset to first-run", so this would wipe a workspace the
        // user just created via the bootstrap API but hasn't loaded the
        // app for yet (e.g. right after the e2e bootstrap creates a
        // workspace and the page navigates to the dashboard before the
        // first GET returns the new list).
        const list = Array.isArray(config.workspaces) ? config.workspaces : [];
        if (list.length === 0) return;
        await configApi.update({ activeContext }, config.version);
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
    const revision = ++loadRevisionRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await filesApi.get(date);
      if (revision !== loadRevisionRef.current) return;
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
        if (revision !== loadRevisionRef.current) return;
        setDailyNotes(dateNotes);
      } catch {
        if (revision !== loadRevisionRef.current) return;
        setDailyNotes([]);
      }
    } catch (e) {
      if (revision !== loadRevisionRef.current) return;
      console.error('Failed to load tasks', e);
      setLoadError('Failed to load tasks. Is the backend running?');
    } finally {
      if (revision === loadRevisionRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasksForDate(currentFileDate);
  }, [currentFileDate, loadTasksForDate]);

  useEffect(() => {
    if (!activeWorkspaceId || isFirstRun !== false || currentFileDate !== getTodayStr()) return;
    const key = `${activeWorkspaceId}:${currentFileDate}:${activeContext}`;
    if (initializedDaysRef.current.has(key)) return;
    initializedDaysRef.current.add(key);
    dailyApi.initialize(currentFileDate, activeContext)
      .then(result => {
        if (result.recurringCreated > 0 || result.migratedCount > 0) {
          return loadTasksForDate(currentFileDate);
        }
      })
      .catch(error => {
        initializedDaysRef.current.delete(key);
        console.error('Daily initialization failed', error);
      });
  }, [activeContext, activeWorkspaceId, currentFileDate, isFirstRun, loadTasksForDate]);

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

      // A workspace switch is a fresh navigation boundary. Always land on
      // Today and clear view-local state from the previous workspace; keeping
      // the Notes tab/editor open made the newly-selected workspace appear to
      // default to Notes and could leak stale filters or drafts across it.
      setActiveTab('today');
      setCurrentFileDate(getTodayStr());
      setShowTaskInput(false);
      setShowBrainDump(false);
      setShowQuickNoteEditor(false);
      setIsNoteEditorMaximized(false);
      setEditingDailyNote(null);
      setPrefillLinkedTaskId(null);
      setNotesFilterByTaskId(null);
      setQuickNoteDefaultType(undefined);
      setChatDraft(null);
      setSelectedCategory(null);

      // Reset data state for the new workspace.
      setMarkdown('');
      setLastSyncedMD('');
      setTasks([]);
      setDailyNotes([]);
      setContextNotes([]);
      setFilesMap({});

      await reloadFileList();

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
  const systemTags = ['work', 'life', 'delayed', 'tasks'];
  const categories = Array.from(new Set(todayTasks.flatMap(t => (t.tags || []).filter(tag => !systemTags.includes(tag)))));
  if (lastAddedCategory && categories.includes(lastAddedCategory)) {
    const idx = categories.indexOf(lastAddedCategory);
    categories.splice(idx, 1);
    categories.unshift(lastAddedCategory);
  }

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
  const handleWorkspaceSetupComplete = async () => {
    setShowWorkspaceSetup(false);
    setIsFirstRun(false);
    try {
      const config = await configApi.get();
      setWorkspaceRoot(config.workspaceRoot || '');
      setWorkspaces(config.workspaces || []);
      setActiveWorkspaceId(config.activeWorkspaceId || '');
      setActiveContext(config.activeContext === 'life' ? 'life' : 'work');
      await reloadFileList();
      await loadTasksForDate(currentFileDate);
      dispatchDomainEvent(DOMAIN_EVENTS.workspaceChanged, {
        workspaceId: config.activeWorkspaceId || '',
        reason: 'setup-complete',
      });
    } catch (error) {
      console.error('Failed to refresh workspace after setup', error);
      showToast(language === 'zh' ? '工作区已创建，但刷新失败' : 'Workspace created, but refresh failed', 'error');
    }
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
    <WorkspaceScopeProvider value={activeWorkspaceId || 'default'}>
    <div
      className="h-dvh w-full flex overflow-hidden text-text-main relative transition-colors duration-700 bg-transparent"
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
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
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
        onOpenNotesSurface={(surface) => { setActiveTab('notes'); setNotesSurface(surface); }}
      />

      {/* AI Chat is available from every workspace surface. It used to be
          only reachable through the sidebar tab, which made it disappear
          while working in Notes, Inbox, Today, or Calendar. Keep a compact
          launcher and an overlay session so the current page stays visible. */}
      {activeTab !== 'ai-chat' && (
        <>
          <AnimatePresence>
            {showFloatingChat && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="fixed bottom-20 right-5 z-[80] h-[min(680px,calc(100dvh-7rem))] w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
                data-testid="floating-ai-chat"
              >
                <AIChat
                  workspaceId={activeWorkspaceId || 'default'}
                  language={language}
                  activeContext={activeContext}
                  tasks={contextFilteredTasks}
                  notes={contextNotes}
                  filesMap={filesMap}
                  showToast={showToast}
                  initialDraft={null}
                  onOpenMeetingCapture={openMeetingCapture}
                  onNoteCreated={() => {
                    const today = getTodayStr();
                    notesApi.getByDate(today).then(dateNotes => {
                      setDailyNotes(prev => [...prev.filter(n => n.date !== today), ...dateNotes]);
                    }).catch(err => console.error('Failed to refresh daily notes:', err));
                    loadContextNotes();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => setShowFloatingChat(value => !value)}
            className="fixed bottom-5 right-5 z-[81] inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg transition hover:scale-105 hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
            aria-label={language === 'zh' ? '打开 AI 对话' : 'Open AI Chat'}
            title={language === 'zh' ? 'AI 对话' : 'AI Chat'}
            data-testid="floating-ai-chat-button"
          >
            <MessageCircle className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-dvh bg-background/90 relative overflow-hidden min-w-0 w-full transition-colors duration-300">
        {/* Floating toggle button — show sidebar when hidden (Codex style) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-3 left-3 z-20 rounded-lg border border-border bg-surface-elevated p-2 text-text-main shadow-sm transition-all hover:border-border-strong hover:text-text-heading active:scale-95"
            title={language === 'zh' ? '显示侧边栏' : 'Show sidebar'}
            aria-label={language === 'zh' ? '显示侧边栏' : 'Show sidebar'}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Every primary workspace uses the available pane width. Notes,
            AI Chat, Calendar and AI-Native own their internal scrolling; Today keeps
            page padding but must not be constrained to document-reading
            width. A `max-w-3xl` wrapper left nearly half of a 1920px window
            empty and made the dashboard cards look like a narrow island. */}
        <div className={`flex-1 w-full min-h-0 ${activeTab === 'ai-chat' || activeTab === 'notes' || activeTab === 'memory' || activeTab === 'mindmap' || activeTab === 'today' || activeTab === 'calendar' ? 'overflow-hidden' : 'overflow-y-auto p-4 md:p-8 lg:p-12 pb-32'}`}>
          <div className={`h-full min-h-0 w-full ${!isSidebarOpen ? 'max-sm:pt-12' : ''}`}>
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
                <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 pb-32 pt-5 md:px-8 md:pt-7 lg:px-12" data-testid="today-focus-scroll-region">
                  <motion.div
                    key="visual-today"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mx-auto max-w-5xl space-y-6"
                  >
                    <header className="space-y-3 border-b border-border/60 pb-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-surface/60 p-0.5">
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
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
                              {currentFileDate === getTodayStr()
                                ? (language === 'zh' ? '今天' : 'Today')
                                : (language === 'zh' ? '历史任务' : 'Past tasks')}
                            </p>
                            <h1 className="truncate text-lg font-semibold tracking-tight text-text-heading md:text-xl">
                              {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                                timeZone: 'UTC',
                              }).format(new Date(`${currentFileDate}T00:00:00Z`))}
                            </h1>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentFileDate === getTodayStr() ? (
                            <button
                              onClick={handleManualRollover}
                              title={language === 'zh' ? '回顾并处理历史未完成事项' : 'Review unfinished items from earlier days'}
                              className="flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:border-accent/20 hover:bg-accent/10 hover:text-accent"
                            >
                              <RefreshCw className="h-3 w-3" />
                              {language === 'zh' ? '整理遗留' : 'Review leftovers'}
                            </button>
                          ) : (
                            <button
                              onClick={() => setCurrentFileDate(getTodayStr())}
                              className="flex items-center gap-1.5 rounded-lg border border-accent/20 px-2.5 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10"
                            >
                              <Calendar className="h-3 w-3" />
                              {language === 'zh' ? '回到今天' : 'Back to today'}
                            </button>
                          )}
                          {currentFileDate === getTodayStr() && (
                            <button
                              onClick={() => setShowTaskInput(true)}
                              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {language === 'zh' ? '添加任务' : 'Add task'}
                            </button>
                          )}
                        </div>
                      </div>
                    {categories.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        <button
                          onClick={() => setSelectedCategory(null)}
                          className={`category-chip shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            selectedCategory === null
                              ? 'bg-text-heading text-white'
                              : 'border border-border/60 text-text-muted hover:text-text-heading'
                          }`}
                        >
                          {language === 'zh' ? '全部' : 'All'}
                        </button>
                        {categories.map(c => (
                          <button
                            key={c}
                            onClick={() => setSelectedCategory(selectedCategory === c ? null : c)}
                            className={`category-chip shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              selectedCategory === c
                                ? 'bg-accent text-white'
                                : 'border border-border/60 text-text-muted hover:text-text-heading'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                    </header>

                  <TodayBacklog
                    tasks={todayTasks}
                    selectedDate={currentFileDate}
                    categories={categories}
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
                    completionPromptTaskIds={completionPromptTaskIds}
                    onCompletionPromptClosed={(taskId) => {
                      setCompletionPromptTaskIds(prev => {
                        const next = new Set(prev);
                        next.delete(taskId);
                        return next;
                      });
                    }}
                  />
                  </motion.div>
                </div>
              ) : activeTab === 'calendar' ? (
                <motion.div
                  key="calendar"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="h-full min-h-0 overflow-hidden px-4 pb-4 pt-4 md:px-8 md:pb-8 md:pt-6 lg:px-12"
                  data-testid="calendar-page"
                >
                  <CalendarWorkspace
                    date={currentFileDate}
                    setDate={setCurrentFileDate}
                    language={language}
                    onOpenLocalDate={(date) => {
                      setCurrentFileDate(date);
                      setActiveTab('today');
                    }}
                    onManageConnections={() => {
                      setConfigTab('sync');
                      setShowSettings(true);
                    }}
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
                    workspaceId={activeWorkspaceId || 'default'}
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
                      const today = getTodayStr();
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
              ) : activeTab === 'memory' ? (
                <motion.div
                  key="memory"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="h-full min-h-0 overflow-hidden"
                >
                  <MemoryView workspaceId={activeWorkspaceId || 'default'} language={language} />
                </motion.div>
              ) : activeTab === 'mindmap' ? (
                <motion.div
                  key="mindmap"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex h-full min-h-0 flex-col overflow-hidden"
                >
                  <TopicTabs
                    context={activeContext}
                    spaces={topicSpaces.map((s) => ({
                      id: s.id,
                      title: s.title,
                      context: s.context,
                      order: s.order,
                      kind: s.kind,
                    }))}
                    activeSpaceId={activeSpaceId}
                    onSelect={setActiveSpaceId}
                    onCreate={handleCreateTopic}
                    isLoading={topicSpacesQuery.isLoading}
                  />
                  {/* Phase 2: view switcher (mindmap / list). Hidden for
                      "全部" / "未分类" where only the mindmap makes sense. */}
                  {activeSpace && (
                    <div
                      className="flex shrink-0 items-center gap-1 border-b border-border/40 bg-background/95 px-2 py-1"
                      data-testid="topic-space-view-switcher"
                    >
                      {([
                        ['mindmap', language === 'zh' ? '导图' : 'Mindmap'],
                        ['list', language === 'zh' ? '列表' : 'List'],
                      ] as const).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => void handleSetView(v)}
                          data-testid={`topic-space-view-${v}`}
                          data-active={activeView === v}
                          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                            activeView === v
                              ? 'bg-[var(--color-accent)] text-white shadow-sm'
                              : 'text-text-muted hover:bg-black/[0.04] hover:text-text-heading'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Tag filter row (Phase 3). Shown when there are
                      tags to filter. The list view applies the filter
                      client-side; the mindmap view also uses it to
                      hide non-matching nodes. */}
                  {activeSpace && spaceTagPool.length > 0 && activeView === 'list' && (
                    <TagFilterRow
                      tags={spaceTagPool}
                      selected={tagFilter}
                      onChange={setTagFilter}
                      language={language}
                    />
                  )}
                  <div className="min-h-0 flex-1">
                    {activeView === 'list' && activeSpace ? (
                      <TaskListView
                        tasks={tasksInActiveSpace}
                        spaceId={activeSpace.id}
                        spaceTitle={activeSpace.title}
                        language={language}
                        selectedTagFilter={tagFilter}
                        onUnlinkTask={(taskId) => void handleUnlinkTask(taskId)}
                        onSelectTask={(t) => {
                          const date = t.source_date ?? currentFileDate;
                          handleOpenTask(t.id, date);
                        }}
                      />
                    ) : (
                      <MindMapView
                        workspaceId={activeWorkspaceId || 'default'}
                        language={language}
                        showToast={showToast}
                        activeSpaceId={activeSpaceId}
                        topicSpaces={topicSpaces}
                        activeContext={activeContext}
                        todayDate={currentFileDate}
                        linkableTasks={tasks.map((t) => ({
                          id: t.id,
                          title: t.title,
                          status: t.status as 'todo' | 'done' | 'migrated',
                          date: t.source_date ?? currentFileDate,
                        }))}
                        onOpenTask={handleOpenTask}
                      />
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-background/95 px-1 py-2">
                    {([
                      ['notes', language === 'zh' ? '笔记' : 'Notes'],
                      ['inbox', language === 'zh' ? '待处理来源' : 'Inbox'],
                    ] as const).map(([surface, label]) => (
                      <button key={surface} onClick={() => setNotesSurface(surface)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${notesSurface === surface ? 'bg-accent text-white' : 'text-text-muted hover:bg-black/5'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {notesSurface === 'inbox' ? <InboxView language={language} /> : <NotesView language={language} sidebarOpen={isSidebarOpen} onNotice={showToast} />}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

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
      <EntityContextDrawer ref={entityDrawerRef} onClose={() => setEntityDrawerRef(null)} />

      <SettingsModal
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        language={language}
        configTab={configTab}
        setConfigTab={setConfigTab}
        workspaceRoot={workspaceRoot}
        setWorkspaceRoot={setWorkspaceRoot}
        setLanguage={setLanguage}
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
           <div className={`w-full min-h-0 ${isNoteEditorMaximized ? 'h-full max-w-none' : 'h-[85dvh] max-w-5xl'} floating-card overflow-hidden flex flex-col transition-all duration-200`}>
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
          const today = getTodayStr();
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
    </WorkspaceScopeProvider>
   );
}
