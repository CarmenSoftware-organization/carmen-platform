import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { isEscalationKey } from '../../utils/permissionRisk';
import { groupGrantRows, resourceMeta } from './grantGroups';

export interface PermissionGridAction {
  key: string;
  action: string;
  description?: string;
  granted: boolean;
}

export interface PermissionGridRow {
  resource: string;
  /** From the catalog, per language. Absent when the catalog failed or predates the field. */
  resourceDescription?: { en?: string | null; th?: string | null };
  actions: PermissionGridAction[];
  total: number;
  grantedCount: number;
}

interface PermissionGridProps {
  rows: PermissionGridRow[];
  /**
   * Present ⇒ the grid is editable and every verb becomes a toggle. Absent ⇒ read-only.
   * The two renderings share this component precisely so that pressing Edit cannot move
   * anything: the rows, their order, and the verbs inside them are identical, and only the
   * affordance changes.
   */
  onToggle?: (key: string) => void;
  /** Grants or clears a set of keys at once (a resource, or a whole section). Only meaningful alongside `onToggle`. */
  onToggleResource?: (keys: string[], allOn: boolean) => void;
  /**
   * The grant as last saved. While editing, a chip whose state differs from it carries a dot —
   * green for added, red for removed — so the pending change is visible where it was made,
   * not only as a count in the save bar.
   */
  original?: ReadonlySet<string>;
  /**
   * False when the rows were rebuilt from the role's own keys because the catalog failed. Such
   * a section only knows the resources the role holds, so its `held/total` would always read
   * as full (`4/4`) — a claim about the catalog it cannot make. The counter is dropped instead.
   */
  complete?: boolean;
}

/**
 * The role's grant, as one document, in the sidebar's own sections and words.
 *
 * Read and edit used to be two different layouts over the same data — a flat two-column grid
 * to read, a stack of bordered `<details>` accordions to edit, each defaulting to collapsed
 * for any resource the role held nothing in. Pressing Edit therefore reflowed the whole page
 * and hid, behind a disclosure triangle, exactly the resources you were most likely opening
 * the editor to grant.
 *
 * Every catalog row is present in both modes, granted or not: what a role cannot reach is
 * half of an access review, and it is also the half you edit. What changed is how the 20-odd
 * rows are carved up: a flat run of snake_case keys asked the reader to map each one back to
 * the menu by hand, so rows now sit under the menu section they belong to, named and iconed
 * as the menu names them, with the key kept beneath as the precise identifier.
 */
