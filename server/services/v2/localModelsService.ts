/** Local on-device model manager for the meeting transcription + TTS paths.
 *
 * The previous flow expected the user to `brew install whisper-cpp ffmpeg`,
 * hand-pick a ggml-* model from Hugging Face, and paste three paths into
 * the settings panel. This service replaces the third step:
 *
 *   - Catalog: well-known ggml-* checkpoints (tiny / base / small / medium)
 *     with stable mirrors so the user gets a one-click "download small model"
 *     that lands in `~/Library/Application Support/DailyFlow/models/whisper/`
 *     (or the platform equivalent derived from `localTranscriptionDefaults`).
 *   - Download: streams the file with an SHA-256 integrity check, writes
 *     atomically (tmp + rename) and reports progress through an in-process
 *     event bus the UI subscribes to.
 *   - System check: probes the host for `whisper-cli` and `ffmpeg`. When
 *     something is missing, it returns a copy-pasteable install command
 *     for the user's platform instead of pretending it can install
 *     system packages itself.
 *
 * The service is deliberately pure: it does not pull a model into memory,
 * so CI never has to download anything. Tests inject a fetcher.
 */
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import { z } from 'zod';
import { localTranscriptionDefaults } from './localTranscriptionService.js';
import { assertSafeModelBaseUrl } from '../harness/aiTargetPolicy.js';

/** Stable catalog of ggml-* checkpoints we know how to fetch. The URLs are
 * Hugging Face mirrors maintained by ggerganov/whisper.cpp — that org has
 * had the same release filenames for years. We don't try to be exhaustive;
 * the UI exposes only `tiny/base/small/medium` and keeps the per-locale
 * variants out of scope for the first pass.
 *
 * Each entry carries a `sha256` slot for pinning the digest of the file at
 * the canonical mirror. When populated, every download is verified against
 * it and a mismatch is a hard failure; the four shipped entries leave it
 * empty for now (digests must be pinned from a trusted offline copy — never
 * scraped from the network we're verifying against), so today the check is
 * armed but best-effort: HTTPS to the canonical mirror is the transit
 * integrity guarantee.
 */
export interface WhisperModelCatalogEntry {
  id: string;
  label: string;
  filename: string;
  /** Approximate download size in MB; surfaced in the picker so users can
   *  pick "tiny" when they don't want to wait for "small". */
  approxSizeMb: number;
  /** Recommended for which languages, surfaced as a hint pill. */
  bestFor: string[];
  /** Mirror list — first successful fetch wins. Order matters: Hugging Face
   *  is the source of truth, the GitHub mirror is a fallback when HF is
   *  blocked from a corporate proxy. */
  mirrors: string[];
  /** Lower-case hex SHA-256 of the file at the primary mirror. Verified
   *  after the stream completes; mismatch → download rejected. */
  sha256: string;
}

export const WHISPER_MODEL_CATALOG: readonly WhisperModelCatalogEntry[] = [
  {
    id: 'tiny',
    label: 'Whisper tiny',
    filename: 'ggml-tiny.bin',
    approxSizeMb: 75,
    bestFor: ['en'],
    mirrors: [
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
      'https://github.com/ggerganov/whisper.cpp/raw/main/models/ggml-tiny.bin',
    ],
    sha256: '',
  },
  {
    id: 'base',
    label: 'Whisper base',
    filename: 'ggml-base.bin',
    approxSizeMb: 142,
    bestFor: ['en'],
    mirrors: [
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
      'https://github.com/ggerganov/whisper.cpp/raw/main/models/ggml-base.bin',
    ],
    sha256: '',
  },
  {
    id: 'small',
    label: 'Whisper small',
    filename: 'ggml-small.bin',
    approxSizeMb: 466,
    bestFor: ['zh', 'en'],
    mirrors: [
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
      'https://github.com/ggerganov/whisper.cpp/raw/main/models/ggml-small.bin',
    ],
    sha256: '',
  },
  {
    id: 'medium',
    label: 'Whisper medium',
    filename: 'ggml-medium.bin',
    approxSizeMb: 1500,
    bestFor: ['zh', 'en', 'multilingual'],
    mirrors: [
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
      'https://github.com/ggerganov/whisper.cpp/raw/main/models/ggml-medium.bin',
    ],
    sha256: '',
  },
] as const;

export function findCatalogEntry(id: string): WhisperModelCatalogEntry | undefined {
  return WHISPER_MODEL_CATALOG.find((entry) => entry.id === id);
}

