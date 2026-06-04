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

export interface ProviderTemplate {
  name: string;
  type: ProviderType;
  baseUrl: string;
  model: string;
  region: 'cn' | 'global' | 'aggregator' | 'custom';
  apiKeyUrl?: string;
  hint?: string;
  popular?: boolean;
}

// References:
// https://platform.moonshot.cn/  https://platform.minimax.io/  https://open.bigmodel.cn/
// https://ark.cn-beijing.volces.com/  https://dashscope.aliyuncs.com/
// https://api.deepseek.com/  https://api.siliconflow.cn/  https://openrouter.ai/
// https://gist.github.com/LeslieLeung/46838a2009d35916392aab04613ed7a6 (cc-switch)
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  // —— China —— ordered by popularity
  {
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    region: 'cn',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    popular: true,
  },
  {
    name: 'Kimi (Moonshot)',
    type: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2-0905-preview',
    region: 'cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    popular: true,
  },
  {
    name: 'Kimi (Anthropic 格式)',
    type: 'anthropic',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    model: 'kimi-k2-0905-preview',
    region: 'cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    name: 'MiniMax',
    type: 'openai-compatible',
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M2',
    region: 'cn',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
  },
  {
    name: 'MiniMax (Anthropic 格式)',
    type: 'anthropic',
    baseUrl: 'https://api.minimax.io/anthropic',
    model: 'MiniMax-M2',
    region: 'cn',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
  },
  {
    name: '智谱 GLM',
    type: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    region: 'cn',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    name: '智谱 GLM (Anthropic 格式)',
    type: 'anthropic',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    model: 'glm-4-plus',
    region: 'cn',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    name: '豆包 (火山方舟)',
    type: 'openai-compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-pro-32k',
    region: 'cn',
    apiKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    hint: 'model 字段需填写"模型推理点 ID"（ep-xxx），不是模型名',
  },
  {
    name: '阿里云 Qwen',
    type: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    region: 'cn',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
  },
  {
    name: '硅基流动 SiliconFlow',
    type: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    region: 'cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },

  // —— Global ——
  {
    name: 'Anthropic Claude',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5-20250929',
    region: 'global',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    popular: true,
  },
  {
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    region: 'global',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    popular: true,
  },
  {
    name: 'Google Gemini',
    type: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash-exp',
    region: 'global',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    name: 'Groq',
    type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    region: 'global',
    apiKeyUrl: 'https://console.groq.com/keys',
  },

  // —— Aggregators ——
  {
    name: 'OpenRouter',
    type: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4',
    region: 'aggregator',
    apiKeyUrl: 'https://openrouter.ai/keys',
  },

  // —— Fallback ——
  {
    name: 'Custom',
    type: 'openai-compatible',
    baseUrl: '',
    model: '',
    region: 'custom',
    popular: true,
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
  try {
    window.dispatchEvent(new CustomEvent('df:provider-changed'));
  } catch { /* ignore */ }
}

export interface ActiveAiConfig {
  provider: 'anthropic' | 'custom';
  apiKey: string;
  model: string;
  baseUrl: string;
  format: 'openai' | 'anthropic';
}

export function getActiveAiConfig(): ActiveAiConfig | null {
  const store = loadProviderConfigs();
  const active = store.configs.find(c => c.id === store.activeId);
  if (!active) return null;
  return {
    provider: active.type === 'anthropic' ? 'anthropic' : 'custom',
    apiKey: active.apiKey,
    model: active.model,
    baseUrl: active.baseUrl,
    format: active.type === 'anthropic' ? 'anthropic' : 'openai',
  };
}
