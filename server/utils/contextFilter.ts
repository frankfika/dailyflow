/**
 * 后端共享的 work/life context 过滤规则
 * 与前端 src/utils/contextFilter.ts 保持一致
 */

export type Context = 'work' | 'life';

export interface ContextualTask {
  tags?: string[];
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
 * 过滤 tasks
 */
export function filterTasksByContext<T extends ContextualTask>(tasks: T[], context: Context): T[] {
  return tasks.filter(t => taskMatchesContext(t, context));
}
