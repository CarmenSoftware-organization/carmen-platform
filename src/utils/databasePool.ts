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
