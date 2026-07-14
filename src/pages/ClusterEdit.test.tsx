import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the shell so no AuthContext/Sidebar is needed.
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/Can', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock data deps.
const listResponse = { data: [], paginate: { total: 0, page: 1, perpage: 10 } };
vi.mock('../services/clusterService', () => ({
  default: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    uploadLogo: vi.fn(),
    uploadAvatar: vi.fn(),
  },
}));
vi.mock('../services/businessUnitService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../services/userService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import ClusterEdit from './ClusterEdit';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import api from '../services/api';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeCluster = {
  id: 'c1',
  code: 'CLS1',
  name: 'Acme Cluster',
  alias_name: 'ACM',
  max_license_bu: 5,
  is_active: true,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clusters/new" element={<ClusterEdit />} />
        <Route path="/clusters/:id/edit" element={<ClusterEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(clusterService.getAll).mockResolvedValue(listResponse);
  asMock(businessUnitService.getAll).mockResolvedValue(listResponse);
  asMock(userService.getAll).mockResolvedValue(listResponse);
  asMock(api.get).mockResolvedValue({ data: { data: [] } });
});

describe('ClusterEdit (integration)', () => {
  it('loads an existing cluster into the overview hub, then reveals inputs in the edit dialog', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');

    // The hub hero leads with the cluster name (h1) and its code.
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    expect(screen.getByText('CLS1', { selector: 'span' })).toBeInTheDocument();

    // Edit details opens the dialog with editable fields.
    await user.click(screen.getByRole('button', { name: /edit details/i }));
    expect(await screen.findByDisplayValue('Acme Cluster')).toBeInTheDocument();
    expect(screen.getByDisplayValue('CLS1')).toBeInTheDocument();
  });

  it('starts a new cluster in edit mode without calling getById', async () => {
    renderAt('/clusters/new');
    expect(await screen.findByText('Add Cluster')).toBeInTheDocument();
    expect(clusterService.getById).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Cluster code')).toBeInTheDocument();
  });
});
