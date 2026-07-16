/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { configApi } from '../api/client';

export interface ProviderConfig {
  id: string;
  name: string;
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
  baseUrl: string;
  model: string;
  /** Role-based taxonomy: drives the filter tab in the picker. */
  category: 'official' | 'aggregator' | 'custom';
  /** Where the vendor is hosted/regulated. Shown as a small badge on each card. */
  region?: 'cn' | 'global';
  apiKeyUrl?: string;
  hint?: string;
}

// All providers expose an OpenAI-compatible chat-completions endpoint, so we
// only ship one shape. Anthropic Claude uses its own OpenAI-compat path.
// References:
// https://platform.moonshot.cn/  https://platform.minimaxi.com/  https://open.bigmodel.cn/
// https://ark.cn-beijing.volces.com/  https://dashscope.aliyuncs.com/
// https://api.deepseek.com/  https://api.siliconflow.cn/  https://openrouter.ai/
// https://docs.anthropic.com/en/api/openai-sdk
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  // —— Official (first-party vendor endpoints) ——
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    category: 'official',
    region: 'cn',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.7-code',
    category: 'official',
    region: 'cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    hint: '当前 Kimi 最强模型，代码/推理能力优于 k2.6',
  },
  {
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M2',
    category: 'official',
    region: 'cn',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    hint: '国内站（sk-cp-* / sk-* key）。海外用户请改用「MiniMax (海外)」',
  },
  {
    name: 'MiniMax (海外)',
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M2',
    category: 'official',
    region: 'global',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    hint: '海外站。国内 sk-cp-* key 请用「MiniMax」（minimaxi.com）',
  },
  {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    category: 'official',
    region: 'cn',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    name: '豆包 (火山方舟)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-pro-32k',
    category: 'official',
    region: 'cn',
    apiKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    hint: 'model 字段需填写"模型推理点 ID"（ep-xxx），不是模型名',
  },
  {
    name: '阿里云 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    category: 'official',
    region: 'cn',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
  },
  {
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5-20250929',
    category: 'official',
    region: 'global',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    hint: '使用 Anthropic 的 OpenAI 兼容接口',
  },
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    category: 'official',
    region: 'global',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash-exp',
    category: 'official',
    region: 'global',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    category: 'official',
    region: 'global',
    apiKeyUrl: 'https://console.groq.com/keys',
  },

  // —— Aggregators (multi-model 3rd-party platforms) ——
  {
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    category: 'aggregator',
    region: 'cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    name: 'B.AI',
    baseUrl: 'https://api.b.ai/v1',
    model: 'claude-opus-4.8',
    category: 'aggregator',
    region: 'global',
    apiKeyUrl: 'https://chat.b.ai/key',
    hint: 'AI 聚合平台，一个 Key 可用 Claude / GPT / Gemini / MiniMax 等多模型。需充值后使用。',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4',
    category: 'aggregator',
    region: 'global',
    apiKeyUrl: 'https://openrouter.ai/keys',
  },

  // —— Fallback ——
  {
    name: 'Custom',
    baseUrl: '',
    model: '',
    category: 'custom',
  },
];

const STORAGE_KEY = 'df_provider_configs';

export function loadProviderConfigs(): ProviderConfigStore {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { configs?: any[]; activeId?: string | null };
      // Strip legacy `type` field from any pre-migration entries.
      const configs = (parsed.configs || []).map(({ type: _ignored, ...rest }) => rest as ProviderConfig);
      return { configs, activeId: parsed.activeId ?? null };
    }
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

/**
 * Persist provider configs to the backend config file so they survive app updates.
 * Best-effort: if the backend call fails, localStorage still holds the data.
 */
export async function persistProviderConfigsToBackend(): Promise<void> {
  try {
    const store = loadProviderConfigs();
    const config = await configApi.get();
    await configApi.update({
      ...config,
      providerConfigs: JSON.stringify(store),
    });
  } catch {
    // Best-effort persistence to backend
  }
}

export interface ActiveAiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function getActiveAiConfig(): ActiveAiConfig | null {
  const store = loadProviderConfigs();
  const active = store.configs.find(c => c.id === store.activeId);
  if (!active) return null;
  return {
    apiKey: active.apiKey,
    model: active.model,
    baseUrl: active.baseUrl,
  };
}
