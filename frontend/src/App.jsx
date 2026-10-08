
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Auth
import { AuthProvider, useAuth } from './context/AuthContext';

// Existing pages (untouched)
import Login from './pages/Login';
import Home from './pages/Home';
import Transmitter from './pages/Transmitter';
import AdminRouteManager from './pages/AdminRouteManager';

// The existing LiveTracker (legacy — untouched, accessible via /live-tracker)
import LegacyLiveTracker from './pages/LiveTracker';

// New role-based pages
import OperatorDashboard from './pages/operator/OperatorDashboard';
import DriverDashboard from './pages/driver/DriverDashboard';
import ParentDashboard from './pages/parent/ParentDashboard';

// ─── ProtectedRoute ───────────────────────────────────────────────────────────
// Redirects to login if not authenticated.
// If roles are specified, also enforces role check.
const ProtectedRoute = ({ children, roles }) => {
  const { isAuthenticated, role } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (roles && !roles.includes(role)) {
    // Redirect to the correct dashboard for their actual role
    if (role === 'operator') return <Navigate to="/operator" replace />;
    if (role === 'driver') return <Navigate to="/driver" replace />;
    if (role === 'parent') return <Navigate to="/parent" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
};

// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
  return (
    <AuthProvider>
      <Router>
        <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif' }}>
          <Routes>
            {/* ── Public ── */}
            <Route path="/" element={<Login />} />

            {/* ── Legacy / existing routes — preserved as-is ── */}
            <Route path="/home" element={<Home />} />
            <Route path="/transmitter" element={<Transmitter />} />
            <Route path="/admin" element={<AdminRouteManager />} />
            <Route path="/live-tracker" element={<LegacyLiveTracker />} />
            {/* Legacy redirects */}
            <Route path="/receiver" element={<Navigate to="/live-tracker" replace />} />
            <Route path="/bus-tracker" element={<Navigate to="/live-tracker" replace />} />

            {/* ── New role-based routes ── */}
            <Route
              path="/operator"
              element={
                <ProtectedRoute roles={['operator']}>
                  <OperatorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver"
              element={
                <ProtectedRoute roles={['driver']}>
                  <DriverDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/parent"
              element={
                <ProtectedRoute roles={['parent']}>
                  <ParentDashboard />
                </ProtectedRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;