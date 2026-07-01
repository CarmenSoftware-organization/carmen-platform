import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { CollapsibleSection, ReadOnlyText, ReadOnlyTextarea, selectClassName } from '../shared';
import { ReadOnlyField } from '../../../components/ReadOnlyField';
import type { Cluster } from '../../../types';
import type { SectionFieldProps } from '../types';

interface BasicInfoSectionProps extends SectionFieldProps {
  clusters: Cluster[];
  getClusterName: (clusterId: string) => string;
}

const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({ formData, editing, fieldErrors, onChange, onBlur, onFocus, clusters, getClusterName }) => (
  <CollapsibleSection title="Basic Information" description="Core business unit details" defaultOpen={true} forceOpen>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cluster_id">Cluster {editing && '*'}</Label>
        {editing ? (
          <select
            id="cluster_id"
            name="cluster_id"
            value={formData.cluster_id}
            onChange={onChange}
            required
            className={selectClassName}
          >
            <option value="">Select a cluster</option>
            {clusters.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.name}
              </option>
            ))}
          </select>
        ) : (
          <ReadOnlyText value={getClusterName(formData.cluster_id)} />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="code">Code {editing && '*'}</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="code"
                name="code"
                value={formData.code}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Business unit code"
                className={fieldErrors.code ? 'border-destructive' : ''}
                required
              />
              {fieldErrors.code && (
                <p className="text-xs text-destructive">{fieldErrors.code}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={formData.code} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name {editing && '*'}</Label>
          {editing ? (
            <Input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={onChange}
              placeholder="Business unit name"
              required
            />
          ) : (
            <ReadOnlyText value={formData.name} />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="alias_name">Alias Name</Label>
        {editing ? (
          <Input
            type="text"
            id="alias_name"
            name="alias_name"
            value={formData.alias_name}
            onChange={onChange}
            placeholder="Alias name (optional)"
          />
        ) : (
          <ReadOnlyText value={formData.alias_name} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        {editing ? (
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={onChange}
            rows={3}
            placeholder="Business unit description (optional)"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        ) : (
          <ReadOnlyTextarea value={formData.description} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="max_license_users">Max Licensed Users</Label>
        {editing ? (
          <>
            <Input
              type="number"
              id="max_license_users"
              name="max_license_users"
              value={formData.max_license_users}
              onChange={onChange}
              onBlur={onBlur}
              onFocus={onFocus}
              placeholder="Unlimited"
              min={0}
              className={fieldErrors.max_license_users ? 'border-destructive' : ''}
            />
            {fieldErrors.max_license_users && (
              <p className="text-xs text-destructive">{fieldErrors.max_license_users}</p>
            )}
          </>
        ) : (
          <ReadOnlyField value={formData.max_license_users || 'Unlimited'} />
        )}
      </div>

      <div className="flex items-center gap-4">
        {editing ? (
          <>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_hq"
                name="is_hq"
                checked={formData.is_hq}
                onChange={onChange}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_hq">Headquarters (HQ)</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                checked={formData.is_active}
                onChange={onChange}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Label>Headquarters (HQ)</Label>
              <Badge variant={formData.is_hq ? 'success' : 'secondary'} className="ml-1">
                {formData.is_hq ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Label>Status</Label>
              <Badge variant={formData.is_active ? 'success' : 'secondary'} className="ml-1">
                {formData.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </>
        )}
      </div>
    </div>
  </CollapsibleSection>
);

export default BasicInfoSection;
