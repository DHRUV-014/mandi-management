const express = require('express');
const db = require('../database');
const { requireAuth, requireAdmin } = require('./middleware');

const router = express.Router();

// Get all vehicle types — any logged-in user
router.get('/', requireAuth, (req, res) => {
  const types = db.prepare('SELECT * FROM vehicle_types ORDER BY name').all();
  res.json(types);
});

// Add vehicle type — admin only
router.post('/', requireAdmin, (req, res) => {
  const { name, charges } = req.body;

  if (!name || name.trim() === '')
    return res.status(400).json({ error: 'Vehicle type name is required' });

  const trimmedName = name.trim();
  const chargeValue = parseFloat(charges);

  if (isNaN(chargeValue) || chargeValue < 0)
    return res.status(400).json({ error: 'Charges must be a valid non-negative number' });

  const existing = db.prepare('SELECT id FROM vehicle_types WHERE LOWER(name) = LOWER(?)').get(trimmedName);
  if (existing) return res.status(409).json({ error: 'Vehicle type name already exists' });

  try {
    const result = db.prepare(
      'INSERT INTO vehicle_types (name, charges) VALUES (?, ?)'
    ).run(trimmedName, chargeValue);
    const vt = db.prepare('SELECT * FROM vehicle_types WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(vt);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save vehicle type' });
  }
});

// Update vehicle type — admin only
router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, charges } = req.body;

  if (!name || name.trim() === '')
    return res.status(400).json({ error: 'Vehicle type name is required' });

  const trimmedName = name.trim();
  const chargeValue = parseFloat(charges);

  if (isNaN(chargeValue) || chargeValue < 0)
    return res.status(400).json({ error: 'Charges must be a valid non-negative number' });

  const existing = db.prepare('SELECT id FROM vehicle_types WHERE LOWER(name) = LOWER(?) AND id != ?').get(trimmedName, id);
  if (existing) return res.status(409).json({ error: 'Vehicle type name already exists' });

  try {
    db.prepare('UPDATE vehicle_types SET name = ?, charges = ? WHERE id = ?').run(trimmedName, chargeValue, id);
    const vt = db.prepare('SELECT * FROM vehicle_types WHERE id = ?').get(id);
    if (!vt) return res.status(404).json({ error: 'Vehicle type not found' });
    res.json(vt);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vehicle type' });
  }
});

// Delete vehicle type — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM vehicle_types WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Vehicle type not found' });
  res.json({ success: true });
});

module.exports = router;
