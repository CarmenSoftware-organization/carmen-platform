import React from 'react';
import { AlertTriangle, Check, ChevronDown } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import type { RoutingLane, RoutingMap } from './routingLanes';
import type { EmailFlowMeta } from '../../constants/emailFlows';
import type { EmailFlow, EmailSetting } from '../../types';
import { useI18n } from '../../hooks/useI18n';

/**
 * สิ่งที่โหมดแก้เพิ่มเข้ามาในผัง — ไม่มี = โหมดอ่าน ซึ่งต้องเรนเดอร์เหมือนเดิมทุกพิกเซล
 *
 * รวมเป็นก้อนเดียวแทนที่จะเป็น prop เดี่ยว ๆ หลายตัว เพราะทั้งหมดมีหรือไม่มีพร้อมกันเสมอ
 * แยกกันเมื่อไหร่จะเกิดสถานะที่เป็นไปไม่ได้ เช่น chip กดได้แต่ไม่มีใครรับค่าที่กด
 */
export interface RoutingEditContext {
  /** ตัวเลือกในเมนู — ส่งมาทั้งหมดรวมโปรไฟล์ที่ปิด เมนูเป็นคนแสดงว่าตัวไหนกดไม่ได้ */
  profiles: EmailSetting[];
  /** ชื่อโปรไฟล์เริ่มต้นปัจจุบัน · ว่าง = ยังไม่ได้เลือก */
  defaultProfileName: string;
  /** profileId = ผูกกับโปรไฟล์นั้นตรง ๆ · null = ตกทอดตามค่าเริ่มต้น (ไม่บันทึกคีย์) */
  onMoveFlow: (flow: EmailFlow, profileId: string | null) => void;
  onSetDefault: (profileId: string) => void;
}

interface RoutingPanelProps {
  map: RoutingMap;
  /** ไม่ส่ง = โหมดอ่าน */
  edit?: RoutingEditContext;
}

/**
 * เมนูเลือกปลายทางของเส้นทางหนึ่งเส้น
 *
 * โปรไฟล์ที่ปิดอยู่ยังโผล่ในเมนูแต่กดไม่ได้ ไม่ใช่หายไปเฉย ๆ — ผู้ดูแลที่กำลังหาว่าทำไมย้าย
 * เส้นทางไป Billing ไม่ได้ ต้องเห็นคำตอบตรงที่มองอยู่ ถ้าตัดออกจากรายการเงียบ ๆ เขาจะสรุปว่า
 * โปรไฟล์ถูกลบไปแล้วและไปลบซ้ำ (เหตุผลเดียวกับที่เลนของโปรไฟล์ที่ปิดยังวาดอยู่ในผัง)
 */
