import { relativeTime } from '../utils/relativeTime';
import type { AuditActor, NormalizedAudit } from '../utils/audit';
import { isUnknownActor } from '../utils/audit';
import { useI18n } from '../hooks/useI18n';
import type { TFunction } from '../i18n/types';

// ไม่มี date library ในโปรเจกต์นี้ (CLAUDE.md · DateTime) — formatter แบบ inline
const absolute = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** ชื่อที่จะแสดง — 'Unknown' จาก backend อ่านไม่รู้เรื่อง ต้องขยายเป็นประโยค */
const displayName = (t: TFunction, name?: string): string | undefined => {
  if (!name) return undefined;
  return isUnknownActor(name) ? t('common.state.unknownUser') : name;
};

type AuditMetaProps =
  | { variant: 'header'; audit: NormalizedAudit; now?: Date; className?: string }
  | { variant: 'cell'; actor?: AuditActor; now?: Date; className?: string }
  | { variant: 'compact'; actor?: AuditActor; now?: Date; className?: string; verb?: string };

/**
 * แสดง "ใครทำเมื่อไหร่" ด้วยรูปแบบเดียวกันทั้งแอป
 *
 * เวลาแสดงเป็น relative (`5mo ago`) เพราะอ่านแล้วรู้ทันทีว่าสดหรือเก่า และห่อด้วย `title`
 * ที่เป็นเวลาเต็ม — ใช้ `title` ไม่ใช่ Radix Tooltip เพราะตารางหนึ่งหน้ามีเซลล์เป็นร้อย
 * การ mount Tooltip ทุกเซลล์จะกิน DOM node มหาศาล
 *
 * `now` ต้องส่งได้จากภายนอกเพื่อให้ผลลัพธ์คงที่ตอนทดสอบ
 */
export function AuditMeta(props: AuditMetaProps) {
  const { t } = useI18n();
  const now = props.now ?? new Date();

  if (props.variant === 'header') {
    const { created, updated } = props.audit;
    if (!created && !updated) return null;
    return (
      <p className={props.className ?? 'text-muted-foreground mt-0.5 text-xs'}>
        {created && <ActorPhrase t={t} verb={t('common.audit.created')} actor={created} now={now} />}
        {created && updated && <span className="mx-1.5">·</span>}
        {updated && <ActorPhrase t={t} verb={t('common.audit.updatedDate')} actor={updated} now={now} />}
      </p>
    );
  }

  const { actor } = props;
  // ต่างจาก variant 'header': นี่คือเซลล์ในตาราง/การ์ด — `data-table.tsx` เรนเดอร์ label+cell
  // ของทุกคอลัมน์แบบไม่มีเงื่อนไขบนการ์ดมือถือ และบางตาราง (SubscriptionTable) มีคอลัมน์ audit
  // ที่ยังว่างสนิททุกแถวจนกว่ากิ่ง backend จะขึ้น — คืน '-' ตาม convention ของแอป ไม่ใช่ null
  if (!actor?.at && !actor?.name) {
    return <span className="text-muted-foreground">-</span>;
  }
  const when = relativeTime(actor.at, now);
  const who = displayName(t, actor.name);

  if (props.variant === 'compact') {
    return (
      <span className={props.className ?? 'text-muted-foreground text-xs'} title={absolute(actor.at)}>
        {props.verb && <span className="font-medium">{props.verb}</span>}
        {props.verb && ' '}
        {when || '-'}
        {who && ` · ${who}`}
      </span>
    );
  }

  // variant 'cell' — เวลาบรรทัดบน ชื่อบรรทัดล่าง ให้คอลัมน์แคบพอในตาราง
  // `whitespace-nowrap` อยู่ที่ตัวครอบเพราะ white-space สืบทอดลงไปทั้งสองบรรทัด: เวลา
  // ('5mo ago') กับชื่อคนจึงไม่ถูกตัดกลาง แต่ยังคงแยกเป็นสองบรรทัดตามเดิม
  return (
    <div
      className={props.className ?? 'text-muted-foreground space-y-0.5 text-[11px] leading-tight whitespace-nowrap'}
      title={absolute(actor.at)}
    >
      <div>{when || '-'}</div>
      {who && <div>{who}</div>}
    </div>
  );
}

function ActorPhrase({ t, verb, actor, now }: { t: TFunction; verb: string; actor: AuditActor; now: Date }) {
  const who = displayName(t, actor.name);
  return (
    <span title={absolute(actor.at)}>
      <span className="font-medium">{verb}</span> {relativeTime(actor.at, now) || '-'}
      {who && ` ${t('components.auditMeta.byActor', { name: who })}`}
    </span>
  );
}
