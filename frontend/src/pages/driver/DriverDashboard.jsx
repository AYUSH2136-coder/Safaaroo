import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchDriverProfile, startTransmissionApi, stopTransmissionApi } from '../../services/api';
import { getSocket } from '../../services/socket';
import { LogOut, Radio, StopCircle, MapPin, Gauge, Bus } from 'lucide-react';

const DriverDashboard = () => {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transmitting, setTransmitting] = useState(false);
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState('');
  const [gpsError, setGpsError] = useState('');

  const watchIdRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    loadProfile();
    return () => stopWatching();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await fetchDriverProfile();
      setProfile(data.profile);
    } catch (err) {
      setError('Failed to load profile.');
    } finally {
      setLoading(false);
    }
  };

  const stopWatching = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('stop_transmission', { deviceId: profile?.vehicle_id });
    }
  };

  const handleStartTransmission = async () => {
    if (!navigator.geolocation) {
      setGpsError('GPS is not available on this device.');
      return;
    }
    if (!profile?.vehicle_id) {
      setGpsError('No vehicle assigned to your account.');
      return;
    }
    try {
      await startTransmissionApi();
      setGpsError('');

      // Get socket
      const socket = getSocket();
      socketRef.current = socket;

      setTransmitting(true);

      // Start watching GPS and emit to socket
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed } = pos.coords;
          setCoords({ latitude, longitude, speed });

          // Emit to socket with both deviceId (legacy) and vehicleId (new)
          socket.emit('send_location', {
            deviceId: profile.vehicle_id,
            vehicleId: profile.vehicle_id,
            latitude,
            longitude,
            speed: speed ?? 0,
          });
        },
        (err) => {
          setGpsError('GPS error: ' + err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } catch (err) {
      setGpsError('Could not start transmission.');
    }
  };

  const handleStopTransmission = async () => {
    stopWatching();
    setTransmitting(false);
    setCoords(null);
    try {
      await stopTransmissionApi();
    } catch {
      // Silently ignore
    }
  };

  const handleLogout = () => {
    stopWatching();
    logout();
    window.location.href = '/';
  };

  if (loading) {
    return <div style={styles.center}><p style={{ color: '#94a3b8' }}>Loading profile…</p></div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>🚌 Driver Dashboard</h1>
          <p style={styles.headerSub}>Welcome, {user?.name}</p>
        </div>
        <button id="btn-logout" style={styles.logoutBtn} onClick={handleLogout}>
          <LogOut size={16} /> <span>Logout</span>
        </button>
      </header>

      <main style={styles.main}>
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Vehicle Info Card */}
        {profile && (
          <div style={styles.infoCard}>
            <div style={styles.infoRow}>
              <Bus size={20} style={{ color: '#38bdf8' }} />
              <div>
                <p style={styles.infoLabel}>Assigned Vehicle</p>
                <p style={styles.infoValue}>{profile.vehicle_id || 'Not assigned'}</p>
              </div>
            </div>
            {profile.slot_no && (
              <span style={styles.slotBadge}>{profile.slot_no}</span>
            )}
            {profile.school_name && (
              <p style={styles.schoolInfo}>🏫 {profile.school_name}</p>
            )}
            {profile.vehicle_name && (
              <p style={styles.vehicleName}>{profile.vehicle_name}</p>
            )}
          </div>
        )}

        {/* GPS Status */}
        {transmitting && coords && (
          <div style={styles.gpsCard}>
            <p style={styles.gpsTitle}>📡 Broadcasting Live</p>
            <div style={styles.coordsRow}>
              <div style={styles.coordItem}>
                <MapPin size={14} style={{ color: '#4ade80' }} />
                <span style={styles.coordLabel}>Lat</span>
                <span style={styles.coordValue}>{coords.latitude?.toFixed(6)}</span>
              </div>
              <div style={styles.coordItem}>
                <MapPin size={14} style={{ color: '#4ade80' }} />
                <span style={styles.coordLabel}>Lng</span>
                <span style={styles.coordValue}>{coords.longitude?.toFixed(6)}</span>
              </div>
              <div style={styles.coordItem}>
                <Gauge size={14} style={{ color: '#facc15' }} />
                <span style={styles.coordLabel}>Speed</span>
                <span style={styles.coordValue}>{coords.speed ? `${(coords.speed * 3.6).toFixed(0)} km/h` : '0 km/h'}</span>
              </div>
            </div>
          </div>
        )}

        {gpsError && <div style={styles.gpsError}>{gpsError}</div>}

        {/* Transmit Toggle */}
        <div style={styles.transmitContainer}>
          {!transmitting ? (
            <button
              id="btn-start-transmit"
              style={styles.startBtn}
              onClick={handleStartTransmission}
              disabled={!profile?.vehicle_id}
            >
              <Radio size={22} />
              Start Transmitting
            </button>
          ) : (
            <button id="btn-stop-transmit" style={styles.stopBtn} onClick={handleStopTransmission}>
              <StopCircle size={22} />
              Stop Transmission
            </button>
          )}
          <p style={styles.transmitHint}>
            {transmitting
              ? 'Your location is being broadcast to parents tracking this bus.'
              : profile?.vehicle_id
                ? 'Tap to start broadcasting your GPS location.'
                : 'No vehicle assigned. Contact your operator.'}
          </p>
        </div>
      </main>
    </div>
  );
};

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f172a' },
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
  main: { padding: '1.5rem', maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
    color: '#f87171', padding: '0.75rem', borderRadius: '8px', textAlign: 'center'
  },
  infoCard: {
    backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem',
    border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.75rem'
  },
  infoRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  infoLabel: { margin: 0, fontSize: '0.75rem', color: '#64748b' },
  infoValue: { margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#f8fafc', letterSpacing: '0.05em' },
  slotBadge: {
    display: 'inline-block', alignSelf: 'flex-start',
    backgroundColor: 'rgba(2,132,199,0.15)', color: '#38bdf8',
    fontSize: '0.75rem', padding: '3px 10px', borderRadius: '99px', fontWeight: '600'
  },
  schoolInfo: { margin: 0, fontSize: '0.85rem', color: '#94a3b8' },
  vehicleName: { margin: 0, fontSize: '0.82rem', color: '#64748b' },
  gpsCard: {
    backgroundColor: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
    borderRadius: '10px', padding: '1rem'
  },
  gpsTitle: { margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: '600', color: '#4ade80' },
  coordsRow: { display: 'flex', gap: '1.25rem', flexWrap: 'wrap' },
  coordItem: { display: 'flex', alignItems: 'center', gap: '5px' },
  coordLabel: { fontSize: '0.72rem', color: '#64748b' },
  coordValue: { fontSize: '0.85rem', fontWeight: '600', color: '#f8fafc' },
  gpsError: {
    backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
    color: '#f87171', padding: '0.65rem', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center'
  },
  transmitContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
    marginTop: '0.5rem'
  },
  startBtn: {
    display: 'flex', alignItems: 'center', gap: '10px',
    backgroundColor: '#16a34a', color: '#fff', border: 'none',
    padding: '1rem 2.5rem', borderRadius: '12px',
    fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 4px 15px rgba(22,163,74,0.4)'
  },
  stopBtn: {
    display: 'flex', alignItems: 'center', gap: '10px',
    backgroundColor: '#dc2626', color: '#fff', border: 'none',
    padding: '1rem 2.5rem', borderRadius: '12px',
    fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer',
    transition: 'transform 0.15s',
    boxShadow: '0 4px 15px rgba(220,38,38,0.4)'
  },
  transmitHint: { fontSize: '0.82rem', color: '#64748b', textAlign: 'center', maxWidth: '280px' },
};

export default DriverDashboard;
