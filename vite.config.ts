import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: process.env.RECALL_BRIDGE_URL
      ? {
        allowedHosts: ['127.0.0.1', 'localhost'],
        cors: false,
        proxy: {
          '/api/recall-agent': {
            target: process.env.RECALL_BRIDGE_URL,
            changeOrigin: false,
            headers: {
              'x-recall-bridge-token': process.env.RECALL_BRIDGE_TOKEN ?? '',
            },
          },
          '/api/recall-harvest': {
            target: process.env.RECALL_BRIDGE_URL,
            changeOrigin: false,
            headers: {
              'x-recall-bridge-token': process.env.RECALL_BRIDGE_TOKEN ?? '',
            },
          },
        },
      }
    : undefined,
})
