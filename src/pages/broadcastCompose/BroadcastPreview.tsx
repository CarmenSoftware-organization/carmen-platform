import { Globe, Users, Building2, Send, Calendar, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import type { BroadcastTargetMode, BroadcastTypePreset } from '../../types';

export interface SeverityStyle {
  label: string;
  bar: string; // accent bar background
  badge: string; // badge bg + text
}

/** Map a broadcast type to its severity presentation. Static class strings so Tailwind keeps them. */
export function severityStyle(preset: BroadcastTypePreset): SeverityStyle {
  switch (preset) {
    case 'WARNING':
      return { label: 'Warning', bar: 'bg-warning', badge: 'bg-warning/10 text-warning' };
    case 'CRITICAL':
      return { label: 'Critical', bar: 'bg-destructive', badge: 'bg-destructive/10 text-destructive' };
    case 'MAINTENANCE':
      return { label: 'Maintenance', bar: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' };
    case 'OTHER':
      return { label: 'Custom', bar: 'bg-primary', badge: 'bg-primary/10 text-primary' };
    case 'INFO':
    default:
      return { label: 'Info', bar: 'bg-info', badge: 'bg-info/10 text-info' };
  }
}

export interface ReachInfo {
  text: string;
  all: boolean; // true only for the system-wide blast — flagged with a warning tint
  icon: 'globe' | 'users' | 'building';
}

/** Describe who this broadcast reaches, in the reader's terms. */
export function reachSummary(mode: BroadcastTargetMode, recipientCount: number, buLabel?: string): ReachInfo {
  if (mode === 'system_all') return { text: 'Every user in the system', all: true, icon: 'globe' };
  if (mode === 'system_users') {
    return {
      text: recipientCount > 0 ? `${recipientCount} selected user${recipientCount === 1 ? '' : 's'}` : 'No recipients picked yet',
      all: false,
      icon: 'users',
    };
  }
  return { text: buLabel || 'No business unit picked yet', all: false, icon: 'building' };
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
  actions?: React.ReactNode;
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
  actions,
}: BroadcastPreviewProps) {
  const sev = severityStyle(typePreset);
  const typeLabel = typePreset === 'OTHER' ? (customLabel?.trim() || 'Custom') : sev.label;
  const reach = reachSummary(mode, recipientCount, buLabel);
  const ReachIcon = REACH_ICON[reach.icon];

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em]">Preview</div>

      {/* Notification as recipients see it */}
      <div className="flex overflow-hidden rounded-lg border">
        <div className={cn('w-1 shrink-0', sev.bar)} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5 p-3">
          <span className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', sev.badge)}>
            {typeLabel}
          </span>
          <div className={cn('text-sm font-semibold leading-snug', !title.trim() && 'text-muted-foreground/50 font-normal italic')}>
            {title.trim() || 'Your title appears here'}
          </div>
          <div className={cn('whitespace-pre-line text-sm leading-relaxed', message.trim() ? 'text-muted-foreground line-clamp-6' : 'text-muted-foreground/50 italic')}>
            {message.trim() || 'Your message appears here.'}
          </div>
        </div>
      </div>

      {/* Reach */}
      <div className="mt-4 space-y-1">
        <div className="text-muted-foreground text-[10.5px] font-bold uppercase tracking-[0.14em]">Reaches</div>
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
        <div className="text-muted-foreground text-[10.5px] font-bold uppercase tracking-[0.14em]">Delivery</div>
        <div className="text-foreground flex items-center gap-2 px-2.5 py-1 text-sm">
          {sendMode === 'schedule' ? (
            <>
              <Calendar className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0">{scheduledLabel ? `Scheduled for ${scheduledLabel}` : 'Pick a date and time'}</span>
            </>
          ) : (
            <>
              <Send className="text-muted-foreground size-4 shrink-0" />
              <span>Sends immediately</span>
            </>
          )}
        </div>
      </div>

      {actions && <div className="mt-4 border-t pt-4">{actions}</div>}
    </Card>
  );
}
