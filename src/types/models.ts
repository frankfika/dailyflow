/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { configApi, dispatchDomainEvent, DOMAIN_EVENTS } from '../api/client';

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
  /** Role assignments let chat and structured meeting extraction evolve
   * independently while still sharing one provider registry. */
  roles?: {
    chatProviderId?: string | null;
    meetingSummaryProviderId?: string | null;
  };
  /** Speech models use a different protocol but live in the same model
   * center so settings and migrations have a single source of truth. */
  meetingTranscription?: Record<string, unknown>;
  version?: 1;
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
    name: 'Ollama（本机）',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen3',
    category: 'official',
    region: 'global',
    hint: '用于本地 AI Chat/Agent。先在本机运行 Ollama 并下载模型；API Key 填 ollama 即可。它不负责会议音频转写。',
  },
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

const STORAGE_KEY = 'df_model_center';
const LEGACY_PROVIDER_STORAGE_KEY = 'df_provider_configs';
const LEGACY_TRANSCRIPTION_STORAGE_KEY = 'df_meeting_transcription_settings';

function normalizeStore(raw: Partial<ProviderConfigStore> | null | undefined): ProviderConfigStore {
  const configs = (raw?.configs || []).map(({ type: _ignored, ...rest }: ProviderConfig & { type?: unknown }) => rest as ProviderConfig);
  const activeId = configs.some(config => config.id === raw?.activeId)
    ? raw?.activeId ?? null
    : configs[0]?.id ?? null;
  const chatProviderId = configs.some(config => config.id === raw?.roles?.chatProviderId)
    ? raw?.roles?.chatProviderId ?? null
    : activeId;
  const meetingSummaryProviderId = configs.some(config => config.id === raw?.roles?.meetingSummaryProviderId)
    ? raw?.roles?.meetingSummaryProviderId ?? null
    : activeId;
  return {
    version: 1,
    configs,
    activeId,
    roles: { chatProviderId, meetingSummaryProviderId },
    meetingTranscription: raw?.meetingTranscription,
  };
}

function readStoredModelCenter(): { store: ProviderConfigStore; migrated: boolean } {
  const unified = localStorage.getItem(STORAGE_KEY);
  if (unified) return { store: normalizeStore(JSON.parse(unified)), migrated: false };

  const legacyProviders = localStorage.getItem(LEGACY_PROVIDER_STORAGE_KEY);
  const legacyTranscription = localStorage.getItem(LEGACY_TRANSCRIPTION_STORAGE_KEY);
  const raw = legacyProviders ? JSON.parse(legacyProviders) as Partial<ProviderConfigStore> : {};
  if (legacyTranscription) raw.meetingTranscription = JSON.parse(legacyTranscription) as Record<string, unknown>;
  return { store: normalizeStore(raw), migrated: Boolean(legacyProviders || legacyTranscription) };
}

export function loadProviderConfigs(): ProviderConfigStore {
  try {
    const { store, migrated } = readStoredModelCenter();
    if (migrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      localStorage.removeItem(LEGACY_PROVIDER_STORAGE_KEY);
      localStorage.removeItem(LEGACY_TRANSCRIPTION_STORAGE_KEY);
    }
    return store;
  } catch (e) {
    console.error('Failed to load model center:', e);
  }
  return normalizeStore(null);
}

/** Write the normalized store into the localStorage cache without touching the backend. */
function writeLocalCache(store: ProviderConfigStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  localStorage.removeItem(LEGACY_PROVIDER_STORAGE_KEY);
  localStorage.removeItem(LEGACY_TRANSCRIPTION_STORAGE_KEY);
}

