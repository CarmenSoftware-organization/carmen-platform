/** `GET /version` — the running backend build. Served at the API root, not under `/api` or `/api-system`. */
export interface BackendVersion {
  version: string;
  build?: string;
  commit?: string;
  date?: string;
}

const apiBaseUrl = String(import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');

/**
 * หนึ่ง promise ต่อหนึ่งเซสชัน — `Layout` ถูก mount ใหม่ทุกครั้งที่เปลี่ยนหน้า ถ้าไม่จำไว้
 * เวอร์ชันที่เปลี่ยนไม่ได้ระหว่างเซสชันจะถูกถามซ้ำทุกการนำทาง
 * The backend build cannot change mid-session, so one promise is cached for every caller.
 */
let inflight: Promise<BackendVersion | null> | null = null;

const versionService = {
  /** คืน `null` เมื่อดึงไม่ได้ — เวอร์ชันหลังบ้านเป็นข้อมูลประกอบ ไม่ใช่สิ่งที่ควรทำให้ UI พัง */
  get: (): Promise<BackendVersion | null> => {
    // ใช้ `fetch` ตรง ๆ ไม่ใช่ instance `api` — endpoint นี้สาธารณะ และถูกเรียกจากหน้าที่ยังไม่มี
    // session (login, landing) ซึ่ง request interceptor ของ `api` จะ redirect ไป /login ทันที
    // ที่ไม่มี token: บนหน้า login เองนั่นคือ reload วนไม่รู้จบ
    inflight ??= fetch(`${apiBaseUrl}/version`)
      .then((r) => (r.ok ? (r.json() as Promise<BackendVersion | null>) : null))
      .then((v) => (v && typeof v.version === 'string' ? v : null))
      .catch(() => null);
    return inflight;
  },
};

export default versionService;
