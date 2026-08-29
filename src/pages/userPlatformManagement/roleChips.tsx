import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import type { PlatformUserRoleAssignment } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import type { TFunction } from '../../i18n/types';

/** True when any assignment is platform-wide — the widest blast radius a holder can have. */
export function hasPlatformWide(roles: PlatformUserRoleAssignment[]): boolean {
  return roles.some((r) => r.scope.type === 'platform');
}

// รับ `t` เข้ามาแทนที่จะเรียก hook — ฟังก์ชันนี้ถูกใช้ตอนจัดกลุ่ม/เรียงลำดับนอก render
const scopeLabel = (scope: PlatformUserRoleAssignment['scope'], t: TFunction): string =>
  scope.type === 'platform'
    ? t('pages.userPlatform.scopePlatform')
    : scope.cluster_name || scope.cluster_id;

/**
 * Leading-edge bar encoding how far a holder's privilege reaches. It is an accelerator for
 * scanning, never the only carrier of the fact — the scope name is written beside it in
 * RoleChips, so the rail is safe for anyone who cannot distinguish the two treatments.
 */
export function ScopeRail({ platformWide }: { platformWide: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'w-[3px] shrink-0 self-stretch rounded-full',
        platformWide ? 'bg-primary' : 'border border-border',
      )}
    />
  );
}

/** Assignments grouped by scope, widest first, scope named once per group. */
export function RoleChips({ roles }: { roles: PlatformUserRoleAssignment[] }) {
  const { t } = useI18n();
  const platformLabel = t('pages.userPlatform.scopePlatform');
  if (roles.length === 0) return <span className="text-muted-foreground text-sm">-</span>;

  const groups = new Map<string, PlatformUserRoleAssignment[]>();
  for (const role of roles) {
    const key = scopeLabel(role.scope, t);
    groups.set(key, [...(groups.get(key) ?? []), role]);
  }

  // Platform-wide first; remaining clusters alphabetical so the order is stable
  // across renders and pages. Array.from (not a spread) avoids needing
  // --downlevelIteration under this project's es5 target.
  // เทียบกับป้ายที่แปลแล้ว ไม่ใช่ literal 'Platform' — ไม่งั้นพอสลับภาษา กลุ่ม
  // "ทั้งแพลตฟอร์ม" จะหลุดจากตำแหน่งบนสุดเงียบ ๆ (จุดที่ compiler จับไม่ได้)
  const ordered = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === platformLabel) return -1;
    if (b === platformLabel) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-1">
      {ordered.map(([scope, items]) => (
        <div key={scope} className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs whitespace-nowrap">{scope}</span>
          <span className="text-muted-foreground/50 text-xs">·</span>
          {items.map((role) => (
            <Badge key={role.id} variant="secondary" className="text-xs">
              {role.role_name || role.role_id}
            </Badge>
          ))}
        </div>
      ))}
    </div>
  );
}
