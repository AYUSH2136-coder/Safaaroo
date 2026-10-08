import React, { useState } from 'react';
import { addSchoolApi } from '../../services/api';
import { X, School, MapPin, FileText } from 'lucide-react';

const AddSchoolModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({ school_name: '', latitude: '', longitude: '', address: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detecting, setDetecting] = useState(false);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const detectGPS = () => {
    if (!navigator.geolocation) { setError('GPS not supported.'); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setDetecting(false);
      },
      () => { setError('Could not get GPS location.'); setDetecting(false); }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.school_name.trim() || !form.latitude || !form.longitude) {
      setError('School name and coordinates are required.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await addSchoolApi({
        school_name: form.school_name.trim(),
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        address: form.address.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add school.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="school-modal-title">
        <div style={styles.modalHeader}>
          <h2 id="school-modal-title" style={styles.modalTitle}>Add New School</h2>
          <button id="btn-close-school-modal" style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form} id="form-add-school">
          <Field id="school-name" icon={<School size={16} />} label="School Name *"
            type="text" placeholder="e.g. Delhi Public School" value={form.school_name} onChange={set('school_name')} />

          <div style={styles.group}>
            <div style={styles.coordsHeader}>
              <label style={styles.label}>Coordinates *</label>
              <button type="button" id="btn-detect-gps" style={styles.gpsBtn} onClick={detectGPS} disabled={detecting}>
                <MapPin size={13} /> {detecting ? 'Detecting…' : 'Use GPS'}
              </button>
            </div>
            <div style={styles.coordsRow}>
              <input id="school-lat" type="number" step="any" placeholder="Latitude"
                value={form.latitude} onChange={set('latitude')} style={styles.coordInput} />
              <input id="school-lng" type="number" step="any" placeholder="Longitude"
                value={form.longitude} onChange={set('longitude')} style={styles.coordInput} />
            </div>
            <p style={styles.hint}>Enter the school building's GPS coordinates. These become the destination for all parent routes.</p>
          </div>

          <Field id="school-address" icon={<FileText size={16} />} label="Address (optional)"
            type="text" placeholder="e.g. 12 MG Road, Delhi" value={form.address} onChange={set('address')} />

          <div style={styles.modalFooter}>
            <button id="btn-cancel-school" type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button id="btn-submit-school" type="submit" style={styles.submitBtn} disabled={loading}>
              {loading ? 'Adding…' : 'Add School'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Field = ({ id, icon, label, type, placeholder, value, onChange }) => (
  <div style={styles.group}>
    <label htmlFor={id} style={styles.label}>{label}</label>
    <div style={styles.inputRow}>
      <span style={styles.icon}>{icon}</span>
      <input id={id} type={type} placeholder={placeholder} value={value} onChange={onChange} style={styles.input} autoComplete="off" />
    </div>
  </div>
);

const styles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem'
  },
  modal: {
    backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.75rem',
    width: '100%', maxWidth: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  modalTitle: { margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
    color: '#f87171', padding: '0.65rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem'
  },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  group: { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  label: { fontSize: '0.82rem', fontWeight: '500', color: '#cbd5e1' },
  inputRow: {
    display: 'flex', alignItems: 'center', backgroundColor: '#0f172a',
    border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem 0.75rem'
  },
  icon: { color: '#64748b', marginRight: '0.5rem', display: 'flex', alignItems: 'center' },
  input: { background: 'none', border: 'none', outline: 'none', color: '#f8fafc', width: '100%', fontSize: '0.95rem' },
  coordsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  gpsBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    backgroundColor: 'rgba(2,132,199,0.15)', border: '1px solid #0284c7',
    color: '#38bdf8', padding: '0.25rem 0.6rem', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.75rem', fontWeight: '500'
  },
  coordsRow: { display: 'flex', gap: '0.5rem' },
  coordInput: {
    flex: 1, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px',
    padding: '0.6rem 0.75rem', color: '#f8fafc', fontSize: '0.9rem', outline: 'none'
  },
  hint: { margin: 0, fontSize: '0.75rem', color: '#64748b' },
  modalFooter: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  cancelBtn: {
    flex: 1, padding: '0.65rem', border: '1px solid #334155', borderRadius: '8px',
    backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem'
  },
  submitBtn: {
    flex: 2, padding: '0.65rem', border: 'none', borderRadius: '8px',
    backgroundColor: '#0284c7', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600'
  },
};

export default AddSchoolModal;
