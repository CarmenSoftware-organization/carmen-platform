/**
 * เลือกสีของบรรทัด log จากสิ่งที่มันรายงาน
 * Colour a streamed log line by what it reports.
 *
 * ใช้ร่วมกันสองคอนโซล: DeployConsole (tenant migration) และ RunConsole (platform seed)
 * ยกออกมาจาก DeployConsole ตอนเพิ่มคอนโซลที่สอง — ทางเลือกอีกทางคือสำเนาฟังก์ชันเดียวกัน
 * ไว้สองที่แล้วรอให้มันเพี้ยนจากกัน
 * Lifted out of DeployConsole when the second console arrived.
 * @param line - บรรทัดดิบ / One raw log line
 * @returns คลาส Tailwind ของสี / A Tailwind colour class
 */
export function lineTone(line: string): string {
  if (/fail|error|✕/i.test(line)) return 'text-[hsl(0_78%_66%)]';
  if (/up to date|applied|done|✓|ok\b/i.test(line)) return 'text-[hsl(142_60%_60%)]';
  return 'text-slate-400';
}
