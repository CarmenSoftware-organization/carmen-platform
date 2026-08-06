import React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { JsonViewer } from '../../components/ui/json-viewer';
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
export const EventDetailSheet: React.FC<EventDetailSheetProps> = ({ event, onClose, onViewSession }) => (
  <Sheet open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader>
        <SheetTitle>รายละเอียด Event</SheetTitle>
        <SheetDescription>ข้อมูลทุกฟิลด์ของ event ที่เลือก รวม props และ user agent</SheetDescription>
      </SheetHeader>

      {event && (
        <div className="mt-4 space-y-4">
          <div className="divide-y divide-border">
            <Row label="เวลา (server)">{fmt(event.server_ts)}</Row>
            <Row label="เวลา (client)">{fmt(event.client_ts)}</Row>
            <Row label="ชนิด"><Badge variant="secondary">{event.event_type}</Badge></Row>
            <Row label="ผู้ใช้">{event.user_name || event.user_id}</Row>
            <Row label="อีเมล">{event.user_email || '-'}</Row>
            <Row label="Business Unit">{event.bu_code || '-'}</Row>
            <Row label="Application">{event.app_name || event.app_id || '-'}</Row>
            <Row label="Domain">{event.domain || '-'}</Row>
            <Row label="หน้า"><span className="font-mono text-xs">{event.page_path}</span></Row>
            <Row label="Element"><span className="font-mono text-xs">{event.element_id || '-'}</span></Row>
            <Row label="Element text">{event.element_text || '-'}</Row>
            <Row label="Session"><span className="font-mono text-xs">{event.session_id}</span></Row>
            <Row label="Event ID"><span className="font-mono text-xs">{event.event_id}</span></Row>
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">props</p>
            <JsonViewer data={event.props ?? {}} />
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">user agent</p>
            <p className="break-all rounded-md bg-muted/50 p-2 font-mono text-[10px] sm:text-xs">
              {event.user_agent || '-'}
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={() => onViewSession(event.session_id)}>
            ดู session นี้ทั้งหมด
          </Button>
        </div>
      )}
    </SheetContent>
  </Sheet>
);
