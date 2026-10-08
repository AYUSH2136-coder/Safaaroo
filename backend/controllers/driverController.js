const db = require('../config/db');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

let transactionQueue = Promise.resolve();
const withTransaction = (callback) => {
  const result = transactionQueue.then(async () => {
    await dbRun('BEGIN IMMEDIATE');
    try {
      const value = await callback();
      await dbRun('COMMIT');
      return value;
    } catch (err) {
      await dbRun('ROLLBACK').catch(() => {});
      throw err;
    }
  });
  transactionQueue = result.catch(() => {});
  return result;
};

const normalizeVehicleId = (value) => typeof value === 'string'
  ? value.trim().toUpperCase()
  : '';

const getProfile = async (req, res) => {
  try {
    const profile = await dbGet(
      `SELECT dp.*, u.name, u.mobile, u.role,
              v.vehicle_id, v.vehicle_name, ss.slot_no, v.status AS vehicle_status,
              operator.name AS operator_name, operator.mobile AS operator_mobile
       FROM driver_profiles dp
       JOIN users u ON u.user_id = dp.user_id
       LEFT JOIN vehicles v ON v.vehicle_id = dp.vehicle_id AND v.driver_id = dp.user_id
       LEFT JOIN service_slots ss ON ss.vehicle_id = v.vehicle_id
       LEFT JOIN users operator ON operator.user_id = ss.operator_id
       WHERE dp.user_id = ?`,
      [req.user.user_id],
    );
    if (!profile) return res.status(404).json({ error: 'Driver profile not found.' });
    return res.status(200).json({ profile });
  } catch (err) {
    console.error('❌ [Driver] getProfile error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch driver profile.' });
  }
};

const listVehicles = async (req, res) => {
  try {
    const vehicles = await dbAll(
      `SELECT h.vehicle_id, h.added_at, h.last_selected_at, h.last_driven_at,
              v.vehicle_name, v.status, v.driver_id AS active_driver_id,
              ss.slot_no, operator.name AS operator_name
       FROM driver_vehicle_history h
       JOIN vehicles v ON v.vehicle_id = h.vehicle_id
       LEFT JOIN service_slots ss ON ss.vehicle_id = v.vehicle_id
       LEFT JOIN users operator ON operator.user_id = ss.operator_id
       WHERE h.driver_id = ?
       ORDER BY COALESCE(h.last_driven_at, h.last_selected_at, h.added_at) DESC,
                h.added_at DESC`,
      [req.user.user_id],
    );
    return res.status(200).json({ vehicles });
  } catch (err) {
    console.error('❌ [Driver] listVehicles error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch driver vehicles.' });
  }
};

const addVehicle = async (req, res) => {
  const vehicleId = normalizeVehicleId(req.body.vehicle_id);
  if (!vehicleId) return res.status(400).json({ error: 'vehicle_id is required.' });

  try {
    const vehicle = await dbGet(
      `SELECT vehicle_id FROM vehicles WHERE vehicle_id = ?`,
      [vehicleId],
    );
    if (!vehicle) {
      return res.status(404).json({
        code: 'VEHICLE_NOT_REGISTERED',
        error: 'Vehicle is not registered; contact the operator.',
      });
    }

    const existing = await dbGet(
      `SELECT 1 FROM driver_vehicle_history WHERE driver_id = ? AND vehicle_id = ?`,
      [req.user.user_id, vehicleId],
    );
    if (existing) {
      return res.status(409).json({ code: 'VEHICLE_ALREADY_ADDED', error: 'Vehicle already added.' });
    }

    await dbRun(
      `INSERT INTO driver_vehicle_history (driver_id, vehicle_id) VALUES (?, ?)`,
      [req.user.user_id, vehicleId],
    );
    return res.status(201).json({ message: 'Vehicle added to your list.', vehicle_id: vehicleId });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ code: 'VEHICLE_ALREADY_ADDED', error: 'Vehicle already added.' });
    }
    console.error('❌ [Driver] addVehicle error:', err.message);
    return res.status(500).json({ error: 'Failed to add vehicle.' });
  }
};

