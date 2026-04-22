const express = require('express');
const bcrypt  = require('bcrypt');
const { requireAuth } = require('./middleware');
const { getMandiById } = require('../database');
const router  = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required' });

  try {
    const [rows] = await req.mainDb.execute(
      `SELECT u.*, m.name AS mandi_name, m.prefix AS mandi_prefix
       FROM users u LEFT JOIN mandis m ON m.id = u.mandi_id
       WHERE u.username = ?`,
      [username]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid username or password' });

    // Parse permissions (JSON array or null)
    let permissions = null;
    if (user.permissions) {
      try { permissions = JSON.parse(user.permissions); } catch (_) {}
    }

    // Load all mandis this user is assigned to (user_mandis table)
    const [mandiRows] = await req.mainDb.execute(
      `SELECT m.id, m.name, m.prefix
       FROM user_mandis um JOIN mandis m ON m.id = um.mandi_id
       WHERE um.user_id = ?
       ORDER BY m.name`, [user.id]
    );

    const primaryMandiId = user.mandi_id || null;

    req.session.user = {
      id:              user.id,
      username:        user.username,
      level:           user.level,
      mandi_id:        primaryMandiId,
      mandi_name:      user.mandi_name   || null,
      mandi_prefix:    user.mandi_prefix || null,
      permissions:     permissions,
      assignedMandis:  mandiRows,
      current_mandi_id: primaryMandiId,
    };

    // Set the session-level mandi context
    req.session.current_mandi_id = primaryMandiId;

    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Switch active mandi context (superadmin = any mandi; multi-mandi admin = assigned mandis only)
router.post('/switch-mandi', requireAuth, async (req, res) => {
  const { mandi_id } = req.body;
  const id = mandi_id ? (parseInt(mandi_id) || null) : null;

  if (id) {
    // Non-superadmin can only switch to their assigned mandis
    if (req.session.user.level !== 'superadmin') {
      const assigned = req.session.user.assignedMandis || [];
      if (!assigned.find(m => m.id === id))
        return res.status(403).json({ error: 'Not assigned to this mandi' });
    }
    try {
      const mandi = await getMandiById(id);
      if (!mandi) return res.status(404).json({ error: 'Mandi not found' });

      req.session.current_mandi_id = id;
      req.session.user.current_mandi_id = id;
      req.session.user.mandi_name   = mandi.name;
      req.session.user.mandi_prefix = mandi.prefix;
      req.session.selected_fy_code  = null;  // clear historical-view state on mandi switch

      res.json({ ok: true, mandi: { id: mandi.id, name: mandi.name, prefix: mandi.prefix, active_fy: mandi.active_fy } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to switch mandi' });
    }
  } else {
    req.session.current_mandi_id = null;
    req.session.user.current_mandi_id = null;
    req.session.user.mandi_name   = null;
    req.session.user.mandi_prefix = null;
    req.session.selected_fy_code  = null;
    res.json({ ok: true, mandi: null });
  }
});

// Verify admin/superadmin credentials (used for inline auth prompts)
router.post('/verify-admin', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { username, password } = req.body;
  try {
    const [rows] = await req.mainDb.execute(
      "SELECT * FROM users WHERE username = ? AND level IN ('admin','superadmin')", [username]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid admin credentials' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  // Merge the session's selected viewing-FY code so the client can show the FY selector state
  const user = { ...req.session.user, selected_fy_code: req.session.selected_fy_code || null };
  res.json({ user });
});

module.exports = router;
