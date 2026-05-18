/**
 * 统一的 work/life context 过滤规则
 *
 * 规则：
 * - Task 显示在 `work` 视图：tags 含 `work`，或既不含 `work` 也不含 `life`（默认归 work）
 * - Task 显示在 `life` 视图：tags 含 `life`
 * - Note 显示在某 context：frontmatter `context` 字段精确匹配
 *
 * 这套规则前后端共享。前端 (App.tsx, Notes.tsx) 和后端 (services/notes.ts)
 * 都应该 import 这个模块，避免规则不一致导致两边筛选结果对不上。
 */

export type Context = 'work' | 'life';

export interface ContextualTask {
  tags?: string[];
}

export interface ContextualNote {
  context: Context;
}

/**
 * 判断一个 task 是否属于指定 context
 */
export function taskMatchesContext(task: ContextualTask, context: Context): boolean {
  const tags = task.tags || [];
  if (context === 'life') {
    return tags.includes('life');
  }
  return tags.includes('work') || !tags.some(t => t === 'work' || t === 'life');
}

/**
 * 判断一个 note 是否属于指定 context
 */
export function noteMatchesContext(note: ContextualNote, context: Context): boolean {
  return note.context === context;
}

/**
 * 过滤 tasks
 */
export function filterTasksByContext<T extends ContextualTask>(tasks: T[], context: Context): T[] {
  return tasks.filter(t => taskMatchesContext(t, context));
}

/**
 * 过滤 notes
 */
export function filterNotesByContext<T extends ContextualNote>(notes: T[], context: Context): T[] {
  return notes.filter(n => noteMatchesContext(n, context));
}
