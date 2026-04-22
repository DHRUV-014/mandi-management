const express = require('express');
const mysql   = require('mysql2/promise');
const { requireAuth, requireSuperAdmin } = require('./middleware');
const { createFYDatabase, makeFYCode, getCurrentFYLabel, getCurrentFYYear, getPool, MAIN_DB } = require('../database');
const { broadcastToMandi } = require('../ws');
const router = express.Router();

// GET /api/mandis — list all mandis
router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const [mandis] = await req.mainDb.execute('SELECT * FROM mandis ORDER BY name');
    res.json(mandis);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load mandis' });
  }
});

// GET /api/mandis/mine — get own mandi info including active FY dates
router.get('/mine', requireAuth, async (req, res) => {
  const { mandi_id } = req.session.user;
  if (!mandi_id) return res.json({ mandi: null });
  try {
    const [rows] = await req.mainDb.execute(
      `SELECT m.*, fy.from_date, fy.to_date, fy.fy_label AS fy_label_str
       FROM mandis m
       LEFT JOIN financial_years fy ON fy.mandi_id = m.id AND fy.code = m.active_fy
       WHERE m.id = ?`, [mandi_id]
    );
    res.json({ mandi: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load mandi info' });
  }
});

// POST /api/mandis — add new mandi (superadmin only)
router.post('/', requireSuperAdmin, async (req, res) => {
  const { name, prefix, address_line1, address_line2, phone, license_no } = req.body;
  if (!name || !prefix)
    return res.status(400).json({ error: 'Mandi name and prefix are required' });

  const trimName   = name.trim();
  const trimPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!trimPrefix || trimPrefix.length < 2 || trimPrefix.length > 10)
    return res.status(400).json({ error: 'Prefix must be 2–10 alphanumeric characters (e.g. AZ, NAF)' });

  try {
    const [existing] = await req.mainDb.execute('SELECT id FROM mandis WHERE UPPER(prefix) = ?', [trimPrefix]);
    if (existing.length) return res.status(409).json({ error: 'Mandi prefix already exists' });

    const [result] = await req.mainDb.execute(
      'INSERT INTO mandis (name, prefix, address_line1, address_line2, phone, license_no) VALUES (?, ?, ?, ?, ?, ?)',
      [trimName, trimPrefix, address_line1 || null, address_line2 || null, phone || null, license_no || null]
    );
    const [rows] = await req.mainDb.execute('SELECT * FROM mandis WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create mandi' });
  }
});

// PUT /api/mandis/:id — update mandi info
router.put('/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, address_line1, address_line2, phone, license_no } = req.body;
  if (!name) return res.status(400).json({ error: 'Mandi name is required' });

  try {
    await req.mainDb.execute(
      'UPDATE mandis SET name = ?, address_line1 = ?, address_line2 = ?, phone = ?, license_no = ? WHERE id = ?',
      [name.trim(), address_line1 || null, address_line2 || null, phone || null, license_no || null, id]
    );
    const [rows] = await req.mainDb.execute('SELECT * FROM mandis WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Mandi not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update mandi' });
  }
});

