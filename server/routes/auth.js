// ─── server/routes/auth.js ───────────────────────────────────────────────────
// Register, Login, Me
// ─────────────────────────────────────────────────────────────────────────────
const express    = require('express');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const pool       = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

// ── Rate limiter: 5 attempts per 15 min per IP ────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, username, password, confirmPassword, role } = req.body;

    if (!name || !username || !password)
      return res.status(400).json({ error: 'Name, username and password are required.' });

    if (password !== confirmPassword)
      return res.status(400).json({ error: 'Passwords do not match.' });

    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    // Check duplicate username
    const exists = await pool.query('SELECT user_id FROM users WHERE username=$1', [username]);
    if (exists.rows.length > 0)
      return res.status(409).json({ error: 'Username already taken.' });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const safeRole = ['admin', 'manager', 'staff'].includes(role) ? role : 'staff';

    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password, role)
       VALUES ($1, $2, $3, $4) RETURNING user_id, name, username, role`,
      [name.trim(), username.trim().toLowerCase(), hashed, safeRole]
    );

    res.status(201).json({ message: 'User created successfully.', user: rows[0] });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required.' });

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username=$1', [username.trim().toLowerCase()]
    );

    if (rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials.' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid)
      return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { user_id: user.user_id, username: user.username, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: { user_id: user.user_id, name: user.name, username: user.username, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT user_id, name, username, role, created_at FROM users WHERE user_id=$1',
      [req.user.user_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

module.exports = router;
