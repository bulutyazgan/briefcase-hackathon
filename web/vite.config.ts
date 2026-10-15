import stylex from '@stylexjs/unplugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    stylex.vite({
      dev: mode === 'development',
      useCSSLayers: { before: ['stylex'] },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': 'http://localhost:8787', '/health': 'http://localhost:8787' },
  },
}))
