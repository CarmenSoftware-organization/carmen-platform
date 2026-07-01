import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JsonViewer } from './json-viewer';

describe('JsonViewer', () => {
  it('renders pretty-printed JSON of the data', () => {
    render(<JsonViewer data={{ a: 1, b: 'x' }} />);
    const pre = screen.getByText(/"a": 1/);
    expect(pre.tagName).toBe('PRE');
    expect(pre).toHaveTextContent('"b": "x"');
  });

  it('uses token classes, not hardcoded gray', () => {
    render(<JsonViewer data={{}} />);
    const pre = document.querySelector('pre')!;
    expect(pre.className).toContain('bg-muted');
    expect(pre.className).not.toContain('bg-gray-900');
    expect(pre.className).not.toContain('text-[10px]');
  });
});
