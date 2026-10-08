/**
 * stopDb.js — Database Access Layer for Stop Detection
 *
 * Promise-wrapped SQLite queries for routes, stops, bus state,
 * notifications, and subscriber management.
 * 
 * All functions return Promises so they can be used with async/await
 * in the controller and service layers.
 */

const db = require('../config/db');

// ─── Helper: Promisify db.get ────────────────────────────────────────────────
const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });

// ─── Helper: Promisify db.all ────────────────────────────────────────────────
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

// ─── Helper: Promisify db.run ────────────────────────────────────────────────
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

// ═══════════════════════════════════════════════════════════════════════════════
// BUS LIVE STATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the current live state for a bus
 * @param {string} busId
 * @returns {Promise<Object|null>}
 */
const getBusState = (busId) =>
  dbGet(`
    SELECT 
      b.*,
      s1.stop_name AS current_stop_name,
      s2.stop_name AS next_stop_name,
      r.route_name
    FROM bus_live_state b
    LEFT JOIN stops s1 ON b.current_stop_id = s1.stop_id
    LEFT JOIN stops s2 ON b.next_stop_id = s2.stop_id
    LEFT JOIN routes r ON b.route_id = r.route_id
    WHERE b.bus_id = ?
  `, [busId]);

/**
 * Get all bus live states (for dashboard)
 * @returns {Promise<Array>}
 */
const getAllBusStates = () =>
  dbAll(`
    SELECT 
      b.*,
      s1.stop_name AS current_stop_name,
      s2.stop_name AS next_stop_name,
      r.route_name
    FROM bus_live_state b
    LEFT JOIN stops s1 ON b.current_stop_id = s1.stop_id
    LEFT JOIN stops s2 ON b.next_stop_id = s2.stop_id
    LEFT JOIN routes r ON b.route_id = r.route_id
    ORDER BY b.updated_at DESC
  `);

/**
 * Create or update bus live state (UPSERT)
 * @param {string} busId
 * @param {Object} data - Fields to set/update
 */
const upsertBusState = (busId, data) => {
  const now = new Date().toISOString();
  return dbRun(
    `INSERT INTO bus_live_state 
       (bus_id, route_id, current_stop_id, next_stop_id, state, latitude, longitude, speed, last_event, last_event_time, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bus_id) DO UPDATE SET
       route_id        = COALESCE(excluded.route_id, bus_live_state.route_id),
       current_stop_id = COALESCE(excluded.current_stop_id, bus_live_state.current_stop_id),
       next_stop_id    = COALESCE(excluded.next_stop_id, bus_live_state.next_stop_id),
       state           = COALESCE(excluded.state, bus_live_state.state),
       latitude        = COALESCE(excluded.latitude, bus_live_state.latitude),
       longitude       = COALESCE(excluded.longitude, bus_live_state.longitude),
       speed           = COALESCE(excluded.speed, bus_live_state.speed),
       last_event      = COALESCE(excluded.last_event, bus_live_state.last_event),
       last_event_time = COALESCE(excluded.last_event_time, bus_live_state.last_event_time),
       updated_at      = excluded.updated_at`,
    [
      busId,
      data.route_id || null,
      data.current_stop_id || null,
      data.next_stop_id || null,
      data.state || 'OUTSIDE',
      data.latitude || null,
      data.longitude || null,
      data.speed ?? 0,
      data.last_event || null,
      data.last_event_time || null,
       now
    ]
  );
};

/**
 * Reset bus state to start the route again
 * @param {string} busId
 */
const resetBusState = async (busId) => {
  const bus = await getBusState(busId);
  if (!bus || !bus.route_id) return null;
  
  const firstStop = await getFirstStop(bus.route_id);
  const now = new Date().toISOString();
  
  await dbRun(`
    UPDATE bus_live_state
    SET current_stop_id = ?,
        next_stop_id = ?,
        state = 'ARRIVED',
        last_event = 'ROUTE_RESTARTED',
        last_event_time = ?,
        updated_at = ?
    WHERE bus_id = ?
  `, [firstStop ? firstStop.stop_id : null, firstStop ? firstStop.stop_id : null, now, now, busId]);
  
  await resetNotificationsForBus(busId);
  
  return getBusState(busId);
};

// ═══════════════════════════════════════════════════════════════════════════════
// STOPS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a single stop by ID
 * @param {string} stopId
 * @returns {Promise<Object|null>}
 */
const getStop = (stopId) =>
  dbGet('SELECT * FROM stops WHERE stop_id = ?', [stopId]);

/**
 * Get the first stop on a route (lowest sequence_no)
 * @param {string} routeId
 * @returns {Promise<Object|null>}
 */
