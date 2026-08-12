import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayScopeTabs, reconcileMindmapOrder } from './TodayScopeTabs';
import type { TodayPlanningGroup } from './TodayBacklog';

const groups: TodayPlanningGroup[] = [
  { id: 'event-a', mindmapId: 'map-a', title: '产品发布', taskIds: ['a', 'b'], completedTaskIds: [] },
  { id: 'event-b', mindmapId: 'map-b', title: '团队建设', taskIds: ['c'], completedTaskIds: [] },
];

describe('TodayScopeTabs', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  it('keeps Events as primary tabs and categories as flat secondary chips', () => {
    const onMindmapChange = vi.fn();
    const onTagChange = vi.fn();
    render(<TodayScopeTabs groups={groups} hasStandalone selectedMindmapId={null} onMindmapChange={onMindmapChange} tags={['launch', 'website']} selectedTag={null} onTagChange={onTagChange} language="zh" storageKey="scope-test" />);
    expect(screen.getByRole('tablist', { name: '按事件查看' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /产品发布/ }));
    expect(onMindmapChange).toHaveBeenCalledWith('map-a');
    fireEvent.click(screen.getByRole('button', { name: '#launch' }));
    expect(onTagChange).toHaveBeenCalledWith('launch');
    expect(screen.getByTestId('today-tag-chips').querySelector('select')).toBeNull();
  });

  it('reconciles a saved map order with newly added maps', () => {
    expect(reconcileMindmapOrder(groups, ['map-b']).map((group) => group.mindmapId)).toEqual(['map-b', 'map-a']);
  });

  it('reorders map tabs by drag and persists the preference', () => {
    render(<TodayScopeTabs groups={groups} hasStandalone={false} selectedMindmapId={null} onMindmapChange={vi.fn()} tags={[]} selectedTag={null} onTagChange={vi.fn()} language="zh" storageKey="scope-order" />);
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(screen.getByRole('tab', { name: /团队建设/ }), { dataTransfer });
    fireEvent.dragOver(screen.getByRole('tab', { name: /产品发布/ }), { dataTransfer });
    fireEvent.drop(screen.getByRole('tab', { name: /产品发布/ }), { dataTransfer });
    const mapTabs = screen.getAllByRole('tab').slice(1);
    expect(mapTabs[0]).toHaveTextContent('团队建设');
    expect(localStorage.getItem('scope-order')).toBe('["map-b","map-a"]');
  });
});
