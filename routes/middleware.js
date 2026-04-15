function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  if (req.session.user.level !== 'admin') return res.status(403).json({ error: 'Access denied' });
  next();
}

module.exports = { requireAuth, requireAdmin };
