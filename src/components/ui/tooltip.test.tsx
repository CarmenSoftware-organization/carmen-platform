import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './tooltip';

describe('Tooltip', () => {
  it('does not show the content until the trigger is interacted with', () => {
    render(
      <Tooltip content="Helpful hint">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.getByRole('button', { name: 'Hover me' })).toBeInTheDocument();
    expect(screen.queryByText('Helpful hint')).not.toBeInTheDocument();
  });

  it('shows the content text when the trigger is hovered', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Helpful hint">
        <button>Hover me</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Hover me' });
    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Helpful hint');
  });

  it('renders arbitrary ReactNode content, not just strings', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content={<span data-testid="rich-content">Rich hint</span>}>
        <button>Hover me</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Hover me' });
    await user.hover(trigger);
    // Radix renders the content twice — once visibly, once in a visually-hidden
    // role="tooltip" node for assistive tech — so scope the query to the
    // accessible tooltip node rather than searching the whole document.
    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByTestId('rich-content')).toBeInTheDocument();
  });

  it('renders a single child trigger via asChild (no extra DOM wrapper)', () => {
    render(
      <Tooltip content="reason">
        <button>Only child</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Only child' });
    expect(trigger.tagName).toBe('BUTTON');
  });
});
