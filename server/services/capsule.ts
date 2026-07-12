import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { Capsule, CapsuleInput, CapsuleRevealInput } from '../types/capsule.js';

const CAPSULES_FILE = path.join(os.homedir(), '.dailyflow', 'capsules.json');

async function ensureFile(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CAPSULES_FILE), { recursive: true });
    await fs.access(CAPSULES_FILE);
  } catch {
    await fs.writeFile(CAPSULES_FILE, JSON.stringify([]));
  }
}

async function readCapsules(): Promise<Capsule[]> {
  await ensureFile();
  try {
    const raw = await fs.readFile(CAPSULES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCapsules(capsules: Capsule[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(CAPSULES_FILE, JSON.stringify(capsules, null, 2));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function listCapsules(): Promise<Capsule[]> {
  const capsules = await readCapsules();
  return capsules.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getCapsule(id: string): Promise<Capsule | undefined> {
  const capsules = await readCapsules();
  return capsules.find(c => c.id === id);
}

export async function createCapsule(input: CapsuleInput): Promise<Capsule> {
  const capsules = await readCapsules();
  const now = new Date().toISOString();
  const contentHash = hashContent(input.content);

  const capsule: Capsule = {
    id: generateId(),
    title: input.title,
    content: input.content,
    type: input.type,
    status: 'sealed',
    createdAt: now,
    unlockAt: input.unlockAt,
    isPublic: input.isPublic ?? false,
    isEncrypted: input.isEncrypted ?? false,
    tags: input.tags ?? [],
    linkedTaskId: input.linkedTaskId,
    linkedNoteId: input.linkedNoteId,
    proof: {
      provider: 'local',
      contentHash,
      gatewayUrl: `dailyflow://capsule/${generateId()}`,
    },
  };

  capsules.push(capsule);
  await writeCapsules(capsules);
  return capsule;
}

export async function revealCapsule(id: string, input: CapsuleRevealInput): Promise<Capsule | undefined> {
  const capsules = await readCapsules();
  const idx = capsules.findIndex(c => c.id === id);
  if (idx === -1) return undefined;

  const capsule = capsules[idx];
  const now = new Date().toISOString();

  capsule.status = input.status;
  capsule.revealedAt = now;

  if (input.reflection !== undefined) {
    capsule.reflection = input.reflection;
  }

  if (input.status === 'extended' && input.newUnlockAt) {
    capsule.unlockAt = input.newUnlockAt;
    capsule.status = 'sealed';
    capsule.revealedAt = undefined;
  }

  await writeCapsules(capsules);
  return capsule;
}

export async function deleteCapsule(id: string): Promise<boolean> {
  const capsules = await readCapsules();
  const next = capsules.filter(c => c.id !== id);
  if (next.length === capsules.length) return false;
  await writeCapsules(next);
  return true;
}

export async function getDueCapsules(now: Date = new Date()): Promise<Capsule[]> {
  const capsules = await readCapsules();
  return capsules.filter(c => c.status === 'sealed' && new Date(c.unlockAt) <= now);
}

export async function sealToArweave(capsule: Capsule): Promise<Capsule> {
  // Placeholder: real implementation would upload to Arweave and return txId.
  const txId = `local-${capsule.id}`;
  capsule.proof = {
    ...capsule.proof,
    provider: 'arweave',
    txId,
    gatewayUrl: `https://arweave.net/${txId}`,
  };
  const capsules = await readCapsules();
  const idx = capsules.findIndex(c => c.id === capsule.id);
  if (idx !== -1) {
    capsules[idx] = capsule;
    await writeCapsules(capsules);
  }
  return capsule;
}

export async function sealToEvm(
  capsule: Capsule,
  proof?: {
    txId?: string;
    chainId?: number;
    contractAddress?: string;
    onChainId?: number;
    contentHash?: string;
  }
): Promise<Capsule> {
  if (proof?.txId && proof?.chainId && proof?.contractAddress) {
    capsule.proof = {
      ...capsule.proof,
      provider: 'evm',
      txId: proof.txId,
      chainId: proof.chainId,
      contractAddress: proof.contractAddress,
      onChainId: proof.onChainId,
      contentHash: proof.contentHash ?? capsule.proof?.contentHash,
      gatewayUrl: getExplorerUrl(proof.chainId, proof.txId),
    };
  } else {
    capsule.proof = {
      ...capsule.proof,
      provider: 'evm',
      txId: `evm-${capsule.id}`,
      chainId: 8453,
      contractAddress: '0x0000000000000000000000000000000000000000',
      gatewayUrl: `https://basescan.org/tx/evm-${capsule.id}`,
    };
  }
  const capsules = await readCapsules();
  const idx = capsules.findIndex(c => c.id === capsule.id);
  if (idx !== -1) {
    capsules[idx] = capsule;
    await writeCapsules(capsules);
  }
  return capsule;
}

function getExplorerUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    84532: 'https://sepolia.basescan.org',
    11155420: 'https://sepolia-optimism.etherscan.io',
    421614: 'https://sepolia.arbiscan.io',
    11155111: 'https://sepolia.etherscan.io',
    31337: '',
  };
  const base = explorers[chainId] || '';
  return base ? `${base}/tx/${txHash}` : '';
}
