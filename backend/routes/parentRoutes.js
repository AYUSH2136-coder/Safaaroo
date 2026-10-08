
const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getSchools, getVehicles, updateProfile, getProfile, trackVehicle,
  createRoute, getRoutes, getRouteDetail, deleteRoute, searchSlot
} = require('../controllers/parentController');

// All routes require parent role
router.use(authenticateToken, requireRole('parent'));

// Existing endpoints
router.get('/schools', getSchools);
router.get('/vehicles', getVehicles);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/track/:vehicleId', trackVehicle);

// Multi-route endpoints
router.post('/routes', createRoute);
router.get('/routes', getRoutes);
router.get('/routes/:routeId', getRouteDetail);
router.delete('/routes/:routeId', deleteRoute);

// Slot search
router.get('/slots/search', searchSlot);

module.exports = router;
