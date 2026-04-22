const express = require('express');
const { requireAuth } = require('./middleware');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { level, mandi_id } = req.session.user;

  try {
    if (level === 'superadmin') {
      const [mandis] = await req.mainDb.execute('SELECT * FROM mandis ORDER BY name');

      // For each mandi, get admin count
      const mandiData = await Promise.all(mandis.map(async m => {
        const [[{ adminCount }]] = await req.mainDb.execute(
          "SELECT COUNT(*) AS adminCount FROM users WHERE mandi_id = ? AND level IN ('admin','user')",
          [m.id]
        );
        return { ...m, user_count: adminCount };
      }));

      return res.json({ role: 'superadmin', mandis: mandiData });
    }

    if (!mandi_id) return res.json({ role: level, mandi: null });

    const [mandiRows] = await req.mainDb.execute('SELECT * FROM mandis WHERE id = ?', [mandi_id]);
    const mandi = mandiRows[0] || null;

    let stats = { today_gate_passes: 0, total_traders: 0, total_commodities: 0, total_gate_passes: 0 };

    if (req.fyDb) {
      const today = new Date().toISOString().slice(0, 10);
      const [[todayGP]]  = await req.fyDb.execute('SELECT COUNT(*) AS cnt FROM gate_passes WHERE DATE(created_at) = ?', [today]);
      const [[totalGP]]  = await req.fyDb.execute('SELECT COUNT(*) AS cnt FROM gate_passes');
      const [[traders]]  = await req.fyDb.execute('SELECT COUNT(*) AS cnt FROM traders WHERE status = ?', ['active']);
      const [[commodities]] = await req.fyDb.execute('SELECT COUNT(*) AS cnt FROM commodities');

      stats = {
        today_gate_passes: todayGP.cnt,
        total_gate_passes: totalGP.cnt,
        total_traders:     traders.cnt,
        total_commodities: commodities.cnt,
      };
    }

    res.json({ role: level, mandi, stats, has_fy: !!req.fyDb });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
