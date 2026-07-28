export const API_BASE = {
  // The v2 client appends `/api/v2` to this origin. In development an
  // empty origin keeps requests on Vite's `/api` proxy; the packaged Tauri
  // app has no proxy, so it must call the bundled Express sidecar directly.
  api: import.meta.env.DEV ? '' : (import.meta.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:3003'),
  github: 'https://api.github.com',
  deepseek: 'https://api.deepseek.com/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
} as const;

export const DEFAULT_MODEL = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
} as const;
