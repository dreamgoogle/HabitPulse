import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  // Admin app parent folder ki .env.local padhta hai — ek hi Firebase project
  envDir: resolve(here, '..'),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
