const express = require('express');
const pool = require('../db');
const { computeDaySummary } = require('../lib/hubSync');

const router = express.Router();

// GET /api/summary/today?date=YYYY-MM-DD  -- 当日サマリー（A3-01）
router.get('/today', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date クエリパラメータが必要です' });
    const summary = await computeDaySummary(req.userId, date);
    res.json({ date, ...summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/history?days=14  -- 履歴・評価（A3-04）：直近N日のボリューム推移
router.get('/history', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 7), 60);
    const [rows] = await pool.query(
      `SELECT d.log_date, d.sets, d.volume_kg, d.exercise_count, COALESCE(m.mets_sum, 0) AS mets_sum
       FROM v_daily_workout d
       LEFT JOIN (
         SELECT l.log_date, SUM(e.mets) AS mets_sum
         FROM workout_logs l
         JOIN exercises e ON e.id = l.exercise_id
         WHERE l.user_id = ? AND l.deleted_at IS NULL
         GROUP BY l.log_date
       ) m ON m.log_date = d.log_date
       WHERE d.user_id = ? AND d.log_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY d.log_date`,
      [req.userId, req.userId, days - 1]
    );
    res.json(rows.map((r) => ({
      log_date: r.log_date,
      sets: Number(r.sets),
      volume_kg: Number(r.volume_kg),
      exercise_count: Number(r.exercise_count),
      mets_sum: Number(r.mets_sum),
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/calendar?month=YYYY-MM  -- 履歴・評価（A3-04）のカレンダー表示
router.get('/calendar', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month は YYYY-MM 形式で指定してください' });
    }
    const [rows] = await pool.query(
      `SELECT log_date, sets, volume_kg, exercise_count
       FROM v_daily_workout
       WHERE user_id = ? AND log_date BETWEEN ? AND LAST_DAY(?)`,
      [req.userId, `${month}-01`, `${month}-01`]
    );
    res.json(rows.map((r) => ({
      log_date: r.log_date,
      sets: Number(r.sets),
      volume_kg: Number(r.volume_kg),
      exercise_count: Number(r.exercise_count),
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/exercise-trend/:exerciseId  -- 種目別の重量推移（履歴画面の内訳）
router.get('/exercise-trend/:exerciseId', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT log_date, MAX(weight_kg) AS max_weight, SUM(weight_kg * reps) AS volume_kg
       FROM workout_logs
       WHERE user_id = ? AND exercise_id = ? AND deleted_at IS NULL
       GROUP BY log_date
       ORDER BY log_date DESC
       LIMIT 20`,
      [req.userId, req.params.exerciseId]
    );
    res.json(rows.map((r) => ({ log_date: r.log_date, max_weight: Number(r.max_weight), volume_kg: Number(r.volume_kg) })).reverse());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
