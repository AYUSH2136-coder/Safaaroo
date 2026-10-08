
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllBusStates, fetchRouteStops, resetBusRouteApi } from '../services/api';
import { socket } from '../services/socket';
import {
  ArrowLeft, Bus, MapPin, Navigation, Bell, Clock,
  ChevronRight, Circle, CheckCircle, AlertCircle, RefreshCw
} from 'lucide-react';

/**
 * State-to-display configuration for the bus state machine.
 * Maps internal state codes to human-readable labels and colors.
 */
const STATE_CONFIG = {
  OUTSIDE: {
    label: 'En Route',
    color: '#64748b',
    bgColor: 'rgba(100, 116, 139, 0.15)',
    borderColor: '#64748b',
    icon: Navigation,
    description: 'Bus is moving between stops'
  },
  APPROACHING: {
    label: 'Approaching',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    icon: AlertCircle,
    description: 'Bus is nearing the next stop'
  },
  ARRIVED: {
    label: 'At Stop',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    icon: CheckCircle,
    description: 'Bus has arrived at the stop'
  },
  DEPARTED: {
    label: 'Departed',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    icon: ChevronRight,
    description: 'Bus has left the stop'
  }
};

const BusTracker = () => {
  const navigate = useNavigate();

  // State
  const [busStates, setBusStates] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [loading, setLoading] = useState(true);

  // ─── Fetch all bus states ──────────────────────────────────────────────
  const loadBusStates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetchAllBusStates();
      if (response.success) {
        setBusStates(response.busStates);
        
        // Auto-select first bus if none selected, OR update the currently selected bus
        if (response.busStates.length > 0) {
          if (!selectedBus) {
            setSelectedBus(response.busStates[0]);
          } else {
            const updatedSelected = response.busStates.find(b => b.bus_id === selectedBus.bus_id);
            if (updatedSelected) {
              setSelectedBus(updatedSelected);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching bus states:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedBus]);

  // ─── Fetch stops for selected bus's route ──────────────────────────────
  const loadRouteStops = useCallback(async (routeId) => {
    if (!routeId) {
      setRouteStops([]);
      return;
    }
    try {
      const response = await fetchRouteStops(routeId);
      if (response.success) {
        setRouteStops(response.stops);
      }
    } catch (err) {
      console.error('Error fetching route stops:', err);
    }
  }, []);

  // ─── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    loadBusStates();
  }, []);

  // ─── Load stops when selected bus changes ──────────────────────────────
  useEffect(() => {
    if (selectedBus?.route_id) {
      loadRouteStops(selectedBus.route_id);
    }
  }, [selectedBus?.route_id, loadRouteStops]);

  // ─── Socket.IO listeners for real-time updates ────────────────────────
  useEffect(() => {
    socket.connect();

    // Listen for bus state changes
    socket.on('bus_state_updated', (updatedState) => {
      setBusStates((prev) => {
        const idx = prev.findIndex((b) => b.bus_id === updatedState.bus_id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...updatedState };
          return updated;
        }
        return [...prev, updatedState];
      });

      // Update selected bus if it's the one being tracked
      setSelectedBus((prev) => {
        if (prev && prev.bus_id === updatedState.bus_id) {
          return { ...prev, ...updatedState };
        }
        return prev;
      });
    });

    // Listen for stop events (APPROACHING/ARRIVED/DEPARTED)
    socket.on('stop_event', (event) => {
      setEventLog((prev) => [event, ...prev].slice(0, 50)); // Keep last 50
    });

    return () => {
      socket.off('bus_state_updated');
      socket.off('stop_event');
      socket.disconnect();
    };
  }, []);

  // ─── Reset route state ────────────────────────────────────────────────
  const handleRestartRoute = async (busId) => {
    if (!window.confirm('Are you sure you want to restart this route? This will reset the bus state back to En Route before Stop 1.')) {
      return;
    }
    try {
      const response = await resetBusRouteApi(busId);
      if (response.success) {
        alert('Route restarted successfully.');
        loadBusStates(); // Reload states
      } else {
        alert('Failed to restart route: ' + response.message);
      }
    } catch (err) {
      console.error('Error restarting route:', err);
      alert('Error restarting route.');
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────
  const getStateConfig = (state) => STATE_CONFIG[state] || STATE_CONFIG.OUTSIDE;

  const formatTime = (isoString) => {
    if (!isoString) return '--';
    return new Date(isoString).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const getStopProgress = (stop) => {
    if (!selectedBus) return 'pending';
    const nextSeq = routeStops.find(s => s.stop_id === selectedBus.next_stop_id)?.sequence_no;
    const currentSeq = routeStops.find(s => s.stop_id === selectedBus.current_stop_id)?.sequence_no;

    if (currentSeq !== undefined && stop.sequence_no <= currentSeq) return 'completed';
    if (stop.stop_id === selectedBus.next_stop_id) return 'next';
    return 'pending';
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Top Bar */}
        <div style={styles.topBar}>
          <button onClick={() => navigate('/home')} style={styles.backBtn}>
            <ArrowLeft size={18} style={{ marginRight: '6px' }} /> Back
          </button>
          <button onClick={loadBusStates} style={styles.refreshBtn} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <Bus size={36} color="#60a5fa" />
          <h2 style={styles.title}>SafarNama Bus Tracker</h2>
          <p style={styles.subtitle}>Automatic stop detection dashboard</p>
        </div>

        {/* No buses message */}
        {!loading && busStates.length === 0 && (
          <div style={styles.emptyState}>
            <Navigation size={48} color="#334155" />
            <p style={styles.emptyText}>No buses are currently assigned to routes.</p>
            <p style={{ ...styles.emptyText, fontSize: '0.8rem' }}>
              Use the admin API to create routes, add stops, and assign buses.
            </p>
          </div>
        )}

        {busStates.length > 0 && (
          <div style={styles.mainGrid}>
            {/* ─── Left: Bus List ─────────────────────────────────── */}
            <div style={styles.listColumn}>
              <h3 style={styles.sectionHeader}>Active Buses ({busStates.length})</h3>
              {busStates.map((bus) => {
                const cfg = getStateConfig(bus.state);
                const isSelected = selectedBus?.bus_id === bus.bus_id;
                const StateIcon = cfg.icon;

                return (
                  <div
                    key={bus.bus_id}
                    onClick={() => setSelectedBus(bus)}
                    style={{
                      ...styles.busItem,
                      borderColor: isSelected ? '#60a5fa' : '#334155',
                      backgroundColor: isSelected ? 'rgba(96, 165, 250, 0.08)' : '#0f172a'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <Bus size={20} color="#94a3b8" />
                      <div style={{ flex: 1 }}>
                        <div style={styles.busName}>{bus.bus_id}</div>
                        <div style={styles.routeName}>{bus.route_name || bus.route_id || 'No route'}</div>
                      </div>
                    </div>
                    <div style={{
                      ...styles.statePill,
                      backgroundColor: cfg.bgColor,
                      color: cfg.color,
                      borderColor: cfg.borderColor
                    }}>
                      <StateIcon size={12} />
                      {cfg.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ─── Right: Details ─────────────────────────────────── */}
            <div style={styles.detailsColumn}>
              {selectedBus ? (
                <>
                  {/* State Card */}
                  <div style={styles.stateCard}>
                    <div style={styles.stateHeader}>
                      <div>
                        <h3 style={styles.stateTitle}>{selectedBus.bus_id}</h3>
                        <p style={styles.stateRoute}>{selectedBus.route_name || selectedBus.route_id}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        {(() => {
                          const cfg = getStateConfig(selectedBus.state);
                          const StateIcon = cfg.icon;
                          return (
                            <div style={{
                              ...styles.stateBadge,
                              backgroundColor: cfg.bgColor,
                              color: cfg.color,
                              borderColor: cfg.borderColor
                            }}>
                              <StateIcon size={18} />
                              <span style={{ fontWeight: '700', fontSize: '1rem' }}>{cfg.label}</span>
                            </div>
                          );
                        })()}
                        <button 
                          onClick={() => handleRestartRoute(selectedBus.bus_id)}
                          style={{
                            background: 'none',
                            border: '1px solid #ef4444',
                            color: '#ef4444',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Restart this route"
                        >
                          <RefreshCw size={12} /> Restart Route
                        </button>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div style={styles.metricsGrid}>
                      <div style={styles.metricBox}>
                        <span style={styles.metricLabel}>
                          <MapPin size={13} style={{ marginRight: '4px' }} /> Next Stop
                        </span>
                        <span style={styles.metricValue}>
                          {selectedBus.next_stop_name || selectedBus.next_stop_id || '--'}
                        </span>
                      </div>
                      <div style={styles.metricBox}>
                        <span style={styles.metricLabel}>
                          <Navigation size={13} style={{ marginRight: '4px' }} /> Speed
                        </span>
                        <span style={styles.metricValue}>
                          {selectedBus.speed != null ? `${Number(selectedBus.speed).toFixed(1)} km/h` : '--'}
                        </span>
                      </div>
                      <div style={styles.metricBox}>
                        <span style={styles.metricLabel}>
                          <Bell size={13} style={{ marginRight: '4px' }} /> Last Event
                        </span>
                        <span style={styles.metricValue}>
                          {selectedBus.last_event || 'None'}
                        </span>
                      </div>
                      <div style={styles.metricBox}>
                        <span style={styles.metricLabel}>
                          <Clock size={13} style={{ marginRight: '4px' }} /> Event Time
                        </span>
                        <span style={styles.metricValue}>
                          {formatTime(selectedBus.last_event_time)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Live Running Status */}
                  {routeStops.length > 0 && (
                    <div style={styles.routeProgress}>
                      <style>{`
                        @keyframes pulseBus {
                          0% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.7); }
                          70% { box-shadow: 0 0 0 12px rgba(96, 165, 250, 0); }
                          100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0); }
                        }
                        @keyframes moveDown {
                          0% { top: 0%; opacity: 1; }
                          100% { top: 100%; opacity: 0; }
                        }
                      `}</style>
                      <h4 style={{ ...styles.progressTitle, display: 'flex', alignItems: 'center' }}>
                        <Navigation size={16} style={{ marginRight: '6px', color: '#60a5fa' }} />
                        Live Running Status
                      </h4>
                      <div style={styles.stopsList}>
                        {routeStops.map((stop, idx) => {
                          const progress = getStopProgress(stop);
                          const isLast = idx === routeStops.length - 1;
                          
                          // Determine exact bus position
                          const isBusAtThisStop = selectedBus.state === 'ARRIVED' && stop.stop_id === selectedBus.current_stop_id;
                          
                          // If it's not arrived, and it departed/outside/approaching from this stop towards the next
                          const isBusJustBeforeStop1 = !selectedBus.current_stop_id && selectedBus.next_stop_id === stop.stop_id && selectedBus.state !== 'ARRIVED';
                          const isBusMovingFromThisStop = selectedBus.current_stop_id === stop.stop_id && selectedBus.state !== 'ARRIVED';
                          const isBusInSegmentAfter = isBusJustBeforeStop1 || isBusMovingFromThisStop;

                          // Colors for the track line and stop dots
                          const dotColor = progress === 'completed' ? '#10b981' : (progress === 'next' ? '#f59e0b' : '#334155');
                          const trackColor = progress === 'completed' ? '#10b981' : '#334155';

                          return (
                            <div key={stop.stop_id} style={{ display: 'flex', alignItems: 'flex-start', gap: '15px', position: 'relative' }}>
                              
                              {/* Connector & Status Dot */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px', minHeight: '60px' }}>
                                {/* The Stop Node */}
                                <div style={{
                                  width: '16px',
                                  height: '16px',
                                  borderRadius: '50%',
                                  backgroundColor: '#0f172a',
                                  border: `3px solid ${dotColor}`,
                                  zIndex: 2,
                                  position: 'relative'
                                }}>
                                  {/* Bus AT Stop Indicator */}
                                  {isBusAtThisStop && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '50%', left: '50%',
                                      transform: 'translate(-50%, -50%)',
                                      backgroundColor: '#60a5fa',
                                      borderRadius: '50%',
                                      padding: '4px',
                                      animation: 'pulseBus 2s infinite',
                                      zIndex: 10
                                    }}>
                                      <Bus size={14} color="#fff" />
                                    </div>
                                  )}
                                </div>
                                
                                {/* The Track Line to Next Stop */}
                                {!isLast && (
                                  <div style={{
                                    width: '4px',
                                    flex: 1,
                                    backgroundColor: trackColor,
                                    position: 'relative',
                                    margin: '4px 0'
                                  }}>
                                    {/* Bus Moving IN SEGMENT Indicator */}
                                    {isBusInSegmentAfter && !isLast && (
                                      <div style={{
                                        position: 'absolute',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        backgroundColor: '#60a5fa',
                                        borderRadius: '50%',
                                        padding: '4px',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                                        animation: 'moveDown 2.5s infinite linear',
                                        zIndex: 10
                                      }}>
                                        <Bus size={12} color="#fff" />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Stop Details */}
                              <div style={{
                                flex: 1,
                                paddingBottom: isLast ? '0' : '1.5rem',
                                opacity: progress === 'pending' ? 0.6 : 1,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <div>
                                  <div style={{
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    color: isBusAtThisStop ? '#60a5fa' : (progress === 'completed' ? '#10b981' : (progress === 'next' ? '#f59e0b' : '#f8fafc'))
                                  }}>
                                    {stop.stop_name}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                    Stop #{stop.sequence_no} {progress === 'next' && '• Next Stop'}
                                  </div>
                                </div>
                                
                                {/* Time or Distance Info (if available, else just icon) */}
                                {progress === 'completed' && <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '500' }}>Passed</span>}
                                {progress === 'next' && selectedBus.speed > 0 && (
                                  <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: '500' }}>
                                    {selectedBus.state}
                                  </span>
                                )}
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p style={styles.emptyText}>Select a bus to view details.</p>
              )}

              {/* Event Log */}
              {eventLog.length > 0 && (
                <div style={styles.eventLogSection}>
                  <h4 style={styles.progressTitle}>Recent Events</h4>
                  <div style={styles.eventList}>
                    {eventLog.slice(0, 10).map((evt, idx) => {
                      const cfg = getStateConfig(evt.event);
                      return (
                        <div key={idx} style={styles.eventRow}>
                          <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            backgroundColor: cfg.color, flexShrink: 0
                          }} />
                          <div style={{ flex: 1 }}>
                            <span style={{ color: cfg.color, fontWeight: '600', fontSize: '0.8rem' }}>
                              {evt.event}
                            </span>
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                              {' '}— {evt.bus_id} at "{evt.stop_name}"
                            </span>
                          </div>
                          <span style={{ color: '#475569', fontSize: '0.75rem', flexShrink: 0 }}>
                            {formatTime(evt.timestamp)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
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
    maxWidth: '960px'
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
    color: '#60a5fa',
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
  emptyState: {
    textAlign: 'center',
    padding: '3rem 1rem'
  },
  emptyText: {
    fontSize: '0.875rem',
    color: '#64748b',
    fontStyle: 'italic',
    margin: '0.5rem 0'
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: '1.5rem',
    marginTop: '1.5rem'
  },
  listColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  detailsColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  sectionHeader: {
    fontSize: '0.9rem',
    color: '#cbd5e1',
    margin: '0 0 0.5rem 0',
    fontWeight: '600'
  },
  busItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem',
    borderRadius: '10px',
    border: '1px solid #334155',
    cursor: 'pointer',
    transition: 'all 0.2s',
    gap: '8px'
  },
  busName: {
    fontWeight: '600',
    fontSize: '0.85rem',
    color: '#f8fafc'
  },
  routeName: {
    fontSize: '0.75rem',
    color: '#64748b'
  },
  statePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0.2rem 0.5rem',
    borderRadius: '10px',
    border: '1px solid',
    fontSize: '0.7rem',
    fontWeight: '600',
    flexShrink: 0,
    whiteSpace: 'nowrap'
  },
  stateCard: {
    backgroundColor: '#0f172a',
    padding: '1.25rem',
    borderRadius: '12px',
    border: '1px solid #334155'
  },
  stateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #1e293b'
  },
  stateTitle: {
    margin: 0,
    fontSize: '1.1rem',
    color: '#f8fafc'
  },
  stateRoute: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.8rem',
    color: '#94a3b8'
  },
  stateBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0.4rem 0.75rem',
    borderRadius: '10px',
    border: '1px solid'
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem'
  },
  metricBox: {
    backgroundColor: '#1e293b',
    padding: '0.75rem',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem'
  },
  metricLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.7rem',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  metricValue: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#60a5fa'
  },
  routeProgress: {
    backgroundColor: '#0f172a',
    padding: '1rem',
    borderRadius: '12px',
    border: '1px solid #334155'
  },
  progressTitle: {
    margin: '0 0 0.75rem 0',
    fontSize: '0.85rem',
    color: '#cbd5e1',
    fontWeight: '600'
  },
  stopsList: {
    display: 'flex',
    flexDirection: 'column'
  },
  stopRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    minHeight: '36px'
  },
  stopConnector: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '12px',
    minHeight: '36px'
  },
  stopInfo: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingBottom: '0.5rem'
  },
  stopName: {
    fontSize: '0.85rem',
    fontWeight: '500'
  },
  stopSeq: {
    fontSize: '0.7rem',
    color: '#475569'
  },
  eventLogSection: {
    backgroundColor: '#0f172a',
    padding: '1rem',
    borderRadius: '12px',
    border: '1px solid #334155'
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  eventRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0.4rem 0',
    borderBottom: '1px solid #1e293b'
  }
};

export default BusTracker;
