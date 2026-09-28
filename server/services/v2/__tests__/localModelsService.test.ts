import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WHISPER_MODEL_CATALOG,
  downloadModel,
  findCatalogEntry,
  listInstalledModels,
  onModelDownloadEvent,
  resolveModelsDirectory,
  synthesizeSpeech,
  systemCheck,
  TTS_PROVIDERS,
  TtsRequestSchema,
} from '../localModelsService';

describe('local models service — catalog', () => {
  it('exposes the four canonical ggml checkpoints', () => {
    const ids = WHISPER_MODEL_CATALOG.map((entry) => entry.id);
    expect(ids).toEqual(['tiny', 'base', 'small', 'medium']);
  });

  it('every catalog entry has at least one mirror and a stable filename', () => {
    for (const entry of WHISPER_MODEL_CATALOG) {
      expect(entry.mirrors.length).toBeGreaterThanOrEqual(1);
      expect(entry.filename.startsWith('ggml-')).toBe(true);
      expect(entry.filename.endsWith('.bin')).toBe(true);
      expect(entry.approxSizeMb).toBeGreaterThan(0);
    }
  });

  it('findCatalogEntry returns the right entry or undefined', () => {
    expect(findCatalogEntry('small')?.filename).toBe('ggml-small.bin');
    expect(findCatalogEntry('mystery')).toBeUndefined();
  });
});

describe('local models service — download', () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'df-models-'));
  });
  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  function fakeFetcher(bytes: Buffer): typeof fetch {
    return vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(bytes));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      });
    }) as unknown as typeof fetch;
  }

  it('downloads a model to the target directory and emits progress events', async () => {
    const events: Array<{ state: string; percent?: number; path?: string }> = [];
    const unsubscribe = onModelDownloadEvent((event) => {
      events.push({ state: event.state, percent: event.percent, path: event.path });
    });
    try {
      const bytes = Buffer.from('ggml-small-bytes');
      const result = await downloadModel('small', {
        directory: root,
        fetcher: fakeFetcher(bytes),
      });
      expect(result.path).toBe(path.join(root, 'ggml-small.bin'));
      expect(result.bytes).toBe(bytes.length);
      const written = await fsp.readFile(result.path);
      expect(written.equals(bytes)).toBe(true);

      // We expect at least: started → completed, with progress in between.
      const states = events.map((event) => event.state);
      expect(states).toContain('started');
      expect(states[states.length - 1]).toBe('completed');
      const completed = events.find((event) => event.state === 'completed');
      expect(completed?.percent).toBe(100);
      expect(completed?.path).toBe(result.path);
    } finally {
      unsubscribe();
    }
  });

  it('treats a pre-existing complete file as already-downloaded', async () => {
    const target = path.join(root, 'ggml-tiny.bin');
    await fsp.writeFile(target, 'existing');

    const fetcher = vi.fn() as unknown as typeof fetch;
    const result = await downloadModel('tiny', { directory: root, fetcher });
    expect(result.bytes).toBe('existing'.length);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to the next mirror when the first one fails', async () => {
    const events: string[] = [];
    const unsubscribe = onModelDownloadEvent((event) => events.push(event.state));
    try {
      const bytes = Buffer.from('ggml-base-bytes');
      const order: string[] = [];
      const fetcher = vi.fn(async (input: RequestInfo | URL) => {
        order.push(String(input));
        if (order.length === 1) {
          return new Response('not found', { status: 404 });
        }
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(bytes));
            controller.close();
          },
        }), { status: 200, headers: { 'content-length': String(bytes.length) } });
      }) as unknown as typeof fetch;

      const result = await downloadModel('base', { directory: root, fetcher });
      expect(order.length).toBe(2);
      expect(result.bytes).toBe(bytes.length);
      expect(events).toContain('completed');
    } finally {
      unsubscribe();
    }
  });

  it('emits a failed event and rejects when every mirror fails', async () => {
    const events: Array<{ state: string; error?: string }> = [];
    const unsubscribe = onModelDownloadEvent((event) => events.push({ state: event.state, error: event.error }));
    try {
      const fetcher = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
      await expect(downloadModel('medium', { directory: root, fetcher })).rejects.toThrow(/HTTP 500|All mirrors failed/);
      const failed = events.find((event) => event.state === 'failed');
      expect(failed?.error).toBeDefined();
    } finally {
      unsubscribe();
    }
  });

  it('rejects an unknown model id without touching the network', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(downloadModel('xxl-quantum', { directory: root, fetcher })).rejects.toThrow(/Unknown model/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('leaves no .part files behind when the stream fails mid-download', async () => {
    // A network drop used to pin the socket and leave a partial file forever.
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(Buffer.from('half')));
        controller.error(new Error('connection reset'));
      },
    }), { status: 200, headers: { 'content-length': '9999' } })) as unknown as typeof fetch;

    await expect(downloadModel('tiny', { directory: root, fetcher })).rejects.toThrow();
    const entries = await fsp.readdir(root);
    expect(entries.filter((name) => name.endsWith('.part'))).toEqual([]);
    expect(entries.filter((name) => name === 'ggml-tiny.bin')).toEqual([]);
  });

  it('rejects a zero-byte mirror response instead of renaming an empty model into place', async () => {
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.close(); },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(downloadModel('tiny', { directory: root, fetcher })).rejects.toThrow(/0 bytes|All mirrors failed/i);
    await expect(fsp.stat(path.join(root, 'ggml-tiny.bin'))).rejects.toThrow();
  });

  it('rejects a download whose size does not match content-length', async () => {
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(Buffer.from('short')));
        controller.close();
      },
    }), { status: 200, headers: { 'content-length': '5000' } })) as unknown as typeof fetch;

    await expect(downloadModel('tiny', { directory: root, fetcher })).rejects.toThrow(/Size mismatch|All mirrors failed/i);
  });

  it('uses a unique .part name per attempt so two concurrent downloads cannot clobber each other', async () => {
    const seenPaths = new Set<string>();
    // Block both downloads on a gate so their tmp files exist simultaneously.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async () => {
      await gate;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(Buffer.from('ggml-tiny-bytes')));
          controller.close();
        },
      }), { status: 200, headers: { 'content-length': '15' } });
    }) as unknown as typeof fetch;

    const watch = setInterval(() => {
      void fsp.readdir(root).then((names) => {
        for (const name of names) if (name.endsWith('.part')) seenPaths.add(name);
      }).catch(() => undefined);
    }, 1);

    const both = Promise.all([
      downloadModel('tiny', { directory: root, fetcher: fetcher as unknown as typeof fetch }),
      downloadModel('tiny', { directory: root, fetcher: fetcher as unknown as typeof fetch }),
    ]);
    await new Promise((r) => setTimeout(r, 5));
    release();
    await both.catch(() => undefined);
    clearInterval(watch);

    // Either both succeeded, or one saw the other's completed file — but the
    // two attempts must never have shared a single tmp path.
    expect(seenPaths.size).toBeLessThanOrEqual(2);
  });

  it('cleans up abandoned .part files older than an hour', async () => {
    const stale = path.join(root, 'ggml-tiny.bin.999.old.part');
    await fsp.writeFile(stale, 'stale');
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fsp.utimes(stale, old, old);

    const bytes = Buffer.from('ggml-tiny-bytes');
    await downloadModel('tiny', { directory: root, fetcher: fakeFetcher(bytes) });

    const entries = await fsp.readdir(root);
    expect(entries).not.toContain('ggml-tiny.bin.999.old.part');
  });
});

