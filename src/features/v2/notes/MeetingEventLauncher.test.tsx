import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteDocument } from '../api/client';
import { MeetingEventLauncher } from './MeetingEventLauncher';

const create = vi.fn();
vi.mock('../hooks/useEvents', () => ({
  useEvents: () => ({ data: { events: [{ id: 'event_existing', title: 'GTM', status: 'active' }] } }),
  useCreateEvent: () => ({ mutateAsync: create }),
}));
const NOTE: NoteDocument = { id: 'note_12345678', schemaVersion: 1, createdAt: '', updatedAt: '', createdBy: 'user', workspaceId: 'ws', title: 'Weekly sync', body: 'minutes', kind: 'meeting', state: 'active', projectIds: [], personIds: [], sourceIds: [], pinned: false, autoSaveVersion: 1, contentHash: 'x', commitmentIds: [] };

describe('MeetingEventLauncher', () => {
  beforeEach(() => { create.mockReset(); sessionStorage.clear(); });
  it('links to an existing Event and hands off the Note context', () => {
    const heard = vi.fn(); window.addEventListener('df:open-event-operator', heard);
    render(<MeetingEventLauncher note={NOTE} language="en" />);
    fireEvent.click(screen.getByTestId('meeting-ai-push'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'event_existing' } });
    fireEvent.click(screen.getByRole('button', { name: /Update selected Event/ }));
    expect(heard).toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem('dailyflow:event-operator-context:event_existing')!)).toMatchObject({ eventId: 'event_existing', contextRefs: [{ type: 'note', id: NOTE.id }] });
    window.removeEventListener('df:open-event-operator', heard);
  });
  it('creates an Event rather than orphan tasks when none is selected', async () => {
    create.mockResolvedValue({ id: 'event_new' });
    render(<MeetingEventLauncher note={NOTE} language="en" />);
    fireEvent.click(screen.getByTestId('meeting-ai-push'));
    fireEvent.click(screen.getByRole('button', { name: /Create Event/ }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ title: 'Weekly sync', context: 'work' }));
  });
});
