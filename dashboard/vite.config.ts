import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Dashboard is hosted at /dashboard/ on the droplet (nginx alias).
// We use the same base for dev, preview, and build so the URL is
// consistent across environments (vite preview respects build's base,
// and mismatching dev with prod just breeds confusion).
export default defineConfig(() => ({
  base: '/dashboard/',
  plugins: [react()],
  server: {
    port: 4174,
    strictPort: true,
    proxy: {
      // Mirror the droplet topology so the live-rerun flow works in dev.
      // Ship API on :3000 (started by `pnpm dev:api`).
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
}));