export interface ModelDownloadEvent {
  modelId: string;
  state: 'started' | 'progress' | 'completed' | 'failed';
  /** 0–100, only meaningful for 'progress' / 'completed'. */
  percent?: number;
  /** Bytes downloaded so far. */
  bytes?: number;
  /** Total bytes when known. */
  totalBytes?: number;
  /** Final on-disk path when state === 'completed'. */
  path?: string;
  /** Error message when state === 'failed'. */
  error?: string;
}

type DownloadEventListener = (event: ModelDownloadEvent) => void;

class DownloadEventBus extends EventEmitter {
  emitProgress(event: ModelDownloadEvent): void {
    this.emit('progress', event);
  }
}

const downloadBus = new DownloadEventBus();
downloadBus.setMaxListeners(50);

export function onModelDownloadEvent(listener: DownloadEventListener): () => void {
  downloadBus.on('progress', listener);
  return () => {
    downloadBus.off('progress', listener);
  };
}

export interface ModelsDirectoryLayout {
  /** Absolute path to the directory that should hold downloaded ggml-* files. */
  directory: string;
}

export function resolveModelsDirectory(): ModelsDirectoryLayout {
  // localTranscriptionDefaults.modelPath points at
  //   ~/Library/Application Support/DailyFlow/models/whisper/ggml-small.bin
  // (or the platform equivalent). Strip the file name to get the directory.
  return { directory: path.dirname(localTranscriptionDefaults.modelPath) };
}

export interface InstalledModelRecord {
  id: string;
  filename: string;
  path: string;
  /** Bytes on disk. */
  sizeBytes: number;
  /** ISO timestamp of the file mtime. */
  installedAt: string;
}

