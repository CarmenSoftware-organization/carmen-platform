import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./hooks/useDarkMode";
import { I18nProvider } from "./hooks/useI18n";
import PrivateRoute from "./components/PrivateRoute";
import { FeatureFlagProvider } from "./context/FeatureFlagContext";
import AuthedRoute from "./components/AuthedRoute";
import ClusterAdminRoute from "./components/ClusterAdminRoute";
import { Toaster } from "sonner";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcuts";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Forbidden from "./pages/Forbidden";
import NotFound from "./pages/NotFound";
import { SEAT_CONFIG, BU_QUOTA_CONFIG } from "./pages/licenses/licenseKindConfig";
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
const ClusterAdminLicenses = lazy(() => import("./pages/clusterAdmin/ClusterAdminLicenses"));
const SubscriptionForm = lazy(() => import("./pages/licenses/SubscriptionForm"));
const LicensePurchaseForm = lazy(() => import("./pages/licenses/LicensePurchaseForm"));
const LicenseFeatureGroupManagement = lazy(() => import("./pages/LicenseFeatureGroupManagement"));
const LicenseFeatureManagement = lazy(() => import("./pages/LicenseFeatureManagement"));
const LicenseFeatureGroupEdit = lazy(() => import("./pages/LicenseFeatureGroupEdit"));
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
const FeatureFlagManagement = lazy(() => import("./pages/FeatureFlagManagement"));
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
      <I18nProvider>
        <AppContent />
      </I18nProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  return (
    <AuthProvider>
      <FeatureFlagProvider>
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
                <PrivateRoute requiredPermission="cluster.read" feature="clusters">
                  <ClusterManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/clusters/new"
              element={
                <PrivateRoute requiredPermission="cluster.create" feature="clusters">
                  <ClusterEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/clusters/:id/edit"
              element={
                <PrivateRoute requiredPermission="cluster.update" feature="clusters">
                  <ClusterEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/applications"
              element={
                <PrivateRoute requiredPermission="application.read" feature="applications">
                  <ApplicationManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/applications/new"
              element={
                <PrivateRoute requiredPermission="application.create" feature="applications">
                  <ApplicationEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/applications/:id/edit"
              element={
                <PrivateRoute requiredPermission="application.update" feature="applications">
                  <ApplicationEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units"
              element={
                <PrivateRoute requiredPermission="cluster.read" feature="business_units">
                  <BusinessUnitManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units/new"
              element={
                <PrivateRoute requiredPermission="cluster.create" feature="business_units">
                  <BusinessUnitEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units/:id/edit"
              element={
                <PrivateRoute requiredPermission="cluster.update" feature="business_units">
                  <BusinessUnitEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses"
              element={
                <PrivateRoute requiredPermission="subscription.read" feature="licenses">
                  <LicenseCenter />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/:clusterId"
              element={
                <PrivateRoute requiredPermission="subscription.read" feature="licenses">
                  <ClusterLicenseDetail />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/subscriptions/new"
              element={
                <PrivateRoute requiredPermission="subscription.manage" feature="licenses">
                  <SubscriptionForm />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/subscriptions/:id/edit"
              element={
                <PrivateRoute requiredPermission="subscription.read" feature="licenses">
                  <SubscriptionForm />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/seats/new"
              element={
                <PrivateRoute requiredPermission="subscription.manage" feature="licenses">
                  <LicensePurchaseForm config={SEAT_CONFIG} mode="create" />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/seats/:id/edit"
              element={
                <PrivateRoute requiredPermission="subscription.read" feature="licenses">
                  <LicensePurchaseForm config={SEAT_CONFIG} mode="edit" />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/bu-quota/new"
              element={
                <PrivateRoute requiredPermission="subscription.manage" feature="licenses">
                  <LicensePurchaseForm config={BU_QUOTA_CONFIG} mode="create" />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/bu-quota/:id/edit"
              element={
                <PrivateRoute requiredPermission="subscription.read" feature="licenses">
                  <LicensePurchaseForm config={BU_QUOTA_CONFIG} mode="edit" />
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
                <PrivateRoute requiredPermission="cluster.read" feature="tenant_migrations">
                  <TenantMigrationManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/tenant-imports"
              element={
                <PrivateRoute requiredPermission="data_import.manage" feature="tenant_imports">
                  <TenantImportWizard />
                </PrivateRoute>
              }
            />
            <Route
              path="/users"
              element={
                <PrivateRoute requiredPermission="user.read" feature="users">
                  <UserManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/users/new"
              element={
                <PrivateRoute requiredPermission="user.create" feature="users">
                  <UserEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/users/:id/edit"
              element={
                <PrivateRoute requiredPermission="user.update" feature="users">
                  <UserEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/license-features"
              element={
                <PrivateRoute requiredPermission="license_feature.read" feature="license_features">
                  <LicenseFeatureManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/license-feature-groups"
              element={
                <PrivateRoute requiredPermission="license_feature_group.read" feature="license_feature_groups">
                  <LicenseFeatureGroupManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/license-feature-groups/new"
              element={
                <PrivateRoute requiredPermission="license_feature_group.manage" feature="license_feature_groups">
                  <LicenseFeatureGroupEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/license-feature-groups/:id/edit"
              element={
                <PrivateRoute requiredPermission="license_feature_group.read" feature="license_feature_groups">
                  <LicenseFeatureGroupEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-form-groups"
              element={
                <PrivateRoute requiredPermission="report_template.read" feature="report_form_groups">
                  <ReportFormGroupManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates"
              element={
                <PrivateRoute requiredPermission="report_template.read" feature="report_templates">
                  <ReportTemplateManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates/new"
              element={
                <PrivateRoute requiredPermission="report_template.create" feature="report_templates">
                  <ReportTemplateEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates/:id/edit"
              element={
                <PrivateRoute requiredPermission="report_template.update" feature="report_templates">
                  <ReportTemplateEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/news"
              element={
                <PrivateRoute requiredPermission="news.read" feature="news">
                  <NewsManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/news/new"
              element={
                <PrivateRoute requiredPermission="news.create" feature="news">
                  <NewsEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/news/:id/edit"
              element={
                <PrivateRoute requiredPermission="news.update" feature="news">
                  <NewsEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/broadcasts"
              element={
                <PrivateRoute requiredPermission="broadcast.read" feature="broadcasts">
                  <BroadcastManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/broadcasts/new"
              element={
                <PrivateRoute requiredPermission="broadcast.send" feature="broadcasts">
                  <BroadcastCompose />
                </PrivateRoute>
              }
            />
            <Route
              path="/broadcasts/:id/edit"
              element={
                <PrivateRoute requiredPermission="broadcast.read" feature="broadcasts">
                  <BroadcastEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles"
              element={
                <PrivateRoute requiredPermission="platform_role.read" feature="platform_roles">
                  <RoleManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles/new"
              element={
                <PrivateRoute requiredPermission="platform_role.create" feature="platform_roles">
                  <RoleEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles/:id/edit"
              element={
                <PrivateRoute requiredPermission="platform_role.update" feature="platform_roles">
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
                <PrivateRoute requireSuperAdmin feature="super_admins">
                  <SuperAdminManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/user-platform"
              element={
                <PrivateRoute requiredPermission="user_platform.read" feature="user_platform">
                  <UserPlatformManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/user-platform/:userId"
              element={
                <PrivateRoute requiredPermission="user_platform.read" feature="user_platform">
                  <UserPlatformEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/sql-workbench"
              element={
                <PrivateRoute requiredPermission="sql_workbench.read" feature="sql_workbench">
                  <SqlWorkbench />
                </PrivateRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <PrivateRoute requiredPermission="activity_event.read" feature="usage_analytics">
                  <UsageAnalytics />
                </PrivateRoute>
              }
            />
            <Route
              path="/activity-events"
              element={
                <PrivateRoute requiredPermission="activity_event.detail" feature="activity_events">
                  <ActivityEventManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/email-settings"
              element={
                <PrivateRoute requiredPermission="email_setting.read" feature="email_settings">
                  <EmailSettingManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/configs"
              element={
                <PrivateRoute requiredPermission="platform_config.read" feature="platform_config">
                  <PlatformConfigManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/database-pools"
              element={
                <PrivateRoute requiredPermission="database_pool.read" feature="database_pools">
                  <DatabasePoolManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/database-pools/new"
              element={
                <PrivateRoute requiredPermission="database_pool.read" feature="database_pools">
                  <DatabasePoolEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/database-pools/:id/edit"
              element={
                <PrivateRoute requiredPermission="database_pool.read" feature="database_pools">
                  <DatabasePoolEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/features"
              element={
                <PrivateRoute requiredPermission="feature_flag.manage">
                  <FeatureFlagManagement />
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
              element={<ClusterAdminRoute feature="cluster_admin_cluster"><ClusterProfile /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/business-units"
              element={<ClusterAdminRoute feature="cluster_admin_business_units"><ClusterAdminBusinessUnitList /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/business-units/:buId/edit"
              element={<ClusterAdminRoute feature="cluster_admin_business_units"><ClusterAdminBusinessUnitForm /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/users"
              element={<ClusterAdminRoute feature="cluster_admin_users"><ClusterAdminUsers /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/licenses"
              element={<ClusterAdminRoute feature="cluster_admin_licenses"><ClusterAdminLicenses /></ClusterAdminRoute>}
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
      </FeatureFlagProvider>
    </AuthProvider>
  );
}

/** เก็บ id จาก path เก่าแล้วส่งต่อไป path ใหม่ — บุ๊กมาร์กหน้าแก้ใบสัญญาจึงยังใช้ได้ */
const SubscriptionEditRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/licenses/subscriptions/${id}/edit`} replace />;
};

export default App;
