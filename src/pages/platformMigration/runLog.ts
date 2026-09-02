import { useCallback, useRef, useState } from 'react';

/**
 * สมุดบันทึกการรันของหน้า platform migrations
 *
 * ทุก action บนหน้านี้ — deploy, resolve, seed, check — เขียนลงสมุดเล่มเดียวกัน แทนที่จะมี
 * ผลลัพธ์ของใครของมัน เหตุผลคืองานจริงบนหน้านี้เป็นลำดับ ไม่ใช่ครั้งเดียวจบ: deploy แล้ว seed
 * แล้ว check แล้วดูว่าอันไหนพัง toast หายไปใน 4 วินาที และคอนโซลที่ล้างตัวเองทุกครั้งที่กดรัน
 * ทำให้เทียบสองขั้นตอนติดกันไม่ได้เลย
 *
 * The whole page writes into one ledger: the real workflow here is a sequence, not one shot.
 */

export type RunKind = 'deploy' | 'resolve' | 'seed' | 'check';
export type RunStatus = 'running' | 'success' | 'failed';

export interface RunEntry {
  id: number;
  kind: RunKind;
  /** ชื่อที่แปลแล้ว ตั้งตอนเริ่มรัน — เก็บไว้ในรายการเพื่อให้สลับภาษาแล้วบรรทัดเก่าไม่เพี้ยน */
  label: string;
  /** เวลาที่เริ่ม รูป HH:MM:SS */
  time: string;
  lines: string[];
  status: RunStatus;
  /** ไม่มีสำหรับ deploy/resolve ที่ backend ไม่ได้คืน exit code ของ prisma ออกมา */
  exitCode?: number;
  durationMs?: number;
}

/** เพดานจำนวนรายการ — log ของ seed ตัวใหญ่ยาวหลักพันบรรทัด ปล่อยสะสมไม่จำกัดจะกินหน่วยความจำ */
const MAX_RUNS = 20;

const nowTime = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** แตก stdout ดิบของ prisma เป็นบรรทัด ตัด \r และบรรทัดว่างท้ายก้อนทิ้ง */
export const splitRaw = (raw?: string): string[] => {
  if (!raw) return [];
  const lines = raw.split('\n').map((l) => l.replace(/\r$/, ''));
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
};

export interface RunLog {
  runs: RunEntry[];
  startRun: (kind: RunKind, label: string) => number;
  appendLines: (id: number, lines: string[]) => void;
  finishRun: (id: number, status: Exclude<RunStatus, 'running'>, exitCode?: number) => void;
  clearRuns: () => void;
}

export function useRunLog(): RunLog {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const nextId = useRef(1);
  // เก็บนอก state เพราะใช้คำนวณ durationMs ตอนจบเท่านั้น ไม่มีผลต่อการเรนเดอร์
  const startedAt = useRef(new Map<number, number>());

  const startRun = useCallback((kind: RunKind, label: string): number => {
    const id = nextId.current++;
    startedAt.current.set(id, Date.now());
    setRuns((prev) => [
      ...prev,
      { id, kind, label, time: nowTime(), lines: [], status: 'running' as const },
    ].slice(-MAX_RUNS));
    return id;
  }, []);

  const appendLines = useCallback((id: number, lines: string[]): void => {
    if (lines.length === 0) return;
    setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, lines: [...r.lines, ...lines] } : r)));
  }, []);

  const finishRun = useCallback(
    (id: number, status: Exclude<RunStatus, 'running'>, exitCode?: number): void => {
      const started = startedAt.current.get(id);
      startedAt.current.delete(id);
      setRuns((prev) => prev.map((r) => (
        r.id === id
          ? { ...r, status, exitCode, durationMs: started ? Date.now() - started : undefined }
          : r
      )));
    },
    [],
  );

  const clearRuns = useCallback((): void => {
    setRuns([]);
    startedAt.current.clear();
  }, []);

  return { runs, startRun, appendLines, finishRun, clearRuns };
}

/**
 * แปลงรายการรันเป็นข้อความสำหรับวางในตั๋วหรือแชต
 *
 * หัวบรรทัดคงคำสถานะเป็นภาษาอังกฤษไว้เสมอ ไม่ตามภาษาของหน้า — ข้อความนี้เดินทางออกจากหน้าเว็บ
 * ไปอยู่ในที่ที่คนอ่านไม่รู้ว่าคนคัดลอกตั้งภาษาอะไรไว้ และตัว log ที่อยู่ใต้มันก็เป็นอังกฤษอยู่แล้ว
 * The status word stays English on purpose: this text leaves the page.
 */
export const formatRun = (run: RunEntry): string => {
  const meta = [
    run.durationMs !== undefined ? `${(run.durationMs / 1000).toFixed(1)}s` : null,
    run.exitCode !== undefined ? `exit ${run.exitCode}` : null,
  ].filter(Boolean).join(', ');
  const head = `[${run.time}] ${run.label} — ${run.status}${meta ? ` (${meta})` : ''}`;
  return [head, ...run.lines].join('\n');
};

/** สมุดทั้งเล่ม คั่นแต่ละรายการด้วยบรรทัดว่าง */
export const formatRuns = (runs: RunEntry[]): string => runs.map(formatRun).join('\n\n');
