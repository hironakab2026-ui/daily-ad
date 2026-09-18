const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/plans?month=YYYY-MM  -- その月の分割メニュー予定一覧（カレンダー用）
router.get('/', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month は YYYY-MM 形式で指定してください' });
    }
    const [rows] = await pool.query(
      `SELECT plan_date, category FROM training_plans
       WHERE user_id = ? AND plan_date BETWEEN ? AND LAST_DAY(?)`,
      [req.userId, `${month}-01`, `${month}-01`]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PUT /api/plans/:date { category }  -- その日の予定を設定・上書き
router.put('/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    const { category } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date は YYYY-MM-DD 形式で指定してください' });
    if (!category || !category.trim()) return res.status(400).json({ error: 'category は必須です' });

    await pool.query(
      `INSERT INTO training_plans (user_id, plan_date, category) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE category = VALUES(category)`,
      [req.userId, date, category.trim()]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/plans/:date  -- その日の予定を取り消す
router.delete('/:date', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM training_plans WHERE user_id = ? AND plan_date = ?', [req.userId, req.params.date]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
