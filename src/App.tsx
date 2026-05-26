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
const Profile = lazy(() => import("./pages/Profile"));

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
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <ClusterManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/clusters/new"
              element={
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <ClusterEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/clusters/:id/edit"
              element={
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <ClusterEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units"
              element={
                <PrivateRoute>
                  <BusinessUnitManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units/new"
              element={
                <PrivateRoute>
                  <BusinessUnitEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/business-units/:id/edit"
              element={
                <PrivateRoute>
                  <BusinessUnitEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/users"
              element={
                <PrivateRoute>
                  <UserManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/users/new"
              element={
                <PrivateRoute>
                  <UserEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/users/:id/edit"
              element={
                <PrivateRoute>
                  <UserEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates"
              element={
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <ReportTemplateManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates/new"
              element={
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <ReportTemplateEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/report-templates/:id/edit"
              element={
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <ReportTemplateEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/print-template-mapping"
              element={
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <PrintTemplateMappingManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/print-template-mapping/new"
              element={
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <PrintTemplateMappingEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/print-template-mapping/:id/edit"
              element={
                <PrivateRoute allowedRoles={["platform_admin", "support_manager", "support_staff"]}>
                  <PrintTemplateMappingEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/news"
              element={
                <PrivateRoute allowedRoles={["platform_admin"]}>
                  <NewsManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/news/new"
              element={
                <PrivateRoute allowedRoles={["platform_admin"]}>
                  <NewsEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/news/:id/edit"
              element={
                <PrivateRoute allowedRoles={["platform_admin"]}>
                  <NewsEdit />
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
