import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // In development the browser calls /api on the Vite server (same origin),
    // and Vite forwards it to Express. Same-origin means the auth cookie in
    // Epic 1 works with SameSite=Strict/Lax and no cross-site cookie tricks.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:5000',
        changeOrigin: true,
      },
      // Socket.IO (real-time seat updates) uses WebSockets, which the proxy must upgrade.
      '/socket.io': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // Vitest reads this block: run component tests in a simulated browser (jsdom).
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
})
