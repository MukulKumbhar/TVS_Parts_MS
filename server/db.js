// ─── server/db.js ───────────────────────────────────────────────────────────
// PostgreSQL connection pool using node-postgres (pg)
// Connects to Supabase via DATABASE_URL environment variable
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
console.log('DB URL:', process.env.DATABASE_URL?.slice(0, 40));g
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Supabase hosted PostgreSQL
  max: 10,                            // Max connections in pool
  idleTimeoutMillis: 30000,           // Close idle connections after 30s
  connectionTimeoutMillis: 2000       // Fail fast if can't connect in 2s
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL (Supabase)');
    release();
  }
});

module.exports = pool;