const getFirstStop = (routeId) =>
  dbGet(
    'SELECT * FROM stops WHERE route_id = ? ORDER BY sequence_no ASC LIMIT 1',
    [routeId]
  );

/**
 * Get the next stop after a given sequence number on a route
 * @param {string} routeId
 * @param {number} currentSeq - Current stop's sequence_no
 * @returns {Promise<Object|null>} - null if currentSeq was the last stop
 */
const getNextStop = (routeId, currentSeq) =>
  dbGet(
    'SELECT * FROM stops WHERE route_id = ? AND sequence_no > ? ORDER BY sequence_no ASC LIMIT 1',
    [routeId, currentSeq]
  );

/**
 * Get all stops for a route, ordered by sequence
 * @param {string} routeId
 * @returns {Promise<Array>}
 */
const getRouteStops = (routeId) =>
  dbAll(
    'SELECT * FROM stops WHERE route_id = ? ORDER BY sequence_no ASC',
    [routeId]
  );

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a single route by ID
 * @param {string} routeId
 * @returns {Promise<Object|null>}
 */
const getRoute = (routeId) =>
  dbGet('SELECT * FROM routes WHERE route_id = ?', [routeId]);

/**
 * Get all routes
 * @returns {Promise<Array>}
 */
const getAllRoutes = () =>
  dbAll('SELECT * FROM routes ORDER BY created_at DESC');

/**
 * Create a new route
 * @param {string} routeId
 * @param {string} routeName
 * @param {string} [description]
 */
const createRoute = (routeId, routeName, description = '') =>
  dbRun(
    'INSERT INTO routes (route_id, route_name, description) VALUES (?, ?, ?)',
    [routeId, routeName, description]
  );

/**
 * Add a stop to a route
 * @param {Object} stop - Stop data object
 */
const createStop = (stop) =>
  dbRun(
    `INSERT OR REPLACE INTO stops (stop_id, route_id, stop_name, sequence_no, latitude, longitude, approach_radius_m, arrival_radius_m)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stop.stop_id,
      stop.route_id,
      stop.stop_name,
      stop.sequence_no,
      stop.latitude,
      stop.longitude,
      stop.approach_radius_m || 500,
      stop.arrival_radius_m || 100
    ]
  );

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION LOG (Deduplication)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a notification has already been sent
 * @param {string} busId
 * @param {string} stopId
 * @param {string} eventType - 'APPROACHING', 'ARRIVED', or 'DEPARTED'
 * @returns {Promise<boolean>}
 */
const hasNotification = async (busId, stopId, eventType) => {
  const row = await dbGet(
    'SELECT id FROM notification_log WHERE bus_id = ? AND stop_id = ? AND event_type = ?',
    [busId, stopId, eventType]
  );
  return !!row;
};

/**
 * Log a sent notification (for dedup)
 * @param {string} busId
 * @param {string} stopId
 * @param {string} eventType
 */
const logNotification = (busId, stopId, eventType) =>
  dbRun(
    'INSERT OR IGNORE INTO notification_log (bus_id, stop_id, event_type) VALUES (?, ?, ?)',
    [busId, stopId, eventType]
  );

/**
 * Clear notification log for a bus (e.g., when restarting a route)
 * @param {string} busId
 */
const resetNotificationsForBus = (busId) =>
  dbRun('DELETE FROM notification_log WHERE bus_id = ?', [busId]);

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIBERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all phone numbers subscribed to a stop
 * @param {string} stopId
 * @returns {Promise<Array<{ phone: string }>>}
 */
const getStopSubscribers = (stopId) =>
  dbAll('SELECT phone FROM stop_subscribers WHERE stop_id = ?', [stopId]);

/**
 * Subscribe a phone number to a stop
 * @param {string} stopId
 * @param {string} phone
 */
const addSubscriber = (stopId, phone) =>
  dbRun(
    'INSERT INTO stop_subscribers (stop_id, phone) VALUES (?, ?)',
    [stopId, phone]
  );

/**
 * Remove a subscriber from a stop
 * @param {string} stopId
 * @param {string} phone
 */
const removeSubscriber = (stopId, phone) =>
  dbRun(
    'DELETE FROM stop_subscribers WHERE stop_id = ? AND phone = ?',
    [stopId, phone]
  );

module.exports = {
  getBusState,
  getAllBusStates,
  upsertBusState,
  resetBusState,
  // Stops
  getStop,
  getFirstStop,
  getNextStop,
  getRouteStops,
  // Routes
  getRoute,
  getAllRoutes,
  createRoute,
  createStop,
  // Notifications
  hasNotification,
  logNotification,
  resetNotificationsForBus,
  // Subscribers
  getStopSubscribers,
  addSubscriber,
  removeSubscriber
};
