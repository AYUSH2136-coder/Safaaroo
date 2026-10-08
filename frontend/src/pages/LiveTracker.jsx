
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDevicesApi, fetchAllBusStates, fetchRouteStops, resetBusRouteApi } from '../services/api';
import { socket } from '../services/socket';
import {
  ArrowLeft, Bus, MapPin, Navigation, Bell, Clock, Wifi, WifiOff,
  ChevronRight, CheckCircle, AlertCircle, RefreshCw, Smartphone, Flag, Play
} from 'lucide-react';

const OFFLINE_THRESHOLD_MS = 15000;

const STATE_CONFIG = {
  OUTSIDE: { label: 'Running', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: Navigation },
  APPROACHING: { label: 'Approaching', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: AlertCircle },
  ARRIVED: { label: 'At Stop', color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: CheckCircle },
  DEPARTED: { label: 'Departed', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: ChevronRight }
};

const LiveTracker = () => {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [busStates, setBusStates] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Tick clock for online/offline evaluation and timed status display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const getDeviceStatus = (dev) => {
    if (!dev?.last_update) return 'offline';
    return (now - dev.last_update) <= OFFLINE_THRESHOLD_MS ? 'online' : 'offline';
  };

  // Merge device + bus state into unified list
  const getMergedList = useCallback(() => {
    return devices.map(dev => {
      const bus = busStates.find(b => b.bus_id === dev.device_id);
      return { ...dev, bus };
    });
  }, [devices, busStates]);

  const selectedItem = getMergedList().find(d => d.device_id === selectedDeviceId);
  const selectedBus = selectedItem?.bus || null;

  // Load devices
  const loadDevices = useCallback(async () => {
    try {
      const res = await fetchDevicesApi();
      if (res.success) setDevices(res.devices);
    } catch (e) { console.error('Error fetching devices:', e); }
  }, []);

  // Load bus states
  const loadBusStates = useCallback(async () => {
    try {
      const res = await fetchAllBusStates();
      if (res.success) setBusStates(res.busStates);
    } catch (e) { console.error('Error fetching bus states:', e); }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadDevices(),
      loadBusStates(),
      new Promise(resolve => setTimeout(resolve, 300)) // Artificial delay for visual feedback
    ]);
    setLoading(false);
  }, [loadDevices, loadBusStates]);

  // Load route stops when selected bus changes
  const loadRouteStops = useCallback(async (routeId) => {
    if (!routeId) { setRouteStops([]); return; }
    try {
      const res = await fetchRouteStops(routeId);
      if (res.success) setRouteStops(res.stops);
    } catch (e) { console.error('Error fetching route stops:', e); }
  }, []);

  // Initial load and periodic auto-refresh (every 15 seconds)
  useEffect(() => {
    loadAll();
    const autoRefreshInterval = setInterval(() => {
      loadAll();
    }, 10000);
    return () => clearInterval(autoRefreshInterval);
  }, [loadAll]);

  // Auto-select first device
  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) setSelectedDeviceId(devices[0].device_id);
  }, [devices, selectedDeviceId]);

  // Load stops when selected bus route changes
  useEffect(() => {
    if (selectedBus?.route_id) loadRouteStops(selectedBus.route_id);
    else setRouteStops([]);
  }, [selectedBus?.route_id, loadRouteStops]);

  // Socket listeners
  useEffect(() => {
    socket.connect();

    socket.on('location_updated', (data) => {
      setDevices(prev => {
        const idx = prev.findIndex(d => d.device_id === data.device_id);
        if (idx !== -1) { const u = [...prev]; u[idx] = { ...u[idx], ...data }; return u; }
        loadDevices();
        return prev;
      });
    });

    socket.on('device_status_changed', (data) => {
      setDevices(prev => prev.map(d =>
        d.device_id === data.device_id ? { ...d, status: data.status, is_transmitting: 0 } : d
      ));
    });

    socket.on('bus_state_updated', (data) => {
      setBusStates(prev => {
        const idx = prev.findIndex(b => b.bus_id === data.bus_id);
        if (idx !== -1) { const u = [...prev]; u[idx] = { ...u[idx], ...data }; return u; }
        return [...prev, data];
      });
    });

    socket.on('stop_event', (evt) => {
      setEventLog(prev => [evt, ...prev].slice(0, 50));
    });

    return () => {
      socket.off('location_updated');
      socket.off('device_status_changed');
      socket.off('bus_state_updated');
      socket.off('stop_event');
      socket.disconnect();
    };
  }, []);

  const handleRestart = async (busId) => {
    if (!window.confirm('Restart this route? Bus state will reset to the beginning.')) return;
    try {
      const res = await resetBusRouteApi(busId);
      if (res.success) { alert('Route restarted.'); loadAll(); }
      else alert('Failed: ' + res.message);
    } catch (e) { alert('Error restarting route.'); }
  };

  const getCfg = (state) => STATE_CONFIG[state] || STATE_CONFIG.OUTSIDE;

  const getDisplayState = (bus) => {
    if (!bus) return STATE_CONFIG.OUTSIDE;
    // "Not Started" when route was just assigned or restarted
    if (bus.last_event === 'ROUTE_RESTARTED' || (!bus.last_event && bus.state === 'ARRIVED')) {
      return { label: 'Not Started', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', icon: Bell };
    }
    // DEPARTED is now a real persistent state from the backend
    // (between arrival_radius and approach_radius), so map it directly
    return getCfg(bus.state);
  };

  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';

  const getStopProgress = (stop) => {
    if (!selectedBus) return 'pending';
    const nextSeq = routeStops.find(s => s.stop_id === selectedBus.next_stop_id)?.sequence_no;
    const curSeq = routeStops.find(s => s.stop_id === selectedBus.current_stop_id)?.sequence_no;
    if (curSeq !== undefined && stop.sequence_no <= curSeq) return 'completed';
    if (stop.stop_id === selectedBus.next_stop_id) return 'next';
    return 'pending';
  };

  const mergedList = getMergedList();

  return (
    <div style={S.container}>
      <style>{`
        @keyframes spinAnim { 100% { transform: rotate(360deg); } }
      `}</style>
      <div style={S.card}>
        {/* Top Bar */}
        <div style={S.topBar}>
          <button onClick={() => navigate('/home')} style={S.backBtn}>
            <ArrowLeft size={18} style={{ marginRight: 6 }} /> Back
          </button>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>SafarNama Live Tracker</h2>
          <button onClick={loadAll} style={S.refreshBtn} title="Refresh" disabled={loading}>
            <RefreshCw size={16} style={loading ? { animation: 'spinAnim 1s linear infinite' } : {}} />
          </button>
        </div>

        {!loading && mergedList.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <Navigation size={48} color="#334155" />
            <p style={S.emptyText}>No devices found. Register a device first.</p>
          </div>
        )}

        {mergedList.length > 0 && (
          <div style={S.mainGrid}>
            {/* ─── LEFT: Device List ─────────────────────── */}
            <div style={S.listCol}>
              <h3 style={S.secHeader}>Devices ({mergedList.length})</h3>
              {mergedList.map(item => {
                const status = getDeviceStatus(item);
                const isSel = selectedDeviceId === item.device_id;
                const busCfg = item.bus ? getDisplayState(item.bus) : null;
                return (
                  <div key={item.device_id} onClick={() => setSelectedDeviceId(item.device_id)}
                    style={{ ...S.devItem, borderColor: isSel ? '#60a5fa' : '#334155', backgroundColor: isSel ? 'rgba(96,165,250,0.08)' : '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <Smartphone size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.device_name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.username}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      {/* Online/Offline pill */}
                      <div style={{ ...S.pill, backgroundColor: status === 'online' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: status === 'online' ? '#10b981' : '#f87171', borderColor: status === 'online' ? '#10b981' : '#ef4444' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: status === 'online' ? '#10b981' : '#ef4444' }} />
                        {status === 'online' ? 'ON' : 'OFF'}
                      </div>
                      {/* Bus state pill */}
                      {busCfg && (
                        <div style={{ ...S.pill, backgroundColor: busCfg.bg, color: busCfg.color, borderColor: busCfg.color }}>
                          {busCfg.label}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ─── RIGHT: Details ────────────────────────── */}
            <div style={S.detailCol}>
              {selectedItem ? (
                <>
                  {/* GPS Metrics Card (from Receiver) */}
                  <div style={S.section}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={S.secTitle}>
                        <MapPin size={15} style={{ marginRight: 6, color: '#60a5fa' }} />
                        Live GPS Data
                      </h4>
                      <div style={{ ...S.pill, backgroundColor: getDeviceStatus(selectedItem) === 'online' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: getDeviceStatus(selectedItem) === 'online' ? '#10b981' : '#f87171', borderColor: getDeviceStatus(selectedItem) === 'online' ? '#10b981' : '#ef4444', padding: '0.3rem 0.6rem' }}>
                        {getDeviceStatus(selectedItem) === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
                        {getDeviceStatus(selectedItem).toUpperCase()}
                      </div>
                    </div>
                    <div style={S.metricsGrid}>
                      <MetricBox label="Latitude" icon={<MapPin size={12} />} value={selectedItem.latitude != null ? Number(selectedItem.latitude).toFixed(6) : '--'} />
                      <MetricBox label="Longitude" icon={<MapPin size={12} />} value={selectedItem.longitude != null ? Number(selectedItem.longitude).toFixed(6) : '--'} />
                      <MetricBox label="Last Updated" icon={<Clock size={12} />} value={selectedItem.last_update ? new Date(selectedItem.last_update).toLocaleTimeString() : '--'} />
                      <MetricBox label="Device" icon={<Smartphone size={12} />} value={`${selectedItem.device_name}`} />
                    </div>
                  </div>

                  {/* Bus State Card (from BusTracker) */}
                  {selectedBus && (
                    <div style={S.section}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h4 style={S.secTitle}>
                          <Bus size={15} style={{ marginRight: 6, color: '#60a5fa' }} />
                          Route Status — {selectedBus.route_name || selectedBus.route_id}
                        </h4>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {(() => {
                            const c = getDisplayState(selectedBus); const I = c.icon; return (
                              <div style={{ ...S.pill, backgroundColor: c.bg, color: c.color, borderColor: c.color, padding: '0.3rem 0.6rem', fontWeight: 700 }}>
                                <I size={13} /> {c.label}
                              </div>
                            );
                          })()}
                          <button onClick={() => handleRestart(selectedBus.bus_id)} style={S.restartBtn} title="Restart Route">
                            <RefreshCw size={12} /> Restart
                          </button>
                        </div>
                      </div>
                      <div style={S.metricsGrid}>
                        <MetricBox label="Current Stop" icon={<MapPin size={12} />} value={selectedBus.current_stop_name || selectedBus.current_stop_id || '--'} />
                        <MetricBox label="Next Stop" icon={<MapPin size={12} />} value={selectedBus.next_stop_name || selectedBus.next_stop_id || '--'} />
                        <MetricBox label="Bus Status" icon={<Bell size={12} />}
                          value={getDisplayState(selectedBus).label}
                          color={getDisplayState(selectedBus).color} />
                        <MetricBox label="Speed" icon={<Navigation size={12} />} value={selectedBus.speed != null ? `${Number(selectedBus.speed).toFixed(1)} km/h` : '--'} />
                        <MetricBox label="Updated At" icon={<Clock size={12} />} value={fmtTime(selectedBus.updated_at || selectedBus.last_event_time)} />
                      </div>
                    </div>
                  )}

                  {/* Route Progress (Static Point-to-Point tracking like Where is my Train) */}
                  {selectedBus && routeStops.length > 0 && (
                    <div style={S.section}>
                      <style>{`
                        @keyframes pulseBus { 0%{box-shadow:0 0 0 0 rgba(96,165,250,0.7)} 70%{box-shadow:0 0 0 10px rgba(96,165,250,0)} 100%{box-shadow:0 0 0 0 rgba(96,165,250,0)} }
                      `}</style>
                      <h4 style={S.secTitle}>
                        <Navigation size={15} style={{ marginRight: 6, color: '#60a5fa' }} />
                        Live Running Status
                      </h4>

                      <div style={{ display: 'flex', flexDirection: 'column', marginTop: '1rem' }}>
                        {routeStops.map((stop, idx) => {
                          const isLast = idx === routeStops.length - 1;
                          const isFirst = idx === 0;

                          let progress = getStopProgress(stop);

                          // Check if bus hasn't started the journey yet
                          const notStartedYet = selectedBus.last_event === 'ROUTE_RESTARTED' || (!selectedBus.last_event && selectedBus.state === 'ARRIVED');

                          let isBusHere = false;
                          let isBusOnTrack = false;
                          let trackBusPos = '50%'; // Static position percentage down the track

                          if (isFirst && notStartedYet) {
                            // Journey hasn't started, bus is statically at the origin
                            isBusHere = true;
                          } else {
                            // Normal journey logic
                            isBusHere = selectedBus.state === 'ARRIVED' && stop.stop_id === selectedBus.current_stop_id;

                            if (selectedBus.current_stop_id === stop.stop_id && selectedBus.state !== 'ARRIVED') {
                              isBusOnTrack = true;
                              // Static pointer placement based on state
                              trackBusPos = selectedBus.state === 'APPROACHING' ? '80%' : '30%';
                            }
                          }

                          const dotColor = progress === 'completed' ? '#10b981' : progress === 'next' ? '#f59e0b' : '#334155';

                          // Track color is green if the next stop is completed OR if the bus is currently on this track
                          let trackColor = '#334155';
                          if (!isLast) {
                            if (getStopProgress(routeStops[idx + 1]) === 'completed') trackColor = '#10b981';
                            else if (isBusOnTrack) trackColor = '#10b981';
                          }

                          return (
                            <div key={stop.stop_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative' }}>
                              {/* Track Line & Nodes */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, minHeight: 70 }}>
                                <div style={{
                                  width: 16, height: 16, borderRadius: '50%',
                                  backgroundColor: '#0f172a', border: `3px solid ${dotColor}`,
                                  zIndex: 2, position: 'relative'
                                }}>
                                  {isBusHere && (
                                    <div style={{
                                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                                      backgroundColor: notStartedYet ? '#64748b' : '#60a5fa',
                                      borderRadius: '50%', padding: 4, zIndex: 10,
                                      animation: notStartedYet ? 'none' : 'pulseBus 2s infinite'
                                    }}>
                                      <Bus size={14} color="#fff" />
                                    </div>
                                  )}
                                </div>

                                {!isLast && (
                                  <div style={{ width: 4, flex: 1, backgroundColor: trackColor, position: 'relative', margin: '4px 0', borderRadius: 2 }}>
                                    {isBusOnTrack && (
                                      <div style={{
                                        position: 'absolute', top: trackBusPos, left: '50%', transform: 'translate(-50%,-50%)',
                                        backgroundColor: '#60a5fa', borderRadius: '50%', padding: 4,
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.5)', zIndex: 10,
                                        transition: 'top 1s ease-in-out'
                                      }}>
                                        <Bus size={12} color="#fff" />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Stop Details */}
                              <div style={{ flex: 1, paddingBottom: isLast ? 0 : '1.5rem', opacity: (progress === 'pending' && !isFirst) ? 0.55 : 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: (isBusHere && !notStartedYet) ? '#60a5fa' : progress === 'completed' ? '#10b981' : progress === 'next' ? '#f59e0b' : '#f8fafc' }}>
                                    {isFirst && <span style={{ fontSize: '0.7rem', marginRight: 4 }}>🚩</span>}
                                    {isLast && <span style={{ fontSize: '0.7rem', marginRight: 4 }}>🏁</span>}
                                    {stop.stop_name}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 1 }}>
                                    {isFirst ? 'Starting Point' : `Stop #${stop.sequence_no}`}
                                    {isLast && ' • Destination'}
                                    {progress === 'next' && !notStartedYet && ' • Next Stop'}
                                  </div>

                                  {isFirst && notStartedYet && (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>
                                      Journey not started yet
                                    </div>
                                  )}
                                </div>
                                {progress === 'completed' && <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 500 }}>Passed ✓</span>}
                                {progress === 'next' && !notStartedYet && selectedBus.state !== 'OUTSIDE' && (
                                  <span style={{ fontSize: '0.7rem', color: getCfg(selectedBus.state).color, fontWeight: 600 }}>
                                    {getCfg(selectedBus.state).label}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* No route assigned message */}
                  {!selectedBus && (
                    <div style={{ ...S.section, textAlign: 'center', padding: '2rem' }}>
                      <Bus size={32} color="#334155" />
                      <p style={{ ...S.emptyText, marginTop: '0.75rem' }}>This device is not assigned to any bus route.</p>
                      <p style={{ ...S.emptyText, fontSize: '0.75rem' }}>Use Route Manager to assign it.</p>
                    </div>
                  )}

                  {/* Event Log */}
                  {eventLog.length > 0 && (
                    <div style={S.section}>
                      <h4 style={S.secTitle}>
                        <Bell size={15} style={{ marginRight: 6, color: '#f59e0b' }} />
                        Recent Events
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {eventLog.slice(0, 8).map((evt, idx) => {
                          const c = getCfg(evt.event);
                          return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.35rem 0', borderBottom: '1px solid #1e293b' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color, flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <span style={{ color: c.color, fontWeight: 600, fontSize: '0.78rem' }}>{evt.event}</span>
                                <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}> — {evt.bus_id} at "{evt.stop_name}"</span>
                              </div>
                              <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>{fmtTime(evt.timestamp)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p style={S.emptyText}>Select a device from the list.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Small reusable metric box ─── */
const MetricBox = ({ label, icon, value, color }) => (
  <div style={{ backgroundColor: '#1e293b', padding: '0.6rem 0.75rem', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {icon} {label}
    </span>
    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: color || '#60a5fa' }}>{value}</span>
  </div>
);

/* ─── Styles ─── */
const S = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', padding: '1.5rem' },
  card: { backgroundColor: '#1e293b', padding: '1.5rem', borderRadius: 16, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', width: '100%', maxWidth: 1050 },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  backBtn: { display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' },
  refreshBtn: { background: '#0f172a', border: '1px solid #334155', color: '#60a5fa', padding: '0.5rem', borderRadius: 8, cursor: 'pointer' },
  mainGrid: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.25rem' },
  listCol: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  detailCol: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  secHeader: { fontSize: '0.85rem', color: '#cbd5e1', margin: '0 0 0.4rem 0', fontWeight: 600 },
  secTitle: { margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600, display: 'flex', alignItems: 'center' },
  devItem: { display: 'flex', alignItems: 'center', padding: '0.6rem 0.65rem', borderRadius: 10, border: '1px solid #334155', cursor: 'pointer', transition: 'all 0.15s', gap: 6 },
  pill: { display: 'flex', alignItems: 'center', gap: 4, padding: '0.15rem 0.45rem', borderRadius: 10, border: '1px solid', fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap' },
  section: { backgroundColor: '#0f172a', padding: '1rem', borderRadius: 12, border: '1px solid #334155' },
  metricsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' },
  restartBtn: { background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
  emptyText: { fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic', margin: '0.5rem 0' }
};

export default LiveTracker;
