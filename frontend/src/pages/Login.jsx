import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginApi, registerApi } from '../services/api';
import { User, Phone, Lock, Bus, School, ArrowRight, ChevronDown } from 'lucide-react';

const ROLES = [
  { value: 'operator', label: '🏢 Operator', desc: 'Manage schools & vehicles' },
  { value: 'driver', label: '🚌 Driver', desc: 'Transmit your bus location' },
  { value: 'parent', label: '👨‍👧 Parent', desc: 'Track your child\'s bus' },
];

const Login = () => {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [role, setRole] = useState('parent');
  const [form, setForm] = useState({
    name: '', mobile: '', password: '', student_name: '',
    vehicle_id: '', is_under_operator: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const getDashboardRoute = (userRole) => {
    if (userRole === 'operator') return '/operator';
    if (userRole === 'driver') return '/driver';
    if (userRole === 'parent') return '/parent';
    return '/home';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.mobile.trim() || !form.password.trim()) {
      setError('Mobile and password are required.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const data = await loginApi(form.mobile.trim(), form.password);
      login(data);
      navigate(getDashboardRoute(data.user.role));
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.mobile.trim() || !form.password.trim()) {
      setError('Name, mobile, and password are required.');
      return;
    }
    if (role === 'parent' && !form.student_name.trim()) {
      setError('Student name is required.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      password: form.password,
      role,
      ...(role === 'parent' && { student_name: form.student_name.trim() }),
      ...(role === 'driver' && {
        vehicle_id: form.vehicle_id.trim() || undefined,
        is_under_operator: form.is_under_operator
      }),
    };

    try {
      setLoading(true);
      setError('');
      const data = await registerApi(payload);
      login(data);
      navigate(getDashboardRoute(data.user.role));
    } catch (err) {
      const msg = err.response?.data?.error || 'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>🚌</div>
          <h1 style={styles.title}>SafaaRoo</h1>
          <p style={styles.subtitle}>School Bus Tracking System</p>
        </div>

        {/* Mode Tabs */}
        <div style={styles.tabs}>
          <button
            id="tab-login"
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Login
          </button>
          <button
            id="tab-register"
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Register
          </button>
        </div>

        {error && <div style={styles.errorBox} role="alert">{error}</div>}

        {/* ── Login Form ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={styles.form} id="form-login">
            <InputField id="login-mobile" icon={<Phone size={16} />} label="Mobile Number" type="tel"
              placeholder="e.g. 9876543210" value={form.mobile} onChange={set('mobile')} />
            <InputField id="login-password" icon={<Lock size={16} />} label="Password" type="password"
              placeholder="Your password" value={form.password} onChange={set('password')} />
            <button id="btn-login" type="submit" style={styles.button} disabled={loading}>
              {loading ? 'Logging in…' : 'Login'}
              {!loading && <ArrowRight size={16} style={{ marginLeft: 8 }} />}
            </button>
          </form>
        )}

        {/* ── Register Form ── */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} style={styles.form} id="form-register">
            {/* Role Selector */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>I am a…</label>
              <div style={styles.roleGrid}>
                {ROLES.map(r => (
                  <button
                    key={r.value}
                    id={`role-${r.value}`}
                    type="button"
                    style={{ ...styles.roleBtn, ...(role === r.value ? styles.roleBtnActive : {}) }}
                    onClick={() => setRole(r.value)}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{r.label}</span>
                    <span style={styles.roleDesc}>{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <InputField id="reg-name" icon={<User size={16} />} label="Full Name" type="text"
              placeholder="Your full name" value={form.name} onChange={set('name')} />
            <InputField id="reg-mobile" icon={<Phone size={16} />} label="Mobile Number" type="tel"
              placeholder="e.g. 9876543210" value={form.mobile} onChange={set('mobile')} />
            <InputField id="reg-password" icon={<Lock size={16} />} label="Password" type="password"
              placeholder="Create a password" value={form.password} onChange={set('password')} />

            {/* Parent extras */}
            {role === 'parent' && (
              <InputField id="reg-student" icon={<School size={16} />} label="Student Name" type="text"
                placeholder="Your child's name" value={form.student_name} onChange={set('student_name')} />
            )}

            {/* Driver extras */}
            {role === 'driver' && (
              <>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Registration type</label>
                  <div style={styles.toggleRow}>
                    <button
                      id="driver-under-operator"
                      type="button"
                      style={{ ...styles.toggleBtn, ...(form.is_under_operator ? styles.toggleActive : {}) }}
                      onClick={() => setForm(f => ({ ...f, is_under_operator: true }))}
                    >
                      Under Operator
                    </button>
                    <button
                      id="driver-independent"
                      type="button"
                      style={{ ...styles.toggleBtn, ...(!form.is_under_operator ? styles.toggleActive : {}) }}
                      onClick={() => setForm(f => ({ ...f, is_under_operator: false }))}
                    >
                      Independent
                    </button>
                  </div>
                  <p style={styles.hint}>
                    {form.is_under_operator
                      ? 'Enter the vehicle number given to you by your operator.'
                      : 'Enter your own vehicle number to register independently.'}
                  </p>
                </div>
                <InputField id="reg-vehicle" icon={<Bus size={16} />}
                  label={form.is_under_operator ? "Operator's Vehicle Number" : "Your Vehicle Number"}
                  type="text" placeholder="e.g. CG12AS1834"
                  value={form.vehicle_id} onChange={set('vehicle_id')} />
              </>
            )}

            <button id="btn-register" type="submit" style={styles.button} disabled={loading}>
              {loading ? 'Registering…' : 'Create Account'}
              {!loading && <ArrowRight size={16} style={{ marginLeft: 8 }} />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ─── Reusable Input Component ──────────────────────────────────────────────
const InputField = ({ id, icon, label, type, placeholder, value, onChange }) => (
  <div style={styles.inputGroup}>
    <label htmlFor={id} style={styles.label}>{label}</label>
    <div style={styles.inputWrapper}>
      <span style={styles.icon}>{icon}</span>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={styles.input}
        autoComplete="off"
      />
    </div>
  </div>
);

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = {
  container: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', padding: '1rem'
  },
  card: {
    backgroundColor: '#1e293b', padding: '2.5rem', borderRadius: '16px',
    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)', width: '100%', maxWidth: '440px'
  },
  header: { textAlign: 'center', marginBottom: '1.75rem' },
  logo: { fontSize: '2.5rem', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.25rem 0', fontSize: '1.75rem', color: '#38bdf8', fontWeight: '700' },
  subtitle: { margin: 0, fontSize: '0.875rem', color: '#94a3b8' },
  tabs: {
    display: 'flex', backgroundColor: '#0f172a', borderRadius: '8px',
    padding: '4px', marginBottom: '1.5rem', gap: '4px'
  },
  tab: {
    flex: 1, padding: '0.5rem', border: 'none', borderRadius: '6px',
    cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500',
    background: 'none', color: '#64748b', transition: 'all 0.2s'
  },
  tabActive: { backgroundColor: '#1e293b', color: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
    color: '#f87171', padding: '0.75rem', borderRadius: '6px',
    fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center'
  },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.82rem', fontWeight: '500', color: '#cbd5e1' },
  inputWrapper: {
    display: 'flex', alignItems: 'center', backgroundColor: '#0f172a',
    border: '1px solid #334155', borderRadius: '8px', padding: '0.625rem 0.75rem'
  },
  icon: { color: '#64748b', marginRight: '0.5rem', display: 'flex', alignItems: 'center' },
  input: { background: 'none', border: 'none', outline: 'none', color: '#f8fafc', width: '100%', fontSize: '0.95rem' },
  button: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#0284c7', color: '#fff', border: 'none',
    padding: '0.8rem', borderRadius: '8px', fontSize: '1rem', fontWeight: '600',
    cursor: 'pointer', marginTop: '0.5rem', transition: 'background-color 0.2s'
  },
  roleGrid: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  roleBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    padding: '0.75rem 1rem', border: '1px solid #334155', borderRadius: '8px',
    backgroundColor: '#0f172a', color: '#f8fafc', cursor: 'pointer',
    transition: 'all 0.2s', textAlign: 'left'
  },
  roleBtnActive: { borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,0.1)' },
  roleDesc: { fontSize: '0.75rem', color: '#64748b', marginTop: '2px' },
  toggleRow: { display: 'flex', gap: '0.5rem' },
  toggleBtn: {
    flex: 1, padding: '0.5rem', border: '1px solid #334155', borderRadius: '6px',
    backgroundColor: '#0f172a', color: '#94a3b8', cursor: 'pointer',
    fontSize: '0.875rem', transition: 'all 0.2s'
  },
  toggleActive: { borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,0.15)', color: '#38bdf8' },
  hint: { fontSize: '0.75rem', color: '#64748b', margin: 0 },
};

export default Login;