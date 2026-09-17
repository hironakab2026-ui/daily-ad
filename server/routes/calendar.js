const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/calendar?month=YYYY-MM  -- カレンダー（A1-05）: Q4 一括取得（性能要件：日ごとに問い合わせない）
router.get('/', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month は YYYY-MM 形式で指定してください' });
    }
    const monthStart = `${month}-01`;
    const [rows] = await pool.query(
      `SELECT * FROM v_calendar_cell
       WHERE user_id = ? AND target_date BETWEEN ? AND LAST_DAY(?)
       ORDER BY target_date`,
      [req.userId, monthStart, monthStart]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/calendar/day/:date  -- 日別詳細（A1-06）: 収支明細 + タスク一覧をまとめて取得
router.get('/day/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    const [transactions] = await pool.query(
      `SELECT t.id, t.kind, c.name AS category, t.amount, t.memo
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.entry_date = ? AND t.deleted_at IS NULL
       ORDER BY t.kind DESC, t.id`,
      [req.userId, date]
    );
    const [tasks] = await pool.query(
      `SELECT l.id, l.task_name_snapshot AS name, l.task_type_snapshot AS type,
              l.is_done, l.completed_at
       FROM task_logs l
       WHERE l.user_id = ? AND l.target_date = ?
       ORDER BY l.id`,
      [req.userId, date]
    );
    res.json({ date, transactions, tasks });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
