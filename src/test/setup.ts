import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// The vitest jsdom environment in this repo exposes window.localStorage as a
// plain object without the Storage methods, so any component that reads
// localStorage crashes in tests. Provide an in-memory Storage implementation.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

if (typeof window.localStorage?.getItem !== 'function') {
  Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), writable: true });
  Object.defineProperty(window, 'sessionStorage', { value: new MemoryStorage(), writable: true });
}
