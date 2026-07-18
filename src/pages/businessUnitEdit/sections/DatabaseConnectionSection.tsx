import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import Can from '../../../components/Can';
import { Plus, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import DbConnectionView from '../../../components/DbConnectionView';
import { dbFieldsToObject } from '../../../utils/dbConnection';
import businessUnitService from '../../../services/businessUnitService';
import { parseApiError } from '../../../utils/errorParser';
import { UNRESOLVED_CLUSTER_ID } from '../../../utils/permissions';
import { CollapsibleSection, ReadOnlyText } from '../shared';
import type { SectionFieldProps } from '../types';

const KNOWN_DB_FIELDS = [
  { key: 'host', label: 'Host', type: 'text' },
  { key: 'port', label: 'Port', type: 'number' },
  { key: 'database', label: 'Database', type: 'text' },
  { key: 'schema', label: 'Schema', type: 'text' },
  { key: 'user', label: 'User', type: 'text' },
  { key: 'password', label: 'Password', type: 'password' },
  { key: 'ssl', label: 'SSL', type: 'boolean' },
] as const;

const KNOWN_KEYS: readonly string[] = KNOWN_DB_FIELDS.map((f) => f.key);

interface DatabaseConnectionSectionProps extends SectionFieldProps {
  // BU id, needed to call the guarded reveal endpoint. Undefined for a new
  // (unsaved) business unit — there is nothing stored yet to reveal.
  businessUnitId?: string;
  onDbFieldChange: (key: string, value: string) => void;
  onDbExtraChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddDbExtraRow: () => void;
  onRemoveDbExtraRow: (index: number) => void;
}

const DatabaseConnectionSection: React.FC<DatabaseConnectionSectionProps> = ({
  formData,
  editing,
  businessUnitId,
  onDbFieldChange,
  onDbExtraChange,
  onAddDbExtraRow,
  onRemoveDbExtraRow,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  // Defense-in-depth: a previously revealed plaintext password must not linger
  // once the admin leaves edit mode — clear it rather than relying on unmount.
  useEffect(() => {
    if (!editing) {
      setRevealedPassword(null);
    }
  }, [editing]);

  const fields = formData.db_connection;
  const valueOf = (key: string) => fields.find((f) => f.key === key)?.value ?? '';
  const extras = fields
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !KNOWN_KEYS.includes(f.key));

  const portValue = valueOf('port');
  const portInvalid = portValue !== '' && !Number.isFinite(Number(portValue));

  // On-demand only — never fetched on mount. The endpoint is server-side gated on
  // cluster.update (fail-closed); the <Can> wrapper below is defense-in-depth, not
  // the security boundary.
  const handleReveal = async () => {
    if (!businessUnitId) return;
    setRevealing(true);
    try {
      const dbConnection = await businessUnitService.revealDbPassword(businessUnitId);
      const raw = dbConnection.password;
      setRevealedPassword(raw == null ? '' : String(raw));
    } catch (err) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setRevealing(false);
    }
  };

  if (!editing) {
    return (
      <CollapsibleSection title="Database Connection" description="Database connection configuration (JSON)" forceOpen>
        <div className="space-y-2">
          <Label htmlFor="db_connection">Connection Config</Label>
          <DbConnectionView value={JSON.stringify(dbFieldsToObject(fields))} />
        </div>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Database Connection" description="Database connection configuration" forceOpen>
      <div className="space-y-4">
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          {KNOWN_DB_FIELDS.map((field) => {
            if (field.type === 'boolean') {
              return (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  <label className="flex h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={valueOf(field.key) === 'true'}
                      onChange={(e) => onDbFieldChange(field.key, e.target.checked ? 'true' : 'false')}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-muted-foreground">Enabled</span>
                  </label>
                </div>
              );
            }
            if (field.type === 'password') {
              return (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`db_${field.key}`}>{field.label}</Label>
                  <div className="relative">
                    <Input
                      id={`db_${field.key}`}
                      type={showPassword ? 'text' : 'password'}
                      value={valueOf(field.key)}
                      onChange={(e) => onDbFieldChange(field.key, e.target.value)}
                      placeholder={field.label}
                      className="pr-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-9 w-9"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Reveal password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {/* Write-only: the server never returns a real password value (redacted
                      to '' on every read), so a blank field here does not mean "clearing"
                      it on save — dbFieldsToObject already omits blank values from the
                      save payload, and the backend preserves the stored password. */}
                  <p className="text-xs text-muted-foreground">
                    Leave blank to keep the current password.
                  </p>
                  {businessUnitId && (
                    // formData.cluster_id can be empty for a cluster-less BU — fall back to
                    // the UNRESOLVED_CLUSTER_ID sentinel so the check stays on checkPermission's
                    // scoped branch (fail closed) instead of falling through to its broad
                    // "any cluster" branch (fail open on cluster.update held elsewhere).
                    <Can permission="cluster.update" clusterId={formData.cluster_id || UNRESOLVED_CLUSTER_ID}>
                      <div className="space-y-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleReveal}
                          disabled={revealing}
                        >
                          {revealing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {revealing ? 'Revealing…' : 'Reveal current password'}
                        </Button>
                        {revealedPassword !== null && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Current stored password</Label>
                            <ReadOnlyText value={revealedPassword || '(empty)'} />
                          </div>
                        )}
                      </div>
                    </Can>
                  )}
                </div>
              );
            }
            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`db_${field.key}`}>{field.label}</Label>
                <Input
                  id={`db_${field.key}`}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={valueOf(field.key)}
                  onChange={(e) => onDbFieldChange(field.key, e.target.value)}
                  placeholder={field.label}
                />
                {field.key === 'port' && portInvalid && (
                  <p className="text-xs text-destructive">Port must be a number.</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className="text-xs text-muted-foreground">Additional fields</Label>
          {extras.map(({ f, i }) => (
            <div key={i} className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-end">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input value={f.key} onChange={(e) => onDbExtraChange(i, 'key', e.target.value)} placeholder="Key" />
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input value={f.value} onChange={(e) => onDbExtraChange(i, 'value', e.target.value)} placeholder="Value" />
                {f.value.trim() !== '' && f.key.trim() === '' && (
                  <p className="text-xs text-destructive">Key is required.</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemoveDbExtraRow(i)}
                aria-label="Remove field"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={onAddDbExtraRow}>
            <Plus className="mr-2 h-4 w-4" />
            Add field
          </Button>
        </div>
      </div>
    </CollapsibleSection>
  );
};

export default DatabaseConnectionSection;
