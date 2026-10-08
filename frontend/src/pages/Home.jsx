
import React, { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../context/UserContext';
import { Radio, LogOut, Smartphone, User, Bus, Settings } from 'lucide-react';

const Home = () => {
  const { deviceInfo, logout } = useContext(UserContext);
  const navigate = useNavigate();

  // Redirect to Login if no device session exists
  useEffect(() => {
    if (!deviceInfo) {
      navigate('/');
    }
  }, [deviceInfo, navigate]);

  if (!deviceInfo) return null;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header Section */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Select Operation Mode</h2>
            <p style={styles.subtitle}>Choose how this device will participate in tracking</p>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn} title="Logout">
            <LogOut size={18} />
          </button>
        </div>

        {/* User Info Badge */}
        <div style={styles.userBadge}>
          <div style={styles.badgeItem}>
            <User size={16} style={{ color: '#38bdf8' }} />
            <span>{deviceInfo.username}</span>
          </div>
          <span style={styles.divider}>•</span>
          <div style={styles.badgeItem}>
            <Smartphone size={16} style={{ color: '#38bdf8' }} />
            <span>{deviceInfo.device_name}</span>
          </div>
        </div>

        {/* Mode Selection Cards */}
        <div style={styles.grid}>
          {/* Transmitter Option */}
          <div style={styles.modeCard} onClick={() => navigate('/transmitter')}>
            <div style={{ ...styles.iconContainer, backgroundColor: 'rgba(14, 165, 233, 0.15)' }}>
              <Radio size={32} style={{ color: '#38bdf8' }} />
            </div>
            <h3 style={styles.modeTitle}>Transmitter</h3>
            <p style={styles.modeDesc}>
              Broadcasting GPS coordinates every second to the backend server.
            </p>
            <button style={{ ...styles.selectBtn, backgroundColor: '#0284c7' }}>
              Start Transmitting
            </button>
          </div>

          {/* Live Tracker Option (merged Receiver + Bus Tracker) */}
          <div style={styles.modeCard} onClick={() => navigate('/live-tracker')}>
            <div style={{ ...styles.iconContainer, backgroundColor: 'rgba(96, 165, 250, 0.15)' }}>
              <Bus size={32} style={{ color: '#60a5fa' }} />
            </div>
            <h3 style={styles.modeTitle}>Live Tracker</h3>
            <p style={styles.modeDesc}>
              Monitor devices, view live GPS data, track buses on routes with automatic stop detection.
            </p>
            <button style={{ ...styles.selectBtn, backgroundColor: '#2563eb' }}>
              Open Tracker
            </button>
          </div>

          {/* Admin Route Manager Option */}
          <div style={styles.modeCard} onClick={() => navigate('/admin')}>
            <div style={{ ...styles.iconContainer, backgroundColor: 'rgba(16, 185, 129, 0.15)' }}>
              <Settings size={32} style={{ color: '#10b981' }} />
            </div>
            <h3 style={styles.modeTitle}>Route Manager</h3>
            <p style={styles.modeDesc}>
              Create routes, place stops on map, assign buses, and manage subscribers.
            </p>
            <button style={{ ...styles.selectBtn, backgroundColor: '#059669' }}>
              Open Manager
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// UI Styling
const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    padding: '1.5rem'
  },
  card: {
    backgroundColor: '#1e293b',
    padding: '2rem',
    borderRadius: '16px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
    width: '100%',
    maxWidth: '650px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem'
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    color: '#f8fafc'
  },
  subtitle: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.875rem',
    color: '#94a3b8'
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid #334155',
    color: '#94a3b8',
    padding: '0.5rem',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  userBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: '#0f172a',
    padding: '0.625rem 1rem',
    borderRadius: '8px',
    border: '1px solid #334155',
    marginBottom: '1.5rem',
    fontSize: '0.875rem',
    color: '#e2e8f0'
  },
  badgeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  divider: {
    color: '#475569'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.25rem'
  },
  modeCard: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'transform 0.2s, border-color 0.2s'
  },
  iconContainer: {
    padding: '1rem',
    borderRadius: '50%',
    marginBottom: '1rem'
  },
  modeTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.25rem',
    color: '#f8fafc'
  },
  modeDesc: {
    margin: '0 0 1.25rem 0',
    fontSize: '0.85rem',
    color: '#94a3b8',
    lineHeight: '1.4'
  },
  selectBtn: {
    marginTop: 'auto',
    width: '100%',
    border: 'none',
    color: '#ffffff',
    padding: '0.625rem',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '0.875rem',
    cursor: 'pointer'
  }
};

export default Home;