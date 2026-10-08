import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchOperatorVehicles, fetchOperatorSchools, deleteVehicleApi } from '../../services/api';
import AddVehicleModal from './AddVehicleModal';
import AddSchoolModal from './AddSchoolModal';
import { LogOut, Plus, Phone, Map, Edit2, Trash2, Bus, School, ChevronRight } from 'lucide-react';

const OperatorDashboard = () => {
  const { user, logout } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [activeTab, setActiveTab] = useState('vehicles'); // 'vehicles' | 'schools'
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vRes, sRes] = await Promise.all([fetchOperatorVehicles(), fetchOperatorSchools()]);
      setVehicles(vRes.vehicles || []);
      setSchools(sRes.schools || []);
    } catch (err) {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVehicle = async (vehicleId) => {
    if (!window.confirm('Delete this vehicle?')) return;
    try {
      await deleteVehicleApi(vehicleId);
      setVehicles(prev => prev.filter(v => v.vehicle_id !== vehicleId));
    } catch {
      setError('Failed to delete vehicle.');
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>🏢 Operator Dashboard</h1>
          <p style={styles.headerSub}>Welcome, {user?.name}</p>
        </div>
        <button id="btn-logout" style={styles.logoutBtn} onClick={handleLogout}>
          <LogOut size={16} /> <span>Logout</span>
        </button>
      </header>

      <main style={styles.main}>
        {/* Stats Row */}
        <div style={styles.statsRow}>
          <StatCard icon="🏫" value={schools.length} label="Schools" />
          <StatCard icon="🚌" value={vehicles.length} label="Vehicles" />
          <StatCard icon="🧑‍✈️" value={vehicles.filter(v => v.driver_name).length} label="Assigned Drivers" />
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Tabs */}
        <div style={styles.tabs}>
          <button id="tab-vehicles" style={{ ...styles.tab, ...(activeTab === 'vehicles' ? styles.tabActive : {}) }}
            onClick={() => setActiveTab('vehicles')}>
            <Bus size={14} /> Vehicles
          </button>
          <button id="tab-schools" style={{ ...styles.tab, ...(activeTab === 'schools' ? styles.tabActive : {}) }}
            onClick={() => setActiveTab('schools')}>
            <School size={14} /> Schools
          </button>
        </div>

        {/* Vehicles Tab */}
        {activeTab === 'vehicles' && (
          <section>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Your Vehicles</h2>
              <button id="btn-add-vehicle" style={styles.addBtn} onClick={() => setShowAddVehicle(true)}>
                <Plus size={16} /> Add Vehicle
              </button>
            </div>

            {loading ? (
              <p style={styles.emptyText}>Loading…</p>
            ) : vehicles.length === 0 ? (
              <div style={styles.emptyState}>
                <p>🚌</p>
                <p>No vehicles yet. Add your first bus.</p>
              </div>
            ) : (
              <div style={styles.cardGrid}>
                {vehicles.map(v => (
                  <div key={v.vehicle_id} style={styles.vehicleCard}>
                    <div style={styles.vehicleCardTop}>
                      <div>
                        <p style={styles.vehicleId}>{v.vehicle_id}</p>
                        {v.vehicle_name && <p style={styles.vehicleName}>{v.vehicle_name}</p>}
                        <span style={{ ...styles.slotBadge }}>{v.slot_no || '—'}</span>
                      </div>
                      <div style={styles.vehicleActions}>
                        <button title="Delete" style={styles.iconBtn} onClick={() => handleDeleteVehicle(v.vehicle_id)}>
                          <Trash2 size={14} color="#ef4444" />
                        </button>
                      </div>
                    </div>
                    <div style={styles.vehicleCardBottom}>
                      <span style={styles.schoolTag}>🏫 {v.school_name || 'No school'}</span>
                      {v.driver_name ? (
                        <span style={styles.driverTag}>
                          🧑‍✈️ {v.driver_name}
                          {v.driver_mobile && (
                            <a href={`tel:${v.driver_mobile}`} style={styles.callLink}>
                              <Phone size={12} />
                            </a>
                          )}
                        </span>
                      ) : (
                        <span style={styles.noDriverTag}>No driver assigned</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Schools Tab */}
        {activeTab === 'schools' && (
          <section>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Your Schools</h2>
              <button id="btn-add-school" style={styles.addBtn} onClick={() => setShowAddSchool(true)}>
                <Plus size={16} /> Add School
              </button>
            </div>

            {loading ? (
              <p style={styles.emptyText}>Loading…</p>
            ) : schools.length === 0 ? (
              <div style={styles.emptyState}>
                <p>🏫</p>
                <p>No schools yet. Add a school first before adding vehicles.</p>
              </div>
            ) : (
              <div style={styles.cardGrid}>
                {schools.map(s => (
                  <div key={s.school_id} style={styles.schoolCard}>
                    <p style={styles.schoolName}>{s.school_name}</p>
                    {s.address && <p style={styles.schoolAddr}>{s.address}</p>}
                    <p style={styles.schoolCoords}>📍 {s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)}</p>
                    <p style={styles.schoolVehicleCount}>
                      🚌 {vehicles.filter(v => v.school_id === s.school_id).length} vehicle(s)
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modals */}
      {showAddVehicle && (
        <AddVehicleModal
          schools={schools}
          onClose={() => setShowAddVehicle(false)}
          onSuccess={() => { setShowAddVehicle(false); fetchData(); }}
        />
      )}
      {showAddSchool && (
        <AddSchoolModal
          onClose={() => setShowAddSchool(false)}
          onSuccess={() => { setShowAddSchool(false); fetchData(); }}
        />
      )}
    </div>
  );
};

const StatCard = ({ icon, value, label }) => (
  <div style={styles.statCard}>
    <span style={styles.statIcon}>{icon}</span>
    <span style={styles.statValue}>{value}</span>
    <span style={styles.statLabel}>{label}</span>
  </div>
);

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1.25rem 1.5rem', backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155'
  },
  headerTitle: { margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#38bdf8' },
  headerSub: { margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#94a3b8' },
  logoutBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    backgroundColor: 'transparent', border: '1px solid #334155',
    color: '#94a3b8', padding: '0.4rem 0.8rem', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.85rem'
  },
  main: { padding: '1.5rem', maxWidth: '900px', margin: '0 auto' },
  statsRow: { display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' },
  statCard: {
    flex: 1, minWidth: '100px', backgroundColor: '#1e293b', borderRadius: '10px',
    padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    border: '1px solid #334155'
  },
  statIcon: { fontSize: '1.5rem' },
  statValue: { fontSize: '1.75rem', fontWeight: '700', color: '#38bdf8' },
  statLabel: { fontSize: '0.78rem', color: '#94a3b8' },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
    color: '#f87171', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center'
  },
  tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' },
  tab: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #334155',
    backgroundColor: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem'
  },
  tabActive: { backgroundColor: 'rgba(2,132,199,0.2)', borderColor: '#0284c7', color: '#38bdf8' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  sectionTitle: { margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#f8fafc' },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    backgroundColor: '#0284c7', color: '#fff', border: 'none',
    padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600'
  },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' },
  vehicleCard: {
    backgroundColor: '#1e293b', borderRadius: '10px', padding: '1rem',
    border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.75rem'
  },
  vehicleCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  vehicleId: { margin: 0, fontSize: '1rem', fontWeight: '700', color: '#f8fafc', letterSpacing: '0.05em' },
  vehicleName: { margin: '2px 0 4px', fontSize: '0.82rem', color: '#94a3b8' },
  slotBadge: {
    display: 'inline-block', backgroundColor: 'rgba(2,132,199,0.15)',
    color: '#38bdf8', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '99px', fontWeight: '600'
  },
  vehicleActions: { display: 'flex', gap: '0.5rem' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px' },
  vehicleCardBottom: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  schoolTag: { fontSize: '0.82rem', color: '#94a3b8' },
  driverTag: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#4ade80' },
  callLink: { color: '#4ade80', display: 'flex', alignItems: 'center' },
  noDriverTag: { fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' },
  schoolCard: {
    backgroundColor: '#1e293b', borderRadius: '10px', padding: '1rem',
    border: '1px solid #334155'
  },
  schoolName: { margin: '0 0 4px', fontSize: '1rem', fontWeight: '700', color: '#f8fafc' },
  schoolAddr: { margin: '0 0 4px', fontSize: '0.8rem', color: '#94a3b8' },
  schoolCoords: { margin: '0 0 4px', fontSize: '0.78rem', color: '#64748b' },
  schoolVehicleCount: { margin: 0, fontSize: '0.82rem', color: '#38bdf8' },
  emptyState: {
    textAlign: 'center', padding: '2.5rem', color: '#64748b',
    backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #334155'
  },
  emptyText: { color: '#64748b', textAlign: 'center' },
};

export default OperatorDashboard;
