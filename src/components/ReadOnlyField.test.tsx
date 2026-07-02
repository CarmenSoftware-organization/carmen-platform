import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadOnlyField } from './ReadOnlyField';

describe('ReadOnlyField', () => {
  it('shows the value', () => {
    render(<ReadOnlyField value="ACME" />);
    expect(screen.getByText('ACME')).toBeInTheDocument();
  });
  it('falls back to a dash when empty', () => {
    render(<ReadOnlyField value="" />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