// POST /api/mandis/:id/new-fy — create new financial year database for a mandi
router.post('/:id/new-fy', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { from_date, to_date, fy_label: customLabel } = req.body;

  if (!from_date || !to_date)
    return res.status(400).json({ error: 'From date and to date are required for the financial year' });
  if (from_date >= to_date)
    return res.status(400).json({ error: 'To date must be after from date' });

  try {
    const [mandis] = await req.mainDb.execute('SELECT * FROM mandis WHERE id = ?', [id]);
    if (!mandis.length) return res.status(404).json({ error: 'Mandi not found' });
    const mandi = mandis[0];

    const fromYear = new Date(from_date).getFullYear();
    const toYear   = new Date(to_date).getFullYear();
    const fyYear   = `${String(fromYear).slice(-2)}${String(toYear).slice(-2)}`;
    const fyCode   = makeFYCode(mandi.prefix, fyYear);
    const fyLabel  = customLabel || `${fromYear}-${String(toYear).slice(-2)}`;

    // Check if this FY already exists for this mandi
    const [existing] = await req.mainDb.execute(
      'SELECT id FROM financial_years WHERE mandi_id = ? AND code = ?', [id, fyCode]
    );
    if (existing.length) {
      await req.mainDb.execute('UPDATE mandis SET active_fy = ? WHERE id = ?', [fyCode, id]);
      // Update dates in case they changed
      await req.mainDb.execute(
        'UPDATE financial_years SET from_date = ?, to_date = ? WHERE mandi_id = ? AND code = ?',
        [from_date, to_date, id, fyCode]
      );
      broadcastToMandi(id, {
        type: 'fy-switched',
        mandi_id: Number(id),
        mandi_name: mandi.name,
        fy_code: fyCode,
        fy_label: fyLabel,
        from_date, to_date,
      });
      return res.json({ ok: true, code: fyCode, message: 'Switched to existing FY database' });
    }

    // Create new FY database
    await createFYDatabase(fyCode);

    // Copy master data from previous active FY
    const copied = { commodities: 0, traders: 0, vehicle_types: 0 };
    if (mandi.active_fy) {
      try {
        const prevPool = getPool(mandi.active_fy);
        const newPool  = getPool(fyCode);
        const [comms]  = await prevPool.execute('SELECT * FROM commodities');
        for (const c of comms) {
          await newPool.execute('INSERT IGNORE INTO commodities (name, unit, short_name) VALUES (?, ?, ?)', [c.name, c.unit, c.short_name]);
          copied.commodities++;
        }
        const [traders] = await prevPool.execute('SELECT * FROM traders');
        for (const t of traders) {
          await newPool.execute('INSERT IGNORE INTO traders (trader_name, shop_number, license_number, phone_number, status) VALUES (?, ?, ?, ?, ?)', [t.trader_name, t.shop_number, t.license_number, t.phone_number || null, t.status]);
          copied.traders++;
        }
        const [vtypes] = await prevPool.execute('SELECT * FROM vehicle_types');
        for (const v of vtypes) {
          await newPool.execute('INSERT IGNORE INTO vehicle_types (name, charges) VALUES (?, ?)', [v.name, v.charges]);
          copied.vehicle_types++;
        }
        // Copy state codes (preserves any custom states added by admin)
        const [states] = await prevPool.execute('SELECT * FROM state_codes');
        for (const s of states) {
          await newPool.execute('INSERT IGNORE INTO state_codes (state_name, state_code) VALUES (?, ?)', [s.state_name, s.state_code]);
        }
      } catch (copyErr) {
        console.error('Warning: could not copy master data:', copyErr.message);
      }
    }

    // Update mandis.active_fy and register in financial_years
    await req.mainDb.execute('UPDATE mandis SET active_fy = ? WHERE id = ?', [fyCode, id]);
    await req.mainDb.execute(
      'INSERT IGNORE INTO financial_years (mandi_id, code, fy_label, from_date, to_date) VALUES (?, ?, ?, ?, ?)',
      [id, fyCode, fyLabel, from_date, to_date]
    );

    broadcastToMandi(id, {
      type: 'fy-created',
      mandi_id: Number(id),
      mandi_name: mandi.name,
      fy_code: fyCode,
      fy_label: fyLabel,
      from_date, to_date,
      copied,
    });

    res.json({ ok: true, code: fyCode, fy_label: fyLabel, copied });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create financial year: ' + err.message });
  }
});

// GET /api/mandis/:id/fy-preview — counts from current active FY for new FY wizard
router.get('/:id/fy-preview', requireSuperAdmin, async (req, res) => {
  try {
    const [mandis] = await req.mainDb.execute('SELECT active_fy FROM mandis WHERE id = ?', [req.params.id]);
    if (!mandis.length) return res.status(404).json({ error: 'Mandi not found' });
    const activeFY = mandis[0].active_fy;
    if (!activeFY) return res.json({ has_previous: false, commodities: 0, traders: 0, vehicle_types: 0 });

    const pool = getPool(activeFY);
    const [[{ c }]] = await pool.execute('SELECT COUNT(*) AS c FROM commodities');
    const [[{ t }]] = await pool.execute('SELECT COUNT(*) AS t FROM traders');
    const [[{ v }]] = await pool.execute('SELECT COUNT(*) AS v FROM vehicle_types');
    res.json({ has_previous: true, previous_fy: activeFY, commodities: c, traders: t, vehicle_types: v });
  } catch (err) {
    console.error(err);
    res.json({ has_previous: false, commodities: 0, traders: 0, vehicle_types: 0 });
  }
});

