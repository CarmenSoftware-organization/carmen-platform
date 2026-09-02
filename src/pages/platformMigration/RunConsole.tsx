import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Copy, Loader2, Terminal, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { devLog } from '../../utils/errorParser';
import { lineTone } from '../../utils/logLineTone';
import { useI18n } from '../../hooks/useI18n';
import { formatRun, formatRuns } from './runLog';
import type { RunEntry } from './runLog';

interface RunConsoleProps {
  /** ทุก action ของหน้าเรียงตามเวลา — ว่างเมื่อยังไม่เคยกดอะไรในรอบนี้ คอมโพเนนต์จะไม่เรนเดอร์เลย */
  runs: RunEntry[];
  /** มี action ใด ๆ กำลังวิ่ง — ใช้ปิดปุ่มล้าง ไม่ให้ล้างสมุดทิ้งกลางคันระหว่างมี log ไหลอยู่ */
  running: boolean;
  onClear: () => void;
}

/**
 * คอนโซลเดียวของหน้า platform migrations
 *
 * เขียนแยกจาก DeployConsole ของหน้า tenant migration โดยเจตนา ตัวนั้นรับ prop เป็น BatchProgress
 * ซึ่งเป็น type ของหน้านั้น และเรียกคีย์ i18n ของหน้านั้นตรง ๆ สิ่งที่ใช้ร่วมกันได้จริงคือ
 * lineTone() ซึ่งย้ายไป utils แล้ว
 *
 * ไม่มีแถบความคืบหน้า เพราะสคริปต์เหล่านี้ไม่รายงานจำนวนงานทั้งหมดออกมา การเดาเปอร์เซ็นต์
 * จะเป็นตัวเลขที่แต่งขึ้น
 *
 * คอนโซลปักท้ายจอตลอด นับจากรันแรกของรอบ (ใช้ระยะเยื้อง sidebar ชุดเดียวกับ .unsaved-bar)
 * เพราะปุ่มที่กดกระจายอยู่ทั้งหน้า ตั้งแต่ Deploy บนสุดจนถึง check ตัวท้าย — ถ้าคอนโซลลอยอยู่
 * ท้ายเนื้อหา ผู้ใช้ต้องเลื่อนไปมาระหว่างปุ่มกับผลทุกครั้ง ปักไว้แล้วกดที่ไหนก็เห็นผลที่เดิม
 * ยุบทุกรายการแล้วเหลือแค่แถบหัวสูง ~57px ผู้ใช้เลือกได้เองว่าจะให้มันกินที่แค่ไหน
 *
 * ตัวเว้นที่ความสูงเท่ากันถูกทิ้งไว้ในสายการไหลของหน้า เพื่อไม่ให้แผงบังเนื้อหาท้ายหน้า
 */
