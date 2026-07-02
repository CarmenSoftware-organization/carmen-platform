import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu';

describe('DropdownMenu', () => {
  it('opens the menu when the asChild trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Actions</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Edit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();

    // asChild must render the child element directly (a single <button>), not wrap it.
    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger.tagName).toBe('BUTTON');

    await user.click(trigger);

    expect(await screen.findByText('Edit')).toBeInTheDocument();
  });

  it('fires onSelect and closes the menu when an item is chosen', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Actions</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onSelect}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = await screen.findByText('Delete');
    await user.click(item);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('fires onClick on an item like the page call sites do', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Actions</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onClick}>Edit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByText('Edit'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders content with align="end" (menu mounts) when open', async () => {
    render(
      <DropdownMenu open onOpenChange={() => {}}>
        <DropdownMenuTrigger asChild>
          <button>Actions</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Edit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const menu = await screen.findByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveAttribute('data-align', 'end');
  });

  it('supports controlled open/onOpenChange single-arg callback', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu open={false} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button>Actions</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Edit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions' }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
