import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AuditMeta } from './AuditMeta';
import type { NormalizedAudit } from '../utils/audit';
import { useI18n } from '../hooks/useI18n';

export function PageHeader({
  title, subtitle, actions, backTo, beforeTitle, audit, now,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  backTo?: string;
  beforeTitle?: React.ReactNode;
  // แถบ "ใครสร้าง/แก้เมื่อไหร่" ใต้ subtitle — ส่งผลลัพธ์ของ normalizeAudit(record) เข้ามา
  audit?: NormalizedAudit;
  now?: Date;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <Link
            to={backTo}
            aria-label={t('common.action.back')}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted text-muted-foreground shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        {beforeTitle}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {audit && <AuditMeta variant="header" audit={audit} now={now} />}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
