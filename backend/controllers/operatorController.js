
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
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

const normalizeSchoolIds = (schoolIds) => [...new Set(
  (Array.isArray(schoolIds) ? schoolIds : []).filter((id) => typeof id === 'string' && id.trim())
)];

const getOwnedSchools = async (operatorId, schoolIds, { required = false } = {}) => {
  const ids = normalizeSchoolIds(schoolIds);
  if (!ids.length) {
    if (required) throw new Error('At least one school must be selected.');
    return [];
  }
  const placeholders = ids.map(() => '?').join(', ');
  const schools = await dbAll(
    `SELECT school_id FROM schools WHERE operator_id = ? AND school_id IN (${placeholders})`,
    [operatorId, ...ids],
  );
  if (schools.length !== ids.length) throw new Error('One or more selected schools are not yours.');
  return ids;
};

const getSlotsForOperator = async (operatorId) => {
  const slots = await dbAll(
    `SELECT ss.slot_no, ss.slot_name, ss.vehicle_id, ss.legacy_slot_label, ss.created_at,
            COALESCE(sa.vehicle_id, ss.vehicle_id) AS active_vehicle_id,
            v.vehicle_name, v.status,
            COALESCE(sa.driver_id, v.driver_id) AS driver_id,
            driver.name AS driver_name, driver.mobile AS driver_mobile,
            ts.session_id AS active_session_id, ts.status AS transmission_status
     FROM service_slots ss
     LEFT JOIN slot_assignments sa ON sa.slot_no = ss.slot_no AND sa.status = 'ACTIVE'
     LEFT JOIN vehicles v ON v.vehicle_id = COALESCE(sa.vehicle_id, ss.vehicle_id)
     LEFT JOIN users driver ON driver.user_id = COALESCE(sa.driver_id, v.driver_id)
     LEFT JOIN transmission_sessions ts ON ts.slot_no = ss.slot_no AND ts.status = 'ACTIVE'
     WHERE ss.operator_id = ?
     ORDER BY ss.slot_no ASC`,
    [operatorId],
  );
  const assignments = await dbAll(
    `SELECT sss.slot_no, s.school_id, s.school_name
     FROM service_slot_schools sss
     JOIN schools s ON s.school_id = sss.school_id
     WHERE s.operator_id = ?
     ORDER BY s.school_name ASC`,
    [operatorId],
  );
  const schoolsBySlot = new Map();
  for (const assignment of assignments) {
    const schools = schoolsBySlot.get(assignment.slot_no) || [];
    schools.push({ school_id: assignment.school_id, school_name: assignment.school_name });
    schoolsBySlot.set(assignment.slot_no, schools);
  }
  return slots.map((slot) => ({ ...slot, schools: schoolsBySlot.get(slot.slot_no) || [] }));
};

// ─── Schools ────────────────────────────────────────────────────────────────

/**
 * POST /api/operator/schools
 * Body: { school_name, latitude, longitude, address? }
 */
const addSchool = async (req, res) => {
  const { school_name, latitude, longitude, address } = req.body;
  const operator_id = req.user.user_id;

  if (!school_name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'school_name, latitude, and longitude are required.' });
  }

  try {
    const schoolId = uuidv4();
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO schools (school_id, operator_id, school_name, latitude, longitude, address) VALUES (?, ?, ?, ?, ?, ?)`,
        [schoolId, operator_id, school_name.trim(), parseFloat(latitude), parseFloat(longitude), address || null],
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    return res.status(201).json({
      message: 'School added successfully.',
      school: { school_id: schoolId, operator_id, school_name: school_name.trim(), latitude, longitude, address }
    });
  } catch (err) {
    console.error('❌ [Operator] addSchool error:', err.message);
    return res.status(500).json({ error: 'Failed to add school.' });
  }
};

/**
 * GET /api/operator/schools
 * Returns all schools for the logged-in operator
 */
const getSchools = async (req, res) => {
  const operator_id = req.user.user_id;

  try {
    const schools = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM schools WHERE operator_id = ? ORDER BY created_at DESC`,
        [operator_id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    return res.status(200).json({ schools });
  } catch (err) {
    console.error('❌ [Operator] getSchools error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch schools.' });
  }
};

