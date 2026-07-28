import { createContext, useContext } from 'react';

const WorkspaceScopeContext = createContext('default');

export const WorkspaceScopeProvider = WorkspaceScopeContext.Provider;

export function useWorkspaceScope(): string {
  return useContext(WorkspaceScopeContext);
}
