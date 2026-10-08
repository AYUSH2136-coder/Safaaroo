
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../context/UserContext';
import { socket } from '../services/socket';
import { saveSubscriptionApi } from '../services/api';
import { Radio, ArrowLeft, Wifi, WifiOff, MapPin, CheckCircle, AlertTriangle } from 'lucide-react';

const TRANSMISSION_INTERVAL_MS = 2000; // Send location every 2 seconds

// VAPID Public Key from backend .env (this is the public key, safe to expose in frontend)
const VAPID_PUBLIC_KEY = 'BEkeKJBLUzJ8jTAyJutuxAmQZLnjJLxOa9-4ajNCa49a7CvMckfD1Oure73qk0lAtUOzKOln8sK7_IT-Z3_kbII';

/**
 * Convert URL-safe Base64 VAPID key to Uint8Array (required by pushManager.subscribe)
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const Transmitter = () => {
  const { deviceInfo } = useContext(UserContext);
  const navigate = useNavigate();

  // State
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [gpsStatus, setGpsStatus] = useState('Idle');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [errorMsg, setErrorMsg] = useState('');
  const [pushStatus, setPushStatus] = useState(''); // Notification permission status

  // Ref to store timer instance across renders
  const intervalRef = useRef(null);
  // Ref to mirror isTransmitting state — safe to read inside event callbacks without stale closure
  const isTransmittingRef = useRef(false);

  // Redirect if no user session exists
  useEffect(() => {
    if (!deviceInfo) {
      navigate('/');
    }
  }, [deviceInfo, navigate]);

  // Monitor Network Connectivity (Online / Offline status)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize Socket connection
  useEffect(() => {
    socket.connect();

    // Fires on first connect and every successful reconnect
    socket.on('connect', () => {
      console.log('⚡ Socket connected to server:', socket.id);
    });

    /**
     * Fix 1: Auto-resume interval after socket reconnects.
     * Triggered after phone call ends or network is restored.
     * Guard: only restart if user had transmission ON and interval was killed.
     */
    socket.on('reconnect', () => {
      console.log('🔄 Socket reconnected — resuming transmission if it was active...');
      if (isTransmittingRef.current && !intervalRef.current) {
        captureAndSendLocation();
        intervalRef.current = setInterval(captureAndSendLocation, TRANSMISSION_INTERVAL_MS);
      }
    });

    /**
     * Fix 2: visibilitychange listener.
     * Fires when user returns to the browser tab after a call/backgrounding.
     * - If socket was dropped → reconnect it.
     * - If interval was killed → restart it.
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ App returned to foreground — checking socket & interval...');
        if (!socket.connected) {
          console.log('🔌 Socket was disconnected — reconnecting...');
          socket.connect();
        }
        if (isTransmittingRef.current && !intervalRef.current) {
          console.log('▶️ Interval was killed — restarting transmission...');
          captureAndSendLocation();
          intervalRef.current = setInterval(captureAndSendLocation, TRANSMISSION_INTERVAL_MS);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // Stop transmission and disconnect socket when component unmounts
      stopTransmission();
      socket.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  /**
   * Register Service Worker + Subscribe to Web Push Notifications
   * Called once when user starts transmitting for the first time.
   */
  const setupPushNotifications = async () => {
    try {
      // Check browser support
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('⚠️ Push notifications not supported in this browser.');
        setPushStatus('Not Supported');
        return;
      }

      // Register the Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker registered:', registration.scope);

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('⚠️ Notification permission denied by user.');
        setPushStatus('Denied');
        return;
      }

      // Subscribe to push using the VAPID public key
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      console.log('🔔 Push subscription obtained:', subscription);

      // Send subscription to backend for storage
      if (deviceInfo?.device_id) {
        await saveSubscriptionApi(deviceInfo.device_id, subscription);
        console.log('✅ Push subscription saved to backend.');
        setPushStatus('Active');
      }
    } catch (err) {
      console.error('❌ Error setting up push notifications:', err);
      setPushStatus('Error');
    }
  };

  /**
   * Reads current GPS coordinates and emits them via Socket.IO
   */
  const captureAndSendLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Not Supported');
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }

    setGpsStatus('Acquiring GPS...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, speed: gpsSpeedMs } = position.coords;
        const time = new Date().toLocaleTimeString();

        // Convert speed from m/s to km/h (GPS may return null if unavailable)
        const speedKmh = gpsSpeedMs != null ? gpsSpeedMs * 3.6 : null;

        setLocation({ latitude, longitude });
        setGpsStatus('GPS Active');
        setLastUpdated(time);
        setErrorMsg('');

        // Emit location payload to Node.js backend
        if (deviceInfo?.device_id) {
          socket.emit('send_location', {
            deviceId: deviceInfo.device_id,
            latitude,
            longitude,
            speed: speedKmh
          });
        }
      },
      (error) => {
        console.error('GPS Error:', error);
        setGpsStatus('GPS Error');
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setErrorMsg('GPS Permission Denied. Please allow location access.');
            break;
          case error.POSITION_UNAVAILABLE:
            setErrorMsg('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            setErrorMsg('Location request timed out.');
            break;
          default:
            setErrorMsg('An unknown GPS error occurred.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000 // Fix 4: allow 30s cached position when OS blocks fresh GPS (call/background)
      }
    );
  };

  /**
   * Start 1-second interval transmission
   */
  const startTransmission = () => {
    setIsTransmitting(true);
    isTransmittingRef.current = true; // Fix 3: sync ref so callbacks read correct state

    // Setup push notifications on first transmission start
    setupPushNotifications();

    // Send immediate first location
    captureAndSendLocation();

    // Start repeating timer every 5 seconds
    intervalRef.current = setInterval(captureAndSendLocation, TRANSMISSION_INTERVAL_MS);
  };

  /**
   * Stop interval transmission
   */
  const stopTransmission = () => {
    setIsTransmitting(false);
    isTransmittingRef.current = false; // Fix 3: sync ref so callbacks don't restart interval
    setGpsStatus('Stopped');

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (deviceInfo?.device_id) {
      socket.emit('stop_transmission', { deviceId: deviceInfo.device_id });
    }
  };

  if (!deviceInfo) return null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Navigation Top Bar */}
        <div style={styles.topBar}>
          <button onClick={() => navigate('/home')} style={styles.backBtn}>
            <ArrowLeft size={18} style={{ marginRight: '6px' }} /> Back
          </button>
          <div style={styles.networkBadge}>
            {isOnline ? (
              <>
                <Wifi size={16} color="#10b981" />
                <span style={{ color: '#10b981', fontSize: '0.85rem' }}>Online</span>
              </>
            ) : (
              <>
                <WifiOff size={16} color="#ef4444" />
                <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>Offline</span>
              </>
            )}
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <Radio size={36} color={isTransmitting ? '#38bdf8' : '#64748b'} />
          <h2 style={styles.title}>Transmitter Mode</h2>
          <p style={styles.subtitle}>
            Device: <strong>{deviceInfo.device_name}</strong> ({deviceInfo.username})
          </p>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div style={styles.errorBanner}>
            <AlertTriangle size={18} style={{ marginRight: '8px' }} />
            {errorMsg}
          </div>
        )}

        {/* Metrics Display Grid */}
        <div style={styles.metricsGrid}>
          <div style={styles.metricBox}>
            <span style={styles.metricLabel}>Latitude</span>
            <span style={styles.metricValue}>
              {location.latitude !== null ? location.latitude.toFixed(6) : '--'}
            </span>
          </div>

          <div style={styles.metricBox}>
            <span style={styles.metricLabel}>Longitude</span>
            <span style={styles.metricValue}>
              {location.longitude !== null ? location.longitude.toFixed(6) : '--'}
            </span>
          </div>

          <div style={styles.metricBox}>
            <span style={styles.metricLabel}>GPS Status</span>
            <span style={styles.metricValue}>{gpsStatus}</span>
          </div>

          <div style={styles.metricBox}>
            <span style={styles.metricLabel}>Last Transmitted</span>
            <span style={styles.metricValue}>{lastUpdated || '--'}</span>
          </div>

          <div style={styles.metricBox}>
            <span style={styles.metricLabel}>Push Alerts</span>
            <span style={{
              ...styles.metricValue,
              color: pushStatus === 'Active' ? '#10b981' :
                pushStatus === 'Denied' ? '#ef4444' :
                  pushStatus === 'Error' ? '#f59e0b' : '#64748b'
            }}>
              {pushStatus || 'Idle'}
            </span>
          </div>
        </div>

        {/* Control Button */}
        <div style={{ marginTop: '2rem' }}>
          {!isTransmitting ? (
            <button onClick={startTransmission} style={styles.startBtn}>
              <Radio size={18} style={{ marginRight: '8px' }} /> Start Transmitting
            </button>
          ) : (
            <button onClick={stopTransmission} style={styles.stopBtn}>
              Stop Transmission
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Component Styles
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
    maxWidth: '500px'
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem'
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.9rem'
  },
  networkBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#0f172a',
    padding: '0.4rem 0.75rem',
    borderRadius: '20px',
    border: '1px solid #334155'
  },
  title: {
    margin: '0.5rem 0 0.25rem 0',
    fontSize: '1.5rem',
    color: '#f8fafc'
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: '#94a3b8'
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid #ef4444',
    color: '#f87171',
    padding: '0.75rem',
    borderRadius: '8px',
    fontSize: '0.85rem',
    marginBottom: '1.25rem'
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
    marginTop: '1rem'
  },
  metricBox: {
    backgroundColor: '#0f172a',
    padding: '1rem',
    borderRadius: '10px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  metricLabel: {
    fontSize: '0.75rem',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  metricValue: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#38bdf8'
  },
  startBtn: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    padding: '0.875rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  stopBtn: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    padding: '0.875rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  }
};

export default Transmitter;