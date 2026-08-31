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
  const clientAbort = new AbortController();
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

    res.once('close', () => {
      if (!res.writableEnded) clientAbort.abort(new Error('Client disconnected'));
    });

    let summary: string;
    try {
      summary = await callProviderChat({
        apiKey: body.apiKey,
        model,
        baseUrl: body.baseUrl,
        systemPrompt,
        userPrompt: body.userPrompt,
        maxTokens,
        abortSignal: clientAbort.signal,
      });
    } catch (err: any) {
      if (err?.upstreamStatus) {
        return res.status(err.upstreamStatus).json({ error: err.message });
      }
      throw err;
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

interface ProviderChatRequest {
  apiKey: string;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  abortSignal?: AbortSignal;
}

/** Strip code fences / <think> blocks and return the model's text answer. */
export function cleanModelText(raw: string): string {
  let text = raw.trim();
  // Some reasoning models (e.g. MiniMax-M2) emit <think>…</think> inline.
  text = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
  text = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  return text;
}

async function callProviderChat(req: ProviderChatRequest): Promise<string> {
  const url = resolveAiUrl(req.baseUrl);
  await assertSafeAiTarget(url);
  const signal = AbortSignal.any([
    req.abortSignal ?? new AbortController().signal,
    AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  ]);
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
    }),
    redirect: 'error',
    signal,
  });

  if (!upstream.ok) {
    // Never pass a provider's raw response to the UI: it can contain echoed
    // prompts, internal request ids, or reasoning traces.
    await upstream.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`Upstream AI error (${upstream.status})`), { upstreamStatus: upstream.status });
  }

  const data = JSON.parse(await readBoundedText(upstream, MAX_UPSTREAM_BYTES)) as any;
  const content = cleanModelText(String(data?.choices?.[0]?.message?.content ?? ''));
  if (!content) {
    throw Object.assign(new Error('Empty response from AI provider'), { upstreamStatus: 502 });
  }
  return content;
}

// --- Structured AI actions (UX S6) -----------------------------------------
// One endpoint, one schema per action. The server owns the prompts so the UI
// stays thin; the provider is still the user's own (bring-your-own-key), so
// the whole feature degrades to a clear error when AI is not configured.

const ActionBodySchema = z.object({
  action: z.enum(['split_tasks', 'rewrite_task', 'summarize_task', 'ask', 'pick_focus']),
  apiKey: z.string().trim().min(1).max(8_192),
  model: z.string().trim().min(1).max(256).optional(),
  baseUrl: z.string().trim().min(1).max(2_048),
  input: z.string().min(1).max(MAX_PROMPT_BYTES),
  context: z.string().max(MAX_PROMPT_BYTES).optional(),
}).strict();

const ACTION_PROMPTS: Record<string, string> = {
  split_tasks: 'You decompose a task into small concrete subtasks. Output ONLY a valid JSON array of subtask objects: {"title": string, "deadline": "YYYY-MM-DD" (optional)}. No markdown, no explanation.',
  rewrite_task: 'You rewrite task titles to be clear and actionable. Output ONLY a valid JSON object: {"title": string, "description": string (optional)}. Keep the user\'s language. No markdown, no explanation.',
  summarize_task: 'You summarize a task\'s progress in one or two sentences. Output ONLY a valid JSON object: {"summary": string}. Use the user\'s language. No markdown.',
  ask: 'You answer the user\'s question about their day briefly and concretely. Output ONLY a valid JSON object: {"answer": string, "suggestedTask": {"title": string} (optional — include ONLY if answering implies creating a concrete task, e.g. the user asks to plan something)}. Use the user\'s language. No markdown.',
  pick_focus: 'You pick the 3 most important tasks to focus on today given deadlines, priorities and context. Output ONLY a valid JSON object: {"ids": string[]} with at most 3 ids chosen from the provided list. No markdown.',
};

router.post('/action', async (req, res) => {
  try {
    const parsedBody = ActionBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ error: 'Invalid AI action request' });
    }
    const body = parsedBody.data;
    const model = body.model || 'default';
    const clientAbort = new AbortController();
    res.once('close', () => {
      if (!res.writableEnded) clientAbort.abort(new Error('Client disconnected'));
    });

    const contextBlock = body.context ? `\n\nContext:\n${body.context}` : '';
    let content: string;
    try {
      content = await callProviderChat({
        apiKey: body.apiKey,
        model,
        baseUrl: body.baseUrl,
        systemPrompt: ACTION_PROMPTS[body.action] ?? 'You are a helpful assistant. Output only valid JSON.',
        userPrompt: `${body.input}${contextBlock}`,
        maxTokens: 4096,
        abortSignal: clientAbort.signal,
      });
    } catch (err: any) {
      if (err?.upstreamStatus) {
        return res.status(err.upstreamStatus).json({ error: err.message });
      }
      throw err;
    }

    try {
      const result = JSON.parse(content);
      res.json({ result, model });
    } catch {
      res.status(502).json({ error: 'AI response was not valid JSON' });
    }
  } catch (error: any) {
    const aborted = error?.name === 'AbortError' || error?.name === 'TimeoutError';
    const message = aborted ? 'AI provider request timed out' : (error?.message || String(error));
    console.error('AI action failed:', String(message).slice(0, 300));
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
