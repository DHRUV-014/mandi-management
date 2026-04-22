const express = require('express');
const { requireAuth, requireAdmin, requireFYDB } = require('./middleware');
const router = express.Router();

router.get('/', requireAuth, requireFYDB, async (req, res) => {
  try {
    const [traders] = await req.fyDbRead.execute(`
      SELECT * FROM traders
      ORDER BY
        SUBSTRING(shop_number, 1, LOCATE('-', shop_number) - 1),
        CAST(SUBSTRING(shop_number, LOCATE('-', shop_number) + 1) AS UNSIGNED)
    `);
    res.json(traders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load traders' });
  }
});

router.get('/lookup', requireAuth, requireFYDB, async (req, res) => {
  const { shop_number } = req.query;
  if (!shop_number) return res.status(400).json({ error: 'shop_number query param required' });
  try {
    const [rows] = await req.fyDbRead.execute(
      'SELECT id, trader_name, shop_number, license_number, phone_number FROM traders WHERE LOWER(shop_number) = LOWER(?)',
      [shop_number.trim()]
    );
    if (!rows.length) return res.status(404).json({ error: `No trader found with shop number "${shop_number}"` });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

router.post('/', requireAdmin, requireFYDB, async (req, res) => {
  const { trader_name, shop_number, license_number, phone_number } = req.body;
  if (!trader_name || !shop_number || !license_number)
    return res.status(400).json({ error: 'Trader name, shop number and license number are required' });

  const trimName    = trader_name.trim();
  const trimShop    = shop_number.trim();
  const trimLicense = license_number.trim();
  const trimPhone   = phone_number ? phone_number.trim() : null;

  try {
    const [byShop] = await req.fyDb.execute('SELECT id FROM traders WHERE LOWER(shop_number) = LOWER(?)', [trimShop]);
    if (byShop.length) return res.status(409).json({ error: 'Shop number already exists' });

    const [byLic] = await req.fyDb.execute('SELECT id FROM traders WHERE LOWER(license_number) = LOWER(?)', [trimLicense]);
    if (byLic.length) return res.status(409).json({ error: 'License number already exists' });

    const [result] = await req.fyDb.execute(
      'INSERT INTO traders (trader_name, shop_number, license_number, phone_number) VALUES (?, ?, ?, ?)',
      [trimName, trimShop, trimLicense, trimPhone]
    );
    const [rows] = await req.fyDb.execute('SELECT * FROM traders WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save trader' });
  }
});

router.put('/:id', requireAdmin, requireFYDB, async (req, res) => {
  const { id } = req.params;
  const { trader_name, shop_number, license_number, phone_number } = req.body;
  if (!trader_name || !shop_number || !license_number)
    return res.status(400).json({ error: 'Trader name, shop number and license number are required' });

  const trimName    = trader_name.trim();
  const trimShop    = shop_number.trim();
  const trimLicense = license_number.trim();
  const trimPhone   = phone_number ? phone_number.trim() : null;

  try {
    const [byShop] = await req.fyDb.execute('SELECT id FROM traders WHERE LOWER(shop_number) = LOWER(?) AND id != ?', [trimShop, id]);
    if (byShop.length) return res.status(409).json({ error: 'Shop number already exists' });

    const [byLic] = await req.fyDb.execute('SELECT id FROM traders WHERE LOWER(license_number) = LOWER(?) AND id != ?', [trimLicense, id]);
    if (byLic.length) return res.status(409).json({ error: 'License number already exists' });

    await req.fyDb.execute(
      'UPDATE traders SET trader_name = ?, shop_number = ?, license_number = ?, phone_number = ? WHERE id = ?',
      [trimName, trimShop, trimLicense, trimPhone, id]
    );
    const [rows] = await req.fyDb.execute('SELECT * FROM traders WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Trader not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update trader' });
  }
});

router.patch('/:id/status', requireAdmin, requireFYDB, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'banned'].includes(status))
    return res.status(400).json({ error: 'Status must be "active" or "banned"' });

  try {
    const [rows] = await req.fyDb.execute('SELECT id FROM traders WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Trader not found' });
    await req.fyDb.execute('UPDATE traders SET status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.delete('/:id', requireAdmin, requireFYDB, async (req, res) => {
  try {
    const [result] = await req.fyDb.execute('DELETE FROM traders WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Trader not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete trader' });
  }
});

module.exports = router;
