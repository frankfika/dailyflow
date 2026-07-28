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
          v2: path.resolve(__dirname, 'src/features/v2/v2-standalone.html'),
        },
      },
      chunkSizeWarningLimit: 800,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3003',
          changeOrigin: true,
        },
      },
    },
  };
});
