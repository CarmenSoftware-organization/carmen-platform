import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BroadcastPreview, severityStyle, reachSummary } from './BroadcastPreview';

describe('severityStyle', () => {
  it('maps each preset to a distinct accent', () => {
    expect(severityStyle('INFO').bar).toBe('bg-info');
    expect(severityStyle('WARNING').bar).toBe('bg-warning');
    expect(severityStyle('CRITICAL').bar).toBe('bg-destructive');
    expect(severityStyle('MAINTENANCE').bar).toBe('bg-muted-foreground');
    expect(severityStyle('OTHER').bar).toBe('bg-primary');
  });
});

describe('reachSummary', () => {
  it('flags the system-wide blast', () => {
    const r = reachSummary('system_all', 0);
    expect(r.all).toBe(true);
    expect(r.text).toMatch(/every user/i);
  });

  it('counts and pluralizes picked recipients', () => {
    expect(reachSummary('system_users', 1).text).toBe('1 selected user');
    expect(reachSummary('system_users', 3).text).toBe('3 selected users');
    expect(reachSummary('system_users', 0).text).toMatch(/no recipients/i);
    expect(reachSummary('system_users', 3).all).toBe(false);
  });

  it('names the business unit, or prompts to pick one', () => {
    expect(reachSummary('bu', 0, 'Zebra (ZEB)').text).toBe('Zebra (ZEB)');
    expect(reachSummary('bu', 0).text).toMatch(/no business unit/i);
  });
});

describe('BroadcastPreview', () => {
  const base = {
    typePreset: 'WARNING' as const,
    title: 'Scheduled maintenance',
    message: 'Down 02:00–03:00 UTC.',
    mode: 'system_all' as const,
    recipientCount: 0,
    sendMode: 'now' as const,
  };

  it('renders the notification, severity label and reach', () => {
    render(<BroadcastPreview {...base} />);
    expect(screen.getByText('Scheduled maintenance')).toBeInTheDocument();
    expect(screen.getByText('Down 02:00–03:00 UTC.')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Every user in the system')).toBeInTheDocument();
    expect(screen.getByText('Sends immediately')).toBeInTheDocument();
  });

  it('shows placeholders before anything is typed', () => {
    render(<BroadcastPreview {...base} title="" message="" />);
    expect(screen.getByText('Your title appears here')).toBeInTheDocument();
    expect(screen.getByText('Your message appears here.')).toBeInTheDocument();
  });

  it('uses the custom type label for OTHER', () => {
    render(<BroadcastPreview {...base} typePreset="OTHER" customLabel="DEPLOY" />);
    expect(screen.getByText('DEPLOY')).toBeInTheDocument();
  });

  it('states the scheduled time when scheduling', () => {
    render(<BroadcastPreview {...base} sendMode="schedule" scheduledLabel="Jul 20, 2026, 9:00 AM" />);
    expect(screen.getByText('Scheduled for Jul 20, 2026, 9:00 AM')).toBeInTheDocument();
  });
});
