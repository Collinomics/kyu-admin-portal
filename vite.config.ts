import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_MONITOR_API_URL': JSON.stringify('/api/v1/admin/ai-monitor'),
    'import.meta.env.VITE_AI_SETTINGS_API_URL': JSON.stringify('/api/v1/admin/ai-settings'),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