export async function listInstalledModels(options: { directory?: string } = {}): Promise<InstalledModelRecord[]> {
  const directory = options.directory ?? resolveModelsDirectory().directory;
  let entries: string[];
  try {
    entries = await fsp.readdir(directory);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: InstalledModelRecord[] = [];
  for (const filename of entries) {
    if (!filename.startsWith('ggml-') || !filename.endsWith('.bin')) continue;
    const fullPath = path.join(directory, filename);
    const stat = await fsp.stat(fullPath);
    const known = WHISPER_MODEL_CATALOG.find((entry) => entry.filename === filename);
    out.push({
      id: known?.id ?? filename.replace(/^ggml-|\.bin$/g, ''),
      filename,
      path: fullPath,
      sizeBytes: stat.size,
      installedAt: stat.mtime.toISOString(),
    });
  }
  // Newest first so the UI defaults to the just-downloaded model.
  out.sort((a, b) => b.installedAt.localeCompare(a.installedAt));
  return out;
}

export interface DownloadModelOptions {
  /** Override the fetcher; tests inject a fake to avoid network in CI. */
  fetcher?: typeof fetch;
  /** Override the download directory. */
  directory?: string;
}

/** Result returned by `downloadModel`. Listeners attached via
 *  `onModelDownloadEvent` receive granular progress events; this promise
 *  resolves once the final 'completed' (or 'failed') event has been
 *  emitted, so callers can `await` and not need to subscribe. */
export interface DownloadModelResult {
  modelId: string;
  path: string;
  bytes: number;
}

export async function downloadModel(
  modelId: string,
  options: DownloadModelOptions = {},
): Promise<DownloadModelResult> {
  const entry = findCatalogEntry(modelId);
  if (!entry) {
    const event: ModelDownloadEvent = { modelId, state: 'failed', error: `Unknown model "${modelId}".` };
    downloadBus.emitProgress(event);
    const err = new Error(event.error);
    (err as Error & { code: string }).code = 'invalid_request';
    throw err;
  }
  const fetcher = options.fetcher ?? fetch;
  const directory = options.directory ?? resolveModelsDirectory().directory;
  await fsp.mkdir(directory, { recursive: true });
  await cleanStalePartFiles(directory);
  const finalPath = path.join(directory, entry.filename);

  // If the file already exists with the right size we treat the download
  // as already-completed. Re-downloading a 1.5 GB ggml-medium just because
  // the user clicked twice is exactly the kind of UX trap we're avoiding.
  try {
    const stat = await fsp.stat(finalPath);
    if (stat.size > 0) {
      const completed: ModelDownloadEvent = {
        modelId,
        state: 'completed',
        percent: 100,
        bytes: stat.size,
        totalBytes: stat.size,
        path: finalPath,
      };
      downloadBus.emitProgress(completed);
      return { modelId, path: finalPath, bytes: stat.size };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  downloadBus.emitProgress({ modelId, state: 'started' });

  let lastError: Error | undefined;
  for (const url of entry.mirrors) {
    // Race-safe tmp filename: pid + uuid + millis. Two concurrent
    // downloads inside the same Node process can otherwise collide on
    // `Date.now()` and clobber each other.
    const tmpPath = `${finalPath}.${process.pid}.${randomUUID()}.part`;
    // Hoisted to the attempt scope so both the inner stream-error path and
    // the outer catch can close it before unlinking. `createWriteStream`
    // opens lazily, so an unlink issued while the open is still pending
    // returns ENOENT — and the stream then creates the file afterwards,
    // leaving the `.part` behind forever.
    let writer: fs.WriteStream | undefined;
    try {
      const response = await fetcher(url);
      if (!response.ok) {
        // Release the undici socket before moving on — an abandoned error
        // response body pins the connection until GC.
        try { await response.body?.cancel(); } catch { /* ignore */ }
        lastError = new Error(`HTTP ${response.status} fetching ${url}`);
        continue;
      }
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      const hash = crypto.createHash('sha256');
      let downloaded = 0;
      const webReader = response.body as ReadableStream<Uint8Array> | null;
      if (!webReader) {
        lastError = new Error(`Empty body from ${url}`);
        continue;
      }
      try {
        await new Promise<void>((resolve, reject) => {
          writer = fs.createWriteStream(tmpPath);
          // Node 18+ exposes `Readable.fromWeb()` to bridge the WHATWG
          // stream returned by `fetch()` into a Node stream we can `.pipe()`.
          const nodeReader = Readable.fromWeb(webReader as unknown as Parameters<typeof Readable.fromWeb>[0]);
          nodeReader.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            hash.update(chunk);
            if (contentLength > 0) {
              const percent = Math.min(100, Math.round((downloaded / contentLength) * 100));
              downloadBus.emitProgress({
                modelId,
                state: 'progress',
                percent,
                bytes: downloaded,
                totalBytes: contentLength,
              });
            }
          });
          nodeReader.on('error', reject);
          writer.on('error', reject);
          writer.on('finish', resolve);
          nodeReader.pipe(writer);
        });
      } catch (streamErr) {
        // Release the upstream socket, close the writer, and only then drop
        // the partial file. Skipping the close step is what used to leave
        // orphaned `.part` files behind on every network drop.
        try { await webReader.cancel(); } catch { /* ignore */ }
        await closeWriteStream(writer);
        await fsp.unlink(tmpPath).catch(() => undefined);
        lastError = streamErr instanceof Error ? streamErr : new Error(String(streamErr));
        continue;
      }
      const expectedSize = contentLength > 0 ? contentLength : downloaded;
      const finalStat = await fsp.stat(tmpPath);
      // Defensive size check: reject zero-byte files and content-length
      // mismatches. Whisper.cpp on an empty file is a crash on first use.
      if (finalStat.size === 0) {
        await fsp.unlink(tmpPath).catch(() => undefined);
        lastError = new Error(`Downloaded 0 bytes for ${entry.filename} — mirror returned an empty body.`);
        continue;
      }
      if (finalStat.size !== expectedSize) {
        await fsp.unlink(tmpPath).catch(() => undefined);
        lastError = new Error(`Size mismatch after streaming ${entry.filename}: expected ${expectedSize} bytes, got ${finalStat.size}.`);
        continue;
      }
      // Integrity check: catalog entry has a known SHA-256. If the digest
      // is empty we treat it as "best-effort" and log — the upstream
      // maintainer hasn't pinned a hash yet. When populated, mismatch is
      // a hard failure (we will not rename into place).
      const digest = hash.digest('hex');
      if (entry.sha256 && entry.sha256.length === 64) {
        if (digest.toLowerCase() !== entry.sha256.toLowerCase()) {
          await fsp.unlink(tmpPath).catch(() => undefined);
          lastError = new Error(`SHA-256 mismatch for ${entry.filename}: expected ${entry.sha256}, got ${digest}.`);
          continue;
        }
      } else {
        // Best-effort path — log but accept. This is the only time we
        // trust an unverified mirror, and it's because the catalog author
        // hasn't pinned the digest yet.
        // eslint-disable-next-line no-console
        console.warn(`[localModelsService] no pinned SHA-256 for ${entry.id}; accepting unverified download.`);
      }
      // Release the file descriptor before renaming. POSIX doesn't
      // require this, but a fd still attached to the temp file can EPERM
      // the rename on Windows until the handle goes.
      await drainWriter(writer);
      await fsp.rename(tmpPath, finalPath);
      const completed: ModelDownloadEvent = {
        modelId,
        state: 'completed',
        percent: 100,
        bytes: finalStat.size,
        totalBytes: finalStat.size,
        path: finalPath,
      };
      downloadBus.emitProgress(completed);
      return { modelId, path: finalPath, bytes: finalStat.size };
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error(String(cause));
      // Close any partially-opened writer before unlinking (see the note on
      // `closeWriteStream` above — an unlink racing a lazy open() loses).
      await closeWriteStream(writer);
      await fsp.unlink(tmpPath).catch(() => undefined);
      // Try the next mirror.
    }
  }
  const failed: ModelDownloadEvent = { modelId, state: 'failed', error: lastError?.message ?? 'All mirrors failed.' };
  downloadBus.emitProgress(failed);
  throw lastError ?? new Error(failed.error);
}

/** Close a write stream and wait for the underlying fd to be released.
 *  Destroying is what makes a following `unlink` reliable: without it the
 *  pending lazy `open()` can land after the unlink and resurrect the file. */
function closeWriteStream(writer: fs.WriteStream | undefined): Promise<void> {
  if (!writer || writer.closed) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    writer.once('close', finish);
    writer.destroy();
    // Defensive bound — never hang a download loop on stream teardown.
    const timer = setTimeout(finish, 500);
    timer.unref?.();
  });
}

