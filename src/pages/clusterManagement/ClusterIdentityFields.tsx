import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ReadOnlyField } from '../../components/ReadOnlyField';

export interface ClusterFormData {
  code: string;
  name: string;
  alias_name: string;
  max_license_bu: string;
  is_active: boolean;
}

interface ClusterIdentityFieldsProps {
  formData: ClusterFormData;
  fieldErrors: Record<string, string>;
  /** false ⇒ every field renders its read-only mode (A4 two-mode field contract). */
  editing: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
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

      <div className="space-y-2">
        <Label htmlFor="max_license_bu">Max licensed BUs</Label>
        {editing ? (
          <>
            <Input
              type="number"
              id="max_license_bu"
              name="max_license_bu"
              value={formData.max_license_bu}
              onChange={onChange}
              onBlur={onBlur}
              onFocus={onFocus}
              placeholder="Unlimited"
              min={0}
              className={fieldErrors.max_license_bu ? 'border-destructive' : ''}
            />
            {fieldErrors.max_license_bu && <p className="text-destructive text-xs">{fieldErrors.max_license_bu}</p>}
          </>
        ) : (
          // Empty means "no cap" here, not "no value" — so say so rather than showing ReadOnlyField's '-'.
          <ReadOnlyField value={formData.max_license_bu || 'Unlimited'} className="tabular-nums" />
        )}
      </div>

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
