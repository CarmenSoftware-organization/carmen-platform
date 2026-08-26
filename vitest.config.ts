import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // vitest ไม่ได้อ่าน vite.config.ts เมื่อมีไฟล์นี้ — alias @/ จึงต้องประกาศซ้ำ
  // ไม่งั้น test ของ component ที่ shadcn CLI สร้าง (import '@/lib/utils') จะ resolve ไม่เจอ
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/index.tsx',
        'src/react-app-env.d.ts',
        'src/vite-env.d.ts',
      ],
    },
  },
});
