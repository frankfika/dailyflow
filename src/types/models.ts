/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProviderType = 'openai-compatible' | 'anthropic';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConfigStore {
  configs: ProviderConfig[];
  activeId: string | null;
}

export const PROVIDER_TEMPLATES = [
  {
    name: 'DeepSeek',
    type: 'openai-compatible' as ProviderType,
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  {
    name: 'Anthropic Claude',
    type: 'anthropic' as ProviderType,
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
  },
  {
    name: 'OpenAI',
    type: 'openai-compatible' as ProviderType,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  {
    name: 'Google Gemini',
    type: 'openai-compatible' as ProviderType,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash-exp',
  },
  {
    name: 'Alibaba Qwen',
    type: 'openai-compatible' as ProviderType,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
  },
  {
    name: 'Custom',
    type: 'openai-compatible' as ProviderType,
    baseUrl: '',
    model: '',
  },
];

const STORAGE_KEY = 'df_provider_configs';

export function loadProviderConfigs(): ProviderConfigStore {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load provider configs:', e);
  }
  return { configs: [], activeId: null };
}

export function saveProviderConfigs(store: ProviderConfigStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
