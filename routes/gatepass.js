const express = require('express');
const db = require('../database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// GET /api/gate-pass/next-number
router.get('/next-number', requireAuth, (req, res) => {
  const row = db.prepare('SELECT MAX(gate_pass_number) as max_num FROM gate_passes').get();
  res.json({ next: (row.max_num || 0) + 1 });
});

// GET /api/gate-pass/search?num=5
router.get('/search', requireAuth, (req, res) => {
  const num = parseInt(req.query.num, 10);
  if (!num) return res.status(400).json({ error: 'Gate pass number is required' });
  const row = db.prepare('SELECT id FROM gate_passes WHERE gate_pass_number = ?').get(num);
  if (!row) return res.status(404).json({ error: `Gate Pass #${num} not found` });
  res.json({ id: row.id });
});

// POST /api/gate-pass/save
router.post('/save', requireAuth, (req, res) => {
  const { date, time, items, vehicle_type_id, vehicle_number, state_code, state_name, builty_no } = req.body;

  if (!items || items.length === 0)
    return res.status(400).json({ error: 'At least one line item is required' });

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.trader_id)
      return res.status(400).json({ error: `Row ${i + 1}: trader is required` });
    if (!it.commodity_id)
      return res.status(400).json({ error: `Row ${i + 1}: commodity is required` });
    if (!it.unit)
      return res.status(400).json({ error: `Row ${i + 1}: unit is required` });
    if (!it.number_of_bags || it.number_of_bags <= 0)
      return res.status(400).json({ error: `Row ${i + 1}: number of bags must be a positive number` });
    if (it.weight_per_bag == null || it.weight_per_bag < 0)
      return res.status(400).json({ error: `Row ${i + 1}: weight per bag must be 0 or greater` });
  }

  // Server-side: validate all traders are active (not banned)
  for (let i = 0; i < items.length; i++) {
    const trader = db.prepare('SELECT trader_name, status FROM traders WHERE id = ?').get(items[i].trader_id);
    if (!trader) return res.status(400).json({ error: `Row ${i + 1}: trader not found` });
    if (trader.status === 'banned') return res.status(400).json({ error: `Row ${i + 1}: trader "${trader.trader_name}" is banned` });
  }

  // Build created_at from user-supplied date + time, or fall back to current datetime
  let createdAt = null;
  if (date && time && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) {
    createdAt = `${date} ${time}:00`;
  }

  // Normalise vehicle/state fields
  const vehNum   = vehicle_number ? String(vehicle_number).trim().toUpperCase() : null;
  const stCode   = vehNum && state_code ? String(state_code).trim().toUpperCase() : null;
  const stName   = vehNum && state_name ? String(state_name).trim()               : null;

  const builtyNo = builty_no ? String(builty_no).trim() : null;

  const save = db.transaction(() => {
    const row = db.prepare('SELECT MAX(gate_pass_number) as max_num FROM gate_passes').get();
    const gate_pass_number = (row.max_num || 0) + 1;

    const gpResult = createdAt
      ? db.prepare(
          "INSERT INTO gate_passes (gate_pass_number, trader_id, vehicle_type_id, vehicle_number, state_code, state_name, builty_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(gate_pass_number, items[0].trader_id, vehicle_type_id || null, vehNum, stCode, stName, builtyNo, createdAt)
      : db.prepare(
          "INSERT INTO gate_passes (gate_pass_number, trader_id, vehicle_type_id, vehicle_number, state_code, state_name, builty_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))"
        ).run(gate_pass_number, items[0].trader_id, vehicle_type_id || null, vehNum, stCode, stName, builtyNo);

    const gate_pass_id = gpResult.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO gate_pass_items
        (gate_pass_id, trader_id, commodity_id, unit, number_of_bags, weight_per_bag)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const it of items) {
      insertItem.run(gate_pass_id, it.trader_id, it.commodity_id, it.unit, it.number_of_bags, it.weight_per_bag || 0);
    }

    return { gate_pass_id, gate_pass_number };
  });

  try {
    const result = save();
    res.status(201).json({ success: true, gate_pass_number: result.gate_pass_number, gate_pass_id: result.gate_pass_id });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Gate pass number conflict, please try again' });
    } else {
      res.status(500).json({ error: 'Failed to save gate pass' });
    }
  }
});

// GET /api/gate-pass/all
router.get('/all', requireAuth, (req, res) => {
  const passes = db.prepare(`
    SELECT
      gp.id,
      gp.gate_pass_number,
      gp.created_at,
      gp.vehicle_type_id,
      gp.vehicle_number,
      gp.state_code,
      gp.state_name,
      gp.builty_no,
      vt.name                                AS vehicle_type_name,
      vt.charges                             AS vehicle_charges,
      COUNT(gpi.id)                          AS item_count,
      GROUP_CONCAT(DISTINCT t.trader_name)   AS trader_names
    FROM gate_passes gp
    LEFT JOIN gate_pass_items gpi ON gpi.gate_pass_id = gp.id
    LEFT JOIN traders t            ON t.id = gpi.trader_id
    LEFT JOIN vehicle_types vt     ON vt.id = gp.vehicle_type_id
    GROUP BY gp.id
    ORDER BY gp.gate_pass_number DESC
  `).all();
  res.json(passes);
});

// GET /api/gate-pass/:id/items
router.get('/:id/items', requireAuth, (req, res) => {
  const { id } = req.params;

  const gp = db.prepare(`
    SELECT gp.id, gp.gate_pass_number, gp.created_at, gp.vehicle_type_id,
           gp.vehicle_number, gp.state_code, gp.state_name, gp.builty_no,
           vt.name AS vehicle_type_name, vt.charges AS vehicle_charges
    FROM gate_passes gp
    LEFT JOIN vehicle_types vt ON vt.id = gp.vehicle_type_id
    WHERE gp.id = ?
  `).get(id);
  if (!gp) return res.status(404).json({ error: 'Gate pass not found' });

  const items = db.prepare(`
    SELECT
      gpi.id,
      gpi.unit,
      gpi.number_of_bags,
      gpi.weight_per_bag,
      ROUND(gpi.number_of_bags * gpi.weight_per_bag, 2) AS total_weight,
      c.name  AS commodity_name,
      c.short_name,
      t.trader_name,
      t.shop_number
    FROM gate_pass_items gpi
    JOIN commodities c ON c.id = gpi.commodity_id
    JOIN traders t     ON t.id = gpi.trader_id
    WHERE gpi.gate_pass_id = ?
    ORDER BY gpi.id
  `).all(id);

  res.json({ ...gp, items });
});

// DELETE /api/gate-pass/:id
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const del = db.transaction(() => {
    db.prepare('DELETE FROM gate_pass_items WHERE gate_pass_id = ?').run(id);
    return db.prepare('DELETE FROM gate_passes WHERE id = ?').run(id).changes;
  });
  const changes = del();
  if (changes === 0) return res.status(404).json({ error: 'Gate pass not found' });
  res.json({ success: true });
});

module.exports = router;
