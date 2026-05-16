export const API_BASE = {
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
