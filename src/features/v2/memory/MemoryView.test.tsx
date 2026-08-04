import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryView } from './MemoryView';

const mocks = vi.hoisted(() => ({
  listCommitments: vi.fn(),
  listLegacyTasks: vi.fn(),
  searchMemory: vi.fn(),
  migrateLegacyTask: vi.fn(),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, ...mocks };
});

function renderMemory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryView workspaceId="test" language="en" />
    </QueryClientProvider>,
  );
}

describe('MemoryView progressive disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCommitments.mockResolvedValue({ items: [], total: 0 });
    mocks.listLegacyTasks.mockResolvedValue({
      items: Array.from({ length: 12 }, (_, index) => ({
        id: `legacy-${index + 1}`,
        title: `Legacy task ${index + 1}`,
        date: '2026-07-01',
        line: index + 1,
        status: 'todo',
      })),
      total: 12,
    });
    mocks.searchMemory.mockResolvedValue({ hits: [] });
  });

  it('keeps legacy migration secondary until the user asks to review it', async () => {
    renderMemory();

    expect(await screen.findByRole('heading', { name: 'Memory' })).toBeInTheDocument();
    expect(await screen.findByText('No open confirmed work items yet.')).toBeInTheDocument();
    const review = await screen.findByRole('button', { name: 'Review 12 legacy tasks' });
    expect(screen.queryByText('Legacy task 1')).not.toBeInTheDocument();

    fireEvent.click(review);
    await waitFor(() => expect(screen.getByText('Legacy task 1')).toBeInTheDocument());
    expect(screen.getByText('Legacy task 8')).toBeInTheDocument();
    expect(screen.queryByText('Legacy task 9')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }));
    expect(screen.getByText('Legacy task 12')).toBeInTheDocument();
  });
});