const FlowMenu: React.FC<{
  flow: EmailFlowMeta;
  /** เลนที่ chip นี้อยู่ · null = ยังไม่มีปลายทาง (ยังไม่ได้เลือกค่าเริ่มต้น) */
  laneProfileId: string | null;
  inherited: boolean;
  edit: RoutingEditContext;
  children: React.ReactNode;
}> = ({ flow, laneProfileId, inherited, edit, children }) => {
  const { t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[19rem] min-w-[13rem]">
        <DropdownMenuLabel className="pb-0.5 text-xs">{flow.label}</DropdownMenuLabel>
        {/* คำอธิบายเส้นทางเคยอยู่ใต้ทุกช่องในฟอร์มเดิม ที่นี่มันโผล่เฉพาะเส้นทางที่กำลังจะแก้
            จึงอ่านตอนที่ต้องใช้จริง แทนที่จะเป็นกำแพงข้อความสีเทา 5 บรรทัดรวดตลอดเวลา */}
        <p className="text-muted-foreground px-2 pb-1.5 text-xs">{t(flow.descriptionKey)}</p>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => edit.onMoveFlow(flow.value, null)}>
          <Check className={`mr-2 h-4 w-4 shrink-0 ${inherited ? '' : 'invisible'}`} />
          <span className="truncate">
            {edit.defaultProfileName
              ? t('pages.emailSettings.useDefaultNamed', { name: edit.defaultProfileName })
              : t('pages.emailSettings.useDefault')}
          </span>
        </DropdownMenuItem>

        {edit.profiles.map((p) => {
          const off = p.is_active === false;
          return (
            <DropdownMenuItem
              key={p.id}
              disabled={off}
              onSelect={() => edit.onMoveFlow(flow.value, p.id)}
            >
              <Check
                className={`mr-2 h-4 w-4 shrink-0 ${
                  !inherited && p.id === laneProfileId ? '' : 'invisible'
                }`}
              />
              <span className="truncate">{p.name}</span>
              {off && (
                <span className="text-muted-foreground ml-2 shrink-0 text-[11px]">
                  {t('common.status.inactive')}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** ป้ายชื่อเส้นทางหนึ่งเส้น — เส้นทึบคือเลือกไว้ตรง ๆ เส้นประคือตกมาตามค่าเริ่มต้น */
export const FlowChip: React.FC<{
  flow: EmailFlowMeta;
  inherited?: boolean;
  /** เลนที่ chip อยู่ · ใช้เฉพาะตอนแก้ เพื่อให้เมนูติ๊กถูกที่ตัวเลือกปัจจุบัน */
  laneProfileId?: string | null;
  edit?: RoutingEditContext;
}> = ({ flow, inherited = false, laneProfileId = null, edit }) => {
  const skin = inherited
    ? 'text-muted-foreground border-border border-dashed'
    : 'text-foreground border-border bg-muted/60';
  const base = `rounded-md border px-2 py-0.5 text-xs ${skin}`;

  if (!edit) return <span className={base}>{flow.label}</span>;

  return (
    <FlowMenu flow={flow} laneProfileId={laneProfileId} inherited={inherited} edit={edit}>
      <button
        type="button"
        // focus-visible ไม่ใช่ focus: chip ที่เพิ่งเลือกจากเมนูจะได้ focus กลับมาเสมอ ถ้าใช้ ring
        // ธรรมดา ผังจะมีวงแหวนค้างบน chip ที่แตะล่าสุดตลอดเวลาแม้ผู้ดูแลใช้เมาส์ล้วน
        className={`${base} hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1 focus-visible:ring-2 focus-visible:outline-hidden`}
      >
        {flow.label}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
      </button>
    </FlowMenu>
  );
};

const Lane: React.FC<{ lane: RoutingLane; edit?: RoutingEditContext }> = ({ lane, edit }) => {
  const { t } = useI18n();
  const carries = lane.explicit.length + lane.inherited.length;
  const missing = lane.profile === null;
  const disabled = lane.profile !== null && lane.profile.is_active === false;
  // เลนดับกับเลนที่มีปัญหาใช้รางคนละสี: รางจาง = ว่างเปล่าโดยไม่มีอะไรพัง
  // รางสีเตือน = มีเส้นทางวิ่งเข้าแต่ปลายทางส่งไม่ได้ ซึ่งเป็นคนละเรื่องกัน
  const broken = carries > 0 && (missing || disabled);
  const rail = broken ? 'bg-destructive' : carries > 0 ? 'bg-primary' : 'bg-border';
  // เลนที่ส่งไม่ได้รับค่าเริ่มต้นไม่ได้ — ค่าเริ่มต้นคือปลายทางของทุกเส้นทางที่ไม่ได้ระบุ
  // การตั้งโปรไฟล์ที่ปิดอยู่/หายไปเป็นค่าเริ่มต้น คือการดับเมลทั้งระบบด้วยการกดปุ่มเดียว
  const canBeDefault = edit && !lane.isDefault && !missing && !disabled;

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
          {canBeDefault && (
            <Button
              variant="ghost"
              size="sm"
              // ติดกับชื่อเลน ไม่ใช่ ml-auto ชิดขวา: ในการ์ดกว้าง ๆ ปุ่มจะลอยไปห่างชื่อเป็น
              // 700px จนอ่านไม่ออกว่ามันเป็นการกระทำของเลนไหน — ผังนี้ทั้งผังพูดเรื่องความเป็น
              // เจ้าของ ปุ่มที่ลอยหลุดจากเจ้าของจึงขัดกับสิ่งเดียวที่ผังพยายามสื่อ
              // muted จนกว่าจะ hover: ปุ่มนี้อยู่ติดชื่อเลนซึ่งเป็น font-medium ถ้าใช้สี foreground
              // เต็มมันจะอ่านเป็นส่วนหนึ่งของชื่อ และแย่งสายตาจาก chip ซึ่งเป็นสิ่งที่ผู้ดูแลมาแก้จริง
              className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
              onClick={() => edit.onSetDefault(lane.profileId)}
            >
              {t('pages.emailSettings.makeDefault')}
            </Button>
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
              <FlowChip key={flow.value} flow={flow} laneProfileId={lane.profileId} edit={edit} />
            ))}
            {lane.inherited.map((flow) => (
              <FlowChip
                key={flow.value}
                flow={flow}
                inherited
                laneProfileId={lane.profileId}
                edit={edit}
              />
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
 * แผงผังสาย — อ่าน mapping จากฝั่งปลายทาง และ (ในโหมดแก้) แก้ตรงที่เดียวกับที่อ่าน
 *
 * เดิมหน้านี้แสดง mapping เป็นกล่องอ่านอย่างเดียวเรียงกัน 6 ใบ ซึ่งตอบได้แค่ "เส้นทางนี้ไปไหน"
 * ทีละบรรทัด และหน้าตาเหมือนช่องกรอกที่ถูกปิด ทั้งที่กดไม่ได้ ผังนี้ตอบคำถามที่ผู้ดูแลถามจริง
 * แทน: โปรไฟล์ตัวไหนกำลังส่งอะไรอยู่ และตัวไหนตั้งไว้ครบแต่ไม่มีใครใช้เลย
 *
 * โหมดแก้ไม่สลับไปเป็นฟอร์ม เพราะฟอร์มคือรูปที่ผังนี้ตั้งใจแทนที่ตั้งแต่แรก การซ่อนผังตอนแก้
 * แปลว่าผู้ดูแลแก้แผนที่โดยมองไม่เห็นแผนที่ — คำเตือนเลนพังและเลนดับ ซึ่งเป็นเหตุผลที่เขากดแก้
 * ตั้งแต่ต้น จะหายไปพอดีกับตอนที่ต้องใช้มันที่สุด
 */
export const RoutingPanel: React.FC<RoutingPanelProps> = ({ map, edit }) => {
  const { t } = useI18n();
  const hasInherited = map.lanes.some((lane) => lane.inherited.length > 0);

  return (
    <div className="space-y-4">
      {map.unrouted.length > 0 && (
        <div className="border-destructive/40 space-y-2 rounded-md border border-dashed p-3">
          <p className="text-destructive flex items-start gap-1.5 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('pages.emailSettings.noDefaultWarning', { count: map.unrouted.length })}
          </p>
          {/* เส้นทางไร้ปลายทางต้องกดได้ในโหมดแก้ ไม่งั้นมันจะเป็นสิ่งเดียวที่ผังบอกว่ามีปัญหา
              แล้วไม่ให้ทางแก้ — chip พวกนี้ไม่อยู่ในเลนไหนเลยจนกว่าจะมีค่าเริ่มต้น */}
          {edit && (
            <div className="flex flex-wrap gap-1.5">
              {map.unrouted.map((flow) => (
                <FlowChip key={flow.value} flow={flow} inherited edit={edit} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {map.lanes.map((lane) => (
          <Lane key={lane.profileId} lane={lane} edit={edit} />
        ))}
      </div>

      {(hasInherited || edit) && (
        <p className="text-muted-foreground border-t pt-3 text-[11px]">
          {edit ? t('pages.emailSettings.laneEditHint') : t('pages.emailSettings.laneLegend')}
        </p>
      )}
    </div>
  );
};