export function saveProviderConfigs(store: ProviderConfigStore): void {
  const current = loadProviderConfigs();
  const normalized = normalizeStore({
    ...current,
    ...store,
    roles: { ...current.roles, ...store.roles },
    meetingTranscription: store.meetingTranscription ?? current.meetingTranscription,
  });
  writeLocalCache(normalized);
  try {
    dispatchDomainEvent(DOMAIN_EVENTS.aiProviderChanged, { source: 'model-center' });
  } catch { /* ignore */ }
  // The backend config file is the source of truth that server-side AI
  // features (inbox extraction, meeting summaries) read. Persist on every
  // save — not only when a modal closes — and make failures visible instead
  // of silently leaving the server without credentials. Skip under tests:
  // Node fetch cannot resolve the dev server's relative `/api` URL.
  if (import.meta.env.MODE === 'test') return;
  persistProviderConfigsToBackend().then(() => {
    try {
      dispatchDomainEvent(DOMAIN_EVENTS.aiProviderChanged, { source: 'backend-sync' });
    } catch { /* ignore */ }
  }).catch(err => {
    console.error('Failed to persist model center to backend:', err);
    try {
      dispatchDomainEvent(DOMAIN_EVENTS.aiProviderSyncFailed, {
        message: err instanceof Error ? err.message : String(err),
      });
    } catch { /* ignore */ }
  });
}

export function importModelCenter(serialized: string): ProviderConfigStore {
  const parsed = normalizeStore(JSON.parse(serialized) as Partial<ProviderConfigStore>);
  saveProviderConfigs(parsed);
  return parsed;
}

export function loadMeetingTranscriptionModelSettings<T extends object>(defaults: T): T {
  const stored = loadProviderConfigs().meetingTranscription;
  return { ...defaults, ...(stored || {}) } as T;
}

export function saveMeetingTranscriptionModelSettings(settings: object): void {
  const current = loadProviderConfigs();
  saveProviderConfigs({ ...current, meetingTranscription: settings as Record<string, unknown> });
}

/**
 * Persist provider configs to the backend config file. The backend copy is
 * the source of truth: server-side AI features read it, and app startup
 * re-hydrates the local cache from it. Throws on failure so callers can
 * surface the error; retries once on a version conflict.
 */
export async function persistProviderConfigsToBackend(): Promise<void> {
  const store = loadProviderConfigs();
  const serialized = JSON.stringify(store);
  try {
    const config = await configApi.get();
    await configApi.update({ modelCenter: serialized, providerConfigs: null }, config.version);
  } catch (firstError) {
    // Version conflicts happen when another part of the app patched the
    // config between our read and write — retry once against a fresh version.
    try {
      const fresh = await configApi.get();
      await configApi.update({ modelCenter: serialized, providerConfigs: null }, fresh.version);
    } catch {
      throw firstError instanceof Error ? firstError : new Error(String(firstError));
    }
  }
}

/**
 * Backend-first hydration, run once at app startup. The durable config file
 * wins over the localStorage cache so the UI and server-side AI always see
 * the same provider registry. When the backend has no model center yet but
 * this client does (upgraded installs), push the local copy up.
 */
export async function hydrateModelCenterFromBackend(): Promise<void> {
  const config = await configApi.get();
  const durable = config.modelCenter || config.providerConfigs;
  if (durable) {
    const parsed = normalizeStore(JSON.parse(durable) as Partial<ProviderConfigStore>);
    writeLocalCache(parsed);
    try {
      dispatchDomainEvent(DOMAIN_EVENTS.aiProviderChanged, { source: 'backend-hydration' });
    } catch { /* ignore */ }
    if (!config.modelCenter && config.providerConfigs) {
      // Migrate the legacy field name to `modelCenter`.
      await persistProviderConfigsToBackend();
    }
    return;
  }
  const local = loadProviderConfigs();
  if (local.configs.length > 0 || local.meetingTranscription) {
    await persistProviderConfigsToBackend();
  }
}

export interface ActiveAiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function getActiveAiConfig(role: 'chat' | 'meetingSummary' = 'chat'): ActiveAiConfig | null {
  const store = loadProviderConfigs();
  const roleId = role === 'meetingSummary'
    ? store.roles?.meetingSummaryProviderId
    : store.roles?.chatProviderId;
  const active = store.configs.find(c => c.id === (roleId || store.activeId));
  if (!active) return null;
  return {
    apiKey: active.apiKey,
    model: active.model,
    baseUrl: active.baseUrl,
  };
}
