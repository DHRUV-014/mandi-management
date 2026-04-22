const express = require('express');
const { requireAuth, requireAdmin, requireFYDB } = require('./middleware');
const router = express.Router();

router.get('/', requireAuth, requireFYDB, async (req, res) => {
  try {
    const [commodities] = await req.fyDbRead.execute('SELECT * FROM commodities ORDER BY name');
    res.json(commodities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load commodities' });
  }
});

router.post('/', requireAdmin, requireFYDB, async (req, res) => {
  const { name, unit, short_name } = req.body;
  if (!name || !unit || !short_name)
    return res.status(400).json({ error: 'All fields are required' });

  const trimName  = name.trim();
  const trimUnit  = unit.trim();
  const trimShort = short_name.trim();

  try {
    const [byName]  = await req.fyDb.execute('SELECT id FROM commodities WHERE LOWER(name) = LOWER(?)', [trimName]);
    if (byName.length) return res.status(409).json({ error: 'Commodity name already exists' });

    const [byShort] = await req.fyDb.execute('SELECT id FROM commodities WHERE LOWER(short_name) = LOWER(?)', [trimShort]);
    if (byShort.length) return res.status(409).json({ error: 'Short name already exists' });

    const [result] = await req.fyDb.execute(
      'INSERT INTO commodities (name, unit, short_name) VALUES (?, ?, ?)', [trimName, trimUnit, trimShort]
    );
    const [rows] = await req.fyDb.execute('SELECT * FROM commodities WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save commodity' });
  }
});

router.put('/:id', requireAdmin, requireFYDB, async (req, res) => {
  const { id } = req.params;
  const { name, unit, short_name } = req.body;
  if (!name || !unit || !short_name)
    return res.status(400).json({ error: 'All fields are required' });

  const trimName  = name.trim();
  const trimUnit  = unit.trim();
  const trimShort = short_name.trim();

  try {
    const [byName]  = await req.fyDb.execute('SELECT id FROM commodities WHERE LOWER(name) = LOWER(?) AND id != ?', [trimName, id]);
    if (byName.length) return res.status(409).json({ error: 'Commodity name already exists' });

    const [byShort] = await req.fyDb.execute('SELECT id FROM commodities WHERE LOWER(short_name) = LOWER(?) AND id != ?', [trimShort, id]);
    if (byShort.length) return res.status(409).json({ error: 'Short name already exists' });

    await req.fyDb.execute('UPDATE commodities SET name = ?, unit = ?, short_name = ? WHERE id = ?', [trimName, trimUnit, trimShort, id]);
    const [rows] = await req.fyDb.execute('SELECT * FROM commodities WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Commodity not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update commodity' });
  }
});

router.delete('/:id', requireAdmin, requireFYDB, async (req, res) => {
  try {
    const [result] = await req.fyDb.execute('DELETE FROM commodities WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Commodity not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete commodity' });
  }
});

module.exports = router;
