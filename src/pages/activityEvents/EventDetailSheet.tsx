import React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { JsonViewer } from '../../components/ui/json-viewer';
import { useI18n } from '../../hooks/useI18n';
import type { ActivityEvent } from '../../types';

interface EventDetailSheetProps {
  event: ActivityEvent | null;
  onClose: () => void;
  onViewSession: (sessionId: string) => void;
}

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-3 gap-3 py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="col-span-2 break-all">{children}</span>
  </div>
);

/** รายละเอียดเต็มของหนึ่ง event — เปิดจากคอลัมน์ actions ในตาราง */
export const EventDetailSheet: React.FC<EventDetailSheetProps> = ({ event, onClose, onViewSession }) => {
  const { t } = useI18n();

  return (
    <Sheet open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('pages.activityEvents.detailTitle')}</SheetTitle>
          <SheetDescription>{t('pages.activityEvents.detailDescription')}</SheetDescription>
        </SheetHeader>

        {event && (
          <div className="mt-4 space-y-4">
            <div className="divide-y divide-border">
              <Row label={t('pages.activityEvents.detailServerTime')}>{fmt(event.server_ts)}</Row>
              <Row label={t('pages.activityEvents.detailClientTime')}>{fmt(event.client_ts)}</Row>
              <Row label={t('pages.activityEvents.columnType')}><Badge variant="secondary">{event.event_type}</Badge></Row>
              <Row label={t('pages.activityEvents.columnUser')}>{event.user_name || event.user_id}</Row>
              <Row label={t('common.field.email')}>{event.user_email || '-'}</Row>
              <Row label={t('entity.businessUnit.title')}>{event.bu_code || '-'}</Row>
              <Row label={t('common.label.application')}>{event.app_name || event.app_id || '-'}</Row>
              <Row label={t('pages.activityEvents.detailDomain')}>{event.domain || '-'}</Row>
              <Row label={t('pages.activityEvents.columnPage')}><span className="font-mono text-xs">{event.page_path}</span></Row>
              <Row label={t('pages.activityEvents.columnElement')}><span className="font-mono text-xs">{event.element_id || '-'}</span></Row>
              <Row label={t('pages.activityEvents.detailElementText')}>{event.element_text || '-'}</Row>
              <Row label={t('pages.activityEvents.detailSession')}><span className="font-mono text-xs">{event.session_id}</span></Row>
              <Row label={t('pages.activityEvents.detailEventId')}><span className="font-mono text-xs">{event.event_id}</span></Row>
            </div>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">{t('pages.activityEvents.detailProps')}</p>
              <JsonViewer data={event.props ?? {}} />
            </div>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">{t('pages.activityEvents.detailUserAgent')}</p>
              <p className="break-all rounded-md bg-muted/50 p-2 font-mono text-[10px] sm:text-xs">
                {event.user_agent || '-'}
              </p>
            </div>

            <Button variant="outline" className="w-full" onClick={() => onViewSession(event.session_id)}>
              {t('pages.activityEvents.viewWholeSession')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
