import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GraphOperationSchema } from '../../domain/v2/eventOperator.js';
import type { V2AIConfig } from '../v2/ai/provider.js';
import type { RuntimeProposalDraft, RuntimeRunSpec } from './AgentRuntime.js';
import { assertSafeModelBaseUrl } from './aiTargetPolicy.js';
import { createDailyFlowSidecar, DailyFlowAcpClient, type RuntimeProcessManager } from './runtimeProcessManager.js';
import { z } from 'zod';

const HandoffSchema = z.object({
  proposal: z.object({
    baseRevision: z.string().min(1),
    summary: z.string().min(1).max(500),
    operations: z.array(GraphOperationSchema).max(12),
  }),
  summary: z.string().optional(),
}).passthrough();

export interface AcpBackendEvent {
  type: 'assistant.delta' | 'tool.started' | 'tool.completed';
  text?: string;
  callId?: string;
  tool?: string;
  ok?: boolean;
  at: string;
}

export interface AcpBackendRun {
  sessionId: string;
  client: DailyFlowAcpClient;
  process: RuntimeProcessManager;
  result: Promise<{ proposal: RuntimeProposalDraft; summary: string; trace: AcpBackendEvent[] }>;
}

export async function startDshAcpRun(config: V2AIConfig, spec: RuntimeRunSpec): Promise<AcpBackendRun> {
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw Object.assign(new Error('Model Center configuration is incomplete.'), { code: 'MODEL_NOT_CONFIGURED' });
  }
  await assertSafeModelBaseUrl(config.baseUrl);
  const root = await mkdtemp(path.join(os.tmpdir(), 'dailyflow-dsh-'));
  const projectionPath = path.join(root, 'projection.json');
  const handoffPath = path.join(root, 'handoff.json');
  const eventsPath = path.join(root, 'tool-events.jsonl');
  const sessionsRoot = path.join(root, 'sessions');
  await writeFile(projectionPath, JSON.stringify({
    ...(spec.context.projection as Record<string, unknown>),
    baseRevision: spec.context.baseRevision,
  }), { encoding: 'utf8', mode: 0o600 });
  const process = createDailyFlowSidecar({
    cwd: root,
    env: {
      DAILYFLOW_DSH_API_KEY: config.apiKey,
      DAILYFLOW_DSH_BASE_URL: config.baseUrl,
      DAILYFLOW_DSH_MODEL: config.model,
      DAILYFLOW_DSH_API: config.format === 'anthropic' ? 'anthropic-messages' : 'openai-completions',
      DAILYFLOW_DSH_PROJECTION_PATH: projectionPath,
      DAILYFLOW_DSH_HANDOFF_PATH: handoffPath,
      DAILYFLOW_DSH_EVENTS_PATH: eventsPath,
      DAILYFLOW_DSH_TOOLSET_SNAPSHOT_PATH: path.join(root, 'toolset.json'),
      DAILYFLOW_DSH_SESSION_ROOT: sessionsRoot,
      DSH_HOME: path.join(root, '.dsh'),
      DSH_AGENTS_HOME: path.join(root, '.agents'),
    },
  });
  try {
    await process.start();
    const client = new DailyFlowAcpClient(process);
    await client.initialize();
    const sessionId = await client.newSession(root);
    const result = (async () => {
      try {
        const prompt = `Process exactly one bounded DailyFlow Event. First call read_event and read_mindmap. Then call propose_graph_patch exactly once with baseRevision=${spec.context.baseRevision}. Its operations must match the tool's strict schema; graph nodes/edges are not operations. Use [] when evidence does not support a safe change. After the proposal tool succeeds, call complete_event_run exactly once. Do not merely describe a proposal in assistant text.`;
        const promptResult = await client.prompt(sessionId, prompt);
        const stopReason = typeof promptResult === 'object' && promptResult ? (promptResult as { stopReason?: unknown }).stopReason : undefined;
        if (stopReason === 'cancelled') throw Object.assign(new Error('ACP run cancelled.'), { code: 'RUNTIME_CANCELLED' });
        const handoff = HandoffSchema.parse(JSON.parse(await readFile(handoffPath, 'utf8')));
        const trace = await readTrace(eventsPath);
        for (const notification of client.drainNotifications()) {
          if (notification.method !== 'session/update' || !notification.params || typeof notification.params !== 'object') continue;
          const update = (notification.params as { update?: unknown }).update;
          if (!update || typeof update !== 'object') continue;
          const content = (update as { content?: unknown }).content;
          if ((update as { sessionUpdate?: unknown }).sessionUpdate === 'agent_message_chunk'
            && content && typeof content === 'object' && (content as { type?: unknown }).type === 'text'
            && typeof (content as { text?: unknown }).text === 'string') {
            trace.push({ type: 'assistant.delta', text: (content as { text: string }).text, at: new Date().toISOString() });
          }
        }
        return { proposal: handoff.proposal, summary: handoff.summary ?? handoff.proposal.summary, trace };
      } finally {
        await process.stop();
        await rm(root, { recursive: true, force: true });
      }
    })();
    return { sessionId, client, process, result };
  } catch (error) {
    await process.stop();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function readTrace(file: string): Promise<AcpBackendEvent[]> {
  try {
    return (await readFile(file, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as AcpBackendEvent);
  } catch {
    return [];
  }
}
