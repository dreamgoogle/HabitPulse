import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Firebase ko alag chunk mein rakho — app shell pehle paint hoga
          firebase: [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/functions',
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
