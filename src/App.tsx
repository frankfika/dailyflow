/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertCircle, Calendar, Check, ChevronLeft, ChevronRight, FolderOpen, Loader2, Menu, RefreshCw, X } from 'lucide-react';
import { filesApi, tasksApi, recurringApi, rolloverApi, configApi, notesApi, aiApi, workspacesApi, dailyApi, eventsApi, dispatchDomainEvent, DOMAIN_EVENTS, reportsApi } from './api/client';
import type { Workspace } from './api/client';
import { API_BASE } from './config/api';
import { getActiveAiConfig, hydrateModelCenterFromBackend, loadProviderConfigs } from './types/models';
import { getTodayStr } from './utils/tagColors';
import { TaskCard } from './components/TaskCard';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { RolloverPreviewModal } from './components/RolloverPreviewModal';
import { TaskInputPanel } from './components/TaskInputPanel'; // kept for rollback; no longer mounted
import { TodayInputBar, type AiAnswer, type BrainPreviewTask, type QuickTaskDraft } from './components/TodayInputBar';
import type { AiActionKind } from './api/client';
import { WorkspaceSetup } from './components/WorkspaceSetup';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
import { ContextSwitcher } from './components/ContextSwitcher';
import { AIChat } from './components/AIChat';
import { TodayBacklog, type TodayPlanningGroup } from './components/TodayBacklog';
import { TodayFocusBar } from './components/TodayFocusBar';
import { DailyReflectionModal, type DailyReflectionTask } from './components/DailyReflectionModal';
import { TodayProactiveBanner } from './components/TodayProactiveBanner';
import { TodayReflectionBar, isReflectionPromptOptedOut } from './components/TodayReflectionBar';
import { CalendarWorkspace } from './components/CalendarWorkspace';
import { NoteEditor } from './components/NoteEditor';
import { UpdateNotificationModal } from './components/UpdateNotificationModal';
import { NotesView } from './features/v2/notes/NotesView';
import { MemoryView } from './features/v2/memory/MemoryView';
import { InboxView } from './features/v2/inbox/InboxView';
import { EventsView } from './features/v2/events/EventsView';
import { TeamView } from './components/TeamView';
import { useEvents, useTodayItems } from './features/v2/hooks/useEvents';
import type { NoteData } from './api/client';
import { checkForUpdates, downloadUpdate, relaunchApp, type UpdateInfo } from './api/updater';
import { filterTasksByContext, filterNotesByContext } from './utils/contextFilter';
import { createNote as createV2Note, patchCommitment as v2PatchCommitment, completeCommitment as v2CompleteCommitment } from './features/v2/api/client';
import type { ProactiveProposal, ProactiveSuggestion } from './api/client';
import { EntityContextDrawer, type EntityRef } from './components/EntityContextDrawer';
import { CommandPalette, type CommandId } from './components/CommandPalette';
import { WorkspaceScopeProvider } from './workspaceScope';
import { useTopicSpaces } from './hooks/useTopicSpaces';
import { useQueryClient } from '@tanstack/react-query';

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
  /** Daily note that currently owns this task (for earlier open tasks). */
  host_date?: string;
  // Phase 2 (Topic Spaces): the Topic Space this task is bound to.
  // The server keeps it in memory for now (no markdown marker); the
  // list view filters by it and the unlink button clears it.
  spaceId?: string;
  originMindmapId?: string;
  originNodeId?: string;
  parentTaskId?: string;
  planOrder?: number;
  sourcePath?: string[];
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
  const queryClient = useQueryClient();
  const todayStr = getTodayStr();
  const [currentFileDate, setCurrentFileDate] = useState(todayStr);
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [markdown, setMarkdown] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [earlierOpenTasks, setEarlierOpenTasks] = useState<Task[]>([]);
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
  const [activeTab, setActiveTab] = useState<'today' | 'events'>('today');
  // UX S5: notes / AI / calendar / memory / team render as overlays over the
  // permanent home; Esc (or the close button) returns to it.
  const [activeOverlay, setActiveOverlay] = useState<'notes' | 'ai-chat' | 'calendar' | 'memory' | 'team' | null>(null);
  const [requestedEventId, setRequestedEventId] = useState<string | null>(null);
  // UX S8: node to highlight after a "来自 ↗" chip jump into the canvas.
  const [requestedNodeId, setRequestedNodeId] = useState<string | null>(null);
  const [notesSurface, setNotesSurface] = useState<'notes' | 'inbox'>('notes');
  const [requestedV2NoteId, setRequestedV2NoteId] = useState<string | null>(null);
  useEffect(() => {
    const openEventOperator = (event: Event) => {
      const eventId = (event as CustomEvent<{ eventId?: string }>).detail?.eventId;
      if (!eventId) return;
      setRequestedEventId(eventId);
      setActiveTab('events');
    };
    window.addEventListener('df:open-event-operator', openEventOperator);
    return () => window.removeEventListener('df:open-event-operator', openEventOperator);
  }, []);
  const [focusTaskIds, setFocusTaskIds] = useState<string[]>([]);
  // Registered by TodayInputBar so Cmd+N and CTAs can focus the input.
  const taskInputFocusRef = useRef<(() => void) | null>(null);
  // Meeting capture has one canonical owner: a v2 NoteDocument. Every entry
  // point creates and opens a meeting note instead of mounting the retired
  // standalone meeting modal, which used a different API and storage tree.

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
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [entityDrawerRef, setEntityDrawerRef] = useState<EntityRef | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meetingCreateInFlightRef = useRef(false);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, type === 'error' ? 5000 : 3500);
  };

  const [brainDumpText, setBrainDumpText] = useState('');
  const [isProcessingBrainDump, setIsProcessingBrainDump] = useState(false);
  // UX S6: brainstorm preview + `?` answers + Cmd+B signal.
  const [brainPreviewTasks, setBrainPreviewTasks] = useState<BrainPreviewTask[] | null>(null);
  const [rewritingPreviewId, setRewritingPreviewId] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState<AiAnswer | null>(null);
  const [brainModeSignal, setBrainModeSignal] = useState(0);

  const [showRolloverPreview, setShowRolloverPreview] = useState(false);
  const [rolloverPreview, setRolloverPreview] = useState<{ tasksToMigrate: any[]; fromDate: string } | null>(null);
  const [isRollingOver, setIsRollingOver] = useState(false);
  // Daily reflection modal — S12 will give it a quiet prompt bar on Today;
  // auto-triggered after the day rolls over if the user hasn't written
  // today's Journal entry yet.
  const [showDailyReflection, setShowDailyReflection] = useState(false);
  const [savingDailyReflection, setSavingDailyReflection] = useState(false);
  const [lastDailySummary, setLastDailySummary] = useState<import('./api/client').DailyReportSummary | null>(null);
  const [reflectionDate, setReflectionDate] = useState<string>(todayStr);

  // S12: quiet prompt bar instead of the auto-opened reflection modal.
  const [reflectionBar, setReflectionBar] = useState<{ date: string; completedCount: number } | null>(null);

  const [lastAddedCategory, setLastAddedCategory] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [language, setLanguage] = useState<'en' | 'zh'>(() => {
    try {
      return localStorage.getItem('df_language') === 'zh' ? 'zh' : 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);
  const openMeetingNote = useCallback(async () => {
    if (meetingCreateInFlightRef.current) return;
    meetingCreateInFlightRef.current = true;
    setActiveOverlay('notes');
    setNotesSurface('notes');
    try {
      const now = new Date();
      const date = getTodayStr();
      const title = language === 'zh'
        ? `会议记录 ${now.toLocaleString('zh-CN', { hour12: false })}`
        : `Meeting ${now.toLocaleString('en-US')}`;
      const body = language === 'zh'
        ? '# 会议记录\n\n## 议程\n\n- \n\n## 笔记\n\n## 决策\n\n- \n\n## 行动项\n\n- [ ] \n'
        : '# Meeting notes\n\n## Agenda\n\n- \n\n## Notes\n\n## Decisions\n\n- \n\n## Action items\n\n- [ ] \n';
      const { note } = await createV2Note({
        title,
        body,
        kind: 'meeting',
        state: 'draft',
        date,
      });
      setRequestedV2NoteId(note.id);
      showToast(language === 'zh' ? '已创建会议记录，可以开始录音' : 'Meeting note created — ready to record', 'info');
    } catch (error) {
      console.error('Failed to create meeting note:', error);
      showToast(language === 'zh' ? '创建会议记录失败' : 'Failed to create meeting note', 'error');
    } finally {
      meetingCreateInFlightRef.current = false;
    }
  }, [language]);
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
  const [configTab, setConfigTab] = useState<'general' | 'ai' | 'transcription' | 'sync' | 'privacy' | 'about' | 'team'>('general');
  const [rolloverTrigger, setRolloverTrigger] = useState<'manual' | 'on_app_open'>('manual');
  const [activeContext, setActiveContext] = useState<'work' | 'life'>('work');
  const todayItemsQuery = useTodayItems(currentFileDate, activeContext);
  const eventsQuery = useEvents();

  const refreshEarlierOpenTasks = useCallback(async () => {
    const today = getTodayStr();
    if (currentFileDate !== today) {
      setEarlierOpenTasks([]);
      return;
    }
    try {
      const preview = await rolloverApi.preview(today, activeContext);
      // Today is the execution inbox for every unfinished action. Event
      // tasks used to be removed here, which made scheduled mind-map nodes
      // disappear as soon as their original day passed.
      setEarlierOpenTasks((preview?.tasksToMigrate ?? []).map(task => task as Task));
    } catch (error) {
      console.error('Failed to load earlier open tasks', error);
      setEarlierOpenTasks([]);
    }
  }, [activeContext, currentFileDate]);

  useEffect(() => {
    void refreshEarlierOpenTasks();
  }, [refreshEarlierOpenTasks, activeWorkspaceId]);

  // Topic Spaces are loaded here because the Today tab groups its tasks by
  // space (see `todayMindmapOptions` below). The standalone mindmap tab has
  // been retired — EventsView is the only entry point that browses them.
  const topicSpacesQuery = useTopicSpaces({ context: activeContext });
  const topicSpaces = topicSpacesQuery.data ?? [];

  const projectedTodayTasks = useMemo<Task[] | null>(() => {
    if (!todayItemsQuery.data) return null;
    return todayItemsQuery.data.items.map((item) => ({
      id: item.taskId,
      title: item.title,
      status: item.status,
      tags: item.effectiveTags,
      deadline: item.deadline,
      priority: item.priority,
      source_date: item.scheduledDate,
      ...(item.kind === 'event-node' ? {
        spaceId: item.spaceId,
        originMindmapId: item.mindmapId,
        originNodeId: item.nodeId,
        sourcePath: item.path.map((segment) => segment.text).filter(Boolean),
      } : {}),
    }));
  }, [todayItemsQuery.data]);

  const todayPlanningGroups = useMemo<TodayPlanningGroup[]>(() => {
    if (todayItemsQuery.data) {
      const byEvent = new Map<string, TodayPlanningGroup>();
      for (const item of todayItemsQuery.data.items) {
        if (item.kind !== 'event-node') continue;
        const group = byEvent.get(item.eventId) ?? {
          id: item.eventId,
          mindmapId: item.mindmapId,
          spaceId: item.spaceId,
          title: item.eventTitle,
          taskIds: [],
          completedTaskIds: [],
        };
        group.taskIds.push(item.taskId);
        if (item.status === 'done') group.completedTaskIds.push(item.taskId);
        byEvent.set(item.eventId, group);
      }

      for (const task of earlierOpenTasks) {
        if (!task.originMindmapId && !task.spaceId) continue;
        const space = topicSpaces.find((candidate) =>
          candidate.id === task.spaceId || candidate.mindmapId === task.originMindmapId,
        );
        const eventSummary = eventsQuery.data?.events.find((candidate) =>
          candidate.id === task.spaceId || candidate.mindmapId === task.originMindmapId || candidate.id === task.originMindmapId,
        );
        const eventId = eventSummary?.id ?? space?.id ?? task.spaceId ?? task.originMindmapId!;
        const group = byEvent.get(eventId) ?? {
          id: eventId,
          mindmapId: eventId,
          spaceId: space?.id ?? task.spaceId,
          title: eventSummary?.title ?? space?.title ?? (language === 'zh' ? '未命名事件' : 'Untitled event'),
          taskIds: [],
          completedTaskIds: [],
        };
        if (!group.taskIds.includes(task.id)) group.taskIds.push(task.id);
        byEvent.set(eventId, group);
      }
      return [...byEvent.values()];
    }

    const claimedTaskIds = new Set<string>();
    const groups: TodayPlanningGroup[] = topicSpaces.map((space) => {
      const groupTasks = tasks
        .filter((task) => task.originMindmapId === space.mindmapId || task.spaceId === space.id)
        .sort((a, b) => (a.planOrder ?? Number.MAX_SAFE_INTEGER) - (b.planOrder ?? Number.MAX_SAFE_INTEGER));
      groupTasks.forEach((task) => claimedTaskIds.add(task.id));
      return {
        id: space.mindmapId,
        mindmapId: space.mindmapId,
        spaceId: space.id,
        title: space.title,
        taskIds: groupTasks.map((task) => task.id),
        completedTaskIds: groupTasks.filter((task) => task.status === 'done').map((task) => task.id),
      };
    }).filter((group) => group.taskIds.length > 0);

    const orphanMaps = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.originMindmapId || claimedTaskIds.has(task.id)) continue;
      const current = orphanMaps.get(task.originMindmapId) ?? [];
      current.push(task);
      orphanMaps.set(task.originMindmapId, current);
    }
    for (const [mindmapId, mapTasks] of orphanMaps) {
      groups.push({
        id: mindmapId,
        mindmapId,
        spaceId: undefined,
        title: language === 'zh' ? `未命名事件` : 'Untitled event',
        taskIds: mapTasks.map((task) => task.id),
        completedTaskIds: mapTasks.filter((task) => task.status === 'done').map((task) => task.id),
      });
    }
    return groups;
  }, [earlierOpenTasks, eventsQuery.data, tasks, todayItemsQuery.data, topicSpaces, language]);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [bgDownloadProgress, setBgDownloadProgress] = useState(0);
  const [bgDownloadDone, setBgDownloadDone] = useState(false);
  const [bgDownloadError, setBgDownloadError] = useState(false);
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
        setActiveOverlay('notes');
        setNotesSurface('notes');
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('df:select-note', { detail: { id: entity.id } })), 0);
      } else if (entity.type === 'source' || entity.type === 'proposal' || entity.type === 'job') {
        setActiveOverlay('notes');
        setNotesSurface('inbox');
      } else if (entity.type === 'calendar_event') {
        setActiveOverlay('calendar');
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

        // Model Center is the single registry for chat, structured meeting
        // extraction, and speech transcription. The backend config file is
        // the source of truth — server-side AI reads it — so hydrate the
        // local cache from it on every startup (backend wins), and push the
        // local copy up when the backend has none yet.
        try {
          await hydrateModelCenterFromBackend();
        } catch (e) {
          console.error('Failed to hydrate model center from backend:', e);
        }
        const active = getActiveAiConfig('chat');
        if (active) {
          setAiApiKey(active.apiKey);
          setAiModel(active.model);
          setAiBaseUrl(active.baseUrl);
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

  // Auto-check for updates on app start. Downloads silently in the
  // background; the user is only asked to restart once it is ready.
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
            // Start silent background download; progress shows in a
            // non-blocking floating card instead of a blocking modal.
            try {
              await downloadUpdate((downloaded, total) => {
                setBgDownloadProgress(total > 0 ? Math.round((downloaded / total) * 100) : 0);
              });
              setBgDownloadDone(true);
            } catch (error) {
              console.error('Background update download failed:', error);
              setBgDownloadError(true);
            }
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
      // The packaged webview becomes interactive slightly before the bundled
      // Node process has bound its socket. Keep the primary workspace in its
      // loading state during that short window instead of requiring a manual
      // retry on every cold launch.
      const maxAttempts = import.meta.env.DEV ? 1 : 40;
      let data: Awaited<ReturnType<typeof filesApi.get>> = null;
      let loaded = false;
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          data = await filesApi.get(date);
          loaded = true;
          break;
        } catch (error) {
          lastError = error;
          if (revision !== loadRevisionRef.current) return;
          if (attempt < maxAttempts) {
            await new Promise(resolve => window.setTimeout(resolve, 200));
          }
        }
      }
      if (!loaded) throw lastError;
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
    const reloadChangedDay = (event: Event) => {
      const changedDate = (event as CustomEvent<{ date?: string }>).detail?.date;
      if (!changedDate || changedDate === currentFileDate) {
        void loadTasksForDate(currentFileDate);
      }
    };
    window.addEventListener(DOMAIN_EVENTS.tasksChanged, reloadChangedDay);
    return () => window.removeEventListener(DOMAIN_EVENTS.tasksChanged, reloadChangedDay);
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
    if (activeOverlay === 'ai-chat') {
      loadContextNotes();
    }
  }, [activeOverlay, loadContextNotes]);

  const handleSwitchWorkspace = useCallback(async (id: string) => {
    if (id === activeWorkspaceId) return;
    setIsSwitchingWorkspace(true);
    try {
      const ws = await workspacesApi.activate(id);
      // Every backend-backed query resolves through the newly activated root.
      // Clear even legacy/global keys so observers cannot reuse data belonging
      // to the previous workspace.
      queryClient.clear();
      setActiveWorkspaceId(id);
      setWorkspaceRoot(ws.path);

      // A workspace switch is a fresh navigation boundary. Always land on
      // Today and clear view-local state from the previous workspace; keeping
      // the Notes tab/editor open made the newly-selected workspace appear to
      // default to Notes and could leak stale filters or drafts across it.
      setActiveTab('today');
      setCurrentFileDate(getTodayStr());
      setShowQuickNoteEditor(false);
      setIsNoteEditorMaximized(false);
      setEditingDailyNote(null);
      setPrefillLinkedTaskId(null);
      setNotesFilterByTaskId(null);
      setQuickNoteDefaultType(undefined);
      setChatDraft(null);

      // Reset data state for the new workspace.
      setMarkdown('');
      setLastSyncedMD('');
      setTasks([]);
      setDailyNotes([]);
      setContextNotes([]);
      setFilesMap({});

      await reloadFileList();
      await loadTasksForDate(getTodayStr());

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
  }, [activeWorkspaceId, language, loadTasksForDate, queryClient, reloadFileList]);

  // Keyboard shortcuts: Cmd/Ctrl+N toggles task input; Cmd/Ctrl+Shift+R
  // creates a canonical v2 meeting note and opens its recording panel.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        void openMeetingNote();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '!') {
        e.preventDefault();
        setActiveContext(prev => (prev === 'work' ? 'life' : 'work'));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        const singleKeyActions: Record<string, () => void> = {
          j: () => kbActionsRef.current.reflection(),
          r: () => kbActionsRef.current.rollover(),
          '3': () => setActiveOverlay('notes'),
          '4': () => setActiveOverlay('ai-chat'),
          '5': () => setActiveOverlay('calendar'),
          '6': () => setActiveOverlay('memory'),
          '7': () => setActiveOverlay('team'),
          ',': () => setShowSettings(true),
        };
        const action = singleKeyActions[e.key.toLowerCase()];
        if (action) {
          e.preventDefault();
          action();
          return;
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setActiveTab('today');
        taskInputFocusRef.current?.();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        setActiveTab('today');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setActiveTab('events');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setActiveTab('today');
        setBrainModeSignal(value => value + 1);
        return;
      }
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement | null;
        const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (typing) return;
        if (activeOverlay) {
          setActiveOverlay(null);
        } else if (activeTab === 'events') {
          setActiveTab('today');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openMeetingNote, activeTab, activeOverlay]);

  const [proactiveRefreshKey, setProactiveRefreshKey] = useState(0);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  // Keyboard handlers defined later in the component; the keydown effect
  // reads them through this ref.
  const kbActionsRef = useRef<{ reflection: () => void; rollover: () => void }>({
    reflection: () => {},
    rollover: () => {},
  });

  // Suggestions from the proactive scan target v2 commitments, not daily
  // tasks — apply them through the v2 API so the buttons do real work
  // instead of just hiding the card (design v3.1: no dead buttons).
  const handleApplySuggestion = async (proposal: ProactiveProposal, suggestion: ProactiveSuggestion) => {
    try {
      if (suggestion.action === 'move_to_today') {
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 0);
        await v2PatchCommitment(proposal.entityId, { dueAt: endOfToday.toISOString() });
        showToast(language === 'zh' ? '已排进今天' : 'Moved to today', 'success');
      } else if (suggestion.action === 'mark_done') {
        await v2CompleteCommitment(proposal.entityId, {
          outcomeKind: 'delivered',
          outcomeSummary: proposal.title,
        });
        showToast(language === 'zh' ? '已标记完成' : 'Marked as done', 'success');
      } else {
        // regroup has no single-click server action yet; point the user at
        // the canvas instead of pretending the card action did it.
        showToast(language === 'zh' ? '请在事件画布中重新整理该事项' : 'Regroup this item from the event canvas', 'info');
      }
    } catch (err) {
      console.error('Failed to apply proactive suggestion', err);
      showToast(language === 'zh' ? '操作失败，建议已恢复' : 'Action failed; suggestion restored', 'error');
    } finally {
      setProactiveRefreshKey(k => k + 1);
    }
  };

  // --- UX S6: AI actions ----------------------------------------------------
  // The backend /api/ai/action endpoint owns the prompts and JSON parsing;
  // this wrapper only carries the user's own provider credentials and turns
  // "not configured" into a friendly message (design: 后端可关).
  const runAiAction = async (action: AiActionKind, input: string, context?: string) => {
    if (!aiApiKey || !aiBaseUrl) {
      throw new Error(language === 'zh' ? '请先在设置里配置 AI 提供商' : 'Configure an AI provider in Settings first');
    }
    const { result } = await aiApi.action({ action, apiKey: aiApiKey, model: aiModel || undefined, baseUrl: aiBaseUrl, input, context });
    return result;
  };

  const refreshDayFromServer = async () => {
    const data = await filesApi.get(currentFileDate);
    if (data) {
      setMarkdown(data.content);
      setTasks(data.tasks as Task[]);
      setLastSyncedMD(data.content);
      setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
    }
  };

  /** Brainstorm extract — returns the preview list instead of creating tasks. */
  const extractBrainDump = async (text: string): Promise<BrainPreviewTask[]> => {
    setIsProcessingBrainDump(true);
    try {
      const result = await runAiAction('split_tasks', text);
      const arr = Array.isArray(result) ? result : [];
      const extracted: BrainPreviewTask[] = [];
      arr.slice(0, 12).forEach((item: any, idx: number) => {
        const title = String(item?.title ?? '').trim();
        if (!title) return;
        const deadline = typeof item?.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.deadline)
          ? item.deadline
          : undefined;
        extracted.push({ id: `bp_${Date.now()}_${idx}`, title, deadline });
      });
      if (extracted.length === 0) {
        showToast(language === 'zh' ? 'AI 没有提取到任务' : 'AI found no tasks', 'info');
      }
      return extracted;
    } catch (e: any) {
      console.error('Brain dump extraction failed', e);
      showToast(e?.message || (language === 'zh' ? 'AI 处理失败' : 'Failed to process with AI.'), 'error');
      return [];
    } finally {
      setIsProcessingBrainDump(false);
    }
  };

  const handleBrainPreviewAdd = async (list: BrainPreviewTask[]) => {
    let created = 0;
    for (const item of list) {
      try {
        await tasksApi.create(currentFileDate, {
          id: `t_${Date.now()}_${created}`,
          title: item.title,
          status: 'todo',
          tags: [activeContext],
          source_date: currentFileDate,
          deadline: /^\d{4}-\d{2}-\d{2}$/.test(item.deadline ?? '') ? item.deadline : undefined,
        } as Task);
        created += 1;
      } catch (err) {
        console.error('Failed to create brainstorm task', err);
      }
    }
    setBrainPreviewTasks(null);
    setBrainDumpText('');
    if (created > 0) {
      try { await refreshDayFromServer(); } catch { /* non-fatal */ }
      await todayItemsQuery.refetch();
      showToast(language === 'zh' ? `已加入 ${created} 个任务` : `Added ${created} tasks`, 'success');
    } else {
      showToast(language === 'zh' ? '添加失败' : 'Failed to add tasks', 'error');
    }
  };

  const handleBrainPreviewRewrite = async (id: string) => {
    const item = brainPreviewTasks?.find(task => task.id === id);
    if (!item || rewritingPreviewId) return;
    setRewritingPreviewId(id);
    try {
      const result = await runAiAction('rewrite_task', item.title) as { title?: string };
      const title = typeof result?.title === 'string' && result.title.trim() ? result.title.trim() : item.title;
      setBrainPreviewTasks(prev => (prev ? prev.map(task => (task.id === id ? { ...task, title } : task)) : prev));
    } catch (e: any) {
      console.error('Rewrite failed', e);
      showToast(e?.message || (language === 'zh' ? '改写失败' : 'Rewrite failed'), 'error');
    } finally {
      setRewritingPreviewId(null);
    }
  };

  const handleBrainPreviewRemove = (id: string) => {
    setBrainPreviewTasks(prev => {
      const next = prev ? prev.filter(task => task.id !== id) : null;
      return next && next.length > 0 ? next : null;
    });
  };

  const handleAskAi = async (question: string) => {
    const openList = todayTasks.filter(task => task.status === 'todo').slice(0, 20);
    const context = openList.map(task => `- ${task.title}${task.deadline ? ` (due ${task.deadline})` : ''}`).join('\n');
    try {
      const result = await runAiAction('ask', question, context) as { answer?: string; suggestedTask?: { title?: string } };
      setAiAnswer({
        answer: (result?.answer ?? '').trim() || (language === 'zh' ? '（AI 没有给出回答）' : '(No answer from AI)'),
        suggestedTitle: result?.suggestedTask?.title?.trim() || undefined,
      });
    } catch (e: any) {
      console.error('AI ask failed', e);
      showToast(e?.message || (language === 'zh' ? 'AI 问答失败' : 'AI ask failed'), 'error');
    }
  };

  const handleAnswerAdopt = (title: string) => {
    setAiAnswer(null);
    void handleQuickAddTask({ title, tags: [activeContext] });
  };

  const handleAiPickFocus = async () => {
    const openList = todayTasks.filter(task => task.status === 'todo');
    if (openList.length <= 3) {
      updateFocusTaskIds(openList.map(task => task.id));
      return;
    }
    const input = JSON.stringify(openList.map(task => ({
      id: task.id,
      title: task.title,
      deadline: task.deadline,
      priority: task.priority,
    })));
    const result = await runAiAction('pick_focus', input) as { ids?: string[] };
    const picked = (result?.ids ?? []).filter(id => openList.some(task => task.id === id)).slice(0, 3);
    if (picked.length === 0) {
      throw new Error(language === 'zh' ? 'AI 没有选中任何任务' : 'AI picked nothing valid');
    }
    updateFocusTaskIds(picked);
    showToast(language === 'zh' ? 'AI 已选好今天的焦点' : 'AI picked your focus', 'success');
  };

  const handleTaskAiAction = async (task: Task, action: 'decompose' | 'rewrite' | 'summarize') => {
    const body = [task.title, task.description].filter(Boolean).join('\n');
    try {
      if (action === 'decompose') {
        const result = await runAiAction('split_tasks', body);
        const arr = Array.isArray(result) ? result : [];
        const subtasks = arr
          .map((item: any) => String(item?.title ?? '').trim())
          .filter(Boolean)
          .slice(0, 8);
        if (subtasks.length === 0) {
          showToast(language === 'zh' ? 'AI 没有拆出子任务' : 'AI produced no subtasks', 'info');
          return;
        }
        for (const [idx, title] of subtasks.entries()) {
          try {
            await tasksApi.create(currentFileDate, {
              id: `t_${Date.now()}_${idx}`,
              title,
              status: 'todo',
              tags: task.tags?.length ? [...task.tags] : [activeContext],
              source_date: currentFileDate,
              parentTaskId: task.id,
              deadline: task.deadline,
            } as Task);
          } catch (err) {
            console.error('Failed to create subtask', err);
          }
        }
        await refreshDayFromServer();
        await todayItemsQuery.refetch();
        showToast(language === 'zh' ? `已拆解出 ${subtasks.length} 个子任务` : `Added ${subtasks.length} subtasks`, 'success');
      } else if (action === 'rewrite') {
        const result = await runAiAction('rewrite_task', body) as { title?: string; description?: string };
        const title = typeof result?.title === 'string' && result.title.trim() ? result.title.trim() : task.title;
        await handleEditTask(task.id, {
          title,
          ...(typeof result?.description === 'string' && result.description.trim() ? { description: result.description.trim() } : {}),
        }, task.host_date);
      } else {
        const comments = (task.comments ?? []).map(comment => comment.text).join('\n');
        const result = await runAiAction('summarize_task', body, comments || undefined) as { summary?: string };
        const summary = (result?.summary ?? '').trim();
        if (!summary) throw new Error(language === 'zh' ? 'AI 没有给出总结' : 'AI produced no summary');
        const now = new Date();
        const pad = (value: number) => String(value).padStart(2, '0');
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        await handleEditTask(task.id, {
          comments: [...(task.comments ?? []), { text: summary, timestamp: stamp }],
        }, task.host_date);
      }
    } catch (e: any) {
      console.error('Task AI action failed', e);
      showToast(e?.message || (language === 'zh' ? 'AI 操作失败' : 'AI action failed'), 'error');
    }
  };


  // When date changes, load tasks
  const handleToggleTask = async (id: string, hostDate?: string) => {
    const targetDate = hostDate ?? currentFileDate;
    const task = hostDate && hostDate !== currentFileDate
      ? earlierOpenTasks.find(t => t.id === id && t.host_date === hostDate)
      : projectedTodayTasks?.find(t => t.id === id) ?? tasks.find(t => t.id === id);
    if (!task) return;
    const newStatus = task.status === 'todo' ? 'done' : 'todo';
    const wasUndone = task.status !== 'done';
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (task.originMindmapId && task.originNodeId) {
          if (newStatus === 'done') {
            await eventsApi.completeNodeTask({ taskId: id, scheduledDate: targetDate });
          } else {
            await eventsApi.undoCompleteNodeTask({ taskId: id, scheduledDate: targetDate });
          }
        } else {
          await tasksApi.updateStatus(id, targetDate, newStatus);
        }
        if (targetDate === currentFileDate) {
          setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
        } else {
          setEarlierOpenTasks(prev => prev.filter(t => !(t.id === id && t.host_date === targetDate)));
        }
        // Refresh markdown after task change
        const data = await filesApi.get(targetDate);
        if (data) {
          if (targetDate === currentFileDate) {
            setMarkdown(data.content);
            setTasks(data.tasks as Task[]);
            setLastSyncedMD(data.content);
          }
          setFilesMap(prev => ({ ...prev, [targetDate]: data.content }));
        }
        await todayItemsQuery.refetch();
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
          const data = await filesApi.get(targetDate);
          if (data) {
            if (targetDate === currentFileDate) {
              setMarkdown(data.content);
              setTasks(data.tasks as Task[]);
              setLastSyncedMD(data.content);
            }
            setFilesMap(prev => ({ ...prev, [targetDate]: data.content }));
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
    },
    hostDate?: string
  ) => {
    const targetDate = hostDate ?? currentFileDate;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await tasksApi.edit(id, targetDate, updates);
        // 成功后重新拉取最新 markdown，避免和别人的并发编辑漂移
        const data = await filesApi.get(targetDate);
        if (data) {
          if (targetDate === currentFileDate) {
            setMarkdown(data.content);
            setTasks(data.tasks as Task[]);
            setLastSyncedMD(data.content);
          } else {
            const refreshed = (data.tasks as Task[]).find(task => task.id === id);
            if (refreshed) {
              setEarlierOpenTasks(prev => prev.map(task =>
                task.id === id && task.host_date === targetDate
                  ? { ...refreshed, host_date: targetDate }
                  : task
              ));
            }
          }
          setFilesMap(prev => ({ ...prev, [targetDate]: data.content }));
        }
        showToast(language === 'zh' ? '任务已更新' : 'Task updated', 'success');
        await todayItemsQuery.refetch();
        return;
      } catch (e: any) {
        lastError = e;
        // 404 通常意味着 task id 已失效（文件被外部重写），重试前先同步一次
        if (e?.status === 404) {
          try {
            const data = await filesApi.get(targetDate);
            if (data) {
              if (targetDate === currentFileDate) {
                setMarkdown(data.content);
                setTasks(data.tasks as Task[]);
                setLastSyncedMD(data.content);
              }
              setFilesMap(prev => ({ ...prev, [targetDate]: data.content }));
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
      const data = await filesApi.get(targetDate);
      if (data) {
        if (targetDate === currentFileDate) {
          setMarkdown(data.content);
          setTasks(data.tasks as Task[]);
          setLastSyncedMD(data.content);
        }
        setFilesMap(prev => ({ ...prev, [targetDate]: data.content }));
      }
    } catch {}
    showToast(language === 'zh' ? '更新失败，请重试' : 'Failed to update task — please retry', 'error');
  };

  // S2: bottom input bar submits here — optimistic row, server create,
  // re-read for stable ids, optional recurrence rule, projection refetch.
  const handleQuickAddTask = async (draft: QuickTaskDraft) => {
    const newTask: Task = {
      id: `t_${Date.now()}`,
      title: draft.title,
      description: draft.description,
      status: 'todo',
      tags: draft.tags,
      deadline: draft.deadline,
      source_date: currentFileDate,
    };
    // Optimistic UI update
    setTasks(prev => [...prev, newTask]);
    const newCategory = draft.tags.filter(t => !['work', 'life', 'tasks'].includes(t))[0];
    if (newCategory) setLastAddedCategory(newCategory);
    try {
      await tasksApi.create(currentFileDate, newTask);
      const data = await filesApi.get(currentFileDate);
      if (data) {
        setMarkdown(data.content);
        setTasks(data.tasks as Task[]);
        setLastSyncedMD(data.content);
        setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
      }
      if (draft.recurrence) {
        try {
          await recurringApi.create({
            title: draft.title,
            description: draft.description,
            tags: draft.tags,
            recurrence: draft.recurrence,
          });
        } catch (e) {
          console.error('Failed to create recurring task', e);
          showToast(language === 'zh' ? '任务已添加，但重复规则保存失败' : 'Task added, but recurrence could not be saved', 'error');
        }
      }
      showToast(language === 'zh' ? '任务已添加' : 'Task added', 'success');
      await todayItemsQuery.refetch();
    } catch (e) {
      console.error('Failed to add task', e);
      // Roll back the optimistic row on failure.
      setTasks(prev => prev.filter(task => task.id !== newTask.id));
      showToast(language === 'zh' ? '添加失败' : 'Failed to add task', 'error');
    }
  };

  /** UX S7: task → new project event, then jump into its canvas. */
  const handleConvertTaskToProject = async (task: Task, opts: { title: string; extraNodes: string[] }) => {
    try {
      const result = await eventsApi.convertTaskToEvent({
        taskId: task.id,
        scheduledDate: task.host_date || currentFileDate,
        title: opts.title,
        context: (activeContext as 'work' | 'life'),
        extraNodes: opts.extraNodes,
      });
      await todayItemsQuery.refetch();
      showToast(language === 'zh' ? '项目已创建' : 'Project created', 'success');
      setRequestedEventId(result.eventId);
      setActiveTab('events');
    } catch (e: any) {
      console.error('Convert to project failed', e);
      showToast(e?.message || (language === 'zh' ? '转成项目失败' : 'Failed to convert to project'), 'error');
    }
  };

  const handleUnlinkFromSpace = async (id: string, hostDate?: string) => {
    const targetDate = hostDate ?? currentFileDate;
    try {
      await tasksApi.updateSpace(id, null, targetDate);
      const data = await filesApi.get(targetDate);
      if (data) {
        if (targetDate === currentFileDate) {
          setMarkdown(data.content);
          setTasks(data.tasks as Task[]);
          setLastSyncedMD(data.content);
        }
        setFilesMap(prev => ({ ...prev, [targetDate]: data.content }));
      }
      showToast(language === 'zh' ? '已移出事件' : 'Removed from event', 'success');
      await todayItemsQuery.refetch();
    } catch (e) {
      console.error('Failed to remove task from event', e);
      showToast(language === 'zh' ? '移出事件失败' : 'Failed to remove from event', 'error');
    }
  };

  const handleDeleteTask = async (id: string, hostDate?: string) => {
    const targetDate = hostDate ?? currentFileDate;
    try {
      await tasksApi.delete(id, targetDate);
      // Refresh markdown and re-sync tasks
      const data = await filesApi.get(targetDate);
      if (data) {
        if (targetDate === currentFileDate) {
          setMarkdown(data.content);
          setTasks(data.tasks as Task[]);
          setLastSyncedMD(data.content);
        } else {
          setEarlierOpenTasks(prev => prev.filter(task => !(task.id === id && task.host_date === targetDate)));
        }
        setFilesMap(prev => ({ ...prev, [targetDate]: data.content }));
      }
      showToast(language === 'zh' ? '任务已删除' : 'Task deleted', 'success');
      await todayItemsQuery.refetch();
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

  // ---------------------------------------------------------------------
  // Daily reflection (Sprint 1 Gap 5 — Daily 闭环)
  //
  // Splits the in-memory tasks by status so the modal can pre-fill today's
  // completed / in-progress / postponed lists. Auto-triggered after the
  // day rolls over; also reachable from the "今日复盘" button in TodayScopeTabs.
  // ---------------------------------------------------------------------

  const buildReflectionTasks = (): {
    completed: DailyReflectionTask[];
    inProgress: DailyReflectionTask[];
    postponed: DailyReflectionTask[];
  } => {
    const completed: DailyReflectionTask[] = [];
    const inProgress: DailyReflectionTask[] = [];
    const postponed: DailyReflectionTask[] = [];
    for (const task of tasks) {
      const item: DailyReflectionTask = {
        id: task.id,
        title: task.title,
        tags: task.tags,
      };
      if (task.status === 'done') {
        completed.push(item);
      } else if (task.status === 'migrated') {
        postponed.push({ ...item, reason: task.source_date ? `已迁移自 ${task.source_date}` : undefined });
      } else {
        inProgress.push({ ...item, progress: task.deadline ? `截止 ${task.deadline}` : undefined });
      }
    }
    return { completed, inProgress, postponed };
  };

  const handleOpenReflection = useCallback(() => {
    setReflectionDate(todayStr);
    setShowDailyReflection(true);
  }, [todayStr]);

  useEffect(() => {
    kbActionsRef.current = { reflection: handleOpenReflection, rollover: handleManualRollover };
  }, [handleOpenReflection, handleManualRollover]);

  const handleSaveReflection = useCallback(
    async (params: {
      date: string;
      reflection: string;
      snapshot: import('./api/client').DailyReportSnapshot;
    }) => {
      setSavingDailyReflection(true);
      try {
        const summary = await reportsApi.generateDaily(params.date, params.reflection, params.snapshot);
        setLastDailySummary(summary);
        showToast(
          language === 'zh' ? `已写入 ${summary.filePath}` : `Saved to ${summary.filePath}`,
          'success'
        );
      } catch (err) {
        console.error('Failed to save daily report', err);
        showToast(language === 'zh' ? '日报保存失败' : 'Failed to save daily report', 'error');
        throw err;
      } finally {
        setSavingDailyReflection(false);
      }
    },
    [language, showToast],
  );

    const handleConfirmRollover = async () => {
    setIsRollingOver(true);
    try {
      const result = await rolloverApi.apply(currentFileDate, activeContext);
      setShowRolloverPreview(false);
      setRolloverPreview(null);
      showToast(
        language === 'zh' ? '已归档昨日，进入今日' : 'Yesterday archived — welcome to today',
        'success'
      );
      // Refresh the just-archived day so the modal sees the final state.
      const data = await filesApi.get(currentFileDate);
      if (data) {
        setMarkdown(data.content);
        setTasks(data.tasks as Task[]);
        setLastSyncedMD(data.content);
        setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
      }
      await refreshEarlierOpenTasks();
      // S12: offer a quiet prompt bar for the day that was just archived
      // instead of interrupting with an auto-opened modal.
      if (!isReflectionPromptOptedOut()) {
        const doneCount = (data?.tasks as Task[] ?? []).filter(t => t.status === 'done').length;
        setReflectionBar({ date: currentFileDate, completedCount: doneCount });
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
  const currentVisibleTasks = contextFilteredTasks.filter(t => t.status !== 'migrated');
  const earlierVisibleTasks = currentFileDate === getTodayStr()
    ? filterTasksByContext(earlierOpenTasks, activeContext).filter(t => t.status === 'todo')
    : [];
  // Today is an execution surface, not merely a rendering of today's file.
  // Keep unfinished standalone tasks from earlier Daily notes visible until
  // the user completes, deletes, or explicitly rolls them into today.
  // The Event adapter is the canonical Today projection. It preserves the
  // source Event, node breadcrumb and inherited category tags even after a
  // reload. Keep the legacy task parse only as a resilient loading fallback.
  const todayTasks = [...(projectedTodayTasks ?? currentVisibleTasks), ...earlierVisibleTasks];

  // Prune focus picks whose tasks are no longer open so stale ids cannot
  // occupy the 3 slots (design v3.1 focus row stays usable all day).
  const openTodayTaskIds = useMemo(
    () => new Set(todayTasks.filter(task => task.status === 'todo').map(task => task.id)),
    [todayTasks],
  );
  useEffect(() => {
    const kept = focusTaskIds.filter(id => openTodayTaskIds.has(id));
    if (kept.length !== focusTaskIds.length) updateFocusTaskIds(kept);
  }, [focusTaskIds, openTodayTaskIds, updateFocusTaskIds]);
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

  const handleRestartNow = async () => {
    try {
      await relaunchApp();
    } catch (error) {
      console.error('Failed to relaunch:', error);
      showToast(language === 'zh' ? '重启失败，请手动重启应用' : 'Relaunch failed. Please restart the app manually.', 'error');
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

      <DailyReflectionModal
        show={showDailyReflection}
        date={reflectionDate}
        language={language}
        completedTasks={buildReflectionTasks().completed}
        inProgressTasks={buildReflectionTasks().inProgress}
        postponedTasks={buildReflectionTasks().postponed}
        saving={savingDailyReflection}
        lastSaved={lastDailySummary}
        showToast={showToast}
        onClose={() => {
          setShowDailyReflection(false);
          setLastDailySummary(null);
        }}
        onConfirm={handleSaveReflection}
      />

      <Sidebar
        language={language}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={activeOverlay ?? activeTab}
        setActiveTab={(tab) => {
          if (tab === 'today' || tab === 'events') setActiveTab(tab);
          else setActiveOverlay(tab);
        }}
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
          ) : (
            <button
              type="button"
              onClick={() => setShowWorkspaceSetup(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background/70 px-2.5 py-2 text-left text-xs font-medium text-text-heading transition-colors hover:border-border-strong hover:bg-background"
              aria-label={language === 'zh' ? '选择工作区' : 'Choose workspace'}
              data-testid="workspace-choose"
            >
              <FolderOpen className="h-4 w-4 text-text-muted" aria-hidden="true" />
              <span>{language === 'zh' ? '选择工作区' : 'Choose workspace'}</span>
            </button>
          )
        }
        activeContext={activeContext}
        onContextChange={setActiveContext}
        onOpenSettings={() => setShowSettings(true)}
        onOpenNotesSurface={(surface) => { setActiveOverlay('notes'); setNotesSurface(surface); }}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
      />

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col h-dvh bg-[var(--color-background)] relative overflow-hidden min-w-0 w-full transition-[margin,colors] duration-300 ${!isSidebarOpen ? 'sidebar-collapsed-main' : ''}`}>
        {/* Floating toggle button — show sidebar when hidden (Codex style) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="sidebar-reveal-button absolute left-3 top-3 z-20 flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-border bg-surface-elevated text-text-main shadow-sm transition-all hover:border-border-strong hover:text-text-heading active:scale-95 md:h-auto md:w-auto md:p-2"
            title={language === 'zh' ? '显示侧边栏' : 'Show sidebar'}
            aria-label={language === 'zh' ? '显示侧边栏' : 'Show sidebar'}
            data-testid="sidebar-reveal"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Every primary workspace uses the available pane width. Notes,
            AI Chat, Calendar and AI-Native own their internal scrolling; Today keeps
            page padding but must not be constrained to document-reading
            width. A `max-w-3xl` wrapper left nearly half of a 1920px window
            empty and made the dashboard cards look like a narrow island. */}
        <div className="flex-1 w-full min-h-0 overflow-hidden">
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
                    className="mx-auto max-w-4xl space-y-6"
                  >
                    <header className="space-y-3 border-b border-border/60 pb-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-surface p-0.5">
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
                        </div>
                      </div>
                    </header>

                  <TodayProactiveBanner
                    language={language}
                    activeTab={activeTab}
                    currentFileDate={currentFileDate}
                    isToday={currentFileDate === getTodayStr()}
                    refreshKey={proactiveRefreshKey}
                    onApplySuggestion={handleApplySuggestion}
                    onDismissAll={() => setProactiveRefreshKey(k => k + 1)}
                  />

                  {reflectionBar && (
                    <TodayReflectionBar
                      date={reflectionBar.date}
                      completedCount={reflectionBar.completedCount}
                      language={language}
                      onWrite={() => {
                        setReflectionDate(reflectionBar.date);
                        setShowDailyReflection(true);
                        setReflectionBar(null);
                      }}
                      onDismiss={() => setReflectionBar(null)}
                      onOptOut={() => {
                        try { localStorage.setItem('dailyflow:reflection:promptOptOut', '1'); } catch { /* private mode */ }
                        setReflectionBar(null);
                      }}
                    />
                  )}

                  <TodayFocusBar
                    tasks={todayTasks}
                    focusTaskIds={focusTaskIds}
                    onChange={updateFocusTaskIds}
                    language={language}
                    isToday={currentFileDate === getTodayStr()}
                    onAiPick={() => handleAiPickFocus()}
                  />

                  <TodayBacklog
                    tasks={todayTasks}
                    planningGroups={todayPlanningGroups}
                    onOpenPlanningGroup={(group, nodeId) => {
                      setRequestedEventId(group.spaceId ?? group.id);
                      setRequestedNodeId(nodeId ?? null);
                      setActiveTab('events');
                    }}
                    selectedDate={currentFileDate}
                    categories={categories}
                    onToggleTask={handleToggleTask}
                    onEditTask={handleEditTask}
                    onDeleteTask={handleDeleteTask}
                    onCreateLinkedNote={(taskId) => {
                      setEditingDailyNote(null);
                      setPrefillLinkedTaskId(taskId);
                      setShowQuickNoteEditor(true);
                    }}
                    onUnlinkFromSpace={handleUnlinkFromSpace}
                    onAiAction={handleTaskAiAction}
                    onConvertToProject={handleConvertTaskToProject}
                    onShowLinkedNotes={(taskId) => {
                      setNotesFilterByTaskId(taskId);
                      setActiveOverlay('notes');
                    }}
                    linkedNotesCount={(taskId) => taskLinkedNotesCount[taskId] || 0}
                    onAddTask={() => taskInputFocusRef.current?.()}
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

                  <TodayInputBar
                    language={language}
                    activeContext={activeContext}
                    categories={categories}
                    brainDumpText={brainDumpText}
                    setBrainDumpText={setBrainDumpText}
                    isProcessingBrainDump={isProcessingBrainDump}
                    onBrainExtract={extractBrainDump}
                    brainPreviewTasks={brainPreviewTasks}
                    onBrainPreviewAdd={(list) => void handleBrainPreviewAdd(list)}
                    onBrainPreviewRewrite={(id) => void handleBrainPreviewRewrite(id)}
                    onBrainPreviewRemove={handleBrainPreviewRemove}
                    onBrainPreviewCancel={() => setBrainPreviewTasks(null)}
                    rewritingPreviewId={rewritingPreviewId}
                    onAsk={(question) => void handleAskAi(question)}
                    aiAnswer={aiAnswer}
                    onAnswerAdopt={handleAnswerAdopt}
                    onAnswerClose={() => setAiAnswer(null)}
                    brainModeSignal={brainModeSignal}
                    onAddTask={handleQuickAddTask}
                    onRegisterFocus={(focus) => { taskInputFocusRef.current = focus; }}
                  />
                  </motion.div>
                </div>
              ) : (
                <motion.div
                  key="events"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="h-full min-h-0 overflow-hidden"
                >
                  <EventsView
                    language={language}
                    context={activeContext}
                    onNotice={showToast}
                    requestedEventId={requestedEventId}
                    onRequestedEventHandled={() => setRequestedEventId(null)}
                    requestedNodeId={requestedNodeId}
                    onRequestedNodeHandled={() => setRequestedNodeId(null)}
                  />
                </motion.div>
              )
            )}
          </div>
        </div>


      </main>
      <EntityContextDrawer ref={entityDrawerRef} onClose={() => setEntityDrawerRef(null)} />

      {/* UX S5: everything except Today (home) and Events (canvas) is an
          overlay. Esc or the backdrop closes it and lands back on home. */}
      <AnimatePresence>
        {activeOverlay && (
          <motion.div
            key="workspace-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 flex items-center justify-center p-0 md:p-6"
            data-testid="workspace-overlay"
          >
            <div
              className="absolute inset-0 bg-black/25"
              onClick={() => setActiveOverlay(null)}
              data-testid="overlay-backdrop"
            />
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="relative flex h-full w-full flex-col overflow-hidden rounded-none border border-border bg-background shadow-2xl md:rounded-xl"
              data-testid={`overlay-${activeOverlay}`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {activeOverlay === 'notes'
                    ? (language === 'zh' ? '笔记' : 'Notes')
                    : activeOverlay === 'ai-chat'
                      ? (language === 'zh' ? '问 AI' : 'Ask AI')
                      : activeOverlay === 'calendar'
                        ? (language === 'zh' ? '日历' : 'Calendar')
                        : activeOverlay === 'memory'
                          ? (language === 'zh' ? '记忆' : 'Memory')
                          : (language === 'zh' ? '团队' : 'Team')}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveOverlay(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-black/5 hover:text-text-heading"
                  aria-label={language === 'zh' ? '关闭浮层' : 'Close overlay'}
                  data-testid="overlay-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {activeOverlay === 'notes' ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-background/95 px-1 py-2">
                      {([
                        ['notes', language === 'zh' ? '笔记' : 'Notes'],
                        ['inbox', language === 'zh' ? '待处理来源' : 'Inbox'],
                      ] as const).map(([surface, label]) => (
                        <button key={surface} onClick={() => setNotesSurface(surface)} className={`min-h-[44px] rounded-md px-3 py-1.5 text-sm font-medium md:min-h-0 md:text-xs ${notesSurface === surface ? 'bg-accent text-white' : 'text-text-muted hover:bg-black/5'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      {notesSurface === 'inbox' ? <InboxView language={language} /> : <NotesView language={language} sidebarOpen={isSidebarOpen} onNotice={showToast} requestedNoteId={requestedV2NoteId} />}
                    </div>
                  </div>
                ) : activeOverlay === 'ai-chat' ? (
                  <div className="h-full">
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
                      onCreateMeetingNote={() => void openMeetingNote()}
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
                  </div>
                ) : activeOverlay === 'calendar' ? (
                  <div className="h-full min-h-0 overflow-hidden px-4 pb-4 pt-4 md:px-8 md:pb-8 md:pt-6" data-testid="calendar-page">
                    <CalendarWorkspace
                      date={currentFileDate}
                      setDate={setCurrentFileDate}
                      language={language}
                      onOpenLocalDate={(date) => {
                        setCurrentFileDate(date);
                        setActiveOverlay(null);
                        setActiveTab('today');
                      }}
                      onManageConnections={() => {
                        setConfigTab('sync');
                        setShowSettings(true);
                      }}
                    />
                  </div>
                ) : activeOverlay === 'memory' ? (
                  <div className="h-full min-h-0 overflow-hidden">
                    <MemoryView workspaceId={activeWorkspaceId || 'default'} language={language} />
                  </div>
                ) : (
                  <div className="h-full min-h-0 overflow-hidden">
                    <TeamView language={language} showToast={showToast} />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        language={language}
        tasks={todayTasks}
        notes={dailyNotes}
        events={(eventsQuery.data?.events ?? []).map(event => ({ id: event.id, title: event.title }))}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectTask={() => setActiveTab('today')}
        onSelectNote={(id) => {
          setActiveOverlay('notes');
          setNotesSurface('notes');
          window.setTimeout(() => window.dispatchEvent(new CustomEvent('df:select-note', { detail: { id } })), 0);
        }}
        onSelectEvent={(id) => {
          setRequestedEventId(id);
          setActiveTab('events');
        }}
        onSelectWorkspace={(id) => void handleSwitchWorkspace(id)}
        onCommand={(command: CommandId) => {
          if (command === 'reflection') handleOpenReflection();
          else if (command === 'rollover') void handleManualRollover();
          else if (command === 'calendar') setActiveOverlay('calendar');
          else if (command === 'memory') setActiveOverlay('memory');
          else if (command === 'team') setActiveOverlay('team');
          else if (command === 'settings') setShowSettings(true);
          else if (command === 'toggle-context') setActiveContext(prev => (prev === 'work' ? 'life' : 'work'));
          else if (command === 'check-updates') void checkForUpdates().then(info => {
            if (info.hasUpdate) {
              setUpdateInfo(info);
              setShowUpdateModal(true);
            } else {
              showToast(language === 'zh' ? '已是最新版本' : 'Already up to date', 'info');
            }
          }).catch(err => console.error('Update check failed', err));
        }}
      />

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
          language={language}
          updateInfo={updateInfo}
          onClose={handleCloseUpdateModal}
          onUpdate={handleUpdate}
          onSkipVersion={handleSkipVersion}
          alreadyDownloaded={bgDownloadDone}
        />
      )}

      {/* Non-blocking background update pill */}
      {updateInfo && !showUpdateModal && !bgDownloadDone && !bgDownloadError && bgDownloadProgress > 0 && (
        <div className="fixed bottom-4 right-4 z-40 flex w-64 flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-800">
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-600 dark:text-stone-400">
              {language === 'zh' ? `正在后台下载 v${updateInfo.latestVersion}` : `Downloading v${updateInfo.latestVersion}`}
            </span>
            <span className="font-medium text-stone-900 dark:text-stone-100">{bgDownloadProgress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${bgDownloadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Update ready pill */}
      {updateInfo && !showUpdateModal && bgDownloadDone && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-800">
          <span className="text-sm text-stone-700 dark:text-stone-300">
            {language === 'zh' ? `v${updateInfo.latestVersion} 已下载完成` : `v${updateInfo.latestVersion} ready`}
          </span>
          <button
            onClick={handleRestartNow}
            className="rounded bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
          >
            {language === 'zh' ? '立即重启' : 'Restart Now'}
          </button>
          <button
            onClick={() => setShowUpdateModal(true)}
            className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-300"
          >
            {language === 'zh' ? '详情' : 'Details'}
          </button>
        </div>
      )}

       {/* Quick Note Editor */}
       {showQuickNoteEditor && (
         <div className="fixed inset-0 z-50 bg-black/15 d flex items-center justify-center p-4 sm:p-8">
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
                setActiveOverlay('ai-chat');
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

      </div>
    </WorkspaceScopeProvider>
   );
}
