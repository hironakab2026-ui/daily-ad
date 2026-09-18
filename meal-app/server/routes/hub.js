const express = require('express');
const pool = require('../db');
const { syncDayToHub } = require('../hubSync');

const router = express.Router();

// GET /api/hub-connection  （設定画面 A2-06：連携状態の表示）
router.get('/', async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT token, updated_at FROM hub_connections WHERE user_id = ?', [req.userId]);
    res.json({ connected: !!row?.token, updated_at: row?.updated_at || null });
  } catch (err) {
    next(err);
  }
});

// PUT /api/hub-connection { token }
// APP-1（ハブ）の「設定→認証トークン」で発行したトークンを貼り付けて連携する。
router.put('/', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token || !token.trim()) return res.status(400).json({ error: 'token は必須です' });

    await pool.query(
      `INSERT INTO hub_connections (user_id, token) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE token = VALUES(token)`,
      [req.userId, token.trim()]
    );

    const today = new Date().toISOString().slice(0, 10);
    const result = await syncDayToHub(req.userId, today).catch((err) => ({ ok: false, error: err.message }));
    res.json({ ok: true, testSync: result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/hub-connection  （連携解除）
router.delete('/', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM hub_connections WHERE user_id = ?', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
