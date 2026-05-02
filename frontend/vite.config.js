import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react({ jsxRuntime: 'automatic' }), tailwindcss()],
  esbuild: {
    // Use esbuild for JSX transformation (faster, no Babel parser strictness)
    jsx: 'automatic',
  },
  base: '/',
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — loaded on every page (~150 KB, always needed)
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // State management (tiny, always needed)
          'vendor-state': ['zustand'],
          // Rich text editor — only Content Studio, SEO Studio
          'vendor-tiptap': [
            '@tiptap/react', '@tiptap/starter-kit',
            '@tiptap/extension-color', '@tiptap/extension-highlight',
            '@tiptap/extension-image', '@tiptap/extension-link',
            '@tiptap/extension-placeholder', '@tiptap/extension-text-align',
            '@tiptap/extension-underline',
          ],
          // Charts — only Analytics, D2C, Dashboard
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          // Canvas editor — only AI Canvas page
          'vendor-fabric': ['fabric'],
          // Drag & drop — only Calendar, Funnel
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          // Icons — loaded on most pages but can be separate chunk
          'vendor-lucide': ['lucide-react'],
          'vendor-tabler': ['@tabler/icons-react'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/nexus/stream': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // SSE must not be buffered
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache'
            proxyRes.headers['x-accel-buffering'] = 'no'
          })
        },
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // 10min timeout — multi-shot image generation can take 2-3 minutes
        // Default is 120s which causes "Could not connect" errors
        timeout: 600000,
        proxyTimeout: 600000,
      },
    },
  },
})