// DELETE /api/mandis/:id/fy/:code — delete a specific FY database
router.delete('/:id/fy/:code', requireSuperAdmin, async (req, res) => {
  const { id, code } = req.params;
  if (!code || !/^mandi[\w_]+$/.test(code))
    return res.status(400).json({ error: 'Invalid FY code' });
  try {
    const [rows] = await req.mainDb.execute('SELECT id FROM financial_years WHERE mandi_id = ? AND code = ?', [id, code]);
    if (!rows.length) return res.status(404).json({ error: 'Financial year not found' });

    const BASE_CONFIG = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
    };
    const conn = await mysql.createConnection(BASE_CONFIG);
    await conn.execute(`DROP DATABASE IF EXISTS \`${code}\``);
    await conn.end();

    await req.mainDb.execute('DELETE FROM financial_years WHERE mandi_id = ? AND code = ?', [id, code]);
    // If this was the active FY, clear it
    await req.mainDb.execute('UPDATE mandis SET active_fy = NULL WHERE id = ? AND active_fy = ?', [id, code]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete financial year: ' + err.message });
  }
});

// GET /api/mandis/:id/financial-years — list FYs for a mandi
router.get('/:id/financial-years', requireSuperAdmin, async (req, res) => {
  try {
    const [years] = await req.mainDb.execute(
      'SELECT * FROM financial_years WHERE mandi_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    const [mandis] = await req.mainDb.execute('SELECT active_fy FROM mandis WHERE id = ?', [req.params.id]);
    res.json({ financial_years: years, active_fy: mandis[0]?.active_fy || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load financial years' });
  }
});

// POST /api/mandis/:id/switch-fy — switch active FY for a mandi
router.post('/:id/switch-fy', requireSuperAdmin, async (req, res) => {
  const { code } = req.body;
  const mandiId = Number(req.params.id);
  if (!code) return res.status(400).json({ error: 'FY code is required' });

  try {
    const [rows] = await req.mainDb.execute(
      `SELECT fy.id, fy.fy_label, fy.from_date, fy.to_date, m.name AS mandi_name
       FROM financial_years fy JOIN mandis m ON m.id = fy.mandi_id
       WHERE fy.mandi_id = ? AND fy.code = ?`,
      [mandiId, code]
    );
    if (!rows.length) return res.status(404).json({ error: 'FY not found for this mandi' });
    const fy = rows[0];
    await req.mainDb.execute('UPDATE mandis SET active_fy = ? WHERE id = ?', [code, mandiId]);

    broadcastToMandi(mandiId, {
      type: 'fy-switched',
      mandi_id: mandiId,
      mandi_name: fy.mandi_name,
      fy_code: code,
      fy_label: fy.fy_label,
      from_date: fy.from_date,
      to_date: fy.to_date,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to switch FY' });
  }
});

// DELETE /api/mandis/:id — delete a mandi and all its FY databases
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const mysql = require('mysql2/promise');
  const { makeFYCode, MAIN_DB } = require('../database');

  try {
    const [rows] = await req.mainDb.execute('SELECT * FROM mandis WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Mandi not found' });
    const mandi = rows[0];

    // Get all FY databases for this mandi and drop them
    const [fyRows] = await req.mainDb.execute('SELECT code FROM financial_years WHERE mandi_id = ?', [id]);
    const BASE_CONFIG = {
      host:     process.env.MYSQL_HOST     || 'localhost',
      port:     parseInt(process.env.MYSQL_PORT) || 3306,
      user:     process.env.MYSQL_USER     || 'root',
      password: process.env.MYSQL_PASSWORD || '',
    };
    const rootConn = await mysql.createConnection(BASE_CONFIG);
    for (const fy of fyRows) {
      await rootConn.execute(`DROP DATABASE IF EXISTS \`${fy.code}\``);
    }
    await rootConn.end();

    // Delete from financial_years, users (reassign to null), then mandis
    await req.mainDb.execute('DELETE FROM financial_years WHERE mandi_id = ?', [id]);
    await req.mainDb.execute('UPDATE users SET mandi_id = NULL WHERE mandi_id = ?', [id]);
    await req.mainDb.execute('DELETE FROM mandis WHERE id = ?', [id]);

    res.json({ ok: true, message: `Mandi "${mandi.name}" and all its data deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete mandi: ' + err.message });
  }
});

module.exports = router;
