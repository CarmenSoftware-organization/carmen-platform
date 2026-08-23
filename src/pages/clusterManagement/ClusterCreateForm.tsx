import { Loader2, Save } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import type { ClusterFormData } from './ClusterIdentityFields';

export interface ClusterCreateFormProps {
  formData: ClusterFormData;
  fieldErrors: Record<string, string>;
  saving: boolean;
  formRef: React.RefObject<HTMLFormElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  onNoExpiryChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

/** Today as `yyyy-mm-dd` in the user's own timezone — the floor for a licence's end date. */
const todayLocal = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Everything needed to create a cluster, in two sections because it creates two things.
 *
 * `POST /api-system/clusters` writes the cluster record and `initial_license`, a BU-quota
 * licence carrying its own quantity and expiry. They get a card each: two objects with two
 * lifetimes, since the code and the name stay put while the licence is superseded from the
 * License Center the first time the quota changes. Each card is titled, and only the licence
 * carries a description — the sentence under it states a consequence ("it can create none"),
 * which is the one thing on this page a reader can get wrong without being told.
 *
 * Field widths are the content's, not the container's. A three-character alias and a date in a
 * box eight hundred pixels wide is the form telling you it has no idea what you are about to
 * type into it.
 */
export function ClusterCreateForm({
  formData,
  fieldErrors,
  saving,
  formRef,
  onChange,
  onBlur,
  onFocus,
  onNoExpiryChange,
  onSubmit,
  onCancel,
}: ClusterCreateFormProps) {
  const noExpiry = !!formData.license_no_expiry;

  return (
    /* `color-scheme` is declared nowhere in the app, so it computes to `normal` and every
     * native control — the licence card's checkbox and date input included — renders in its
     * light form on a dark page. An unchecked checkbox comes out a solid white square, the
     * brightest thing on the page. Scoped to this form rather than fixed in `.dark` globally:
     * `color-scheme` inherits, so one declaration in `index.css` would repaint every native
     * control on ~40 pages at once, which is a change to make deliberately, not in passing. */
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4 dark:[color-scheme:dark]">
      <Card>
        <h2 className="text-sm font-medium">Identity</h2>

        {/* All three on one row, in the order the plate above reads them. Stacked, the code
         *  and the alias each claimed a line of their own and left two thirds of the card
         *  empty beside them; the name takes that width instead, which is the only one of the
         *  three that can use it. */}
        <div className="flex flex-wrap gap-4">
          {/* Mobile-first: below `sm` the code stretches so the alias can sit beside it rather
           *  than being pushed onto a line of its own with 230px of dead space next to a field
           *  that holds three characters. Capped at the same 224px it takes on a wide screen —
           *  between 596 and 640px there is room to spare, and a code field four hundred
           *  pixels wide breaks the rule the rest of this form follows. */}
          <div className="min-w-0 max-w-56 flex-1 space-y-2 sm:w-56 sm:flex-none">
            <Label htmlFor="code">Code *</Label>
            <Input
              id="code"
              name="code"
              value={formData.code}
              onChange={onChange}
              onBlur={onBlur}
              onFocus={onFocus}
              placeholder="Cluster code"
              className={`font-mono ${fieldErrors.code ? 'border-destructive' : ''}`}
              required
            />
            {fieldErrors.code && <p className="text-destructive text-xs">{fieldErrors.code}</p>}
          </div>

          <div className="w-24 space-y-2">
            <Label htmlFor="alias_name">Alias</Label>
            {/* An example, not the constraint: `maxLength` already enforces three characters,
             *  so the placeholder's job is to show what one looks like. */}
            <Input
              id="alias_name"
              name="alias_name"
              value={formData.alias_name}
              onChange={onChange}
              onBlur={onBlur}
              onFocus={onFocus}
              placeholder="PEN"
              maxLength={3}
              className={`font-mono ${fieldErrors.alias_name ? 'border-destructive' : ''}`}
            />
            {fieldErrors.alias_name && (
              <p className="text-destructive text-xs">{fieldErrors.alias_name}</p>
            )}
          </div>

          <div className="w-full space-y-2 sm:min-w-64 sm:flex-1">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={onChange}
              placeholder="Cluster name"
              required
            />
          </div>
        </div>
      </Card>

      <Card>
        <div>
          <h2 className="text-sm font-medium">First quota licence</h2>
          <p className="text-muted-foreground text-xs">
            Sets how many business units this cluster may create. Without one it can create none.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="w-28 space-y-2">
            <Label htmlFor="licensed_bus">Business units *</Label>
            <Input
              id="licensed_bus"
              name="licensed_bus"
              type="number"
              min={1}
              value={formData.licensed_bus}
              onChange={onChange}
              placeholder="e.g. 5"
              className="tabular-nums"
              required
            />
          </div>

          <div className="space-y-2">
            {/* The marker tracks the actual constraint: a disabled input is barred from
             *  validation, so "Expires *" over a greyed-out box asks for something the form
             *  will not ask for. */}
            <Label htmlFor="license_end_date">Expires{noExpiry ? '' : ' *'}</Label>
            {/* The date input stays mounted and goes disabled rather than unmounting, so
             *  ticking the box does not yank the row out from under the pointer. */}
            <div className="flex items-center gap-3">
              <Input
                id="license_end_date"
                name="license_end_date"
                type="date"
                min={todayLocal()}
                value={formData.license_end_date}
                onChange={onChange}
                disabled={noExpiry}
                className="w-44"
                required
              />
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  className="border-input h-4 w-4 rounded"
                  checked={noExpiry}
                  onChange={(e) => onNoExpiryChange(e.target.checked)}
                  aria-label="Never expires"
                />
                Never expires
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* One accent on the page. Cancel is ghost, not outline: two bordered buttons side by
       *  side read as a choice between equals, and this one is not. */}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? 'Creating...' : 'Create cluster'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
