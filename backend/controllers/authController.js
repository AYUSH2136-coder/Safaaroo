
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'safaaroo_fallback_secret';
const JWT_EXPIRES_IN = '24h';

/**
 * POST /api/auth/register
 * Body: { name, mobile, password, role, student_name? }
 */
const register = async (req, res) => {
  const { name, mobile, password, role, student_name } = req.body;

  // ── Validation ──────────────────────────────────────────────────────────
  if (!name || !mobile || !password || !role) {
    return res.status(400).json({ error: 'Name, mobile, password and role are required.' });
  }
  if (!['operator', 'driver', 'parent'].includes(role)) {
    return res.status(400).json({ error: 'Role must be operator, driver, or parent.' });
  }
  if (role === 'parent' && !student_name) {
    return res.status(400).json({ error: 'Student name is required for parent registration.' });
  }

  try {
    // ── Hash password ────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // ── Insert into users table ─────────────────────────────────────────
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO users (user_id, name, mobile, password, role) VALUES (?, ?, ?, ?, ?)`,
        [userId, name.trim(), mobile.trim(), hashedPassword, role],
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    // ── Insert into role-specific profile table ─────────────────────────
    const profileId = uuidv4();

    if (role === 'parent') {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO parent_profiles (profile_id, user_id, student_name) VALUES (?, ?, ?)`,
          [profileId, userId, student_name.trim()],
          function (err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
    } else if (role === 'driver') {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO driver_profiles (profile_id, user_id) VALUES (?, ?)`,
          [profileId, userId],
          function (err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
    }
    // Operator: no extra profile table needed

    // ── Issue JWT ────────────────────────────────────────────────────────
    const token = jwt.sign({ user_id: userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: 'Registration successful.',
      token,
      user: { user_id: userId, name: name.trim(), mobile: mobile.trim(), role }
    });

  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Mobile number already registered.' });
    }
    console.error('❌ [Auth] Register error:', err.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

/**
 * POST /api/auth/login
 * Body: { mobile, password }
 */
const login = async (req, res) => {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    return res.status(400).json({ error: 'Mobile and password are required.' });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT user_id, name, mobile, password, role FROM users WHERE mobile = ?`,
        [mobile.trim()],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid mobile number or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid mobile number or password.' });
    }

    const token = jwt.sign({ user_id: user.user_id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: { user_id: user.user_id, name: user.name, mobile: user.mobile, role: user.role }
    });

  } catch (err) {
    console.error('❌ [Auth] Login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

/**
 * GET /api/auth/me
 * Returns the logged-in user's profile + role-specific data
 */
const getMe = async (req, res) => {
  const { user_id, role } = req.user;

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT user_id, name, mobile, role, created_at FROM users WHERE user_id = ?`,
        [user_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!user) return res.status(404).json({ error: 'User not found.' });

    let profile = null;
    if (role === 'parent') {
      profile = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM parent_profiles WHERE user_id = ?`, [user_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    } else if (role === 'driver') {
      profile = await new Promise((resolve, reject) => {
        db.get(
          `SELECT dp.*, v.vehicle_id, ss.slot_no, v.vehicle_name 
           FROM driver_profiles dp
           LEFT JOIN vehicles v ON dp.vehicle_id = v.vehicle_id AND v.driver_id = dp.user_id
           LEFT JOIN service_slots ss ON ss.vehicle_id = v.vehicle_id
           WHERE dp.user_id = ?`,
          [user_id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
    }

    return res.status(200).json({ user, profile });
  } catch (err) {
    console.error('❌ [Auth] getMe error:', err.message);
    return res.status(500).json({ error: 'Could not fetch profile.' });
  }
};

module.exports = { register, login, getMe };
