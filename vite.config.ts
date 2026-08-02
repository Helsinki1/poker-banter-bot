/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Sail Research sends no Access-Control-Allow-Origin, so a direct
      // browser fetch is blocked by CORS. Vite proxies it server-side in dev,
      // where CORS does not apply. OpenAI needs no proxy — it allows
      // browser origins.
      '/sail': {
        target: 'https://api.sailresearch.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sail/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
