import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Auth endpoints → FastAPI (port 8001)
      '/api/auth': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      // All other /api/* requests → Django (port 8000)
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
