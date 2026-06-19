import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { workspacesApi } from '../api/client';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

vi.mock('lucide-react', () => ({
  ChevronsUpDown: () => React.createElement('span', { 'data-testid': 'icon-chevron' }),
  Check: () => React.createElement('span', { 'data-testid': 'icon-check' }),
  FolderOpen: () => React.createElement('span', { 'data-testid': 'icon-folder' }),
  FolderPlus: () => React.createElement('span', { 'data-testid': 'icon-folder-plus' }),
  Pencil: () => React.createElement('span', { 'data-testid': 'icon-pencil' }),
  Trash2: () => React.createElement('span', { 'data-testid': 'icon-trash' }),
  Sparkles: () => React.createElement('span', { 'data-testid': 'icon-sparkles' }),
  Loader2: () => React.createElement('span', { 'data-testid': 'icon-loader' }),
}));

describe.sequential('WorkspaceSwitcher', () => {
  const workspaces = [
    { id: 'ws_a', name: 'Alpha', path: '/alpha', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'ws_b', name: 'Beta', path: '/beta', createdAt: '2024-01-02T00:00:00Z' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(workspacesApi, 'discover').mockResolvedValue({ candidates: [] });
  });

  it('saves rename on blur', async () => {
    vi.spyOn(workspacesApi, 'rename').mockResolvedValue(undefined);

    render(
      <WorkspaceSwitcher
        language="en"
        workspaces={workspaces}
        activeWorkspaceId="ws_a"
        onActivate={vi.fn()}
        onRenamed={vi.fn()}
        showToast={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Alpha'));
    const pencil = screen.getAllByTestId('icon-pencil')[0];
    fireEvent.click(pencil.parentElement!);

    const input = screen.getByDisplayValue('Alpha');
    fireEvent.change(input, { target: { value: 'Alpha Edited' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(workspacesApi.rename).toHaveBeenCalledWith('ws_a', 'Alpha Edited');
    });
  });

  it('stops Escape propagation during rename', async () => {
    vi.spyOn(workspacesApi, 'rename').mockResolvedValue(undefined);
    const onActivate = vi.fn();

    render(
      <WorkspaceSwitcher
        language="en"
        workspaces={workspaces}
        activeWorkspaceId="ws_a"
        onActivate={onActivate}
        onRenamed={vi.fn()}
        showToast={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getAllByTestId('icon-pencil')[0].parentElement!);

    const input = screen.getByDisplayValue('Alpha');
    const keyDown = fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    // The dropdown should stay open and no activation should happen.
    expect(onActivate).not.toHaveBeenCalled();
    expect(keyDown).toBe(true);
  });

  it('shows confirm dialog on remove click', async () => {
    vi.spyOn(workspacesApi, 'remove').mockResolvedValue({ activeWorkspaceId: 'ws_b' });
    const onRemoved = vi.fn();

    render(
      <WorkspaceSwitcher
        language="en"
        workspaces={workspaces}
        activeWorkspaceId="ws_a"
        onActivate={vi.fn()}
        onRemoved={onRemoved}
        showToast={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getAllByTestId('icon-trash')[0].parentElement!);

    await waitFor(() => {
      expect(screen.getByText(/Remove Workspace/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Remove$/i }));
    await waitFor(() => {
      expect(workspacesApi.remove).toHaveBeenCalledWith('ws_a');
    });
    expect(onRemoved).toHaveBeenCalledWith('ws_a', 'ws_b');
  });

  it('saves rename on Enter', async () => {
    vi.spyOn(workspacesApi, 'rename').mockResolvedValue(undefined);

    render(
      <WorkspaceSwitcher
        language="en"
        workspaces={workspaces}
        activeWorkspaceId="ws_a"
        onActivate={vi.fn()}
        onRenamed={vi.fn()}
        showToast={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getAllByTestId('icon-pencil')[0].parentElement!);

    const input = screen.getByDisplayValue('Alpha');
    fireEvent.change(input, { target: { value: 'Alpha Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(workspacesApi.rename).toHaveBeenCalledWith('ws_a', 'Alpha Renamed');
    });
  });

  it('does not call onAdded when adding an existing workspace', async () => {
    vi.spyOn(workspacesApi, 'create').mockResolvedValue(workspaces[0]);
    vi.spyOn(workspacesApi, 'pickFolder').mockResolvedValue('/some/existing/path');
    const onActivate = vi.fn();
    const onAdded = vi.fn();
    const showToast = vi.fn();

    render(
      <WorkspaceSwitcher
        language="en"
        workspaces={workspaces}
        activeWorkspaceId="ws_a"
        onActivate={onActivate}
        onAdded={onAdded}
        showToast={showToast}
      />
    );

    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText(/Choose another folder/i));

    await waitFor(() => {
      expect(workspacesApi.create).toHaveBeenCalledWith('path', '/some/existing/path');
    });

    expect(onAdded).not.toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledWith('ws_a');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Switched to existing notebook'), 'success');
  });
});
