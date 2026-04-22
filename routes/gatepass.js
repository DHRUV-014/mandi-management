const express = require('express');
const { requireAuth, requireFYDB, requireSuperAdmin } = require('./middleware');
const { getFYPoolForDate } = require('../database');
const router = express.Router();

// Build gate pass number: {PREFIX}{G}{YY}{NNNNNN}  e.g. "AZ126000001"
function buildGPNumber(prefix, gate, yy, seq) {
  return `${prefix}${gate}${String(yy).padStart(2,'0')}${String(seq).padStart(6,'0')}`;
}

function gpPrefix(mandiPrefix, gate, yy) {
  return `${mandiPrefix}${gate}${String(yy).padStart(2,'0')}`;
}

// GET /api/gate-pass/next-number?gate=1
router.get('/next-number', requireAuth, requireFYDB, async (req, res) => {
  const gate = Math.max(1, Math.min(9, parseInt(req.query.gate) || 1));
  const prefix = req.mandi?.prefix || 'XX';
  const yy = parseInt(String(new Date().getFullYear()).slice(-2));
  const gpPfx = gpPrefix(prefix, gate, yy);
  try {
    const [[row]] = await req.fyDb.execute(
      'SELECT MAX(CAST(RIGHT(gate_pass_number, 6) AS UNSIGNED)) AS max_seq FROM gate_passes WHERE gate_pass_number LIKE ?',
      [`${gpPfx}%`]
    );
    const seq = (row.max_seq || 0) + 1;
    res.json({ next: buildGPNumber(prefix, gate, yy, seq) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get next number' });
  }
});

// GET /api/gate-pass/check/:num
router.get('/check/:num', requireAuth, requireFYDB, async (req, res) => {
  const num = req.params.num;
  if (!num) return res.json({ exists: false });
  try {
    const [rows] = await req.fyDb.execute('SELECT id FROM gate_passes WHERE gate_pass_number = ?', [num]);
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Check failed' });
  }
});

// GET /api/gate-pass/search?num=AZ126000001
router.get('/search', requireAuth, requireFYDB, async (req, res) => {
  const num = req.query.num;
  if (!num) return res.status(400).json({ error: 'Gate pass number is required' });
  try {
    const [rows] = await req.fyDb.execute('SELECT id FROM gate_passes WHERE gate_pass_number = ?', [num]);
    if (!rows.length) return res.status(404).json({ error: `Gate Pass ${num} not found` });
    res.json({ id: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/gate-pass/save
router.post('/save', requireAuth, requireFYDB, async (req, res) => {
  const { date, time, items, vehicle_type_id, vehicle_number, state_code, state_name, builty_no, gate_number } = req.body;
  const gate = Math.max(1, Math.min(9, parseInt(gate_number) || 1));
  const prefix = req.mandi?.prefix || 'XX';

  if (!items || items.length === 0)
    return res.status(400).json({ error: 'At least one line item is required' });

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.trader_id)    return res.status(400).json({ error: `Row ${i + 1}: trader is required` });
    if (!it.commodity_id) return res.status(400).json({ error: `Row ${i + 1}: commodity is required` });
    if (!it.unit)         return res.status(400).json({ error: `Row ${i + 1}: unit is required` });
    if (!it.number_of_bags || it.number_of_bags <= 0)
      return res.status(400).json({ error: `Row ${i + 1}: number of bags must be a positive number` });
    if (it.weight_per_bag == null || it.weight_per_bag < 0)
      return res.status(400).json({ error: `Row ${i + 1}: weight per bag must be 0 or greater` });
  }

  // Date-based FY routing: pick the FY whose from/to covers the entry's date.
  // Falls back to the active FY if no FY covers the date (then validates the range).
  const gpDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : new Date().toISOString().slice(0, 10);
  let targetPool = null;
  let targetFYCode = null;
  try {
    const match = await getFYPoolForDate(req.mandi.id, gpDate);
    if (match) { targetPool = match.pool; targetFYCode = match.code; }
  } catch (err) { console.error('FY routing failed:', err); }

  if (!targetPool) {
    // No FY covers that date — reject with a clear message including the active FY range.
    try {
      const [[fyRow]] = await req.mainDb.execute(
        'SELECT from_date, to_date FROM financial_years WHERE mandi_id = ? AND code = ?',
        [req.mandi.id, req.mandi.active_fy]
      );
      if (fyRow && fyRow.from_date && fyRow.to_date) {
        const from = String(fyRow.from_date).slice(0, 10);
        const to   = String(fyRow.to_date).slice(0, 10);
        return res.status(400).json({
          error: `Date ${gpDate} is outside all configured financial years. Active FY is ${from} → ${to}. Ask superadmin to extend or create a new FY.`,
          fy_error: true,
        });
      }
    } catch (_) {}
    return res.status(400).json({
      error: `No financial year is configured for date ${gpDate}. Contact superadmin.`,
      fy_error: true,
    });
  }

  // Validate traders against the TARGET FY (same DB we'll insert into)
  try {
    for (let i = 0; i < items.length; i++) {
      const [rows] = await targetPool.execute('SELECT trader_name, status FROM traders WHERE id = ?', [items[i].trader_id]);
      if (!rows.length) return res.status(400).json({ error: `Row ${i + 1}: trader not found in FY ${targetFYCode}` });
      if (rows[0].status === 'banned') return res.status(400).json({ error: `Row ${i + 1}: trader "${rows[0].trader_name}" is banned` });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Validation failed' });
  }

  let createdAt = null;
  if (date && time && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) {
    createdAt = `${date} ${time}:00`;
  }

  const refDate = createdAt ? new Date(createdAt) : new Date();
  const yy = parseInt(String(refDate.getFullYear()).slice(-2));
  const gpPfx = gpPrefix(prefix, gate, yy);

  const vehNum   = vehicle_number ? String(vehicle_number).trim().toUpperCase() : null;
  const stCode   = vehNum && state_code  ? String(state_code).trim().toUpperCase() : null;
  const stName   = vehNum && state_name  ? String(state_name).trim()               : null;
  const builtyNo = builty_no ? String(builty_no).trim() : null;

  const conn = await targetPool.getConnection();
  try {
    await conn.beginTransaction();

    const [[seqRow]] = await conn.execute(
      'SELECT MAX(CAST(RIGHT(gate_pass_number, 6) AS UNSIGNED)) AS max_seq FROM gate_passes WHERE gate_pass_number LIKE ? FOR UPDATE',
      [`${gpPfx}%`]
    );
    const seq = (seqRow.max_seq || 0) + 1;
    const gate_pass_number = buildGPNumber(prefix, gate, yy, seq);

    const [gpResult] = await conn.execute(
      `INSERT INTO gate_passes (gate_pass_number, trader_id, vehicle_type_id, vehicle_number, state_code, state_name, builty_no, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [gate_pass_number, items[0].trader_id, vehicle_type_id || null, vehNum, stCode, stName, builtyNo, createdAt || new Date()]
    );
    const gate_pass_id = gpResult.insertId;

    for (const it of items) {
      await conn.execute(
        'INSERT INTO gate_pass_items (gate_pass_id, trader_id, commodity_id, unit, number_of_bags, weight_per_bag) VALUES (?, ?, ?, ?, ?, ?)',
        [gate_pass_id, it.trader_id, it.commodity_id, it.unit, it.number_of_bags, it.weight_per_bag || 0]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, gate_pass_number, gate_pass_id });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Gate pass number conflict, please try again' });
    } else {
      res.status(500).json({ error: 'Failed to save gate pass' });
    }
  } finally {
    conn.release();
  }
});

// GET /api/gate-pass/all
router.get('/all', requireAuth, requireFYDB, async (req, res) => {
  try {
    const [passes] = await req.fyDbRead.execute(`
      SELECT
        gp.id,
        gp.gate_pass_number,
        gp.created_at,
        gp.vehicle_type_id,
        gp.vehicle_number,
        gp.state_code,
        gp.state_name,
        gp.builty_no,
        vt.name                              AS vehicle_type_name,
        vt.charges                           AS vehicle_charges,
        COUNT(gpi.id)                        AS item_count,
        GROUP_CONCAT(DISTINCT t.trader_name) AS trader_names
      FROM gate_passes gp
      LEFT JOIN gate_pass_items gpi ON gpi.gate_pass_id = gp.id
      LEFT JOIN traders t           ON t.id = gpi.trader_id
      LEFT JOIN vehicle_types vt    ON vt.id = gp.vehicle_type_id
      GROUP BY gp.id
      ORDER BY gp.created_at DESC, gp.id DESC
    `);
    res.json(passes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load gate passes' });
  }
});

// GET /api/gate-pass/:id/items
router.get('/:id/items', requireAuth, requireFYDB, async (req, res) => {
  const { id } = req.params;
  try {
    const [gpRows] = await req.fyDbRead.execute(`
      SELECT gp.id, gp.gate_pass_number, gp.created_at, gp.vehicle_type_id,
             gp.vehicle_number, gp.state_code, gp.state_name, gp.builty_no,
             vt.name AS vehicle_type_name, vt.charges AS vehicle_charges
      FROM gate_passes gp
      LEFT JOIN vehicle_types vt ON vt.id = gp.vehicle_type_id
      WHERE gp.id = ?
    `, [id]);
    if (!gpRows.length) return res.status(404).json({ error: 'Gate pass not found' });

    const [items] = await req.fyDbRead.execute(`
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
    `, [id]);

    res.json({ ...gpRows[0], items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load gate pass' });
  }
});

// DELETE /api/gate-pass/:id — superadmin only
router.delete('/:id', requireSuperAdmin, requireFYDB, async (req, res) => {
  const { id } = req.params;
  const conn = await req.fyDbRead.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM gate_pass_items WHERE gate_pass_id = ?', [id]);
    const [result] = await conn.execute('DELETE FROM gate_passes WHERE id = ?', [id]);
    await conn.commit();
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Gate pass not found' });
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to delete gate pass' });
  } finally {
    conn.release();
  }
});

module.exports = router;
