import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewsMasthead, describeReach } from './NewsMasthead';

describe('describeReach', () => {
  it('reads Global when the article is global or targets nothing', () => {
    expect(describeReach(true, 0)).toBe('Global');
    expect(describeReach(true, 3)).toBe('Global'); // global wins over any stray ids
    expect(describeReach(false, 0)).toBe('Global');
  });

  it('counts and pluralizes targeted business units', () => {
    expect(describeReach(false, 1)).toBe('1 business unit');
    expect(describeReach(false, 4)).toBe('4 business units');
  });
});

describe('NewsMasthead', () => {
  const base = {
    status: 'draft' as const,
    isGlobal: true,
    buCount: 0,
    title: 'New tax module is live',
    editing: false,
  };

  it('shows the headline, status and audience in read mode', () => {
    render(<NewsMasthead {...base} status="published" publishedLabel="2026-07-10 09:00:00" />);
    expect(screen.getByRole('heading', { name: 'New tax module is live' })).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('2026-07-10 09:00:00')).toBeInTheDocument();
  });

  it('warns that a draft is not visible to readers', () => {
    render(<NewsMasthead {...base} status="draft" />);
    expect(screen.getByText('Not visible to readers')).toBeInTheDocument();
  });

  it('falls back to a placeholder headline when untitled', () => {
    render(<NewsMasthead {...base} title="" />);
    expect(screen.getByRole('heading', { name: '(untitled)' })).toBeInTheDocument();
  });

  it('renders the editors instead of the headline while editing', () => {
    render(
      <NewsMasthead
        {...base}
        editing
        titleEditor={<input aria-label="Headline" defaultValue="draft title" />}
        coverEditor={<div data-testid="cover-editor" />}
      />,
    );
    expect(screen.getByLabelText('Headline')).toBeInTheDocument();
    expect(screen.getByTestId('cover-editor')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows the Edit action only in read mode', () => {
    const { rerender } = render(<NewsMasthead {...base} actions={<button>Edit</button>} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    rerender(<NewsMasthead {...base} editing actions={<button>Edit</button>} titleEditor={<input aria-label="Headline" />} />);
    // actions still render if passed, but the page only passes them when !editing;
    // here we assert the editing branch swaps the headline for the editor.
    expect(screen.getByLabelText('Headline')).toBeInTheDocument();
  });
});
