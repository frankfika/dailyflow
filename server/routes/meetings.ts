/**
 * Granola × DailyFlow — Phase 2 backend.
 *
 * Phase 1 endpoints: mock `transcribe` + AI-proxied `summarize`.
 * Phase 2 additions:
 *   - `transcribe` now accepts real audio (base64-encoded Blob) and forwards
 *     to an OpenAI-compatible `/audio/transcriptions` endpoint when the user
 *     supplies a `whisperConfig` (apiKey + baseUrl + model). When no
 *     whisperConfig is given, the raw audio is still saved to
 *     `~/.dailyflow/recordings/{date}/{uuid}.{ext}` and a mock segment
 *     list is returned so the meeting flow can still progress.
 *   - new `extract-actions` endpoint: given the meeting note Markdown,
 *     re-runs the LLM (JSON mode) to surface action items. Frontend uses
 *     it to power the "Review N Action Items" card before tasks land.
 *
 * API keys never leave the server.
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const router = Router();

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
  return BLOCKED_HOSTS.some(re => re.test(url.hostname));
}

function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Invalid URL: must start with http:// or https://');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format');
  }
  if (isBlockedHost(parsed)) {
    throw new Error('Invalid URL: internal addresses are not allowed');
  }
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return /\/v\d+$/.test(trimmed) ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

function resolveTranscriptionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Invalid URL: must start with http:// or https://');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format');
  }
  if (isBlockedHost(parsed)) {
    throw new Error('Invalid URL: internal addresses are not allowed');
  }
  if (/\/audio\/transcriptions$/.test(trimmed)) return trimmed;
  return /\/v\d+$/.test(trimmed)
    ? `${trimmed}/audio/transcriptions`
    : `${trimmed}/v1/audio/transcriptions`;
}

interface WhisperConfig {
  apiKey: string;
  baseUrl: string;
  model?: string;
  language?: string;
}

interface TranscribeSegment {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

interface TranscribeAudioBody {
  /** Base64-encoded audio bytes from MediaRecorder. */
  audio: {
    data: string;
    mimeType: string;
    filename?: string;
  };
  date?: string;
  participants?: string[];
  /** When set, server forwards audio to the configured Whisper-compatible API. */
  whisperConfig?: WhisperConfig;
  /** Optional language hint forwarded to the Whisper provider. */
  language?: 'zh' | 'en';
}

interface TranscribeTextBody {
  /** Raw transcript text (Phase 1 mock). */
  text: string;
  date?: string;
  participants?: string[];
}

interface TranscribeResponse {
  segments: TranscribeSegment[];
  text: string;
  date: string;
  participants: string[];
  /** Where the raw audio was saved (if any). */
  recordingPath?: string;
  /** "whisper" = real API, "mock-with-audio" = audio saved but no Whisper call. */
  transcriptionMode: 'whisper' | 'mock' | 'mock-with-audio';
  /** Whisper model that was used (echoed back for debugging). */
  model?: string;
}

function pickExtension(mimeType: string, filename?: string): string {
  if (filename && /\.[a-z0-9]+$/i.test(filename)) {
    return filename.toLowerCase().match(/\.[a-z0-9]+$/i)![0];
  }
  const mt = (mimeType || '').toLowerCase();
  if (mt.includes('webm')) return '.webm';
  if (mt.includes('ogg')) return '.ogg';
  if (mt.includes('wav')) return '.wav';
  if (mt.includes('mp4') || mt.includes('m4a') || mt.includes('aac')) return '.m4a';
  if (mt.includes('mpeg') || mt.includes('mp3')) return '.mp3';
  return '.bin';
}

function recordingsDir(date: string): string {
  return path.join(os.homedir(), '.dailyflow', 'recordings', date);
}

function newUuid(): string {
  return crypto.randomUUID();
}

