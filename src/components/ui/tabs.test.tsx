import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

describe('Tabs', () => {
  it('controlled: clicking a trigger calls onValueChange with that value', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();

    render(
      <Tabs value="one" onValueChange={handleValueChange}>
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    );

    await user.click(screen.getByRole('tab', { name: 'Two' }));

    expect(handleValueChange).toHaveBeenCalledWith('two');
  });

  it('controlled: does not switch visible content on its own (parent owns value)', async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn();

    render(
      <Tabs value="one" onValueChange={handleValueChange}>
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    );

    await user.click(screen.getByRole('tab', { name: 'Two' }));

    // Since the parent never re-renders with the new value, content stays put.
    expect(screen.getByText('First panel')).toBeInTheDocument();
    expect(screen.queryByText('Second panel')).not.toBeInTheDocument();
  });

  it('uncontrolled: defaultValue shows the matching TabsContent initially', () => {
    render(
      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write">Write panel</TabsContent>
        <TabsContent value="preview">Preview panel</TabsContent>
      </Tabs>
    );

    expect(screen.getByText('Write panel')).toBeInTheDocument();
    expect(screen.queryByText('Preview panel')).not.toBeInTheDocument();
  });

  it('uncontrolled: clicking another trigger swaps the visible content', async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write">Write panel</TabsContent>
        <TabsContent value="preview">Preview panel</TabsContent>
      </Tabs>
    );

    await user.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.queryByText('Write panel')).not.toBeInTheDocument();
    expect(screen.getByText('Preview panel')).toBeInTheDocument();
  });

  it('disables a trigger via the disabled prop', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two" disabled>
            Two
          </TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    );

    expect(screen.getByRole('tab', { name: 'Two' })).toBeDisabled();
  });

  it('merges a custom className onto TabsList base classes', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList className="my-list-class">
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
      </Tabs>
    );

    const list = screen.getByRole('tablist');
    expect(list.className).toContain('my-list-class');
    // Base shadcn/Radix TabsList chrome (absent from the old Fluent implementation).
    expect(list.className).toContain('bg-muted');
  });

  it('marks the active trigger with data-state="active" (Radix state, not Fluent)', async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    );

    const triggerOne = screen.getByRole('tab', { name: 'One' });
    const triggerTwo = screen.getByRole('tab', { name: 'Two' });
    expect(triggerOne).toHaveAttribute('data-state', 'active');
    expect(triggerTwo).toHaveAttribute('data-state', 'inactive');

    await user.click(triggerTwo);

    expect(triggerOne).toHaveAttribute('data-state', 'inactive');
    expect(triggerTwo).toHaveAttribute('data-state', 'active');
  });
});
