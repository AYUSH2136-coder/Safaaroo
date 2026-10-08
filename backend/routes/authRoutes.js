
const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/register — Register a new user (any role)
router.post('/register', register);

// POST /api/auth/login — Login and receive JWT
router.post('/login', login);

// GET /api/auth/me — Get own profile (protected)
router.get('/me', authenticateToken, getMe);

module.exports = router;
