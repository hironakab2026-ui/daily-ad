const express = require('express');
const pool = require('../db');

const router = express.Router();

function monthRange(month) {
  // month: 'YYYY-MM' -> 'YYYY-MM-DD'
  return `${month}-01`;
}

// GET /api/summary/today?date=YYYY-MM-DD  -- 当日サマリー（A1-01）
router.get('/today', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date クエリパラメータが必要です' });

    const [[balance]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0) AS expense
       FROM transactions
       WHERE user_id = ? AND entry_date = ? AND deleted_at IS NULL`,
      [req.userId, date]
    );
    const income = Number(balance.income);
    const expense = Number(balance.expense);

    const [[task]] = await pool.query(
      `SELECT COUNT(*) AS planned, COALESCE(SUM(is_done), 0) AS done
       FROM task_logs
       WHERE user_id = ? AND target_date = ?`,
      [req.userId, date]
    );

    res.json({
      date,
      income,
      expense,
      net: income - expense,
      task_planned: Number(task.planned),
      task_done: Number(task.done),
      task_rate: task.planned > 0 ? Math.round((task.done / task.planned) * 1000) / 10 : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/month?month=YYYY-MM  -- 月次サマリー（A1-07）: Q6（カテゴリ別支出）+ Q7（平均完遂率）
router.get('/month', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month は YYYY-MM 形式で指定してください' });
    }
    const monthStart = monthRange(month);

    const [byCategory] = await pool.query(
      `SELECT
         c.name AS category,
         SUM(t.amount) AS total,
         COUNT(*) AS cnt,
         ROUND(100.0 * SUM(t.amount) / (
           SELECT SUM(amount) FROM transactions
           WHERE user_id = ? AND kind = 'expense' AND deleted_at IS NULL
             AND entry_date BETWEEN ? AND LAST_DAY(?)
         ), 1) AS pct
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.kind = 'expense' AND t.deleted_at IS NULL
         AND t.entry_date BETWEEN ? AND LAST_DAY(?)
       GROUP BY c.name
       ORDER BY total DESC`,
      [req.userId, monthStart, monthStart, req.userId, monthStart, monthStart]
    );

    const [[totals]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0) AS expense
       FROM transactions
       WHERE user_id = ? AND deleted_at IS NULL AND entry_date BETWEEN ? AND LAST_DAY(?)`,
      [req.userId, monthStart, monthStart]
    );

    const [[taskRate]] = await pool.query(
      `SELECT
         ROUND(AVG(rate), 1) AS avg_rate,
         COUNT(*) AS active_days,
         COALESCE(SUM(planned), 0) AS total_planned,
         COALESCE(SUM(done), 0) AS total_done
       FROM v_daily_task
       WHERE user_id = ? AND target_date BETWEEN ? AND LAST_DAY(?)`,
      [req.userId, monthStart, monthStart]
    );

    res.json({
      month,
      income: Number(totals.income),
      expense: Number(totals.expense),
      net: Number(totals.income) - Number(totals.expense),
      by_category: byCategory.map((r) => ({ ...r, total: Number(r.total), cnt: Number(r.cnt), pct: Number(r.pct) })),
      task: {
        avg_rate: taskRate.avg_rate !== null ? Number(taskRate.avg_rate) : null,
        active_days: Number(taskRate.active_days),
        total_planned: Number(taskRate.total_planned),
        total_done: Number(taskRate.total_done),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/trend?months=6  -- サマリー画面の月別比較（収支の推移・タスク達成率の推移）
router.get('/trend', async (req, res, next) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 2), 12);
    const now = new Date();
    const targets = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      targets.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const [balanceRows] = await pool.query(
      `SELECT DATE_FORMAT(entry_date, '%Y-%m') AS month,
              SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END) AS net
       FROM transactions
       WHERE user_id = ? AND deleted_at IS NULL
         AND entry_date BETWEEN ? AND LAST_DAY(?)
       GROUP BY month`,
      [req.userId, `${targets[0]}-01`, `${targets[targets.length - 1]}-01`]
    );
    const [taskRows] = await pool.query(
      `SELECT DATE_FORMAT(target_date, '%Y-%m') AS month, ROUND(AVG(rate), 1) AS avg_rate
       FROM v_daily_task
       WHERE user_id = ? AND target_date BETWEEN ? AND LAST_DAY(?)
       GROUP BY month`,
      [req.userId, `${targets[0]}-01`, `${targets[targets.length - 1]}-01`]
    );
    const netByMonth = Object.fromEntries(balanceRows.map((r) => [r.month, Number(r.net)]));
    const rateByMonth = Object.fromEntries(taskRows.map((r) => [r.month, r.avg_rate !== null ? Number(r.avg_rate) : null]));

    res.json(targets.map((month) => ({
      month,
      net: netByMonth[month] ?? 0,
      task_rate: rateByMonth[month] ?? null,
    })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
