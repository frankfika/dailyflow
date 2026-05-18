import { Router } from 'express';

const router = Router();

type Provider = 'deepseek' | 'anthropic' | 'openai' | 'custom';

interface SummarizeBody {
  provider: Provider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  format?: 'openai' | 'anthropic';
}

const DEFAULT_URLS = {
  deepseek: 'https://api.deepseek.com/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
} as const;

const DEFAULT_MODELS = {
  deepseek: 'deepseek-chat',
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
} as const;

function resolveEndpoint(body: SummarizeBody): { url: string; model: string; format: 'openai' | 'anthropic' } {
  const { provider, baseUrl, model, format } = body;

  if (provider === 'deepseek') {
    return { url: DEFAULT_URLS.deepseek, model: model || DEFAULT_MODELS.deepseek, format: 'openai' };
  }
  if (provider === 'anthropic') {
    return { url: DEFAULT_URLS.anthropic, model: model || DEFAULT_MODELS.anthropic, format: 'anthropic' };
  }
  if (provider === 'openai') {
    return { url: DEFAULT_URLS.openai, model: model || DEFAULT_MODELS.openai, format: 'openai' };
  }

  if (!baseUrl) {
    throw new Error('Custom provider requires baseUrl');
  }

  let resolvedFormat: 'openai' | 'anthropic';
  if (format) {
    resolvedFormat = format;
  } else if (model?.includes('claude')) {
    resolvedFormat = 'anthropic';
  } else {
    resolvedFormat = 'openai';
  }

  return { url: baseUrl, model: model || 'default', format: resolvedFormat };
}

router.post('/summarize', async (req, res) => {
  try {
    const body = req.body as SummarizeBody;
    if (!body || !body.provider || !body.apiKey || !body.userPrompt) {
      return res.status(400).json({ error: 'Missing required fields: provider, apiKey, userPrompt' });
    }

    const { url, model, format } = resolveEndpoint(body);
    const systemPrompt = body.systemPrompt || 'You are a helpful assistant that summarizes notes concisely in Markdown.';
    const maxTokens = body.maxTokens ?? 4096;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    let requestBody: Record<string, unknown>;

    if (format === 'anthropic') {
      headers['x-api-key'] = body.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      requestBody = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: body.userPrompt }],
      };
    } else {
      headers['Authorization'] = `Bearer ${body.apiKey}`;
      requestBody = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: body.userPrompt },
        ],
      };
    }

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({
        error: `Upstream AI error (${upstream.status})`,
        detail: errText.slice(0, 500),
      });
    }

    const data = await upstream.json() as any;
    let summary = '';
    if (format === 'anthropic') {
      summary = data?.content?.[0]?.text?.trim() || '';
    } else {
      summary = data?.choices?.[0]?.message?.content?.trim() || '';
    }

    if (!summary) {
      return res.status(502).json({ error: 'Empty response from AI provider', detail: JSON.stringify(data).slice(0, 500) });
    }

    res.json({ summary, model, provider: body.provider });
  } catch (error: any) {
    console.error('AI summarize failed:', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

export default router;
