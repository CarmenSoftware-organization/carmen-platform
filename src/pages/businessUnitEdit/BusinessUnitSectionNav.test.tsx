import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessUnitSectionNav from './BusinessUnitSectionNav';
import { getVisibleSections } from './sections';

describe('BusinessUnitSectionNav', () => {
  it('renders a button per visible section', () => {
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(false)}
        activeId="general"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /branding/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
  });

  it('hides existing-only sections for a new BU', () => {
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(true)}
        activeId="general"
        onNavigate={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /branding/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /users/i })).toBeNull();
  });

  it('marks the active section with aria-current', () => {
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(false)}
        activeId="advanced"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /advanced/i })).toHaveAttribute('aria-current', 'true');
  });

  it('calls onNavigate with the section id on click', async () => {
    const onNavigate = vi.fn();
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(false)}
        activeId="general"
        onNavigate={onNavigate}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /localization/i }));
    expect(onNavigate).toHaveBeenCalledWith('localization');
  });

  it('renders the SA badge on Advanced', () => {
    render(
      <BusinessUnitSectionNav
        sections={getVisibleSections(false)}
        activeId="general"
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /advanced/i })).toHaveTextContent('SA');
  });
});
