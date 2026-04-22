const express = require('express');
const { requireAuth, requireFYDB } = require('./middleware');
const { getFYPoolForDate } = require('../database');
const router = express.Router();

// Helper: pick pool for a specific date (rates + by-date reads follow the same
// entry-date → FY routing as gate pass writes; falls back to req.fyDbRead).
async function poolForDate(req, dateStr) {
  if (req.mandi && dateStr) {
    const match = await getFYPoolForDate(req.mandi.id, dateStr);
    if (match) return match.pool;
  }
  return req.fyDbRead;
}

// GET commodities that arrived on a given date + any existing rates
router.get('/by-date', requireAuth, requireFYDB, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  try {
    const pool = await poolForDate(req, date);
    const [commodities] = await pool.execute(`
      SELECT DISTINCT
        c.id,
        c.name AS commodity_name,
        c.short_name,
        c.unit
      FROM gate_pass_items gpi
      JOIN gate_passes gp ON gp.id = gpi.gate_pass_id
      JOIN commodities c  ON c.id  = gpi.commodity_id
      WHERE DATE(gp.created_at) = ?
      ORDER BY c.name
    `, [date]);

    if (commodities.length === 0) return res.json({ commodities: [], rates: {} });

    const [existing] = await pool.execute('SELECT commodity_id, rate FROM commodity_rates WHERE date = ?', [date]);
    const rates = {};
    existing.forEach(r => { rates[r.commodity_id] = r.rate; });

    res.json({ commodities, rates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load rates' });
  }
});

// GET all commodities + any existing rates for a date (for rate entry page — shows all, not just gate-pass filtered)
router.get('/all-commodities', requireAuth, requireFYDB, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  try {
    const pool = await poolForDate(req, date);
    const [commodities] = await pool.execute(
      'SELECT id, name AS commodity_name, short_name, unit FROM commodities ORDER BY name'
    );

    if (commodities.length === 0) return res.json({ commodities: [], rates: {}, arrived: [] });

    const [existing] = await pool.execute(
      'SELECT commodity_id, rate FROM commodity_rates WHERE date = ?', [date]
    );
    const rates = {};
    existing.forEach(r => { rates[r.commodity_id] = r.rate; });

    // Flag which commodities actually had gate passes on this date
    const [arrivedRows] = await pool.execute(`
      SELECT DISTINCT gpi.commodity_id
      FROM gate_pass_items gpi
      JOIN gate_passes gp ON gp.id = gpi.gate_pass_id
      WHERE DATE(gp.created_at) = ?
    `, [date]);
    const arrived = arrivedRows.map(r => r.commodity_id);

    res.json({ commodities, rates, arrived });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load commodities' });
  }
});

// POST — save rates for a date (routed to the FY covering `date`)
router.post('/save', requireAuth, requireFYDB, async (req, res) => {
  const { date, rates } = req.body;
  if (!date || !rates || typeof rates !== 'object')
    return res.status(400).json({ error: 'date and rates are required' });

  try {
    const match = req.mandi ? await getFYPoolForDate(req.mandi.id, date) : null;
    if (!match) {
      return res.status(400).json({
        error: `Date ${date} is outside all configured financial years. Ask superadmin to create or extend an FY.`,
        fy_error: true,
      });
    }
    for (const [commodity_id, rate] of Object.entries(rates)) {
      const r = parseFloat(rate);
      if (!isNaN(r) && r >= 0) {
        await match.pool.execute(
          'INSERT INTO commodity_rates (date, commodity_id, rate) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rate = VALUES(rate)',
          [date, parseInt(commodity_id), r]
        );
      }
    }
    res.json({ success: true, fy_code: match.code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save rates' });
  }
});

// GET saved rates for a date range (historical read)
router.get('/range', requireAuth, requireFYDB, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  try {
    const [rows] = await req.fyDbRead.execute(`
      SELECT cr.date, c.name AS commodity_name, c.short_name, c.unit, cr.rate
      FROM commodity_rates cr
      JOIN commodities c ON c.id = cr.commodity_id
      WHERE cr.date BETWEEN ? AND ?
      ORDER BY cr.date, c.name
    `, [from, to]);
    res.json({ rates: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load rates' });
  }
});

// GET rates history — dates that have rates saved, with per-date detail
router.get('/history', requireAuth, requireFYDB, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  try {
    const [rows] = await req.fyDbRead.execute(`
      SELECT
        cr.date,
        COUNT(*) AS commodity_count,
        MIN(cr.rate) AS min_rate,
        MAX(cr.rate) AS max_rate
      FROM commodity_rates cr
      WHERE cr.date BETWEEN ? AND ?
      GROUP BY cr.date
      ORDER BY cr.date DESC
    `, [from, to]);

    const detail = {};
    for (const row of rows) {
      const [items] = await req.fyDbRead.execute(`
        SELECT c.name AS commodity_name, c.short_name, c.unit, cr.rate
        FROM commodity_rates cr
        JOIN commodities c ON c.id = cr.commodity_id
        WHERE cr.date = ?
        ORDER BY c.name
      `, [row.date]);
      detail[row.date] = items;
    }

    res.json({ dates: rows, detail });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load rate history' });
  }
});

module.exports = router;
