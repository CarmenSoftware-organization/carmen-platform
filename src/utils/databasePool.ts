/**
 * ที่อยู่ของ database pool — ประกอบครั้งเดียว ใช้ร่วมกันทั้งหน้ารายการและหน้ารายตัว
 *
 * เดิม `poolDsn` / `isDerivedName` อยู่ในไฟล์ `DatabasePoolManagement.tsx` หน้าเดียว หน้ารายตัว
 * จึงกางที่อยู่กลับออกเป็นห้าช่องอีกครั้ง ทั้งที่หน้ารายการยุบมันเป็นบรรทัดเดียวไปแล้ว การเดินจาก
 * แถวในตารางมาหน้ารายตัวเลยกลายเป็นการเห็นสตริงคนละรูปสองครั้ง ย้ายมาไว้ตรงกลางเพื่อให้สองหน้า
 * ไม่มีทางไม่ตรงกัน
 */

/** รูปน้อยที่สุดที่ประกอบที่อยู่ได้ — ฟอร์มถือ `port` เป็น string, ตัวเรคคอร์ดจาก API ถือเป็น number */
export interface PoolAddressLike {
  username: string;
  host: string;
  port: number | string;
  database: string;
}

/**
 * `username` / `host` / `port` / `database` ไม่ใช่สี่ข้อเท็จจริง มันคือที่อยู่เดียวที่ถูกผ่าเก็บ
 * เป็นสี่ช่องเพราะฟอร์มต้องกรอกทีละช่อง การกางมันกลับออกมาสี่ช่องบนหน้าจอบังคับให้คนอ่าน
 * ประกอบสตริงเองในหัวทุกครั้งที่อยากรู้ว่า "นี่คือเครื่องไหน"
 *
 * ไม่ใส่ scheme (`postgresql://`) เพราะเรคคอร์ดนี้ยังไม่รู้ว่าใครต่อด้วยไดรเวอร์อะไร — สิ่งที่ระบุตัว
 * เครื่องได้จริงคือส่วนหลัง scheme และมันสั้นพอจะอยู่ในบรรทัดเดียวโดยไม่ต้องตัดกลางค่า
 */
export const poolDsn = (pool: PoolAddressLike) =>
  `${pool.username}@${pool.host}:${pool.port}/${pool.database}`;

/**
 * ชื่อของ pool ที่ไม่ได้บอกอะไรเกินกว่าที่ที่อยู่บอกไปแล้ว
 *
 * pool ที่ถูกสร้างอัตโนมัติจาก `tb_business_unit.db_connection` ได้ชื่อเป็น DSN ของตัวเอง
 * (`dev.blueledgers.com:6432/postgres`) หน้าที่แสดงทั้งชื่อและที่อยู่จึงพิมพ์สตริงเดียวกันซ้อนกัน
 * เรคคอร์ดที่ถูกตั้งชื่อโดยคน ("tenant-db-sg-01") คือเรคคอร์ดเดียวที่ชื่อมีอะไรจะพูดเพิ่ม
 *
 * เทียบแบบไม่สนตัวพิมพ์และตัดช่องว่างหัวท้าย — ไม่ normalize มากกว่านั้น เพราะชื่อที่ต่างกัน
 * แค่เครื่องหมายวรรคตอนคือชื่อที่คนตั้งเอง และควรได้แสดง
 */
export const isDerivedName = (pool: PoolAddressLike & { name: string }) => {
  const name = pool.name.trim().toLowerCase();
  return (
    name === `${pool.host}:${pool.port}/${pool.database}`.toLowerCase() ||
    name === poolDsn(pool).toLowerCase() ||
    name === `${pool.host}:${pool.port}`.toLowerCase()
  );
};

// ตัวอักษรที่ใช้ในชื่อ schema ที่สุ่มขึ้น — ตัวเล็กล้วนโดยตั้งใจ: postgres พับ identifier ที่ไม่ได้
// ครอบด้วยเครื่องหมายคำพูดเป็นตัวเล็กอยู่แล้ว ชื่อที่มีตัวใหญ่จึงหลอกตาเวลาเทียบกับค่าที่อ่านกลับ
// มาจากฐานข้อมูล
const SCHEMA_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SCHEMA_PREFIX = 'bu_';
const SCHEMA_RANDOM_LENGTH = 16;

/**
 * ชื่อ schema สุ่มสำหรับ business unit — `bu_` + 16 ตัวสุ่ม เช่น `bu_k3f9x2mq7pv1zt8w`
 *
 * ยาว 19 ตัว จึงผ่านทั้งขีดจำกัด 63 ตัวของ postgres identifier และ regex ของ
 * `validateField('db_schema')` เสมอ
 *
 * ไม่ตรวจว่าชื่อซ้ำกับ schema ที่มีอยู่จริงในฐานข้อมูล — ฝั่ง frontend มองไม่เห็นรายชื่อ schema
 * ของ pool (ไม่มี endpoint ที่ทำได้: `sqlQueryService` ต้องใช้ BU ที่ตั้ง schema ไว้แล้ว) พื้นที่สุ่ม
 * คือ 36^16 (~8×10^24) การชนกันจึงเป็นไปไม่ได้ในทางปฏิบัติ และถ้าชนจริง backend จะเป็นคนตอบ
 * error ตอน provision
 */
export const generateSchemaName = (): string => {
  // rejection sampling: ตัดค่าที่เกินทวีคูณสุดท้ายของ 36 ทิ้ง แทนการใช้ `% 36` เฉย ๆ ซึ่งจะทำให้
  // ตัวอักษรต้น ๆ ของชุดออกบ่อยกว่าตัวท้าย
  const limit = Math.floor(256 / SCHEMA_ALPHABET.length) * SCHEMA_ALPHABET.length;
  const buf = new Uint8Array(SCHEMA_RANDOM_LENGTH);
  let out = '';
  while (out.length < SCHEMA_RANDOM_LENGTH) {
    crypto.getRandomValues(buf);
    // ดัชนีธรรมดา ไม่ใช่ for-of: tsconfig ของรีโปนี้ target ต่ำกว่า es2015 การวนบน Uint8Array
    // ตรง ๆ จึงติด TS2802
    for (let i = 0; i < buf.length; i += 1) {
      const byte = buf[i];
      if (byte >= limit) continue;
      out += SCHEMA_ALPHABET[byte % SCHEMA_ALPHABET.length];
      if (out.length === SCHEMA_RANDOM_LENGTH) break;
    }
  }
  return `${SCHEMA_PREFIX}${out}`;
};
