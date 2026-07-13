import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChipInput } from './chip-input';

describe('ChipInput suggestions', () => {
  it('renders a datalist with the provided suggestions and links the input to it', () => {
    render(
      <ChipInput
        value=""
        onChange={vi.fn()}
        id="tags"
        suggestions={['alpha', 'beta']}
      />,
    );
    const input = screen.getByRole('combobox');
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    const datalist = document.getElementById(listId as string);
    expect(datalist?.tagName.toLowerCase()).toBe('datalist');
    expect(datalist?.querySelectorAll('option')).toHaveLength(2);
  });

  it('adds no datalist when suggestions are omitted', () => {
    render(<ChipInput value="" onChange={vi.fn()} id="tags" />);
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('list')).toBeNull();
  });
});
