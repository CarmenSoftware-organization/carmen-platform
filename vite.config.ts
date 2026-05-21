import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import eslint from 'vite-plugin-eslint';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const ci = process.env.CI === 'true';

  return {
    plugins: [
      react(),
      eslint({
        failOnError: ci,
        failOnWarning: ci,
        cache: false,
      }),
    ],
    envPrefix: 'REACT_APP_',
    server: {
      port: 3001,
      proxy: {
        '/api': {
          target: env.REACT_APP_API_BASE_URL || 'https://43.209.126.252',
          changeOrigin: true,
          secure: false,
        },
        '/api-system': {
          target: env.REACT_APP_API_BASE_URL || 'https://43.209.126.252',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'build',
    },
  };
});
