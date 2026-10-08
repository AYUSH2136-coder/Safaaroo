
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../context/UserContext';
import { fetchDevicesApi } from '../services/api';
import { socket } from '../services/socket';
import { Eye, ArrowLeft, Smartphone, Radio, RefreshCw, Clock, MapPin } from 'lucide-react';

const OFFLINE_THRESHOLD_MS = 15000; // 15 seconds threshold for offline state

const Receiver = () => {
  const { deviceInfo } = useContext(UserContext);
  const navigate = useNavigate();

  // State
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Redirect if no session
  useEffect(() => {
    if (!deviceInfo) {
      navigate('/');
    }
  }, [deviceInfo, navigate]);

  // Initial fetch of registered devices
  const loadDevices = async () => {
    try {
      setLoading(true);
      const response = await fetchDevicesApi();
      if (response.success) {
        setDevices(response.devices);
        // Select first device by default if available
        if (response.devices.length > 0 && !selectedDevice) {
          setSelectedDevice(response.devices[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  // Timer interval to force re-evaluation of Online/Offline status every 3 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Real-time Socket Listener
  useEffect(() => {
    socket.connect();

    // Listen for live location updates broadcasted by server
    socket.on('location_updated', (updatedData) => {
      setDevices((prevDevices) => {
        const index = prevDevices.findIndex((d) => d.device_id === updatedData.device_id);

        if (index !== -1) {
          // Update existing device in state
          const updatedList = [...prevDevices];
          updatedList[index] = {
            ...updatedList[index],
            ...updatedData
          };
          return updatedList;
        } else {
          // If a new device started transmitting, refresh device list
          loadDevices();
          return prevDevices;
        }
      });

      // Update selected device panel live if it's currently selected
      setSelectedDevice((prevSelected) => {
        if (prevSelected && prevSelected.device_id === updatedData.device_id) {
          return { ...prevSelected, ...updatedData };
        }
        return prevSelected;
      });
    });

    // Listen for transmission stopped events
    socket.on('device_status_changed', (statusData) => {
      setDevices((prev) =>
        prev.map((d) =>
          d.device_id === statusData.device_id
            ? { ...d, status: statusData.status, is_transmitting: 0 }
            : d
        )
      );
    });

    return () => {
      socket.off('location_updated');
      socket.off('device_status_changed');
      socket.disconnect();
    };
  }, []);

  /**
   * Helper to evaluate online/offline state dynamically
   */
  const getDeviceStatus = (device) => {
    if (!device.last_update) return 'offline';
    const age = now - device.last_update;
    return age <= OFFLINE_THRESHOLD_MS ? 'online' : 'offline';
  };

  if (!deviceInfo) return null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Navigation Bar */}
        <div style={styles.topBar}>
          <button onClick={() => navigate('/home')} style={styles.backBtn}>
            <ArrowLeft size={18} style={{ marginRight: '6px' }} /> Back
          </button>
          <button onClick={loadDevices} style={styles.refreshBtn} title="Refresh Device List">
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <Eye size={36} color="#c084fc" />
          <h2 style={styles.title}>Receiver Mode</h2>
          <p style={styles.subtitle}>Select a device to view live coordinates</p>
        </div>

        {/* Layout Grid: Left = List, Right = Selected Details */}
        <div style={styles.mainGrid}>
          {/* Device List Column */}
          <div style={styles.listColumn}>
            <h3 style={styles.sectionHeader}>Registered Devices ({devices.length})</h3>

            {loading && <p style={styles.emptyText}>Loading devices...</p>}

            {!loading && devices.length === 0 && (
              <p style={styles.emptyText}>No registered devices found.</p>
            )}

            {devices.map((device) => {
              const status = getDeviceStatus(device);
              const isSelected = selectedDevice?.device_id === device.device_id;

              return (
                <div
                  key={device.device_id}
                  onClick={() => setSelectedDevice(device)}
                  style={{
                    ...styles.deviceItem,
                    borderColor: isSelected ? '#a855f7' : '#334155',
                    backgroundColor: isSelected ? 'rgba(168, 85, 247, 0.1)' : '#0f172a'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Smartphone size={20} color="#94a3b8" />
                    <div>
                      <div style={styles.deviceName}>{device.device_name}</div>
                      <div style={styles.username}>User: {device.username}</div>
                    </div>
                  </div>

                  {/* Online/Offline Status Indicator Pill */}
                  <div
                    style={{
                      ...styles.statusPill,
                      backgroundColor: status === 'online' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: status === 'online' ? '#10b981' : '#f87171',
                      borderColor: status === 'online' ? '#10b981' : '#ef4444'
                    }}
                  >
                    <span
                      style={{
                        ...styles.statusDot,
                        backgroundColor: status === 'online' ? '#10b981' : '#ef4444'
                      }}
                    />
                    {status.toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Device Details Column */}
          <div style={styles.detailsColumn}>
            <h3 style={styles.sectionHeader}>Live Location Metrics</h3>

            {selectedDevice ? (
              <div style={styles.metricsCard}>
                <div style={styles.selectedHeader}>
                  <Radio size={24} color="#c084fc" />
                  <div>
                    <h4 style={styles.selectedTitle}>{selectedDevice.device_name}</h4>
                    <span style={styles.selectedSub}>{selectedDevice.username}</span>
                  </div>
                </div>

                <div style={styles.metricsGrid}>
                  <div style={styles.metricBox}>
                    <span style={styles.metricLabel}>
                      <MapPin size={14} style={{ marginRight: '4px' }} /> Latitude
                    </span>
                    <span style={styles.metricValue}>
                      {selectedDevice.latitude !== null && selectedDevice.latitude !== undefined
                        ? Number(selectedDevice.latitude).toFixed(6)
                        : 'No Data'}
                    </span>
                  </div>

                  <div style={styles.metricBox}>
                    <span style={styles.metricLabel}>
                      <MapPin size={14} style={{ marginRight: '4px' }} /> Longitude
                    </span>
                    <span style={styles.metricValue}>
                      {selectedDevice.longitude !== null && selectedDevice.longitude !== undefined
                        ? Number(selectedDevice.longitude).toFixed(6)
                        : 'No Data'}
                    </span>
                  </div>

                  <div style={styles.metricBox}>
                    <span style={styles.metricLabel}>
                      <Clock size={14} style={{ marginRight: '4px' }} /> Last Updated
                    </span>
                    <span style={styles.metricValue}>
                      {selectedDevice.last_update
                        ? new Date(selectedDevice.last_update).toLocaleTimeString()
                        : '--'}
                    </span>
                  </div>

                  <div style={styles.metricBox}>
                    <span style={styles.metricLabel}>Connection Status</span>
                    <span
                      style={{
                        ...styles.metricValue,
                        color: getDeviceStatus(selectedDevice) === 'online' ? '#10b981' : '#ef4444'
                      }}
                    >
                      {getDeviceStatus(selectedDevice).toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>Select a device from the list to view its metrics.</p>
            )}
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
    maxWidth: '850px'
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
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
  refreshBtn: {
    background: '#0f172a',
    border: '1px solid #334155',
    color: '#38bdf8',
    padding: '0.5rem',
    borderRadius: '8px',
    cursor: 'pointer'
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
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1.5rem',
    marginTop: '1.5rem'
  },
  listColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  detailsColumn: {
    display: 'flex',
    flexDirection: 'column'
  },
  sectionHeader: {
    fontSize: '1rem',
    color: '#cbd5e1',
    margin: '0 0 0.75rem 0'
  },
  deviceItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.875rem 1rem',
    borderRadius: '10px',
    border: '1px solid #334155',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  deviceName: {
    fontWeight: '600',
    fontSize: '0.95rem',
    color: '#f8fafc'
  },
  username: {
    fontSize: '0.8rem',
    color: '#64748b'
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0.25rem 0.625rem',
    borderRadius: '12px',
    border: '1px solid',
    fontSize: '0.75rem',
    fontWeight: '600'
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%'
  },
  metricsCard: {
    backgroundColor: '#0f172a',
    padding: '1.25rem',
    borderRadius: '12px',
    border: '1px solid #334155'
  },
  selectedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '1.25rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #1e293b'
  },
  selectedTitle: {
    margin: 0,
    fontSize: '1.1rem',
    color: '#f8fafc'
  },
  selectedSub: {
    fontSize: '0.8rem',
    color: '#94a3b8'
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.875rem'
  },
  metricBox: {
    backgroundColor: '#1e293b',
    padding: '0.875rem',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  metricLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.75rem',
    color: '#64748b',
    textTransform: 'uppercase'
  },
  metricValue: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#38bdf8'
  },
  emptyText: {
    fontSize: '0.875rem',
    color: '#64748b',
    fontStyle: 'italic'
  }
};

export default Receiver;