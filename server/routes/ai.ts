import { Router } from 'express';

const router = Router();

interface SummarizeBody {
  apiKey: string;
  model?: string;
  baseUrl: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

// All providers expose an OpenAI-compatible /chat/completions endpoint.
// baseUrl is the provider's base (e.g. "https://api.openai.com/v1",
// "https://api.minimaxi.com/v1", "https://api.anthropic.com/v1"). Append the
// path tail if the user didn't include one.
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isBlockedHost(url: URL): boolean {
  const hostname = url.hostname;
  return BLOCKED_HOSTS.some(re => re.test(hostname));
}

function isLoopbackHost(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

export function resolveAiUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');

  // Protocol check
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Invalid URL: must start with http:// or https://');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format');
  }

  // SSRF prevention: block internal / metadata endpoints
  // DailyFlow is a local desktop app, so exact loopback endpoints are a
  // supported provider boundary (Ollama, LM Studio, etc.). Keep blocking LAN,
  // link-local, and wildcard addresses to avoid turning the proxy into SSRF.
  if (isBlockedHost(parsed) && !isLoopbackHost(parsed)) {
    throw new Error('Invalid URL: internal addresses are not allowed');
  }

  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return /\/v\d+$/.test(trimmed) ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

router.post('/summarize', async (req, res) => {
  try {
    const body = req.body as SummarizeBody;
    if (!body || !body.apiKey || !body.userPrompt || !body.baseUrl) {
      return res.status(400).json({ error: 'Missing required fields: apiKey, baseUrl, userPrompt' });
    }

    const url = resolveAiUrl(body.baseUrl);
    const model = body.model || 'default';
    const systemPrompt = body.systemPrompt || 'You are a helpful assistant that summarizes notes concisely in Markdown.';
    const maxTokens = body.maxTokens ?? 4096;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${body.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: body.userPrompt },
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({
        error: `Upstream AI error (${upstream.status})`,
        detail: errText.slice(0, 500),
      });
    }

    const data = await upstream.json() as any;
    let summary = data?.choices?.[0]?.message?.content?.trim() || '';
    // Some reasoning models (e.g. MiniMax-M2) emit <think>…</think> inline.
    summary = summary.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();

    if (!summary) {
      return res.status(502).json({ error: 'Empty response from AI provider', detail: JSON.stringify(data).slice(0, 500) });
    }

    res.json({ summary, model });
  } catch (error: any) {
    console.error('AI summarize failed:', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

export default router;
