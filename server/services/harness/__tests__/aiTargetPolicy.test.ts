import { describe, expect, it } from 'vitest';
import { assertSafeModelBaseUrl } from '../aiTargetPolicy';

describe('sidecar model target policy', () => {
  it.each([
    'https://169.254.169.254/latest/meta-data',
    'https://10.1.2.3/v1',
    'https://user:pass@example.com/v1',
    'http://example.com/v1',
  ])('rejects unsafe target %s', async (url) => {
    await expect(assertSafeModelBaseUrl(url, async () => [{ address: '93.184.216.34', family: 4 }] as never))
      .rejects.toMatchObject({ code: 'PROVIDER_URL_UNSAFE' });
  });

  it('rejects public hostnames that DNS-rebind to a private address', async () => {
    await expect(assertSafeModelBaseUrl('https://provider.example/v1', async () => [{ address: '192.168.1.2', family: 4 }] as never))
      .rejects.toMatchObject({ code: 'PROVIDER_URL_UNSAFE' });
  });

  it('allows explicit loopback HTTP for local model servers', async () => {
    await expect(assertSafeModelBaseUrl('http://127.0.0.1:11434/v1')).resolves.toBeInstanceOf(URL);
  });
});
