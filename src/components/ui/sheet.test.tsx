import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from './sheet';

describe('Sheet', () => {
  it('does not render content before the trigger is clicked', () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open</button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>My Sheet Title</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('My Sheet Title')).not.toBeInTheDocument();
  });

  it('reveals SheetContent when an asChild SheetTrigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open</button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>My Sheet Title</SheetTitle>
            <SheetDescription>My sheet description</SheetDescription>
          </SheetHeader>
          <div>Body content</div>
          <SheetFooter>
            <button>Footer button</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('My Sheet Title')).toBeInTheDocument();
    expect(screen.getByText('My sheet description')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.getByText('Footer button')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) with a single arg when the injected close (X) is clicked', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Closeable Sheet</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );

    await screen.findByRole('dialog');
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('applies the right-side slide-in classes for side="right" (the default)', async () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent side="right">
          <SheetTitle>Right Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('right-0');
    expect(dialog.className).toContain('slide-in-from-right');
  });

  it('applies the medium size width class for size="medium"', async () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent size="medium">
          <SheetTitle>Medium Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('sm:max-w-md');
  });

  it('lets caller className override the size/side width classes', async () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent side="right" size="medium" className="w-full sm:max-w-sm">
          <SheetTitle>Overridden Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('sm:max-w-sm');
  });
});
