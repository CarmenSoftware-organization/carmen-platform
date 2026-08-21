import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ReadOnlyField } from '../../components/ReadOnlyField';

export interface ClusterFormData {
  code: string;
  name: string;
  alias_name: string;
  /**
   * Superseded by dated licence rows (`bu_cap`/`bu_used` on the cluster response) — a bare
   * cap number can no longer express "unlimited" (there is no unlimited any more) or an
   * expiry date. Kept optional, and no longer read or rendered by this component or
   * `DetailsSection`, purely so `clusterAdmin/ClusterProfile.tsx` — which still sends it to
   * the backend for compatibility — keeps compiling against this shared type.
   */
  max_license_bu?: string;
  is_active: boolean;
  /** Create-mode only: the quota issued as the cluster's first BU-quota licence. */
  licensed_bus?: string;
  license_end_date?: string;
  license_no_expiry?: boolean;
}

interface ClusterIdentityFieldsProps {
  formData: ClusterFormData;
  fieldErrors: Record<string, string>;
  /** false ⇒ every field renders its read-only mode (A4 two-mode field contract). */
  editing: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  /**
   * Create-mode only — toggles whether the first licence's quota expires. Optional: the
   * licence block below only renders when this is supplied, so any other caller of this
   * shared component is unaffected.
   */
  onNoExpiryChange?: (v: boolean) => void;
}

/**
 * The cluster identity fields. Every field renders **two modes** — an editable
 * control when `editing`, and a `ReadOnlyField` (or `Badge` for status) otherwise.
 * This is the A4 pattern CLAUDE.md points other Edit pages at: the section stays
 * mounted in both modes, only the controls swap.
 */
export function ClusterIdentityFields({
  formData,
  fieldErrors,
  editing,
  onChange,
  onBlur,
  onFocus,
  onNoExpiryChange,
}: ClusterIdentityFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="code">Code {editing && '*'}</Label>
          {editing ? (
            <>
              <Input
                id="code"
                name="code"
                value={formData.code}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Cluster code"
                className={fieldErrors.code ? 'border-destructive' : ''}
                required
              />
              {fieldErrors.code && <p className="text-destructive text-xs">{fieldErrors.code}</p>}
            </>
          ) : (
            <ReadOnlyField value={formData.code} className="font-mono" />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="alias_name">Alias name</Label>
          {editing ? (
            <>
              <Input
                id="alias_name"
                name="alias_name"
                value={formData.alias_name}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Max 3 chars"
                maxLength={3}
                className={fieldErrors.alias_name ? 'border-destructive' : ''}
              />
              {fieldErrors.alias_name && <p className="text-destructive text-xs">{fieldErrors.alias_name}</p>}
            </>
          ) : (
            <ReadOnlyField value={formData.alias_name} className="font-mono" />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name {editing && '*'}</Label>
        {editing ? (
          <Input id="name" name="name" value={formData.name} onChange={onChange} placeholder="Cluster name" required />
        ) : (
          <ReadOnlyField value={formData.name} />
        )}
      </div>

      {onNoExpiryChange && (
        <>
          <div className="space-y-2">
            <Label htmlFor="licensed_bus">Licensed business units</Label>
            <Input
              id="licensed_bus"
              name="licensed_bus"
              type="number"
              min={1}
              value={formData.licensed_bus}
              onChange={onChange}
              placeholder="e.g. 5"
              required
            />
            <p className="text-xs text-muted-foreground">
              Issued as the cluster's first quota licence. A cluster without one cannot create business units.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="license_end_date">Quota expires</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={formData.license_no_expiry}
                onChange={(e) => onNoExpiryChange(e.target.checked)}
                aria-label="No expiry"
              />
              No expiry
            </label>
            {!formData.license_no_expiry && (
              <Input
                id="license_end_date"
                name="license_end_date"
                type="date"
                value={formData.license_end_date}
                onChange={onChange}
                required
              />
            )}
          </div>
        </>
      )}

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            name="is_active"
            checked={formData.is_active}
            onChange={onChange}
            className="border-input h-4 w-4 rounded"
          />
          <Label htmlFor="is_active">Active</Label>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Status</Label>
          <div>
            <Badge variant={formData.is_active ? 'success' : 'secondary'}>
              {formData.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
