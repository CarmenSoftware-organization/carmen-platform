import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BusinessUnitUsersCard from './BusinessUnitUsersCard';
import type { useBusinessUnitUsers } from './useBusinessUnitUsers';
import type { BUUser } from './types';

const aUser: BUUser = {
  id: 'bu-user-1',
  user_id: 'u1',
  role: 'admin',
  is_default: false,
  is_active: true,
  username: 'alice',
  email: 'alice@example.com',
  user_is_active: true,
  firstname: 'Alice',
  middlename: null,
  lastname: 'Smith',
};

type UsersHook = ReturnType<typeof useBusinessUnitUsers>;

const stubUsers = (buUsers: BUUser[] = [aUser]): UsersHook =>
  ({
    buUsers,
    setBuUsers: vi.fn(),
    clusterUsers: [],
    loadingClusterUsers: false,
    rawClusterUsersResponse: null,
    editingUser: null,
    setEditingUser: vi.fn(),
    editUserForm: { role: 'admin', is_active: true },
    setEditUserForm: vi.fn(),
    savingUser: false,
    showAddUser: false,
    setShowAddUser: vi.fn(),
    addUserRole: 'admin',
    setAddUserRole: vi.fn(),
    selectedClusterUser: null,
    setSelectedClusterUser: vi.fn(),
    addingUser: false,
    addUserSearchTerm: '',
    setAddUserSearchTerm: vi.fn(),
    deleteUser: null,
    setDeleteUser: vi.fn(),
    availableClusterUsers: [],
    fetchBuUsers: vi.fn(),
    handleDeleteUser: vi.fn(),
    handleConfirmDeleteUser: vi.fn(),
    handleOpenEditUser: vi.fn(),
    handleSaveEditUser: vi.fn(),
    handleOpenAddUser: vi.fn(),
    handleAddUser: vi.fn(),
  }) as unknown as UsersHook;

const renderCard = (canEdit?: boolean) =>
  render(
    <MemoryRouter>
      <BusinessUnitUsersCard users={stubUsers()} canEdit={canEdit} />
    </MemoryRouter>,
  );

describe('BusinessUnitUsersCard', () => {
  it('always shows the membership roster', () => {
    renderCard(false);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  // SECURITY: BU membership is a write surface. Before the canEdit fix this card
  // had no permission prop at all, so any viewer could add/edit/remove BU users.
  it('offers no membership mutations without canEdit', () => {
    renderCard(false);
    expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit alice$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^remove alice$/i })).toBeNull();
  });

  it('defaults to read-only when canEdit is not passed', () => {
    renderCard(undefined);
    expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
  });

  it('offers them with canEdit', () => {
    renderCard(true);
    expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit alice$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^remove alice$/i })).toBeInTheDocument();
  });
});

describe('BusinessUnitUsersCard — แถบ seat ระดับ cluster', () => {
  const base = { users: stubUsers() };

  it('บอกว่าเกินเท่าไรและต้องปิดอีกกี่คน', () => {
    render(
      <MemoryRouter>
        <BusinessUnitUsersCard {...base} clusterSeat={{ used: 12, cap: 5 }} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/12 \/ 5/)).toBeInTheDocument();
    expect(screen.getByText(/ต้องปิดผู้ใช้อีก 7 คน/)).toBeInTheDocument();
    // aUser (จาก stubUsers) ไม่มี frees_seat เลย (undefined) — แถวปกติที่ backend ยังไม่ส่งค่า
    // หรือ frees_seat เป็น true ต้องไม่มีหมายเหตุนี้ ถ้า implementation โชว์หมายเหตุให้ทุกแถว
    // active โดยไม่เช็ค frees_seat เลย เทสต์นี้ต้องจับได้
    expect(screen.queryByText(/อยู่ BU อื่นด้วย/)).not.toBeInTheDocument();
  });

  it('ไม่ขึ้นเตือนเมื่อยังไม่เกิน', () => {
    render(
      <MemoryRouter>
        <BusinessUnitUsersCard {...base} clusterSeat={{ used: 3, cap: 5 }} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/ต้องปิดผู้ใช้อีก/)).not.toBeInTheDocument();
  });

  it('คนที่ปิดแล้วไม่คืนที่นั่งต้องบอกให้เห็น ไม่งั้นแอดมินปิดไปเรื่อยแล้วตัวเลขไม่ขยับ', () => {
    render(
      <MemoryRouter>
        <BusinessUnitUsersCard
          {...base}
          users={{ ...base.users, buUsers: [
            { ...aUser, id: 'm1', user_id: 'u1', is_active: true, frees_seat: false },
          ] }}
          clusterSeat={{ used: 12, cap: 5 }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/อยู่ BU อื่นด้วย/)).toBeInTheDocument();
  });

  it('แถบ seat ต้องพูดว่าเป็นของทั้ง cluster ไม่ใช่ของ BU นี้', () => {
    render(
      <MemoryRouter>
        <BusinessUnitUsersCard {...base} clusterSeat={{ used: 3, cap: 5 }} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/ทั้ง cluster/)).toBeInTheDocument();
  });
});
