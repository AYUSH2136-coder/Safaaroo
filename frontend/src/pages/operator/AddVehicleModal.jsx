import React, { useState } from 'react';
import { addVehicleApi } from '../../services/api';
import { X, Bus, Hash } from 'lucide-react';

const AddVehicleModal = ({ schools, onClose, onSuccess }) => {
  const [form, setForm] = useState({ vehicle_id: '', school_id: '', vehicle_name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_id.trim() || !form.school_id) {
      setError('Vehicle number and school are required.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await addVehicleApi({
        vehicle_id: form.vehicle_id.trim().toUpperCase(),
        school_id: form.school_id,
        vehicle_name: form.vehicle_name.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add vehicle.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div style={styles.modalHeader}>
          <h2 id="modal-title" style={styles.modalTitle}>Add New Vehicle</h2>
          <button id="btn-close-modal" style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form} id="form-add-vehicle">
          <div style={styles.group}>
            <label htmlFor="vehicle-id" style={styles.label}>Vehicle Number *</label>
            <div style={styles.inputRow}>
              <Bus size={16} style={styles.icon} />
              <input id="vehicle-id" type="text" placeholder="e.g. CG12AS1834"
                value={form.vehicle_id} onChange={set('vehicle_id')}
                style={styles.input} autoComplete="off" />
            </div>
            <p style={styles.hint}>This will be the unique vehicle ID (auto-uppercased).</p>
          </div>

          <div style={styles.group}>
            <label htmlFor="school-id" style={styles.label}>School *</label>
            <select id="school-id" value={form.school_id} onChange={set('school_id')} style={styles.select}>
              <option value="">— Select School —</option>
              {schools.map(s => (
                <option key={s.school_id} value={s.school_id}>{s.school_name}</option>
              ))}
            </select>
            {schools.length === 0 && (
              <p style={{ ...styles.hint, color: '#f87171' }}>No schools found. Add a school first.</p>
            )}
          </div>

          <div style={styles.group}>
            <label htmlFor="vehicle-name" style={styles.label}>Friendly Name (optional)</label>
            <div style={styles.inputRow}>
              <Hash size={16} style={styles.icon} />
              <input id="vehicle-name" type="text" placeholder="e.g. Morning Bus"
                value={form.vehicle_name} onChange={set('vehicle_name')} style={styles.input} />
            </div>
          </div>

          <div style={styles.modalFooter}>
            <button id="btn-cancel" type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button id="btn-submit-vehicle" type="submit" style={styles.submitBtn} disabled={loading}>
              {loading ? 'Adding…' : 'Add Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

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
  icon: { color: '#64748b', marginRight: '0.5rem', flexShrink: 0 },
  input: { background: 'none', border: 'none', outline: 'none', color: '#f8fafc', width: '100%', fontSize: '0.95rem' },
  select: {
    backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px',
    padding: '0.6rem 0.75rem', color: '#f8fafc', fontSize: '0.95rem', width: '100%', outline: 'none'
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

export default AddVehicleModal;