export function RunConsole({ runs, running, onClear }: RunConsoleProps) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<number | null>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const latest = runs.length > 0 ? runs[runs.length - 1] : null;
  const latestId = latest?.id ?? null;

  // รันใหม่กางเอง — ของที่เพิ่งกดคือของที่กำลังอยากดู ส่วนการยุบ/กางเองของผู้ใช้อยู่ได้จนกว่าจะรันตัวถัดไป
  useEffect(() => {
    if (latestId !== null) setOpenId(latestId);
  }, [latestId]);

  // ไล่ท้าย log ตามบรรทัดที่สตรีมเข้ามา — เลื่อนสองชั้น: ตัว log ของรายการที่วิ่งอยู่ และรายการทั้งหมด
  // ที่ต้องเลื่อนลงมาให้เห็นบล็อกล่าสุดด้วย
  const latestLineCount = latest?.lines.length ?? 0;
  useEffect(() => {
    if (openId !== latestId) return;
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [latestLineCount, openId, latestId]);

  // วัดความสูงจริงของแผง แล้วจองที่ว่างไว้เท่ากัน — ค่าคงที่เดาไว้จะพลาด เพราะความสูงเปลี่ยนทุกครั้ง
  // ที่มีรายการเพิ่มหรือมีคนกางยุบ
  const hasRuns = runs.length > 0;
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setDockHeight(el.offsetHeight));
    ro.observe(el);
    setDockHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [hasRuns]);

  if (runs.length === 0) return null;

  /**
   * คัดลอก log — การกระทำถัดไปจริงของหน้านี้ ผลของ check ที่ล้มเหลวจบลงในตั๋วหรือแชตเสมอ
   * คลิปบอร์ดถูกปฏิเสธได้ทั้งจากสิทธิ์และจากบริบทที่ไม่ใช่ secure context จึงต้องบอกเมื่อพลาด
   * ไม่ใช่เงียบแล้วปล่อยให้ผู้ใช้เชื่อว่าคัดลอกได้แล้ว
   */
  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('pages.platformMigration.consoleCopied'));
    } catch (err) {
      toast.error(t('pages.platformMigration.consoleCopyFailed'));
      devLog('copyRunLog', err);
    }
  };

  const statusIcon = (run: RunEntry) => {
    if (run.status === 'running') return <Loader2 className="text-warning size-3.5 shrink-0 animate-spin" />;
    if (run.status === 'success') return <CheckCircle2 className="text-success size-3.5 shrink-0" />;
    return <XCircle className="text-destructive size-3.5 shrink-0" />;
  };

  return (
    <>
      <div aria-hidden style={{ height: dockHeight }} />
      <div
        ref={panelRef}
        className="bg-card fixed inset-x-0 bottom-0 z-40 overflow-hidden border-t shadow-lg md:left-16 lg:left-60"
      >
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <Terminal className="text-muted-foreground size-4 shrink-0" />
          <h2 className="text-sm font-semibold">{t('pages.platformMigration.consoleTitle')}</h2>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {t('pages.platformMigration.consoleRuns', { count: runs.length })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => void copy(formatRuns(runs))}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('pages.platformMigration.consoleCopyAll')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={onClear}
            disabled={running}
          >
            {t('pages.platformMigration.consoleClear')}
          </Button>
        </div>

        {/* ปุ่ม debug sheet เป็น fixed right-4 bottom-4 z-50 จึงลอยทับมุมขวาล่างของแผงที่ปักอยู่
            พอดี — และสิ่งที่มันบังคือปุ่มคัดลอกของแถวล่างสุด เว้นที่ให้เฉพาะตอน dev
            เพราะปุ่มนั้นไม่มีอยู่ใน production */}
        <div
          ref={scrollRef}
          className={`max-h-[min(60vh,26rem)] overflow-auto${
            process.env.NODE_ENV === 'development' ? ' pb-12' : ''
          }`}
        >
          {runs.map((run) => {
            const open = openId === run.id;
            return (
              <div key={run.id} className="border-b last:border-b-0">
                {/* ปุ่มคัดลอกเป็นพี่น้องกับปุ่มกาง ไม่ใช่ลูก — <button> ซ้อน <button> เป็น HTML ที่ใช้ไม่ได้ */}
                <div className="hover:bg-muted/50 flex items-center gap-2.5 pr-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : run.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-4 text-left"
                  >
                    {open
                      ? <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                      : <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />}
                    <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                      {run.time}
                    </span>
                    {statusIcon(run)}
                    <span className="truncate text-sm font-medium">{run.label}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 font-mono text-xs tabular-nums">
                      {run.durationMs !== undefined && `${(run.durationMs / 1000).toFixed(1)}s`}
                      {run.durationMs !== undefined && run.exitCode !== undefined && ' · '}
                      {run.exitCode !== undefined && `exit ${run.exitCode}`}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    /* 44px บนมือถือตามเกณฑ์ touch target แล้วหดเหลือ 28px บนจอที่ใช้เมาส์
                       ซึ่งแถวต้องแน่นกว่านั้น */
                    className="text-muted-foreground hover:text-foreground size-11 shrink-0 sm:size-7"
                    onClick={() => void copy(formatRun(run))}
                    aria-label={t('pages.platformMigration.consoleCopyRun', { label: run.label })}
                    title={t('pages.platformMigration.consoleCopyRun', { label: run.label })}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {open && (
                  <div
                    ref={run.id === latestId ? logRef : undefined}
                    role="log"
                    aria-live={run.status === 'running' ? 'polite' : 'off'}
                    aria-label={t('pages.platformMigration.consoleAria')}
                    className="max-h-56 overflow-auto bg-[hsl(222_44%_7%)] px-4 py-3 font-mono text-xs leading-relaxed"
                  >
                    {run.lines.length === 0 && (
                      <div className="text-slate-500">{t('pages.platformMigration.consoleWaiting')}</div>
                    )}
                    {run.lines.map((line, i) => (
                      <div key={i} className={`break-all ${lineTone(line)}`}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default RunConsole;
