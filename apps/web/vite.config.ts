import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // O .env é único e mora na raiz do monorepo.
  envDir: resolve(import.meta.dirname, '../..'),
  server: { port: 5173 },
  define: {
    __MODE__: JSON.stringify(loadEnv(mode, resolve(import.meta.dirname, '../..'), '').NODE_ENV),
  },
}));
