
import axios from 'axios';

// Fallback to localhost during local dev
// Later, this URL will point to our ngrok backend tunnel
// Change hardcoded localhost to relative path '/api'
const API_BASE_URL = '/api'; // <--- CHANGE THIS LINE

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// ── JWT auto-attach interceptor ────────────────────────────────────────────
// Reads the stored auth token and attaches it to every outgoing request
api.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('safaaroo_auth');
    if (stored) {
      const { token } = JSON.parse(stored);
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return config;
}, (error) => Promise.reject(error));

/**
 * Call backend login endpoint
 * @param {string} username 
 * @param {string} deviceName 
 */
export const loginDeviceApi = async (username, deviceName) => {
  const response = await api.post('/devices/login', { username, deviceName });
  return response.data;
};

/**
 * Fetch all registered devices
 */
export const fetchDevicesApi = async () => {
  const response = await api.get('/devices');
  return response.data;
};

/**
 * Save push subscription for a device
 * @param {string} deviceId 
 * @param {PushSubscription} subscription - The browser PushSubscription object
 */
export const saveSubscriptionApi = async (deviceId, subscription) => {
  const response = await api.post('/devices/subscribe', { deviceId, subscription });
  return response.data;
};

/**
 * Delete a registered device
 * @param {string} deviceId 
 */
export const deleteDeviceApi = async (deviceId) => {
  const response = await api.delete(`/devices/${deviceId}`);
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Bus Stop Detection APIs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get live state for a specific bus
 * @param {string} busId
 */
export const fetchBusState = async (busId) => {
  const response = await api.get(`/location/bus-state/${busId}`);
  return response.data;
};

/**
 * Get all bus live states
 */
export const fetchAllBusStates = async () => {
  const response = await api.get('/location/bus-state');
  return response.data;
};

/**
 * Reset bus route (restart from beginning)
 */
export const resetBusRouteApi = async (busId) => {
  const response = await api.post(`/location/bus-state/${busId}/reset`);
  return response.data;
};

/**
 * Get all routes
 */
export const fetchRoutes = async () => {
  const response = await api.get('/routes');
  return response.data;
};

/**
 * Get stops for a specific route
 * @param {string} routeId
 */
export const fetchRouteStops = async (routeId) => {
  const response = await api.get(`/routes/${routeId}/stops`);
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Admin Route Management APIs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new route
 */
export const createRouteApi = async (route_id, route_name, description = '') => {
  const response = await api.post('/routes', { route_id, route_name, description });
  return response.data;
};

/**
 * Add stops to a route (bulk)
 * @param {string} routeId
 * @param {Array} stops - Array of stop objects
 */
export const addStopsApi = async (routeId, stops) => {
  const response = await api.post(`/routes/${routeId}/stops`, { stops });
  return response.data;
};

/**
 * Assign a bus (device) to a route
 */
export const assignBusApi = async (bus_id, route_id) => {
  const response = await api.post('/routes/assign-bus', { bus_id, route_id });
  return response.data;
};

/**
 * Subscribe a phone number to a stop
 */
export const subscribeStopApi = async (stop_id, phone) => {
  const response = await api.post('/routes/subscribe', { stop_id, phone });
  return response.data;
};

/**
 * Unsubscribe a phone from a stop
 */
export const unsubscribeStopApi = async (stop_id, phone) => {
  const response = await api.delete('/routes/subscribe', { data: { stop_id, phone } });
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Auth APIs (SafaaRoo Role-based Auth)
// ═══════════════════════════════════════════════════════════════════════════════

export const registerApi = async (payload) => {
  const response = await api.post('/auth/register', payload);
  return response.data;
};

export const loginApi = async (mobile, password) => {
  const response = await api.post('/auth/login', { mobile, password });
  return response.data;
};

export const getMeApi = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Operator APIs
// ═══════════════════════════════════════════════════════════════════════════════

export const addSchoolApi = async (payload) => {
  const response = await api.post('/operator/schools', payload);
  return response.data;
};

export const fetchOperatorSchools = async () => {
  const response = await api.get('/operator/schools');
  return response.data;
};

export const addVehicleApi = async (payload) => {
  const response = await api.post('/operator/vehicles', payload);
  return response.data;
};

export const fetchOperatorVehicles = async () => {
  const response = await api.get('/operator/vehicles');
  return response.data;
};

export const updateVehicleApi = async (vehicleId, payload) => {
  const response = await api.put(`/operator/vehicles/${vehicleId}`, payload);
  return response.data;
};

export const deleteVehicleApi = async (vehicleId) => {
  const response = await api.delete(`/operator/vehicles/${vehicleId}`);
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Driver APIs
// ═══════════════════════════════════════════════════════════════════════════════

export const fetchDriverProfile = async () => {
  const response = await api.get('/driver/profile');
  return response.data;
};

export const startTransmissionApi = async () => {
  const response = await api.post('/driver/transmit/start');
  return response.data;
};

export const stopTransmissionApi = async () => {
  const response = await api.post('/driver/transmit/stop');
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Parent APIs
// ═══════════════════════════════════════════════════════════════════════════════

export const fetchAllSchools = async () => {
  const response = await api.get('/parent/schools');
  return response.data;
};

export const fetchSchoolVehicles = async (schoolId) => {
  const response = await api.get(`/parent/vehicles?school_id=${schoolId}`);
  return response.data;
};

export const fetchParentProfile = async () => {
  const response = await api.get('/parent/profile');
  return response.data;
};

export const updateParentProfile = async (payload) => {
  const response = await api.put('/parent/profile', payload);
  return response.data;
};

export const trackVehicleApi = async (vehicleId) => {
  const response = await api.get(`/parent/track/${vehicleId}`);
  return response.data;
};

export default api;