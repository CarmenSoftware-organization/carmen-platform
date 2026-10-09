import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { AuditMeta } from '../../components/AuditMeta';
import type { NormalizedAudit } from '../../utils/audit';
import type { TFunction } from '../../i18n/types';
import { useI18n } from '../../hooks/useI18n';

const resourceOf = (key: string) => {
  const i = key.indexOf('.');
  return i >= 0 ? key.slice(0, i) : key;
};

/**
 * One-line summary of a role's reach: every permission (full access), none yet,
 * or the granted permission/resource spread. `catalogSize` lets it detect a role
 * that grants the entire catalog — the most powerful, audit-worthy kind.
 */
export function permissionSummary(
  permissions: string[],
  catalogSize: number,
  t?: TFunction,
): { text: string; full: boolean } {
  const n = permissions.length;
  if (catalogSize > 0 && n >= catalogSize) {
    return { text: t ? t('pages.roles.fullAccessPermissions') : 'Full access to every permission', full: true };
  }
  if (n === 0) {
    return { text: t ? t('pages.roles.noPermissionsYet') : 'No permissions granted yet', full: false };
  }
  const resources = new Set(permissions.map(resourceOf)).size;
  if (!t) {
    return {
      text: `${n} permission${n === 1 ? '' : 's'} across ${resources} resource${resources === 1 ? '' : 's'}`,
      full: false,
    };
  }
  // อังกฤษผันสองที่อิสระกัน (permission/resource) จึงต้องมีสี่คีย์ ไทยใช้ค่าเดียวกันทั้งสี่
  const key =
    n === 1
      ? resources === 1
        ? 'pages.roles.permissionSpread'
        : 'pages.roles.permissionSpreadSP'
      : resources === 1
        ? 'pages.roles.permissionSpreadPS'
        : 'pages.roles.permissionSpreadPP';
  return { text: t(key, { permissions: n, resources }), full: false };
}

interface RoleIdentityHeroProps {
  name: string;
  isActive: boolean;
  permissions: string[];
  catalogSize: number;
  /**
   * The page's own, richer reading of the grant ("10 permissions · 10 of 20 resources · read
   * only"). The hero and the permissions card used to state the reach separately, ~90px
   * apart, in two different phrasings — and the hero's was strictly the poorer of the two,
   * carrying no denominator. One sentence, stated once, at the top.
   *
   * Ignored when the role holds the entire catalog: the full-access warning outranks any
   * breakdown, and it is the only line here that is styled as an alert.
   */
  reachText?: string;
  /**
   * Shown under the name in read mode. It used to live only in the Settings rail, where it
   * sat beside a Name field that restated this header's own `<h1>` and a Status field that
   * restated its badge — three facts, two of them duplicates, in a card the reader had
   * already passed. Read mode drops that rail; the one fact it carried alone lands here.
   */
  description?: string;
  audit?: NormalizedAudit;
  actions?: React.ReactNode;
  /**
   * The reach drawn as a shape (`AccessShapeStrip`), above the sentence it illustrates. The
   * page passes it only from a complete catalog — see the strip's own note on why.
   */
  shape?: React.ReactNode;
  /**
   * Granted keys that let the role raise its own access (`utils/permissionRisk`). Named here,
   * once, rather than only tinted in the grid below the fold — it is the fact an access
   * reviewer most needs and the one a blue chip hides best.
   */
  escalationKeys?: string[];
}

/** Read-first identity header for a platform role: who it is + how much it can do. */
export function RoleIdentityHero({ name, isActive, permissions, catalogSize, reachText, description, audit, actions, shape, escalationKeys }: RoleIdentityHeroProps) {
  const { t } = useI18n();
  const computed = permissionSummary(permissions, catalogSize, t);
  const reach = computed.full || !reachText ? computed : { ...computed, text: reachText };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <div className="bg-primary/90 grid size-14 shrink-0 place-items-center rounded-lg text-white">
          <ShieldCheck className="size-7" />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{name || t('pages.roles.unnamedRole')}</h1>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={isActive ? 'success' : 'secondary'}>{isActive ? t('common.status.active') : t('common.status.inactive')}</Badge>
          </div>
          {/* The reach is the fact this page exists to state, so it no longer sits in the
              11px meta type beside the audit line: the shape first, the sentence under it. */}
          {shape && <div className="mt-3">{shape}</div>}
          <div
            className={`mt-1.5 flex items-center gap-1.5 text-sm ${reach.full ? 'text-warning' : 'text-muted-foreground'}`}
          >
            {reach.full && <AlertTriangle className="size-4 shrink-0" />}
            {reach.text}
          </div>
          {!reach.full && escalationKeys && escalationKeys.length > 0 && (
            // Amber carries the icon only: `--warning` as text on the light ground is 3.08:1
            // (see the code-palette note in index.css), below AA for body type.
            <div className="mt-1 flex items-start gap-1.5 text-sm">
              <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" />
              <span>
                {t('pages.roles.escalationWarning')}{' '}
                {escalationKeys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ', '}
                    <code className="font-mono text-xs">{k}</code>
                  </span>
                ))}
              </span>
            </div>
          )}
          <AuditMeta variant="header" audit={audit ?? {}} className="text-muted-foreground mt-2 text-[11px] leading-tight" />
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </Card>
  );
}
