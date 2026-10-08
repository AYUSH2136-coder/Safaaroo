
const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
	getProfile,
	listVehicles,
	addVehicle,
	getVehicleDetails,
	startTransmission,
	stopTransmission,
	removeVehicle,
} = require('../controllers/driverController');

// All routes require driver role
router.use(authenticateToken, requireRole('driver'));

router.get('/profile', getProfile);
router.get('/vehicles', listVehicles);
router.post('/vehicles', addVehicle);
router.get('/vehicles/:vehicleId', getVehicleDetails);
router.delete('/vehicles/:vehicleId', removeVehicle);
router.post('/transmit/start', startTransmission);
router.post('/transmit/stop', stopTransmission);

module.exports = router;
