const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database');
const { requireAuth, requireAdmin } = require('./middleware');

const router = express.Router();

// GET /api/users/all — admin only
router.get('/all', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, level, created_at FROM users ORDER BY COALESCE(created_at, \'\'), id'
  ).all();
  res.json(users);
});

// POST /api/users/add — admin only
router.post('/add', requireAdmin, (req, res) => {
  const { username, password, level } = req.body;

  if (!username || !password || !level)
    return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!['admin', 'user'].includes(level))
    return res.status(400).json({ error: 'Level must be admin or user' });

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      "INSERT INTO users (username, password_hash, level, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(username.trim(), hash, level);
    const user = db.prepare('SELECT id, username, level, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// POST /api/users/change-password — any logged-in user (own password only)
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;

  if (!current_password || !new_password || !confirm_password)
    return res.status(400).json({ error: 'All fields are required' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  if (new_password !== confirm_password)
    return res.status(400).json({ error: 'New passwords do not match' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash))
    return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.user.id);
  res.json({ success: true });
});

// POST /api/users/:id/reset-password — admin only
router.post('/:id/reset-password', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { new_password, confirm_password } = req.body;

  if (!new_password || !confirm_password)
    return res.status(400).json({ error: 'All fields are required' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (new_password !== confirm_password)
    return res.status(400).json({ error: 'Passwords do not match' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  res.json({ success: true });
});

// DELETE /api/users/:id — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  // Cannot delete own account
  if (parseInt(id) === req.session.user.id)
    return res.status(400).json({ error: 'You cannot delete your own account' });

  // Cannot delete the last admin
  const target = db.prepare('SELECT level FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (target.level === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE level = 'admin'").get();
    if (adminCount.cnt <= 1)
      return res.status(400).json({ error: 'Cannot delete the last administrator account' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
