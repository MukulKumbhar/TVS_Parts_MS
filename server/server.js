// ─── server/server.js ────────────────────────────────────────────────────────
// Express app entry point — all routes mounted here
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');

const authRoutes    = require('./routes/auth');
const bikeRoutes    = require('./routes/bikes');
const partsRoutes   = require('./routes/parts');
const billingRoutes = require('./routes/billing');
const salesRoutes   = require('./routes/sales');
const { verifyToken } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false // Disabled so CDN scripts load on frontend
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5500',  // Local dev (Live Server)
  'http://127.0.0.1:5500'
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// ── Body Parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve Static Frontend ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── Health Check (UptimeRobot pings this) ─────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/bikes',   verifyToken, bikeRoutes);
app.use('/api/parts',   verifyToken, partsRoutes);
app.use('/api/billing', verifyToken, billingRoutes);
app.use('/api/sales',   verifyToken, salesRoutes);

// ── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 TVS Parts Server running on port ${PORT}`);
});
