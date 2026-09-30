/**
 * Shared test harness for AI-agent e2e specs.
 *
 * The AI flow runs through the user's own provider: the DailyFlow backend
 * proxies `/api/ai/summarize` to whatever OpenAI-compatible `/v1/chat/completions`
 * URL the user configured. For e2e we don't want a real LLM dependency,
 * so this harness spins up a tiny stub HTTP server that:
 *
 *   • Receives the same JSON shape as a real chat-completions endpoint
 *     (Authorization Bearer header, model, messages, max_tokens).
 *   • Returns a canned "assistant" message that the test controls — either
 *     pure prose, or prose interleaved with one or more
 *     `<tool_call>{"name":"...","arguments":{...}}</tool_call>` blocks.
 *   • Replays a pre-programmed response sequence (so a single spec can
 *     exercise the model's two-round "ground the summary in real results"
 *     protocol: round 1 emits tool calls, round 2 sees the tool results).
 *
 * The frontend is wired up via Playwright's `addInitScript`, which seeds
 * `localStorage.df_model_center` with a ProviderConfig pointing at this
 * stub before the React app boots. The DailyFlow backend then proxies
 * to it transparently.
 *
 * Use:
 *   const stub = await startAiStub({ port: 0 });
 *   stub.respond([{ summary: 'hello' }, { summary: 'round 2' }]);
 *   // ... Playwright setup with addInitScript that writes the localStorage
 *   // pointing at stub.url ...
 *   // ... test sends a chat message; stub.consumed() returns N (1-based).
 *   await stub.close();
 */
import http from 'node:http';
import { AddressInfo } from 'node:net';

export interface StubResponse {
  /** Plain assistant text. Tool calls may be appended via toolCalls. */
  summary?: string;
  /** Inline `<tool_call>` blocks the agent must execute before round 2. */
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  /** Hard error to surface (HTTP 4xx/5xx). */
  error?: { status: number; body: { error: string } };
}

export interface AiStub {
  /** Resolved absolute base URL, e.g. http://127.0.0.1:43217 */
  url: string;
  /** Resolved port (useful when port=0 was passed). */
  port: number;
  /** Replace the queued response sequence. */
  respond(responses: StubResponse[]): void;
  /** Append more responses to the queue (existing ones stay). */
  enqueue(responses: StubResponse[]): void;
  /** Number of times `/v1/chat/completions` has been hit. */
  consumed(): number;
  /** Capture the most recent request body (after consume). */
  lastRequestBody(): Record<string, unknown> | null;
  /** Stop the stub server. */
  close(): Promise<void>;
}

/**
 * Start a stub OpenAI-compatible chat-completions server on 127.0.0.1.
 * Pass port=0 to let the kernel assign a free port (recommended).
 */
export async function startAiStub(opts?: { port?: number; path?: string }): Promise<AiStub> {
  const path = opts?.path ?? '/v1/chat/completions';
  let responses: StubResponse[] = [];
  let consumed = 0;
  let lastBody: Record<string, unknown> | null = null;

  const server = http.createServer(async (req, res) => {
    // The DailyFlow backend hits /v1/chat/completions. Anything else gets 404.
    if (req.url !== path || req.method !== 'POST') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try {
      lastBody = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    } catch {
      res.statusCode = 400;
      res.end('bad json');
      return;
    }
    consumed += 1;
    const idx = consumed - 1;
    const reply = responses[idx] ?? responses[responses.length - 1] ?? { summary: 'stub-exhausted' };
    if (reply.error) {
      res.statusCode = reply.error.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(reply.error.body));
      return;
    }
    // Compose the assistant content: prose + inline tool-call blocks.
    const parts: string[] = [];
    if (reply.summary) parts.push(reply.summary);
    if (reply.toolCalls?.length) {
      for (const call of reply.toolCalls) {
        parts.push(`<tool_call>${JSON.stringify({ name: call.name, arguments: call.arguments })}</tool_call>`);
      }
    }
    const content = parts.join('\n');
    const body = {
      id: `stub-${consumed}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: lastBody?.model ?? 'stub-model',
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      }],
    };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(opts?.port ?? 0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    port: addr.port,
    respond(queued: StubResponse[]) { responses = [...queued]; },
    enqueue(queued: StubResponse[]) { responses = [...responses, ...queued]; },
    consumed: () => consumed,
    lastRequestBody: () => lastBody,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * Build a ProviderConfig seed (serialized JSON) that points at the stub.
 * Paste it into localStorage.df_model_center before the app boots.
 */
export function providerConfigSeed(stubUrl: string): string {
  const now = new Date().toISOString();
  const store = {
    configs: [{
      id: 'stub-provider',
      name: 'Stub',
      apiKey: 'stub-key',
      baseUrl: stubUrl,
      model: 'stub-model',
      createdAt: now,
      updatedAt: now,
    }],
    activeId: 'stub-provider',
    roles: { chatProviderId: 'stub-provider' },
  };
  return JSON.stringify(store);
}