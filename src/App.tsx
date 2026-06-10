import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import { Toaster } from "sonner";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcuts";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import "./App.css";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const ClusterManagement = lazy(() => import("./pages/ClusterManagement"));
const ClusterEdit = lazy(() => import("./pages/ClusterEdit"));
const ApplicationManagement = lazy(() => import("./pages/ApplicationManagement"));
const ApplicationEdit = lazy(() => import("./pages/ApplicationEdit"));
const BusinessUnitManagement = lazy(() => import("./pages/BusinessUnitManagement"));
const BusinessUnitEdit = lazy(() => import("./pages/BusinessUnitEdit"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const UserEdit = lazy(() => import("./pages/UserEdit"));
const ReportTemplateManagement = lazy(() => import("./pages/ReportTemplateManagement"));
const ReportTemplateEdit = lazy(() => import("./pages/ReportTemplateEdit"));
const PrintTemplateMappingManagement = lazy(() => import("./pages/PrintTemplateMappingManagement"));
const PrintTemplateMappingEdit = lazy(() => import("./pages/PrintTemplateMappingEdit"));
const NewsManagement = lazy(() => import("./pages/NewsManagement"));
const NewsEdit = lazy(() => import("./pages/NewsEdit"));
const BroadcastCompose = lazy(() => import("./pages/BroadcastCompose"));
const Profile = lazy(() => import("./pages/Profile"));
const Changelog = lazy(() => import("./pages/Changelog"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));
const RoleEdit = lazy(() => import("./pages/RoleEdit"));
const PermissionCatalog = lazy(() => import("./pages/PermissionCatalog"));

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background bg-mesh">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

function App() {
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
              path="/print-template-mapping"
              element={
                <PrivateRoute requiredPermission="print_template_mapping.read">
                  <PrintTemplateMappingManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/print-template-mapping/new"
              element={
                <PrivateRoute requiredPermission="print_template_mapping.create">
                  <PrintTemplateMappingEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/print-template-mapping/:id/edit"
              element={
                <PrivateRoute requiredPermission="print_template_mapping.update">
                  <PrintTemplateMappingEdit />
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
              path="/broadcasts/new"
              element={
                <PrivateRoute requiredPermission="broadcast.send">
                  <BroadcastCompose />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles"
              element={
                <PrivateRoute requiredPermission="role.read">
                  <RoleManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles/new"
              element={
                <PrivateRoute requiredPermission="role.create">
                  <RoleEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/roles/:id/edit"
              element={
                <PrivateRoute requiredPermission="role.update">
                  <RoleEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/platform/permissions"
              element={
                <PrivateRoute requiredPermission="role.read">
                  <PermissionCatalog />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          <Toaster position="top-center" richColors toastOptions={{ className: 'text-sm', duration: 4000 }} />
          <KeyboardShortcutsHelp />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
