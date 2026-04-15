const express = require('express');
const db = require('../database');
const { requireAuth, requireAdmin } = require('./middleware');

const router = express.Router();

// Get all traders — any logged-in user
router.get('/', requireAuth, (req, res) => {
  const traders = db.prepare(`
    SELECT * FROM traders
    ORDER BY
      SUBSTR(shop_number, 1, INSTR(shop_number, '-') - 1),
      CAST(SUBSTR(shop_number, INSTR(shop_number, '-') + 1) AS INTEGER)
  `).all();
  res.json(traders);
});

// Lookup trader by shop number — any logged-in user
router.get('/lookup', requireAuth, (req, res) => {
  const { shop_number } = req.query;
  if (!shop_number) return res.status(400).json({ error: 'shop_number query param required' });

  const trader = db.prepare(
    'SELECT id, trader_name, shop_number, license_number, phone_number FROM traders WHERE LOWER(shop_number) = LOWER(?)'
  ).get(shop_number.trim());

  if (!trader) return res.status(404).json({ error: `No trader found with shop number "${shop_number}"` });
  res.json(trader);
});

// Add trader — admin only
router.post('/', requireAdmin, (req, res) => {
  const { trader_name, shop_number, license_number, phone_number } = req.body;

  if (!trader_name || !shop_number || !license_number)
    return res.status(400).json({ error: 'Trader name, shop number and license number are required' });

  const trimmedName    = trader_name.trim();
  const trimmedShop    = shop_number.trim();
  const trimmedLicense = license_number.trim();
  const trimmedPhone   = phone_number ? phone_number.trim() : null;

  const existingShop = db.prepare('SELECT id FROM traders WHERE LOWER(shop_number) = LOWER(?)').get(trimmedShop);
  if (existingShop) return res.status(409).json({ error: 'Shop number already exists' });

  const existingLicense = db.prepare('SELECT id FROM traders WHERE LOWER(license_number) = LOWER(?)').get(trimmedLicense);
  if (existingLicense) return res.status(409).json({ error: 'License number already exists' });

  try {
    const result = db.prepare(
      'INSERT INTO traders (trader_name, shop_number, license_number, phone_number) VALUES (?, ?, ?, ?)'
    ).run(trimmedName, trimmedShop, trimmedLicense, trimmedPhone);
    const trader = db.prepare('SELECT * FROM traders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(trader);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save trader' });
  }
});

// Update trader — admin only
router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { trader_name, shop_number, license_number, phone_number } = req.body;

  if (!trader_name || !shop_number || !license_number)
    return res.status(400).json({ error: 'Trader name, shop number and license number are required' });

  const trimmedName    = trader_name.trim();
  const trimmedShop    = shop_number.trim();
  const trimmedLicense = license_number.trim();
  const trimmedPhone   = phone_number ? phone_number.trim() : null;

  const existingShop = db.prepare('SELECT id FROM traders WHERE LOWER(shop_number) = LOWER(?) AND id != ?').get(trimmedShop, id);
  if (existingShop) return res.status(409).json({ error: 'Shop number already exists' });

  const existingLicense = db.prepare('SELECT id FROM traders WHERE LOWER(license_number) = LOWER(?) AND id != ?').get(trimmedLicense, id);
  if (existingLicense) return res.status(409).json({ error: 'License number already exists' });

  try {
    db.prepare(
      'UPDATE traders SET trader_name = ?, shop_number = ?, license_number = ?, phone_number = ? WHERE id = ?'
    ).run(trimmedName, trimmedShop, trimmedLicense, trimmedPhone, id);
    const trader = db.prepare('SELECT * FROM traders WHERE id = ?').get(id);
    if (!trader) return res.status(404).json({ error: 'Trader not found' });
    res.json(trader);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update trader' });
  }
});

// Toggle trader status — admin only
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['active', 'banned'].includes(status))
    return res.status(400).json({ error: 'Status must be "active" or "banned"' });

  const trader = db.prepare('SELECT id FROM traders WHERE id = ?').get(id);
  if (!trader) return res.status(404).json({ error: 'Trader not found' });

  db.prepare('UPDATE traders SET status = ? WHERE id = ?').run(status, id);
  res.json({ success: true, status });
});

// Delete trader — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM traders WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Trader not found' });
  res.json({ success: true });
});

module.exports = router;
