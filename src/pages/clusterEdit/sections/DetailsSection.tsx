import { InlineField } from '../../businessUnitEdit/InlineField';
import type { ClusterFormData } from '../../clusterManagement/ClusterIdentityFields';

export interface DetailsSectionProps {
  formData: ClusterFormData;
  fieldErrors: Record<string, string>;
  canEdit: boolean;
  onCommit: (name: string, value: string) => void;
  onValidate: (name: string, value: string) => void;
}

/**
 * Identity + licensing as an edit-in-place document. There is no Edit toggle: the
 * `cluster.update` gate lives here as `disabled={!canEdit}` on each field, so a user
 * without the permission sees values but cannot open any editor.
 */
export function DetailsSection({
  formData,
  fieldErrors,
  canEdit,
  onCommit,
  onValidate,
}: DetailsSectionProps) {
  const disabled = !canEdit;
  return (
    <div className="divide-y">
      <InlineField
        name="code"
        label="Code"
        value={formData.code}
        mono
        required
        disabled={disabled}
        error={fieldErrors.code}
        onCommit={onCommit}
        onValidate={onValidate}
      />
      <InlineField
        name="name"
        label="Name"
        value={formData.name}
        required
        disabled={disabled}
        error={fieldErrors.name}
        onCommit={onCommit}
        onValidate={onValidate}
      />
      <InlineField
        name="alias_name"
        label="Alias name"
        value={formData.alias_name}
        mono
        disabled={disabled}
        placeholder="Max 3 chars"
        error={fieldErrors.alias_name}
        onCommit={onCommit}
        onValidate={onValidate}
      />
      <InlineField
        name="max_license_bu"
        label="Max licensed BUs"
        value={formData.max_license_bu}
        type="number"
        mono
        disabled={disabled}
        placeholder="Unlimited"
        error={fieldErrors.max_license_bu}
        onCommit={onCommit}
        onValidate={onValidate}
      />
      <InlineField
        name="is_active"
        label="Status"
        type="select"
        disabled={disabled}
        value={formData.is_active ? 'true' : 'false'}
        options={[
          { value: 'true', label: 'Active' },
          { value: 'false', label: 'Inactive' },
        ]}
        onCommit={onCommit}
      />
    </div>
  );
}
