import { describe, it, expect } from 'vitest';
import { isValidGitRemoteUrl } from '../git.js';

describe('isValidGitRemoteUrl', () => {
  describe('accepts legitimate URLs', () => {
    it('accepts github https url', () => {
      expect(isValidGitRemoteUrl('https://github.com/frankfika/dailyflow.git')).toBe(true);
    });

    it('accepts http url', () => {
      expect(isValidGitRemoteUrl('http://git.internal.example.com/team/repo.git')).toBe(true);
    });

    it('accepts ssh url', () => {
      expect(isValidGitRemoteUrl('ssh://git@github.com/frankfika/dailyflow.git')).toBe(true);
    });

    it('accepts git@ scp-style url', () => {
      expect(isValidGitRemoteUrl('git@github.com:frankfika/dailyflow.git')).toBe(true);
    });
  });

  describe('rejects file:// and local-path schemes (zip-slip / arbitrary-read risk)', () => {
    it('rejects file:// url', () => {
      expect(isValidGitRemoteUrl('file:///etc/passwd')).toBe(false);
    });

    it('rejects file:// pointing to a directory', () => {
      expect(isValidGitRemoteUrl('file:///tmp/evil')).toBe(false);
    });
  });

  describe('rejects ext:: transport hijacking', () => {
    // Git's `ext::` transport can be invoked via a remote URL and will execute
    // an arbitrary command when the remote is interacted with.
    it('rejects ext:: payload', () => {
      expect(isValidGitRemoteUrl('ext::sh -c touch% /tmp/pwned')).toBe(false);
    });
  });

  describe('rejects malformed input', () => {
    it('rejects credentials embedded in remote URLs', () => {
      expect(isValidGitRemoteUrl('https://ghp_abc123@github.com/frankfika/dailyflow.git')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidGitRemoteUrl('')).toBe(false);
    });

    it('rejects non-string', () => {
      // vitest's expect() accepts any, so the runtime is the only line of
      // defence here. The function itself must still reject these safely.
      expect(isValidGitRemoteUrl(null as unknown as string)).toBe(false);
      expect(isValidGitRemoteUrl(undefined as unknown as string)).toBe(false);
      expect(isValidGitRemoteUrl(42 as unknown as string)).toBe(false);
    });

    it('rejects excessively long string', () => {
      expect(isValidGitRemoteUrl('https://github.com/' + 'a'.repeat(3000) + '.git')).toBe(false);
    });

    it('rejects string with whitespace', () => {
      expect(isValidGitRemoteUrl('https://github.com/foo bar/baz.git')).toBe(false);
    });

    it('rejects arbitrary unrecognised scheme', () => {
      expect(isValidGitRemoteUrl('javascript:alert(1)')).toBe(false);
      expect(isValidGitRemoteUrl('data:text/plain,hello')).toBe(false);
      expect(isValidGitRemoteUrl('ftp://example.com/repo.git')).toBe(false);
    });

    it('rejects git:// scheme (deprecated but still parsed by git)', () => {
      // git:// is the legacy unauthenticated protocol; some git transports
      // can still be tricked by it. We require the safe subset only.
      expect(isValidGitRemoteUrl('git://github.com/frankfika/dailyflow.git')).toBe(false);
    });

    it('rejects scp-style url without .git suffix', () => {
      expect(isValidGitRemoteUrl('git@github.com:frankfika/dailyflow')).toBe(false);
    });
  });
});
