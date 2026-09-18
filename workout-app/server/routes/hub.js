const express = require('express');
const pool = require('../db');
const { syncDayToHub } = require('../lib/hubSync');

const router = express.Router();

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// GET /api/hub/connection  -- ハブ連携の状態（設定画面）。トークンそのものは返さない。
router.get('/connection', async (req, res, next) => {
  try {
    const [[conn]] = await pool.query(
      'SELECT hub_base_url, connected_at, last_synced_at, last_error FROM workout_hub_connections WHERE user_id = ?',
      [req.userId]
    );
    res.json({ connected: !!conn, ...conn });
  } catch (err) {
    next(err);
  }
});

// POST /api/hub/connection { hub_base_url, token }
//   APP-1 の 設定 > 外部サービス連携 > 運動管理アプリ で発行したトークンを登録する。
router.post('/connection', async (req, res, next) => {
  try {
    const { hub_base_url: hubBaseUrl, token } = req.body;
    if (!hubBaseUrl || !token) return res.status(400).json({ error: 'hub_base_url と token は必須です' });

    await pool.query(
      `INSERT INTO workout_hub_connections (user_id, hub_base_url, token)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE hub_base_url = VALUES(hub_base_url), token = VALUES(token),
         connected_at = NOW(), last_synced_at = NULL, last_error = NULL`,
      [req.userId, hubBaseUrl.replace(/\/$/, ''), token]
    );

    const sync = await syncDayToHub(req.userId, todayStr());
    res.status(201).json({ ok: true, sync });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/hub/connection
router.delete('/connection', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM workout_hub_connections WHERE user_id = ?', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/hub/sync  -- 手動で今日の要約を再送する（設定画面の「今すぐ同期」）
router.post('/sync', async (req, res, next) => {
  try {
    const sync = await syncDayToHub(req.userId, todayStr());
    res.json(sync);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
