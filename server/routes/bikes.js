// ─── server/routes/bikes.js ──────────────────────────────────────────────────
// Full CRUD for bike models
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const pool    = require('../db');
const router  = express.Router();

// ── GET /api/bikes ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, COUNT(p.part_id) AS part_count
      FROM bikes b
      LEFT JOIN parts p ON p.bike_id = b.bike_id
      GROUP BY b.bike_id
      ORDER BY b.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Get bikes error:', err);
    res.status(500).json({ error: 'Failed to fetch bikes.' });
  }
});

// ── GET /api/bikes/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bikes WHERE bike_id=$1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Bike not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bike.' });
  }
});

// ── POST /api/bikes ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, company, model, year, cc, notes } = req.body;
    if (!name || !company)
      return res.status(400).json({ error: 'Name and company are required.' });

    const { rows } = await pool.query(
      `INSERT INTO bikes (name, company, model, year, cc, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name.trim(), company.trim(), model || null, year || null, cc || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Add bike error:', err);
    res.status(500).json({ error: 'Failed to add bike.' });
  }
});

// ── PUT /api/bikes/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, company, model, year, cc, notes } = req.body;
    if (!name || !company)
      return res.status(400).json({ error: 'Name and company are required.' });

    const { rows } = await pool.query(
      `UPDATE bikes SET name=$1, company=$2, model=$3, year=$4, cc=$5, notes=$6
       WHERE bike_id=$7 RETURNING *`,
      [name.trim(), company.trim(), model || null, year || null, cc || null, notes || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Bike not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bike.' });
  }
});

// ── DELETE /api/bikes/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM bikes WHERE bike_id=$1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Bike not found.' });
    res.json({ message: 'Bike deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bike.' });
  }
});

module.exports = router;