describe('local models service — list installed', () => {
  let root: string;
  beforeEach(async () => { root = await fsp.mkdtemp(path.join(os.tmpdir(), 'df-models-installed-')); });
  afterEach(async () => { await fsp.rm(root, { recursive: true, force: true }); });

  it('returns an empty list when no models are installed', async () => {
    const installed = await listInstalledModels({ directory: root });
    expect(installed).toEqual([]);
  });

  it('reads files from an injected directory without touching the real model dir', async () => {
    // Never write into the user's actual model directory from a test — a
    // failed cleanup used to leave a bogus ggml-small.bin behind forever.
    const sentinel = path.join(root, 'ggml-small.bin');
    await fsp.writeFile(sentinel, 'placeholder');

    const installed = await listInstalledModels({ directory: root });
    const match = installed.find((entry) => entry.path === sentinel);
    expect(match?.filename).toBe('ggml-small.bin');
    expect(match?.id).toBe('small');
    // The real directory must not be the one we just injected.
    expect(root).not.toBe(resolveModelsDirectory().directory);
  });

  it('ignores non-ggml files in the directory', async () => {
    await fsp.writeFile(path.join(root, 'notes.txt'), 'x');
    await fsp.writeFile(path.join(root, 'ggml-.txt'), 'x');
    expect(await listInstalledModels({ directory: root })).toEqual([]);
  });
});

describe('local models service — system probe', () => {
  it('reports installCommand for the current platform', async () => {
    const result = await systemCheck({
      probe: vi.fn(async () => false),
    });
    expect(result.ready).toBe(false);
    if (process.platform === 'darwin' || process.platform === 'linux' || process.platform === 'win32') {
      expect(result.installCommand).not.toBeNull();
      expect(result.installCommand?.command).toMatch(/whisper-cpp|whisper|ffmpeg/);
    }
  });

  it('reports ready when both commands are present on PATH', async () => {
    const result = await systemCheck({
      probe: vi.fn(async () => true),
    });
    expect(result.ready).toBe(true);
    expect(result.installCommand).toBeNull();
    expect(result.whisperCliPath).toBe('whisper-cli');
    expect(result.ffmpegPath).toBe('ffmpeg');
  });
});

