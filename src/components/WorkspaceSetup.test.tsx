import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { WorkspaceSetup } from './WorkspaceSetup';
import { workspacesApi } from '../api/client';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
}));

vi.mock('lucide-react', () => ({
  Folder: () => React.createElement('span', { 'data-testid': 'icon-folder' }),
  FolderOpen: () => React.createElement('span', { 'data-testid': 'icon-folder-open' }),
  Check: () => React.createElement('span', { 'data-testid': 'icon-check' }),
  AlertCircle: () => React.createElement('span', { 'data-testid': 'icon-alert' }),
  Loader2: () => React.createElement('span', { 'data-testid': 'icon-loader' }),
  ShieldCheck: () => React.createElement('span', { 'data-testid': 'icon-shield' }),
  Search: () => React.createElement('span', { 'data-testid': 'icon-search' }),
}));

describe.sequential('WorkspaceSetup', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-validates when Continue is clicked without a valid path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false }),
    });
    global.fetch = fetchMock as any;

    render(<WorkspaceSetup language="en" onComplete={onComplete} />);

    const input = screen.getByPlaceholderText('No folder selected');
    fireEvent.change(input, { target: { value: '/tmp/workspace' } });

    fireEvent.click(screen.getByText('Validate'));

    await waitFor(() => {
      expect(screen.getByText(/Path is invalid/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Get Started'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('creates workspace and completes after validation passes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ valid: true }) });
    global.fetch = fetchMock as any;
    vi.spyOn(workspacesApi, 'create').mockResolvedValue({ id: 'ws_1', name: 'workspace', path: '/tmp/workspace' } as any);

    render(<WorkspaceSetup language="en" onComplete={onComplete} />);

    const input = screen.getByPlaceholderText('No folder selected');
    fireEvent.change(input, { target: { value: '/tmp/workspace' } });

    fireEvent.click(screen.getByText('Validate'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Get Started'));

    await waitFor(() => {
      expect(workspacesApi.create).toHaveBeenCalledWith('workspace', '/tmp/workspace');
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('uses pickFolder result and clears previous validation', async () => {
    vi.spyOn(workspacesApi, 'pickFolder').mockResolvedValue('/chosen/folder');

    render(<WorkspaceSetup language="en" onComplete={onComplete} />);

    fireEvent.click(screen.getByText('Choose Folder…'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('/chosen/folder')).toBeInTheDocument();
    });

    expect(screen.getByText('Validate')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).not.toBeDisabled();
  });
});
