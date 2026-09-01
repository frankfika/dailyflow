export const queryKeys = {
  workspace: (workspaceId: string) => ['workspace', workspaceId] as const,
  notesRoot: (workspaceId: string) => ['workspace', workspaceId, 'notes'] as const,
  today: (workspaceId: string, date: string) => ['workspace', workspaceId, 'today', date] as const,
  notes: (workspaceId: string, filters: object = {}) => [...queryKeys.notesRoot(workspaceId), filters] as const,
  note: (workspaceId: string, noteId: string) => ['workspace', workspaceId, 'note', noteId] as const,
  commitmentsRoot: (workspaceId: string) => ['workspace', workspaceId, 'commitments'] as const,
  commitments: (workspaceId: string, filters: object = {}) => [...queryKeys.commitmentsRoot(workspaceId), filters] as const,
  commitment: (workspaceId: string, id: string) => ['workspace', workspaceId, 'commitment', id] as const,
  plan: (workspaceId: string, date: string) => ['workspace', workspaceId, 'plan', date] as const,
  inbox: (workspaceId: string) => ['workspace', workspaceId, 'inbox'] as const,
  proposalsRoot: (workspaceId: string) => ['workspace', workspaceId, 'proposals'] as const,
  proposals: (workspaceId: string, filters: object = {}) => [...queryKeys.proposalsRoot(workspaceId), filters] as const,
  memory: (workspaceId: string, query: string) => ['workspace', workspaceId, 'memory', query] as const,
  calendar: (workspaceId: string, range: object) => ['workspace', workspaceId, 'calendar', range] as const,
  jobsRoot: (workspaceId: string) => ['workspace', workspaceId, 'jobs'] as const,
  jobs: (workspaceId: string, filters: object = {}) => [...queryKeys.jobsRoot(workspaceId), filters] as const,
  job: (workspaceId: string, jobId: string) => ['workspace', workspaceId, 'job', jobId] as const,
  eventsRoot: () => ['events'] as const,
  events: (filters: object = {}) => [...queryKeys.eventsRoot(), 'list', filters] as const,
  event: (id: string) => ['events', 'detail', id] as const,
  todayItemsRoot: () => ['today-items'] as const,
  todayItems: (date: string, context: string) => [...queryKeys.todayItemsRoot(), date, context] as const,
  standaloneTasks: (filters: object = {}) => ['standalone-tasks', filters] as const,
  // Topic Space v2 (Phase 1). Not workspace-scoped: a topic space is
  // global to a context (work / life / unclassified), and the same
  // server endpoint serves every workspace.
  topicSpacesRoot: () => ['topic-spaces'] as const,
  topicSpaces: (filters: object = {}) => [...queryKeys.topicSpacesRoot(), filters] as const,
  /** Cross-date task list for a topic space (Phase 3). */
  // Mind map (Phase 2). The server endpoint is `/api/mindmaps/:id`; we
  // don't yet have a query layer for it, but the cache key is reserved
  // for the upcoming `useMindMap` work.
  mindmap: (id: string) => ['mindmap', id] as const,
  // Root key for task list queries. We currently fetch tasks via
  // `tasksApi.getByDate`, so this is mostly a placeholder for the
  // React Query integration.
  tasksRoot: () => ['tasks'] as const,
};
