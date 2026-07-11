/**
 * Granola × DailyFlow — Phase 1 backend (mock).
 *
 * Two endpoints, modeled after /api/ai/summarize. API keys never leave the
 * server: the frontend posts transcript + provider config, and the server
 * forwards to the user's chosen OpenAI-compatible chat-completions endpoint.
 *
 * Phase 2 (out of scope here) will swap the mock `transcribe` for real
 * whisper.cpp / cloud Whisper; the route shape stays stable.
 */
import { Router } from 'express';

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

function resolveUrl(baseUrl: string): string {
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

interface TranscribeBody {
  /** Raw transcript text the user pasted (Phase 1). Phase 2 will accept audio. */
  text: string;
  /** Optional ISO date for the meeting; defaults to today. */
  date?: string;
  /** Optional list of attendee names to bias the segments. */
  participants?: string[];
}

interface TranscribeSegment {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

interface TranscribeResponse {
  segments: TranscribeSegment[];
  text: string;
  /** Echoed back so the frontend can persist alongside the note. */
  date: string;
  participants: string[];
}

/**
 * Mock transcribe: take the user's raw transcript, split on sentence
 * boundaries, fake timestamps every ~12s. Phase 2 replaces this with the
 * real whisper.cpp call (and later cloud Whisper through this same route).
 */
function mockTranscribe(text: string, date: string, participants: string[]): TranscribeResponse {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return { segments: [], text: '', date, participants };

  // Split on Chinese + English sentence boundaries; keep delimiters.
  const sentences = cleaned
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  // Crude speaker heuristic: a line that starts with "Name: " is treated as a
  // speaker turn. Otherwise the segments stay anonymous (matches the Phase 1
  // non-goal of "no speaker diarization").
  const segments: TranscribeSegment[] = [];
  let cursor = 0; // seconds
  const step = 12;
  for (const sentence of sentences) {
    const m = /^([\p{L}\p{N} _-]{1,30})[:：]\s*(.*)$/u.exec(sentence);
    const speaker = m ? m[1] : undefined;
    const body = m ? m[2] : sentence;
    const len = Math.max(3, Math.min(20, Math.round(body.length / 8)));
    segments.push({
      start: cursor,
      end: cursor + len,
      speaker,
      text: body,
    });
    cursor += len + 2;
  }

  return { segments, text: cleaned, date, participants };
}

router.post('/transcribe', (req, res) => {
  try {
    const body = req.body as TranscribeBody;
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      return res.status(400).json({ error: 'Missing required field: text' });
    }
    const date = body.date || new Date().toISOString().slice(0, 10);
    const participants = Array.isArray(body.participants) ? body.participants.filter(p => typeof p === 'string') : [];
    const result = mockTranscribe(body.text, date, participants);
    res.json(result);
  } catch (error: any) {
    console.error('Meeting transcribe failed:', error);
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

    const url = resolveUrl(body.baseUrl);
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
    console.error('Meeting summarize failed:', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

export default router;