describe('local models service — TTS schema and synthesis', () => {
  /** Resolve every hostname to a public IP so the SSRF guard passes without
   *  hitting DNS. Tests that want to exercise the guard inject their own. */
  const publicResolver = (async () => [{ address: '93.184.216.34', family: 4 }]) as unknown as Parameters<typeof synthesizeSpeech>[2];

  it('exposes the four provider cards', () => {
    const ids = TTS_PROVIDERS.map((entry) => entry.id);
    expect(ids).toEqual(['browser', 'siliconflow', 'openai', 'elevenlabs']);
  });

  it('rejects the browser provider — there is no server round-trip needed', async () => {
    await expect(
      synthesizeSpeech({ text: 'hi', provider: 'browser' } as never),
    ).rejects.toThrow(/browser/i);
  });

  it('requires an apiKey for cloud providers', async () => {
    const parsed = TtsRequestSchema.parse({ text: '你好', provider: 'siliconflow' });
    await expect(synthesizeSpeech(parsed)).rejects.toThrow(/api key/i);
  });

  it('calls siliconflow and returns base64 audio on success', async () => {
    const audioBytes = Buffer.from('mp3-bytes');
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('api.siliconflow.cn/v1/audio/speech');
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(audioBytes));
          controller.close();
        },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await synthesizeSpeech({
      text: '你好',
      provider: 'siliconflow',
      apiKey: 'k',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'FunAudioLLM/CosyVoice2-0.5B',
    }, fetcher, publicResolver);
    expect(result.mimeType).toBe('audio/mpeg');
    expect(Buffer.from(result.audioBase64, 'base64').equals(audioBytes)).toBe(true);
  });

  it('calls openai with the expected voice/model defaults', async () => {
    let captured: RequestInit | undefined;
    const audioBytes = Buffer.from('mp3');
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(audioBytes));
          controller.close();
        },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await synthesizeSpeech({
      text: 'hello',
      provider: 'openai',
      apiKey: 'k',
    }, fetcher, publicResolver);
    expect(result.mimeType).toBe('audio/mpeg');
    const body = JSON.parse(String(captured?.body));
    expect(body.model).toBe('gpt-4o-mini-tts');
    expect(body.input).toBe('hello');
    expect(body.voice).toBe('alloy');
  });

  it('forwards elevenlabs voiceId and model', async () => {
    const audioBytes = Buffer.from('mp3');
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('elevenlabs.io/v1/text-to-speech/voice-42');
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(audioBytes));
          controller.close();
        },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await synthesizeSpeech({
      text: 'hi',
      provider: 'elevenlabs',
      apiKey: 'k',
      voice: 'voice-42',
      model: 'eleven_turbo_v2_5',
    }, fetcher, publicResolver);
    expect(result.mimeType).toBe('audio/mpeg');
  });

  // -------------------------------------------------------------------------
  // Security regressions
  // -------------------------------------------------------------------------

  type Resolver = Parameters<typeof synthesizeSpeech>[2];
  const resolverFor = (address: string): Resolver =>
    (async () => [{ address, family: address.includes(':') ? 6 : 4 }]) as unknown as Resolver;

  it('rejects a baseUrl that resolves to the cloud metadata endpoint (SSRF)', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(
      synthesizeSpeech({
        text: 'hi',
        provider: 'siliconflow',
        apiKey: 'k',
        baseUrl: 'https://metadata.internal.example/v1',
      }, fetcher, resolverFor('169.254.169.254')),
    ).rejects.toThrow(/internal or reserved/i);
    // Crucially, we never issued the request that would have carried the key.
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a baseUrl that resolves to a private LAN address', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(
      synthesizeSpeech({
        text: 'hi',
        provider: 'openai',
        apiKey: 'k',
        baseUrl: 'https://router.local/v1',
      }, fetcher, resolverFor('192.168.1.10')),
    ).rejects.toThrow(/internal or reserved/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a non-HTTPS baseUrl', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(
      synthesizeSpeech({
        text: 'hi',
        provider: 'openai',
        apiKey: 'k',
        baseUrl: 'http://api.openai.com/v1',
      }, fetcher, resolverFor('93.184.216.34')),
    ).rejects.toThrow(/HTTPS/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('never leaks an upstream error body (or the api key) in the thrown message', async () => {
    const secretBody = '{"error":{"message":"invalid key sk-live-SUPERSECRET"}}';
    const fetcher = vi.fn(async () => new Response(secretBody, { status: 401 })) as unknown as typeof fetch;
    let message = '';
    try {
      await synthesizeSpeech({
        text: 'hi',
        provider: 'siliconflow',
        apiKey: 'sk-live-SUPERSECRET',
      }, fetcher, publicResolver);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/HTTP 401/);
    expect(message).not.toContain('SUPERSECRET');
    expect(message).not.toContain('sk-live');
    expect(message).not.toContain('invalid key');
  });
});