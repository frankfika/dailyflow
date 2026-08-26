import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import type { V2Repository } from '../../repositories/v2/repository.js';
import type { EventGraphProposal } from '../../domain/v2/eventOperator.js';

export interface GraphApplyRequest {
  idempotencyKey: string;
  selection?: string[];
  overrides?: Record<string, Record<string, unknown>>;
}

export interface GraphApplyReplay {
  replayed: true;
  proposal: EventGraphProposal;
  appliedChanges: string[];
  staleChangeIds: string[];
  createdCommitments: number;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function graphApplyRequestHash(request: Pick<GraphApplyRequest, 'selection' | 'overrides'>): string {
  return createHash('sha256').update(canonical({
    selection: [...(request.selection ?? [])].sort(),
    overrides: request.overrides ?? {},
  })).digest('hex');
}

/**
 * Return a durable replay result, or reject an idempotency-key collision.
 * An accepted Proposal with a different key is also terminal and cannot be
 * applied again under a fresh client key.
 */
export function inspectGraphApplyReplay(proposal: EventGraphProposal, request: GraphApplyRequest): GraphApplyReplay | null {
  const receipt = proposal.applyReceipt;
  if (!receipt) return null;
  const requestHash = graphApplyRequestHash(request);
  if (receipt.idempotencyKey === request.idempotencyKey) {
    if (receipt.requestHash !== requestHash) {
      throw applyError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key was already used with a different selection or overrides.');
    }
    return {
      replayed: true,
      proposal,
      appliedChanges: receipt.acceptedChangeIds ?? proposal.acceptedChangeIds ?? [],
      staleChangeIds: receipt.staleChangeIds ?? [],
      createdCommitments: proposal.createdEntities?.length ?? 0,
    };
  }
  if (proposal.status === 'accepted' || proposal.status === 'partially_accepted') {
    throw applyError('PROPOSAL_ALREADY_APPLIED', 'Proposal has already been applied with a different idempotency key.');
  }
  return null;
}

/**
 * Cross-process lock for a Proposal apply. The lock file lives next to the
 * Proposal, is acquired with O_EXCL, and stale locks are reclaimed.
 */
export async function withEventGraphApplyLock<T>(
  repo: V2Repository,
  proposalId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!/^gprop_[0-9A-HJKMNP-TV-Z]{26}$/.test(proposalId)) throw applyError('INVALID_PROPOSAL_ID', 'Invalid graph Proposal id.');
  await fs.mkdir(repo.layout.graphProposals, { recursive: true });
  const lockPath = path.join(repo.layout.graphProposals, `.${proposalId}.apply.lock`);
  let handle: fs.FileHandle | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
      break;
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 60_000) {
          await fs.unlink(lockPath);
          continue;
        }
      } catch { /* another contender released it */ }
      await new Promise((resolve) => setTimeout(resolve, Math.min(10 + attempt * 2, 100)));
    }
  }
  if (!handle) throw applyError('PROPOSAL_APPLY_BUSY', 'Timed out waiting for the graph Proposal apply lock.');
  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

function applyError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