function splitTranscript(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Mock transcribe: split the user's raw transcript on sentence boundaries
 * and emit fake timestamps every ~12s. Phase 1 behaviour, kept for fallback.
 */
function mockTranscribeText(text: string, date: string, participants: string[]): TranscribeResponse {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return { segments: [], text: '', date, participants, transcriptionMode: 'mock' };

  const sentences = splitTranscript(cleaned);
  const segments: TranscribeSegment[] = [];
  let cursor = 0;
  const step = 12;
  for (const sentence of sentences) {
    const m = /^([\p{L}\p{N} _-]{1,30})[:：]\s*(.*)$/u.exec(sentence);
    const speaker = m ? m[1] : undefined;
    const body = m ? m[2] : sentence;
    const len = Math.max(3, Math.min(20, Math.round(body.length / 8)));
    segments.push({ start: cursor, end: cursor + len, speaker, text: body });
    cursor += len + 2;
  }

  return { segments, text: cleaned, date, participants, transcriptionMode: 'mock' };
}

interface WhisperApiResponse {
  text?: string;
  segments?: Array<{ start: number; end: number; text: string; speaker?: string }>;
  language?: string;
}

async function transcribeWithWhisper(
  audioBytes: Buffer,
  mimeType: string,
  ext: string,
  cfg: WhisperConfig
): Promise<WhisperApiResponse> {
  const url = resolveTranscriptionsUrl(cfg.baseUrl);
  const model = cfg.model || 'whisper-1';
  const form = new FormData();
  // FormData in Node 18+ accepts Blob with filename + mimeType
  const blob = new Blob([audioBytes], { type: mimeType || 'audio/webm' });
  form.append('file', blob, `recording${ext}`);
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  if (cfg.language) form.append('language', cfg.language);

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      // Do NOT set Content-Type — let fetch set the multipart boundary.
    },
    body: form,
  });
  if (!upstream.ok) {
    const errText = await upstream.text();
    throw new Error(`Whisper API error (${upstream.status}): ${errText.slice(0, 500)}`);
  }
  const data = await upstream.json() as WhisperApiResponse;
  return data;
}

function normalizeWhisperSegments(data: WhisperApiResponse): TranscribeSegment[] {
  if (Array.isArray(data.segments) && data.segments.length > 0) {
    return data.segments.map(s => ({
      start: typeof s.start === 'number' ? s.start : 0,
      end: typeof s.end === 'number' ? s.end : 0,
      text: String(s.text || '').trim(),
      speaker: s.speaker,
    })).filter(s => s.text);
  }
  if (typeof data.text === 'string' && data.text.trim()) {
    return splitTranscript(data.text).map(sentence => {
      const m = /^([\p{L}\p{N} _-]{1,30})[:：]\s*(.*)$/u.exec(sentence);
      const speaker = m ? m[1] : undefined;
      const body = m ? m[2] : sentence;
      return {
        start: 0,
        end: 0,
        speaker,
        text: body,
      };
    });
  }
  return [];
}

