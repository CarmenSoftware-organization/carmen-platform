import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useI18n } from '../hooks/useI18n';
import { useBackendVersion } from '../hooks/useBackendVersion';
import { BUILD_SHA, CURRENT_VERSION } from './VersionBadge';

interface VersionStampProps {
  /** ปิดเมื่ออยู่บนหน้า changelog เอง — ลิงก์ไปหน้าที่กำลังเปิดอยู่ไม่มีประโยชน์ */
  linkChangelog?: boolean;
  className?: string;
}

/**
 * เวอร์ชันของสองฝั่งอยู่คู่กัน เพราะคำถามที่คนมองหาจริงคือหน้าเว็บกับหลังบ้านตรงรุ่นกันไหม
 * ไม่ใช่รุ่นของฝั่งใดฝั่งหนึ่งลอย ๆ แถวแอปลิงก์ไป changelog ส่วนรุ่นหลังบ้านไม่มีปลายทางให้กด
 * และหายไปเงียบ ๆ เมื่อดึงไม่สำเร็จ — เป็นข้อมูลประกอบ ไม่ใช่ความล้มเหลวที่ผู้ใช้ต้องรับรู้
 */
const VersionStamp = ({ linkChangelog = true, className }: VersionStampProps) => {
  const { t } = useI18n();
  const backendVersion = useBackendVersion();
  const appLabel = `${t('header.appVersion')} v${CURRENT_VERSION}`;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground',
        className,
      )}
    >
      {linkChangelog ? (
        <Link to="/changelog" className="hover:text-foreground" title={t('header.viewChangelog')}>
          {appLabel}
        </Link>
      ) : (
        <span>{appLabel}</span>
      )}
      {BUILD_SHA && <span title={import.meta.env.REACT_APP_BUILD_DATE}>{BUILD_SHA}</span>}
      {backendVersion && (
        <>
          <span aria-hidden>·</span>
          <span title={backendVersion.build ?? backendVersion.commit}>
            {t('header.apiVersion')} v{backendVersion.version}
          </span>
        </>
      )}
    </div>
  );
};

export default VersionStamp;