const updateSchool = async (req, res) => {
  const { id } = req.params;
  const { school_name, latitude, longitude, address } = req.body;
  const operator_id = req.user.user_id;

  if (!school_name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'school_name, latitude, and longitude are required.' });
  }

  try {
    const result = await dbRun(
      `UPDATE schools SET school_name = ?, latitude = ?, longitude = ?, address = ? WHERE school_id = ? AND operator_id = ?`,
      [school_name.trim(), parseFloat(latitude), parseFloat(longitude), address || null, id, operator_id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'School not found or not owned by you.' });
    }

    return res.status(200).json({ message: 'School updated successfully.' });
  } catch (err) {
    console.error('❌ [Operator] updateSchool error:', err.message);
    return res.status(500).json({ error: 'Failed to update school.' });
  }
};

const deleteSchool = async (req, res) => {
  const { id } = req.params;
  const operator_id = req.user.user_id;

  try {
    // First remove any slot-school links referencing this school
    await dbRun(
      `DELETE FROM service_slot_schools WHERE school_id = ? AND slot_no IN (
         SELECT slot_no FROM service_slots WHERE operator_id = ?
       )`,
      [id, operator_id]
    );

    // Unlink any vehicles referencing this school
    await dbRun(
      `UPDATE vehicles SET school_id = NULL WHERE school_id = ? AND operator_id = ?`,
      [id, operator_id]
    );

    // Unlink any parents referencing this school
    await dbRun(
      `UPDATE parent_profiles SET school_id = NULL WHERE school_id = ?`,
      [id]
    );

    // Delete the school record
    const result = await dbRun(
      `DELETE FROM schools WHERE school_id = ? AND operator_id = ?`,
      [id, operator_id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'School not found or not owned by you.' });
    }

    return res.status(200).json({ message: 'School deleted successfully.' });
  } catch (err) {
    console.error('❌ [Operator] deleteSchool error:', err.message);
    return res.status(500).json({ error: 'Failed to delete school.' });
  }
};

// ─── Vehicles ───────────────────────────────────────────────────────────────

