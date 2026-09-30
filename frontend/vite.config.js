import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://localhost:4000';

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Long-lived vendor chunks: app deploys do not invalidate library caches.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            data: [
              '@tanstack/react-query',
              'axios',
              'zod',
              'react-hook-form',
              '@hookform/resolvers',
            ],
            charts: ['recharts'],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
      env: { TZ: 'America/Los_Angeles' },
    },
    server: {
      port: 5173,
      // Proxy API calls in development so auth cookies are same-origin.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
