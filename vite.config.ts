import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Serve static assets from the ./public directory (default). We keep lessons/ there.
  base: "",
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
    proxy: {
      // Dev-only proxy to avoid CORS when calling Paiza.io from the browser
      // The app targets "/__paiza" in dev; this forwards to https://api.paiza.io
      '/__paiza': {
        target: 'https://api.paiza.io',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/__paiza/, ''),
      },
    },
  },
})
