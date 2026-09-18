const express = require('express');
const pool = require('../db');
const { syncDayToHub } = require('../lib/hubSync');

const router = express.Router();

// GET /api/workouts?date=YYYY-MM-DD  -- その日の記録（A3-02）
router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date クエリパラメータが必要です' });
    const [rows] = await pool.query(
      `SELECT l.id, l.exercise_id, e.name AS exercise_name, e.body_part AS exercise_body_part,
              e.mets AS exercise_mets, l.set_no, l.weight_kg, l.reps, l.memo
       FROM workout_logs l
       JOIN exercises e ON e.id = l.exercise_id
       WHERE l.user_id = ? AND l.log_date = ? AND l.deleted_at IS NULL
       ORDER BY l.id`,
      [req.userId, date]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/workouts  -- トレーニング記録（A3-02） F相当: 種目・重量・回数を1セット追加
router.post('/', async (req, res, next) => {
  try {
    const { log_date: logDate, exercise_id: exerciseId, weight_kg: weightKg, reps, memo } = req.body;
    if (!logDate || !exerciseId || weightKg === undefined || reps === undefined) {
      return res.status(400).json({ error: 'log_date, exercise_id, weight_kg, reps は必須です' });
    }
    const weight = Number(weightKg);
    const repsNum = Number(reps);
    if (!(weight >= 0) || !Number.isInteger(repsNum) || repsNum <= 0) {
      return res.status(400).json({ error: 'weight_kg は0以上の数値、reps は正の整数で指定してください' });
    }
    const [[ex]] = await pool.query('SELECT id FROM exercises WHERE id = ? AND user_id = ?', [exerciseId, req.userId]);
    if (!ex) return res.status(400).json({ error: '種目が見つかりません' });

    const [[cnt]] = await pool.query(
      'SELECT COUNT(*) AS n FROM workout_logs WHERE user_id = ? AND exercise_id = ? AND log_date = ? AND deleted_at IS NULL',
      [req.userId, exerciseId, logDate]
    );
    const setNo = cnt.n + 1;

    const [result] = await pool.query(
      'INSERT INTO workout_logs (user_id, exercise_id, log_date, set_no, weight_kg, reps, memo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.userId, exerciseId, logDate, setNo, weight, repsNum, memo || null]
    );

    const sync = await syncDayToHub(req.userId, logDate);
    res.status(201).json({ id: result.insertId, set_no: setNo, sync });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/workouts/:id  -- 論理削除
router.delete('/:id', async (req, res, next) => {
  try {
    const [[log]] = await pool.query('SELECT log_date FROM workout_logs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!log) return res.status(404).json({ error: '記録が見つかりません' });

    await pool.query('UPDATE workout_logs SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    const sync = await syncDayToHub(req.userId, log.log_date);
    res.json({ ok: true, sync });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
