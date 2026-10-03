import express from 'express';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import aiRouter, { resolveAiUrl } from '../ai';

describe('AI provider URL policy', () => {
  it('allows exact loopback providers such as Ollama', () => {
    expect(resolveAiUrl('http://127.0.0.1:11434/v1'))
      .toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(resolveAiUrl('http://localhost:1234/v1'))
      .toBe('http://localhost:1234/v1/chat/completions');
  });

  it('continues to block LAN and wildcard internal addresses', () => {
    expect(() => resolveAiUrl('http://192.168.1.20:11434/v1')).toThrow(/internal/i);
    expect(() => resolveAiUrl('http://0.0.0.0:11434/v1')).toThrow(/internal/i);
  });

  it('requires HTTPS for remote providers and rejects URL credentials', () => {
    expect(() => resolveAiUrl('http://example.com/v1')).toThrow(/HTTPS/i);
    expect(() => resolveAiUrl('https://user:pass@example.com/v1')).toThrow(/credentials/i);
  });
});

describe('POST /api/ai/summarize', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '3mb' }));
    app.use('/api/ai', aiRouter);
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  beforeEach(() => vi.restoreAllMocks());

  it('forwards a bounded OpenAI-compatible request and removes reasoning tags', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '<think>private reasoning</think>\nFinal summary' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await postJson(port, {
      apiKey: 'test-key',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'local-test',
      systemPrompt: 'Summarize safely.',
      userPrompt: 'Synthetic note.',
      maxTokens: 321,
    });

    expect(response).toEqual({ status: 200, body: { summary: 'Final summary', model: 'local-test' } });
    expect(upstream).toHaveBeenCalledWith('http://127.0.0.1:11434/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      redirect: 'error',
      headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
    }));
    const requestBody = JSON.parse((upstream.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody).toMatchObject({ model: 'local-test', max_tokens: 321 });
    expect(requestBody.messages).toEqual([
      { role: 'system', content: 'Summarize safely.' },
      { role: 'user', content: 'Synthetic note.' },
    ]);
  });

  it('rejects missing credentials before any outbound request', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await postJson(port, { baseUrl: 'http://127.0.0.1:11434/v1', userPrompt: 'Hello' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid AI request', category: 'bad_request' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects oversized prompts and invalid token limits before any outbound request', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    const oversized = await postJson(port, {
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', userPrompt: '你'.repeat(700_000),
    });
    const invalidTokens = await postJson(port, {
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', userPrompt: 'Hello', maxTokens: 99_999,
    });

    expect(oversized).toEqual({
      status: 413,
      body: { error: 'AI prompt exceeds the 2 MiB limit', category: 'bad_request' },
    });
    expect(invalidTokens).toEqual({ status: 400, body: { error: 'Invalid AI request', category: 'bad_request' } });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not expose raw upstream error bodies and tags the failure category', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'secret provider trace', prompt: 'private context',
    }), { status: 401, headers: { 'content-type': 'application/json' } }));

    const response = await postJson(port, {
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', userPrompt: 'Hello',
    });

    expect(response).toEqual({
      status: 401,
      body: { error: 'Upstream AI error (401)', category: 'auth', upstreamStatus: 401 },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/secret|private context/);
  });

  it('maps 404 and 429 upstream failures to actionable categories', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));
    const notFound = await postJson(port, {
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', userPrompt: 'Hello',
    });
    expect(notFound).toEqual({
      status: 404,
      body: { error: 'Upstream AI error (404)', category: 'not_found', upstreamStatus: 404 },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }));
    const rateLimited = await postJson(port, {
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', userPrompt: 'Hello',
    });
    expect(rateLimited).toEqual({
      status: 429,
      body: { error: 'Upstream AI error (429)', category: 'rate_limit', upstreamStatus: 429 },
    });
  });

  it('rejects an oversized provider response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(2 * 1024 * 1024 + 1), { status: 200 }));
    const response = await postJson(port, {
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', userPrompt: 'Hello',
    });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/exceeds the 2 MiB limit/);
  });

  it('returns a stable 502 when a provider produces no answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const response = await postJson(port, {
      apiKey: 'test-key', baseUrl: 'http://localhost:11434/v1', userPrompt: 'Hello', systemPrompt: '',
    });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('Empty response from AI provider');
    expect(response.body.category).toBe('unknown');
  });

  it('keeps the note\'s own code fences on the Markdown path (C14)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '# Notes\n\n```\nconst keep = true;\n```\n' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await postJson(port, {
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', userPrompt: 'Hello',
    });

    expect(response.status).toBe(200);
    expect(response.body.summary).toContain('```\nconst keep = true;\n```');
  });
});

