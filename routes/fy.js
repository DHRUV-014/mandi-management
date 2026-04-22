const express = require('express');
const { requireAuth } = require('./middleware');
const { fyBelongsToMandi } = require('../database');
const router = express.Router();

function canViewPastFY(user) {
  if (!user) return false;
  if (user.level === 'superadmin' || user.level === 'admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes('view_past_fy');
}

// GET /api/fy/list — list FYs for the current mandi (for the FY selector).
// Everyone logged-in with a mandi context can call this; returns active_fy marker
// and whether the caller is allowed to switch viewing FY.
router.get('/list', requireAuth, async (req, res) => {
  if (!req.mandi) return res.json({ financial_years: [], active_fy: null, selected_fy: null, can_view_past: false });
  try {
    const [years] = await req.mainDb.execute(
      'SELECT id, code, fy_label, from_date, to_date FROM financial_years WHERE mandi_id = ? ORDER BY from_date DESC, created_at DESC',
      [req.mandi.id]
    );
    res.json({
      financial_years: years,
      active_fy:       req.mandi.active_fy || null,
      selected_fy:     req.session.selected_fy_code || null,
      can_view_past:   canViewPastFY(req.session.user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load financial years' });
  }
});

// POST /api/fy/select — set or clear viewing FY for the session.
// Clearing (pass null / empty / active code) returns to live/active FY.
router.post('/select', requireAuth, async (req, res) => {
  if (!req.mandi) return res.status(400).json({ error: 'No mandi context' });
  const { code } = req.body;

  // Cleared or back to active → null out the override
  if (!code || code === req.mandi.active_fy) {
    req.session.selected_fy_code = null;
    return res.json({ ok: true, selected_fy: null, active: true });
  }

  if (!canViewPastFY(req.session.user))
    return res.status(403).json({ error: 'You do not have permission to view past financial years' });

  try {
    const belongs = await fyBelongsToMandi(req.mandi.id, code);
    if (!belongs) return res.status(404).json({ error: 'FY not found for this mandi' });
    req.session.selected_fy_code = code;
    res.json({ ok: true, selected_fy: code, active: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to select FY' });
  }
});

module.exports = router;
