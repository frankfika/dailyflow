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
          manualChunks: {
            react: ['react', 'react-dom'],
            motion: ['motion'],
            markdown: ['react-markdown', 'remark-gfm'],
            lucide: ['lucide-react'],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3003',
          changeOrigin: true,
        },
      },
    },
  };
});
