import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {readFileSync} from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // The Tauri shell is pinned to this URL. Vite's default behaviour is to
      // silently move to the next free port, which leaves the shell connected
      // to an unrelated service and presents as a blank window.
      port: 47831,
      strictPort: true,
      // Utility scripts at the project root (e.g. _demo-record.mjs,
      // webbridge-*.mjs) are tooling, not source — but Vite still
      // watches them and triggers a full page reload whenever they
      // change. Ignoring them keeps the dev session stable while
      // those scripts churn.
      watch: {
        ignored: [
          '**/_demo-record.mjs',
          '**/webbridge-*.mjs',
          '**/scripts/_demo-record.mjs',
          '**/scripts/debug-mindmap.mjs',
        ],
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:47832',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Let Rollup preserve module evaluation order. The previous
          // package-name splitter produced `vendor -> react -> vendor`, a
          // circular chunk graph that Chrome tolerated but WKWebView could
          // evaluate in the wrong order, leaving the packaged app blank
          // before React mounted.
        },
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      },
      chunkSizeWarningLimit: 1600,
    },
  };
});
