
const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

// Route for device login
router.post('/login', deviceController.loginDevice);

// Route to fetch all devices
router.get('/', deviceController.getAllDevices);

// Route to save push subscription for a device
router.post('/subscribe', deviceController.saveSubscription);

// Route to delete a device
router.delete('/:deviceId', deviceController.deleteDevice);

module.exports = router;