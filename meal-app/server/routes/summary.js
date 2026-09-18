const express = require('express');
const pool = require('../db');
const { computeDailySummary } = require('../grading');

const router = express.Router();

const GRADE_SCORE = { S: 4, A: 3, B: 2, C: 1 };
const SCORE_GRADE = ['C', 'C', 'B', 'A', 'S']; // index = round(score)

function averageGrade(grades) {
  const scored = grades.filter(Boolean).map((g) => GRADE_SCORE[g]);
  if (scored.length === 0) return null;
  const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
  return SCORE_GRADE[Math.round(avg)];
}

// GET /api/summary/:date  （当日サマリー A2-01）
router.get('/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date は YYYY-MM-DD 形式で指定してください' });
    }
    const summary = await computeDailySummary(req.userId, date);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/month/:ym  （履歴・カレンダー A2-04。月単位でまとめて取得する）
router.get('/month/:ym', async (req, res, next) => {
  try {
    const { ym } = req.params;
    if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'ym は YYYY-MM 形式で指定してください' });
    const [year, month] = ym.split('-').map(Number);
    const from = `${ym}-01`;
    const to = new Date(year, month, 0).toISOString().slice(0, 10); // 月末日

    const [mealDates] = await pool.query(
      'SELECT DISTINCT meal_date AS d FROM meal_logs WHERE user_id = ? AND meal_date BETWEEN ? AND ? AND deleted_at IS NULL',
      [req.userId, from, to]
    );
    const [weightDates] = await pool.query(
      'SELECT DISTINCT log_date AS d FROM weight_logs WHERE user_id = ? AND log_date BETWEEN ? AND ? AND deleted_at IS NULL',
      [req.userId, from, to]
    );
    const [plannedDates] = await pool.query(
      'SELECT DISTINCT meal_date AS d FROM meal_logs WHERE user_id = ? AND meal_date BETWEEN ? AND ? AND deleted_at IS NULL AND is_planned = 1',
      [req.userId, from, to]
    );
    const plannedSet = new Set(plannedDates.map((r) => r.d));
    const dates = [...new Set([...mealDates, ...weightDates].map((r) => r.d))].sort();

    const days = await Promise.all(dates.map(async (d) => ({
      date: d,
      has_planned: plannedSet.has(d),
      ...(await computeDailySummary(req.userId, d)),
    })));
    res.json(days);
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/report/:from/:to  （栄養評価レポート A2-05。週次・月次のgrade平均・傾向）
router.get('/report/:from/:to', async (req, res, next) => {
  try {
    const { from, to } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'from/to は YYYY-MM-DD 形式で指定してください' });
    }

    const [mealDates] = await pool.query(
      'SELECT DISTINCT meal_date AS d FROM meal_logs WHERE user_id = ? AND meal_date BETWEEN ? AND ? AND deleted_at IS NULL',
      [req.userId, from, to]
    );
    const dates = [...new Set(mealDates.map((r) => r.d))].sort();
    const days = await Promise.all(dates.map(async (d) => ({ date: d, ...(await computeDailySummary(req.userId, d)) })));

    res.json({
      from,
      to,
      average_grade: averageGrade(days.map((d) => d.grade)),
      days,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
