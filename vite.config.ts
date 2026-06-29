import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const ci = process.env.CI === 'true';
  const port = Number(env.REACT_APP_PORT) || 3304;
  const apiTarget = env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

  return {
    plugins: [
      react(),
      checker({
        typescript: true,
        eslint: {
          useFlatConfig: false,
          lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
          dev: { logLevel: ['error'] },
        },
        terminal: true,
        overlay: !ci,
        enableBuild: true,
      }),
    ],
    envPrefix: 'REACT_APP_',
    server: {
      port,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/api-system': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port,
    },
    build: {
      outDir: 'build',
    },
  };
});
