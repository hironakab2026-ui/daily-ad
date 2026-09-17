const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/categories?kind=income|expense&all=1
router.get('/', async (req, res, next) => {
  try {
    const { kind, all } = req.query;
    const conditions = ['user_id = ?'];
    const params = [req.userId];
    if (!all) {
      conditions.push('is_active = 1');
    }
    if (kind) {
      conditions.push('kind = ?');
      params.push(kind);
    }
    const [rows] = await pool.query(
      `SELECT id, kind, name, sort_order, is_active FROM categories WHERE ${conditions.join(' AND ')} ORDER BY kind, sort_order, id`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories { kind, name, sort_order }
router.post('/', async (req, res, next) => {
  try {
    const { kind, name, sort_order = 0 } = req.body;
    if (!kind || !['income', 'expense'].includes(kind)) {
      return res.status(400).json({ error: 'kind は income または expense を指定してください' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name は必須です' });
    }
    const [result] = await pool.query(
      'INSERT INTO categories (user_id, kind, name, sort_order) VALUES (?, ?, ?, ?)',
      [req.userId, kind, name.trim(), sort_order]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '同じ種別・名前のカテゴリが既にあります' });
    }
    next(err);
  }
});

// PATCH /api/categories/:id { name?, sort_order?, is_active? }
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, sort_order, is_active } = req.body;
    const fields = [];
    const params = [];
    if (name !== undefined) {
      fields.push('name = ?');
      params.push(name.trim());
    }
    if (sort_order !== undefined) {
      fields.push('sort_order = ?');
      params.push(sort_order);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    if (!fields.length) {
      return res.status(400).json({ error: '更新する項目がありません' });
    }
    params.push(req.params.id, req.userId);
    await pool.query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
