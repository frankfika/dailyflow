/**
 * Community skills (Sprint 1 Gap 10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMUNITY_SKILL_REGISTRY_URL,
  installCommunitySkill,
  listCommunitySkills,
  listInstalledCommunitySkills,
  uninstallCommunitySkill,
  type CommunitySkill,
} from './communitySkills';

const STORAGE_KEY = 'dailyflow.community_skills.installed';

const SAMPLE: CommunitySkill = {
  id: 'okr-alignment',
  name: 'OKR 对齐助手',
  author: 'community',
  description: '帮你把团队 OKR 对齐到个人任务',
  tags: ['okr', 'planning'],
  source: 'github',
  url: 'https://example.com/skills/okr-alignment.md',
  checksum: 'PLACEHOLDER_CHECKSUM',
};

const SAMPLE_MARKDOWN = `---
name: OKR 对齐助手
description: ...
---
# OKR 对齐助手
`;

async function realChecksum(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('listCommunitySkills', () => {
  it('returns parsed skills on success', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, skills: [SAMPLE] }),
    });
    vi.stubGlobal('fetch', fakeFetch);
    const list = await listCommunitySkills();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('okr-alignment');
    expect(fakeFetch).toHaveBeenCalledWith(COMMUNITY_SKILL_REGISTRY_URL);
  });

  it('returns empty list on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const list = await listCommunitySkills();
    expect(list).toEqual([]);
  });

  it('returns empty list on non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const list = await listCommunitySkills();
    expect(list).toEqual([]);
  });

  it('returns empty list when body lacks skills array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, skills: 'oops' }),
    }));
    const list = await listCommunitySkills();
    expect(list).toEqual([]);
  });
});

describe('installCommunitySkill', () => {
  it('installs + persists when checksum matches', async () => {
    const checksum = await realChecksum(SAMPLE_MARKDOWN);
    const skill: CommunitySkill = { ...SAMPLE, checksum: `sha256:${checksum}` };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_MARKDOWN,
    }));
    const result = await installCommunitySkill(skill);
    expect(result.ok).toBe(true);
    expect(result.installed?.skill.id).toBe('okr-alignment');
    const installed = listInstalledCommunitySkills();
    expect(installed).toHaveLength(1);
  });

  it('rejects on checksum mismatch', async () => {
    const skill: CommunitySkill = { ...SAMPLE, checksum: 'sha256:0000000000000000' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_MARKDOWN,
    }));
    const result = await installCommunitySkill(skill);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Checksum mismatch');
    expect(listInstalledCommunitySkills()).toHaveLength(0);
  });

  it('rejects when download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await installCommunitySkill(SAMPLE);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });
});

describe('uninstallCommunitySkill', () => {
  it('removes from storage', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { skill: SAMPLE, markdown: 'm', installedAt: new Date().toISOString() },
    ]));
    uninstallCommunitySkill('okr-alignment');
    expect(listInstalledCommunitySkills()).toHaveLength(0);
  });

  it('is a no-op for unknown id', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    expect(() => uninstallCommunitySkill('nope')).not.toThrow();
  });
});
