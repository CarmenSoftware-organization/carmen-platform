import { InlineField } from '../../businessUnitEdit/InlineField';
import type { ClusterFormData } from '../../clusterManagement/ClusterIdentityFields';

export interface DetailsSectionProps {
  formData: ClusterFormData;
  fieldErrors: Record<string, string>;
  canEdit: boolean;
  /**
   * Platform-only fields are a platform decision — the server silently strips
   * `max_license_bu`, `max_license_users`, `is_active`, and `info` from a membership admin's
   * cluster update (no error, just a discarded write). This component only renders two of
   * those (`max_license_bu`, `is_active`); both are gated behind this flag rather than plain
   * `canEdit` so an admin never sees an editable control that the server will quietly ignore.
   * Defaults to canEdit so existing call sites are unchanged.
   */
  canEditPlatformFields?: boolean;
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
  canEditPlatformFields = canEdit,
  onCommit,
  onValidate,
}: DetailsSectionProps) {
  const disabled = !canEdit;
  const platformFieldsDisabled = !canEditPlatformFields;
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
        disabled={platformFieldsDisabled}
        placeholder="Unlimited"
        error={fieldErrors.max_license_bu}
        onCommit={onCommit}
        onValidate={onValidate}
      />
      <InlineField
        name="is_active"
        label="Status"
        type="select"
        disabled={platformFieldsDisabled}
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
