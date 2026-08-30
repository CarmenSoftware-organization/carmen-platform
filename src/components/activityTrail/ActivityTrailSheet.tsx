import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../EmptyState';
import { AuditMeta } from '../AuditMeta';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';
import type { ActivityDiff, ActivityLogEntry } from '../../types';
import { useActivityTrail } from '../../hooks/useActivityTrail';
import { ActivityDiffView, visibleFieldChanges } from './ActivityDiffView';
import { isMembershipEntry, membershipKey } from './membership';

interface ActivityTrailSheetProps {
  /** ชื่อตารางที่ตัด prefix tb_ ออกแล้ว เช่น "cluster" */
  entityType: string;
  entityId?: string;
  /** วันที่ระบบเริ่มบันทึก ใช้อธิบายความว่างเปล่าให้ผู้ใช้ */
  recordingStartedOn: string;
  /** ส่ง response ดิบกลับให้หน้าแม่ใส่ DevDebugSheet — hook อยู่ในนี้ หน้าแม่เข้าถึงตรงไม่ได้ */
  onRawResponse?: (raw: unknown) => void;
  /**
   * สถานะเปิด/ปิดที่ควบคุมจากภายนอก — ส่งมาแล้วปุ่มในตัวจะหายไป
   *
   * มีไว้ให้หน้า Management ที่เปิดแผ่นจากเมนูในแถวตาราง: `DropdownMenuItem` ใส่ปุ่มซ้อน
   * ไม่ได้ และแผ่นที่เรนเดอร์ในเมนูจะถูก unmount ทันทีที่เมนูปิด หน้าแม่จึงถือสถานะเองแล้ว
   * เรนเดอร์แผ่น **ตัวเดียวนอกตาราง** ไม่ใช่ตัวละแถว
   *
   * ไม่ส่ง = พฤติกรรมเดิมทุกประการ (ปุ่มในตัว + สถานะในตัว)
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const VERB_KEYS: Record<string, TKey> = {
  create: 'pages.activityTrail.actionCreate',
  update: 'pages.activityTrail.actionUpdate',
  delete: 'pages.activityTrail.actionDelete',
};

const TrailRow: React.FC<{
  entry: ActivityLogEntry;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
  changes?: ActivityDiff;
}> = ({ entry, expanded, onToggle, loading, changes }) => {
  const { t } = useI18n();
  const contentId = useId();
  // แถวการเปลี่ยนสมาชิกไม่มีฟิลด์เปลี่ยน — บอกจำนวนฟิลด์จะสื่อผิด
  const isMembership = isMembershipEntry(entry);
  // จำนวนฟิลด์รู้ได้หลังโหลด detail เท่านั้น — ก่อนกางจึงยังไม่มีตัวเลขให้แสดง
  // นับเฉพาะฟิลด์ที่จะแสดงจริง ไม่ใช่ทั้งหมดที่ backend ส่งมา ไม่งั้นหัวแถวจะบอก "3 ฟิลด์"
  // แล้วกางออกมาเห็นฟิลด์เดียว
  const fieldCount =
    !isMembership && changes ? visibleFieldChanges(changes).length : undefined;

  return (
    <div className="border-border border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
        className="focus-visible:ring-ring flex w-full items-center gap-3 py-3 text-left focus-visible:ring-1 focus-visible:outline-hidden"
      >
        <span className="min-w-0 flex-1">
          <AuditMeta
            variant="compact"
            verbKey={entry.action ? VERB_KEYS[entry.action] : undefined}
            actor={entry.audit?.created}
            className="text-muted-foreground text-xs"
          />
        </span>
        {fieldCount !== undefined && (
          <span className="text-muted-foreground shrink-0 text-xs">
            {t('pages.activityTrail.changedFields', { count: fieldCount })}
          </span>
        )}
        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>
      {expanded && (
        <div id={contentId} className="pb-3">
          {isMembership ? (
            <MembershipDetail entry={entry} />
          ) : loading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <ActivityDiffView changes={changes} />
          )}
        </div>
      )}
    </div>
  );
};

/**
 * เนื้อในของแถวการเปลี่ยนสมาชิก — ประโยคเดียว ไม่ใช่ตาราง diff
 *
 * ไม่ต้องโหลด detail เพราะข้อมูลที่ต้องใช้ (event_type, subject_name) มากับแถวใน list แล้ว
 */
const MembershipDetail: React.FC<{ entry: ActivityLogEntry }> = ({ entry }) => {
  const { t } = useI18n();
  const key = membershipKey(entry);
  if (!key) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {t(key, {
        name: entry.subject_name || t('pages.activityTrail.membershipUnknownSubject'),
      })}
    </p>
  );
};

