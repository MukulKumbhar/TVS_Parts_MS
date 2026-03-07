// ─── server/routes/sales.js ──────────────────────────────────────────────────
// Dashboard stats, trends, monthly comparison, daily report
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const pool    = require('../db');
const router  = express.Router();

// ── GET /api/sales/today ──────────────────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [salesRes, billsRes, stockRes, lowRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total),0) AS total_sales,
                         COUNT(*) AS bill_count
                  FROM bills WHERE date=$1`, [today]),
      pool.query(`SELECT COALESCE(SUM(bi.quantity),0) AS items_sold
                  FROM bill_items bi
                  JOIN bills b ON b.bill_id=bi.bill_id
                  WHERE b.date=$1`, [today]),
      pool.query(`SELECT COALESCE(SUM(quantity),0) AS total_stock FROM parts`),
      pool.query(`SELECT COUNT(*) AS low_count FROM parts WHERE quantity <= min_quantity`)
    ]);

    res.json({
      total_sales:  parseFloat(salesRes.rows[0].total_sales),
      bill_count:   parseInt(salesRes.rows[0].bill_count),
      items_sold:   parseInt(billsRes.rows[0].items_sold),
      total_stock:  parseInt(stockRes.rows[0].total_stock),
      low_stock_count: parseInt(lowRes.rows[0].low_count)
    });
  } catch (err) {
    console.error('Today stats error:', err);
    res.status(500).json({ error: 'Failed to fetch today stats.' });
  }
});

// ── GET /api/sales/trend?days=7 ───────────────────────────────────────────────
router.get('/trend', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const { rows } = await pool.query(`
      SELECT date::text,
             COALESCE(SUM(total),0) AS total_sales,
             COUNT(*) AS bill_count
      FROM bills
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trend.' });
  }
});

// ── GET /api/sales/monthly ────────────────────────────────────────────────────
router.get('/monthly', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(date, 'Mon YYYY') AS month,
             DATE_TRUNC('month', date) AS month_start,
             COALESCE(SUM(total),0) AS total_sales,
             COUNT(*) AS bill_count
      FROM bills
      WHERE date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY month_start, TO_CHAR(date, 'Mon YYYY')
      ORDER BY month_start ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch monthly data.' });
  }
});

// ── GET /api/sales/report/:date ───────────────────────────────────────────────
router.get('/report/:date', async (req, res) => {
  try {
    const { date } = req.params;

    const [summaryRes, billsRes] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(b.total),0) AS total_sales,
               COUNT(DISTINCT b.bill_id) AS bill_count,
               COALESCE(SUM(bi.quantity),0) AS items_sold
        FROM bills b
        LEFT JOIN bill_items bi ON bi.bill_id=b.bill_id
        WHERE b.date=$1`, [date]),
      pool.query(`
        SELECT b.*, u.name AS created_by_name,
               COUNT(bi.id) AS item_count
        FROM bills b
        LEFT JOIN users u ON u.user_id=b.created_by
        LEFT JOIN bill_items bi ON bi.bill_id=b.bill_id
        WHERE b.date=$1
        GROUP BY b.bill_id, u.name
        ORDER BY b.created_at ASC`, [date])
    ]);

    res.json({
      date,
      summary: summaryRes.rows[0],
      bills:   billsRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report.' });
  }
});

// ── GET /api/sales/recent-bills ───────────────────────────────────────────────
router.get('/recent-bills', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, u.name AS created_by_name, COUNT(bi.id) AS item_count
      FROM bills b
      LEFT JOIN users u ON u.user_id=b.created_by
      LEFT JOIN bill_items bi ON bi.bill_id=b.bill_id
      GROUP BY b.bill_id, u.name
      ORDER BY b.created_at DESC
      LIMIT 5
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recent bills.' });
  }
});

module.exports = router;
