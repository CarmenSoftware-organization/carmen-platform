import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadOnlyText, ReadOnlyTextarea, CollapsibleSection } from './shared';

describe('ReadOnlyText', () => {
  it('renders the value', () => {
    render(<ReadOnlyText value="hello" />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
  it('renders a dash when empty', () => {
    render(<ReadOnlyText value="" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('ReadOnlyTextarea', () => {
  it('renders the value', () => {
    render(<ReadOnlyTextarea value="some notes" />);
    expect(screen.getByText('some notes')).toBeInTheDocument();
  });
  it('renders a dash when empty', () => {
    render(<ReadOnlyTextarea value="" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('CollapsibleSection', () => {
  it('hides content by default and reveals it on header click', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="My Section">
        <p>secret body</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByText('secret body')).not.toBeInTheDocument();
    await user.click(screen.getByText('My Section'));
    expect(screen.getByText('secret body')).toBeInTheDocument();
  });
  it('always shows content when forceOpen, even after a header click', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Forced" forceOpen>
        <p>always here</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText('always here')).toBeInTheDocument();
    await user.click(screen.getByText('Forced'));
    expect(screen.getByText('always here')).toBeInTheDocument();
  });

  // A pinned-open section must not advertise a collapse it will not perform: the
  // chevron and the pointer affordance are dropped, not just made inert.
  it('drops the collapse affordance entirely when forceOpen', () => {
    const { container } = render(
      <CollapsibleSection title="Forced" description="desc" forceOpen>
        <p>always here</p>
      </CollapsibleSection>,
    );
    expect(container.querySelector('svg.lucide-chevron-down')).toBeNull();
    expect(container.querySelector('.cursor-pointer')).toBeNull();
  });

  it('keeps the collapse affordance when it actually collapses', () => {
    const { container } = render(
      <CollapsibleSection title="Real">
        <p>body</p>
      </CollapsibleSection>,
    );
    expect(container.querySelector('.cursor-pointer')).not.toBeNull();
  });
});
