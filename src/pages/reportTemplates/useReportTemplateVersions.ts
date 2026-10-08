import { useCallback, useEffect, useRef, useState } from 'react';
import reportTemplateService, {
  type ReportTemplateVersion,
  type ReportTemplateVersionSummary,
} from '../../services/reportTemplateService';
import { getErrorDetail, isNotFoundError } from '../../utils/errorParser';

/**
 * รายการเวอร์ชันของ template หนึ่งตัว + โหลด snapshot ทีละเวอร์ชันพร้อม cache
 * `unsupported` = backend ยังไม่มี endpoint (404) → หน้าแม่ซ่อนปุ่ม
 * `settled` = ได้คำตอบแรกแล้ว (รวมรายการว่าง) — จบการ probe ตอน mount
 * `enabled` = ผู้ใช้เปิดแผ่นอยู่ → ขาขึ้นแต่ละครั้งโหลดรายการใหม่
 */
export function useReportTemplateVersions(templateId: string | undefined, enabled: boolean) {
  const [versions, setVersions] = useState<ReportTemplateVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [details, setDetails] = useState<Record<number, ReportTemplateVersion | undefined>>({});
  const [detailLoading, setDetailLoading] = useState<Record<number, boolean>>({});
  const [detailError, setDetailError] = useState<Record<number, string | undefined>>({});
  const generationRef = useRef(0);
  const requestedRef = useRef<Set<number>>(new Set());
  const templateIdRef = useRef(templateId);

  // template เปลี่ยน (นำทางจาก id หนึ่งไปอีก id ใน instance เดิม) → ล้าง cache ของตัวเก่า
  useEffect(() => {
    templateIdRef.current = templateId;
    generationRef.current += 1;
    requestedRef.current = new Set();
    setVersions([]);
    setDetails({});
    setDetailLoading({});
    setDetailError({});
    setError('');
    setUnsupported(false);
    setSettled(false);
    setLoading(false);
  }, [templateId]);

  const reload = useCallback(() => {
    if (!templateId) return;
    const generation = ++generationRef.current;
    setLoading(true);
    setError('');
    reportTemplateService
      .listVersions(templateId)
      .then((list) => {
        if (generation === generationRef.current) setVersions(list);
      })
      .catch((err: unknown) => {
        if (generation !== generationRef.current) return;
        if (isNotFoundError(err)) setUnsupported(true);
        else setError(getErrorDetail(err));
      })
      .finally(() => {
        if (generation !== generationRef.current) return;
        setLoading(false);
        setSettled(true);
      });
  }, [templateId]);

  // probe ครั้งเดียวก่อนเปิดใช้: ยิงจนได้คำตอบแรก (`settled` — รายการว่างก็นับ) แล้วหยุด
  // หลังจากนั้นยิงเฉพาะตอน `enabled` พลิกเป็น true (เปิดแผ่น) — reload ผูกกับขาขึ้นเท่านั้น ไม่วน
  const shouldLoad = enabled || !settled;
  useEffect(() => {
    if (shouldLoad) reload();
  }, [shouldLoad, reload]);

  const loadDetail = useCallback(
    (version: number) => {
      if (!templateId || requestedRef.current.has(version)) return;
      requestedRef.current.add(version);
      const forTemplate = templateId;
      setDetailLoading((d) => ({ ...d, [version]: true }));
      setDetailError((d) => ({ ...d, [version]: undefined }));
      reportTemplateService
        .getVersion(templateId, version)
        .then((row) => {
          if (templateIdRef.current === forTemplate) setDetails((d) => ({ ...d, [version]: row }));
        })
        .catch((err: unknown) => {
          if (templateIdRef.current !== forTemplate) return;
          // ลืมไว้ให้กางใหม่แล้วยิงซ้ำได้ (fetch-race-guards: failed fetch must stay retryable)
          requestedRef.current.delete(version);
          setDetailError((d) => ({ ...d, [version]: getErrorDetail(err) }));
        })
        .finally(() => {
          if (templateIdRef.current === forTemplate) setDetailLoading((d) => ({ ...d, [version]: false }));
        });
    },
    [templateId],
  );

  return { versions, loading, settled, error, unsupported, details, detailLoading, detailError, loadDetail, reload };
}
