import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// เลขเวอร์ชันใน changelog ค้างอยู่ระหว่างรีลีส ทุก build จึงดูเหมือนกันหมด — SHA บอกได้ว่า
// build ที่รันอยู่มาจากโค้ดชุดไหน อ่าน env ของ CI ก่อน เพราะ Vercel clone แบบ shallow
// และไม่รับประกันว่ามี .git ให้ถาม หาไม่เจอก็คืนค่าว่าง ไม่ throw — เป็นข้อมูลประกอบ
// ไม่ใช่เหตุให้ build ล้ม
function resolveBuildSha(): string {
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

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
          useFlatConfig: true,
          lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
          dev: { logLevel: ['error'] },
        },
        terminal: true,
        overlay: !ci,
        enableBuild: true,
      }),
    ],
    envPrefix: 'REACT_APP_',
    define: {
      'import.meta.env.REACT_APP_BUILD_SHA': JSON.stringify(resolveBuildSha()),
    },
    // ต้องตรงกับ compilerOptions.paths ใน tsconfig.json — shadcn CLI เขียนไฟล์ที่ import '@/lib/utils'
    // ไฟล์เดิมทั้ง repo ยังใช้ relative path ตามเดิม alias นี้ไม่บังคับให้ใครย้าย
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
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