const getVehicleDetails = async (req, res) => {
  const vehicleId = normalizeVehicleId(req.params.vehicleId);
  try {
    const vehicle = await dbGet(
      `SELECT v.vehicle_id, v.vehicle_name, v.status, v.driver_id AS active_driver_id,
              active_driver.name AS active_driver_name,
              active_driver.mobile AS active_driver_mobile,
              ss.slot_no, ss.legacy_slot_label,
              operator.user_id AS operator_id, operator.name AS operator_name,
              operator.mobile AS operator_mobile
       FROM driver_vehicle_history h
       JOIN vehicles v ON v.vehicle_id = h.vehicle_id
       LEFT JOIN users active_driver ON active_driver.user_id = v.driver_id
       LEFT JOIN service_slots ss ON ss.vehicle_id = v.vehicle_id
       LEFT JOIN users operator ON operator.user_id = ss.operator_id
       WHERE h.driver_id = ? AND h.vehicle_id = ?`,
      [req.user.user_id, vehicleId],
    );
    if (!vehicle) return res.status(404).json({ error: 'Vehicle is not in your list.' });

    const schools = vehicle.slot_no == null ? [] : await dbAll(
      `SELECT s.school_id, s.school_name
       FROM service_slot_schools link
       JOIN schools s ON s.school_id = link.school_id
       WHERE link.slot_no = ?
       ORDER BY s.school_name`,
      [vehicle.slot_no],
    );
    await dbRun(
      `UPDATE driver_vehicle_history SET last_selected_at = CURRENT_TIMESTAMP
       WHERE driver_id = ? AND vehicle_id = ?`,
      [req.user.user_id, vehicleId],
    );
    return res.status(200).json({ vehicle: { ...vehicle, schools } });
  } catch (err) {
    console.error('❌ [Driver] getVehicleDetails error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch vehicle details.' });
  }
};

