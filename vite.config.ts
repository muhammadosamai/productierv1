import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.VITE_API_PORT || '3001'
  const backendTarget = env.VITE_API_PROXY_TARGET || `http://localhost:${backendPort}`
  const uploadsProxyPrefix = env.VITE_UPLOADS_PROXY_PREFIX || '/uploads'

  return {
    plugins: [
      vue(),
      vueDevTools(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@/lib/apiClient': fileURLToPath(new URL('./src/lib/apiFacadeClient.ts', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        [uploadsProxyPrefix]: {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (
                id.includes('/node_modules/vue/')
                || id.includes('/node_modules/@vue/')
                || id.includes('/node_modules/pinia/')
                || id.includes('/node_modules/vue-router/')
                || id.includes('/node_modules/@vueuse/')
              ) {
                return 'framework'
              }
              if (id.includes('/node_modules/@tiptap/') || id.includes('/node_modules/prosemirror-')) return 'editor'
              if (id.includes('/node_modules/chart.js/') || id.includes('/node_modules/vue-chartjs/')) return 'charts'
              if (id.includes('/node_modules/reka-ui/') || id.includes('/node_modules/@internationalized/date/')) return 'ui-kit'
              if (id.includes('/node_modules/lucide-vue-next/')) return 'icons'
              if (id.includes('/node_modules/vuedraggable/') || id.includes('/node_modules/sortablejs/')) return 'drag-drop'
              if (id.includes('/node_modules/markdown-it/')) return 'markdown'
              return 'vendor'
            }

            if (id.includes('/src/views/HomeDashboardView.vue') || id.includes('/src/views/home/')) {
              return 'home'
            }
            if (id.includes('/src/views/MetricsView.vue') || id.includes('/src/components/metrics/')) {
              return 'metrics'
            }
            if (id.includes('/src/views/TasksListView.vue') || id.includes('/src/components/delivery/TaskDetailPanel.vue')) {
              return 'tasks'
            }
            return undefined
          },
        },
      },
    },
  }
})
