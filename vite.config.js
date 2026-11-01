import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In local dev, the API runs on port 3001 (server/dev-server.js) and Vite
// forwards /api/* to it. On Vercel, /api/* is served by serverless functions.
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 }, // session replay adds weight
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