const updateSlot = async (req, res) => {
  const operatorId = req.user.user_id;
  const slotNo = Number(req.params.slotNo);
  
  if (!Number.isSafeInteger(slotNo) || slotNo < 1) {
    return res.status(400).json({ error: 'Invalid slot number.' });
  }

  const slotName = typeof req.body.slot_name === 'string'
    ? req.body.slot_name.trim()
    : '';
  const vehicleId = typeof req.body.vehicle_id === 'string' && req.body.vehicle_id.trim()
    ? req.body.vehicle_id.trim().toUpperCase()
    : null;

  if (!slotName) return res.status(400).json({ error: 'Slot name is required.' });

  try {
    const slot = await dbGet(
      `SELECT * FROM service_slots WHERE slot_no = ? AND operator_id = ?`,
      [slotNo, operatorId],
    );
    if (!slot) return res.status(404).json({ error: 'Slot not found or not owned by you.' });

    const schoolIds = await getOwnedSchools(operatorId, req.body.school_ids);

    // If assigning a new vehicle, check its availability
    if (vehicleId && vehicleId !== slot.vehicle_id) {
      const vehicle = await dbGet(
        `SELECT vehicle_id FROM vehicles WHERE vehicle_id = ? AND operator_id = ?`,
        [vehicleId, operatorId],
      );
      if (!vehicle) return res.status(404).json({ error: 'Registered vehicle not found in your fleet.' });
      const occupiedSlot = await dbGet(
        `SELECT slot_no FROM service_slots WHERE vehicle_id = ? AND slot_no != ?`,
        [vehicleId, slotNo],
      );
      if (occupiedSlot) return res.status(409).json({ error: 'Vehicle is already assigned to another service slot.' });
    }

    // Check if previous vehicle was active and we're unassigning/changing it
    if (slot.vehicle_id && slot.vehicle_id !== vehicleId) {
      const previousVehicle = await dbGet(
        `SELECT driver_id, status FROM vehicles WHERE vehicle_id = ?`,
        [slot.vehicle_id],
      );
      if (previousVehicle?.driver_id && previousVehicle.status === 'active') {
        return res.status(409).json({ error: 'Stop the current transmission before changing or removing the bus.' });
      }
    }

    await withTransaction(async () => {
      // Unassign old vehicle if we are removing or replacing it
      if (slot.vehicle_id && slot.vehicle_id !== vehicleId) {
        await dbRun(
          `UPDATE vehicles SET driver_id = NULL, status = 'inactive' WHERE vehicle_id = ?`,
          [slot.vehicle_id],
        );
        // We do NOT clear the driver_profile vehicle_id here, as that driver's default vehicle might still be this bus.
        // Wait, the previous logic did clear driver_profiles. Let's keep it safe.
        const prevVehicle = await dbGet(`SELECT driver_id FROM vehicles WHERE vehicle_id = ?`, [slot.vehicle_id]);
        if (prevVehicle?.driver_id) {
          await dbRun(`UPDATE driver_profiles SET vehicle_id = NULL WHERE user_id = ? AND vehicle_id = ?`, [prevVehicle.driver_id, slot.vehicle_id]);
        }
      }

      await dbRun(
        `UPDATE service_slots SET vehicle_id = ?, slot_name = ? WHERE slot_no = ? AND operator_id = ?`,
        [vehicleId, slotName, slotNo, operatorId],
      );

      await dbRun(`DELETE FROM service_slot_schools WHERE slot_no = ?`, [slotNo]);
      for (const schoolId of schoolIds) {
        await dbRun(
          `INSERT INTO service_slot_schools (slot_no, school_id) VALUES (?, ?)`,
          [slotNo, schoolId],
        );
      }

      if (schoolIds.length) {
        const schoolPlaceholders = schoolIds.map(() => '?').join(', ');
        await dbRun(
          `UPDATE parent_profiles SET slot_no = NULL, vehicle_id = NULL WHERE slot_no = ? AND school_id NOT IN (${schoolPlaceholders})`,
          [slotNo, ...schoolIds],
        );
      } else {
        await dbRun(`UPDATE parent_profiles SET slot_no = NULL, vehicle_id = NULL WHERE slot_no = ?`, [slotNo]);
      }

      if (vehicleId) {
        await dbRun(
          `UPDATE parent_profiles SET vehicle_id = ? WHERE slot_no = ?`,
          [vehicleId, slotNo],
        );
      }
    });

    return res.status(200).json({ message: 'Slot updated successfully.' });
  } catch (err) {
    if (err.message?.includes('selected schools')) return res.status(403).json({ error: err.message });
    if (err.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Vehicle number or slot assignment is already in use.' });
    }
    console.error('❌ [Operator] updateSlot error:', err.message);
    return res.status(500).json({ error: 'Failed to update slot.' });
  }
};

