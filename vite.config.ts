import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Serve static assets from the ./public directory (default). We keep lessons/ there.
  publicDir: 'public',
  server: {
    port: 5173,
    open: true
  }
})
