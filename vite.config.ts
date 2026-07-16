import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');

  // loadEnv merges prefixed process.env vars, so CI (which sets them directly)
  // satisfies this without an .env file on disk.
  const required = ['REACT_APP_API_BASE_URL', 'REACT_APP_API_APP_ID'] as const;
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(
      `[env] Missing ${missing.join(', ')} for mode "${mode}".\n` +
      `Expected in .env.${mode} (or the process environment).\n` +
      `Modes: localhost | dev | uat | prod — a bare \`vite\` won't pick one up.`
    );
  }

  const ci = process.env.CI === 'true';
  const port = Number(env.REACT_APP_PORT) || 3304;
  const apiTarget = env.REACT_APP_API_BASE_URL;

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
