import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const indexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const entryMatch = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/);

if (!entryMatch) {
  throw new Error('Production build verification failed: JavaScript entry was not found');
}

const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: 'http://127.0.0.1/',
});

const browserGlobals = {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  localStorage: dom.window.localStorage,
  CustomEvent: dom.window.CustomEvent,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
  self: dom.window,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: clearTimeout,
  // Keep data requests pending so this check verifies the startup/loading
  // shell without depending on a running DailyFlow API or fixture schema.
  fetch: () => new Promise(() => {}),
};

for (const [name, value] of Object.entries(browserGlobals)) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

dom.window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});

const entryUrl = new URL(`../dist${entryMatch[1]}`, import.meta.url);
await import(pathToFileURL(entryUrl.pathname).href);
await new Promise((resolve) => setTimeout(resolve, 100));

const root = dom.window.document.getElementById('root');
if (!root?.firstElementChild) {
  throw new Error('Production build verification failed: React did not mount');
}

console.log('Production build verification passed: React mounted successfully.');
