// ─── server/routes/parts.js ──────────────────────────────────────────────────
// Full CRUD + Search + Low Stock
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const pool    = require('../db');
const router  = express.Router();

// ── GET /api/parts/categories ─────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

// ── GET /api/parts/low-stock ──────────────────────────────────────────────────
router.get('/low-stock', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, b.name AS bike_name, c.name AS category_name
      FROM parts p
      LEFT JOIN bikes b ON b.bike_id = p.bike_id
      LEFT JOIN categories c ON c.cat_id = p.category_id
      WHERE p.quantity <= p.min_quantity
      ORDER BY p.quantity ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch low stock.' });
  }
});

// ── GET /api/parts/search?q= ──────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const pattern = `%${q}%`;
    const { rows } = await pool.query(`
      SELECT p.*, b.name AS bike_name, c.name AS category_name
      FROM parts p
      LEFT JOIN bikes b ON b.bike_id = p.bike_id
      LEFT JOIN categories c ON c.cat_id = p.category_id
      WHERE p.name ILIKE $1 OR p.part_number ILIKE $1 OR p.rack ILIKE $1
      ORDER BY p.name ASC
      LIMIT 30
    `, [pattern]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ── GET /api/parts — paginated ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const limit    = 50;
    const offset   = (page - 1) * limit;
    const bikeId   = req.query.bike_id   || null;
    const catId    = req.query.cat_id    || null;
    const search   = req.query.search    || null;

    // Build dynamic WHERE clause
    const conditions = [];
    const params     = [];
    let   idx        = 1;

    if (bikeId)  { conditions.push(`p.bike_id=$${idx++}`);        params.push(bikeId); }
    if (catId)   { conditions.push(`p.category_id=$${idx++}`);    params.push(catId); }
    if (search)  { conditions.push(`(p.name ILIKE $${idx} OR p.part_number ILIKE $${idx})`);
                   params.push(`%${search}%`); idx++; }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM parts p ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count);

    const dataParams = [...params, limit, offset];
    const { rows } = await pool.query(`
      SELECT p.*, b.name AS bike_name, c.name AS category_name
      FROM parts p
      LEFT JOIN bikes b ON b.bike_id = p.bike_id
      LEFT JOIN categories c ON c.cat_id = p.category_id
      ${where}
      ORDER BY p.name ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, dataParams);

    res.json({ parts: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Get parts error:', err);
    res.status(500).json({ error: 'Failed to fetch parts.' });
  }
});

// ── GET /api/parts/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, b.name AS bike_name, c.name AS category_name
      FROM parts p
      LEFT JOIN bikes b ON b.bike_id = p.bike_id
      LEFT JOIN categories c ON c.cat_id = p.category_id
      WHERE p.part_id=$1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Part not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch part.' });
  }
});

// ── POST /api/parts ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      name, part_number, bike_id, category_id, subcategory,
      rack, shelf, box, quantity, min_quantity, price, supplier, notes
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Part name is required.' });

    const { rows } = await pool.query(`
      INSERT INTO parts
        (name, part_number, bike_id, category_id, subcategory, rack, shelf, box,
         quantity, min_quantity, price, supplier, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      name.trim(), part_number || null, bike_id || null, category_id || null,
      subcategory || null, rack || null, shelf || null, box || null,
      parseInt(quantity) || 0, parseInt(min_quantity) || 5,
      parseFloat(price) || 0, supplier || null, notes || null
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Add part error:', err);
    res.status(500).json({ error: 'Failed to add part.' });
  }
});

// ── PUT /api/parts/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const {
      name, part_number, bike_id, category_id, subcategory,
      rack, shelf, box, quantity, min_quantity, price, supplier, notes
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Part name is required.' });

    const { rows } = await pool.query(`
      UPDATE parts SET
        name=$1, part_number=$2, bike_id=$3, category_id=$4, subcategory=$5,
        rack=$6, shelf=$7, box=$8, quantity=$9, min_quantity=$10,
        price=$11, supplier=$12, notes=$13, updated_at=NOW()
      WHERE part_id=$14 RETURNING *
    `, [
      name.trim(), part_number || null, bike_id || null, category_id || null,
      subcategory || null, rack || null, shelf || null, box || null,
      parseInt(quantity) || 0, parseInt(min_quantity) || 5,
      parseFloat(price) || 0, supplier || null, notes || null, req.params.id
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Part not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update part.' });
  }
});

// ── PATCH /api/parts/:id/qty ──────────────────────────────────────────────────
router.patch('/:id/qty', async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined || isNaN(quantity))
      return res.status(400).json({ error: 'Quantity is required.' });

    const { rows } = await pool.query(
      'UPDATE parts SET quantity=$1, updated_at=NOW() WHERE part_id=$2 RETURNING *',
      [parseInt(quantity), req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Part not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update quantity.' });
  }
});

// ── DELETE /api/parts/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM parts WHERE part_id=$1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Part not found.' });
    res.json({ message: 'Part deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete part.' });
  }
});

module.exports = router;
