import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Changelog from './Changelog';
import changelogData from '../data/changelog.json';

const renderChangelog = () =>
  render(
    <MemoryRouter>
      <Changelog />
    </MemoryRouter>
  );

describe('Changelog', () => {
  it('renders category labels as badges, not headings', () => {
    renderChangelog();
    // discriminating: 'Added' appears but NOT as the old hand-rolled <h3> category heading
    const added = screen.getAllByText('Added')[0];
    expect(added.tagName).not.toBe('H3');
    expect(added.tagName).toBe('DIV');
    expect(added.className).toMatch(/rounded-md/);
  });

  it('preserves the UTC-shift-safe date formatting, rendering the raw YYYY-MM-DD string verbatim', () => {
    renderChangelog();
    // Regression guard for fmtDate: must render the authored date string as-is,
    // never `new Date(v).toLocaleDateString()`, which parses a date-only string
    // as UTC midnight and shifts to the previous day west of UTC.
    const firstVersion = changelogData.versions[0];
    expect(screen.getByText(firstVersion.date)).toBeInTheDocument();
  });

  it('filters versions by search text and reports no matching entries', async () => {
    const user = userEvent.setup();
    renderChangelog();
    const box = screen.getByRole('searchbox');
    await user.type(box, 'zzz-nonexistent-term');
    expect(await screen.findByText(/no matching|no results|nothing/i)).toBeInTheDocument();
    // Non-matching versions are actually filtered out, not just appended-to.
    expect(screen.queryByText(`v${changelogData.versions[0].version}`)).not.toBeInTheDocument();
    expect(screen.queryByText(`v${changelogData.versions[1].version}`)).not.toBeInTheDocument();
  });

  it('matches on entry text, not just the version number', async () => {
    const user = userEvent.setup();
    renderChangelog();
    const box = screen.getByRole('searchbox');
    // "Broadcast" only occurs inside a v0.1.0 changelog entry — not in any version
    // number or category name — so a match here proves entry text is searched.
    await user.type(box, 'broadcast');
    expect(await screen.findByText(`v${changelogData.versions[1].version}`)).toBeInTheDocument();
    expect(screen.queryByText(`v${changelogData.versions[0].version}`)).not.toBeInTheDocument();
  });

  it('restores all versions when the search is cleared', async () => {
    const user = userEvent.setup();
    renderChangelog();
    const box = screen.getByRole('searchbox');
    await user.type(box, 'zzz-nonexistent-term');
    await screen.findByText(/no matching/i);
    await user.clear(box);
    expect(await screen.findByText(`v${changelogData.versions[0].version}`)).toBeInTheDocument();
    expect(screen.getByText(`v${changelogData.versions[1].version}`)).toBeInTheDocument();
  });
});

describe('Changelog — empty state', () => {
  it('shows an empty state when there are no versions and no unreleased changes', async () => {
    vi.resetModules();
    vi.doMock('../data/changelog.json', () => ({
      default: { versions: [], unreleased: {} },
    }));

    const { default: EmptyChangelog } = await import('./Changelog');
    render(
      <MemoryRouter>
        <EmptyChangelog />
      </MemoryRouter>
    );

    expect(screen.getByText(/no changelog|nothing here|no entries/i)).toBeInTheDocument();
    // Nothing to search when there's nothing to show.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    vi.doUnmock('../data/changelog.json');
    vi.resetModules();
  });
});
