import { appendFile, readFile, rename, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dailyflow-event-operator-tools'
export const inject = []

export const DAILYFLOW_TOOL_NAMES = Object.freeze([
  'read_event',
  'read_mindmap',
  'read_evidence',
  'search_evidence',
  'list_commitments',
  'propose_graph_patch',
  'complete_event_run',
])

const allowed = new Set(DAILYFLOW_TOOL_NAMES)
const SPINE_GLOBAL_TOOLS = Object.freeze([
  'bash', 'create_goal', 'get_goal', 'job_kill', 'job_list', 'job_output', 'skill', 'update_goal',
])
const projectionPath = process.env.DAILYFLOW_DSH_PROJECTION_PATH
const handoffPath = process.env.DAILYFLOW_DSH_HANDOFF_PATH
const eventsPath = process.env.DAILYFLOW_DSH_EVENTS_PATH
const toolsetSnapshotPath = process.env.DAILYFLOW_DSH_TOOLSET_SNAPSHOT_PATH

function requiredPath(value, label) {
  if (!value) throw Object.assign(new Error(`${label} is not configured`), { code: 'DAILYFLOW_IPC_NOT_CONFIGURED' })
  return resolve(value)
}

async function projection() {
  const raw = await readFile(requiredPath(projectionPath, 'projection path'), 'utf8')
  if (Buffer.byteLength(raw) > 2 * 1024 * 1024) {
    throw Object.assign(new Error('bounded projection exceeds 2 MiB'), { code: 'DAILYFLOW_PROJECTION_TOO_LARGE' })
  }
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('bounded projection must be an object'), { code: 'DAILYFLOW_PROJECTION_INVALID' })
  }
  return parsed
}

function jsonOutput() {
  return {
    schema: { type: 'json' },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  }
}

const nodeKinds = ['root', 'branch', 'tag', 'task', 'question', 'resource', 'risk', 'decision', 'waiting', 'outcome']
const operationSchema = {
  oneOf: [
    {
      type: 'object', additionalProperties: false, properties: {
        changeId: { type: 'string', required: true }, op: { type: 'string', const: 'add_node', required: true },
        tempId: { type: 'string', required: true }, parentId: { type: 'string', required: true },
        node: { type: 'object', additionalProperties: false, required: true, properties: {
          kind: { type: 'string', enum: nodeKinds, required: true }, text: { type: 'string', required: true }, note: { type: 'string' },
        } },
        evidenceIds: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number', required: true }, reason: { type: 'string', required: true },
      },
    },
    {
      type: 'object', additionalProperties: false, properties: {
        changeId: { type: 'string', required: true }, op: { type: 'string', const: 'update_node', required: true },
        nodeId: { type: 'string', required: true }, patch: { type: 'object', additionalProperties: false, required: true, properties: {
          text: { type: 'string' }, note: { type: 'string' }, kind: { type: 'string', enum: nodeKinds },
        } },
        evidenceIds: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number', required: true }, reason: { type: 'string', required: true },
      },
    },
    {
      type: 'object', additionalProperties: false, properties: {
        changeId: { type: 'string', required: true }, op: { type: 'string', const: 'move_node', required: true },
        nodeId: { type: 'string', required: true }, newParentId: { type: 'string', required: true },
        confidence: { type: 'number', required: true }, reason: { type: 'string', required: true },
      },
    },
    {
      type: 'object', additionalProperties: false, properties: {
        changeId: { type: 'string', required: true }, op: { type: 'string', const: 'link_entity', required: true },
        nodeId: { type: 'string', required: true }, entityRef: { type: 'object', additionalProperties: false, required: true, properties: {
          type: { type: 'string', enum: ['commitment', 'decision', 'outcome', 'note', 'source', 'evidence'], required: true }, id: { type: 'string', required: true },
        } },
        reason: { type: 'string', required: true },
      },
    },
  ],
}

function tool(name, description, parameters, execute) {
  return defineTool({
    name,
    description,
    parameters,
    output: jsonOutput(),
    async execute(args, exec) {
      await logEvent({ type: 'tool.started', callId: String(exec.callId), tool: name })
      try {
        const value = await execute(args, exec)
        await logEvent({ type: 'tool.completed', callId: String(exec.callId), tool: name, ok: true })
        return value
      } catch (error) {
        await logEvent({ type: 'tool.completed', callId: String(exec.callId), tool: name, ok: false })
        throw error
      }
    },
  })
}

