import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { User as UserIcon, Mail, Lock, Save, CheckCircle2, Code, Phone, Copy, Check, Pencil, X, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import type { User, BusinessUnit } from '../types';

interface ProfileFormData {
  alias_name: string;
  firstname: string;
  middlename: string;
  lastname: string;
  telephone: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ProfileFieldsData {
  alias_name: string;
  firstname: string;
  middlename: string;
  lastname: string;
  telephone: string;
}

const Profile: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<User | null>(user);
  const [formData, setFormData] = useState<ProfileFormData>({
    alias_name: '',
    firstname: '',
    middlename: '',
    lastname: '',
    telephone: '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [savedProfileData, setSavedProfileData] = useState<ProfileFieldsData>({
    alias_name: '',
    firstname: '',
    middlename: '',
    lastname: '',
    telephone: '',
  });

  const formRef = useRef<HTMLFormElement>(null);

  const hasProfileChanges = editingProfile && JSON.stringify({
    alias_name: formData.alias_name,
    firstname: formData.firstname,
    middlename: formData.middlename,
    lastname: formData.lastname,
    telephone: formData.telephone,
  }) !== JSON.stringify(savedProfileData);
  useUnsavedChanges(hasProfileChanges);

  useGlobalShortcuts({
    onSave: () => { if (editingProfile && !loading) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editingProfile) handleCancelEdit(); },
  });

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditToggle = () => {
    setSavedProfileData({
      alias_name: formData.alias_name,
      firstname: formData.firstname,
      middlename: formData.middlename,
      lastname: formData.lastname,
      telephone: formData.telephone,
    });
    setEditingProfile(true);
  };

  const handleCancelEdit = () => {
    setFormData(prev => ({
      ...prev,
      ...savedProfileData,
    }));
    setEditingProfile(false);
    setError('');
    setSuccess('');
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/api/user/profile');
        setRawResponse(response.data);
        const data = response.data.data || response.data;
        const info = data.user_info || data;
        setProfile({ ...data, firstname: info.firstname, middlename: info.middlename, lastname: info.lastname, telephone: info.telephone });
        setFormData(prev => ({
          ...prev,
          alias_name: data.alias_name || '',
          firstname: info.firstname || '',
          middlename: info.middlename || '',
          lastname: info.lastname || '',
          telephone: info.telephone || '',
          email: data.email || prev.email,
        }));
        setSavedProfileData({
          alias_name: data.alias_name || '',
          firstname: info.firstname || '',
          middlename: info.middlename || '',
          lastname: info.lastname || '',
          telephone: info.telephone || '',
        });
        setBusinessUnits(Array.isArray(data.business_unit) ? data.business_unit : []);
        // Update localStorage and auth context with fresh profile data
        localStorage.setItem('user', JSON.stringify(data));
        refreshUser();
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setFetchingProfile(false);
      }
    };

    fetchProfile();
  }, [refreshUser]);

  const getDisplayName = (): string => {
    if (profile?.firstname || profile?.lastname) {
      return [profile.firstname, profile.middlename, profile.lastname].filter(Boolean).join(' ');
    }
    return profile?.name || profile?.email || 'User';
  };

  const getUserInitials = (): string => {
    if (profile?.alias_name) {
      return profile.alias_name.toUpperCase();
    }
    if (profile?.email) {
      return profile.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    setSuccess('');
  };

  const handleProfileUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.put('/api/user/profile', {
        alias_name: formData.alias_name || null,
        firstname: formData.firstname,
        middlename: formData.middlename || null,
        lastname: formData.lastname,
        telephone: formData.telephone || null,
      });

      // Re-fetch profile to get fresh data
      const refreshed = await api.get('/api/user/profile');
      setRawResponse(refreshed.data);
      const data = refreshed.data.data || refreshed.data;
      const info = data.user_info || data;
      setProfile({ ...data, firstname: info.firstname, middlename: info.middlename, lastname: info.lastname, telephone: info.telephone });
      setFormData(prev => ({
        ...prev,
        alias_name: data.alias_name || '',
        firstname: info.firstname || '',
        middlename: info.middlename || '',
        lastname: info.lastname || '',
        telephone: info.telephone || '',
        email: data.email || prev.email,
      }));
      setSavedProfileData({
        alias_name: data.alias_name || '',
        firstname: info.firstname || '',
        middlename: info.middlename || '',
        lastname: info.lastname || '',
        telephone: info.telephone || '',
      });
      setBusinessUnits(Array.isArray(data.business_unit) ? data.business_unit : []);
      localStorage.setItem('user', JSON.stringify(data));
      refreshUser();
      setSuccess('Profile updated successfully!');
      toast.success('Profile updated successfully');
      setEditingProfile(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError('Failed to update profile: ' + (e.response?.data?.message || e.message));
      toast.error('Failed to update profile', { description: e.response?.data?.message || e.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validate passwords
    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      await api.put('/api/user/profile', {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword
      });

      // Clear password fields
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowPasswordDialog(false);
      setSuccess('Password changed successfully!');
      toast.success('Password changed successfully');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError('Failed to change password: ' + (e.response?.data?.message || e.message));
      toast.error('Failed to change password', { description: e.response?.data?.message || e.message });
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProfile) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Profile</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage your account settings and preferences</p>
          </div>
          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
            {/* Profile Overview Skeleton */}
            <Card className="md:col-span-1">
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="flex flex-col items-center space-y-4">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="space-y-2 w-full flex flex-col items-center">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="w-full pt-4 border-t space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Profile Information Skeleton */}
            <Card className="md:col-span-2">
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-52 mt-1" />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          {/* Business Units Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-56 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="border">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage your account settings and preferences</p>
        </div>

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 p-3 rounded-md" role="status" aria-live="polite">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
          {/* Profile Overview Card */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Profile Overview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">{getDisplayName()}</h3>
                {profile?.email && (
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                )}
                {(profile?.platform_role || profile?.role) && (
                  <Badge variant="secondary" className="capitalize">
                    {profile?.platform_role || profile?.role}
                  </Badge>
                )}
              </div>
              <div className="w-full pt-4 border-t">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Member since</span>
                    <span className="font-medium">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account ID</span>
                    <span className="font-medium">{profile?.id || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile Information Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>
                    {editingProfile ? 'Update your account details' : 'View your account details'}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!editingProfile && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)}>
                        <Lock className="mr-2 h-4 w-4" />
                        Change Password
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleEditToggle}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form ref={formRef} onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="alias_name">Alias Name</Label>
                  {editingProfile ? (
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="alias_name"
                        name="alias_name"
                        value={formData.alias_name}
                        onChange={handleChange}
                        placeholder="Alias name (optional)"
                        className="pl-9"
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 py-1 text-sm items-center">{formData.alias_name || '-'}</div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstname">First Name</Label>
                    {editingProfile ? (
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="firstname"
                          name="firstname"
                          value={formData.firstname}
                          onChange={handleChange}
                          placeholder="First name"
                          className="pl-9"
                        />
                      </div>
                    ) : (
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 py-1 text-sm items-center">{formData.firstname || '-'}</div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="middlename">Middle Name</Label>
                    {editingProfile ? (
                      <Input
                        id="middlename"
                        name="middlename"
                        value={formData.middlename}
                        onChange={handleChange}
                        placeholder="Middle name (optional)"
                      />
                    ) : (
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">{formData.middlename || '-'}</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastname">Last Name</Label>
                  {editingProfile ? (
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="lastname"
                        name="lastname"
                        value={formData.lastname}
                        onChange={handleChange}
                        placeholder="Last name"
                        className="pl-9"
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 py-1 text-sm items-center">{formData.lastname || '-'}</div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telephone">Telephone</Label>
                  {editingProfile ? (
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="telephone"
                        name="telephone"
                        type="tel"
                        value={formData.telephone}
                        onChange={handleChange}
                        placeholder="Phone number (optional)"
                        className="pl-9"
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 py-1 text-sm items-center">{formData.telephone || '-'}</div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 py-1 text-sm items-center">{formData.email || '-'}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>

                {editingProfile && (
                  <div className="flex gap-3 pt-4">
                    <Button type="submit" size="sm" disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Business Units Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Business Units
              </CardTitle>
              <CardDescription>
                {businessUnits.length > 0
                  ? `${businessUnits.length} business unit${businessUnits.length !== 1 ? 's' : ''} assigned to your account`
                  : 'No business units assigned'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {businessUnits.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No business units found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {businessUnits.map((bu) => (
                    <Card key={bu.id} className="border">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">{bu.name || '-'}</div>
                            <Badge variant="outline" className="text-xs mt-1">{bu.code}</Badge>
                          </div>
                          <Badge variant={bu.is_active ? 'success' : 'secondary'} className="text-[10px]">
                            {bu.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        {/* Change Password Dialog */}
        <Dialog open={showPasswordDialog} onOpenChange={(open) => {
          setShowPasswordDialog(open);
          if (!open) {
            setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
            setError('');
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>Update your password to keep your account secure</DialogDescription>
            </DialogHeader>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    placeholder="Enter current password"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    value={formData.newPassword}
                    onChange={handleChange}
                    placeholder="Enter new password"
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Password must be at least 6 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm new password"
                    className="pl-9"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setShowPasswordDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Debug Sheet - Development Only (floating button) */}
        {process.env.NODE_ENV === 'development' && !!rawResponse && (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="icon"
                className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
              >
                <Code className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                  API Response
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
                </SheetTitle>
                <SheetDescription className="text-xs sm:text-sm">
                  GET /api/user/profile
                </SheetDescription>
              </SheetHeader>
              <div className="mt-3 sm:mt-4">
                <div className="flex justify-end mb-2">
                  <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                    {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                    {copied ? 'Copied!' : 'Copy JSON'}
                  </Button>
                </div>
                <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                  {JSON.stringify(rawResponse, null, 2)}
                </pre>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </Layout>
  );
};

export default Profile;
