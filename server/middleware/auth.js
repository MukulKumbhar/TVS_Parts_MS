// ─── server/middleware/auth.js ───────────────────────────────────────────────
// JWT verification middleware — protects all routes except login/register
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  // Expect: "Authorization: Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded user payload { user_id, username, role }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

// Role-based guard — use after verifyToken
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions.' });
  }
  next();
};

module.exports = { verifyToken, requireRole };
