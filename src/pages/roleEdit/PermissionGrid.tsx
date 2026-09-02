import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';

export interface PermissionGridAction {
  key: string;
  action: string;
  description?: string;
  granted: boolean;
}

export interface PermissionGridRow {
  resource: string;
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
  /** Grants or clears a whole resource at once. Only meaningful alongside `onToggle`. */
  onToggleResource?: (keys: string[], allOn: boolean) => void;
}

/**
 * The role's grant, as one document.
 *
 * Read and edit used to be two different layouts over the same data — a flat two-column grid
 * to read, a stack of bordered `<details>` accordions to edit, each defaulting to collapsed
 * for any resource the role held nothing in. Pressing Edit therefore reflowed the whole page
 * and hid, behind a disclosure triangle, exactly the resources you were most likely opening
 * the editor to grant. (It also put a card inside a card, and its `open` attribute only ever
 * applied on first render, so sections stopped tracking their own contents as you clicked.)
 *
 * Every catalog row is present in both modes, granted or not: what a role cannot reach is
 * half of an access review, and it is also the half you edit.
 */
export function PermissionGrid({ rows, onToggle, onToggleResource }: PermissionGridProps) {
  const { t } = useI18n();
  const editable = Boolean(onToggle);

  return (
    // The two columns only exist from `sm` up. At 390px a name as long as
    // `license_feature_group` leaves ~130px for the verbs, so a four-action resource wraps to
    // four lines and the shape stops being readable — below `sm` each row stacks instead
    // (`sm:contents` hands the pair back to the grid once there is room for it).
    //
    // One grid for the whole list: the tracks are the container's, so every row shares them.
    // A grid per row would size its own resource column and stagger the verbs across rows.
    // Both tracks hug their content rather than the second one taking `1fr`: read mode has no
    // rail beside it, and a stretched verb column left ~540px of empty track after the last
    // chip on every row, which reads as a column that failed to fill rather than as margin.
    // `minmax(0, …)` keeps them shrinkable, so the verbs still wrap on a narrow card.
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,max-content)_minmax(0,max-content)] sm:items-baseline sm:gap-x-4 sm:gap-y-2">
      {rows.map((row) => {
        const keys = row.actions.map((a) => a.key);
        const allOn = row.grantedCount === row.total;
        return (
          <div key={row.resource} className="mb-3 last:mb-0 sm:contents">
            {/* A resource this role cannot touch at all recedes with its verbs — still
                counted and still in place, but never competing with the resources the role
                actually reaches. It stays legible while editing, where it is a target. */}
            <span
              className={cn(
                'mb-1 block font-mono text-sm sm:mb-0',
                row.grantedCount === 0 && !editable && 'text-muted-foreground/60',
              )}
            >
              {row.resource}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {row.actions.map((a) =>
                editable ? (
                  // A toggle button, not a checkbox: `aria-pressed` is what tells a screen
                  // reader this is on or off, since the state is carried by colour alone.
                  <button
                    key={a.key}
                    type="button"
                    aria-pressed={a.granted}
                    title={a.description}
                    onClick={() => onToggle?.(a.key)}
                    className={cn(
                      'focus-visible:ring-ring inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1',
                      a.granted
                        ? 'bg-primary/10 text-primary hover:bg-primary/20 border border-transparent'
                        : 'border-border text-muted-foreground/70 hover:border-primary/40 hover:text-foreground border border-dashed',
                    )}
                  >
                    {a.action}
                  </button>
                ) : (
                  <Badge
                    key={a.key}
                    variant="secondary"
                    title={a.description}
                    className={
                      a.granted
                        ? 'border-transparent bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground/60 border border-dashed bg-transparent font-normal'
                    }
                  >
                    {a.action}
                  </Badge>
                ),
              )}
              {/* Inline after the last verb rather than in a column of its own: a third track
                  would be pushed to the card's right edge, reopening the ~400px of dead space
                  between the verbs and it that this layout exists to close. */}
              {editable && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-primary ml-1 text-xs hover:underline"
                  onClick={() => onToggleResource?.(keys, allOn)}
                >
                  {allOn ? t('common.action.grantNone') : t('common.action.grantAll')}
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
