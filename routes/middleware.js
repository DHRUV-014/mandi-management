function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  if (!['admin', 'superadmin'].includes(req.session.user.level))
    return res.status(403).json({ error: 'Access denied' });
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  if (req.session.user.level !== 'superadmin')
    return res.status(403).json({ error: 'Super-admin access required' });
  next();
}

function requireFYDB(req, res, next) {
  if (!req.fyDb) {
    return res.status(503).json({ error: 'No active financial year for this mandi. Contact the system administrator.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requireFYDB };
