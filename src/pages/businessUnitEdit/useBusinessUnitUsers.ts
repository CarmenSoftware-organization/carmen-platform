import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import businessUnitService from '../../services/businessUnitService';
import clusterService from '../../services/clusterService';
import { getErrorDetail } from '../../utils/errorParser';
import type { BUUser, ClusterUser } from './types';

export function useBusinessUnitUsers(id: string | undefined, clusterId: string, isNew: boolean) {
  const [buUsers, setBuUsers] = useState<BUUser[]>([]);
  const [editingUser, setEditingUser] = useState<BUUser | null>(null);
  const [editUserForm, setEditUserForm] = useState<{ role: string; is_active: boolean }>({ role: '', is_active: true });
  const [savingUser, setSavingUser] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [clusterUsers, setClusterUsers] = useState<ClusterUser[]>([]);
  const [loadingClusterUsers, setLoadingClusterUsers] = useState(false);
  const [addUserRole, setAddUserRole] = useState('user');
  const [selectedClusterUser, setSelectedClusterUser] = useState<ClusterUser | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [addUserSearchTerm, setAddUserSearchTerm] = useState('');
  const [rawClusterUsersResponse, setRawClusterUsersResponse] = useState<unknown>(null);
  const [deleteUser, setDeleteUser] = useState<BUUser | null>(null);

  // Fetch cluster users for add-user dialog and debug tab
  useEffect(() => {
    if (!isNew && clusterId && !rawClusterUsersResponse) {
      setLoadingClusterUsers(true);
      clusterService.getClusterUsers(clusterId)
        .then(data => {
          setRawClusterUsersResponse(data);
          const items: ClusterUser[] = data.data || data;
          setClusterUsers(Array.isArray(items) ? items : []);
        })
        .catch(() => {})
        .finally(() => setLoadingClusterUsers(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  const fetchBuUsers = async () => {
    try {
      const data = await businessUnitService.getById(id!);
      const bu = data.data || data;
      setBuUsers(Array.isArray(bu.users) ? bu.users : []);
    } catch {
      // silent — user list refresh failed
    }
  };

  const handleDeleteUser = (user: BUUser) => {
    setDeleteUser(user);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteUser) return;
    try {
      await businessUnitService.deleteUserBusinessUnit(deleteUser.id);
      toast.success('User removed from business unit');
      setBuUsers(prev => prev.filter(u => u.id !== deleteUser.id));
      setDeleteUser(null);
    } catch (err: unknown) {
      toast.error('Failed to remove user', { description: getErrorDetail(err) });
    }
  };

  const handleOpenEditUser = (user: BUUser) => {
    setEditingUser(user);
    setEditUserForm({ role: user.role || 'user', is_active: user.is_active });
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    try {
      await businessUnitService.updateUserBusinessUnit(editingUser.id, editUserForm);
      toast.success('User role updated successfully');
      setBuUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...editUserForm } : u));
      setEditingUser(null);
    } catch (err: unknown) {
      toast.error('Failed to update user', { description: getErrorDetail(err) });
    } finally {
      setSavingUser(false);
    }
  };

  const handleOpenAddUser = () => {
    setShowAddUser(true);
    setSelectedClusterUser(null);
    setAddUserRole('user');
    setAddUserSearchTerm('');
  };

  const availableClusterUsers = clusterUsers.filter(cu => {
    // Exclude users already in this BU
    if (buUsers.some(bu => bu.user_id === cu.user_id)) return false;
    // Apply local search filter
    if (addUserSearchTerm) {
      const term = addUserSearchTerm.toLowerCase();
      const name = [cu.userInfo?.firstname, cu.userInfo?.middlename, cu.userInfo?.lastname].filter(Boolean).join(' ').toLowerCase();
      return (cu.username?.toLowerCase().includes(term) || cu.email?.toLowerCase().includes(term) || name.includes(term));
    }
    return true;
  });

  const handleAddUser = async () => {
    if (!selectedClusterUser || !id) return;
    setAddingUser(true);
    try {
      await businessUnitService.createUserBusinessUnit({
        user_id: selectedClusterUser.user_id,
        business_unit_id: id,
        role: addUserRole,
      });
      setShowAddUser(false);
      toast.success('User added to business unit');
      await fetchBuUsers();
    } catch (err: unknown) {
      toast.error('Failed to add user', { description: getErrorDetail(err) });
    } finally {
      setAddingUser(false);
    }
  };

  return {
    // state
    buUsers, setBuUsers,
    clusterUsers, loadingClusterUsers,
    rawClusterUsersResponse,
    editingUser, setEditingUser,
    editUserForm, setEditUserForm,
    savingUser,
    showAddUser, setShowAddUser,
    addUserRole, setAddUserRole,
    selectedClusterUser, setSelectedClusterUser,
    addingUser,
    addUserSearchTerm, setAddUserSearchTerm,
    deleteUser, setDeleteUser,
    availableClusterUsers,
    // handlers
    fetchBuUsers,
    handleDeleteUser,
    handleConfirmDeleteUser,
    handleOpenEditUser,
    handleSaveEditUser,
    handleOpenAddUser,
    handleAddUser,
  };
}