async function logEvent(event) {
  if (!eventsPath) return
  await appendFile(resolve(eventsPath), `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`, { encoding: 'utf8', mode: 0o600 })
}

async function writeHandoff(value) {
  const target = requiredPath(handoffPath, 'proposal handoff path')
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temp, target)
}

function mount(tools) {
  tools.register(tool('read_event', 'Read the bounded Event summary.', {}, async () => {
    const p = await projection()
    return { event: p.event ?? null, baseRevision: p.baseRevision ?? null }
  }))
  tools.register(tool('read_mindmap', 'Read bounded Event graph nodes and edges.', {}, async () => {
    const p = await projection()
    return { nodes: p.mindmap?.nodes ?? p.nodes ?? [], edges: p.mindmap?.edges ?? p.edges ?? [] }
  }))
  tools.register(tool('read_evidence', 'Read one evidence item from the bounded Event projection.', {
    evidenceId: { type: 'string', required: true },
  }, async ({ evidenceId }) => {
    const p = await projection()
    return (p.evidence ?? p.evidenceItems ?? []).find((item) => item?.id === evidenceId) ?? null
  }))
  tools.register(tool('search_evidence', 'Search only evidence already present in the bounded Event projection.', {
    query: { type: 'string', required: true },
    limit: { type: 'integer' },
  }, async ({ query, limit }) => {
    const p = await projection()
    const needle = query.trim().toLocaleLowerCase()
    const cap = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 8, 20))
    return (p.evidence ?? p.evidenceItems ?? []).filter((item) => JSON.stringify(item).toLocaleLowerCase().includes(needle)).slice(0, cap)
  }))
  tools.register(tool('list_commitments', 'List commitments linked to this Event in the bounded projection.', {}, async () => {
    const p = await projection()
    return p.commitments ?? []
  }))
  tools.register(tool('propose_graph_patch', 'Hand one strictly typed graph proposal to DailyFlow for review. Call this once before complete_event_run. This never writes formal business data. An empty operations array is valid when no safe change is supported.', {
    baseRevision: { type: 'string', required: true },
    summary: { type: 'string', required: true },
    operations: { type: 'array', items: operationSchema, required: true, description: 'Only add_node, update_node, move_node, or link_entity objects matching this schema. Do not pass graph nodes or edges directly.' },
  }, async ({ baseRevision, summary, operations }) => {
    const p = await projection()
    if (baseRevision !== p.baseRevision) {
      throw Object.assign(new Error('proposal base revision does not match bounded projection'), { code: 'DAILYFLOW_REVISION_MISMATCH' })
    }
    if (operations.length > 12) throw Object.assign(new Error('proposal exceeds 12 operations'), { code: 'DAILYFLOW_PROPOSAL_TOO_LARGE' })
    const proposal = { baseRevision, summary, operations }
    await writeHandoff({ type: 'proposal', proposal })
    return { acceptedForReview: true, operationCount: operations.length }
  }))
  tools.register(tool('complete_event_run', 'Complete this Event Operator run after handing off a proposal.', {
    summary: { type: 'string', required: true },
  }, async ({ summary }) => {
    const target = requiredPath(handoffPath, 'proposal handoff path')
    let previous = {}
    try { previous = JSON.parse(await readFile(target, 'utf8')) } catch {}
    await writeHandoff({ ...previous, type: 'complete', summary })
    return { status: 'waiting_review' }
  }))

  // Visibility is intentionally only these seven registrations. This guard is
  // the authority boundary: later policy hooks cannot re-allow another name.
  tools.guard(({ name }) => allowed.has(name) ? undefined : 'DailyFlow Event Operator tool is not allowed')
  // DailyFlow definitions are scope-local, while stock spine definitions are
  // global. Hide the complete pinned stock set; the monotonic guard below also
  // denies any future/late global registration that this visibility snapshot
  // cannot name.
  tools.restrict({ deny: SPINE_GLOBAL_TOOLS })
}

export function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    const tools = agent.ctx.get('tools')
    if (!tools) throw new Error('DailyFlow Event Operator agent has no ToolRuntime')
    mount(tools)
    if (toolsetSnapshotPath) {
      const names = tools.schemas(agent).map((schema) => schema.name).sort()
      writeFileSync(resolve(toolsetSnapshotPath), `${JSON.stringify(names)}\n`, { encoding: 'utf8', mode: 0o600 })
    }
  })
}
