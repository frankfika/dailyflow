/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptLibrary } from '../../components/PromptLibrary';
import * as client from '../../api/client';

// Mock API
vi.mock('../../api/client', () => ({
  promptsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  aiApi: {
    summarize: vi.fn(),
  },
}));

// Mock Tauri shell
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

const mockPrompts = [
  {
    id: 'prompt-1',
    name: 'Format Notes',
    prompt: 'Format the following notes in markdown',
    scope: 'format',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'prompt-2',
    name: 'Weekly Summary',
    prompt: 'Summarize the week',
    scope: 'date-range',
    createdAt: '2024-01-02T00:00:00Z',
  },
  {
    id: 'prompt-3',
    name: 'Project Report',
    prompt: 'Generate project report',
    scope: 'project',
    createdAt: '2024-01-03T00:00:00Z',
  },
];

describe('PromptLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    (client.promptsApi.getAll as any).mockResolvedValue(mockPrompts);
  });

  it('should render prompt library with prompts', async () => {
    render(<PromptLibrary language="en" />);

    await waitFor(() => {
      expect(screen.getByText('Format Notes')).toBeInTheDocument();
      expect(screen.getByText('Weekly Summary')).toBeInTheDocument();
      expect(screen.getByText('Project Report')).toBeInTheDocument();
    });
  });

  it('should only edit one prompt at a time', async () => {
    render(<PromptLibrary language="en" />);

    await waitFor(() => {
      expect(screen.getByText('Format Notes')).toBeInTheDocument();
    });

    // Find all edit buttons
    const editButtons = screen.getAllByTitle('Edit');
    expect(editButtons.length).toBe(3);

    // Click edit on first prompt
    fireEvent.click(editButtons[0]);

    // First prompt should show edit form (textarea for prompt content)
    const textareas = screen.getAllByRole('textbox', { name: '' });
    const editTextarea = textareas.find(ta =>
      (ta as HTMLTextAreaElement).value === 'Format the following notes in markdown'
    );
    expect(editTextarea).toBeInTheDocument();

    // Try to click edit on second prompt
    const newEditButtons = screen.getAllByTitle('Edit');
    fireEvent.click(newEditButtons[1]);

    // First prompt should no longer be in edit mode
    const textareasAfter = screen.getAllByRole('textbox', { name: '' });
    const firstPromptTextarea = textareasAfter.find(ta =>
      (ta as HTMLTextAreaElement).value === 'Format the following notes in markdown'
    );
    expect(firstPromptTextarea).toBeUndefined();

    // Second prompt should now be in edit mode
    const secondPromptTextarea = textareasAfter.find(ta =>
      (ta as HTMLTextAreaElement).value === 'Summarize the week'
    );
    expect(secondPromptTextarea).toBeInTheDocument();
  });

  it('should properly reset form when canceling edit', async () => {
    render(<PromptLibrary language="en" />);

    await waitFor(() => {
      expect(screen.getByText('Format Notes')).toBeInTheDocument();
    });

    // Click edit on first prompt
    const editButtons = screen.getAllByTitle('Edit');
    fireEvent.click(editButtons[0]);

    // Modify the form
    const textareas = screen.getAllByRole('textbox', { name: '' });
    const nameInput = screen.getByPlaceholderText('Name');
    fireEvent.change(nameInput, { target: { value: 'Modified Name' } });

    // Click cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Edit another prompt
    const newEditButtons = screen.getAllByTitle('Edit');
    fireEvent.click(newEditButtons[1]);

    // The form should show the second prompt's data, not the modified data
    const nameInputAfter = screen.getByPlaceholderText('Name');
    expect((nameInputAfter as HTMLInputElement).value).toBe('Weekly Summary');
  });

  it('should only edit one AI config at a time', async () => {
    // Setup multiple configs
    const configs = [
      { id: 'config-1', name: 'Config 1', provider: 'deepseek', apiKey: 'key1', model: 'model1' },
      { id: 'config-2', name: 'Config 2', provider: 'openai', apiKey: 'key2', model: 'model2' },
    ];
    localStorage.setItem('df_ai_configs', JSON.stringify(configs));

    render(<PromptLibrary language="en" />);

    await waitFor(() => {
      expect(screen.getByText('Format Notes')).toBeInTheDocument();
    });

    // Open AI settings
    const aiSettingsButton = screen.getByText('AI Config');
    fireEvent.click(aiSettingsButton);

    // Wait for configs to appear
    await waitFor(() => {
      expect(screen.getByText('Config 1')).toBeInTheDocument();
      expect(screen.getByText('Config 2')).toBeInTheDocument();
    });

    // Find edit buttons for configs (they use Pencil icon)
    const allButtons = screen.getAllByRole('button');
    const configEditButtons = allButtons.filter(btn => {
      const svg = btn.querySelector('svg');
      return svg && btn.closest('.bg-surface-white');
    });

    // Click edit on first config
    fireEvent.click(configEditButtons[0]);

    // First config should show input with its name
    await waitFor(() => {
      const inputs = screen.getAllByPlaceholderText(/Config Name|配置名称/);
      expect(inputs.length).toBeGreaterThan(0);
    });

    // Click edit on second config
    fireEvent.click(configEditButtons[1]);

    // Only one config should be in edit mode
    const configInputs = screen.getAllByPlaceholderText(/Config Name|配置名称/);
    expect(configInputs.length).toBe(1);
  });
});



