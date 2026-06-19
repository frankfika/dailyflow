import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ThinkingWorkspaces, buildWorkspaceContext, extractTaskTitles } from './ThinkingWorkspaces';
import type { ThinkingWorkspaceData, ProjectData } from '../api/client';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {
      div: ({ children, ...props }: any) => React.createElement('div', props, children),
    },
    {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return ({ children, ...props }: any) => React.createElement(prop as string, props, children);
      },
    }
  ),
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

vi.mock('lucide-react', () => ({
  BrainCircuit: () => React.createElement('span', { 'data-testid': 'icon-brain' }),
  CalendarPlus: () => React.createElement('span', { 'data-testid': 'icon-calendar-plus' }),
  CheckCircle2: () => React.createElement('span', { 'data-testid': 'icon-check-circle' }),
  Compass: () => React.createElement('span', { 'data-testid': 'icon-compass' }),
  GitBranch: () => React.createElement('span', { 'data-testid': 'icon-git-branch' }),
  Lightbulb: () => React.createElement('span', { 'data-testid': 'icon-lightbulb' }),
  Loader2: () => React.createElement('span', { 'data-testid': 'icon-loader' }),
  Map: () => React.createElement('span', { 'data-testid': 'icon-map' }),
  Plus: () => React.createElement('span', { 'data-testid': 'icon-plus' }),
  Save: () => React.createElement('span', { 'data-testid': 'icon-save' }),
  Search: () => React.createElement('span', { 'data-testid': 'icon-search' }),
  Sparkles: () => React.createElement('span', { 'data-testid': 'icon-sparkles' }),
  Trash2: () => React.createElement('span', { 'data-testid': 'icon-trash' }),
  Wand2: () => React.createElement('span', { 'data-testid': 'icon-wand' }),
}));

const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGetAll = vi.fn();
const mockGetAllProjects = vi.fn();

vi.mock('../api/client', () => ({
  aiApi: { summarize: vi.fn() },
  tasksApi: { create: vi.fn() },
  thinkingWorkspacesApi: {
    getAll: () => mockGetAll(),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
  projectsApi: {
    getAll: () => mockGetAllProjects(),
  },
}));

function makeWorkspace(partial: Partial<ThinkingWorkspaceData> = {}): ThinkingWorkspaceData {
  return {
    id: 'tw_test',
    title: 'Test Workspace',
    kind: 'workspace',
    status: 'active',
    intent: '',
    scratchpad: '',
    brief: '',
    journey: '',
    tasksMarkdown: '',
    mindmapMarkdown: '',
    timeline: [],
    taskIds: [],
    linkedNoteIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function renderComponent(props = {}) {
  return render(
    <ThinkingWorkspaces
      language="en"
      activeContext="work"
      aiApiKey=""
      aiModel=""
      aiBaseUrl=""
      currentFileDate="2024-01-01"
      showToast={vi.fn()}
      {...props}
    />
  );
}

describe('buildWorkspaceContext', () => {
  it('includes title and status', () => {
    const ws = makeWorkspace({ title: 'Plan Launch' });
    const ctx = buildWorkspaceContext(ws);
    expect(ctx).toContain('# Plan Launch');
    expect(ctx).toContain('Status: active');
  });

  it('includes non-empty sections', () => {
    const ws = makeWorkspace({
      intent: 'Grow to 1k users',
      brief: 'Goal: launch.',
      journey: 'Phase 1: build.',
      tasksMarkdown: '- [ ] task one',
    });
    const ctx = buildWorkspaceContext(ws);
    expect(ctx).toContain('## Intent\nGrow to 1k users');
    expect(ctx).toContain('## Brief\nGoal: launch.');
    expect(ctx).toContain('## Journey\nPhase 1: build.');
    expect(ctx).toContain('## Existing Tasks\n- [ ] task one');
  });

  it('omits empty sections', () => {
    const ws = makeWorkspace({ intent: 'Only intent' });
    const ctx = buildWorkspaceContext(ws);
    expect(ctx).not.toContain('## Brief');
    expect(ctx).not.toContain('## Journey');
    expect(ctx).not.toContain('## Existing Tasks');
  });
});

describe('extractTaskTitles', () => {
  it('extracts checkbox titles', () => {
    const md = '- [ ] Buy milk\n- [x] Done task\n* [ ] Star task\nplain line';
    expect(extractTaskTitles(md)).toEqual(['Buy milk', 'Done task', 'Star task']);
  });

  it('strips block references', () => {
    const md = '- [ ] Task with ref ^abc123';
    expect(extractTaskTitles(md)).toEqual(['Task with ref']);
  });

  it('returns empty array when no checkboxes', () => {
    expect(extractTaskTitles('no tasks here')).toEqual([]);
  });
});

describe('ThinkingWorkspaces component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockGetAll.mockReset();
    mockGetAllProjects.mockReset();
    mockGetAll.mockResolvedValue([makeWorkspace({ id: 'tw_1', title: 'Workspace One' })]);
    mockGetAllProjects.mockResolvedValue([
      { id: 'p_1', name: 'Project Alpha', status: 'active', createdAt: '', updatedAt: '' } as ProjectData,
    ]);
    mockUpdate.mockImplementation(async (_id, updates) => makeWorkspace({ id: 'tw_1', title: 'Workspace One', ...updates }));
  });

  it('auto-saves after debounce when user edits fields', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Workspace One')).toBeInTheDocument();
    });

    const titleInput = screen.getByDisplayValue('Workspace One');
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Workspace One Updated' } });
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'tw_1',
        expect.objectContaining({ title: 'Workspace One Updated' })
      );
    }, { timeout: 3000 });
  });

  it('shows type selector with correct options', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Workspace One')).toBeInTheDocument();
    });

    const typeSelects = screen.getAllByDisplayValue('General');
    expect(typeSelects.length).toBeGreaterThanOrEqual(2);
    const detailTypeSelect = typeSelects[typeSelects.length - 1];
    expect(detailTypeSelect.tagName.toLowerCase()).toBe('select');
    expect(screen.getAllByText('Goal').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Problem').length).toBeGreaterThanOrEqual(2);
  });

  it('shows project selector with fetched projects', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Project Alpha').length).toBeGreaterThanOrEqual(2);
    });

    const projectOptions = screen.getAllByText('Project Alpha');
    expect(projectOptions.some(el => el.tagName.toLowerCase() === 'option')).toBe(true);
  });

  it('shows confirm dialog on delete click', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Workspace One')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i })[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Delete Workspace/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    });

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('tw_1');
    });
  });
});
