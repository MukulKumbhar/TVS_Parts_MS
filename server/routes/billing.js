// ─── server/routes/billing.js ────────────────────────────────────────────────
// Bill Create (atomic transaction), View, Delete (restores stock)
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const pool    = require('../db');
const router  = express.Router();

// ── Helper: Generate bill number ──────────────────────────────────────────────
const genBillNumber = () => {
  const d   = new Date();
  const yy  = String(d.getFullYear()).slice(-2);
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const dd  = String(d.getDate()).padStart(2, '0');
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `TVS-${yy}${mm}${dd}-${rnd}`;
};

// ── GET /api/billing — all bills (filter by date) ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { date, from, to } = req.query;
    let where = '';
    const params = [];

    if (date) {
      where = 'WHERE b.date=$1';
      params.push(date);
    } else if (from && to) {
      where = 'WHERE b.date BETWEEN $1 AND $2';
      params.push(from, to);
    }

    const { rows } = await pool.query(`
      SELECT b.*, u.name AS created_by_name,
             COUNT(bi.id) AS item_count
      FROM bills b
      LEFT JOIN users u ON u.user_id = b.created_by
      LEFT JOIN bill_items bi ON bi.bill_id = b.bill_id
      ${where}
      GROUP BY b.bill_id, u.name
      ORDER BY b.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('Get bills error:', err);
    res.status(500).json({ error: 'Failed to fetch bills.' });
  }
});

// ── GET /api/billing/:id — single bill with items ─────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const billRes = await pool.query(`
      SELECT b.*, u.name AS created_by_name
      FROM bills b
      LEFT JOIN users u ON u.user_id = b.created_by
      WHERE b.bill_id=$1
    `, [req.params.id]);

    if (billRes.rows.length === 0)
      return res.status(404).json({ error: 'Bill not found.' });

    const itemsRes = await pool.query(
      'SELECT * FROM bill_items WHERE bill_id=$1 ORDER BY id ASC',
      [req.params.id]
    );

    res.json({ ...billRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bill.' });
  }
});

// ── POST /api/billing — create bill (atomic transaction) ──────────────────────
router.post('/', async (req, res) => {
  const client = await pool.connect(); // Get dedicated client for transaction
  try {
    const { customer_name, phone, items } = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ error: 'At least one item is required.' });

    await client.query('BEGIN');

    // 1. Validate stock for each item
    for (const item of items) {
      if (!item.part_id || !item.quantity || item.quantity < 1)
        throw new Error('Invalid item data.');

      const stockRes = await client.query(
        'SELECT quantity, name FROM parts WHERE part_id=$1 FOR UPDATE', // Lock row
        [item.part_id]
      );
      if (stockRes.rows.length === 0) throw new Error(`Part ID ${item.part_id} not found.`);

      const current = stockRes.rows[0].quantity;
      if (current < item.quantity)
        throw new Error(`Insufficient stock for "${stockRes.rows[0].name}". Available: ${current}`);
    }

    // 2. Calculate total
    const total = items.reduce((sum, i) => sum + (parseFloat(i.price) * parseInt(i.quantity)), 0);

    // 3. Create bill
    const billNumber = genBillNumber();
    const billRes = await client.query(`
      INSERT INTO bills (bill_number, customer_name, phone, total, created_by)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [billNumber, customer_name || 'Walk-in', phone || null, total, req.user.user_id]);

    const bill = billRes.rows[0];

    // 4. Insert items + deduct stock
    for (const item of items) {
      const lineTotal = parseFloat(item.price) * parseInt(item.quantity);

      await client.query(`
        INSERT INTO bill_items (bill_id, part_id, part_name, part_num, quantity, price, total)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [bill.bill_id, item.part_id, item.part_name, item.part_num,
          item.quantity, parseFloat(item.price), lineTotal]);

      await client.query(
        'UPDATE parts SET quantity=quantity-$1, updated_at=NOW() WHERE part_id=$2',
        [item.quantity, item.part_id]
      );
    }

    await client.query('COMMIT');

    // Fetch full bill with items for response
    const itemsRes = await pool.query('SELECT * FROM bill_items WHERE bill_id=$1', [bill.bill_id]);
    res.status(201).json({ ...bill, items: itemsRes.rows });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Billing transaction error:', err);
    res.status(400).json({ error: err.message || 'Billing failed. Transaction rolled back.' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/billing/:id — delete bill & restore stock ─────────────────────
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch items before deleting
    const itemsRes = await client.query(
      'SELECT * FROM bill_items WHERE bill_id=$1', [req.params.id]
    );
    if (itemsRes.rows.length === 0)
      throw new Error('Bill not found or already deleted.');

    // Restore stock
    for (const item of itemsRes.rows) {
      if (item.part_id) {
        await client.query(
          'UPDATE parts SET quantity=quantity+$1, updated_at=NOW() WHERE part_id=$2',
          [item.quantity, item.part_id]
        );
      }
    }

    // Delete bill (CASCADE deletes bill_items)
    await client.query('DELETE FROM bills WHERE bill_id=$1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ message: 'Bill deleted and stock restored.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete bill error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete bill.' });
  } finally {
    client.release();
  }
});

module.exports = router;
