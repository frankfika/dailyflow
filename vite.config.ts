import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {readFileSync} from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Manually load .env for VITE_GITHUB_TOKEN
function loadEnvFile() {
  try {
    const envContent = readFileSync('./.env', 'utf-8');
    const envObj: Record<string, string> = {};
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        envObj[key.trim()] = valueParts.join('=').trim();
      }
    });
    return envObj;
  } catch {
    return {};
  }
}
const envFile = loadEnvFile();

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      'import.meta.env.VITE_GITHUB_TOKEN': JSON.stringify(envFile.VITE_GITHUB_TOKEN || ''),
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
            if (id.includes('wagmi') || id.includes('@wagmi') || id.includes('viem') || id.includes('@coinbase') || id.includes('@safe-global')) return 'chain';
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
          target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3003',
          changeOrigin: true,
        },
      },
    },
  };
});
