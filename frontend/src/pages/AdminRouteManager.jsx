
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowLeft, Plus, Trash2, Save, MapPin, Bus, Phone,
  ChevronDown, ChevronUp, CheckCircle, AlertCircle, Settings,
  ArrowUp, ArrowDown
} from 'lucide-react';
import {
  fetchRoutes, fetchRouteStops, fetchDevicesApi,
  createRouteApi, addStopsApi, assignBusApi, subscribeStopApi
} from '../services/api';

// Fix Leaflet default marker icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const stopIcon = (seq, color = '#f59e0b') => L.divIcon({
  className: '',
  html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)">${seq}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Component that captures map clicks to add stops */
function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

const AdminRouteManager = () => {
  const navigate = useNavigate();

  // ── Wizard step: 'create' | 'stops' | 'assign' | 'subscribe'
  const [step, setStep] = useState('create');

  // ── Route state
  const [routeName, setRouteName] = useState('');
  const [routeDesc, setRouteDesc] = useState('');
  const [routeId, setRouteId] = useState('');
  const [existingRoutes, setExistingRoutes] = useState([]);
  const [selectedExisting, setSelectedExisting] = useState('');

  // ── Stops state
  const [stops, setStops] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [mapCenter, setMapCenter] = useState([23.2599, 77.4126]); // Default Bhopal

  // ── Bus assignment
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');

  // ── Subscriber
  const [subPhone, setSubPhone] = useState('');
  const [subStopId, setSubStopId] = useState('');

  // ── Feedback
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);

  // Try to get user's location for map center
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMapCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {}, { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // Load existing routes
  useEffect(() => {
    fetchRoutes().then(r => r.success && setExistingRoutes(r.routes)).catch(() => {});
    fetchDevicesApi().then(r => r.success && setDevices(r.devices)).catch(() => {});
  }, []);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  // ── Generate route_id from name
  const genRouteId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ── STEP 1: Create or select route
  const handleCreateRoute = async () => {
    if (!routeName.trim()) return showMsg('Route name is required.', 'error');
    const id = genRouteId(routeName);
    setRouteId(id);
    setLoading(true);
    try {
      const res = await createRouteApi(id, routeName.trim(), routeDesc.trim());
      if (res.success) {
        showMsg(`Route "${routeName}" created!`);
        setStep('stops');
      } else {
        showMsg(res.message || 'Failed to create route.', 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      showMsg(msg, 'error');
    }
    setLoading(false);
  };

  const handleSelectExisting = async () => {
    if (!selectedExisting) return;
    setRouteId(selectedExisting);
    const route = existingRoutes.find(r => r.route_id === selectedExisting);
    setRouteName(route?.route_name || selectedExisting);
    try {
      const res = await fetchRouteStops(selectedExisting);
      if (res.success && res.stops.length > 0) {
        setStops(res.stops.map(s => ({
          stop_id: s.stop_id, stop_name: s.stop_name, sequence_no: s.sequence_no,
          latitude: s.latitude, longitude: s.longitude,
          approach_radius_m: s.approach_radius_m, arrival_radius_m: s.arrival_radius_m,
          saved: true
        })));
        setMapCenter([res.stops[0].latitude, res.stops[0].longitude]);
      }
    } catch {}
    setStep('stops');
    showMsg(`Loaded route "${route?.route_name || selectedExisting}"`);
  };

  // ── STEP 2: Add stops via map click
  const handleMapClick = (latlng) => {
    const seq = stops.length + 1;
    const newStop = {
      stop_id: `${routeId}-stop-${seq}`,
      stop_name: `Stop ${seq}`,
      sequence_no: seq,
      latitude: parseFloat(latlng.lat.toFixed(6)),
      longitude: parseFloat(latlng.lng.toFixed(6)),
      approach_radius_m: 200,
      arrival_radius_m: 50,
      saved: false
    };
    setStops(prev => [...prev, newStop]);
    setEditingIdx(stops.length);
  };

  const updateStop = (idx, field, value) => {
    setStops(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value, saved: false };
      return updated;
    });
  };

  const moveStop = (idx, dir) => {
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === stops.length - 1) return;
    
    setStops(prev => {
      const arr = [...prev];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      
      // Swap elements
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      
      // Re-assign sequence numbers and mark as unsaved
      return arr.map((s, i) => ({ 
        ...s, 
        sequence_no: i + 1, 
        stop_id: `${routeId}-stop-${i + 1}`,
        saved: false 
      }));
    });
    
    // Adjust editing index if needed
    if (editingIdx === idx) setEditingIdx(dir === 'up' ? idx - 1 : idx + 1);
    else if (editingIdx === (dir === 'up' ? idx - 1 : idx + 1)) setEditingIdx(idx);
  };

  const removeStop = (idx) => {
    setStops(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      return updated.map((s, i) => ({ ...s, sequence_no: i + 1, stop_id: `${routeId}-stop-${i + 1}`, saved: false }));
    });
    if (editingIdx === idx) setEditingIdx(null);
  };

  const handleSaveStops = async () => {
    const unsaved = stops.filter(s => !s.saved);
    if (unsaved.length === 0) { setStep('assign'); return; }
    setLoading(true);
    try {
      const payload = unsaved.map(s => ({
        stop_id: s.stop_id, stop_name: s.stop_name, sequence_no: s.sequence_no,
        latitude: s.latitude, longitude: s.longitude,
        approach_radius_m: s.approach_radius_m, arrival_radius_m: s.arrival_radius_m
      }));
      const res = await addStopsApi(routeId, payload);
      if (res.success) {
        setStops(prev => prev.map(s => ({ ...s, saved: true })));
        showMsg(`${unsaved.length} stop(s) saved!`);
        setStep('assign');
      } else {
        showMsg(res.message || 'Failed to save stops.', 'error');
      }
    } catch (err) {
      showMsg(err.response?.data?.message || err.message, 'error');
    }
    setLoading(false);
  };

  // ── STEP 3: Assign bus
  const handleAssignBus = async () => {
    if (!selectedDevice) return showMsg('Select a device.', 'error');
    setLoading(true);
    try {
      const res = await assignBusApi(selectedDevice, routeId);
      if (res.success) {
        showMsg(`Bus "${selectedDevice}" assigned!`);
        setStep('subscribe');
      } else {
        showMsg(res.message || 'Failed.', 'error');
      }
    } catch (err) {
      showMsg(err.response?.data?.message || err.message, 'error');
    }
    setLoading(false);
  };

  // ── STEP 4: Add subscriber
  const handleSubscribe = async () => {
    if (!subPhone.trim() || !subStopId) return showMsg('Select stop and enter phone.', 'error');
    setLoading(true);
    try {
      const res = await subscribeStopApi(subStopId, subPhone.trim());
      if (res.success) {
        showMsg(`Subscribed ${subPhone} to stop!`);
        setSubPhone('');
      } else {
        showMsg(res.message || 'Failed.', 'error');
      }
    } catch (err) {
      showMsg(err.response?.data?.message || err.message, 'error');
    }
    setLoading(false);
  };

  // ── Step indicator
  const stepsList = [
    { key: 'create', label: '1. Route', icon: Plus },
    { key: 'stops', label: '2. Stops', icon: MapPin },
    { key: 'assign', label: '3. Assign Bus', icon: Bus },
    { key: 'subscribe', label: '4. Subscribe', icon: Phone },
  ];

  return (
    <div style={s.container}>
      <div style={s.card}>
        {/* Top bar */}
        <div style={s.topBar}>
          <button onClick={() => navigate('/home')} style={s.backBtn}>
            <ArrowLeft size={18} style={{ marginRight: 6 }} /> Back
          </button>
          <Settings size={20} color="#60a5fa" />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <h2 style={s.title}>Route Manager</h2>
          <p style={s.subtitle}>Create routes, place stops on map, assign buses</p>
        </div>

        {/* Step indicator */}
        <div style={s.steps}>
          {stepsList.map((st, i) => {
            const Icon = st.icon;
            const isActive = st.key === step;
            const isDone = stepsList.findIndex(x => x.key === step) > i;
            return (
              <div key={st.key} onClick={() => {
                if (isDone || isActive) setStep(st.key);
              }} style={{
                ...s.stepItem,
                color: isActive ? '#60a5fa' : isDone ? '#10b981' : '#475569',
                cursor: isDone || isActive ? 'pointer' : 'default',
                borderBottomColor: isActive ? '#60a5fa' : isDone ? '#10b981' : 'transparent',
              }}>
                {isDone ? <CheckCircle size={16} /> : <Icon size={16} />}
                <span style={{ fontSize: '0.78rem' }}>{st.label}</span>
              </div>
            );
          })}
        </div>

        {/* Message bar */}
        {message.text && (
          <div style={{
            ...s.msgBar,
            backgroundColor: message.type === 'error' ? 'rgba(239,68,68,.15)' : 'rgba(16,185,129,.15)',
            borderColor: message.type === 'error' ? '#ef4444' : '#10b981',
            color: message.type === 'error' ? '#f87171' : '#34d399',
          }}>
            {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
            {message.text}
          </div>
        )}

        {/* ════════ STEP 1: Create / Select Route ════════ */}
        {step === 'create' && (
          <div style={s.section}>
            <h3 style={s.sectionTitle}>Create New Route</h3>
            <input style={s.input} placeholder="Route Name (e.g. Bhopal City Route 1)"
              value={routeName} onChange={e => setRouteName(e.target.value)} />
            <input style={s.input} placeholder="Description (optional)"
              value={routeDesc} onChange={e => setRouteDesc(e.target.value)} />
            <button style={s.primaryBtn} onClick={handleCreateRoute} disabled={loading}>
              {loading ? 'Creating...' : 'Create Route & Add Stops →'}
            </button>

            {existingRoutes.length > 0 && (
              <>
                <div style={s.divider}><span style={s.dividerText}>OR load existing</span></div>
                <select style={s.select} value={selectedExisting}
                  onChange={e => setSelectedExisting(e.target.value)}>
                  <option value="">— Select existing route —</option>
                  {existingRoutes.map(r => (
                    <option key={r.route_id} value={r.route_id}>{r.route_name}</option>
                  ))}
                </select>
                <button style={s.secondaryBtn} onClick={handleSelectExisting} disabled={!selectedExisting}>
                  Load Route
                </button>
              </>
            )}
          </div>
        )}

        {/* ════════ STEP 2: Map + Stop List ════════ */}
        {step === 'stops' && (
          <div>
            <h3 style={s.sectionTitle}>
              <MapPin size={18} style={{ marginRight: 6 }} />
              Place Stops on Map — "{routeName}"
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
              Click on the map to add stops. Edit names and radii in the panel below.
            </p>

            {/* Map */}
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #334155', marginBottom: '1rem' }}>
              <MapContainer center={mapCenter} zoom={15} style={{ height: 350, width: '100%' }}
                scrollWheelZoom={true}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler onMapClick={handleMapClick} />
                {stops.map((stop, idx) => (
                  <Marker key={idx} position={[stop.latitude, stop.longitude]}
                    icon={stopIcon(stop.sequence_no, stop.saved ? '#10b981' : '#f59e0b')}>
                    <Popup>
                      <strong>{stop.stop_name}</strong><br />
                      Seq: {stop.sequence_no}<br />
                      ({stop.latitude}, {stop.longitude})
                    </Popup>
                  </Marker>
                ))}
                {stops.length > 1 && (
                  <Polyline positions={stops.map(s => [s.latitude, s.longitude])}
                    color="#60a5fa" weight={3} opacity={0.6} dashArray="8 4" />
                )}
              </MapContainer>
            </div>

            {/* Stop list */}
            <div style={s.stopList}>
              {stops.length === 0 && (
                <p style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                  Click on the map to add your first stop
                </p>
              )}
              {stops.map((stop, idx) => (
                <div key={idx} style={{
                  ...s.stopCard,
                  borderColor: editingIdx === idx ? '#60a5fa' : '#334155'
                }}>
                  <div style={s.stopHeader} onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: stop.saved ? '#10b981' : '#f59e0b',
                        color: '#fff', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700
                      }}>{stop.sequence_no}</div>
                      <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: '0.9rem' }}>{stop.stop_name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {stop.saved && <CheckCircle size={14} color="#10b981" />}
                      
                      {/* Sequence Order Buttons */}
                      <button onClick={(e) => { e.stopPropagation(); moveStop(idx, 'up'); }} style={{...s.iconBtn, opacity: idx === 0 ? 0.3 : 1}} disabled={idx === 0}>
                        <ArrowUp size={14} color="#60a5fa" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); moveStop(idx, 'down'); }} style={{...s.iconBtn, opacity: idx === stops.length - 1 ? 0.3 : 1}} disabled={idx === stops.length - 1}>
                        <ArrowDown size={14} color="#60a5fa" />
                      </button>

                      <button onClick={(e) => { e.stopPropagation(); removeStop(idx); }} style={s.iconBtn}>
                        <Trash2 size={14} color="#ef4444" />
                      </button>
                      {editingIdx === idx ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                    </div>
                  </div>

                  {editingIdx === idx && (
                    <div style={s.stopEdit}>
                      <div style={s.fieldRow}>
                        <label style={s.fieldLabel}>Stop Name</label>
                        <input style={s.fieldInput} value={stop.stop_name}
                          onChange={e => updateStop(idx, 'stop_name', e.target.value)} />
                      </div>
                      <div style={s.fieldGrid}>
                        <div>
                          <label style={s.fieldLabel}>Latitude</label>
                          <input style={s.fieldInput} type="number" step="0.000001" value={stop.latitude}
                            onChange={e => updateStop(idx, 'latitude', parseFloat(e.target.value))} />
                        </div>
                        <div>
                          <label style={s.fieldLabel}>Longitude</label>
                          <input style={s.fieldInput} type="number" step="0.000001" value={stop.longitude}
                            onChange={e => updateStop(idx, 'longitude', parseFloat(e.target.value))} />
                        </div>
                      </div>
                      <div style={s.fieldGrid}>
                        <div>
                          <label style={s.fieldLabel}>Approach Radius (m)</label>
                          <input style={s.fieldInput} type="number" value={stop.approach_radius_m}
                            onChange={e => updateStop(idx, 'approach_radius_m', parseInt(e.target.value) || 200)} />
                        </div>
                        <div>
                          <label style={s.fieldLabel}>Arrival Radius (m)</label>
                          <input style={s.fieldInput} type="number" value={stop.arrival_radius_m}
                            onChange={e => updateStop(idx, 'arrival_radius_m', parseInt(e.target.value) || 50)} />
                        </div>
                      </div>
                      <p style={{ color: '#475569', fontSize: '0.7rem', margin: '0.25rem 0 0' }}>
                        ID: {stop.stop_id}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button style={{ ...s.primaryBtn, marginTop: '1rem' }} onClick={handleSaveStops}
              disabled={loading || stops.length === 0}>
              {loading ? 'Saving...' : stops.every(s => s.saved) ? 'Continue to Assign Bus →' : `Save ${stops.filter(s => !s.saved).length} Stop(s) & Continue →`}
            </button>
          </div>
        )}

        {/* ════════ STEP 3: Assign Bus ════════ */}
        {step === 'assign' && (
          <div style={s.section}>
            <h3 style={s.sectionTitle}>
              <Bus size={18} style={{ marginRight: 6 }} />
              Assign Bus to "{routeName}"
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 1rem' }}>
              Select a logged-in device to act as the bus on this route.
            </p>
            <select style={s.select} value={selectedDevice}
              onChange={e => setSelectedDevice(e.target.value)}>
              <option value="">— Select a device —</option>
              {devices.map(d => (
                <option key={d.device_id} value={d.device_id}>
                  {d.username} — {d.device_name} ({d.device_id})
                </option>
              ))}
            </select>
            <button style={s.primaryBtn} onClick={handleAssignBus} disabled={loading || !selectedDevice}>
              {loading ? 'Assigning...' : 'Assign Bus & Continue →'}
            </button>
            <button style={s.skipBtn} onClick={() => setStep('subscribe')}>
              Skip for now →
            </button>
          </div>
        )}

        {/* ════════ STEP 4: Subscribe ════════ */}
        {step === 'subscribe' && (
          <div style={s.section}>
            <h3 style={s.sectionTitle}>
              <Phone size={18} style={{ marginRight: 6 }} />
              Add SMS Subscribers
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 1rem' }}>
              Subscribe phone numbers to specific stops for SMS alerts.
            </p>
            <select style={s.select} value={subStopId}
              onChange={e => setSubStopId(e.target.value)}>
              <option value="">— Select a stop —</option>
              {stops.map(st => (
                <option key={st.stop_id} value={st.stop_id}>
                  #{st.sequence_no} {st.stop_name}
                </option>
              ))}
            </select>
            <input style={s.input} placeholder="Phone number (e.g. +919876543210)"
              value={subPhone} onChange={e => setSubPhone(e.target.value)} />
            <button style={s.primaryBtn} onClick={handleSubscribe} disabled={loading}>
              {loading ? 'Subscribing...' : 'Subscribe'}
            </button>

            <div style={{ ...s.divider, marginTop: '1.5rem' }}><span style={s.dividerText}>All done!</span></div>
            <button style={s.successBtn} onClick={() => navigate('/bus-tracker')}>
              🚌 Open Bus Tracker Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
const s = {
  container: { display:'flex',justifyContent:'center',alignItems:'flex-start',minHeight:'100vh',backgroundColor:'#0f172a',color:'#f8fafc',padding:'1.5rem' },
  card: { backgroundColor:'#1e293b',padding:'1.75rem',borderRadius:16,boxShadow:'0 10px 25px -5px rgba(0,0,0,.5)',width:'100%',maxWidth:780 },
  topBar: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem' },
  backBtn: { display:'flex',alignItems:'center',background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:'0.9rem' },
  title: { margin:'0 0 .25rem',fontSize:'1.4rem',color:'#f8fafc' },
  subtitle: { margin:0,fontSize:'.85rem',color:'#94a3b8' },
  steps: { display:'flex',gap:4,marginBottom:'1.25rem',borderBottom:'1px solid #334155',paddingBottom:0 },
  stepItem: { display:'flex',alignItems:'center',gap:6,padding:'.5rem .75rem',borderBottom:'2px solid',transition:'all .2s',flex:1,justifyContent:'center' },
  section: { display:'flex',flexDirection:'column',gap:'.75rem' },
  sectionTitle: { display:'flex',alignItems:'center',margin:'0 0 .5rem',fontSize:'1.05rem',color:'#e2e8f0',fontWeight:600 },
  input: { background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'.7rem .9rem',color:'#f8fafc',fontSize:'.9rem',outline:'none',width:'100%',boxSizing:'border-box' },
  select: { background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'.7rem .9rem',color:'#f8fafc',fontSize:'.9rem',outline:'none',width:'100%',boxSizing:'border-box' },
  primaryBtn: { background:'#2563eb',color:'#fff',border:'none',borderRadius:8,padding:'.75rem',fontSize:'.9rem',fontWeight:600,cursor:'pointer',width:'100%' },
  secondaryBtn: { background:'#334155',color:'#e2e8f0',border:'none',borderRadius:8,padding:'.7rem',fontSize:'.85rem',fontWeight:500,cursor:'pointer',width:'100%' },
  skipBtn: { background:'none',color:'#64748b',border:'none',padding:'.5rem',fontSize:'.8rem',cursor:'pointer',textAlign:'center' },
  successBtn: { background:'#059669',color:'#fff',border:'none',borderRadius:8,padding:'.75rem',fontSize:'.9rem',fontWeight:600,cursor:'pointer',width:'100%' },
  divider: { display:'flex',alignItems:'center',gap:12,margin:'.75rem 0',color:'#475569' },
  dividerText: { whiteSpace:'nowrap',fontSize:'.8rem',color:'#64748b' },
  msgBar: { display:'flex',alignItems:'center',gap:8,padding:'.6rem .9rem',borderRadius:8,border:'1px solid',fontSize:'.85rem',marginBottom:'.75rem' },
  stopList: { display:'flex',flexDirection:'column',gap:'.5rem',maxHeight:300,overflowY:'auto' },
  stopCard: { background:'#0f172a',border:'1px solid #334155',borderRadius:10,overflow:'hidden' },
  stopHeader: { display:'flex',justifyContent:'space-between',alignItems:'center',padding:'.65rem .85rem',cursor:'pointer' },
  stopEdit: { padding:'.75rem .85rem',borderTop:'1px solid #1e293b',display:'flex',flexDirection:'column',gap:'.5rem' },
  fieldRow: { display:'flex',flexDirection:'column',gap:'.2rem' },
  fieldGrid: { display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem' },
  fieldLabel: { fontSize:'.7rem',color:'#64748b',textTransform:'uppercase',letterSpacing:'.5px' },
  fieldInput: { background:'#1e293b',border:'1px solid #334155',borderRadius:6,padding:'.5rem .7rem',color:'#f8fafc',fontSize:'.85rem',outline:'none',width:'100%',boxSizing:'border-box' },
  iconBtn: { background:'none',border:'none',cursor:'pointer',padding:2,display:'flex' },
};

export default AdminRouteManager;
