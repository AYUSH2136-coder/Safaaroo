/**
 * locationController.js — Location Update & Bus State API Handlers
 *
 * Handles the main GPS location update endpoint that drives
 * automatic stop detection, and exposes bus state for the dashboard.
 */

const stopDb = require('../services/stopDb');
const { detectStopEvent } = require('../services/stopDetection');
const { sendStopNotification } = require('../services/notificationHandler');

/**
 * POST /api/location/update
 *
 * Receives a GPS update from a bus, runs stop detection,
 * triggers notifications if a state transition occurs,
 * and returns the result.
 *
 * Body: { bus_id, latitude, longitude, speed, timestamp }
 */
exports.updateLocation = async (req, res) => {
  try {
    const { bus_id, latitude, longitude, speed, timestamp } = req.body;

    // ─── Validation ────────────────────────────────────────────────────────
    if (!bus_id || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'bus_id, latitude, and longitude are required.'
      });
    }

    const effectiveSpeed = speed ?? null;
    const effectiveTimestamp = timestamp || Date.now();

    // ─── Run stop detection state machine ──────────────────────────────────
    const detectionResult = await detectStopEvent(
      bus_id,
      parseFloat(latitude),
      parseFloat(longitude),
      effectiveSpeed !== null ? parseFloat(effectiveSpeed) : null,
      typeof effectiveTimestamp === 'number' ? effectiveTimestamp : new Date(effectiveTimestamp).getTime()
    );

    // ─── If an event was detected, send notifications ──────────────────────
    let notificationResult = null;
    if (detectionResult) {
      const io = req.app.get('io');
      notificationResult = await sendStopNotification(
        bus_id,
        detectionResult.stopId,
        detectionResult.stopName,
        detectionResult.event,
        io,
        detectionResult.distance
      );

      // Also broadcast the updated bus state to all dashboard clients
      if (io) {
        const updatedState = await stopDb.getBusState(bus_id);
        if (updatedState) {
          io.emit('bus_state_updated', updatedState);
        }
      }
    }

    // ─── Fetch final state to return ───────────────────────────────────────
    const busState = await stopDb.getBusState(bus_id);

    return res.status(200).json({
      success: true,
      event: detectionResult ? detectionResult.event : null,
      state: busState?.state || 'UNKNOWN',
      busState,
      notification: notificationResult
    });
  } catch (err) {
    console.error('❌ [LocationController] Error in updateLocation:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during location update.'
    });
  }
};

/**
 * GET /api/location/bus-state/:busId
 *
 * Returns the current live state for a single bus (for dashboard).
 */
exports.getBusState = async (req, res) => {
  try {
    const { busId } = req.params;

    const busState = await stopDb.getBusState(busId);
    if (!busState) {
      return res.status(404).json({
        success: false,
        message: `No state found for bus: ${busId}`
      });
    }

    // Enrich with stop names
    let currentStopName = null;
    let nextStopName = null;

    if (busState.current_stop_id) {
      const stop = await stopDb.getStop(busState.current_stop_id);
      currentStopName = stop?.stop_name || null;
    }

    if (busState.next_stop_id) {
      const stop = await stopDb.getStop(busState.next_stop_id);
      nextStopName = stop?.stop_name || null;
    }

    return res.status(200).json({
      success: true,
      busState: {
        ...busState,
        current_stop_name: currentStopName,
        next_stop_name: nextStopName
      }
    });
  } catch (err) {
    console.error('❌ [LocationController] Error in getBusState:', err.message);
    return res.status(500).json({ success: false, message: 'Database query error.' });
  }
};

/**
 * GET /api/location/bus-state
 *
 * Returns all bus live states (for dashboard overview).
 */
exports.getAllBusStates = async (req, res) => {
  try {
    const states = await stopDb.getAllBusStates();

    return res.status(200).json({
      success: true,
      count: states.length,
      busStates: states
    });
  } catch (err) {
    console.error('❌ [LocationController] Error in getAllBusStates:', err.message);
    return res.status(500).json({ success: false, message: 'Database query error.' });
  }
};

/**
 * POST /api/location/bus-state/:busId/reset
 *
 * Resets the bus state to start the route from the beginning.
 */
exports.resetBus = async (req, res) => {
  try {
    const { busId } = req.params;
    const newState = await stopDb.resetBusState(busId);
    
    if (!newState) {
      return res.status(404).json({ success: false, message: 'Bus not found or no route assigned' });
    }
    
    // Broadcast the updated bus state to all dashboard clients
    const io = req.app.get('io');
    if (io) {
      io.emit('bus_state_updated', newState);
    }
    
    return res.status(200).json({
      success: true,
      message: 'Bus route reset successfully',
      busState: newState
    });
  } catch (err) {
    console.error('❌ [LocationController] Error in resetBus:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to reset bus.' });
  }
};
