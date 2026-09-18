const express = require('express');
const pool = require('../db');
const { syncDayToHub } = require('../hubSync');

const router = express.Router();

function syncQuiet(userId, dateStr) {
  syncDayToHub(userId, dateStr).catch((err) => console.error('hub sync error:', err.message));
}

function latestPerDay(rows) {
  const byDate = new Map();
  for (const row of rows) {
    byDate.set(row.log_date, row); // rows は日付・logged_at昇順なので後勝ちで最新が残る
  }
  return [...byDate.values()];
}

// GET /api/weights?date=YYYY-MM-DD          その日の全記録（同日複数回の履歴確認用）
// GET /api/weights?from=YYYY-MM-DD&to=...   期間内、1日1件（最新値）。カレンダー・グラフ用（F-05-01）
router.get('/', async (req, res, next) => {
  try {
    const { date, from, to } = req.query;
    if (date) {
      const [rows] = await pool.query(
        `SELECT id, log_date, logged_at, weight_kg, body_fat_pct
           FROM weight_logs WHERE user_id = ? AND log_date = ? AND deleted_at IS NULL
          ORDER BY logged_at ASC`,
        [req.userId, date]
      );
      return res.json(rows);
    }
    if (from && to) {
      const [rows] = await pool.query(
        `SELECT id, log_date, logged_at, weight_kg, body_fat_pct
           FROM weight_logs WHERE user_id = ? AND log_date BETWEEN ? AND ? AND deleted_at IS NULL
          ORDER BY log_date ASC, logged_at ASC`,
        [req.userId, from, to]
      );
      return res.json(latestPerDay(rows));
    }
    return res.status(400).json({ error: 'date または from+to を指定してください' });
  } catch (err) {
    next(err);
  }
});

// POST /api/weights
router.post('/', async (req, res, next) => {
  try {
    const { log_date, weight_kg, body_fat_pct } = req.body;
    if (!log_date || !/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
      return res.status(400).json({ error: 'log_date は YYYY-MM-DD 形式で指定してください' });
    }
    if (weight_kg === undefined || weight_kg === null || Number(weight_kg) <= 0) {
      return res.status(400).json({ error: 'weight_kg は必須です' });
    }

    const [result] = await pool.query(
      `INSERT INTO weight_logs (user_id, log_date, weight_kg, body_fat_pct) VALUES (?, ?, ?, ?)`,
      [req.userId, log_date, weight_kg, body_fat_pct ?? null]
    );
    syncQuiet(req.userId, log_date);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/weights/:id
router.put('/:id', async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      'SELECT log_date FROM weight_logs WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: '記録が見つかりません' });

    const { weight_kg, body_fat_pct } = req.body;
    if (weight_kg === undefined || weight_kg === null || Number(weight_kg) <= 0) {
      return res.status(400).json({ error: 'weight_kg は必須です' });
    }

    await pool.query('UPDATE weight_logs SET weight_kg = ?, body_fat_pct = ? WHERE id = ? AND user_id = ?', [
      weight_kg, body_fat_pct ?? null, req.params.id, req.userId,
    ]);
    syncQuiet(req.userId, existing.log_date);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/weights/:id （論理削除）
router.delete('/:id', async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      'SELECT log_date FROM weight_logs WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: '記録が見つかりません' });

    await pool.query('UPDATE weight_logs SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    syncQuiet(req.userId, existing.log_date);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
