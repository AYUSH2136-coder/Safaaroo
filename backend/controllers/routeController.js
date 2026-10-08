/**
 * routeController.js — Route & Stop Administration Handlers
 *
 * Provides CRUD endpoints for admin to define routes, stops,
 * assign buses to routes, and manage per-stop SMS subscribers.
 * These are one-time setup operations — not called during live tracking.
 */

const stopDb = require('../services/stopDb');

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/routes
 * Create a new route.
 * Body: { route_id, route_name, description? }
 */
exports.createRoute = async (req, res) => {
  try {
    const { route_id, route_name, description } = req.body;

    if (!route_id || !route_name) {
      return res.status(400).json({
        success: false,
        message: 'route_id and route_name are required.'
      });
    }

    await stopDb.createRoute(route_id, route_name, description || '');

    console.log(`📋 [Route] Created route: "${route_name}" (${route_id})`);

    return res.status(201).json({
      success: true,
      message: 'Route created successfully.',
      route: { route_id, route_name, description }
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ success: false, message: 'Route ID already exists.' });
    }
    console.error('❌ [RouteController] Error creating route:', err.message);
    return res.status(500).json({ success: false, message: 'Database error.' });
  }
};

/**
 * GET /api/routes
 * List all routes.
 */
exports.getAllRoutes = async (req, res) => {
  try {
    const routes = await stopDb.getAllRoutes();

    return res.status(200).json({
      success: true,
      count: routes.length,
      routes
    });
  } catch (err) {
    console.error('❌ [RouteController] Error fetching routes:', err.message);
    return res.status(500).json({ success: false, message: 'Database query error.' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// STOPS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/routes/:routeId/stops
 * Add one or more stops to a route.
 * Body: { stops: [{ stop_id, stop_name, sequence_no, latitude, longitude, approach_radius_m?, arrival_radius_m? }] }
 *   OR single stop: { stop_id, stop_name, sequence_no, latitude, longitude, ... }
 */
exports.addStops = async (req, res) => {
  try {
    const { routeId } = req.params;

    // Verify route exists
    const route = await stopDb.getRoute(routeId);
    if (!route) {
      return res.status(404).json({ success: false, message: `Route "${routeId}" not found.` });
    }

    // Accept single stop or array of stops
    const stopsInput = req.body.stops || [req.body];
    const createdStops = [];

    for (const stop of stopsInput) {
      if (!stop.stop_id || !stop.stop_name || stop.sequence_no === undefined ||
          stop.latitude === undefined || stop.longitude === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Each stop requires: stop_id, stop_name, sequence_no, latitude, longitude.'
        });
      }

      await stopDb.createStop({
        stop_id: stop.stop_id,
        route_id: routeId,
        stop_name: stop.stop_name,
        sequence_no: stop.sequence_no,
        latitude: parseFloat(stop.latitude),
        longitude: parseFloat(stop.longitude),
        approach_radius_m: stop.approach_radius_m || 500,
        arrival_radius_m: stop.arrival_radius_m || 100
      });

      createdStops.push(stop.stop_name);
    }

    console.log(`📍 [Stops] Added ${createdStops.length} stop(s) to route "${routeId}": ${createdStops.join(', ')}`);

    return res.status(201).json({
      success: true,
      message: `${createdStops.length} stop(s) added to route "${routeId}".`,
      stops: createdStops
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ success: false, message: 'One or more stop IDs already exist.' });
    }
    console.error('❌ [RouteController] Error adding stops:', err.message);
    return res.status(500).json({ success: false, message: 'Database error.' });
  }
};

/**
 * GET /api/routes/:routeId/stops
 * Get all stops for a route, ordered by sequence.
 */
exports.getRouteStops = async (req, res) => {
  try {
    const { routeId } = req.params;
    const stops = await stopDb.getRouteStops(routeId);

    return res.status(200).json({
      success: true,
      count: stops.length,
      stops
    });
  } catch (err) {
    console.error('❌ [RouteController] Error fetching stops:', err.message);
    return res.status(500).json({ success: false, message: 'Database query error.' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// BUS ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/routes/assign-bus
 * Assign a bus (device) to a route. Initializes bus_live_state
 * with the first stop as the next target.
 * Body: { bus_id, route_id }
 */
exports.assignBus = async (req, res) => {
  try {
    const { bus_id, route_id } = req.body;

    if (!bus_id || !route_id) {
      return res.status(400).json({
        success: false,
        message: 'bus_id and route_id are required.'
      });
    }

    // Verify route exists
    const route = await stopDb.getRoute(route_id);
    if (!route) {
      return res.status(404).json({ success: false, message: `Route "${route_id}" not found.` });
    }

    // Get the first stop on the route
    const firstStop = await stopDb.getFirstStop(route_id);
    if (!firstStop) {
      return res.status(400).json({
        success: false,
        message: `Route "${route_id}" has no stops. Add stops first.`
      });
    }

    // Initialize bus state
    await stopDb.upsertBusState(bus_id, {
      route_id,
      state: 'ARRIVED',
      next_stop_id: firstStop.stop_id,
      current_stop_id: firstStop.stop_id,
      latitude: null,
      longitude: null,
      speed: 0,
      last_event: null,
      last_event_time: null
    });

    // Reset any previous notification log for this bus
    await stopDb.resetNotificationsForBus(bus_id);

    console.log(
      `🚌 [Assignment] Bus "${bus_id}" assigned to route "${route.route_name}" ` +
      `— first stop: "${firstStop.stop_name}"`
    );

    return res.status(200).json({
      success: true,
      message: `Bus "${bus_id}" assigned to route "${route.route_name}".`,
      firstStop: {
        stop_id: firstStop.stop_id,
        stop_name: firstStop.stop_name,
        sequence_no: firstStop.sequence_no
      }
    });
  } catch (err) {
    console.error('❌ [RouteController] Error assigning bus:', err.message);
    return res.status(500).json({ success: false, message: 'Database error.' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIBERS (Per-Stop)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/routes/subscribe
 * Subscribe a phone number to a specific stop.
 * Body: { stop_id, phone }
 */
exports.subscribe = async (req, res) => {
  try {
    const { stop_id, phone } = req.body;

    if (!stop_id || !phone) {
      return res.status(400).json({
        success: false,
        message: 'stop_id and phone are required.'
      });
    }

    // Verify stop exists
    const stop = await stopDb.getStop(stop_id);
    if (!stop) {
      return res.status(404).json({ success: false, message: `Stop "${stop_id}" not found.` });
    }

    await stopDb.addSubscriber(stop_id, phone);

    console.log(`📲 [Subscribe] ${phone} subscribed to stop "${stop.stop_name}"`);

    return res.status(201).json({
      success: true,
      message: `Subscribed ${phone} to stop "${stop.stop_name}".`
    });
  } catch (err) {
    console.error('❌ [RouteController] Error subscribing:', err.message);
    return res.status(500).json({ success: false, message: 'Database error.' });
  }
};

/**
 * DELETE /api/routes/subscribe
 * Unsubscribe a phone number from a stop.
 * Body: { stop_id, phone }
 */
exports.unsubscribe = async (req, res) => {
  try {
    const { stop_id, phone } = req.body;

    if (!stop_id || !phone) {
      return res.status(400).json({
        success: false,
        message: 'stop_id and phone are required.'
      });
    }

    await stopDb.removeSubscriber(stop_id, phone);

    console.log(`🔕 [Unsubscribe] ${phone} unsubscribed from stop "${stop_id}"`);

    return res.status(200).json({
      success: true,
      message: `Unsubscribed ${phone} from stop "${stop_id}".`
    });
  } catch (err) {
    console.error('❌ [RouteController] Error unsubscribing:', err.message);
    return res.status(500).json({ success: false, message: 'Database error.' });
  }
};
