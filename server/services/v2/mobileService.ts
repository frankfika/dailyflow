/**
 * Mobile quick capture API (Phase 9 — first slice).
 *
 * The mobile app needs a tiny, fast, low-bandwidth surface to:
 *   - capture a quick note
 *   - list recent inbox items
 *   - check what was processed while the device was offline
 *
 * The endpoints are designed for an authenticated mobile client. The
 * desktop server issues a session token at Settings → Mobile Pair. The
 * token is opaque to the API layer; we just trust it.
 */
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { V2Repository } from '../../repositories/v2/repository.js';
import { capture, CaptureInputSchema, type CaptureInput } from './captureService.js';

const TOKEN_FILE = 'mobile-tokens.json';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const MobileTokenSchema = z.object({
  id: z.string(),
  token: z.string(),
  deviceLabel: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  revoked: z.boolean().default(false),
});
export type MobileToken = z.infer<typeof MobileTokenSchema>;

async function loadTokens(workspaceRoot: string): Promise<MobileToken[]> {
  try {
    const text = await fs.readFile(path.join(workspaceRoot, '.dailyflow', TOKEN_FILE), 'utf8');
    return JSON.parse(text) as MobileToken[];
  } catch {
    return [];
  }
}

async function saveTokens(workspaceRoot: string, tokens: MobileToken[]): Promise<void> {
  await fs.mkdir(path.join(workspaceRoot, '.dailyflow'), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, '.dailyflow', TOKEN_FILE),
    JSON.stringify(tokens, null, 2),
    'utf8'
  );
}

export async function issueMobileToken(
  workspaceRoot: string,
  deviceLabel: string
): Promise<MobileToken> {
  const id = 'mtk_' + crypto.randomBytes(6).toString('hex');
  const token = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const t: MobileToken = {
    id,
    token,
    deviceLabel,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    revoked: false,
  };
  const all = await loadTokens(workspaceRoot);
  all.push(t);
  await saveTokens(workspaceRoot, all);
  return t;
}

export async function revokeMobileToken(workspaceRoot: string, id: string): Promise<boolean> {
  const all = await loadTokens(workspaceRoot);
  const t = all.find(x => x.id === id);
  if (!t) return false;
  t.revoked = true;
  await saveTokens(workspaceRoot, all);
  return true;
}

export async function listMobileTokens(workspaceRoot: string): Promise<MobileToken[]> {
  return loadTokens(workspaceRoot);
}

export async function authenticateMobileToken(
  workspaceRoot: string,
  token: string
): Promise<MobileToken | null> {
  const all = await loadTokens(workspaceRoot);
  const t = all.find(x => x.token === token);
  if (!t) return null;
  if (t.revoked) return null;
  if (new Date(t.expiresAt) < new Date()) return null;
  return t;
}

export const MobileCaptureInputSchema = CaptureInputSchema.extend({
  /** Mobile adds geo + device metadata if available. */
  device: z
    .object({
      label: z.string().optional(),
      os: z.string().optional(),
      appVersion: z.string().optional(),
    })
    .optional(),
});

export async function mobileCapture(
  repo: V2Repository,
  workspaceId: string,
  input: CaptureInput
) {
  return capture(repo, { ...input, workspaceId });
}