const startTransmission = async (req, res) => {
  const userId = req.user.user_id;
  const vehicleId = normalizeVehicleId(req.body.vehicle_id);
  if (!vehicleId) return res.status(400).json({ error: 'vehicle_id is required.' });

  try {
    const result = await withTransaction(async () => {
      // 1. Verify the driver has this vehicle in their history list
      const history = await dbGet(
        `SELECT 1 FROM driver_vehicle_history WHERE driver_id = ? AND vehicle_id = ?`,
        [userId, vehicleId],
      );
      if (!history) return { error: 'Vehicle is not in your list.', status: 404 };

      // 2. Verify driver profile exists and isn't already transmitting another vehicle
      const profile = await dbGet(
        `SELECT vehicle_id FROM driver_profiles WHERE user_id = ?`,
        [userId],
      );
      if (!profile) return { error: 'Driver profile not found.', status: 404 };
      if (profile.vehicle_id && profile.vehicle_id !== vehicleId) {
        return { error: 'Stop your current transmission before starting another vehicle.', status: 409 };
      }

      // 3. Claim the vehicle (prevent duplicate active transmissions on same bus)
      const claim = await dbRun(
        `UPDATE vehicles SET driver_id = ?, status = 'active'
         WHERE vehicle_id = ? AND (driver_id IS NULL OR driver_id = ?)`,
        [userId, vehicleId, userId],
      );
      if (!claim.changes) {
        return { error: 'This vehicle is currently transmitting with another driver.', status: 409 };
      }

      // 4. Update driver profile to reflect current vehicle
      await dbRun(
        `UPDATE driver_profiles SET vehicle_id = ?, operator_id = (
           SELECT operator_id FROM vehicles WHERE vehicle_id = ?
         ) WHERE user_id = ?`,
        [vehicleId, vehicleId, userId],
      );
      await dbRun(
        `UPDATE driver_vehicle_history SET last_driven_at = CURRENT_TIMESTAMP
         WHERE driver_id = ? AND vehicle_id = ?`,
        [userId, vehicleId],
      );

      // 5. End any previous ACTIVE transmission sessions for this driver or vehicle
      await dbRun(
        `UPDATE transmission_sessions SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
         WHERE status = 'ACTIVE' AND (driver_id = ? OR vehicle_id = ?)`,
        [userId, vehicleId],
      );

      // 6. Resolve the slot for this vehicle (if any)
      const slot = await dbGet(
        `SELECT slot_no FROM service_slots WHERE vehicle_id = ?`,
        [vehicleId],
      );
      const slotNo = slot ? slot.slot_no : null;

      // 7. Create a new TransmissionSession
      const { v4: uuidv4 } = require('uuid');
      const sessionId = uuidv4();
      await dbRun(
        `INSERT INTO transmission_sessions (session_id, driver_id, vehicle_id, slot_no, device_id, status)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [sessionId, userId, vehicleId, slotNo, vehicleId],
      );

      // 8. If the vehicle belongs to a slot, create/update the SlotAssignment
      if (slotNo != null) {
        // End any previous ACTIVE assignment for this slot
        await dbRun(
          `UPDATE slot_assignments SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
           WHERE slot_no = ? AND status = 'ACTIVE'`,
          [slotNo],
        );
        // Create a new ACTIVE assignment
        const assignmentId = uuidv4();
        await dbRun(
          `INSERT INTO slot_assignments (assignment_id, slot_no, vehicle_id, driver_id, status)
           VALUES (?, ?, ?, ?, 'ACTIVE')`,
          [assignmentId, slotNo, vehicleId, userId],
        );
      }

      return { vehicle_id: vehicleId, session_id: sessionId, slot_no: slotNo };
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(200).json({ message: 'Transmission started.', ...result });
  } catch (err) {
    console.error('❌ [Driver] startTransmission error:', err.message);
    return res.status(500).json({ error: 'Failed to start transmission.' });
  }
};

const stopTransmission = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const releasedVehicleId = await withTransaction(async () => {
      const profile = await dbGet(
        `SELECT vehicle_id FROM driver_profiles WHERE user_id = ?`,
        [userId],
      );
      if (!profile?.vehicle_id) return null;

      const vehicleId = profile.vehicle_id;

      // 1. End the active transmission session for this driver
      await dbRun(
        `UPDATE transmission_sessions SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
         WHERE driver_id = ? AND vehicle_id = ? AND status = 'ACTIVE'`,
        [userId, vehicleId],
      );

      // 2. End the active slot assignment for this driver+vehicle
      await dbRun(
        `UPDATE slot_assignments SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
         WHERE driver_id = ? AND vehicle_id = ? AND status = 'ACTIVE'`,
        [userId, vehicleId],
      );

      // 3. Release the vehicle claim (existing behavior)
      await dbRun(
        `UPDATE vehicles SET driver_id = NULL, status = 'inactive'
         WHERE vehicle_id = ? AND driver_id = ?`,
        [vehicleId, userId],
      );

      // 4. Clear the driver's current vehicle
      await dbRun(
        `UPDATE driver_profiles SET vehicle_id = NULL, operator_id = NULL WHERE user_id = ?`,
        [userId],
      );

      return vehicleId;
    });
    return res.status(200).json({ message: 'Transmission stopped.', vehicle_id: releasedVehicleId });
  } catch (err) {
    console.error('❌ [Driver] stopTransmission error:', err.message);
    return res.status(500).json({ error: 'Failed to stop transmission.' });
  }
};

const removeVehicle = async (req, res) => {
  const vehicleId = normalizeVehicleId(req.params.vehicleId);
  const userId = req.user.user_id;
  try {
    const result = await withTransaction(async () => {
      const history = await dbGet(
        `SELECT 1 FROM driver_vehicle_history WHERE driver_id = ? AND vehicle_id = ?`,
        [userId, vehicleId],
      );
      if (!history) return { error: 'Vehicle not found in your list.', status: 404 };

      const profile = await dbGet(
        `SELECT vehicle_id FROM driver_profiles WHERE user_id = ?`,
        [userId],
      );
      if (profile?.vehicle_id === vehicleId) {
        // End active transmission session and slot assignment
        await dbRun(
          `UPDATE transmission_sessions SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
           WHERE driver_id = ? AND vehicle_id = ? AND status = 'ACTIVE'`,
          [userId, vehicleId],
        );
        await dbRun(
          `UPDATE slot_assignments SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
           WHERE driver_id = ? AND vehicle_id = ? AND status = 'ACTIVE'`,
          [userId, vehicleId],
        );
        await dbRun(
          `UPDATE vehicles SET driver_id = NULL, status = 'inactive'
           WHERE vehicle_id = ? AND driver_id = ?`,
          [vehicleId, userId],
        );
        await dbRun(
          `UPDATE driver_profiles SET vehicle_id = NULL, operator_id = NULL WHERE user_id = ?`,
          [userId],
        );
      }

      await dbRun(
        `DELETE FROM driver_vehicle_history WHERE driver_id = ? AND vehicle_id = ?`,
        [userId, vehicleId]
      );
      return { success: true };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(200).json({ message: 'Vehicle removed from your list.' });
  } catch (err) {
    console.error('❌ [Driver] removeVehicle error:', err.message);
    return res.status(500).json({ error: 'Failed to remove vehicle.' });
  }
};

module.exports = {
  getProfile,
  listVehicles,
  addVehicle,
  getVehicleDetails,
  startTransmission,
  stopTransmission,
  removeVehicle,
};