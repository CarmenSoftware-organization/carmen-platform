import React from 'react';
import { useAuth } from '../context/AuthContext';

interface CanProps {
  permission: string;
  clusterId?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Renders children only when the current user holds `permission`
 * (optionally scoped to `clusterId`). Renders `fallback` (default null) otherwise.
 */
const Can: React.FC<CanProps> = ({ permission, clusterId, fallback = null, children }) => {
  const { hasPermission } = useAuth();
  return <>{hasPermission(permission, clusterId ? { clusterId } : undefined) ? children : fallback}</>;
};

export default Can;
