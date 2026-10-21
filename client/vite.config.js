import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // In development the browser calls /api on the Vite server (same origin),
    // and Vite forwards it to Express. Same-origin means the SameSite=Strict auth
    // cookies work without any cross-site cookie configuration.
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