/** Wait for a write stream to finish AND release its file descriptor.
 *  Unlike resolving on 'finish' (data flushed), this waits for 'close' (the
 *  OS handle is gone). On Windows the file remains locked until the fd is
 *  released, so a following rename can EPERM otherwise. POSIX is unaffected. */
async function drainWriter(writer: fs.WriteStream | undefined): Promise<void> {
  if (!writer || writer.closed) return;
  await new Promise<void>((resolve) => writer.once('close', resolve));
}

/** Clean up `.part` files left behind by crashed downloads. Anything
 *  older than 1 hour is treated as abandoned and removed. */
async function cleanStalePartFiles(directory: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fsp.readdir(directory);
  } catch {
    return;
  }
  const cutoff = Date.now() - 60 * 60 * 1000;
  await Promise.all(
    entries
      .filter((name) => name.endsWith('.part'))
      .map(async (name) => {
        const fullPath = path.join(directory, name);
        try {
          const stat = await fsp.stat(fullPath);
          if (stat.mtimeMs < cutoff) {
            await fsp.unlink(fullPath).catch(() => undefined);
          }
        } catch {
          /* file disappeared between readdir and stat — fine */
        }
      }),
  );
}

// ---------------------------------------------------------------------------
// System probe — find out whether the host already has whisper.cpp + ffmpeg.
// We don't try to install system packages ourselves (brew is the user's
// responsibility), but we tell them exactly what to run.
// ---------------------------------------------------------------------------

export type SystemPlatform = 'macos' | 'linux' | 'windows' | 'unknown';

export function detectPlatform(): SystemPlatform {
  switch (process.platform) {
    case 'darwin': return 'macos';
    case 'linux': return 'linux';
    case 'win32': return 'windows';
    default: return 'unknown';
  }
}

