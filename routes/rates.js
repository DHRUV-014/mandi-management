const express = require('express');
const db = require('../database');
const { requireAuth } = require('./middleware');

const router = express.Router();

// GET commodities that arrived on a given date + any existing rates
router.get('/by-date', requireAuth, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  // Distinct commodities that have gate pass items on this date
  const commodities = db.prepare(`
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
  `).all(date);

  if (commodities.length === 0) {
    return res.json({ commodities: [], rates: {} });
  }

  // Existing saved rates for this date
  const existing = db.prepare(`
    SELECT commodity_id, rate FROM commodity_rates WHERE date = ?
  `).all(date);

  const rates = {};
  existing.forEach(r => { rates[r.commodity_id] = r.rate; });

  res.json({ commodities, rates });
});

// POST — save rates for a date
router.post('/save', requireAuth, (req, res) => {
  const { date, rates } = req.body;
  if (!date || !rates || typeof rates !== 'object') {
    return res.status(400).json({ error: 'date and rates are required' });
  }

  const upsert = db.prepare(`
    INSERT INTO commodity_rates (date, commodity_id, rate)
    VALUES (?, ?, ?)
    ON CONFLICT(date, commodity_id) DO UPDATE SET rate = excluded.rate
  `);

  const saveAll = db.transaction(() => {
    for (const [commodity_id, rate] of Object.entries(rates)) {
      const r = parseFloat(rate);
      if (!isNaN(r) && r >= 0) {
        upsert.run(date, parseInt(commodity_id), r);
      }
    }
  });

  saveAll();
  res.json({ success: true });
});

// GET saved rates for a date range (for future use)
router.get('/range', requireAuth, (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const rows = db.prepare(`
    SELECT cr.date, c.name AS commodity_name, c.short_name, c.unit, cr.rate
    FROM commodity_rates cr
    JOIN commodities c ON c.id = cr.commodity_id
    WHERE cr.date BETWEEN ? AND ?
    ORDER BY cr.date, c.name
  `).all(from, to);

  res.json({ rates: rows });
});

module.exports = router;
