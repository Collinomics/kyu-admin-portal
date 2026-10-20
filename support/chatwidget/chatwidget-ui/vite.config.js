import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on the LAN so the mobile UI can be tested from a phone
    proxy: {
      // The widget calls /api/chat.php; the PHP file is named chat_api.php
      // and is served by `php -S localhost:8080` from the project root.
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        // stamp the real client IP into X-Forwarded-For so the audit log
        // (monitor.php client_ip()) sees the visitor, not the proxy
        xfwd: true,
        // /api/chat.php -> chat_api.php; anything else under /api/ maps
        // 1:1 (e.g. /api/feedback_api.php -> feedback_api.php)
        rewrite: (path) =>
          path.replace('/api/chat.php', '/chat_api.php').replace(/^\/api/, ''),
      },
    },
  },
})
