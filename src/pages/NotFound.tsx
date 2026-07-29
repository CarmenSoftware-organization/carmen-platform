import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileQuestion, Home, LayoutDashboard } from 'lucide-react';
import Layout from '../components/Layout';
import { StatusPage } from '../components/StatusPage';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useBackOrFallback } from '../hooks/useBackOrFallback';

/**
 * 404 catch-all. Unlike the 403 page this is reachable while logged out, so the
 * app shell is conditional: Layout reads `user?.…` with optional chaining and
 * would happily render an empty sidebar and an avatar reading "User" to an
 * anonymous visitor.
 *
 * `loading` is gated before anything renders — otherwise the anonymous variant
 * flashes for a frame while AuthContext resolves, then swaps to the shell.
 */
const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const home = isAuthenticated ? '/dashboard' : '/';
  // Called unconditionally — must not sit behind the `loading` return below.
  const goBack = useBackOrFallback(home);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const status = (
    <StatusPage
      icon={FileQuestion}
      tone="neutral"
      code="404"
      title="Page Not Found"
      description="The page you're looking for doesn't exist or may have been moved."
      actions={
        <>
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button variant="ghost" onClick={() => navigate(home)}>
            {isAuthenticated ? (
              <LayoutDashboard className="mr-2 h-4 w-4" />
            ) : (
              <Home className="mr-2 h-4 w-4" />
            )}
            {isAuthenticated ? 'Go to Dashboard' : 'Go to Home'}
          </Button>
        </>
      }
    />
  );

  if (isAuthenticated) {
    return <Layout>{status}</Layout>;
  }

  return <div className="min-h-screen flex items-center justify-center p-4">{status}</div>;
};

export default NotFound;
