import React, { useState, useEffect } from 'react';
import {
  fetchAllSchools, fetchSchoolVehicles,
  fetchParentProfile, updateParentProfile
} from '../../services/api';
import { School, Bus, MapPin, Check, ChevronRight, Bell } from 'lucide-react';

const STEPS = ['School', 'Bus', 'Home', 'Notify'];

const RouteManager = () => {
  const [step, setStep] = useState(0);
  const [schools, setSchools] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [selected, setSelected] = useState({
    school_id: '', vehicle_id: '', home_lat: '', home_lng: '', notify_pref: 'sms'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const [sRes, pRes] = await Promise.all([fetchAllSchools(), fetchParentProfile()]);
      setSchools(sRes.schools || []);
      const p = pRes.profile;
      setProfile(p);
      // Pre-fill from saved profile
      setSelected({
        school_id: p.school_id || '',
        vehicle_id: p.vehicle_id || '',
        home_lat: p.home_lat || '',
        home_lng: p.home_lng || '',
        notify_pref: p.notify_pref || 'sms',
      });
      // If school already set, load vehicles
      if (p.school_id) {
        const vRes = await fetchSchoolVehicles(p.school_id);
        setVehicles(vRes.vehicles || []);
      }
    } catch (err) {
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSchoolSelect = async (schoolId) => {
    setSelected(s => ({ ...s, school_id: schoolId, vehicle_id: '' }));
    try {
      const vRes = await fetchSchoolVehicles(schoolId);
      setVehicles(vRes.vehicles || []);
    } catch {
      setError('Failed to load vehicles for this school.');
    }
  };

  const detectHome = () => {
    if (!navigator.geolocation) { setError('GPS not supported.'); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSelected(s => ({ ...s, home_lat: pos.coords.latitude.toFixed(6), home_lng: pos.coords.longitude.toFixed(6) }));
        setDetecting(false);
      },
      () => { setError('Could not get GPS location.'); setDetecting(false); }
    );
  };

  const handleSave = async () => {
    if (!selected.school_id || !selected.vehicle_id) {
      setError('Please complete all steps before saving.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      await updateParentProfile({
        school_id: selected.school_id,
        vehicle_id: selected.vehicle_id,
        home_lat: selected.home_lat ? parseFloat(selected.home_lat) : undefined,
        home_lng: selected.home_lng ? parseFloat(selected.home_lng) : undefined,
        notify_pref: selected.notify_pref,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={styles.center}><p style={{ color: '#94a3b8' }}>Loading…</p></div>;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Route Setup</h2>
      <p style={styles.subtitle}>Tell us about your child's commute in 3 steps.</p>

      {/* Step Progress */}
      <div style={styles.stepRow}>
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <button
              id={`step-${i}`}
              style={{ ...styles.stepBtn, ...(step === i ? styles.stepActive : {}), ...(i < step ? styles.stepDone : {}) }}
              onClick={() => setStep(i)}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </button>
            {i < STEPS.length - 1 && <div style={{ ...styles.stepLine, ...(i < step ? styles.stepLineDone : {}) }} />}
          </React.Fragment>
        ))}
      </div>
      <div style={styles.stepLabelRow}>
        {STEPS.map((label, i) => (
          <span key={i} style={{ ...styles.stepLabel, ...(step === i ? styles.stepLabelActive : {}) }}>{label}</span>
        ))}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {saved && <div style={styles.successBox}>✅ Route saved successfully!</div>}

      {/* ── Step 0: Select School ── */}
      {step === 0 && (
        <div style={styles.stepContent}>
          <h3 style={styles.stepTitle}>🏫 Select your child's school</h3>
          <p style={styles.stepHint}>The school coordinates will auto-set as the destination on the map.</p>
          {schools.length === 0 ? (
            <p style={styles.empty}>No schools registered yet. Ask your operator to add schools.</p>
          ) : (
            <div style={styles.listGrid}>
              {schools.map(s => (
                <button
                  key={s.school_id}
                  id={`school-${s.school_id}`}
                  style={{ ...styles.selectionCard, ...(selected.school_id === s.school_id ? styles.selectionCardActive : {}) }}
                  onClick={() => handleSchoolSelect(s.school_id)}
                >
                  <School size={18} style={{ color: '#38bdf8', flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={styles.cardName}>{s.school_name}</p>
                    {s.address && <p style={styles.cardSub}>{s.address}</p>}
                    <p style={styles.cardCoords}>📍 {s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)}</p>
                  </div>
                  {selected.school_id === s.school_id && <Check size={16} style={{ color: '#4ade80' }} />}
                </button>
              ))}
            </div>
          )}
          {selected.school_id && (
            <button id="step-next-0" style={styles.nextBtn} onClick={() => setStep(1)}>
              Next <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}

      {/* ── Step 1: Select Bus ── */}
      {step === 1 && (
        <div style={styles.stepContent}>
          <h3 style={styles.stepTitle}>🚌 Select your child's bus</h3>
          {!selected.school_id ? (
            <p style={styles.empty}>Please select a school first.</p>
          ) : vehicles.length === 0 ? (
            <p style={styles.empty}>No buses registered for this school yet.</p>
          ) : (
            <div style={styles.listGrid}>
              {vehicles.map(v => (
                <button
                  key={v.vehicle_id}
                  id={`vehicle-${v.vehicle_id}`}
                  style={{ ...styles.selectionCard, ...(selected.vehicle_id === v.vehicle_id ? styles.selectionCardActive : {}) }}
                  onClick={() => setSelected(s => ({ ...s, vehicle_id: v.vehicle_id }))}
                >
                  <Bus size={18} style={{ color: '#38bdf8', flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={styles.cardName}>{v.vehicle_id}</p>
                    {v.vehicle_name && <p style={styles.cardSub}>{v.vehicle_name}</p>}
                    {v.slot_no && <span style={styles.slotBadge}>{v.slot_no}</span>}
                    {v.driver_name && <p style={styles.cardSub}>🧑‍✈️ {v.driver_name}</p>}
                  </div>
                  {selected.vehicle_id === v.vehicle_id && <Check size={16} style={{ color: '#4ade80' }} />}
                </button>
              ))}
            </div>
          )}
          <div style={styles.stepNav}>
            <button id="step-back-1" style={styles.backBtn} onClick={() => setStep(0)}>Back</button>
            {selected.vehicle_id && (
              <button id="step-next-1" style={styles.nextBtn} onClick={() => setStep(2)}>
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Set Home Location ── */}
      {step === 2 && (
        <div style={styles.stepContent}>
          <h3 style={styles.stepTitle}>🏠 Set your home location</h3>
          <p style={styles.stepHint}>This becomes the origin point shown on the tracker map.</p>

          <button id="btn-detect-home" style={styles.gpsBtn} onClick={detectHome} disabled={detecting}>
            <MapPin size={16} /> {detecting ? 'Detecting…' : 'Use My Current GPS Location'}
          </button>

          <p style={styles.stepHint}>Or enter coordinates manually:</p>
          <div style={styles.coordsRow}>
            <input
              id="home-lat" type="number" step="any" placeholder="Latitude"
              value={selected.home_lat}
              onChange={e => setSelected(s => ({ ...s, home_lat: e.target.value }))}
              style={styles.coordInput}
            />
            <input
              id="home-lng" type="number" step="any" placeholder="Longitude"
              value={selected.home_lng}
              onChange={e => setSelected(s => ({ ...s, home_lng: e.target.value }))}
              style={styles.coordInput}
            />
          </div>

          {selected.home_lat && selected.home_lng && (
            <p style={styles.coordsPreview}>
              📍 Home set at {parseFloat(selected.home_lat).toFixed(5)}, {parseFloat(selected.home_lng).toFixed(5)}
            </p>
          )}

          <div style={styles.stepNav}>
            <button id="step-back-2" style={styles.backBtn} onClick={() => setStep(1)}>Back</button>
            <button id="step-next-2" style={styles.nextBtn} onClick={() => setStep(3)}>
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Notification Preference ── */}
      {step === 3 && (
        <div style={styles.stepContent}>
          <h3 style={styles.stepTitle}>🔔 Notification preference</h3>
          <p style={styles.stepHint}>How would you like to be notified when the bus is nearby?</p>

          <div style={styles.notifyRow}>
            {['sms', 'whatsapp'].map(pref => (
              <button
                key={pref}
                id={`notify-${pref}`}
                style={{ ...styles.notifyBtn, ...(selected.notify_pref === pref ? styles.notifyBtnActive : {}) }}
                onClick={() => setSelected(s => ({ ...s, notify_pref: pref }))}
              >
                {pref === 'sms' ? '📱 SMS' : '💬 WhatsApp'}
              </button>
            ))}
          </div>

          <div style={styles.stepNav}>
            <button id="step-back-3" style={styles.backBtn} onClick={() => setStep(2)}>Back</button>
            <button id="btn-save" style={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : '✅ Save Route'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: { padding: '1.25rem', maxWidth: '600px', margin: '0 auto' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' },
  title: { margin: '0 0 0.25rem', fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' },
  subtitle: { margin: '0 0 1.5rem', fontSize: '0.82rem', color: '#94a3b8' },
  stepRow: { display: 'flex', alignItems: 'center', marginBottom: '0.4rem' },
  stepBtn: {
    width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #334155',
    backgroundColor: '#1e293b', color: '#64748b', fontSize: '0.75rem', fontWeight: '700',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0
  },
  stepActive: { borderColor: '#0284c7', backgroundColor: '#0284c7', color: '#fff' },
  stepDone: { borderColor: '#4ade80', backgroundColor: '#4ade80', color: '#0f172a' },
  stepLine: { flex: 1, height: '2px', backgroundColor: '#334155' },
  stepLineDone: { backgroundColor: '#4ade80' },
  stepLabelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' },
  stepLabel: { fontSize: '0.7rem', color: '#64748b', flex: 1, textAlign: 'center' },
  stepLabelActive: { color: '#38bdf8', fontWeight: '600' },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
    color: '#f87171', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem'
  },
  successBox: {
    backgroundColor: 'rgba(74,222,128,0.1)', border: '1px solid #4ade80',
    color: '#4ade80', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center'
  },
  stepContent: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  stepTitle: { margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '600', color: '#f8fafc' },
  stepHint: { margin: 0, fontSize: '0.8rem', color: '#64748b' },
  listGrid: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  selectionCard: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px',
    padding: '0.875rem 1rem', cursor: 'pointer', textAlign: 'left', width: '100%',
    color: '#f8fafc', transition: 'border-color 0.2s'
  },
  selectionCardActive: { borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,0.1)' },
  cardName: { margin: '0 0 2px', fontSize: '0.95rem', fontWeight: '600' },
  cardSub: { margin: 0, fontSize: '0.78rem', color: '#94a3b8' },
  cardCoords: { margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' },
  slotBadge: {
    display: 'inline-block', backgroundColor: 'rgba(2,132,199,0.15)',
    color: '#38bdf8', fontSize: '0.68rem', padding: '2px 6px', borderRadius: '99px', fontWeight: '600'
  },
  empty: { color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '1rem' },
  stepNav: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  backBtn: {
    padding: '0.6rem 1.25rem', border: '1px solid #334155', borderRadius: '8px',
    backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem'
  },
  nextBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    marginLeft: 'auto', padding: '0.6rem 1.25rem', border: 'none', borderRadius: '8px',
    backgroundColor: '#0284c7', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600'
  },
  gpsBtn: {
    display: 'flex', alignItems: 'center', gap: '8px',
    backgroundColor: 'rgba(2,132,199,0.15)', border: '1px solid #0284c7',
    color: '#38bdf8', padding: '0.65rem 1.25rem', borderRadius: '8px',
    cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500'
  },
  coordsRow: { display: 'flex', gap: '0.5rem' },
  coordInput: {
    flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
    padding: '0.6rem 0.75rem', color: '#f8fafc', fontSize: '0.9rem', outline: 'none'
  },
  coordsPreview: { margin: 0, fontSize: '0.82rem', color: '#4ade80' },
  notifyRow: { display: 'flex', gap: '0.75rem' },
  notifyBtn: {
    flex: 1, padding: '0.75rem', border: '1px solid #334155', borderRadius: '10px',
    backgroundColor: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem',
    fontWeight: '500', transition: 'all 0.2s'
  },
  notifyBtnActive: { borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,0.15)', color: '#38bdf8' },
  saveBtn: {
    flex: 1, marginLeft: 'auto', padding: '0.6rem 1.25rem', border: 'none', borderRadius: '8px',
    backgroundColor: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600'
  },
};

export default RouteManager;
