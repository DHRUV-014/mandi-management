const express = require('express');
const { requireAuth, requireAdmin, requireFYDB } = require('./middleware');
const router = express.Router();

router.get('/', requireAuth, requireFYDB, async (req, res) => {
  try {
    const [types] = await req.fyDbRead.execute('SELECT * FROM vehicle_types ORDER BY name');
    res.json(types);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load vehicle types' });
  }
});

router.post('/', requireAdmin, requireFYDB, async (req, res) => {
  const { name, charges } = req.body;
  if (!name || name.trim() === '')
    return res.status(400).json({ error: 'Vehicle type name is required' });

  const trimName   = name.trim();
  const chargeVal  = parseFloat(charges);
  if (isNaN(chargeVal) || chargeVal < 0)
    return res.status(400).json({ error: 'Charges must be a valid non-negative number' });

  try {
    const [existing] = await req.fyDb.execute('SELECT id FROM vehicle_types WHERE LOWER(name) = LOWER(?)', [trimName]);
    if (existing.length) return res.status(409).json({ error: 'Vehicle type name already exists' });

    const [result] = await req.fyDb.execute('INSERT INTO vehicle_types (name, charges) VALUES (?, ?)', [trimName, chargeVal]);
    const [rows]   = await req.fyDb.execute('SELECT * FROM vehicle_types WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save vehicle type' });
  }
});

router.put('/:id', requireAdmin, requireFYDB, async (req, res) => {
  const { id } = req.params;
  const { name, charges } = req.body;
  if (!name || name.trim() === '')
    return res.status(400).json({ error: 'Vehicle type name is required' });

  const trimName  = name.trim();
  const chargeVal = parseFloat(charges);
  if (isNaN(chargeVal) || chargeVal < 0)
    return res.status(400).json({ error: 'Charges must be a valid non-negative number' });

  try {
    const [existing] = await req.fyDb.execute('SELECT id FROM vehicle_types WHERE LOWER(name) = LOWER(?) AND id != ?', [trimName, id]);
    if (existing.length) return res.status(409).json({ error: 'Vehicle type name already exists' });

    await req.fyDb.execute('UPDATE vehicle_types SET name = ?, charges = ? WHERE id = ?', [trimName, chargeVal, id]);
    const [rows] = await req.fyDb.execute('SELECT * FROM vehicle_types WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Vehicle type not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update vehicle type' });
  }
});

router.delete('/:id', requireAdmin, requireFYDB, async (req, res) => {
  try {
    const [result] = await req.fyDb.execute('DELETE FROM vehicle_types WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Vehicle type not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete vehicle type' });
  }
});

module.exports = router;
