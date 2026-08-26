import { lookup } from 'node:dns/promises';
import net from 'node:net';

function blockedAddress(input: string): boolean {
  const address = input.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return blockedAddress(mapped);
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2))))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }
  if (net.isIPv6(address)) {
    return address === '::' || address === '::1' || address.startsWith('fc')
      || address.startsWith('fd') || address.startsWith('fe') || address.startsWith('ff')
      || address.startsWith('2001:db8:');
  }
  return true;
}

/** Validate the model endpoint before either the embedded adapter or ACP sees it. */
export async function assertSafeModelBaseUrl(raw: string, resolveHost = lookup): Promise<URL> {
  const url = new URL(raw);
  if (url.username || url.password) throw Object.assign(new Error('Provider URL credentials are forbidden.'), { code: 'PROVIDER_URL_UNSAFE' });
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw Object.assign(new Error('Provider URL must use HTTPS or exact loopback HTTP.'), { code: 'PROVIDER_URL_UNSAFE' });
  }
  const addresses = net.isIP(host) ? [host] : (await resolveHost(host, { all: true, verbatim: true })).map(item => item.address);
  if (!addresses.length || (!loopback && addresses.some(blockedAddress))) {
    throw Object.assign(new Error('Provider URL resolves to an internal or reserved address.'), { code: 'PROVIDER_URL_UNSAFE' });
  }
  return url;
}
