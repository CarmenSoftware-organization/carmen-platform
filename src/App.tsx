import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./hooks/useDarkMode";
import PrivateRoute from "./components/PrivateRoute";
import AuthedRoute from "./components/AuthedRoute";
import ClusterAdminRoute from "./components/ClusterAdminRoute";
import { Toaster } from "sonner";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcuts";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Forbidden from "./pages/Forbidden";
import NotFound from "./pages/NotFound";
import "./App.css";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const ClusterManagement = lazy(() => import("./pages/ClusterManagement"));
const ClusterEdit = lazy(() => import("./pages/ClusterEdit"));
const ApplicationManagement = lazy(() => import("./pages/ApplicationManagement"));
const ApplicationEdit = lazy(() => import("./pages/ApplicationEdit"));
const BusinessUnitManagement = lazy(() => import("./pages/BusinessUnitManagement"));
const BusinessUnitEdit = lazy(() => import("./pages/BusinessUnitEdit"));
const LicenseCenter = lazy(() => import("./pages/licenses/LicenseCenter"));
const ClusterLicenseDetail = lazy(() => import("./pages/licenses/ClusterLicenseDetail"));
const SubscriptionForm = lazy(() => import("./pages/licenses/SubscriptionForm"));
const TenantMigrationManagement = lazy(() => import("./pages/TenantMigrationManagement"));
const TenantImportWizard = lazy(() => import("./pages/TenantImportWizard"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const UserEdit = lazy(() => import("./pages/UserEdit"));
const ReportTemplateManagement = lazy(() => import("./pages/ReportTemplateManagement"));
const ReportTemplateEdit = lazy(() => import("./pages/ReportTemplateEdit"));
const ReportFormGroupManagement = lazy(() => import("./pages/ReportFormGroupManagement"));
const NewsManagement = lazy(() => import("./pages/NewsManagement"));
const NewsEdit = lazy(() => import("./pages/NewsEdit"));
const BroadcastManagement = lazy(() => import("./pages/BroadcastManagement"));
const BroadcastCompose = lazy(() => import("./pages/BroadcastCompose"));
const BroadcastEdit = lazy(() => import("./pages/BroadcastEdit"));
const Profile = lazy(() => import("./pages/Profile"));
const Changelog = lazy(() => import("./pages/Changelog"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));
const RoleEdit = lazy(() => import("./pages/RoleEdit"));
const PermissionCatalog = lazy(() => import("./pages/PermissionCatalog"));
const SuperAdminManagement = lazy(() => import("./pages/SuperAdminManagement"));
const UserPlatformManagement = lazy(() => import("./pages/UserPlatformManagement"));
const UserPlatformEdit = lazy(() => import("./pages/UserPlatformEdit"));
const SqlWorkbench = lazy(() => import("./pages/sqlWorkbench/SqlWorkbench"));
const UsageAnalytics = lazy(() => import("./pages/UsageAnalytics"));
const ActivityEventManagement = lazy(() => import("./pages/ActivityEventManagement"));
const EmailSettingManagement = lazy(() => import("./pages/EmailSettingManagement"));
const PlatformConfigManagement = lazy(() => import("./pages/PlatformConfigManagement"));
const DatabasePoolManagement = lazy(() => import("./pages/DatabasePoolManagement"));
const DatabasePoolEdit = lazy(() => import("./pages/DatabasePoolEdit"));
const ClusterAdminEntry = lazy(() => import("./pages/clusterAdmin/ClusterAdminEntry"));
const ClusterProfile = lazy(() => import("./pages/clusterAdmin/ClusterProfile"));
const ClusterAdminBusinessUnitList = lazy(() => import("./pages/clusterAdmin/BusinessUnitList"));
const ClusterAdminBusinessUnitForm = lazy(() => import("./pages/clusterAdmin/BusinessUnitForm"));
const ClusterAdminUsers = lazy(() => import("./pages/clusterAdmin/ClusterUsers"));

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Suspense fallback={<RouteLoader />}>
            <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/clusters"
              element={
                <PrivateRoute requiredPermission="cluster.read">
                  <ClusterManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/clusters/new"
              element={
                <PrivateRoute requiredPermission="cluster.create">
                  <ClusterEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/clusters/:id/edit"
              element={
                <PrivateRoute requiredPermission="cluster.update">
                  <ClusterEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/applications"
              element={
                <PrivateRoute requiredPermission="application.read">
                  <ApplicationManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/applications/new"
              element={
                <PrivateRoute requiredPermission="application.create">
                  <ApplicationEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/applications/:id/edit"
              element={
                <PrivateRoute requiredPermission="application.update">
                  <ApplicationEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units"
              element={
                <PrivateRoute requiredPermission="cluster.read">
                  <BusinessUnitManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units/new"
              element={
                <PrivateRoute requiredPermission="cluster.create">
                  <BusinessUnitEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units/:id/edit"
              element={
                <PrivateRoute requiredPermission="cluster.update">
                  <BusinessUnitEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses"
              element={
                <PrivateRoute requiredPermission="subscription.read">
                  <LicenseCenter />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/:clusterId"
              element={
                <PrivateRoute requiredPermission="subscription.read">
                  <ClusterLicenseDetail />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/subscriptions/new"
              element={
                <PrivateRoute requiredPermission="subscription.manage">
                  <SubscriptionForm />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/subscriptions/:id/edit"
              element={
                <PrivateRoute requiredPermission="subscription.read">
                  <SubscriptionForm />
                </PrivateRoute>
              }
            />
            {/* ลิงก์และบุ๊กมาร์กเก่าต้องไม่ตาย — `/subscriptions/:id/edit` แปลงเป็นปลายทางใหม่ที่มี id เดิม */}
            <Route path="/subscriptions" element={<Navigate to="/licenses" replace />} />
            <Route path="/subscriptions/new" element={<Navigate to="/licenses/subscriptions/new" replace />} />
            <Route path="/subscriptions/:id/edit" element={<SubscriptionEditRedirect />} />
            <Route
              path="/tenant-migrations"
              element={
                <PrivateRoute requiredPermission="cluster.read">
                  <TenantMigrationManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/tenant-imports"
              element={
                <PrivateRoute requiredPermission="data_import.manage">
                  <TenantImportWizard />
                </PrivateRoute>
              }
            />
            <Route
              path="/users"
              element={
                <PrivateRoute requiredPermission="user.read">
                  <UserManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/users/new"
              element={
                <PrivateRoute requiredPermission="user.create">
                  <UserEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/users/:id/edit"
              element={
                <PrivateRoute requiredPermission="user.update">
                  <UserEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-form-groups"
              element={
                <PrivateRoute requiredPermission="report_template.read">
                  <ReportFormGroupManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates"
              element={
                <PrivateRoute requiredPermission="report_template.read">
                  <ReportTemplateManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates/new"
              element={
                <PrivateRoute requiredPermission="report_template.create">
                  <ReportTemplateEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates/:id/edit"
              element={
                <PrivateRoute requiredPermission="report_template.update">
                  <ReportTemplateEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/news"
              element={
                <PrivateRoute requiredPermission="news.read">
                  <NewsManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/news/new"
              element={
                <PrivateRoute requiredPermission="news.create">
                  <NewsEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/news/:id/edit"
              element={
                <PrivateRoute requiredPermission="news.update">
                  <NewsEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/broadcasts"
              element={
                <PrivateRoute requiredPermission="broadcast.read">
                  <BroadcastManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/broadcasts/new"
              element={
                <PrivateRoute requiredPermission="broadcast.send">
                  <BroadcastCompose />
                </PrivateRoute>
              }
            />
            <Route
              path="/broadcasts/:id/edit"
              element={
                <PrivateRoute requiredPermission="broadcast.read">
                  <BroadcastEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles"
              element={
                <PrivateRoute requiredPermission="platform_role.read">
                  <RoleManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles/new"
              element={
                <PrivateRoute requiredPermission="platform_role.create">
                  <RoleEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles/:id/edit"
              element={
                <PrivateRoute requiredPermission="platform_role.update">
                  <RoleEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/category-permissions"
              element={
                <PrivateRoute>
                  <PermissionCatalog />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/super-admins"
              element={
                <PrivateRoute requireSuperAdmin>
                  <SuperAdminManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/user-platform"
              element={
                <PrivateRoute requiredPermission="user_platform.read">
                  <UserPlatformManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/user-platform/:userId"
              element={
                <PrivateRoute requiredPermission="user_platform.read">
                  <UserPlatformEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/sql-workbench"
              element={
                <PrivateRoute requiredPermission="sql_workbench.read">
                  <SqlWorkbench />
                </PrivateRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <PrivateRoute requiredPermission="activity_event.read">
                  <UsageAnalytics />
                </PrivateRoute>
              }
            />
            <Route
              path="/activity-events"
              element={
                <PrivateRoute requiredPermission="activity_event.detail">
                  <ActivityEventManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/email-settings"
              element={
                <PrivateRoute requiredPermission="email_setting.read">
                  <EmailSettingManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/configs"
              element={
                <PrivateRoute requiredPermission="platform_config.read">
                  <PlatformConfigManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/database-pools"
              element={
                <PrivateRoute requiredPermission="database_pool.read">
                  <DatabasePoolManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/database-pools/new"
              element={
                <PrivateRoute requiredPermission="database_pool.read">
                  <DatabasePoolEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/database-pools/:id/edit"
              element={
                <PrivateRoute requiredPermission="database_pool.read">
                  <DatabasePoolEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route
              path="/403"
              element={
                <PrivateRoute>
                  <Forbidden />
                </PrivateRoute>
              }
            />
            <Route
              path="/cluster-admin"
              element={<AuthedRoute><ClusterAdminEntry /></AuthedRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/cluster"
              element={<ClusterAdminRoute><ClusterProfile /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/business-units"
              element={<ClusterAdminRoute><ClusterAdminBusinessUnitList /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/business-units/:buId/edit"
              element={<ClusterAdminRoute><ClusterAdminBusinessUnitForm /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/users"
              element={<ClusterAdminRoute><ClusterAdminUsers /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/licenses"
              element={<ClusterAdminRoute><ClusterLicenseDetail readOnlyShell /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/profile"
              element={<ClusterAdminRoute><Profile /></ClusterAdminRoute>}
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <Toaster position="top-center" richColors toastOptions={{ className: 'text-sm', duration: 4000 }} />
          <KeyboardShortcutsHelp />
        </div>
      </Router>
    </AuthProvider>
  );
}

/** เก็บ id จาก path เก่าแล้วส่งต่อไป path ใหม่ — บุ๊กมาร์กหน้าแก้ใบสัญญาจึงยังใช้ได้ */
const SubscriptionEditRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/licenses/subscriptions/${id}/edit`} replace />;
};

export default App;
