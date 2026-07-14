import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CapacityMeter } from './CapacityMeter';

describe('CapacityMeter', () => {
  it('shows used / cap', () => {
    render(<CapacityMeter used={14} cap={20} />);
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText(/\/\s*20/)).toBeInTheDocument();
  });

  it('renders ∞ and no tag when uncapped', () => {
    render(<CapacityMeter used={17} cap={null} />);
    expect(screen.getByText(/∞/)).toBeInTheDocument();
    expect(screen.queryByText('near')).not.toBeInTheDocument();
    expect(screen.queryByText('at cap')).not.toBeInTheDocument();
  });

  it('flags "near" at 90%, and shows no tag once at/over cap', () => {
    const { rerender } = render(<CapacityMeter used={9} cap={10} />);
    expect(screen.getByText('near')).toBeInTheDocument();
    rerender(<CapacityMeter used={10} cap={10} />);
    expect(screen.queryByText('near')).not.toBeInTheDocument();
    expect(screen.queryByText('at cap')).not.toBeInTheDocument();
  });
});
