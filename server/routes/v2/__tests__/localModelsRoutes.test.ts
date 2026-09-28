/** HTTP-level smoke tests for the local-models / TTS routes.
 *
 * Mounts the v2 router with a stub `getV2` middleware so we don't have to
 * bootstrap a full workspace. The intent isn't to re-test the underlying
 * service (that's covered by `localModelsService.test.ts`) — it's to
 * confirm the routes exist, parse inputs, and return the documented
 * shapes. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { v2Router } from '../index';

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // Stub the `getV2` accessor by injecting a fake res.locals.v2.
  app.use((req, res, next) => {
    (res as unknown as { locals: { v2: unknown } }).locals.v2 = {
      repo: { layout: { root: '/tmp/fake', internal: { config: '/tmp/fake/config.json' } } },
      ctx: { root: '/tmp/fake', workspaceId: 'ws_local_models' },
    };
    next();
  });
  app.use('/api/v2', v2Router);
  return app;
}

function listen(app: express.Express): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(app).listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

let server: http.Server | null = null;
let baseUrl = '';
beforeEach(async () => {
  const result = await listen(makeApp());
  server = result.server;
  baseUrl = result.baseUrl;
});
afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
  vi.restoreAllMocks();
});

describe('local models + TTS routes', () => {
  it('GET /transcription/models returns the catalog and an empty installed list', async () => {
    const res = await fetch(`${baseUrl}/api/v2/transcription/models`);
    expect(res.status).toBe(200);
    const body = await res.json() as { catalog: unknown[]; installed: unknown[]; directory: string };
    expect(Array.isArray(body.catalog)).toBe(true);
    expect(body.catalog.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(body.installed)).toBe(true);
    expect(typeof body.directory).toBe('string');
  });

  it('GET /transcription/system-check reports the install command when nothing is on PATH', async () => {
    const res = await fetch(`${baseUrl}/api/v2/transcription/system-check`);
    expect(res.status).toBe(200);
    const body = await res.json() as { ready: boolean; platform: string; installCommand: { command: string } | null };
    // CI rarely has whisper-cli / ffmpeg on PATH — so we expect `ready: false`.
    expect(body.platform).toMatch(/macos|linux|windows|unknown/);
    if (!body.ready) {
      expect(body.installCommand?.command).toMatch(/whisper-cpp|ffmpeg/);
    }
  });

  it('POST /transcription/models/:id/download returns 4xx for an unknown id', async () => {
    const res = await fetch(`${baseUrl}/api/v2/transcription/models/does-not-exist/download`, { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('GET /tts/providers returns the four known providers', async () => {
    const res = await fetch(`${baseUrl}/api/v2/tts/providers`);
    expect(res.status).toBe(200);
    const body = await res.json() as { providers: Array<{ id: string }> };
    expect(body.providers.map((p) => p.id)).toEqual(['browser', 'siliconflow', 'openai', 'elevenlabs']);
  });

  it('POST /tts/synthesize rejects cloud providers without an API key', async () => {
    const res = await fetch(`${baseUrl}/api/v2/tts/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi', provider: 'siliconflow' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /tts/synthesize rejects the browser provider (no round-trip needed)', async () => {
    const res = await fetch(`${baseUrl}/api/v2/tts/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi', provider: 'browser' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /tts/synthesize surfaces a sanitized 502 when the provider rejects the call', async () => {
    // Without the 502 branch a provider 401/503 collapsed into a generic
    // 500 "Internal server error", indistinguishable from a bug here.
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      // Pass the test's own request through; only intercept the upstream
      // provider call.
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/v2/')) return realFetch(input as Parameters<typeof realFetch>[0], init);
      return new Response('{"error":{"message":"bad key sk-secret"}}', { status: 401 });
    });
    try {
      const res = await fetch(`${baseUrl}/api/v2/tts/synthesize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi', provider: 'siliconflow', apiKey: 'k' }),
      });
      expect(res.status).toBe(502);
      const body = await res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('tts_upstream_failed');
      expect(body.error.message).toContain('401');
      // The sanitized message must never echo the provider's body or key.
      expect(body.error.message).not.toContain('sk-secret');
      expect(body.error.message).not.toContain('bad key');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('POST /tts/synthesize rejects an ElevenLabs voice id that could bend the URL path', async () => {
    const res = await fetch(`${baseUrl}/api/v2/tts/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi', provider: 'elevenlabs', apiKey: 'k', voice: '../../v1/keys' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('tts_voice_invalid');
  });
});