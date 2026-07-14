import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

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
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/** The editable cluster identity fields — shared by the create form and the edit dialog. */
export function ClusterIdentityFields({ formData, fieldErrors, onChange, onBlur, onFocus }: ClusterIdentityFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="code">Code *</Label>
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="alias_name">Alias name</Label>
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
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" name="name" value={formData.name} onChange={onChange} placeholder="Cluster name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="max_license_bu">Max licensed BUs</Label>
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
      </div>

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
    </div>
  );
}
