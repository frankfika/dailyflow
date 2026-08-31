/**
 * Integration test: full HTTP flow against the v2 router.
 *
 * Boots the Express app, uses a temp workspace, and exercises the spec
 * section 26 acceptance scenario end-to-end over the network boundary.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v2Router } from '../index';
import { loadConfig } from '../../../services/config';
import { saveConfig } from '../../../services/config';
import { V2Repository } from '../../../repositories/v2/repository';
import { EventOperatorRunSchema, EventGraphProposalSchema } from '../../../domain/v2/eventOperator';
import { newId } from '../../../domain/v2/ulid';
import { persistRuntimeEvent } from '../../../services/v2/runtimeEventPersistence';
import { computeBaseRevision } from '../../../domain/v2/eventGraphValidator';

let app: express.Express;
let workspace: string;
let configDir: string;
let server: any;
let previousConfigFile: string | undefined;

beforeAll(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-routes-'));
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-config-'));
  previousConfigFile = process.env.DAILYFLOW_CONFIG_FILE;
  process.env.DAILYFLOW_CONFIG_FILE = path.join(configDir, 'config.json');
  process.env.DAILYFLOW_V2_WORKSPACE_ROOT = workspace;
  process.env.DAILYFLOW_V2_WORKSPACE_ID = 'ws_test';
  process.env.V2_AI_PROVIDER = 'local-deterministic';
  process.env.V2_AI_API_KEY = '';

  // Pre-populate ~/.dailyflow/config.json with v2 flags + workspaceRoot
  const cfg = await loadConfig();
  await saveConfig({
    ...cfg,
    workspaceRoot: workspace,
    workspaces: [{
      id: 'ws_test',
      name: 'V2 test workspace',
      path: workspace,
      createdAt: new Date().toISOString(),
    }],
    activeWorkspaceId: 'ws_test',
    v2: { enabled: true, inboxV2: true, todayV2: true, memoryV2: true, connectorsV2: false, aiEnabled: false, contextBudgetBytes: 32000 } as any,
  });

  app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/v2', v2Router);
});

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.rm(configDir, { recursive: true, force: true });
  if (previousConfigFile === undefined) {
    delete process.env.DAILYFLOW_CONFIG_FILE;
  } else {
    process.env.DAILYFLOW_CONFIG_FILE = previousConfigFile;
  }
});

async function post(path: string, body: unknown) {
  return fetch(`http://localhost:9999/api/v2${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json().then(j => ({ status: r.status, body: j })));
}

async function get(path: string) {
  return fetch(`http://localhost:9999/api/v2${path}`).then(r => r.json().then(j => ({ status: r.status, body: j })));
}

// We need a real server for these tests because the v2 router uses async
// middleware. We start it in beforeAll.
describe('v2 routes — full spec section 26 acceptance scenario', () => {
  it('runs end-to-end through HTTP', async () => {
    // Start a real server
    server = app.listen(9999);
    try {
      // 1. Status
      const status = await get('/status');
      expect(status.status).toBe(200);
      expect(status.body.flags.enabled).toBe(true);

      // 2. Capture meeting minutes
      const capture = await post('/inbox/capture', {
        kind: 'quick_capture',
        title: '周会',
        body: '讨论了 Q3 计划。\nAlex 答应下周三前给到技术方案。\n我承诺本周五前向 Zhang 发出更新后的合作方案。\n决定：采用两档定价。',
      });
      expect(capture.status).toBe(201);
      const sourceId = capture.body.source.id;

      // 3. Inbox lists the source
      const inbox = await get('/inbox');
      expect(inbox.status).toBe(200);
      expect(inbox.body.items.find((s: { id: string }) => s.id === sourceId)).toBeDefined();

      // Reading a note must not trigger a detached whole-file write that can
      // race and overwrite a subsequent autosave.
      const saveProbeNote = await post('/notes', { body: 'autosave probe' });
      expect(saveProbeNote.status).toBe(201);
      const saveProbeCreatedAt = saveProbeNote.body.note.createdAt as string;
      // The repository partitions note files by LOCAL date, while createdAt
      // is a UTC ISO string — derive the directory from the local date of
      // createdAt so this test also passes across UTC/local day boundaries.
      const saveProbeCreated = new Date(saveProbeCreatedAt);
      const saveProbeYear = String(saveProbeCreated.getFullYear());
      const saveProbeMonth = String(saveProbeCreated.getMonth() + 1).padStart(2, '0');
      const saveProbePath = path.join(
        workspace,
        '.dailyflow',
        'notes',
        saveProbeYear,
        saveProbeMonth,
        `${saveProbeNote.body.note.id}.md`,
      );
      const noteBeforeRead = await fs.readFile(saveProbePath, 'utf8');
      const readOnlyNote = await get(`/notes/${saveProbeNote.body.note.id}`);
      expect(readOnlyNote.status).toBe(200);
      // Give any accidentally detached write enough time to finish.
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(await fs.readFile(saveProbePath, 'utf8')).toBe(noteBeforeRead);

      // The compatibility archive endpoint must participate in the same
      // autosave version protocol instead of performing an unguarded write.
      const unversionedArchive = await post(`/notes/${saveProbeNote.body.note.id}/archive`, {});
      expect(unversionedArchive.status).toBe(400);
      const versionedArchive = await post(`/notes/${saveProbeNote.body.note.id}/archive`, {
        expectedAutoSaveVersion: saveProbeNote.body.note.autoSaveVersion,
      });
      expect(versionedArchive.status).toBe(200);
      expect(versionedArchive.body.note.state).toBe('archived');
      expect(versionedArchive.body.note.autoSaveVersion).toBe(
        saveProbeNote.body.note.autoSaveVersion + 1,
      );

      // A meeting recording is captured natively under an existing Note.
      const meetingNote = await post('/notes', {
        body: '会议中的手写记录',
        tagIds: ['周会', '产品'],
      });
      expect(meetingNote.status).toBe(201);
      const meetingCapture = await post(`/notes/${meetingNote.body.note.id}/meeting/capture`, {
        audio: {
          data: Buffer.from('route-test-audio').toString('base64'),
          mimeType: 'audio/webm',
          filename: 'weekly.webm',
        },
        durationSeconds: 12,
        language: 'zh',
      });
      expect(meetingCapture.status).toBe(200);
      expect(meetingCapture.body.transcriptionMode).toBe('saved-only');
      expect(meetingCapture.body.note.kind).toBe('meeting');
      expect(meetingCapture.body.note.tagIds).toEqual(['周会', '产品']);
      expect(meetingCapture.body.note.sourceIds).toContain(meetingCapture.body.audioSource.id);
      expect(meetingCapture.body.audioSource.filePath).toMatch(/^Attachments\/Notes\//);
      expect(await fs.readFile(path.join(workspace, meetingCapture.body.audioSource.filePath), 'utf8'))
        .toBe('route-test-audio');
      const audioPlayback = await fetch(
        `http://localhost:9999/api/v2/notes/${meetingNote.body.note.id}/meeting/audio/${meetingCapture.body.audioSource.id}`,
      );
      expect(audioPlayback.status).toBe(200);
      expect(audioPlayback.headers.get('content-type')).toContain('audio/webm');
      expect(Buffer.from(await audioPlayback.arrayBuffer()).toString('utf8')).toBe('route-test-audio');

      // Desktop clients upload the recording as raw bytes so long meetings do
      // not incur base64 expansion or duplicate the whole audio in JSON.
      const binaryCaptureResponse = await fetch(
        `http://localhost:9999/api/v2/notes/${meetingNote.body.note.id}/meeting/capture-binary?filename=long-meeting.m4a&durationSeconds=6624&language=zh`,
        {
          method: 'POST',
          headers: { 'content-type': 'audio/mp4' },
          body: Buffer.from('route-test-binary-audio'),
        },
      );
      const binaryCapture = await binaryCaptureResponse.json();
      expect(binaryCaptureResponse.status, JSON.stringify(binaryCapture)).toBe(200);
      expect(binaryCapture.transcriptionMode).toBe('saved-only');
      expect(binaryCapture.audioSource.meta.durationSeconds).toBe(6624);
      expect(binaryCapture.audioSource.filePath).toMatch(/\.m4a$/);
      expect(await fs.readFile(path.join(workspace, binaryCapture.audioSource.filePath), 'utf8'))
        .toBe('route-test-binary-audio');

      const unrelatedAudio = await get(
        `/notes/${meetingNote.body.note.id}/meeting/audio/src_DOESNOTEXIST`,
      );
      expect(unrelatedAudio.status).toBe(404);
      expect(unrelatedAudio.body.error.code).toBe('audio_source_not_found');

      // 4. Process: AI returns a fallback (no provider)
      const processed = await post(`/sources/${sourceId}/process`, {});
      expect(processed.status).toBe(200);
      expect(processed.body.fallback).toBe(true);
      expect(processed.body.job.status).toMatch(/succeeded|waiting_review/);
      const resumedProcessing = await post(`/sources/${sourceId}/process`, {});
      expect(resumedProcessing.status).toBe(200);
      expect(resumedProcessing.body.resumed).toBe(true);
      expect(resumedProcessing.body.job.id).toBe(processed.body.job.id);

      // Durable job can be recovered after the processing request returns.
      const processedJob = await get(`/jobs/${processed.body.job.id}`);
      expect(processedJob.status).toBe(200);
      expect(processedJob.body.job.entityRef).toEqual({ type: 'source', id: sourceId });

      // Generic jobs are idempotent and can be cancelled through the API.
      const jobBody = {
        kind: 'import',
        entityRef: { type: 'workspace', id: 'ws_test' },
        idempotencyKey: 'route-test-import-job',
      };
      const createdJob = await post('/jobs', jobBody);
      const duplicateJob = await post('/jobs', jobBody);
      expect(duplicateJob.body.job.id).toBe(createdJob.body.job.id);
      const cancelledJob = await post(`/jobs/${createdJob.body.job.id}/cancel`, {});
      expect(cancelledJob.body.job.status).toBe('cancelled');

      // 5. Manually create a commitment (user typed the data)
      const create = await post('/commitments', {
        title: '本周五前向 Zhang 发出更新后的合作方案',
        outcome: 'Zhang 收到包含最新报价和实施范围的合作方案。',
        state: 'active',
        importance: 'high',
        dueAt: '2026-07-24T17:00:00+08:00',
        dueConfidence: 'explicit',
        sourceIds: [sourceId],
      });
      expect(create.status).toBe(201);
      const comId = create.body.commitment.id;

      // 6. Reload: commitment is still there
      const reload = await get(`/commitments/${comId}`);
      expect(reload.status).toBe(200);
      expect(reload.body.commitment.title).toContain('Zhang');

      // 7. Generate today's plan
      const today = new Date().toISOString().slice(0, 10);
      const plan = await post('/plans/generate', { date: today, availableMinutes: 240 });
      expect(plan.status).toBe(200);
      const item = plan.body.plan.items.find((i: { commitmentId: string }) => i.commitmentId === comId);
      expect(item).toBeDefined();

      // 8. Re-plan with reduced capacity
      const replan = await post('/plans/generate', {
        date: today,
        brief: 'Only 2 hours in the afternoon',
      });
      expect(replan.status).toBe(200);
      expect(replan.body.plan.availableMinutes).toBe(120);

      // 9. Set to wait on Alex
      const wait = await post(`/commitments/${comId}/wait`, {
        waitingOnText: 'Alex',
        reviewAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      });
      expect(wait.status).toBe(200);
      expect(wait.body.commitment.state).toBe('waiting');

      // 10. Complete with outcome
      const complete = await post(`/commitments/${comId}/complete`, {
        outcomeKind: 'sent',
        outcomeSummary: '已通过邮件向 Zhang 发出合作方案。',
      });
      expect(complete.status).toBe(200);
      expect(complete.body.commitment.state).toBe('completed');
      expect(complete.body.outcome.id).toMatch(/^out_/);

      // 11. Memory search
      const search = await get('/memory/search?q=Zhang');
      expect(search.status).toBe(200);
      expect(search.body.hits.length).toBeGreaterThan(0);

      // 12. History
      const history = await get(`/commitments/${comId}/history`);
      expect(history.status).toBe(200);
      expect(history.body.events.length).toBeGreaterThan(0);

      // 13. Unimplemented connector APIs stay hidden while the flag is off.
      const connectors = await get('/connectors');
      expect(connectors.status).toBe(404);

      // 14. Sync cannot be invoked through a disabled capability.
      const sync = await post('/connectors/google-calendar/sync', {});
      expect(sync.status).toBe(404);

      // 15. Durable run events replay as SSE and a retryable failed Run can be queued.
      const repo = new V2Repository({ root: workspace, workspaceId: 'ws_test' });
      const runId = newId('eval');
      const eventId = 'event_route_operator';
      const mapId = 'map_route_operator';
      const runNow = new Date().toISOString();
      await repo.saveEventOperatorRun(EventOperatorRunSchema.parse({
        id: runId, schemaVersion: 2, workspaceId: 'ws_test', eventId, mindmapId: mapId,
        runtimeId: 'deepseek-harness', runtimeVersion: 'test', modelProvider: 'test', model: 'test', promptVersion: '1',
        scope: { workspaceId: 'ws_test', eventId, mindmapId: mapId, trigger: 'event_canvas', selectedContextRefs: [], contextBudgetBytes: 4096 },
        phase: 'prepare', status: 'failed', contextManifest: [], metrics: {}, idempotencyKey: 'route-run',
        error: { code: 'RUNTIME_SESSION_LOST', message: 'lost', retryable: true, stage: 'prepare' }, createdAt: runNow, updatedAt: runNow,
      }));
      await persistRuntimeEvent(repo, runId, { type: 'run.failed', error: { code: 'lost', message: 'lost', retryable: true }, at: runNow });
      const sse = await fetch(`http://localhost:9999/api/v2/agent-runs/${runId}/events`);
      const sseBody = await sse.text();
      expect(sse.status).toBe(200);
      expect(sse.headers.get('content-type')).toContain('text/event-stream');
      expect(sseBody).toContain('id: 1\nevent: run.failed');
      const retry = await post(`/agent-runs/${runId}/retry`, {});
      expect(retry.status).toBe(200);
      expect(retry.body.run.status).toBe('queued');

      // 16. Canonical Proposal API validates and idempotently replays apply.
      const mapNow = new Date().toISOString();
      const rootNodeId = 'node_route_root';
      const map = { id: mapId, title: 'Route Event', rootId: rootNodeId, nodes: [{ id: rootNodeId, text: 'Route Event', kind: 'root', position: { x: 0, y: 0 } }], edges: [], version: 2, createdAt: mapNow, updatedAt: mapNow };
      await fs.mkdir(path.join(workspace, '.dailyflow', 'mindmaps'), { recursive: true });
      await fs.writeFile(path.join(workspace, '.dailyflow', 'mindmaps', `${mapId}.json`), JSON.stringify(map));
      const commitments = await repo.listCommitments();
      const baseRevision = computeBaseRevision({ mindmapId: mapId, mindmapUpdatedAt: mapNow, eventStatus: 'active', nodes: map.nodes, edges: [], commitments: commitments.map((c) => ({ id: c.id, updatedAt: c.updatedAt, state: c.state })) });
      const graphProposal = EventGraphProposalSchema.parse({ id: newId('gprop'), schemaVersion: 1, workspaceId: 'ws_test', eventId, mindmapId: mapId, agentRunId: runId,
        baseRevision, status: 'pending', operations: [{ changeId: 'route_change', op: 'add_node', tempId: 'route_tmp', parentId: rootNodeId, node: { kind: 'branch', text: 'Review' }, evidenceIds: [], confidence: 1, reason: 'route test' }],
        summary: 'Route proposal', riskLevel: 'low', createdAt: mapNow });
      await repo.saveEventGraphProposal(graphProposal);
      expect((await get(`/event-graph-proposals/${graphProposal.id}`)).status).toBe(200);
      const graphValidation = await post(`/event-graph-proposals/${graphProposal.id}/validate`, {});
      expect(graphValidation.status, JSON.stringify(graphValidation.body)).toBe(200);
      const graphApply = await post(`/event-graph-proposals/${graphProposal.id}/apply`, { idempotencyKey: 'route-apply-key' });
      expect(graphApply.status).toBe(200);
      expect(graphApply.body.proposal.status).toBe('accepted');
      const graphReplay = await post(`/event-graph-proposals/${graphProposal.id}/apply`, { idempotencyKey: 'route-apply-key' });
      expect(graphReplay.status).toBe(200);
      expect(graphReplay.body.replayed).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
