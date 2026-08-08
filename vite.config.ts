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
      port: 3000,
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
          target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3003',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('motion') || id.includes('framer-motion')) return 'motion';
            if (id.includes('react-markdown') || id.includes('remark') || id.includes('mdast') || id.includes('micromark')) return 'markdown';
            if (id.includes('lucide-react')) return 'lucide';
            if (id.includes('@tanstack')) return 'tanstack';
            if (id.includes('react') || id.includes('scheduler')) return 'react';
            return 'vendor';
          },
        },
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      },
      chunkSizeWarningLimit: 800,
    },
  };
});