/** โครงกระดูกที่กระจกกับเลย์เอาต์จริง เพื่อไม่ให้อะไรกระตุกตอนข้อมูลมาถึง */
const TrailSkeleton: React.FC = () => (
  <div className="divide-border divide-y">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="flex items-center gap-3 py-3">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="size-4 shrink-0" />
      </div>
    ))}
  </div>
);

/**
 * ปุ่มและแผ่นแสดงประวัติการเปลี่ยนแปลงของเรคอร์ดหนึ่งตัว
 *
 * ปุ่มกับแผ่นอยู่ในคอมโพเนนต์เดียวกันเพราะสถานะเปิด/ปิดคุมทั้งการแสดงผลและการยิง request
 * (hook รับ `enabled` = สถานะเปิด) แยกสองส่วนแล้วต้องยกสถานะขึ้นไปหน้าแม่โดยไม่ได้อะไรเพิ่ม
 *
 * แถวกางลงในตัวแทนที่จะเปิดแผ่นซ้อน และ diff โหลดตอนกางครั้งแรกเท่านั้น — คำนวณ diff
 * ให้ทุกแถวคือจ่ายค่า parse JSONB สองก้อนต่อแถวเพื่อข้อมูลที่ผู้อ่านเปิดดูแถวเดียว
 */
export const ActivityTrailSheet: React.FC<ActivityTrailSheetProps> = ({
  entityType,
  entityId,
  recordingStartedOn,
  onRawResponse,
  open: controlledOpen,
  onOpenChange,
}) => {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  // controlled เมื่อหน้าแม่ส่ง open มา — ปุ่มในตัวหายไปพร้อมกัน
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (next: boolean) => onOpenChange?.(next)
    : setInternalOpen;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const trail = useActivityTrail(entityType, entityId, open);

  useEffect(() => {
    if (trail.rawResponse !== null) onRawResponse?.(trail.rawResponse);
  }, [trail.rawResponse, onRawResponse]);

  const toggle = (entry: ActivityLogEntry) => {
    const id = entry.id;
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    // แถว membership อ่านทุกอย่างจาก list ได้แล้ว ไม่ต้องยิง detail ให้เปล่าประโยชน์
    if (!isMembershipEntry(entry)) {
      trail.loadDetail(id); // มี cache ในตัว — กางซ้ำไม่ยิงใหม่
    }
  };

  const isEmpty = !trail.loading && trail.entries.length === 0 && !trail.error;

  return (
    <>
      {!isControlled && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <History className="mr-2 h-4 w-4" />
          {t('pages.activityTrail.buttonLabel')}
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{t('pages.activityTrail.title')}</SheetTitle>
            <SheetDescription>{t('pages.activityTrail.description')}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* error แสดงในแผ่นเอง ไม่ใช่ toast — แผ่นนี้มีที่แสดงของตัวเองอยู่แล้ว */}
            {trail.error && (
              <p className="text-destructive text-sm">
                {t('pages.activityTrail.loadError')} — {trail.error}
              </p>
            )}

            {trail.loading && trail.entries.length === 0 && <TrailSkeleton />}

            {isEmpty && (
              <EmptyState
                icon={History}
                title={t('pages.activityTrail.emptyTitle')}
                description={t('pages.activityTrail.emptyDescription', {
                  date: recordingStartedOn,
                })}
              />
            )}

            {trail.entries.length > 0 && (
              <div>
                {trail.entries.map((entry) => (
                  <TrailRow
                    key={entry.id}
                    entry={entry}
                    expanded={expandedId === entry.id}
                    onToggle={() => toggle(entry)}
                    loading={!!trail.detailLoading[entry.id]}
                    changes={trail.details[entry.id]?.changes}
                  />
                ))}
              </div>
            )}

            {trail.hasMore && (
              <Button
                variant="outline"
                className="w-full"
                disabled={trail.loadingMore}
                onClick={trail.loadMore}
              >
                {t('pages.activityTrail.loadMore')}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
