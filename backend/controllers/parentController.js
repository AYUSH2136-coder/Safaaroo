
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

/**
 * GET /api/parent/schools
 * Returns all schools (so parent can pick their child's school)
 */
const getSchools = async (req, res) => {
  try {
    const schools = await new Promise((resolve, reject) => {
      db.all(
        `SELECT school_id, school_name, latitude, longitude, address FROM schools ORDER BY school_name ASC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    return res.status(200).json({ schools });
  } catch (err) {
    console.error('❌ [Parent] getSchools error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch schools.' });
  }
};

/**
 * GET /api/parent/vehicles?school_id=...
 * Returns stable service slots linked to a school, with the current vehicle.
 */
const getVehicles = async (req, res) => {
  const { school_id } = req.query;

  if (!school_id) {
    return res.status(400).json({ error: 'school_id query parameter is required.' });
  }

  try {
    const vehicles = await new Promise((resolve, reject) => {
      db.all(
        `SELECT ss.slot_no, ss.vehicle_id,
                v.vehicle_name, v.status,
                u.name as driver_name, u.mobile as driver_mobile
         FROM service_slot_schools sss
         JOIN service_slots ss ON ss.slot_no = sss.slot_no
         LEFT JOIN vehicles v ON v.vehicle_id = ss.vehicle_id
         LEFT JOIN users u ON v.driver_id = u.user_id
         WHERE sss.school_id = ? AND ss.vehicle_id IS NOT NULL
         ORDER BY ss.slot_no ASC`,
        [school_id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    return res.status(200).json({ vehicles });
  } catch (err) {
    console.error('❌ [Parent] getVehicles error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch vehicles.' });
  }
};

/**
 * PUT /api/parent/profile
 * Body: { school_id?, slot_no?, vehicle_id?, home_lat?, home_lng?, notify_pref? }
 * Updates the parent's profile
 */
const updateProfile = async (req, res) => {
  const { user_id } = req.user;
  const { school_id, slot_no, vehicle_id, home_lat, home_lng, notify_pref } = req.body;

  try {
    const existing = await new Promise((resolve, reject) => {
      db.get(`SELECT profile_id, school_id, slot_no FROM parent_profiles WHERE user_id = ?`, [user_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!existing) {
      return res.status(404).json({ error: 'Parent profile not found.' });
    }

    const updates = [];
    const params = [];
    const selectedSchoolId = school_id !== undefined ? (school_id || null) : null;
    let selectedSlotNo = slot_no === '' ? null : slot_no;

    if (selectedSchoolId != null) {
      const school = await new Promise((resolve, reject) => {
        db.get(
          `SELECT school_id FROM schools WHERE school_id = ?`,
          [selectedSchoolId],
          (err, row) => err ? reject(err) : resolve(row),
        );
      });
      if (!school) return res.status(404).json({ error: 'School not found.' });
    }

    if (slot_no !== undefined && slot_no !== null && slot_no !== '') {
      selectedSlotNo = Number(slot_no);
      if (!Number.isSafeInteger(selectedSlotNo) || selectedSlotNo < 1) {
        return res.status(400).json({ error: 'slot_no must be a positive integer.' });
      }
    } else if (slot_no === undefined && vehicle_id) {
      // Backward compatibility for clients that still post vehicle_id.
      const legacySlot = await new Promise((resolve, reject) => {
        db.get(
          `SELECT ss.slot_no, ss.vehicle_id
           FROM service_slots ss WHERE ss.vehicle_id = ?`,
          [vehicle_id],
          (err, row) => err ? reject(err) : resolve(row),
        );
      });
      if (!legacySlot) {
        return res.status(400).json({ error: 'Selected vehicle is not assigned to a service slot.' });
      }
      selectedSlotNo = legacySlot.slot_no;
    }

    if (selectedSlotNo != null) {
      const effectiveSchoolId = selectedSchoolId ?? existing.school_id;
      const slot = await new Promise((resolve, reject) => {
        db.get(
          `SELECT ss.slot_no, ss.vehicle_id
           FROM service_slots ss
           JOIN service_slot_schools sss ON sss.slot_no = ss.slot_no
           WHERE ss.slot_no = ? AND sss.school_id = ?`,
          [selectedSlotNo, effectiveSchoolId],
          (err, row) => err ? reject(err) : resolve(row),
        );
      });
      if (!slot) {
        return res.status(400).json({ error: 'Selected slot is not available for this school.' });
      }
      updates.push('slot_no = ?'); params.push(slot.slot_no);
      updates.push('vehicle_id = ?'); params.push(slot.vehicle_id);
    } else if (slot_no !== undefined || (school_id !== undefined && selectedSchoolId !== existing.school_id)) {
      updates.push('slot_no = ?'); params.push(null);
      updates.push('vehicle_id = ?'); params.push(null);
    }
    if (school_id !== undefined) { updates.push('school_id = ?'); params.push(selectedSchoolId); }
    if (home_lat !== undefined)   { updates.push('home_lat = ?');   params.push(home_lat); }
    if (home_lng !== undefined)   { updates.push('home_lng = ?');   params.push(home_lng); }
    if (notify_pref !== undefined){ updates.push('notify_pref = ?');params.push(notify_pref); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    params.push(user_id);
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE parent_profiles SET ${updates.join(', ')} WHERE user_id = ?`,
        params,
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    return res.status(200).json({ message: 'Profile updated successfully.' });
  } catch (err) {
    console.error('❌ [Parent] updateProfile error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
};

/**
 * GET /api/parent/profile
 * Returns parent profile + school + vehicle details
 */
const getProfile = async (req, res) => {
  const { user_id } = req.user;

  try {
    const profile = await new Promise((resolve, reject) => {
      db.get(
        `SELECT pp.*,
                u.name, u.mobile,
                s.school_name, s.latitude as school_lat, s.longitude as school_lng, s.address as school_address,
          COALESCE(ss.slot_no, pp.slot_no) AS resolved_slot_no,
          sa.vehicle_id AS current_vehicle_id,
          v.vehicle_name, v.status as vehicle_status,
          d.name as driver_name, d.mobile as driver_mobile
         FROM parent_profiles pp
         JOIN users u ON pp.user_id = u.user_id
         LEFT JOIN schools s ON pp.school_id = s.school_id
         LEFT JOIN service_slots ss ON pp.slot_no = ss.slot_no
         LEFT JOIN slot_assignments sa ON sa.slot_no = ss.slot_no AND sa.status = 'ACTIVE'
         LEFT JOIN vehicles v ON v.vehicle_id = COALESCE(sa.vehicle_id, ss.vehicle_id, pp.vehicle_id)
         LEFT JOIN users d ON d.user_id = COALESCE(sa.driver_id, v.driver_id)
         WHERE pp.user_id = ?`,
        [user_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!profile) {
      return res.status(404).json({ error: 'Parent profile not found.' });
    }

    return res.status(200).json({ profile });
  } catch (err) {
    console.error('❌ [Parent] getProfile error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};

/**
 * GET /api/parent/track/:vehicleId
 * Returns latest known position of a vehicle
 */
const trackVehicle = async (req, res) => {
  const { vehicleId } = req.params;

  try {
    // First verify the vehicle exists
    const vehicle = await new Promise((resolve, reject) => {
      db.get(`SELECT vehicle_id, status FROM vehicles WHERE vehicle_id = ?`, [vehicleId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    // Try to get last known location from devices table (existing bus tracking)
    const location = await new Promise((resolve, reject) => {
      db.get(
        `SELECT latitude, longitude, last_update, status FROM devices WHERE device_id = ?`,
        [vehicleId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    return res.status(200).json({
      vehicle_id: vehicleId,
      status: vehicle.status,
      location: location || null
    });
  } catch (err) {
    console.error('❌ [Parent] trackVehicle error:', err.message);
    return res.status(500).json({ error: 'Failed to get vehicle location.' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Multi-Route Management APIs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/parent/routes
 * Body: { route_name, slot_no, school_id?, custom_school_name?, custom_school_lat?, custom_school_lng?,
 *         home_lat?, home_lng?, pickup_name?, notify_pref? }
 * Creates a new tracking route for the parent.
 * school_id is optional — parent can use a global school or set custom school name/coords.
 */
const createRoute = async (req, res) => {
  const { user_id } = req.user;
  const { route_name, school_id, custom_school_name, custom_school_lat, custom_school_lng,
          slot_no, home_lat, home_lng, pickup_name, notify_pref } = req.body;

  if (!route_name || !route_name.trim()) {
    return res.status(400).json({ error: 'Route name is required.' });
  }
  if (slot_no === undefined || slot_no === null || slot_no === '') {
    return res.status(400).json({ error: 'Service slot is required.' });
  }

  const slotNoInt = Number(slot_no);
  if (!Number.isSafeInteger(slotNoInt) || slotNoInt < 1) {
    return res.status(400).json({ error: 'Slot number must be a positive integer.' });
  }

  try {
    // Verify slot exists (no school restriction — slots are global)
    const slot = await new Promise((resolve, reject) => {
      db.get(`SELECT slot_no, vehicle_id FROM service_slots WHERE slot_no = ?`,
        [slotNoInt],
        (err, row) => err ? reject(err) : resolve(row));
    });
    if (!slot) {
      return res.status(400).json({ error: 'Service slot not found.' });
    }

    const routeId = uuidv4();
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO parent_routes (route_id, user_id, route_name, school_id,
         custom_school_name, custom_school_lat, custom_school_lng,
         slot_no, home_lat, home_lng, pickup_name, notify_pref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [routeId, user_id, route_name.trim(), school_id || null,
         custom_school_name || null, custom_school_lat || null, custom_school_lng || null,
         slotNoInt,
         home_lat || null, home_lng || null, pickup_name || null,
         notify_pref || 'none'],
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    return res.status(201).json({ message: 'Route created successfully.', route_id: routeId });
  } catch (err) {
    console.error('❌ [Parent] createRoute error:', err.message);
    return res.status(500).json({ error: 'Failed to create route.' });
  }
};

/**
 * GET /api/parent/routes
 * Returns all routes for the parent, ordered by most recent first.
 * Includes joined details: school name, vehicle, driver, operator, and transmission status.
 */
const getRoutes = async (req, res) => {
  const { user_id } = req.user;

  try {
    const routes = await new Promise((resolve, reject) => {
      db.all(
        `SELECT pr.route_id, pr.route_name, pr.school_id, pr.slot_no,
                pr.home_lat, pr.home_lng, pr.notify_pref, pr.created_at,
                pr.custom_school_name, pr.custom_school_lat, pr.custom_school_lng,
                pr.pickup_name,
                s.school_name, s.latitude AS school_lat, s.longitude AS school_lng,
                COALESCE(sa.vehicle_id, ss.vehicle_id) AS vehicle_id,
                v.vehicle_name,
                d.name AS driver_name, d.mobile AS driver_mobile,
                d.user_id AS driver_id,
                op.name AS operator_name, op.mobile AS operator_mobile,
                dev.status AS transmission_status
         FROM parent_routes pr
         LEFT JOIN schools s ON pr.school_id = s.school_id
         LEFT JOIN service_slots ss ON pr.slot_no = ss.slot_no
         LEFT JOIN slot_assignments sa ON sa.slot_no = ss.slot_no AND sa.status = 'ACTIVE'
         LEFT JOIN vehicles v ON v.vehicle_id = COALESCE(sa.vehicle_id, ss.vehicle_id)
         LEFT JOIN users d ON d.user_id = COALESCE(sa.driver_id, v.driver_id)
         LEFT JOIN users op ON v.operator_id = op.user_id
         LEFT JOIN devices dev ON dev.device_id = COALESCE(sa.vehicle_id, ss.vehicle_id)
         WHERE pr.user_id = ?
         ORDER BY pr.created_at DESC`,
        [user_id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    return res.status(200).json({ routes });
  } catch (err) {
    console.error('❌ [Parent] getRoutes error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch routes.' });
  }
};

/**
 * GET /api/parent/routes/:routeId
 * Returns full detail of a single route.
 */
const getRouteDetail = async (req, res) => {
  const { user_id } = req.user;
  const { routeId } = req.params;

  try {
    const route = await new Promise((resolve, reject) => {
      db.get(
        `SELECT pr.route_id, pr.route_name, pr.school_id, pr.slot_no,
                pr.home_lat, pr.home_lng, pr.notify_pref, pr.created_at,
                pr.custom_school_name, pr.custom_school_lat, pr.custom_school_lng,
                pr.pickup_name,
                s.school_name, s.latitude AS school_lat, s.longitude AS school_lng,
                COALESCE(sa.vehicle_id, ss.vehicle_id) AS vehicle_id,
                v.vehicle_name,
                d.name AS driver_name, d.mobile AS driver_mobile,
                op.name AS operator_name, op.mobile AS operator_mobile,
                dev.status AS transmission_status
         FROM parent_routes pr
         LEFT JOIN schools s ON pr.school_id = s.school_id
         LEFT JOIN service_slots ss ON pr.slot_no = ss.slot_no
         LEFT JOIN slot_assignments sa ON sa.slot_no = ss.slot_no AND sa.status = 'ACTIVE'
         LEFT JOIN vehicles v ON v.vehicle_id = COALESCE(sa.vehicle_id, ss.vehicle_id)
         LEFT JOIN users d ON d.user_id = COALESCE(sa.driver_id, v.driver_id)
         LEFT JOIN users op ON v.operator_id = op.user_id
         LEFT JOIN devices dev ON dev.device_id = COALESCE(sa.vehicle_id, ss.vehicle_id)
         WHERE pr.route_id = ? AND pr.user_id = ?`,
        [routeId, user_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!route) {
      return res.status(404).json({ error: 'Route not found.' });
    }

    return res.status(200).json({ route });
  } catch (err) {
    console.error('❌ [Parent] getRouteDetail error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch route details.' });
  }
};

/**
 * DELETE /api/parent/routes/:routeId
 * Deletes a saved route from the parent's profile and DB.
 */
const deleteRoute = async (req, res) => {
  const { user_id } = req.user;
  const { routeId } = req.params;

  try {
    const result = await new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM parent_routes WHERE route_id = ? AND user_id = ?`,
        [routeId, user_id],
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Route not found.' });
    }

    return res.status(200).json({ message: 'Route deleted successfully.' });
  } catch (err) {
    console.error('❌ [Parent] deleteRoute error:', err.message);
    return res.status(500).json({ error: 'Failed to delete route.' });
  }
};

/**
 * GET /api/parent/slots/search?slot_no=...
 * Searches for a slot by number. Returns slot info if it exists.
 */
const searchSlot = async (req, res) => {
  const { slot_no } = req.query;

  if (!slot_no) {
    return res.status(400).json({ error: 'slot_no query parameter is required.' });
  }

  const slotNoInt = Number(slot_no);
  if (!Number.isSafeInteger(slotNoInt) || slotNoInt < 1) {
    return res.status(400).json({ found: false, error: 'Invalid slot number.' });
  }

  try {
    const slot = await new Promise((resolve, reject) => {
      db.get(
        `SELECT ss.slot_no, ss.slot_name, ss.vehicle_id,
                v.vehicle_name,
                GROUP_CONCAT(s.school_name, ', ') AS school_names
         FROM service_slots ss
         LEFT JOIN vehicles v ON v.vehicle_id = ss.vehicle_id
         LEFT JOIN service_slot_schools sss ON sss.slot_no = ss.slot_no
         LEFT JOIN schools s ON s.school_id = sss.school_id
         WHERE ss.slot_no = ?
         GROUP BY ss.slot_no`,
        [slotNoInt],
        (err, row) => err ? reject(err) : resolve(row));
    });

    if (!slot) {
      return res.status(200).json({ found: false });
    }

    return res.status(200).json({
      found: true,
      slot: {
        slot_no: slot.slot_no,
        slot_name: slot.slot_name || `SLOT-${String(slot.slot_no).padStart(3, '0')}`,
        vehicle_id: slot.vehicle_id,
        vehicle_name: slot.vehicle_name,
        school_names: slot.school_names,
      }
    });
  } catch (err) {
    console.error('❌ [Parent] searchSlot error:', err.message);
    return res.status(500).json({ error: 'Failed to search for slot.' });
  }
};

module.exports = { getSchools, getVehicles, updateProfile, getProfile, trackVehicle, createRoute, getRoutes, getRouteDetail, deleteRoute, searchSlot };
