const express = require('express');
const db = require('../database');
const { requireAuth, requireAdmin } = require('./middleware');

const router = express.Router();

// Get all commodities — any logged-in user
router.get('/', requireAuth, (req, res) => {
  const commodities = db.prepare('SELECT * FROM commodities ORDER BY name').all();
  res.json(commodities);
});

// Add commodity — admin only
router.post('/', requireAdmin, (req, res) => {
  const { name, unit, short_name } = req.body;

  if (!name || !unit || !short_name)
    return res.status(400).json({ error: 'All fields are required' });

  const trimmedName = name.trim();
  const trimmedUnit = unit.trim();
  const trimmedShortName = short_name.trim();

  const existingName = db.prepare('SELECT id FROM commodities WHERE LOWER(name) = LOWER(?)').get(trimmedName);
  if (existingName) return res.status(409).json({ error: 'Commodity name already exists' });

  const existingShortName = db.prepare('SELECT id FROM commodities WHERE LOWER(short_name) = LOWER(?)').get(trimmedShortName);
  if (existingShortName) return res.status(409).json({ error: 'Short name already exists' });

  try {
    const result = db.prepare('INSERT INTO commodities (name, unit, short_name) VALUES (?, ?, ?)').run(trimmedName, trimmedUnit, trimmedShortName);
    const commodity = db.prepare('SELECT * FROM commodities WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(commodity);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save commodity' });
  }
});

// Update commodity — admin only
router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, unit, short_name } = req.body;

  if (!name || !unit || !short_name)
    return res.status(400).json({ error: 'All fields are required' });

  const trimmedName = name.trim();
  const trimmedUnit = unit.trim();
  const trimmedShortName = short_name.trim();

  const existingName = db.prepare('SELECT id FROM commodities WHERE LOWER(name) = LOWER(?) AND id != ?').get(trimmedName, id);
  if (existingName) return res.status(409).json({ error: 'Commodity name already exists' });

  const existingShortName = db.prepare('SELECT id FROM commodities WHERE LOWER(short_name) = LOWER(?) AND id != ?').get(trimmedShortName, id);
  if (existingShortName) return res.status(409).json({ error: 'Short name already exists' });

  try {
    db.prepare('UPDATE commodities SET name = ?, unit = ?, short_name = ? WHERE id = ?').run(trimmedName, trimmedUnit, trimmedShortName, id);
    const commodity = db.prepare('SELECT * FROM commodities WHERE id = ?').get(id);
    if (!commodity) return res.status(404).json({ error: 'Commodity not found' });
    res.json(commodity);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update commodity' });
  }
});

// Delete commodity — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM commodities WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Commodity not found' });
  res.json({ success: true });
});

module.exports = router;