function segmentsToText(segments: TranscribeSegment[]): string {
  return segments.map(s => `${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n').trim();
}

function decodeAudioBase64(data: string): Buffer {
  // Strip the optional `data:audio/...;base64,` prefix that MediaRecorder
  // sometimes produces when read via FileReader.readAsDataURL.
  const commaIdx = data.indexOf(',');
  const payload = commaIdx >= 0 ? data.slice(commaIdx + 1) : data;
  return Buffer.from(payload, 'base64');
}

async function persistAudio(
  audioBytes: Buffer,
  mimeType: string,
  filename: string | undefined,
  date: string
): Promise<{ recordingPath: string; ext: string }> {
  const ext = pickExtension(mimeType, filename);
  const dir = recordingsDir(date);
  await fs.promises.mkdir(dir, { recursive: true });
  const fileName = `${newUuid()}${ext}`;
  const recordingPath = path.join(dir, fileName);
  await fs.promises.writeFile(recordingPath, audioBytes);
  return { recordingPath, ext };
}

router.post('/transcribe', async (req, res) => {
  try {
    const body = req.body as (TranscribeAudioBody & TranscribeTextBody);
    if (!body) return res.status(400).json({ error: 'Missing request body' });
    const date = body.date || new Date().toISOString().slice(0, 10);
    const participants = Array.isArray(body.participants) ? body.participants.filter(p => typeof p === 'string') : [];

    // Branch 1: real audio (Phase 2 path)
    if (body.audio && typeof body.audio.data === 'string') {
      const { data, mimeType, filename } = body.audio;
      const audioBytes = decodeAudioBase64(data);
      if (audioBytes.length === 0) {
        return res.status(400).json({ error: 'Audio payload is empty' });
      }

      // Persist the raw audio first — even if the upstream Whisper call
      // fails, the user can retry / re-upload from the saved file.
      let savedPath = '';
      try {
        const saved = await persistAudio(audioBytes, mimeType || 'audio/webm', filename, date);
        savedPath = saved.recordingPath;
      } catch (persistErr) {
        console.warn('Failed to persist audio file:', persistErr);
        // Continue — the transcript can still be useful even without the file.
      }

      // Forward to the Whisper-compatible provider when configured.
      if (body.whisperConfig && body.whisperConfig.apiKey && body.whisperConfig.baseUrl) {
        const ext = pickExtension(mimeType, filename);
        const whisperResp = await transcribeWithWhisper(
          audioBytes,
          mimeType || 'audio/webm',
          ext,
          body.whisperConfig
        );
        const segments = normalizeWhisperSegments(whisperResp);
        const text = whisperResp.text?.trim() || segmentsToText(segments);
        return res.json({
          segments,
          text,
          date,
          participants,
          recordingPath: savedPath || undefined,
          transcriptionMode: 'whisper',
          model: body.whisperConfig.model || 'whisper-1',
        });
      }

      // No whisper config: audio is saved, return a mock segment scaffold so
      // the meeting flow can still continue. The frontend can re-call this
      // endpoint with a `whisperConfig` later (v1.1) to get a real transcript.
      const mock = mockTranscribeText(
        `[Phase 2] 录了 ${audioBytes.length} 字节音频 (${mimeType || 'audio/webm'}).\n` +
        `配置云端 Whisper API 后可获得真实转录。Audio saved to: ${savedPath}`,
        date,
        participants
      );
      return res.json({
        ...mock,
        recordingPath: savedPath || undefined,
        transcriptionMode: 'mock-with-audio',
      });
    }

    // Branch 2: Phase 1 text-only path
    if (typeof body.text === 'string' && body.text.trim()) {
      return res.json(mockTranscribeText(body.text, date, participants));
    }

    return res.status(400).json({
      error: 'Missing required field: provide either `audio` (Phase 2) or `text` (Phase 1).',
    });
  } catch (error: any) {
    console.error('Meeting transcribe failed:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: error.message || String(error) });
  }
});

interface SummarizeBody {
  apiKey: string;
  model?: string;
  baseUrl: string;
  /** Full transcript text (preferred) OR pre-built segments. */
  transcript?: string;
  segments?: TranscribeSegment[];
  title: string;
  participants?: string[];
  date?: string;
  time?: string;
  endTime?: string;
  maxTokens?: number;
  language?: 'zh' | 'en';
}

interface ActionItem {
  title: string;
  owner?: string;
  due?: string;
  priority?: 'high' | 'medium' | 'low';
}

interface SummarizeResponse {
  markdown: string;
  actionItems: ActionItem[];
  model: string;
}

const MEETING_ORGANIZER_SYSTEM_ZH =
  '你是一位会议纪要专家。请将原始会议转录整理为标准 Markdown 会议纪要, 输出 4 个二级标题: ' +
  '## 议程 (Agenda) / ## 关键决定 (Decisions) / ## 行动项 (Action Items, 每条用 - **owner**: action 格式, 标注负责人) / ## 下次会议 (Next Meeting)。' +
  '只返回 Markdown 正文, 不要任何前后修饰。';

const MEETING_ORGANIZER_SYSTEM_EN =
  'You are a meeting-notes expert. Reformat the raw meeting transcript into a Markdown note with four level-2 sections: ' +
  '## Agenda / ## Decisions / ## Action Items (each as "- **owner**: action" with the owner when known) / ## Next Meeting. ' +
  'Return only the Markdown body, no preamble.';

const ACTION_EXTRACTOR_SYSTEM =
  'You extract action items from a meeting note. Return ONLY a JSON array (no prose, no markdown fence) of objects with these keys: ' +
  'title (string, required), owner (string, optional), due (string, optional ISO date or "this week"), priority ("high"|"medium"|"low", optional). ' +
  'If no clear action items exist, return [].';

function stripCodeFence(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

function safeParseActionItems(raw: string): ActionItem[] {
  try {
    const cleaned = stripCodeFence(raw);
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item === 'object' && typeof item.title === 'string')
      .map(item => ({
        title: String(item.title).trim(),
        owner: typeof item.owner === 'string' ? item.owner.trim() : undefined,
        due: typeof item.due === 'string' ? item.due.trim() : undefined,
        priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : undefined,
      }))
      .filter(item => item.title);
  } catch {
    return [];
  }
}

async function callUpstreamChatCompletions(
  url: string,
  apiKey: string,
  model: string,
  messages: { role: 'system' | 'user'; content: string }[],
  maxTokens: number
): Promise<string> {
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });
  if (!upstream.ok) {
    const errText = await upstream.text();
    throw new Error(`Upstream AI error (${upstream.status}): ${errText.slice(0, 500)}`);
  }
  const data = await upstream.json() as any;
  let content = data?.choices?.[0]?.message?.content?.trim() || '';
  content = content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
  if (!content) throw new Error('Empty response from AI provider');
  return content;
}

router.post('/summarize', async (req, res) => {
  try {
    const body = req.body as SummarizeBody;
    if (!body || !body.apiKey || !body.baseUrl || !body.title) {
      return res.status(400).json({ error: 'Missing required fields: apiKey, baseUrl, title' });
    }
    if (!body.transcript && !(body.segments && body.segments.length > 0)) {
      return res.status(400).json({ error: 'Missing transcript or segments' });
    }

    const url = resolveChatCompletionsUrl(body.baseUrl);
    const model = body.model || 'default';
    const lang = body.language === 'en' ? 'en' : 'zh';
    const systemPrompt = lang === 'en' ? MEETING_ORGANIZER_SYSTEM_EN : MEETING_ORGANIZER_SYSTEM_ZH;
    const maxTokens = body.maxTokens ?? 4096;

    const transcriptSource = body.transcript
      ?? (body.segments || []).map(s => `${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n');

    const headerLines = [
      `# ${body.title}`,
      body.date ? `**Date**: ${body.date}` : null,
      body.time ? `**Time**: ${body.time}${body.endTime ? ` – ${body.endTime}` : ''}` : null,
      body.participants && body.participants.length ? `**Participants**: ${body.participants.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    const userPrompt =
      `${headerLines}\n\n---\n\n${transcriptSource}`;

    const markdown = await callUpstreamChatCompletions(url, body.apiKey, model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], maxTokens);

    let actionItems: ActionItem[] = [];
    try {
      const raw = await callUpstreamChatCompletions(url, body.apiKey, model, [
        { role: 'system', content: ACTION_EXTRACTOR_SYSTEM },
        { role: 'user', content: markdown },
      ], Math.min(maxTokens, 1024));
      actionItems = safeParseActionItems(raw);
    } catch (extractErr) {
      // Action item extraction is best-effort. We keep the note even if it
      // fails; the frontend still shows the raw Markdown.
      console.warn('Meeting action item extraction failed:', extractErr);
    }

    res.json({ markdown, actionItems, model });
  } catch (error: any) {
    console.error('Meeting summarize failed:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: error.message || String(error) });
  }
});

interface ExtractActionsBody {
  apiKey: string;
  baseUrl: string;
  model?: string;
  /** Markdown body of the meeting note. */
  markdown: string;
  language?: 'zh' | 'en';
  maxTokens?: number;
}

interface ExtractActionsResponse {
  actionItems: ActionItem[];
  model: string;
}

router.post('/extract-actions', async (req, res) => {
  try {
    const body = req.body as ExtractActionsBody;
    if (!body || !body.apiKey || !body.baseUrl || !body.markdown || !body.markdown.trim()) {
      return res.status(400).json({ error: 'Missing required fields: apiKey, baseUrl, markdown' });
    }
    const url = resolveChatCompletionsUrl(body.baseUrl);
    const model = body.model || 'default';
    const maxTokens = body.maxTokens ?? 1024;
    // Always use the bilingual-friendly action extractor (the system prompt
    // is language-agnostic; the LLM follows the language of the note).
    void body.language;

    const raw = await callUpstreamChatCompletions(url, body.apiKey, model, [
      { role: 'system', content: ACTION_EXTRACTOR_SYSTEM },
      { role: 'user', content: body.markdown },
    ], maxTokens);
    const actionItems = safeParseActionItems(raw);
    res.json({ actionItems, model });
  } catch (error: any) {
    console.error('Meeting extract-actions failed:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: error.message || String(error) });
  }
});

export default router;
