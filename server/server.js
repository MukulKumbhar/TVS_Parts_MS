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

// Trust proxy — required for Render
app.set('trust proxy', 1);

// ── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS — Allow ALL origins ──────────────────────────────────────────────────
app.use(cors());

// ── Body Parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve Static Frontend ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── Health Check ──────────────────────────────────────────────────────────────
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
