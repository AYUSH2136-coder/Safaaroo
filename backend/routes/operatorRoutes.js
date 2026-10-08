
const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  addSchool, getSchools, updateSchool, deleteSchool,
  addVehicle, createSlot, deleteSlot, getVehicles, getSlots, getDrivers, updateSlot, updateVehicle, deleteVehicle
} = require('../controllers/operatorController');

// All routes require operator role
router.use(authenticateToken, requireRole('operator'));

// Schools
router.post('/schools', addSchool);
router.get('/schools', getSchools);
router.put('/schools/:id', updateSchool);
router.delete('/schools/:id', deleteSchool);

// Vehicles
router.post('/vehicles', addVehicle);
router.get('/vehicles', getVehicles);
router.post('/slots', createSlot);
router.put('/vehicles/:id', updateVehicle);
router.delete('/vehicles/:id', deleteVehicle);
router.get('/slots', getSlots);
router.get('/drivers', getDrivers);
router.put('/slots/:slotNo', updateSlot);
router.delete('/slots/:slotNo', deleteSlot);

module.exports = router;
