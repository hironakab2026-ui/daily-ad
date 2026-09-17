const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

const DEFAULT_CATEGORIES = [
  ['expense', '食費', 1],
  ['expense', '日用品', 2],
  ['expense', '交通費', 3],
  ['expense', '交際費', 4],
  ['expense', '娯楽', 5],
  ['expense', '医療', 6],
  ['expense', '固定費', 7],
  ['expense', 'その他', 99],
  ['income', '給与', 1],
  ['income', '副収入', 2],
  ['income', '臨時収入', 3],
];

// POST /api/auth/register { email, password, display_name }
router.post('/register', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { email, password, display_name: displayName } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'email は必須です' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'password は8文字以上にしてください' });
    if (!displayName || !displayName.trim()) return res.status(400).json({ error: 'display_name は必須です' });

    const hash = await bcrypt.hash(password, 10);

    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
      [email.trim().toLowerCase(), hash, displayName.trim()]
    );
    const userId = result.insertId;
    for (const [kind, name, sortOrder] of DEFAULT_CATEGORIES) {
      await conn.query(
        'INSERT INTO categories (user_id, kind, name, sort_order) VALUES (?, ?, ?, ?)',
        [userId, kind, name, sortOrder]
      );
    }
    await conn.commit();

    req.session.userId = userId;
    res.status(201).json({ id: userId, email: email.trim().toLowerCase(), display_name: displayName.trim() });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'このメールアドレスは既に登録されています' });
    }
    next(err);
  } finally {
    conn.release();
  }
});

// POST /api/auth/login { email, password }
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
