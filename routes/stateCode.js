const express = require('express');
const { requireAuth, requireAdmin, requireFYDB } = require('./middleware');
const { STATE_SEEDS } = require('../database');
const router = express.Router();

// GET /api/states/all
// Superadmin with no fyDb: return global seed list (read-only view)
// Admin/User with fyDb: return from their FY database
router.get('/all', requireAuth, async (req, res) => {
  if (!req.fyDb) {
    // No mandi context — return the global master seed list
    const states = STATE_SEEDS.map(([state_name, state_code], i) => ({ id: i + 1, state_name, state_code }));
    return res.json(states);
  }
  try {
    const [states] = await req.fyDbRead.execute('SELECT * FROM state_codes ORDER BY state_name');
    res.json(states);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load state codes' });
  }
});

// GET /api/states/lookup?code=MH
router.get('/lookup', requireAuth, async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code query param required' });

  if (!req.fyDb) {
    const found = STATE_SEEDS.find(([, sc]) => sc.toUpperCase() === code.trim().toUpperCase());
    if (!found) return res.status(404).json({ error: `No state found with code "${code}"` });
    return res.json({ state_name: found[0], state_code: found[1] });
  }
  try {
    const [rows] = await req.fyDbRead.execute('SELECT * FROM state_codes WHERE UPPER(state_code) = UPPER(?)', [code.trim()]);
    if (!rows.length) return res.status(404).json({ error: `No state found with code "${code}"` });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

router.post('/add', requireAdmin, requireFYDB, async (req, res) => {
  const { state_name, state_code } = req.body;
  if (!state_name || !state_code)
    return res.status(400).json({ error: 'State name and code are required' });

  const trimName = state_name.trim();
  const trimCode = state_code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(trimCode))
    return res.status(400).json({ error: 'State code must be exactly 2 letters' });

  try {
    const [existing] = await req.fyDb.execute('SELECT id FROM state_codes WHERE UPPER(state_code) = ?', [trimCode]);
    if (existing.length) return res.status(409).json({ error: 'State code already exists' });

    const [result] = await req.fyDb.execute('INSERT INTO state_codes (state_name, state_code) VALUES (?, ?)', [trimName, trimCode]);
    const [rows]   = await req.fyDb.execute('SELECT * FROM state_codes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save state code' });
  }
});

router.put('/:id', requireAdmin, requireFYDB, async (req, res) => {
  const { id } = req.params;
  const { state_name, state_code } = req.body;
  if (!state_name || !state_code)
    return res.status(400).json({ error: 'State name and code are required' });

  const trimName = state_name.trim();
  const trimCode = state_code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(trimCode))
    return res.status(400).json({ error: 'State code must be exactly 2 letters' });

  try {
    const [existing] = await req.fyDb.execute('SELECT id FROM state_codes WHERE UPPER(state_code) = ? AND id != ?', [trimCode, id]);
    if (existing.length) return res.status(409).json({ error: 'State code already exists' });

    await req.fyDb.execute('UPDATE state_codes SET state_name = ?, state_code = ? WHERE id = ?', [trimName, trimCode, id]);
    const [rows] = await req.fyDb.execute('SELECT * FROM state_codes WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'State not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update state code' });
  }
});

router.delete('/:id', requireAdmin, requireFYDB, async (req, res) => {
  try {
    const [result] = await req.fyDb.execute('DELETE FROM state_codes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'State not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete state code' });
  }
});

module.exports = router;
