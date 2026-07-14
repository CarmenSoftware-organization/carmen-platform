import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeployConsole } from './DeployConsole';

describe('DeployConsole', () => {
  it('renders nothing when no deploy is running', () => {
    const { container } = render(<DeployConsole batch={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows progress, the current tenant and the streamed log', () => {
    render(
      <DeployConsole
        batch={{
          applied: 1,
          total: 3,
          current: '20260611_add_col',
          buCode: 'BETA-SG',
          log: ['BETA-SG: applied 2', 'DLTA-SG: failed'],
        }}
      />,
    );
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText(/Deploying all tenants/)).toBeInTheDocument();
    expect(screen.getByText('(BETA-SG)')).toBeInTheDocument();
    expect(screen.getByText('20260611_add_col')).toBeInTheDocument();
    expect(screen.getByText('BETA-SG: applied 2')).toBeInTheDocument();
    expect(screen.getByText('DLTA-SG: failed')).toBeInTheDocument();
  });
});
