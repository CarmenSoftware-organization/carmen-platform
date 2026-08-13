import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import Can from '../../../components/Can';
import { Loader2 } from 'lucide-react';
import databasePoolService from '../../../services/databasePoolService';
import { getErrorDetail } from '../../../utils/errorParser';
import { CollapsibleSection, ReadOnlyText, selectClassName } from '../shared';
import type { DatabasePool } from '../../../types';
import type { SectionFieldProps } from '../types';

interface DatabaseConnectionSectionProps extends SectionFieldProps {
  onPoolChange: (field: 'database_pool_id' | 'db_schema', value: string) => void;
}

/**
 * BU ไม่ถือ credential อีกต่อไป — เลือก pool ที่ใช้ร่วมกันแล้วระบุ schema ของตัวเอง
 *
 * โหมดอ่านไม่เรียก API เลย: BU response ส่ง `database_pool: { id, name }` มาให้แล้ว
 * คนที่ไม่มี `database_pool.read` จึงยังเห็นว่า BU นี้ผูกกับ pool ชื่ออะไร แต่แก้ไม่ได้
 * — host/port/username ของ pool ไม่ถูกแสดงที่นี่โดยตั้งใจ
 */
const DatabaseConnectionSection: React.FC<DatabaseConnectionSectionProps> = ({
  formData,
  editing,
  fieldErrors,
  onBlur,
  onPoolChange,
}) => {
  const [pools, setPools] = useState<DatabasePool[]>([]);
  const [loadingPools, setLoadingPools] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // โหลดตอนเข้าโหมดแก้เท่านั้น ไม่ใช่ตอน mount — โหมดอ่านไม่ต้องใช้รายการนี้
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoadingPools(true);
    setLoadFailed(false);
    databasePoolService
      .getAll({ page: 1, perpage: 200, sort: 'name:asc' })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setPools(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error(getErrorDetail(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingPools(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing]);

  const readOnlyView = (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
      <div className="space-y-2">
        <Label>Database Pool</Label>
        <ReadOnlyText value={formData.database_pool_name} />
      </div>
      <div className="space-y-2">
        <Label>Schema</Label>
        <ReadOnlyText value={formData.db_schema} />
      </div>
    </div>
  );

  if (!editing) {
    return (
      <CollapsibleSection title="Database Connection" description="Shared database pool and schema" forceOpen>
        {readOnlyView}
      </CollapsibleSection>
    );
  }

  // pool ที่ผูกอยู่แต่ถูกปิดใช้งานต้องยังอยู่ในตัวเลือก ไม่งั้นจะดูเหมือนไม่เคยตั้งค่า
  const activePools = pools.filter((p) => p.is_active);
  const current = pools.find((p) => p.id === formData.database_pool_id);
  const options = current && !current.is_active ? [current, ...activePools] : activePools;

  return (
    <CollapsibleSection title="Database Connection" description="Shared database pool and schema" forceOpen>
      <Can permission="database_pool.read" fallback={
        <div className="space-y-3">
          {readOnlyView}
          <p className="text-xs text-muted-foreground">
            Changing the database pool requires a platform-level permission.
          </p>
        </div>
      }>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="database_pool_id">Database Pool</Label>
            {loadingPools ? (
              <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading pools…
              </div>
            ) : loadFailed ? (
              <ReadOnlyText value={formData.database_pool_name} />
            ) : (
              <select
                id="database_pool_id"
                value={formData.database_pool_id}
                onChange={(e) => onPoolChange('database_pool_id', e.target.value)}
                className={selectClassName}
              >
                <option value="">— Not set —</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.is_active ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="db_schema">Schema</Label>
            <Input
              id="db_schema"
              name="db_schema"
              value={formData.db_schema}
              onChange={(e) => onPoolChange('db_schema', e.target.value)}
              onBlur={onBlur}
              placeholder="cbr_prod"
              className={fieldErrors.db_schema ? 'border-destructive' : ''}
            />
            {fieldErrors.db_schema && (
              <p className="text-xs text-destructive">{fieldErrors.db_schema}</p>
            )}
          </div>
        </div>
      </Can>
    </CollapsibleSection>
  );
};

export default DatabaseConnectionSection;
