import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ClusterManagement from "./pages/ClusterManagement";
import ClusterEdit from "./pages/ClusterEdit";
import BusinessUnitManagement from "./pages/BusinessUnitManagement";
import BusinessUnitEdit from "./pages/BusinessUnitEdit";
import UserManagement from "./pages/UserManagement";
import UserEdit from "./pages/UserEdit";
import Profile from "./pages/Profile";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
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
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
