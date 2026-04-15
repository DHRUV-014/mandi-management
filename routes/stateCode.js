const express = require('express');
const db = require('../database');
const { requireAuth, requireAdmin } = require('./middleware');

const router = express.Router();

// Get all state codes — any logged-in user
router.get('/all', requireAuth, (req, res) => {
  const states = db.prepare('SELECT * FROM state_codes ORDER BY state_code').all();
  res.json(states);
});

// Lookup state name by code — any logged-in user
router.get('/lookup', requireAuth, (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code query param required' });
  const state = db.prepare('SELECT * FROM state_codes WHERE UPPER(state_code) = UPPER(?)').get(code.trim());
  if (!state) return res.status(404).json({ error: `No state found with code "${code}"` });
  res.json(state);
});

// Add state code — admin only
router.post('/add', requireAdmin, (req, res) => {
  const { state_name, state_code } = req.body;
  if (!state_name || !state_code)
    return res.status(400).json({ error: 'State name and code are required' });

  const trimmedName = state_name.trim();
  const trimmedCode = state_code.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(trimmedCode))
    return res.status(400).json({ error: 'State code must be exactly 2 letters' });

  const existing = db.prepare('SELECT id FROM state_codes WHERE UPPER(state_code) = ?').get(trimmedCode);
  if (existing) return res.status(409).json({ error: 'State code already exists' });

  try {
    const result = db.prepare(
      'INSERT INTO state_codes (state_name, state_code) VALUES (?, ?)'
    ).run(trimmedName, trimmedCode);
    const state = db.prepare('SELECT * FROM state_codes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(state);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save state code' });
  }
});

// Update state code — admin only
router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { state_name, state_code } = req.body;

  if (!state_name || !state_code)
    return res.status(400).json({ error: 'State name and code are required' });

  const trimmedName = state_name.trim();
  const trimmedCode = state_code.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(trimmedCode))
    return res.status(400).json({ error: 'State code must be exactly 2 letters' });

  const existing = db.prepare('SELECT id FROM state_codes WHERE UPPER(state_code) = ? AND id != ?').get(trimmedCode, id);
  if (existing) return res.status(409).json({ error: 'State code already exists' });

  try {
    db.prepare('UPDATE state_codes SET state_name = ?, state_code = ? WHERE id = ?')
      .run(trimmedName, trimmedCode, id);
    const state = db.prepare('SELECT * FROM state_codes WHERE id = ?').get(id);
    if (!state) return res.status(404).json({ error: 'State not found' });
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update state code' });
  }
});

// Delete state code — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM state_codes WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'State not found' });
  res.json({ success: true });
});

module.exports = router;
