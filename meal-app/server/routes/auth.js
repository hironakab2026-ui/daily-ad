const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

// POST /api/auth/login { email, password }
// users テーブルはハブ（APP-1）と共有。アカウント作成はハブ側で行う想定のため
// このアプリでは register を持たず、既存ユーザーでのログインのみ提供する。
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email と password は必須です' });

    const [[user]] = await pool.query(
      'SELECT id, email, password_hash, display_name FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );
    if (!user) return res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });

    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email, display_name: user.display_name });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'ログインしていません' });
    const [[user]] = await pool.query('SELECT id, email, display_name FROM users WHERE id = ?', [req.session.userId]);
    if (!user) return res.status(401).json({ error: 'ログインしていません' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
