const express = require('express');
const pool = require('../db');
const { DEVICE_COOKIE } = require('../middleware/auth');

const router = express.Router();

// GET /api/device  -- この端末のプロフィール（ログインなし）
router.get('/', async (req, res, next) => {
  try {
    const [[user]] = await pool.query('SELECT id, display_name FROM users WHERE id = ?', [req.userId]);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/device { display_name }  -- 表示名（ニックネーム）の変更
router.patch('/', async (req, res, next) => {
  try {
    const { display_name: displayName } = req.body;
    if (!displayName || !displayName.trim()) return res.status(400).json({ error: 'display_name は必須です' });
    await pool.query('UPDATE users SET display_name = ? WHERE id = ?', [displayName.trim(), req.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/device/reset  -- この端末の紐付けを忘れる（次回アクセス時に新しい端末として再登録される）
router.post('/reset', (req, res) => {
  res.clearCookie(DEVICE_COOKIE);
  res.json({ ok: true });
});

module.exports = router;
