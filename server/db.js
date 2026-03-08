const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('❌ Full error:', JSON.stringify(err));
    console.error('❌ DATABASE_URL value:', process.env.DATABASE_URL);
  } else {
    console.log('✅ Connected to PostgreSQL (Supabase)');
    release();
  }
});

module.exports = pool;
