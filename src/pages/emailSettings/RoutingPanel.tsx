import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import type { RoutingLane, RoutingMap } from './routingLanes';
import type { EmailFlowMeta } from '../../constants/emailFlows';
import { useI18n } from '../../hooks/useI18n';

interface RoutingPanelProps {
  map: RoutingMap;
}

/** ป้ายชื่อเส้นทางหนึ่งเส้น — เส้นทึบคือเลือกไว้ตรง ๆ เส้นประคือตกมาตามค่าเริ่มต้น */
export const FlowChip: React.FC<{ flow: EmailFlowMeta; inherited?: boolean }> = ({
  flow,
  inherited = false,
}) => (
  <span
    className={
      inherited
        ? 'text-muted-foreground border-border rounded-md border border-dashed px-2 py-0.5 text-xs'
        : 'text-foreground border-border bg-muted/60 rounded-md border px-2 py-0.5 text-xs'
    }
  >
    {flow.label}
  </span>
);

const Lane: React.FC<{ lane: RoutingLane }> = ({ lane }) => {
  const { t } = useI18n();
  const carries = lane.explicit.length + lane.inherited.length;
  const missing = lane.profile === null;
  const disabled = lane.profile !== null && lane.profile.is_active === false;
  // เลนดับกับเลนที่มีปัญหาใช้รางคนละสี: รางจาง = ว่างเปล่าโดยไม่มีอะไรพัง
  // รางสีเตือน = มีเส้นทางวิ่งเข้าแต่ปลายทางส่งไม่ได้ ซึ่งเป็นคนละเรื่องกัน
  const broken = carries > 0 && (missing || disabled);
  const rail = broken ? 'bg-destructive' : carries > 0 ? 'bg-primary' : 'bg-border';

  return (
    <div className="flex gap-3">
      <div className={`w-1 shrink-0 rounded-full ${rail}`} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">
            {lane.profile?.name ?? t('pages.emailSettings.laneMissingProfile')}
          </span>
          {lane.isDefault && (
            <Badge variant="secondary" className="text-[11px]">
              {t('common.label.default')}
            </Badge>
          )}
          {disabled && (
            <Badge variant="warning" className="text-[11px]">
              {t('common.status.inactive')}
            </Badge>
          )}
        </div>

        {/*
          ตั้งใจไม่ซ้ำ from_email / host:port ตรงนี้ ทั้งที่มีข้อมูลอยู่ในมือ — การ์ดของโปรไฟล์
          ด้านล่างพูดเรื่องนั้นครบแล้ว ถ้าผังพูดซ้ำ มันจะกลายเป็นสารบัญของการ์ดแทนที่จะเป็นแผนที่
          ผังนี้พูดเรื่องเดียวคือความสัมพันธ์ "เส้นทาง → ปลายทาง" ซึ่งไม่มีที่อื่นพูดได้
        */}
        {carries > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {lane.explicit.map((flow) => (
              <FlowChip key={flow.value} flow={flow} />
            ))}
            {lane.inherited.map((flow) => (
              <FlowChip key={flow.value} flow={flow} inherited />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">{t('pages.emailSettings.laneDark')}</p>
        )}

        {broken && (
          <p className="text-destructive flex items-start gap-1.5 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {missing
              ? t('pages.emailSettings.laneMissingWarning')
              : t('pages.emailSettings.laneInactiveWarning')}
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * แผงผังสาย — อ่าน mapping จากฝั่งปลายทาง
 *
 * เดิมหน้านี้แสดง mapping เป็นกล่องอ่านอย่างเดียวเรียงกัน 6 ใบ ซึ่งตอบได้แค่ "เส้นทางนี้ไปไหน"
 * ทีละบรรทัด และหน้าตาเหมือนช่องกรอกที่ถูกปิด ทั้งที่กดไม่ได้ ผังนี้ตอบคำถามที่ผู้ดูแลถามจริง
 * แทน: โปรไฟล์ตัวไหนกำลังส่งอะไรอยู่ และตัวไหนตั้งไว้ครบแต่ไม่มีใครใช้เลย
 */
export const RoutingPanel: React.FC<RoutingPanelProps> = ({ map }) => {
  const { t } = useI18n();
  const hasInherited = map.lanes.some((lane) => lane.inherited.length > 0);

  return (
    <div className="space-y-4">
      {map.unrouted.length > 0 && (
        <p className="text-destructive flex items-start gap-1.5 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('pages.emailSettings.noDefaultWarning', { count: map.unrouted.length })}
        </p>
      )}

      <div className="space-y-4">
        {map.lanes.map((lane) => (
          <Lane key={lane.profileId} lane={lane} />
        ))}
      </div>

      {hasInherited && (
        <p className="text-muted-foreground border-t pt-3 text-[11px]">
          {t('pages.emailSettings.laneLegend')}
        </p>
      )}
    </div>
  );
};
