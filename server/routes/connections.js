const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { hashToken } = require('../middleware/tokenAuth');
const { AVAILABLE_SERVICES, isValidContentKey } = require('../services');

const router = express.Router();

// GET /api/connections  -- 連携可能なサービス一覧＋自分の連携状況
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT content_key, connected_at, last_synced_at FROM service_connections WHERE user_id = ?',
      [req.userId]
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.content_key, r]));
    res.json(AVAILABLE_SERVICES.map((s) => ({
      ...s,
      connected: !!byKey[s.content_key],
      connected_at: byKey[s.content_key]?.connected_at || null,
      last_synced_at: byKey[s.content_key]?.last_synced_at || null,
    })));
  } catch (err) {
    next(err);
  }
});

// POST /api/connections/:contentKey/connect  -- トークンを発行して連携する（既存トークンは失効）
router.post('/:contentKey/connect', async (req, res, next) => {
  try {
    const { contentKey } = req.params;
    if (!isValidContentKey(contentKey)) return res.status(400).json({ error: '未知のサービスです' });

    const token = crypto.randomBytes(24).toString('hex');
    await pool.query(
      `INSERT INTO service_connections (user_id, content_key, token_hash)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), connected_at = NOW(), last_synced_at = NULL`,
      [req.userId, contentKey, hashToken(token)]
    );
    res.status(201).json({ token });
  } catch (err) {
    next(err);
  }
});

// POST /api/connections/:contentKey/disconnect
router.post('/:contentKey/disconnect', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM service_connections WHERE user_id = ? AND content_key = ?', [req.userId, req.params.contentKey]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
