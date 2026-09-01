import api from './api';
import { refreshAccessToken } from './tokenRefresh';
import type { PlatformSeedOp, SeedRunEvent } from '../types';

// คอนโซล seed และ drift check ของฐานข้อมูลแพลตฟอร์ม
// ด่านฝั่ง backend เป็นตัวเดียวกับ platform migrations: super-admin (หรือ deploy token)
// บวกสวิตช์ `platform_migration.api_enabled` ใน tb_platform_config — สวิตช์เดียวคุมทั้งคอนโซล
const platformSeedService = {
  getCatalog: async (): Promise<PlatformSeedOp[]> => {
    const res = await api.get('/api-system/platform/seeds/catalog');
    return res.data.data ?? res.data;
  },

  /**
   * รัน op หนึ่งตัวแล้วอ่าน NDJSON ทีละบรรทัด
   *
   * ใช้ fetch ไม่ใช่ axios เพราะ axios อ่าน ReadableStream ไม่ได้ ผลคือต้องแนบ bearer และ
   * x-app-id เอง และ **ไม่มี retry 401 อัตโนมัติ** เพราะ response interceptor ของ axios ไม่ทำงาน
   * ที่นี่ จึงรีเฟรช token แบบ best-effort ก่อนเริ่ม — op บางตัวรันนานเกินอายุ token ได้
   * `refreshAccessToken()` โยนเมื่อไม่มี refresh token ซึ่งต้องไม่บล็อกสตรีมที่ token ปัจจุบันยังใช้ได้
   * ตัวที่ตายจริงจะกลับมาเป็น 401 ด้านล่างเอง
   *
   * ปิดหน้าจอระหว่างรัน = โปรเซสฝั่ง server ยังวิ่งจนจบ แต่ผู้ใช้จะไม่เห็น log ที่เหลือ
   * (พฤติกรรมเดียวกับ tenant migration — ไม่มีที่เก็บสถานะ job ในระบบนี้)
   */
  runStream: async (
    opId: string,
    onEvent: (e: SeedRunEvent) => void,
  ): Promise<{ success: boolean; exit_code: number }> => {
    await refreshAccessToken().catch(() => {});
    const base = api.defaults.baseURL ?? '';
    const res = await fetch(
      `${base}/api-system/platform/seeds/${encodeURIComponent(opId)}/run/stream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
          'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
        },
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Run failed (${res.status})`);
    }
    if (!res.body) throw new Error('Run stream: response body is null');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: { success: boolean; exit_code: number } | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as SeedRunEvent;
      onEvent(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') result = { success: event.success, exit_code: event.exit_code };
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          handleLine(line);
        }
      }
      if (buffer.trim()) handleLine(buffer); // เก็บบรรทัดสุดท้ายที่ไม่มี \n ปิดท้าย
    } finally {
      reader.cancel().catch(() => {});
    }

    if (!result) throw new Error('Run stream ended without a result');
    return result;
  },
};

export default platformSeedService;
