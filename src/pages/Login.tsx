import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import type { LoginCredentials } from '../types';

const Login: React.FC = () => {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(credentials);

    if (result.success) {
      navigate('/dashboard', { replace: true });
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #ede9fe 100%)',
      }}
    >
      {/* Floating pastel orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-sky-200/30 blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative border-white/60"
        style={{
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 8px 32px rgba(59, 130, 246, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        }}
      >
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-white font-bold text-2xl">C</span>
            </div>
          </div>
          <CardTitle className="text-3xl text-center text-blue-900">Carmen Platform</CardTitle>
          <CardDescription className="text-center text-base text-blue-500">
            Enter your credentials to access the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-blue-800">Email</Label>
              <Input
                type="email"
                id="email"
                name="email"
                value={credentials.email}
                onChange={handleChange}
                required
                placeholder="Enter your email"
                className="bg-white/60 border-blue-200 text-blue-900 placeholder:text-blue-300 focus-visible:ring-blue-400/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-blue-800">Password</Label>
              <Input
                type="password"
                id="password"
                name="password"
                value={credentials.password}
                onChange={handleChange}
                required
                placeholder="Enter your password"
                className="bg-white/60 border-blue-200 text-blue-900 placeholder:text-blue-300 focus-visible:ring-blue-400/50"
              />
            </div>

            {error && (
              <div className={`text-sm p-3 rounded-lg ${
                error.includes('Access Denied')
                  ? 'text-red-700 bg-red-100 border border-red-300 font-medium'
                  : 'text-red-600 bg-red-50 border border-red-200'
              }`}>
                {error.includes('Access Denied') && (
                  <div className="font-bold text-red-800 mb-1">Access Denied</div>
                )}
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>

            <div className="text-center">
              <Link
                to="/"
                className="text-sm text-blue-400 hover:text-blue-600 transition-colors"
              >
                Back to home
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