export function PermissionGrid({ rows, onToggle, onToggleResource, original, complete = true }: PermissionGridProps) {
  const { t, lang } = useI18n();
  const editable = Boolean(onToggle);
  const groups = groupGrantRows(rows);

  const grantToggle = (keys: string[], allOn: boolean, scopeLabel?: string) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      // A section's control is named for its section — otherwise it and the first row's
      // control are two buttons both called "All".
      aria-label={scopeLabel ? `${allOn ? t('common.action.grantNone') : t('common.action.grantAll')} · ${scopeLabel}` : undefined}
      className="text-muted-foreground hover:text-primary h-6 px-2 text-xs"
      onClick={() => onToggleResource?.(keys, allOn)}
    >
      {allOn ? t('common.action.grantNone') : t('common.action.grantAll')}
    </Button>
  );

  return (
    // Read mode has the full card width and no rail, so sections flow into two columns from
    // `xl` — the single hugging column it replaced left ~60% of the card empty. CSS columns,
    // not a grid: sections differ in height, and a grid row would stretch to the tallest.
    // Edit mode shares the width with the settings rail and stays one column.
    <div className={cn(!editable && 'xl:columns-2 xl:gap-x-10')}>
      {groups.map((group) => {
        const groupKeys = group.rows.flatMap((r) => r.actions.map((a) => a.key));
        const groupAllOn = group.rows.every((r) => r.grantedCount === r.total);
        return (
          <section key={group.labelKey} className="mb-5 break-inside-avoid last:mb-0">
            <div className="border-border mb-2 flex items-center gap-2 border-b pb-1.5">
              <h3
                className={cn(
                  'text-muted-foreground text-xs font-medium tracking-wide uppercase',
                  group.held === 0 && !editable && 'text-muted-foreground/60',
                )}
              >
                {t(group.labelKey)}
              </h3>
              {complete && (
                <span className="text-muted-foreground/80 text-[11px] tabular-nums">
                  {group.held}/{group.rows.length}
                </span>
              )}
              {editable && <span className="ml-auto">{grantToggle(groupKeys, groupAllOn, t(group.labelKey))}</span>}
            </div>

            {/* One grid per section with a fixed name track, so the verbs line up across
                sections as well as within one. Below `sm` each row stacks instead
                (`sm:contents` hands the pair back to the grid once there is room). */}
            <div className="grid grid-cols-1 sm:grid-cols-[16rem_minmax(0,1fr)] sm:items-center sm:gap-x-4 sm:gap-y-2">
              {group.rows.map((row) => {
                const keys = row.actions.map((a) => a.key);
                const allOn = row.grantedCount === row.total;
                const meta = resourceMeta(row.resource);
                const Icon = meta?.icon;
                // From the backend's permission seed (`PLATFORM_PERMISSION_RESOURCE_SEED`). Thai
                // falls back to English when a resource has no Thai text; none at all ⇒ no line.
                const description = (lang === 'th' ? row.resourceDescription?.th : undefined) || row.resourceDescription?.en;
                // A resource this role cannot touch at all recedes with its verbs — still
                // counted and still in place, but never competing with the resources the role
                // actually reaches. It stays legible while editing, where it is a target.
                const recede = row.grantedCount === 0 && !editable;
                return (
                  <div key={row.resource} className="mb-3 last:mb-0 sm:contents">
                    <div className={cn('mb-1 flex min-w-0 items-start gap-2 sm:mb-0', recede && 'opacity-60')}>
                      {Icon ? (
                        <Icon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <span className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0 leading-tight">
                        {meta && <div className="truncate text-sm">{t(meta.labelKey)}</div>}
                        {/* Key and description share the second line; it wraps rather than
                            truncates, since a clipped description is worse than none. The key
                            keeps its own element — it is the row's exact identifier. */}
                        <div className="text-muted-foreground text-[11px] leading-snug">
                          <span className={cn('font-mono', !meta && 'text-foreground text-sm')}>{row.resource}</span>
                          {description && <span> · {description}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-6 sm:pl-0">
                      {row.actions.map((a) => {
                        const risky = a.granted && isEscalationKey(a.key);
                        const changed = editable && original ? original.has(a.key) !== a.granted : false;
                        const tone = a.granted
                          ? risky
                            ? // Amber as fill and border, not as text: `--warning` on the light
                              // ground is 3.08:1, below AA at chip size.
                              'bg-warning/20 text-foreground border-warning/60'
                            : 'bg-primary/10 text-primary border-transparent'
                          : 'border-border text-muted-foreground/70 border-dashed bg-transparent font-normal';
                        const marker = changed && (
                          <span
                            aria-hidden
                            className={cn(
                              'ring-card absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-2',
                              a.granted ? 'bg-success' : 'bg-destructive',
                            )}
                          />
                        );
                        // The pending change rides on `title` (the accessible description), not in
                        // the button's text: a toggle's name must stay put while `aria-pressed`
                        // carries its state, or pressing it renames it.
                        const title = changed
                          ? [a.description, a.granted ? t('pages.roles.chipAdded') : t('pages.roles.chipRemoved')].filter(Boolean).join(' ')
                          : a.description;
                        return editable ? (
                          // A toggle button, not a checkbox: `aria-pressed` is what tells a screen
                          // reader this is on or off, since the state is carried by colour alone.
                          <button
                            key={a.key}
                            type="button"
                            aria-pressed={a.granted}
                            title={title}
                            onClick={() => onToggle?.(a.key)}
                            className={cn(
                              'focus-visible:ring-ring relative inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1',
                              tone,
                              a.granted
                                ? risky
                                  ? 'hover:bg-warning/30'
                                  : 'hover:bg-primary/20'
                                : 'hover:border-primary/40 hover:text-foreground',
                            )}
                          >
                            <span>{a.action}</span>
                            {marker}
                          </button>
                        ) : (
                          <Badge key={a.key} variant="secondary" title={a.description} className={cn('border', tone)}>
                            {a.action}
                          </Badge>
                        );
                      })}
                      {editable && grantToggle(keys, allOn)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
