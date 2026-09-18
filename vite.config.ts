import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  cacheDir: '.cache/vite',
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
})
