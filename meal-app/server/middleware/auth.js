function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }
  req.userId = req.session.userId;
  next();
}

module.exports = { requireAuth };
