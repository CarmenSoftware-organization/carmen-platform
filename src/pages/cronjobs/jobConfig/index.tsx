import type {
  ActivityRetentionJobConfig,
  ActivityRollupJobConfig,
  CleanupJobConfig,
  CronJobConfig,
  CronJobType,
  DashboardRefreshJobConfig,
  NotificationJobConfig,
  ReportJobConfig,
} from '../../../types';
import ReportConfigFields from './ReportConfigFields';
import NotificationConfigFields from './NotificationConfigFields';
import CleanupConfigFields from './CleanupConfigFields';
import DashboardRefreshConfigFields from './DashboardRefreshConfigFields';
import ActivityRollupConfigFields from './ActivityRollupConfigFields';
import ActivityRetentionConfigFields from './ActivityRetentionConfigFields';

export interface JobConfigFieldsProps<T = CronJobConfig> {
  value: T;
  onChange: (next: T) => void;
  readOnly?: boolean;
  fieldErrors?: Record<string, string>;
}

interface Props extends JobConfigFieldsProps {
  job_type: CronJobType;
}

/**
 * เลือกชุดฟิลด์ตามชนิดงาน — แต่ละชนิดมีแหล่งข้อมูลของตัวเอง จึงแยกไฟล์
 *
 * `CronJobConfig` is a union of six all-optional-field interfaces that share almost no
 * property names with each other, so TypeScript's weak-type check (TS2326/TS2559) refuses
 * to narrow `rest.value: CronJobConfig` down to one member just because `job_type` was
 * switched on — the two aren't structurally linked. The `job_type` switch below IS that
 * link at runtime; the `as unknown as` per branch tells the compiler what the switch
 * already guarantees.
 */
export default function JobConfigFields({ job_type, ...rest }: Props) {
  switch (job_type) {
    case 'report':
      return <ReportConfigFields {...(rest as unknown as JobConfigFieldsProps<ReportJobConfig>)} />;
    case 'notification':
      return <NotificationConfigFields {...(rest as unknown as JobConfigFieldsProps<NotificationJobConfig>)} />;
    case 'cleanup':
      return <CleanupConfigFields {...(rest as unknown as JobConfigFieldsProps<CleanupJobConfig>)} />;
    case 'dashboard_refresh':
      return <DashboardRefreshConfigFields {...(rest as unknown as JobConfigFieldsProps<DashboardRefreshJobConfig>)} />;
    case 'activity_rollup':
      return <ActivityRollupConfigFields {...(rest as unknown as JobConfigFieldsProps<ActivityRollupJobConfig>)} />;
    case 'activity_retention':
      return <ActivityRetentionConfigFields {...(rest as unknown as JobConfigFieldsProps<ActivityRetentionJobConfig>)} />;
    default:
      return null;
  }
}
