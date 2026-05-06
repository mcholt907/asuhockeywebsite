import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  build: {
    // Keep output at build/ so server.js (lines 277, 286, 292, 296) and
    // scripts/prerender.js (line 15) keep working unchanged.
    outDir: 'build',
    sourcemap: true,
  },
});
