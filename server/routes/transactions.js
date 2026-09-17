const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/transactions?date=YYYY-MM-DD  -- 日別詳細（A1-06）の収支明細（Q5）
router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date クエリパラメータが必要です' });
    }
    const [rows] = await pool.query(
      `SELECT t.id, t.kind, t.category_id, c.name AS category, t.amount, t.memo
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.entry_date = ? AND t.deleted_at IS NULL
       ORDER BY t.kind DESC, t.id`,
      [req.userId, date]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions  -- 収支入力（A1-02） F-01-01〜07
router.post('/', async (req, res, next) => {
  try {
    const { entry_date, kind, category_id, amount, memo } = req.body;
    if (!entry_date || !kind || !category_id || !amount) {
      return res.status(400).json({ error: 'entry_date, kind, category_id, amount は必須です' });
    }
    if (!['income', 'expense'].includes(kind)) {
      return res.status(400).json({ error: 'kind は income または expense を指定してください' });
    }
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      return res.status(400).json({ error: 'amount は正の整数（円）で指定してください' });
    }
    const [[cat]] = await pool.query('SELECT id FROM categories WHERE id = ? AND user_id = ?', [category_id, req.userId]);
    if (!cat) return res.status(400).json({ error: 'カテゴリが見つかりません' });

    const [result] = await pool.query(
      'INSERT INTO transactions (user_id, entry_date, kind, category_id, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
      [req.userId, entry_date, kind, category_id, amt, memo || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/transactions/:id  -- 論理削除（Q10）
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('UPDATE transactions SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
