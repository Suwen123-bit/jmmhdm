import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, envDir, '');
  const apiTarget = env.VITE_API_PROXY ?? env.VITE_API_URL ?? 'http://localhost:3001';
  return {
    envDir,
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: 5174,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    build: { target: 'es2022', sourcemap: false },
  };
});
