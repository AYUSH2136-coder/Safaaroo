/**
 * routeRoutes.js — API Routes for Route & Stop Administration
 *
 * POST   /api/routes                  — Create a route
 * GET    /api/routes                  — List all routes
 * POST   /api/routes/:routeId/stops   — Add stops to a route
 * GET    /api/routes/:routeId/stops   — Get stops for a route
 * POST   /api/routes/assign-bus       — Assign bus to a route
 * POST   /api/routes/subscribe        — Subscribe phone to a stop
 * DELETE /api/routes/subscribe        — Unsubscribe phone from a stop
 */

const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');

// Route CRUD
router.post('/', routeController.createRoute);
router.get('/', routeController.getAllRoutes);

// Stop management (must come before /:routeId/stops to avoid conflicts)
router.post('/assign-bus', routeController.assignBus);
router.post('/subscribe', routeController.subscribe);
router.delete('/subscribe', routeController.unsubscribe);

// Stops per route
router.post('/:routeId/stops', routeController.addStops);
router.get('/:routeId/stops', routeController.getRouteStops);

module.exports = router;
