import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import Can from '../../../components/Can';
import { Loader2 } from 'lucide-react';
import databasePoolService from '../../../services/databasePoolService';
import { getErrorDetail } from '../../../utils/errorParser';
import { CollapsibleSection, ReadOnlyText, selectClassName } from '../shared';
import { useI18n } from '../../../hooks/useI18n';
import type { DatabasePool } from '../../../types';
import type { SectionFieldProps } from '../types';

interface DatabaseConnectionSectionProps extends SectionFieldProps {
  onPoolChange: (field: 'database_pool_id' | 'db_schema', value: string) => void;
}

type PoolPickerProps = Pick<DatabaseConnectionSectionProps, 'formData' | 'fieldErrors' | 'onBlur' | 'onPoolChange'>;

/**
 * The pool dropdown, and the fetch that feeds it, split out of the section so the
 * `useEffect` calling `databasePoolService.getAll` only ever mounts inside
 * `<Can permission="database_pool.read">`. That keeps `Can` the single source of
 * permission truth — there is no second "database_pool.read" string to keep in sync
 * with the JSX gate, and a user without the permission never even issues the request
 * (which would otherwise 403 and pop a toast despite the fallback view rendering fine).
 */
const PoolPicker: React.FC<PoolPickerProps> = ({ formData, fieldErrors, onBlur, onPoolChange }) => {
  const { t } = useI18n();
  const [pools, setPools] = useState<DatabasePool[]>([]);
  const [loadingPools, setLoadingPools] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
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
        toast.error(getErrorDetail(err, t));
      })
      .finally(() => {
        if (!cancelled) setLoadingPools(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount-once fetch: adding `t` here would refetch the pool list on every language
    // switch. Nothing in the effect renders translated text, so there is nothing to
    // re-resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pool ที่ผูกอยู่แต่ถูกปิดใช้งานต้องยังอยู่ในตัวเลือก ไม่งั้นจะดูเหมือนไม่เคยตั้งค่า
  const activePools = pools.filter((p) => p.is_active);
  const current = pools.find((p) => p.id === formData.database_pool_id);
  // pool ที่ผูกอยู่แต่ไม่อยู่ในหน้าที่โหลดมา (perpage: 200) ก็ต้องสังเคราะห์ตัวเลือกขึ้นมาเอง
  // ไม่งั้น <select value={id}> จะหาตัวเลือกที่ตรงกันไม่เจอ แล้ว browser จะเลือกตัวแรกให้แทน
  // ทั้งที่ formData.database_pool_id ไม่ได้เปลี่ยน — จอจะโกหกว่ายังไม่ได้ตั้งค่า
  const missingCurrent: DatabasePool | null =
    !current && formData.database_pool_id
      ? {
          id: formData.database_pool_id,
          name: formData.database_pool_name || formData.database_pool_id,
          host: '',
          port: 0,
          database: '',
          username: '',
          is_active: true,
        }
      : null;
  const options = current
    ? current.is_active
      ? activePools
      : [current, ...activePools]
    : missingCurrent
      ? [missingCurrent, ...activePools]
      : activePools;

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="database_pool_id">{t('common.label.databasePool')}</Label>
        {loadingPools ? (
          <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('pages.businessUnits.loadingPoolsText')}
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
            <option value="">{t('pages.businessUnits.notSetOption')}</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.is_active ? '' : t('pages.businessUnits.inactiveSuffix')}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="db_schema">{t('pages.businessUnits.schemaLabel')}</Label>
        <Input
          id="db_schema"
          name="db_schema"
          value={formData.db_schema}
          onChange={(e) => onPoolChange('db_schema', e.target.value)}
          onBlur={onBlur}
          placeholder={t('pages.businessUnits.schemaPlaceholder')}
          className={fieldErrors.db_schema ? 'border-destructive' : ''}
        />
        {fieldErrors.db_schema && (
          <p className="text-xs text-destructive">{fieldErrors.db_schema}</p>
        )}
      </div>
    </div>
  );
};

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
  const { t } = useI18n();
  const readOnlyView = (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
      <div className="space-y-2">
        <Label>{t('common.label.databasePool')}</Label>
        <ReadOnlyText value={formData.database_pool_name} />
      </div>
      <div className="space-y-2">
        <Label>{t('pages.businessUnits.schemaLabel')}</Label>
        <ReadOnlyText value={formData.db_schema} />
      </div>
    </div>
  );

  if (!editing) {
    return (
      <CollapsibleSection title={t('pages.businessUnits.databaseConnectionTitle')} description={t('pages.businessUnits.databaseConnectionDescription')} forceOpen>
        {readOnlyView}
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title={t('pages.businessUnits.databaseConnectionTitle')} description={t('pages.businessUnits.databaseConnectionDescription')} forceOpen>
      <Can permission="database_pool.read" fallback={
        <div className="space-y-3">
          {readOnlyView}
          <p className="text-xs text-muted-foreground">
            {t('pages.businessUnits.databasePoolPermissionRequired')}
          </p>
        </div>
      }>
        <PoolPicker
          formData={formData}
          fieldErrors={fieldErrors}
          onBlur={onBlur}
          onPoolChange={onPoolChange}
        />
      </Can>
    </CollapsibleSection>
  );
};

export default DatabaseConnectionSection;
