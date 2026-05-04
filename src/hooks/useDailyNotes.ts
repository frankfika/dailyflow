import { useState, useCallback } from 'react';
import { filesApi } from '../api/client';
import type { Task } from '../types/task';
import { getTodayStr } from '../utils/tagColors';

export function useDailyNotes() {
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [currentFileDate, setCurrentFileDate] = useState(getTodayStr());
  const [markdown, setMarkdown] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastSyncedMD, setLastSyncedMD] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTasksForDate = useCallback(async (date: string) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await filesApi.get(date);
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
    } catch (e) {
      setLoadError('Failed to load tasks. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncToBackend = useCallback(async (date: string, content: string) => {
    try {
      await filesApi.update(date, content);
      setLastSyncedMD(content);
    } catch (e) {
      console.error('Failed to sync', e);
    }
  }, []);

  return {
    filesMap,
    setFilesMap,
    currentFileDate,
    setCurrentFileDate,
    markdown,
    setMarkdown,
    tasks,
    setTasks,
    lastSyncedMD,
    setLastSyncedMD,
    isLoading,
    loadError,
    loadTasksForDate,
    syncToBackend,
  };
}
