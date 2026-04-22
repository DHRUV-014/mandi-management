const express = require('express');
const bcrypt  = require('bcrypt');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('./middleware');
const router  = express.Router();

// Helper: load user with mandis + permissions
async function loadUserFull(mainDb, userId) {
  const [rows] = await mainDb.execute(
    `SELECT u.id, u.username, u.level, u.mandi_id, u.permissions, u.created_at,
            m.name AS mandi_name, m.prefix AS mandi_prefix
     FROM users u LEFT JOIN mandis m ON m.id = u.mandi_id
     WHERE u.id = ?`, [userId]
  );
  if (!rows.length) return null;
  const u = rows[0];
  const [mandiRows] = await mainDb.execute(
    `SELECT m.id, m.name, m.prefix
     FROM user_mandis um JOIN mandis m ON m.id = um.mandi_id
     WHERE um.user_id = ? ORDER BY m.name`, [userId]
  );
  let permissions = null;
  if (u.permissions) { try { permissions = JSON.parse(u.permissions); } catch (_) {} }
  return { ...u, permissions, assignedMandis: mandiRows };
}

// GET /api/users/all
router.get('/all', requireAdmin, async (req, res) => {
  try {
    let query, params;
    if (req.session.user.level === 'superadmin') {
      query = `SELECT u.id, u.username, u.level, u.mandi_id, u.permissions, u.created_at,
                      m.name AS mandi_name
               FROM users u LEFT JOIN mandis m ON m.id = u.mandi_id
               ORDER BY u.level DESC, u.username`;
      params = [];
    } else {
      query = `SELECT u.id, u.username, u.level, u.mandi_id, u.permissions, u.created_at,
                      m.name AS mandi_name
               FROM users u LEFT JOIN mandis m ON m.id = u.mandi_id
               WHERE u.mandi_id = ?
               ORDER BY u.level DESC, u.username`;
      params = [req.session.user.mandi_id];
    }
    const [users] = await req.mainDb.execute(query, params);

    // Load assigned mandis for all users in one query
    const [allAssignments] = await req.mainDb.execute(
      `SELECT um.user_id, m.id, m.name, m.prefix
       FROM user_mandis um JOIN mandis m ON m.id = um.mandi_id
       ORDER BY m.name`
    );
    const mandisByUser = {};
    for (const r of allAssignments) {
      if (!mandisByUser[r.user_id]) mandisByUser[r.user_id] = [];
      mandisByUser[r.user_id].push({ id: r.id, name: r.name, prefix: r.prefix });
    }

    const enriched = users.map(u => {
      let permissions = null;
      if (u.permissions) { try { permissions = JSON.parse(u.permissions); } catch (_) {} }
      return { ...u, permissions, assignedMandis: mandisByUser[u.id] || [] };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// POST /api/users/add
router.post('/add', requireAdmin, async (req, res) => {
  const { username, password, level, mandi_id, mandi_ids, permissions } = req.body;
  if (!username || !password || !level)
    return res.status(400).json({ error: 'Username, password and level are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const isSuperAdmin = req.session.user.level === 'superadmin';

  if (!isSuperAdmin && !['admin', 'user'].includes(level))
    return res.status(400).json({ error: 'Level must be admin or user' });
  if (isSuperAdmin && !['superadmin', 'admin', 'user'].includes(level))
    return res.status(400).json({ error: 'Invalid level' });

  // Determine primary mandi
  let primaryMandiId;
  if (isSuperAdmin) {
    primaryMandiId = mandi_id ? parseInt(mandi_id) : null;
  } else {
    primaryMandiId = req.session.user.mandi_id;
  }
  if (level === 'superadmin') primaryMandiId = null;

  // Parse permissions if provided
  let permissionsJson = null;
  if (permissions && Array.isArray(permissions) && permissions.length > 0) {
    permissionsJson = JSON.stringify(permissions);
  }

  try {
    const [existing] = await req.mainDb.execute(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username.trim()]
    );
    if (existing.length) return res.status(409).json({ error: 'Username already exists' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await req.mainDb.execute(
      'INSERT INTO users (username, password_hash, level, mandi_id, permissions) VALUES (?, ?, ?, ?, ?)',
      [username.trim(), hash, level, primaryMandiId, permissionsJson]
    );
    const userId = result.insertId;

    // Insert user_mandis entries for admin level
    const mandisToAssign = isSuperAdmin && Array.isArray(mandi_ids) ? mandi_ids.map(Number).filter(Boolean) : [];
    if (primaryMandiId && !mandisToAssign.includes(primaryMandiId)) mandisToAssign.push(primaryMandiId);
    for (const mid of mandisToAssign) {
      await req.mainDb.execute('INSERT IGNORE INTO user_mandis (user_id, mandi_id) VALUES (?, ?)', [userId, mid]);
    }

    const user = await loadUserFull(req.mainDb, userId);
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id — update mandi assignments and/or permissions (superadmin only)
router.put('/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { mandi_id, mandi_ids, permissions } = req.body;

  try {
    const [rows] = await req.mainDb.execute('SELECT id, level FROM users WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];

    // Update primary mandi
    const primaryMandiId = mandi_id != null ? (parseInt(mandi_id) || null) : undefined;
    if (primaryMandiId !== undefined) {
      await req.mainDb.execute('UPDATE users SET mandi_id = ? WHERE id = ?', [primaryMandiId, id]);
    }

    // Update permissions
    if (permissions !== undefined) {
      const permJson = Array.isArray(permissions) && permissions.length > 0
        ? JSON.stringify(permissions)
        : null;
      await req.mainDb.execute('UPDATE users SET permissions = ? WHERE id = ?', [permJson, id]);
    }

    // Update mandi assignments
    if (Array.isArray(mandi_ids)) {
      await req.mainDb.execute('DELETE FROM user_mandis WHERE user_id = ?', [id]);
      const toAssign = mandi_ids.map(Number).filter(Boolean);
      // Also include primary mandi
      const finalPrimary = primaryMandiId !== undefined ? primaryMandiId : rows[0].mandi_id;
      if (finalPrimary && !toAssign.includes(finalPrimary)) toAssign.push(finalPrimary);
      for (const mid of toAssign) {
        await req.mainDb.execute('INSERT IGNORE INTO user_mandis (user_id, mandi_id) VALUES (?, ?)', [id, mid]);
      }
    }

    const updated = await loadUserFull(req.mainDb, id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/users/change-password — own password only
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  if (!current_password || !new_password || !confirm_password)
    return res.status(400).json({ error: 'All fields are required' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  if (new_password !== confirm_password)
    return res.status(400).json({ error: 'New passwords do not match' });

  try {
    const [rows] = await req.mainDb.execute('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(current_password, user.password_hash)))
      return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await req.mainDb.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.session.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { new_password, confirm_password } = req.body;
  if (!new_password || !confirm_password)
    return res.status(400).json({ error: 'All fields are required' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (new_password !== confirm_password)
    return res.status(400).json({ error: 'Passwords do not match' });

  try {
    const [target] = await req.mainDb.execute('SELECT id, mandi_id FROM users WHERE id = ?', [id]);
    if (!target.length) return res.status(404).json({ error: 'User not found' });

    if (req.session.user.level === 'admin' && target[0].mandi_id !== req.session.user.mandi_id)
      return res.status(403).json({ error: 'Access denied' });

    const hash = await bcrypt.hash(new_password, 10);
    await req.mainDb.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.session.user.id)
    return res.status(400).json({ error: 'You cannot delete your own account' });

  try {
    const [target] = await req.mainDb.execute('SELECT level, mandi_id FROM users WHERE id = ?', [id]);
    if (!target.length) return res.status(404).json({ error: 'User not found' });

    if (req.session.user.level === 'admin' && target[0].mandi_id !== req.session.user.mandi_id)
      return res.status(403).json({ error: 'Access denied' });

    if (target[0].level === 'superadmin')
      return res.status(400).json({ error: 'Cannot delete a superadmin account' });

    await req.mainDb.execute('DELETE FROM user_mandis WHERE user_id = ?', [id]);
    await req.mainDb.execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
