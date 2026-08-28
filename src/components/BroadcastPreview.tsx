import { Globe, Users, Building2, Send, Calendar, AlertTriangle } from 'lucide-react';
import { Card } from './ui/card';
import { Badge, type BadgeProps } from './ui/badge';
import { cn } from '../lib/utils';
import type { BroadcastTargetMode, BroadcastTypePreset } from '../types';
import { useI18n } from '../hooks/useI18n';
import { translate } from '../i18n/translate';
import type { TFunction } from '../i18n/types';

export interface SeverityStyle {
  label: string;
  bar: string; // accent bar background
  variant: NonNullable<BadgeProps['variant']>; // <Badge variant=...> for the type chip
}

/**
 * Map a broadcast type to its severity presentation. Static class strings so Tailwind keeps them.
 *
 * `t` is trailing and optional, English-catalog-fallback shaped (same contract as
 * `validateField`/`parseApiError`): `BroadcastPreview.test.tsx` calls this positionally
 * with no `t` and asserts the exact English labels, so that call shape must keep working.
 */
export function severityStyle(preset: BroadcastTypePreset, t?: TFunction): SeverityStyle {
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));
  switch (preset) {
    case 'WARNING':
      return { label: tr('common.severity.warning'), bar: 'bg-warning', variant: 'warning' };
    case 'CRITICAL':
      return { label: tr('common.severity.critical'), bar: 'bg-destructive', variant: 'destructive' };
    case 'MAINTENANCE':
      return { label: tr('common.severity.maintenance'), bar: 'bg-muted-foreground', variant: 'secondary' };
    case 'OTHER':
      return { label: tr('common.option.custom'), bar: 'bg-primary', variant: 'default' };
    case 'INFO':
    default:
      return { label: tr('common.severity.info'), bar: 'bg-info', variant: 'info' };
  }
}

export interface ReachInfo {
  text: string;
  all: boolean; // true only for the system-wide blast — flagged with a warning tint
  icon: 'globe' | 'users' | 'building';
}

/**
 * Describe who this broadcast reaches, in the reader's terms.
 *
 * Same trailing-optional-`t` shape as `severityStyle` above — `BroadcastPreview.test.tsx`
 * calls this positionally with no `t` too.
 */
export function reachSummary(mode: BroadcastTargetMode, recipientCount: number, buLabel?: string, t?: TFunction): ReachInfo {
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));
  if (mode === 'system_all') return { text: tr('pages.broadcasts.everyUserInSystem'), all: true, icon: 'globe' };
  if (mode === 'system_users') {
    return {
      text: recipientCount > 0
        ? tr(recipientCount === 1 ? 'pages.broadcasts.selectedUserSingular' : 'pages.broadcasts.selectedUserPlural', { count: recipientCount })
        : tr('pages.broadcasts.noRecipientsPickedYet'),
      all: false,
      icon: 'users',
    };
  }
  return { text: buLabel || tr('pages.broadcasts.noBusinessUnitPickedYet'), all: false, icon: 'building' };
}

const REACH_ICON = { globe: Globe, users: Users, building: Building2 } as const;

interface BroadcastPreviewProps {
  typePreset: BroadcastTypePreset;
  customLabel?: string; // shown as the type when preset is OTHER
  title: string;
  message: string;
  mode: BroadcastTargetMode;
  recipientCount: number;
  buLabel?: string;
  sendMode: 'now' | 'schedule';
  scheduledLabel?: string; // formatted scheduled time, when valid
  expiresLabel?: string; // formatted expiry time, when resolvable
}

/** The signature: the broadcast rendered as recipients will see it, plus who it reaches and when. */
export function BroadcastPreview({
  typePreset,
  customLabel,
  title,
  message,
  mode,
  recipientCount,
  buLabel,
  sendMode,
  scheduledLabel,
  expiresLabel,
}: BroadcastPreviewProps) {
  const { t } = useI18n();
  const sev = severityStyle(typePreset, t);
  const typeLabel = typePreset === 'OTHER' ? (customLabel?.trim() || t('common.option.custom')) : sev.label;
  const reach = reachSummary(mode, recipientCount, buLabel, t);
  const ReachIcon = REACH_ICON[reach.icon];

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">{t('common.action.preview')}</div>

      {/* Notification as recipients see it */}
      <div className="flex overflow-hidden rounded-lg border">
        <div className={cn('w-1 shrink-0', sev.bar)} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5 p-3">
          <Badge variant={sev.variant} className="text-[10px] font-bold uppercase tracking-wide">
            {typeLabel}
          </Badge>
          <div className={cn('text-sm font-semibold leading-snug', !title.trim() && 'text-muted-foreground/50 font-normal italic')}>
            {title.trim() || t('pages.broadcasts.titlePlaceholder')}
          </div>
          <div className={cn('whitespace-pre-line text-sm leading-relaxed', message.trim() ? 'text-muted-foreground line-clamp-6' : 'text-muted-foreground/50 italic')}>
            {message.trim() || t('pages.broadcasts.messagePlaceholder')}
          </div>
        </div>
      </div>

      {/* Reach */}
      <div className="mt-4 space-y-1">
        <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.14em]">{t('pages.broadcasts.reaches')}</div>
        <div
          className={cn(
            'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm',
            reach.all ? 'bg-warning/10 text-warning' : 'text-foreground',
          )}
        >
          {reach.all ? <AlertTriangle className="size-4 shrink-0" /> : <ReachIcon className="text-muted-foreground size-4 shrink-0" />}
          <span className="min-w-0">{reach.text}</span>
        </div>
      </div>

      {/* Delivery */}
      <div className="mt-3 space-y-1">
        <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.14em]">{t('common.field.delivery')}</div>
        <div className="text-foreground flex items-center gap-2 px-2.5 py-1 text-sm">
          {sendMode === 'schedule' ? (
            <>
              <Calendar className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0">{scheduledLabel ? t('pages.broadcasts.scheduledForLabel', { when: scheduledLabel }) : t('pages.broadcasts.pickDateTime')}</span>
            </>
          ) : (
            <>
              <Send className="text-muted-foreground size-4 shrink-0" />
              <span>{t('pages.broadcasts.sendsImmediately')}</span>
            </>
          )}
        </div>
        {expiresLabel && (
          <div className="text-muted-foreground flex items-center gap-2 px-2.5 py-1 text-sm">
            <Calendar className="size-4 shrink-0" />
            <span className="min-w-0">{t('common.state.expires')} {expiresLabel}</span>
          </div>
        )}
        {/* The colour bar and Badge above are the sender's own categorisation. The backend
            hardcodes `event: info` on every broadcast and has no severity column at all, so
            recipients never see any of it — saying so here stops the sender believing a
            Critical broadcast lands in red. The value is still persisted in metadata.severity. */}
        <p className="text-muted-foreground/80 px-2.5 pt-1 text-[11px] leading-relaxed">
          {t('pages.broadcasts.internalCategorisationNote')}
        </p>
      </div>
    </Card>
  );
}
