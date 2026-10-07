const apiBaseUrl = String(import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');

/**
 * หน้า login ของ Platform ควรแสดงปุ่ม Google ไหม — ถาม gateway (สวิตช์ `google_sign_in.platform`
 * ใน platform config + การตั้งค่า Google ของ gateway)
 *
 * ใช้ `fetch` ตรง ๆ ไม่ใช่ instance `api` เพราะ endpoint นี้สาธารณะและถูกเรียกก่อนมี session —
 * ไม่ต้องการ interceptor เรื่อง token/refresh ทุกความล้มเหลว (เครือข่าย, 404 ตอน backend ยังไม่ deploy,
 * body ผิดรูป) = `false` ปุ่มซ่อน ไม่ใช่ error บนหน้า
 */
export async function fetchGoogleSignInEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/google/status?app=platform`);
    if (!res.ok) return false;
    const body = (await res.json()) as { enabled?: unknown } | null;
    return body?.enabled === true;
  } catch {
    return false;
  }
}
