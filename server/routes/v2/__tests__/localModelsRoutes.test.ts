/** HTTP-level smoke tests for the local-models / TTS routes.
 *
 * Boots the real Express app against a THROWAWAY config: the v2 router's
 * bootstrap middleware runs `getV2Flags()`/`bootstrapV2()` on every request,
 * and those read `DAILYFLOW_CONFIG_FILE`. Without a pre-seeded config the
 * bootstrap throws and every route 500s — on a developer Mac a real config
 * happens to exist, which is why this only surfaced on a clean CI runner
 * (same pattern as `routes.test.ts`).
 *
 * The intent isn't to re-test the underlying service (that's covered by
 * `localModelsService.test.ts`) — it's to confirm the routes exist, parse
 * inputs, and return the documented shapes. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import { v2Router } from '../index';
import { loadConfig, saveConfig } from '../../../services/config';

let workspaceRoot: string;
let configDir: string;
let previousEnv: Record<string, string | undefined>;

beforeAll(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-models-ws-'));
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-models-cfg-'));
  previousEnv = {
    DAILYFLOW_CONFIG_FILE: process.env.DAILYFLOW_CONFIG_FILE,
    DAILYFLOW_V2_WORKSPACE_ROOT: process.env.DAILYFLOW_V2_WORKSPACE_ROOT,
    DAILYFLOW_V2_WORKSPACE_ID: process.env.DAILYFLOW_V2_WORKSPACE_ID,
  };
  process.env.DAILYFLOW_CONFIG_FILE = path.join(configDir, 'config.json');
  process.env.DAILYFLOW_V2_WORKSPACE_ROOT = workspaceRoot;
  process.env.DAILYFLOW_V2_WORKSPACE_ID = 'ws_local_models';
  // Seed the throwaway config with v2 enabled so the bootstrap middleware
  // succeeds on any machine, including a bare CI runner.
  const cfg = await loadConfig();
  await saveConfig({
    ...cfg,
    workspaceRoot,
    workspaces: [{
      id: 'ws_local_models',
      name: 'Local models test workspace',
      path: workspaceRoot,
      createdAt: new Date().toISOString(),
    }],
    activeWorkspaceId: 'ws_local_models',
    v2: { enabled: true, inboxV2: true, todayV2: true, memoryV2: true, connectorsV2: false, aiEnabled: false, contextBudgetBytes: 32000 } as any,
  } as Parameters<typeof saveConfig>[0]);
});

afterAll(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
  await fs.rm(configDir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // The router's own bootstrap middleware binds the real workspace from the
  // seeded config — no stub needed.
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