const addVehicle = async (req, res) => {
  const vehicleId = typeof req.body.vehicle_id === 'string'
    ? req.body.vehicle_id.trim().toUpperCase()
    : '';
  const vehicleName = typeof req.body.vehicle_name === 'string'
    ? req.body.vehicle_name.trim() || null
    : null;
  const operatorId = req.user.user_id;

  if (!vehicleId) return res.status(400).json({ error: 'vehicle_id is required.' });

  try {
    const existing = await dbGet(`SELECT vehicle_id FROM vehicles WHERE vehicle_id = ?`, [vehicleId]);
    if (existing) {
      return res.status(409).json({ error: 'Vehicle number is already registered.' });
    }

    await dbRun(
      `INSERT INTO vehicles (vehicle_id, operator_id, driver_id, school_id, vehicle_name)
       VALUES (?, ?, NULL, NULL, ?)`,
      [vehicleId, operatorId, vehicleName],
    );
    return res.status(201).json({
      message: 'Vehicle registered.',
      vehicle: { vehicle_id: vehicleId, operator_id: operatorId, vehicle_name: vehicleName, driver_id: null, status: 'inactive' },
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Vehicle number is already registered.' });
    }
    console.error('❌ [Operator] addVehicle error:', err.message);
    return res.status(500).json({ error: 'Failed to register vehicle.' });
  }
};

const createSlot = async (req, res) => {
  const operatorId = req.user.user_id;
  const slotName = typeof req.body.slot_name === 'string'
    ? req.body.slot_name.trim()
    : '';
  const vehicleId = typeof req.body.vehicle_id === 'string' && req.body.vehicle_id.trim()
    ? req.body.vehicle_id.trim().toUpperCase()
    : null;

  if (!slotName) return res.status(400).json({ error: 'Slot name is required.' });

  try {
    const schoolIds = await getOwnedSchools(operatorId, req.body.school_ids);

    if (vehicleId) {
      const vehicle = await dbGet(
        `SELECT vehicle_id FROM vehicles WHERE vehicle_id = ? AND operator_id = ?`,
        [vehicleId, operatorId],
      );
      if (!vehicle) return res.status(404).json({ error: 'Registered vehicle not found in your fleet.' });
      const existingSlot = await dbGet(
        `SELECT slot_no FROM service_slots WHERE vehicle_id = ?`,
        [vehicleId],
      );
      if (existingSlot) return res.status(409).json({ error: 'Vehicle is already assigned to a service slot.' });
    }

    const slotNo = await withTransaction(async () => {
      const result = await dbRun(
        `INSERT INTO service_slots (operator_id, vehicle_id, slot_name) VALUES (?, ?, ?)`,
        [operatorId, vehicleId, slotName],
      );
      for (const schoolId of schoolIds) {
        await dbRun(
          `INSERT INTO service_slot_schools (slot_no, school_id) VALUES (?, ?)`,
          [result.lastID, schoolId],
        );
      }
      return result.lastID;
    });
    return res.status(201).json({ message: 'Service slot created.', slot_no: slotNo, slot_name: slotName, vehicle_id: vehicleId });
  } catch (err) {
    if (err.message?.includes('selected schools')) return res.status(403).json({ error: err.message });
    if (err.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Vehicle or slot assignment is already in use.' });
    }
    console.error('❌ [Operator] createSlot error:', err.message);
    return res.status(500).json({ error: 'Failed to create service slot.' });
  }
};

/**
 * DELETE /api/operator/slots/:slotNo
 * Delete a slot. If a vehicle was assigned, it becomes unassigned (not deleted).
 */
const deleteSlot = async (req, res) => {
  const operatorId = req.user.user_id;
  const slotNo = Number(req.params.slotNo);

  if (!Number.isSafeInteger(slotNo) || slotNo < 1) {
    return res.status(400).json({ error: 'Invalid slot number.' });
  }

  try {
    const slot = await dbGet(
      `SELECT slot_no, vehicle_id FROM service_slots WHERE slot_no = ? AND operator_id = ?`,
      [slotNo, operatorId],
    );
    if (!slot) return res.status(404).json({ error: 'Slot not found or not owned by you.' });

    await withTransaction(async () => {
      // If vehicle was assigned, check if it's currently transmitting
      if (slot.vehicle_id) {
        const vehicle = await dbGet(
          `SELECT status, driver_id FROM vehicles WHERE vehicle_id = ?`,
          [slot.vehicle_id],
        );
        if (vehicle?.status === 'active') {
          throw new Error('Stop the current transmission before deleting this slot.');
        }
        // Unassign vehicle from slot (don't delete the vehicle)
        await dbRun(
          `UPDATE vehicles SET driver_id = NULL, status = 'inactive' WHERE vehicle_id = ? AND operator_id = ?`,
          [slot.vehicle_id, operatorId],
        );
      }
      // Remove school assignments for this slot
      await dbRun(`DELETE FROM service_slot_schools WHERE slot_no = ?`, [slotNo]);
      // End any active slot assignments and transmission sessions
      await dbRun(
        `UPDATE slot_assignments SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
         WHERE slot_no = ? AND status = 'ACTIVE'`,
        [slotNo],
      );
      await dbRun(
        `UPDATE transmission_sessions SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
         WHERE slot_no = ? AND status = 'ACTIVE'`,
        [slotNo],
      );
      // Unlink parents referencing this slot
      await dbRun(
        `UPDATE parent_profiles SET slot_no = NULL, vehicle_id = NULL WHERE slot_no = ?`,
        [slotNo],
      );
      // Delete the slot itself
      await dbRun(
        `DELETE FROM service_slots WHERE slot_no = ? AND operator_id = ?`,
        [slotNo, operatorId],
      );
    });

    return res.status(200).json({ message: 'Slot deleted successfully.' });
  } catch (err) {
    if (err.message?.includes('Stop the current transmission')) {
      return res.status(409).json({ error: err.message });
    }
    console.error('❌ [Operator] deleteSlot error:', err.message);
    return res.status(500).json({ error: 'Failed to delete slot.' });
  }
};

/**
 * GET /api/operator/vehicles
 * Returns all vehicles for the logged-in operator with driver info
 */
const getVehicles = async (req, res) => {
  const operatorId = req.user.user_id;

  try {
    const vehicles = await dbAll(
      `SELECT v.*, u.name as driver_name, u.mobile as driver_mobile,
              ss.slot_no, legacy.school_name AS legacy_school_name
       FROM vehicles v
       LEFT JOIN users u ON v.driver_id = u.user_id
       LEFT JOIN schools legacy ON legacy.school_id = v.school_id
       LEFT JOIN service_slots ss ON ss.vehicle_id = v.vehicle_id
       WHERE v.operator_id = ?
       ORDER BY v.created_at DESC`,
      [operatorId],
    );
    const slots = await getSlotsForOperator(operatorId);
    const slotsByVehicle = new Map(slots.filter((slot) => slot.vehicle_id)
      .map((slot) => [slot.vehicle_id, slot]));
    const enrichedVehicles = vehicles.map((vehicle) => {
      const slot = slotsByVehicle.get(vehicle.vehicle_id);
      const schools = slot?.schools || (vehicle.legacy_school_name
        ? [{ school_id: vehicle.school_id, school_name: vehicle.legacy_school_name }]
        : []);
      return {
        ...vehicle,
        slot_no: slot?.slot_no ?? null,
        legacy_slot_label: slot?.legacy_slot_label ?? vehicle.legacy_slot_label,
        schools,
        school_ids: schools.map((school) => school.school_id),
        school_names: schools.map((school) => school.school_name),
        school_name: schools.map((school) => school.school_name).join(', ') || null,
      };
    });

    return res.status(200).json({ vehicles: enrichedVehicles });
  } catch (err) {
    console.error('❌ [Operator] getVehicles error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch vehicles.' });
  }
};