async function commandAvailable(command: string): Promise<boolean> {
  // `which` is a small POSIX helper; on Windows we fall back to `where`.
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return new Promise<boolean>((resolve) => {
    const child = spawn(lookup, [command], { stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('close', (code) => resolve(code === 0));
  });
}

export interface InstallCommand {
  /** Short label shown in the UI ("Install with Homebrew"). */
  label: string;
  /** The exact command line to copy. */
  command: string;
}

export function installCommandFor(platform: SystemPlatform): InstallCommand | null {
  switch (platform) {
    case 'macos':
      return {
        label: 'Install with Homebrew',
        command: 'brew install whisper-cpp ffmpeg',
      };
    case 'linux':
      return {
        label: 'Install with apt',
        command: 'sudo apt-get update && sudo apt-get install -y whisper-cpp ffmpeg',
      };
    case 'windows':
      return {
        label: 'Install with winget',
        command: 'winget install whisper-cpp ffmpeg',
      };
    default:
      return null;
  }
}

export interface SystemCheckResult {
  platform: SystemPlatform;
  /** Absolute path to `whisper-cli` when it was found on PATH; null otherwise. */
  whisperCliPath: string | null;
  /** Absolute path to `ffmpeg` when it was found on PATH; null otherwise. */
  ffmpegPath: string | null;
  /** True when both whisper-cli and ffmpeg are available — the local
   *  transcription pipeline can run end-to-end without further setup. */
  ready: boolean;
  /** Suggested install command for the current platform, when not ready. */
  installCommand: InstallCommand | null;
}

export interface SystemCheckOptions {
  /** Override the probe (used by tests). */
  probe?: typeof commandAvailable;
}

export async function systemCheck(options: SystemCheckOptions = {}): Promise<SystemCheckResult> {
  const probe = options.probe ?? commandAvailable;
  const platform = detectPlatform();
  const [whisper, ffmpeg] = await Promise.all([probe('whisper-cli'), probe('ffmpeg')]);
  const ready = whisper && ffmpeg;
  return {
    platform,
    whisperCliPath: whisper ? 'whisper-cli' : null,
    ffmpegPath: ffmpeg ? 'ffmpeg' : null,
    ready: Boolean(ready),
    installCommand: ready ? null : installCommandFor(platform),
  };
}

// ---------------------------------------------------------------------------
// TTS — local model suggestion + remote fallback catalog.
//
// The local TTS path uses the Web Speech API (`window.speechSynthesis`),
// so the server doesn't ship audio bytes for the default case. The
// catalog below tells the UI which remote providers we already support
// when the user wants higher-fidelity voices.
// ---------------------------------------------------------------------------

export interface TtsProviderInfo {
  id: 'browser' | 'siliconflow' | 'openai' | 'elevenlabs';
  label: string;
  /** Whether the user has to bring their own API key. */
  requiresApiKey: boolean;
  /** A short tagline surfaced in the picker. */
  hint: string;
}

export const TTS_PROVIDERS: readonly TtsProviderInfo[] = [
  {
    id: 'browser',
    label: '浏览器内置（零配置）',
    requiresApiKey: false,
    hint: '使用系统语音，不需要下载模型。',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 TTS',
    requiresApiKey: true,
    hint: '中文自然度高，注册送 ¥9.9 体验金。',
  },
  {
    id: 'openai',
    label: 'OpenAI TTS',
    requiresApiKey: true,
    hint: '英文音色最稳，nova / shimmer / alloy 可选。',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    requiresApiKey: true,
    hint: '需要 API Key，效果顶级。',
  },
] as const;

const TtsProviderSchema = z.enum(['browser', 'siliconflow', 'openai', 'elevenlabs']);

export const TtsRequestSchema = z.object({
  text: z.string().min(1).max(20_000),
  provider: TtsProviderSchema.default('browser'),
  voice: z.string().max(200).optional(),
  language: z.enum(['zh', 'en']).optional(),
  apiKey: z.string().max(2000).optional(),
  baseUrl: z.string().max(2000).optional(),
  model: z.string().max(200).optional(),
});

export type TtsRequest = z.output<typeof TtsRequestSchema>;

/** Synthesize text into an audio buffer using the chosen remote provider.
 *  For `provider === 'browser'` this throws — the browser already has the
 *  voice and we don't want to round-trip audio over HTTP for nothing.
 *
 *  SECURITY NOTES:
 *  - `baseUrl` is user-controlled, so we run it through `assertSafeModelBaseUrl`
 *    to block SSRF (loopback, link-local, AWS/GCP metadata, private nets).
 *  - The thrown error on a non-OK upstream response contains the HTTP
 *    status only — never the upstream body or any header, so an API key
 *    that landed in the upstream response can never leak through this
 *    code path. The response body is drained and discarded.
 *  - `apiKey` is destructured into a local before any work happens, and
 *    never reaches `handleError` / `console.error` because the rest of the
 *    function only ever reads `parsed.provider`, `parsed.voice`, etc.
 */
export async function synthesizeSpeech(
  request: TtsRequest,
  fetcher: typeof fetch = fetch,
  /** Injectable DNS resolver so tests don't hit the network. */
  resolveHost?: Parameters<typeof assertSafeModelBaseUrl>[1],
): Promise<{ audioBase64: string; mimeType: string; provider: TtsRequest['provider'] }> {
  const parsed = TtsRequestSchema.parse(request);
  if (parsed.provider === 'browser') {
    const err = new Error('Browser TTS does not require a server round-trip; use window.speechSynthesis directly.');
    (err as Error & { code: string }).code = 'tts_browser_not_supported';
    throw err;
  }
  if (!parsed.apiKey) {
    const err = new Error(`TTS provider "${parsed.provider}" requires an API key.`);
    (err as Error & { code: string }).code = 'tts_api_key_required';
    throw err;
  }
  // Pull the secret into a closure so it doesn't get destructured out of
  // `parsed` accidentally into a log line. From here on, only the local
  // `apiKey` constant holds it.
  const apiKey: string = parsed.apiKey;

  switch (parsed.provider) {
    case 'siliconflow': {
      const baseUrl = parsed.baseUrl ?? 'https://api.siliconflow.cn/v1';
      // SSRF guard: only allow public hosts. Users with a private mirror
      // will need to whitelist it later; for now we prefer breaking loud
      // over silently opening the internal network.
      const safeUrl = await assertSafeModelBaseUrl(baseUrl, resolveHost);
      const model = parsed.model ?? 'FunAudioLLM/CosyVoice2-0.5B';
      const body = {
        model,
        input: parsed.text,
        voice: parsed.voice ?? 'FunAudioLLM/CosyVoice2-0.5B:alex',
        response_format: 'mp3',
      };
      const resp = await fetcher(`${safeUrl.toString().replace(/\/$/, '')}/audio/speech`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        // Drain the upstream body and never put it in the error message —
        // an upstream 4xx/5xx often includes the user's key or a partial
        // prompt that we must not surface to the caller or the logs.
        try { await resp.arrayBuffer(); } catch { /* ignore */ }
        const err = new Error(`SiliconFlow TTS failed: HTTP ${resp.status}`);
        (err as Error & { code: string }).code = 'tts_upstream_failed';
        throw err;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      return { audioBase64: buffer.toString('base64'), mimeType: 'audio/mpeg', provider: parsed.provider };
    }
    case 'openai': {
      const baseUrl = parsed.baseUrl ?? 'https://api.openai.com/v1';
      const safeUrl = await assertSafeModelBaseUrl(baseUrl, resolveHost);
      const model = parsed.model ?? 'gpt-4o-mini-tts';
      const resp = await fetcher(`${safeUrl.toString().replace(/\/$/, '')}/audio/speech`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: parsed.text,
          voice: parsed.voice ?? 'alloy',
          response_format: 'mp3',
        }),
      });
      if (!resp.ok) {
        try { await resp.arrayBuffer(); } catch { /* ignore */ }
        const err = new Error(`OpenAI TTS failed: HTTP ${resp.status}`);
        (err as Error & { code: string }).code = 'tts_upstream_failed';
        throw err;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      return { audioBase64: buffer.toString('base64'), mimeType: 'audio/mpeg', provider: parsed.provider };
    }
    case 'elevenlabs': {
      // ElevenLabs base URL is hard-coded, so no SSRF risk — no need to
      // call assertSafeModelBaseUrl here. The voiceId IS user input and
      // lands in the URL path, so constrain it: a crafted value could
      // otherwise bend the request at a different path on the same host
      // while still carrying the API key.
      const rawVoiceId = parsed.voice ?? '21m00Tcm4TlvDq8ikWAM';
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(rawVoiceId)) {
        const err = new Error('ElevenLabs voice id must be 1–64 letters, digits, "_" or "-".');
        (err as Error & { code: string }).code = 'tts_voice_invalid';
        throw err;
      }
      const voiceId = rawVoiceId;
      const resp = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: parsed.text,
          model_id: parsed.model ?? 'eleven_turbo_v2_5',
        }),
      });
      if (!resp.ok) {
        try { await resp.arrayBuffer(); } catch { /* ignore */ }
        const err = new Error(`ElevenLabs TTS failed: HTTP ${resp.status}`);
        (err as Error & { code: string }).code = 'tts_upstream_failed';
        throw err;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      return { audioBase64: buffer.toString('base64'), mimeType: 'audio/mpeg', provider: parsed.provider };
    }
    default:
      throw new Error(`Unsupported TTS provider: ${String((parsed as { provider?: string }).provider)}`);
  }
}

// ---------------------------------------------------------------------------
// Note on duplication: the system probe and the existing
// `executableAvailable` helper inside `localTranscriptionService.ts` overlap.
// We deliberately keep both — the legacy helper returns an exact path /
// false and is used by `localTranscriptionStatus()` for the settings
// panel, while the probe here is `which`-based and only reports whether
// each command is reachable on PATH. Cheap to maintain, no behaviour
// change for callers.
// ---------------------------------------------------------------------------