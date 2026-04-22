const express = require('express');
const { requireAuth, requireAdmin } = require('./middleware');
const router  = express.Router();

// GET /api/profile — returns mandi info for the current user's mandi
router.get('/', requireAuth, async (req, res) => {
  try {
    const { mandi_id } = req.session.user;
    let profile = null;

    if (mandi_id) {
      const [rows] = await req.mainDb.execute('SELECT * FROM mandis WHERE id = ?', [mandi_id]);
      profile = rows[0] || null;
    }

    let current_max_gp = null;
    if (req.fyDb) {
      const [[maxRow]] = await req.fyDb.execute('SELECT MAX(gate_pass_number) AS max_num FROM gate_passes');
      current_max_gp = maxRow.max_num || null;
    }

    res.json({ profile, current_max_gp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// POST /api/profile — update mandi info (admin only, for their own mandi)
router.post('/', requireAdmin, async (req, res) => {
  const { mandi_id } = req.session.user;
  if (!mandi_id) return res.status(400).json({ error: 'No mandi assigned to this account' });

  const { name, address_line1, address_line2, phone, license_no } = req.body;
  if (!name) return res.status(400).json({ error: 'Mandi name is required' });

  try {
    await req.mainDb.execute(
      'UPDATE mandis SET name = ?, address_line1 = ?, address_line2 = ?, phone = ?, license_no = ? WHERE id = ?',
      [name.trim(), address_line1 || null, address_line2 || null, phone || null, license_no || null, mandi_id]
    );
    const [rows] = await req.mainDb.execute('SELECT * FROM mandis WHERE id = ?', [mandi_id]);
    res.json({ ok: true, mandi: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

module.exports = router;
