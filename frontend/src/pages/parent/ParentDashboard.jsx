import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import RouteManager from './RouteManager';
import LiveTracker from './LiveTracker';
import { LogOut, Map, Navigation } from 'lucide-react';

const ParentDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('route'); // 'route' | 'tracker'

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>👨‍👧 Parent Dashboard</h1>
          <p style={styles.headerSub}>Welcome, {user?.name}</p>
        </div>
        <button id="btn-logout" style={styles.logoutBtn} onClick={handleLogout}>
          <LogOut size={16} /> <span>Logout</span>
        </button>
      </header>

      {/* Content */}
      <div style={styles.content}>
        {activeTab === 'route' ? <RouteManager /> : <LiveTracker />}
      </div>

      {/* Bottom Navigation */}
      <nav style={styles.bottomNav}>
        <button
          id="nav-route"
          style={{ ...styles.navBtn, ...(activeTab === 'route' ? styles.navBtnActive : {}) }}
          onClick={() => setActiveTab('route')}
        >
          <Map size={20} />
          <span style={styles.navLabel}>Route Setup</span>
        </button>
        <button
          id="nav-tracker"
          style={{ ...styles.navBtn, ...(activeTab === 'tracker' ? styles.navBtnActive : {}) }}
          onClick={() => setActiveTab('tracker')}
        >
          <Navigation size={20} />
          <span style={styles.navLabel}>Live Tracker</span>
        </button>
      </nav>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc',
    display: 'flex', flexDirection: 'column'
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1.25rem 1.5rem', backgroundColor: '#1e293b', borderBottom: '1px solid #334155'
  },
  headerTitle: { margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#38bdf8' },
  headerSub: { margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#94a3b8' },
  logoutBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    backgroundColor: 'transparent', border: '1px solid #334155',
    color: '#94a3b8', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
  },
  content: { flex: 1, overflowY: 'auto', paddingBottom: '72px' },
  bottomNav: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    display: 'flex', backgroundColor: '#1e293b', borderTop: '1px solid #334155',
    padding: '0.5rem 0'
  },
  navBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#64748b', padding: '0.5rem', transition: 'color 0.2s'
  },
  navBtnActive: { color: '#38bdf8' },
  navLabel: { fontSize: '0.7rem', fontWeight: '500' },
};

export default ParentDashboard;