const getSlots = async (req, res) => {
  try {
    return res.status(200).json({ slots: await getSlotsForOperator(req.user.user_id) });
  } catch (err) {
    console.error('❌ [Operator] getSlots error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch service slots.' });
  }
};

const getDrivers = async (req, res) => {
  try {
    const drivers = await dbAll(
      `SELECT dp.user_id AS driver_id, u.name, u.mobile,
              dp.vehicle_id, dp.is_under_operator
       FROM driver_profiles dp
       JOIN users u ON u.user_id = dp.user_id AND u.role = 'driver'
       WHERE dp.is_under_operator = 1
         AND (dp.operator_id = ? OR EXISTS (
           SELECT 1 FROM vehicles v
           WHERE v.vehicle_id = dp.vehicle_id AND v.operator_id = ?
         ))
       ORDER BY u.name COLLATE NOCASE`,
      [req.user.user_id, req.user.user_id],
    );
    return res.status(200).json({ drivers });
  } catch (err) {
    console.error('❌ [Operator] getDrivers error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch drivers.' });
  }
};

/**
 * PUT /api/operator/vehicles/:id
 * Body: { vehicle_name?, driver_id? }
 */
const updateVehicle = async (req, res) => {
  const { id } = req.params;
  const { vehicle_name, driver_id } = req.body;
  const operator_id = req.user.user_id;

  try {
    const vehicle = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM vehicles WHERE vehicle_id = ? AND operator_id = ?`, [id, operator_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found or not owned by you.' });
    }

    if (vehicle_name === undefined && driver_id === undefined) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const slot = await dbGet(
      `SELECT slot_no FROM service_slots WHERE vehicle_id = ? AND operator_id = ?`,
      [id, operator_id],
    );
    // Vehicle may be in a slot, but we only update vehicle-level fields here.
    // Slot management is done via the dedicated PUT /slots/:slotNo endpoint.

    if (driver_id !== undefined && driver_id) {
      const driver = await dbGet(
        `SELECT dp.user_id, dp.operator_id, dp.vehicle_id
         FROM driver_profiles dp JOIN users u ON u.user_id = dp.user_id AND u.role = 'driver'
         WHERE dp.user_id = ? AND (dp.operator_id = ? OR EXISTS (
           SELECT 1 FROM vehicles owned WHERE owned.vehicle_id = dp.vehicle_id AND owned.operator_id = ?
         ))`,
        [driver_id, operator_id, operator_id],
      );
      if (!driver) return res.status(404).json({ error: 'Driver not found or not associated with your fleet.' });
      if (driver.vehicle_id && driver.vehicle_id !== id) {
        return res.status(409).json({ error: 'Driver is already assigned to another vehicle.' });
      }
    }

    await withTransaction(async () => {
      if (driver_id !== undefined && vehicle.driver_id && vehicle.driver_id !== driver_id) {
        await dbRun(
          `UPDATE driver_profiles SET vehicle_id = NULL WHERE user_id = ? AND vehicle_id = ?`,
          [vehicle.driver_id, id],
        );
      }
      const updates = [];
      const params = [];
      if (vehicle_name !== undefined) { updates.push('vehicle_name = ?'); params.push(vehicle_name); }
      if (driver_id !== undefined) { updates.push('driver_id = ?'); params.push(driver_id || null); }
      params.push(id, operator_id);
      await dbRun(
        `UPDATE vehicles SET ${updates.join(', ')} WHERE vehicle_id = ? AND operator_id = ?`,
        params,
      );
      if (driver_id) {
        await dbRun(
          `UPDATE driver_profiles SET vehicle_id = ?, operator_id = ? WHERE user_id = ?`,
          [id, operator_id, driver_id],
        );
      }
    });

    return res.status(200).json({ message: 'Vehicle updated.' });
  } catch (err) {
    console.error('❌ [Operator] updateVehicle error:', err.message);
    return res.status(500).json({ error: 'Failed to update vehicle.' });
  }
};

/**
 * DELETE /api/operator/vehicles/:id
 */
const deleteVehicle = async (req, res) => {
  const { id } = req.params;
  const operator_id = req.user.user_id;

  try {
    const assignedSlot = await dbGet(
      `SELECT slot_no FROM service_slots WHERE vehicle_id = ? AND operator_id = ?`,
      [id, operator_id],
    );
    if (assignedSlot) {
      return res.status(409).json({
        error: `Vehicle is assigned to SLOT-${String(assignedSlot.slot_no).padStart(3, '0')}. Replace or remove its slot assignment first.`,
      });
    }

    const result = await new Promise((resolve, reject) => {
      db.run(`DELETE FROM vehicles WHERE vehicle_id = ? AND operator_id = ?`, [id, operator_id], function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Vehicle not found or not owned by you.' });
    }

    return res.status(200).json({ message: 'Vehicle deleted.' });
  } catch (err) {
    console.error('❌ [Operator] deleteVehicle error:', err.message);
    return res.status(500).json({ error: 'Failed to delete vehicle.' });
  }
};



module.exports = {
  addSchool,
  getSchools,
  updateSchool,
  deleteSchool,
  addVehicle,
  createSlot,
  deleteSlot,
  getVehicles,
  getSlots,
  getDrivers,
  updateSlot,
  updateVehicle,
  deleteVehicle,
};
