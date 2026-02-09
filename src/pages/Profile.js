import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { User, Mail, Lock, Save, CheckCircle2, Code, Phone, Copy, Check } from 'lucide-react';

const Profile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(user);
  const [formData, setFormData] = useState({
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
  const [rawResponse, setRawResponse] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCopyJson = (data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/api/user/profile');
        setRawResponse(response.data);
        const data = response.data.data || response.data;
        const userInfo = data.user_info || {};
        setProfile(data);
        setFormData(prev => ({
          ...prev,
          firstname: userInfo.firstname || '',
          middlename: userInfo.middlename || '',
          lastname: userInfo.lastname || '',
          telephone: userInfo.telephone || '',
          email: data.email || prev.email,
        }));
        // Update localStorage with fresh profile data
        localStorage.setItem('user', JSON.stringify(data));
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setFetchingProfile(false);
      }
    };

    fetchProfile();
  }, []);

  const getDisplayName = () => {
    const info = profile?.user_info;
    if (info?.firstname || info?.lastname) {
      return [info.firstname, info.middlename, info.lastname].filter(Boolean).join(' ');
    }
    return profile?.name || profile?.email || 'User';
  };

  const getUserInitials = () => {
    if (profile?.alias_name) {
      return profile.alias_name.toUpperCase();
    }
    if (profile?.email) {
      return profile.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    setSuccess('');
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.put('/api/user/profile', {
        user_info: {
          firstname: formData.firstname,
          middlename: formData.middlename,
          lastname: formData.lastname,
          telephone: formData.telephone || null,
        }
      });

      const updatedData = response.data.data || response.data;
      setRawResponse(response.data);
      setProfile(updatedData);
      setSuccess('Profile updated successfully!');

      localStorage.setItem('user', JSON.stringify(updatedData));
    } catch (err) {
      setError('Failed to update profile: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
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

      setSuccess('Password changed successfully!');

      // Clear password fields
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err) {
      setError('Failed to change password: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProfile) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
            <p className="text-muted-foreground mt-2">Loading profile...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground mt-2">Manage your account settings and preferences</p>
        </div>

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 p-3 rounded-md">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
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
                {profile?.role && (
                  <Badge variant="secondary" className="capitalize">
                    {profile.role}
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
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your account details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstname">First Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="firstname"
                        name="firstname"
                        value={formData.firstname}
                        onChange={handleChange}
                        placeholder="First name"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="middlename">Middle Name</Label>
                    <Input
                      id="middlename"
                      name="middlename"
                      value={formData.middlename}
                      onChange={handleChange}
                      placeholder="Middle name (optional)"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastname">Last Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lastname"
                      name="lastname"
                      value={formData.lastname}
                      onChange={handleChange}
                      placeholder="Last name"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telephone">Telephone</Label>
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="Email address"
                      className="pl-9"
                      disabled
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>

                <div className="pt-4">
                  <Button type="submit" disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password to keep your account secure</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
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

              <div className="pt-4">
                <Button type="submit" disabled={loading} variant="secondary">
                  <Lock className="mr-2 h-4 w-4" />
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Debug Sheet - Development Only (floating button) */}
        {process.env.NODE_ENV === 'development' && rawResponse && (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="icon"
                className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
              >
                <Code className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  API Response
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
                </SheetTitle>
                <SheetDescription>
                  GET /api/user/profile
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <div className="flex justify-end mb-2">
                  <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                    {copied ? <Check className="mr-2 h-3 w-3" /> : <Copy className="mr-2 h-3 w-3" />}
                    {copied ? 'Copied!' : 'Copy JSON'}
                  </Button>
                </div>
                <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-[calc(100vh-10rem)]">
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
