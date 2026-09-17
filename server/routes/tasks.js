const express = require('express');
const pool = require('../db');

const router = express.Router();

const FREQS = ['daily', 'weekly', 'monthly', 'once'];
const TYPES = ['routine', 'single'];

// GET /api/tasks/definitions?all=1  -- タスク定義一覧（A1-04）
router.get('/definitions', async (req, res, next) => {
  try {
    const { all } = req.query;
    const where = all
      ? 'user_id = ? AND deleted_at IS NULL'
      : 'user_id = ? AND deleted_at IS NULL AND (end_date IS NULL OR end_date >= CURDATE())';
    const [rows] = await pool.query(
      `SELECT id, name, task_type, freq, byweekday, bymonthday, start_date, end_date,
              remind_time, color, memo
       FROM task_definitions
       WHERE ${where}
       ORDER BY (end_date IS NOT NULL), start_date DESC, id DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/definitions  -- タスク定義作成 F-02-01〜12
router.post('/definitions', async (req, res, next) => {
  try {
    const {
      name, task_type, freq, byweekday, bymonthday,
      start_date, end_date, remind_time, color, memo,
    } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'name は必須です' });
    if (!TYPES.includes(task_type)) return res.status(400).json({ error: 'task_type が不正です' });
    if (!FREQS.includes(freq)) return res.status(400).json({ error: 'freq が不正です' });
    if (!start_date) return res.status(400).json({ error: 'start_date は必須です' });
    if (freq === 'weekly' && !byweekday) {
      return res.status(400).json({ error: 'freq=weekly の場合 byweekday は必須です' });
    }
    if (freq === 'monthly' && !bymonthday) {
      return res.status(400).json({ error: 'freq=monthly の場合 bymonthday は必須です' });
    }
    if (end_date && end_date < start_date) {
      return res.status(400).json({ error: 'end_date は start_date 以降にしてください' });
    }

    const [result] = await pool.query(
      `INSERT INTO task_definitions
        (user_id, name, task_type, freq, byweekday, bymonthday, start_date, end_date, remind_time, color, memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId, name.trim(), task_type, freq,
        byweekday || null, bymonthday || null,
        start_date, end_date || null,
        remind_time || null, color || null, memo || null,
      ]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tasks/definitions/:id  -- 内容の編集（過去の task_logs には影響しない）
router.patch('/definitions/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'freq', 'byweekday', 'bymonthday', 'start_date', 'end_date', 'remind_time', 'color', 'memo'];
    const fields = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(req.body[key] === '' ? null : req.body[key]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: '更新する項目がありません' });
    params.push(req.params.id, req.userId);
    await pool.query(`UPDATE task_definitions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/definitions/:id/stop { end_date }  -- Q9: やめる（削除しない）
router.post('/definitions/:id/stop', async (req, res, next) => {
  try {
    const { end_date } = req.body;
    if (!end_date) return res.status(400).json({ error: 'end_date は必須です' });
    await pool.query('UPDATE task_definitions SET end_date = ? WHERE id = ? AND user_id = ?', [end_date, req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/definitions/:id  -- 論理削除（設定画面の奥・要確認フラグ）
router.delete('/definitions/:id', async (req, res, next) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: '過去記録も削除される操作です。confirm: true を指定してください' });
    }
    await pool.query('UPDATE task_definitions SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/today?date=YYYY-MM-DD  -- 当日タスク一覧（A1-03）: Q1（予定生成）+ Q2（一覧取得）
router.get('/today', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date クエリパラメータが必要です' });

    // Q1: その日の予定行を生成（UNIQUE制約があるので二重生成されない）
    await conn.query(
      `INSERT IGNORE INTO task_logs
          (user_id, task_definition_id, target_date, is_done, task_name_snapshot, task_type_snapshot)
       SELECT td.user_id, td.id, ?, 0, td.name, td.task_type
       FROM task_definitions td
       WHERE td.user_id = ?
         AND td.deleted_at IS NULL
         AND ? >= td.start_date
         AND ? <= COALESCE(td.end_date, '9999-12-31')
         AND (
               td.freq = 'daily'
            OR (td.freq = 'once'    AND td.start_date = ?)
            OR (td.freq = 'monthly' AND td.bymonthday = DAY(?))
            OR (td.freq = 'weekly'  AND LOCATE(
                   CASE DAYOFWEEK(?)
                       WHEN 1 THEN 'SU' WHEN 2 THEN 'MO' WHEN 3 THEN 'TU'
                       WHEN 4 THEN 'WE' WHEN 5 THEN 'TH' WHEN 6 THEN 'FR'
                       ELSE 'SA' END,
                   td.byweekday
               ) > 0)
             )`,
      [date, req.userId, date, date, date, date, date]
    );

    // Q2: 当日のタスク一覧
    const [rows] = await conn.query(
      `SELECT l.id, l.task_definition_id, l.task_name_snapshot AS name,
              l.task_type_snapshot AS type, l.is_done, l.completed_at,
              td.memo, td.color, td.remind_time
       FROM task_logs l
       JOIN task_definitions td ON td.id = l.task_definition_id
       WHERE l.user_id = ? AND l.target_date = ?
       ORDER BY td.remind_time IS NULL, td.remind_time, l.id`,
      [req.userId, date]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  } finally {
    conn.release();
  }
});

// POST /api/tasks/logs/:id/toggle  -- Q3: 実行ボタン（0⇄1、completed_at を先に書く）
router.post('/logs/:id/toggle', async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE task_logs
       SET completed_at = CASE WHEN is_done = 0 THEN NOW() ELSE NULL END,
           is_done      = 1 - is_done
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.userId]
    );
    const [[row]] = await pool.query('SELECT id, is_done, completed_at FROM task_logs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/definitions/:id/streak?date=YYYY-MM-DD  -- Q8: 連続達成日数
router.get('/definitions/:id/streak', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date クエリパラメータが必要です' });
    const [[row]] = await pool.query(
      `WITH ordered AS (
          SELECT target_date, is_done,
                 ROW_NUMBER() OVER (ORDER BY target_date DESC) AS rn
          FROM task_logs
          WHERE task_definition_id = ? AND user_id = ? AND target_date <= ?
       ),
       first_miss AS (SELECT MIN(rn) AS rn FROM ordered WHERE is_done = 0)
       SELECT COALESCE((SELECT rn FROM first_miss) - 1, (SELECT COUNT(*) FROM ordered)) AS streak`,
      [req.params.id, req.userId, date]
    );
    res.json({ streak: row.streak });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
