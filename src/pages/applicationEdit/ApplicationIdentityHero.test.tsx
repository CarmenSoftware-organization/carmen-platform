import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApplicationIdentityHero, accessSummary } from './ApplicationIdentityHero';

describe('accessSummary', () => {
  it('calls out full access', () => {
    expect(accessSummary(true, [])).toBe('Full access — every endpoint');
    expect(accessSummary(true, ['cluster.read'])).toBe('Full access — every endpoint');
  });

  it('counts endpoints and distinct modules for a scoped app', () => {
    expect(accessSummary(false, ['cluster.read', 'cluster.create', 'report.read'])).toBe('3 endpoints across 2 modules');
    expect(accessSummary(false, ['cluster.read'])).toBe('1 endpoint across 1 module');
  });

  it('prompts when nothing is granted', () => {
    expect(accessSummary(false, [])).toBe('No endpoints granted yet');
  });
});

describe('ApplicationIdentityHero', () => {
  const base = {
    name: 'mobile-app',
    appId: 'bad5f6a7-2c4b-4eb6-bcf1-81bf51745c86',
    device: 'mobile',
    isActive: true,
    allowAll: false,
    apiNames: ['cluster.read', 'report.read'],
  };

  it('shows the name, device, status and scoped access summary', () => {
    render(<ApplicationIdentityHero {...base} />);
    expect(screen.getByRole('heading', { name: 'mobile-app' })).toBeInTheDocument();
    expect(screen.getByText('mobile')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('2 endpoints across 2 modules')).toBeInTheDocument();
  });

  it('renders the App ID with a copy control', () => {
    render(<ApplicationIdentityHero {...base} />);
    expect(screen.getByText(base.appId)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy app id/i })).toBeInTheDocument();
  });

  it('omits the App ID for a new application', () => {
    render(<ApplicationIdentityHero {...base} appId={undefined} />);
    expect(screen.queryByRole('button', { name: /copy app id/i })).not.toBeInTheDocument();
  });

  it('flags full access in the summary', () => {
    render(<ApplicationIdentityHero {...base} allowAll />);
    expect(screen.getByText('Full access — every endpoint')).toBeInTheDocument();
  });

  it('falls back to a placeholder name when unnamed', () => {
    render(<ApplicationIdentityHero {...base} name="" />);
    expect(screen.getByRole('heading', { name: '(unnamed application)' })).toBeInTheDocument();
  });

  it('renders no audit lines when meta is absent', () => {
    render(<ApplicationIdentityHero {...base} />);
    expect(screen.queryByText(/Created/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });

  it('surfaces created/updated by + at when meta is present', () => {
    render(
      <ApplicationIdentityHero
        {...base}
        meta={{
          created_at: '2026-01-05T10:00:00Z',
          created_by_name: 'Ada Lovelace',
          updated_at: '2026-02-10T10:00:00Z',
          updated_by_name: 'Grace Hopper',
        }}
      />
    );
    expect(screen.getByText(/Created/)).toBeInTheDocument();
    expect(screen.getByText(/5 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByText(/by Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    expect(screen.getByText(/10 Feb 2026/)).toBeInTheDocument();
    expect(screen.getByText(/by Grace Hopper/)).toBeInTheDocument();
  });
});
