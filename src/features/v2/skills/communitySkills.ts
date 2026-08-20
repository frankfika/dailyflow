/**
 * Community skill marketplace (Sprint 1 Gap 10).
 *
 * MVP scope: a "Registry" model only. We:
 *   1. Fetch a JSON manifest of community skills from a public URL
 *      (default points at the planned `dailyflow-skills` GitHub repo).
 *   2. Verify SHA-256 checksums before install.
 *   3. Persist installed skills to localStorage with the raw markdown
 *      so the next launch can hot-load them.
 *
 * No payment, no ratings, no reviews — that's v3.0 territory.
 */
import type { BuiltInSkill } from '../../../utils/builtInSkills';

export interface CommunitySkill {
  id: string;
  name: string;
  author: string;
  description: string;
  tags: string[];
  source: 'github' | 'local';
  url: string;
  /** SHA-256 of the skill markdown, prefixed with `sha256:`. */
  checksum: string;
  installedVersion?: string;
}

export interface InstalledCommunitySkill {
  skill: CommunitySkill;
  markdown: string;
  installedAt: string;
}

const STORAGE_KEY = 'dailyflow.community_skills.installed';
export const COMMUNITY_SKILL_REGISTRY_URL =
  'https://raw.githubusercontent.com/dailyflow/dailyflow-skills/main/registry.json';

/**
 * Fetch the registry. Returns an empty list on network failure (with
 * a console warning) so the UI degrades gracefully.
 */
export async function listCommunitySkills(): Promise<CommunitySkill[]> {
  try {
    const res = await fetch(COMMUNITY_SKILL_REGISTRY_URL);
    if (!res.ok) {
      console.warn(`[community-skills] registry fetch returned ${res.status}`);
      return [];
    }
    const body = await res.json() as { version: number; skills: CommunitySkill[] };
    if (!Array.isArray(body?.skills)) return [];
    return body.skills;
  } catch (err) {
    console.warn('[community-skills] registry fetch failed:', err);
    return [];
  }
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface InstallResult {
  ok: boolean;
  error?: string;
  installed?: InstalledCommunitySkill;
}

/**
 * Download a community skill, verify its checksum, and persist it
 * locally. Returns `{ ok: false, error }` if any step fails.
 */
export async function installCommunitySkill(skill: CommunitySkill): Promise<InstallResult> {
  try {
    const res = await fetch(skill.url);
    if (!res.ok) {
      return { ok: false, error: `Failed to download skill (${res.status})` };
    }
    const markdown = await res.text();
    const expected = skill.checksum.replace(/^sha256:/, '').toLowerCase();
    const actual = await sha256Hex(markdown);
    if (actual !== expected) {
      return { ok: false, error: `Checksum mismatch: expected ${expected}, got ${actual}` };
    }
    const installed: InstalledCommunitySkill = {
      skill: { ...skill, installedVersion: skill.checksum },
      markdown,
      installedAt: new Date().toISOString(),
    };
    const list = listInstalledCommunitySkills();
    const filtered = list.filter((i) => i.skill.id !== skill.id);
    filtered.push(installed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return { ok: true, installed };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function uninstallCommunitySkill(id: string): void {
  const list = listInstalledCommunitySkills();
  const filtered = list.filter((i) => i.skill.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function listInstalledCommunitySkills(): InstalledCommunitySkill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InstalledCommunitySkill[];
  } catch {
    return [];
  }
}

/**
 * Convert installed community skills into the BuiltInSkill shape
 * used by the AIChat skill picker.
 */
export function installedAsBuiltInSkills(): BuiltInSkill[] {
  return listInstalledCommunitySkills().map((i) => ({
    id: `community_${i.skill.id}`,
    name: i.skill.name,
    category: 'Community',
    description: i.skill.description,
    markdown: i.markdown,
    icon: 'Sparkles',
    tags: i.skill.tags,
  }));
}
