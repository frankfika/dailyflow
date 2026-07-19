/**
 * AI Provider abstraction for v2.
 *
 * Spec §15.2 / §15.5:
 *   - The runtime always calls a model through a typed adapter.
 *   - Inputs are bounded (Context Builder is enforced upstream).
 *   - Outputs are validated against a JSON Schema and then against domain
 *     rules before any Proposal is created.
 *
 * The default adapter is **deterministic local** — it returns a structured
 * "needs_user_input" output whenever the model provider cannot be reached
 * or is not configured. This satisfies spec §10.6 (no fake AI results, no
 * silent fallback) because the UI explicitly displays "AI not configured"
 * for those proposals.
 *
 * The `openai-compatible` adapter calls a real provider when the user has
 * configured an API key in the v2 secrets store. It deliberately does **not**
 * read v1 config (`AI_API_KEY` etc) so we don't leak legacy secrets.
 */
import type { SourceItem } from '../../../domain/v2/types.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  systemPrompt: string;
  prompt: string;
  jsonSchema: unknown;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  /** Raw JSON object returned by the model. May be null if model returned nothing. */
  data: unknown;
  /** Free-form text for debugging. */
  text?: string;
  usage?: { input: number; output: number };
  provider: string;
  model: string;
  /** True when the adapter is unable to call a real model and returned a structured fallback. */
  fallback: boolean;
  fallbackReason?:
    | 'no_provider'
    | 'no_api_key'
    | 'network_error'
    | 'timeout'
    | 'schema_invalid'
    | 'context_too_long';
}

export interface AIProvider {
  name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** True if the provider has credentials configured and can be called. */
  available(): Promise<{ ready: boolean; reason?: string }>;
}

class DeterministicLocalProvider implements AIProvider {
  name = 'local-deterministic';

  async available(): Promise<{ ready: boolean; reason?: string }> {
    return { ready: true };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    // The deterministic provider returns a structured "needs_user_input"
    // output. The UI surfaces this as "AI not configured" with a button to
    // either configure a provider or handle the inbox item manually.
    void req;
    return {
      data: null,
      text: 'AI provider is not configured. The system saved the source so you can process it manually or configure a provider in Settings.',
      provider: this.name,
      model: 'none',
      fallback: true,
      fallbackReason: 'no_provider',
    };
  }
}

class FixtureProvider implements AIProvider {
  name = 'fixture';
  private readonly responses: CompletionResult[];

  constructor(responses: CompletionResult[]) {
    this.responses = responses;
  }

  async available(): Promise<{ ready: boolean; reason?: string }> {
    return { ready: this.responses.length > 0 };
  }

  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    if (this.responses.length === 0) {
      return {
        data: null,
        text: 'Fixture exhausted',
        provider: this.name,
        model: 'fixture',
        fallback: true,
        fallbackReason: 'no_provider',
      };
    }
    return this.responses.shift()!;
  }
}

class OpenAICompatibleProvider implements AIProvider {
  name = 'openai-compatible';

  constructor(
    private readonly opts: {
      apiKey: string;
      baseUrl: string;
      model: string;
      format: 'openai' | 'anthropic';
    }
  ) {}

  async available(): Promise<{ ready: boolean; reason?: string }> {
    if (!this.opts.apiKey) return { ready: false, reason: 'no_api_key' };
    return { ready: true };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const url = this.opts.format === 'anthropic'
      ? `${this.opts.baseUrl.replace(/\/$/, '')}/v1/messages`
      : `${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const body =
      this.opts.format === 'anthropic'
        ? {
            model: this.opts.model,
            max_tokens: req.maxTokens ?? 1024,
            temperature: req.temperature ?? 0.2,
            system: req.systemPrompt,
            messages: [{ role: 'user', content: req.prompt }],
          }
        : {
            model: this.opts.model,
            messages: [
              { role: 'system', content: req.systemPrompt },
              { role: 'user', content: req.prompt },
            ],
            max_tokens: req.maxTokens ?? 1024,
            temperature: req.temperature ?? 0.2,
            response_format: { type: 'json_object' },
          };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opts.apiKey}`,
          'x-api-key': this.opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return {
          data: null,
          text: text.slice(0, 500),
          provider: this.name,
          model: this.opts.model,
          fallback: true,
          fallbackReason: resp.status === 401 || resp.status === 403 ? 'no_api_key' : 'network_error',
        };
      }
      const json = await resp.json();
      const raw =
        this.opts.format === 'anthropic'
          ? (json?.content?.[0]?.text ?? '')
          : (json?.choices?.[0]?.message?.content ?? '');
      let parsed: unknown = raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
      }
      return {
        data: parsed,
        text: typeof raw === 'string' ? raw : JSON.stringify(raw),
        usage: json?.usage ? { input: json.usage.input_tokens ?? 0, output: json.usage.output_tokens ?? 0 } : undefined,
        provider: this.name,
        model: this.opts.model,
        fallback: false,
      };
    } catch (err) {
      return {
        data: null,
        text: err instanceof Error ? err.message : String(err),
        provider: this.name,
        model: this.opts.model,
        fallback: true,
        fallbackReason: 'network_error',
      };
    }
  }
}

export interface V2AIConfig {
  provider: 'openai-compatible' | 'local-deterministic' | 'fixture';
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  format?: 'openai' | 'anthropic';
}

export function buildProvider(cfg: V2AIConfig | undefined): AIProvider {
  if (!cfg || cfg.provider === 'local-deterministic' || !cfg.apiKey) {
    return new DeterministicLocalProvider();
  }
  return new OpenAICompatibleProvider({
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl ?? 'https://api.openai.com',
    model: cfg.model ?? 'gpt-4o-mini',
    format: cfg.format ?? 'openai',
  });
}

export function loadV2AIConfig(): V2AIConfig | undefined {
  // Read from env or v2-only config (legacy AI_API_KEY is intentionally
  // not consumed here to avoid leaking it into v2 schema/test surfaces).
  const provider = (process.env.V2_AI_PROVIDER as V2AIConfig['provider']) || 'local-deterministic';
  if (provider === 'local-deterministic') return { provider };
  const apiKey = process.env.V2_AI_API_KEY;
  if (!apiKey) return { provider: 'local-deterministic' };
  return {
    provider,
    apiKey,
    baseUrl: process.env.V2_AI_BASE_URL ?? 'https://api.openai.com',
    model: process.env.V2_AI_MODEL ?? 'gpt-4o-mini',
    format: (process.env.V2_AI_FORMAT as 'openai' | 'anthropic') ?? 'openai',
  };
}

export function isFallbackResult(r: CompletionResult): boolean {
  return r.fallback;
}

// Utility used by tests to inspect what a SourceItem would have produced
// without involving the runtime — purely a function, no IO.
export function hashSourceContent(s: SourceItem): string {
  return s.contentHash;
}
