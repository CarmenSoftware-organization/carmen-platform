import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from './Layout';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ShieldX, ArrowLeft } from 'lucide-react';

const AccessDenied: React.FC = () => {
  const navigate = useNavigate();
  const { platformRole } = useAuth();

  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <ShieldX className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <CardTitle className="text-2xl text-red-600">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Your role <span className="font-semibold text-foreground">"{platformRole}"</span> does not have permission to access this page.
            </p>
            <Button onClick={() => navigate('/dashboard')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, hasRole } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !hasRole(allowedRoles)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
