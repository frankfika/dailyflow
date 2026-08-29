import { Router } from 'express';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';

const router = Router();

const MAX_PROMPT_BYTES = 2 * 1024 * 1024;
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 120_000;

const SummarizeBodySchema = z.object({
  apiKey: z.string().trim().min(1).max(8_192),
  model: z.string().trim().min(1).max(256).optional(),
  baseUrl: z.string().trim().min(1).max(2_048),
  systemPrompt: z.string().max(MAX_PROMPT_BYTES).optional(),
  userPrompt: z.string().min(1).max(MAX_PROMPT_BYTES),
  maxTokens: z.number().int().min(1).max(16_384).optional(),
}).strict();

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

function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isBlockedAddress(mapped);
  if (net.isIPv4(normalized)) {
    const [a, b, c] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2))))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }
  if (net.isIPv6(normalized)) {
    return normalized === '::' || normalized === '::1'
      || normalized.startsWith('fc') || normalized.startsWith('fd')
      || normalized.startsWith('fe') || normalized.startsWith('ff')
      || normalized.startsWith('2001:db8:');
  }
  return true;
}

async function assertSafeAiTarget(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const exactLoopback = isLoopbackHost(url);
  const addresses = net.isIP(host)
    ? [host]
    : (await lookup(host, { all: true, verbatim: true })).map(item => item.address);
  if (addresses.length === 0) throw new Error('AI provider hostname did not resolve');
  if (!exactLoopback && addresses.some(isBlockedAddress)) {
    throw new Error('Invalid URL: resolved address is internal or reserved');
  }
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

  if (parsed.username || parsed.password) {
    throw new Error('Invalid URL: embedded credentials are not allowed');
  }
  // SSRF prevention: block internal / metadata endpoints
  // DailyFlow is a local desktop app, so exact loopback endpoints are a
  // supported provider boundary (Ollama, LM Studio, etc.). Keep blocking LAN,
  // link-local, and wildcard addresses to avoid turning the proxy into SSRF.
  if (isBlockedHost(parsed) && !isLoopbackHost(parsed)) {
    throw new Error('Invalid URL: internal addresses are not allowed');
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopbackHost(parsed))) {
    throw new Error('Invalid URL: remote providers must use HTTPS');
  }

  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return /\/v\d+$/.test(trimmed) ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

router.post('/summarize', async (req, res) => {
  try {
    const parsedBody = SummarizeBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ error: 'Invalid AI request' });
    }
    const body = parsedBody.data;
    if (Buffer.byteLength(body.userPrompt, 'utf8') > MAX_PROMPT_BYTES
      || Buffer.byteLength(body.systemPrompt ?? '', 'utf8') > MAX_PROMPT_BYTES) {
      return res.status(413).json({ error: 'AI prompt exceeds the 2 MiB limit' });
    }

    const url = resolveAiUrl(body.baseUrl);
    await assertSafeAiTarget(url);
    const model = body.model || 'default';
    const systemPrompt = body.systemPrompt || 'You are a helpful assistant that summarizes notes concisely in Markdown.';
    const maxTokens = body.maxTokens ?? 4096;

    const clientAbort = new AbortController();
    res.once('close', () => {
      if (!res.writableEnded) clientAbort.abort(new Error('Client disconnected'));
    });
    const signal = AbortSignal.any([clientAbort.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]);
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
      redirect: 'error',
      signal,
    });

    if (!upstream.ok) {
      // Never pass a provider's raw response to the UI: it can contain echoed
      // prompts, internal request ids, or reasoning traces.
      await upstream.body?.cancel().catch(() => {});
      return res.status(upstream.status).json({
        error: `Upstream AI error (${upstream.status})`,
      });
    }

    const data = JSON.parse(await readBoundedText(upstream, MAX_UPSTREAM_BYTES)) as any;
    let summary = data?.choices?.[0]?.message?.content?.trim() || '';
    // Some reasoning models (e.g. MiniMax-M2) emit <think>…</think> inline.
    summary = summary.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();

    if (!summary) {
      return res.status(502).json({ error: 'Empty response from AI provider' });
    }

    res.json({ summary, model });
  } catch (error: any) {
    const aborted = error?.name === 'AbortError' || error?.name === 'TimeoutError';
    const message = aborted ? 'AI provider request timed out' : (error?.message || String(error));
    // Log only a bounded class/message. Request bodies, credentials and raw
    // provider payloads are deliberately excluded.
    console.error('AI summarize failed:', String(message).slice(0, 300));
    res.status(aborted ? 504 : 500).json({ error: message });
  }
});

async function readBoundedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw Object.assign(new Error('AI provider response exceeds the 2 MiB limit'), { code: 'AI_RESPONSE_TOO_LARGE' });
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export default router;
