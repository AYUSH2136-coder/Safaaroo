/**
 * locationRoutes.js — API Routes for Live Location & Bus State
 *
 * POST /api/location/update       — Receive GPS update, run detection
 * GET  /api/location/bus-state    — Get all bus states
 * GET  /api/location/bus-state/:busId — Get specific bus state
 */

const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

// Receive GPS update from bus, trigger stop detection + notifications
router.post('/update', locationController.updateLocation);

// Get all bus live states (dashboard overview)
router.get('/bus-state', locationController.getAllBusStates);

// Get specific bus live state (dashboard detail)
router.get('/bus-state/:busId', locationController.getBusState);

// Reset bus live state (restart route)
router.post('/bus-state/:busId/reset', locationController.resetBus);

module.exports = router;
