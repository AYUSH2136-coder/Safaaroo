
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'safaaroo_fallback_secret';

/**
 * Middleware: Verify JWT token from Authorization header.
 * Attaches req.user = { user_id, role } if valid.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { user_id, role }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

/**
 * Role guard factory. Usage: requireRole('operator')
 * Must be used AFTER authenticateToken in the middleware chain.
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}.` });
    }
    next();
  };
};

module.exports = { authenticateToken, requireRole };
