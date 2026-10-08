
const db = require('../config/db');

/**
 * Helper to generate a unique, consistent device_id from username and device name
 * Example: "Amitesh" + "Redmi Note 13" => "amitesh_redmi_note_13"
 */
const generateDeviceId = (username, deviceName) => {
  return `${username}_${deviceName}`.toLowerCase().replace(/\s+/g, '_');
};

/**
 * Controller: Handle User Login / Device Registration
 * POST /api/devices/login
 * Body: { username, deviceName }
 */
exports.loginDevice = (req, res) => {
  const { username, deviceName } = req.body;

  // Validation: Check if required fields exist
  if (!username || !deviceName) {
    return res.status(400).json({
      success: false,
      message: 'Both username and deviceName are required.'
    });
  }

  const deviceId = generateDeviceId(username, deviceName);
  const currentTime = Date.now();
  const currentIsoDate = new Date().toISOString();

  // SQL Query: INSERT new device OR UPDATE if device_id already exists (UPSERT pattern)
  const query = `
    INSERT INTO devices (device_id, username, device_name, status, last_update, created_at, updated_at)
    VALUES (?, ?, ?, 'offline', ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      username = excluded.username,
      device_name = excluded.device_name,
      updated_at = excluded.updated_at
  `;

  db.run(
    query,
    [deviceId, username.trim(), deviceName.trim(), currentTime, currentIsoDate, currentIsoDate],
    function (err) {
      if (err) {
        console.error('❌ Error saving device during login:', err.message);
        return res.status(500).json({ success: false, message: 'Database error during login.' });
      }

      console.log(`👤 User logged in: ${username} (${deviceName}) -> ID: ${deviceId}`);

      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        device: {
          device_id: deviceId,
          username: username.trim(),
          device_name: deviceName.trim(),
          status: 'offline'
        }
      });
    }
  );
};

/**
 * Controller: Fetch All Registered Devices
 * GET /api/devices
 */
exports.getAllDevices = (req, res) => {
  const query = `SELECT * FROM devices ORDER BY updated_at DESC`;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Error fetching devices:', err.message);
      return res.status(500).json({ success: false, message: 'Database query error.' });
    }

    return res.status(200).json({
      success: true,
      count: rows.length,
      devices: rows
    });
  });
};

/**
 * Controller: Save Push Subscription for a Device
 * POST /api/devices/subscribe
 * Body: { deviceId, subscription }
 */
exports.saveSubscription = (req, res) => {
  const { deviceId, subscription } = req.body;

  if (!deviceId || !subscription) {
    return res.status(400).json({
      success: false,
      message: 'Both deviceId and subscription are required.'
    });
  }

  const query = `UPDATE devices SET push_subscription = ? WHERE device_id = ?`;

  db.run(query, [JSON.stringify(subscription), deviceId], function (err) {
    if (err) {
      console.error('❌ Error saving push subscription:', err.message);
      return res.status(500).json({ success: false, message: 'Database error saving subscription.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    console.log(`🔔 Push subscription saved for device: ${deviceId}`);
    return res.status(200).json({ success: true, message: 'Subscription saved.' });
  });
};

/**
 * Controller: Delete a Device
 * DELETE /api/devices/:deviceId
 */
exports.deleteDevice = (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    return res.status(400).json({ success: false, message: 'Device ID is required.' });
  }

  const query = `DELETE FROM devices WHERE device_id = ?`;

  db.run(query, [deviceId], function (err) {
    if (err) {
      console.error('❌ Error deleting device:', err.message);
      return res.status(500).json({ success: false, message: 'Database query error.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    return res.status(200).json({ success: true, message: 'Device deleted successfully.' });
  });
};