describe('POST /api/ai/action', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '3mb' }));
    app.use('/api/ai', aiRouter);
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  beforeEach(() => vi.restoreAllMocks());

  function postAction(body: unknown): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = httpRequest({
        hostname: '127.0.0.1', port, path: '/api/ai/action', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      }, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({
          status: res.statusCode || 0,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        }));
      });
      req.on('error', reject);
      req.end(payload);
    });
  }

  it('returns structured JSON for split_tasks with a server-owned prompt', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '```json\n[{"title":"Sub one"},{"title":"Sub two"}]\n```' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await postAction({
      action: 'split_tasks',
      apiKey: 'test-key',
      baseUrl: 'http://127.0.0.1:11434/v1',
      input: 'Finish the DSH integration',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: [{ title: 'Sub one' }, { title: 'Sub two' }],
      model: 'default',
    });
    const requestBody = JSON.parse((upstream.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.messages[0].role).toBe('system');
    expect(requestBody.messages[0].content).toMatch(/JSON array of subtask/i);
    expect(requestBody.messages[1].content).toContain('Finish the DSH integration');
  });

  it('rejects unknown actions and missing credentials before any outbound call', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    const badAction = await postAction({
      action: 'delete_everything', apiKey: 'k', baseUrl: 'http://127.0.0.1:11434/v1', input: 'x',
    });
    const missingKey = await postAction({
      action: 'ask', baseUrl: 'http://127.0.0.1:11434/v1', input: 'x',
    });
    expect(badAction.status).toBe(400);
    expect(missingKey.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('reports a stable 502 when the model answers with prose instead of JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Here is what you should do, in prose…' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await postAction({
      action: 'rewrite_task', apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', input: 'vague task',
    });
    expect(response.status).toBe(502);
    expect(response.body.error).toBe('AI response was not valid JSON');
    expect(response.body.category).toBe('unknown');
  });

  it('validates the answer against the per-action schema (C15)', async () => {
    // Valid JSON, wrong shape for `ask`.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"oops": true}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const wrongShape = await postAction({
      action: 'ask', apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', input: 'what today?',
    });
    expect(wrongShape.status).toBe(400);
    expect(wrongShape.body).toEqual({
      error: 'AI response failed schema validation for ask',
      category: 'bad_request',
    });

    // pick_focus must never return more than 3 ids.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ids":["a","b","c","d"]}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const tooManyIds = await postAction({
      action: 'pick_focus', apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', input: 'pick',
    });
    expect(tooManyIds.status).toBe(400);
    expect(tooManyIds.body.category).toBe('bad_request');

    // A schema-valid answer still passes through (unknown keys stripped).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"answer":"focus on A","extra":"noise"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const valid = await postAction({
      action: 'ask', apiKey: 'test-key', baseUrl: 'http://127.0.0.1:11434/v1', input: 'what today?',
    });
    expect(valid.status).toBe(200);
    expect(valid.body.result).toEqual({ answer: 'focus on A' });
  });
});

function postJson(port: number, body: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = httpRequest({
      hostname: '127.0.0.1', port, path: '/api/ai/summarize', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}
