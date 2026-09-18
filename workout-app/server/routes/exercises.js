const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/exercises?all=1  -- 種目マスタ管理（A3-03）
router.get('/', async (req, res, next) => {
  try {
    const where = req.query.all ? '' : 'AND is_active = 1';
    const [rows] = await pool.query(
      `SELECT id, name, body_part, sort_order, is_active, mets, target_note FROM exercises
       WHERE user_id = ? ${where}
       ORDER BY sort_order, id`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/exercises { name, body_part, mets?, target_note? }
router.post('/', async (req, res, next) => {
  try {
    const { name, body_part: bodyPart, mets, target_note: targetNote } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name は必須です' });
    if (mets !== undefined && mets !== null && !(Number(mets) > 0 && Number(mets) < 30)) {
      return res.status(400).json({ error: 'mets は0〜30の数値で指定してください' });
    }

    const [[maxRow]] = await pool.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM exercises WHERE user_id = ?', [req.userId]);
    const [result] = await pool.query(
      'INSERT INTO exercises (user_id, name, body_part, sort_order, mets, target_note) VALUES (?, ?, ?, ?, ?, ?)',
      [req.userId, name.trim(), bodyPart || null, maxRow.max_sort + 1, mets || 3.5, (targetNote || '').trim() || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '同じ名前の種目が既にあります' });
    next(err);
  }
});

// PATCH /api/exercises/:id { name?, body_part?, is_active?, mets?, target_note? }
//   使わなくなった種目は非表示に（履歴は残る）
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, body_part: bodyPart, is_active: isActive, mets, target_note: targetNote } = req.body;
    if (mets !== undefined && mets !== null && !(Number(mets) > 0 && Number(mets) < 30)) {
      return res.status(400).json({ error: 'mets は0〜30の数値で指定してください' });
    }
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (bodyPart !== undefined) { fields.push('body_part = ?'); values.push(bodyPart || null); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (mets !== undefined) { fields.push('mets = ?'); values.push(mets || 3.5); }
    if (targetNote !== undefined) { fields.push('target_note = ?'); values.push((targetNote || '').trim() || null); }
    if (!fields.length) return res.status(400).json({ error: '更新する項目がありません' });

    values.push(req.params.id, req.userId);
    await pool.query(`UPDATE exercises SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '同じ名前の種目が既にあります' });
    next(err);
  }
});

module.exports = router;
