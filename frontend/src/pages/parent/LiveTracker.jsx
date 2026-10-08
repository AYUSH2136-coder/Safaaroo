import React, { useState, useEffect, useRef } from 'react';
import { fetchParentProfile } from '../../services/api';
import { getSocket } from '../../services/socket';
import { MapPin, Bus, Phone, Navigation, Wifi, WifiOff } from 'lucide-react';

const LiveTracker = () => {
  const [profile, setProfile] = useState(null);
  const [busLocation, setBusLocation] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    loadProfileAndConnect();
    return () => cleanup();
  }, []);

  const loadProfileAndConnect = async () => {
    try {
      const data = await fetchParentProfile();
      const p = data.profile;
      setProfile(p);

      if (!p.vehicle_id) {
        setError('No bus selected. Go to Route Setup and select your child\'s bus first.');
        setLoading(false);
        return;
      }

      // Connect to socket and join vehicle room
      const socket = getSocket();
      socketRef.current = socket;

      socket.emit('join_vehicle_room', { vehicleId: p.vehicle_id });

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('vehicle_location_updated', (data) => {
        if (data.vehicle_id === p.vehicle_id || data.device_id === p.vehicle_id) {
          setBusLocation({ latitude: data.latitude, longitude: data.longitude, speed: data.speed });
          setLastUpdate(new Date());
        }
      });

      setConnected(socket.connected);
    } catch (err) {
      setError('Failed to load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cleanup = () => {
    if (socketRef.current && profile?.vehicle_id) {
      socketRef.current.emit('leave_vehicle_room', { vehicleId: profile.vehicle_id });
      socketRef.current.off('vehicle_location_updated');
      socketRef.current.off('connect');
      socketRef.current.off('disconnect');
    }
  };

  const openInMaps = (lat, lng, label) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}(${encodeURIComponent(label)})`, '_blank');
  };

  if (loading) return <div style={styles.center}><p style={{ color: '#94a3b8' }}>Loading tracker…</p></div>;

  return (
    <div style={styles.container}>
      <div style={styles.titleRow}>
        <h2 style={styles.title}>Live Tracker</h2>
        <span style={{ ...styles.connBadge, ...(connected ? styles.connOnline : styles.connOffline) }}>
          {connected ? <><Wifi size={12} /> Connected</> : <><WifiOff size={12} /> Disconnected</>}
        </span>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {profile && (
        <>
          {/* Route Summary */}
          <div style={styles.routeCard}>
            <h3 style={styles.routeTitle}>Your Route</h3>

            <div style={styles.routePoint}>
              <div style={{ ...styles.dot, backgroundColor: '#4ade80' }} />
              <div>
                <p style={styles.pointLabel}>🏠 Home (Origin)</p>
                {profile.home_lat && profile.home_lng ? (
                  <>
                    <p style={styles.pointCoord}>{parseFloat(profile.home_lat).toFixed(5)}, {parseFloat(profile.home_lng).toFixed(5)}</p>
                    <button id="btn-open-home" style={styles.mapLink}
                      onClick={() => openInMaps(profile.home_lat, profile.home_lng, 'My Home')}>
                      <MapPin size={11} /> Open in Maps
                    </button>
                  </>
                ) : (
                  <p style={styles.pointMissing}>Not set — go to Route Setup</p>
                )}
              </div>
            </div>

            <div style={styles.routeLine} />

            <div style={styles.routePoint}>
              <div style={{ ...styles.dot, backgroundColor: '#f59e0b' }} />
              <div>
                <p style={styles.pointLabel}>🚌 Bus (Live)</p>
                {busLocation ? (
                  <>
                    <p style={styles.pointCoord}>{busLocation.latitude.toFixed(5)}, {busLocation.longitude.toFixed(5)}</p>
                    {busLocation.speed !== null && busLocation.speed !== undefined && (
                      <p style={styles.speedText}>🏎 {(busLocation.speed * 3.6).toFixed(0)} km/h</p>
                    )}
                    <button id="btn-open-bus" style={styles.mapLink}
                      onClick={() => openInMaps(busLocation.latitude, busLocation.longitude, profile.vehicle_id)}>
                      <MapPin size={11} /> Open Bus in Maps
                    </button>
                  </>
                ) : (
                  <p style={styles.pointMissing}>
                    {profile.vehicle_id
                      ? 'Waiting for bus to start transmitting…'
                      : 'No bus selected — go to Route Setup'}
                  </p>
                )}
              </div>
            </div>

            <div style={styles.routeLine} />

            <div style={styles.routePoint}>
              <div style={{ ...styles.dot, backgroundColor: '#f87171' }} />
              <div>
                <p style={styles.pointLabel}>🏫 School (Destination)</p>
                {profile.school_name ? (
                  <>
                    <p style={styles.schoolName}>{profile.school_name}</p>
                    <p style={styles.pointCoord}>{parseFloat(profile.school_lat).toFixed(5)}, {parseFloat(profile.school_lng).toFixed(5)}</p>
                    <button id="btn-open-school" style={styles.mapLink}
                      onClick={() => openInMaps(profile.school_lat, profile.school_lng, profile.school_name)}>
                      <MapPin size={11} /> Open School in Maps
                    </button>
                  </>
                ) : (
                  <p style={styles.pointMissing}>No school selected — go to Route Setup</p>
                )}
              </div>
            </div>
          </div>

          {/* Bus Info Card */}
          {profile.vehicle_id && (
            <div style={styles.busInfoCard}>
              <div style={styles.busInfoRow}>
                <Bus size={18} style={{ color: '#38bdf8' }} />
                <div style={{ flex: 1 }}>
                  <p style={styles.busIdLabel}>{profile.vehicle_id}</p>
                  {profile.vehicle_name && <p style={styles.busInfoSub}>{profile.vehicle_name}</p>}
                </div>
                {profile.slot_no && <span style={styles.slotBadge}>{profile.slot_no}</span>}
              </div>
              {profile.driver_name && (
                <div style={styles.driverRow}>
                  <span style={styles.driverName}>🧑‍✈️ {profile.driver_name}</span>
                  {profile.driver_mobile && (
                    <a id="link-call-driver" href={`tel:${profile.driver_mobile}`} style={styles.callBtn}>
                      <Phone size={14} /> Call Driver
                    </a>
                  )}
                </div>
              )}
              {lastUpdate && (
                <p style={styles.lastUpdate}>Last updated: {lastUpdate.toLocaleTimeString()}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const styles = {
  container: { padding: '1.25rem', maxWidth: '600px', margin: '0 auto' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' },
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  title: { margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' },
  connBadge: {
    display: 'flex', alignItems: 'center', gap: '4px',
    fontSize: '0.72rem', fontWeight: '600', padding: '3px 8px', borderRadius: '99px'
  },
  connOnline: { backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  connOffline: { backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
    color: '#f87171', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center'
  },
  routeCard: {
    backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
    padding: '1.25rem', marginBottom: '1rem'
  },
  routeTitle: { margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  routePoint: { display: 'flex', gap: '0.875rem', alignItems: 'flex-start' },
  dot: { width: '12px', height: '12px', borderRadius: '50%', marginTop: '3px', flexShrink: 0 },
  routeLine: { width: '2px', height: '24px', backgroundColor: '#334155', marginLeft: '5px' },
  pointLabel: { margin: '0 0 2px', fontSize: '0.82rem', fontWeight: '600', color: '#f8fafc' },
  pointCoord: { margin: 0, fontSize: '0.75rem', color: '#94a3b8' },
  pointMissing: { margin: 0, fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' },
  mapLink: {
    display: 'inline-flex', alignItems: 'center', gap: '3px',
    marginTop: '4px', fontSize: '0.72rem', color: '#38bdf8',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0
  },
  speedText: { margin: '2px 0 0', fontSize: '0.75rem', color: '#facc15' },
  schoolName: { margin: '0 0 2px', fontSize: '0.85rem', fontWeight: '600', color: '#f8fafc' },
  busInfoCard: {
    backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
    padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'
  },
  busInfoRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  busIdLabel: { margin: 0, fontSize: '1rem', fontWeight: '700', letterSpacing: '0.05em', color: '#f8fafc' },
  busInfoSub: { margin: 0, fontSize: '0.78rem', color: '#94a3b8' },
  slotBadge: {
    backgroundColor: 'rgba(2,132,199,0.15)', color: '#38bdf8',
    fontSize: '0.72rem', padding: '3px 8px', borderRadius: '99px', fontWeight: '600'
  },
  driverRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  driverName: { fontSize: '0.85rem', color: '#94a3b8' },
  callBtn: {
    display: 'flex', alignItems: 'center', gap: '5px',
    backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80',
    padding: '0.35rem 0.75rem', borderRadius: '6px',
    fontSize: '0.8rem', fontWeight: '600', textDecoration: 'none'
  },
  lastUpdate: { margin: 0, fontSize: '0.72rem', color: '#475569', textAlign: 'right' },
};

export default LiveTracker;
