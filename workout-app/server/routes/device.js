const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/device  -- この端末（＝ハブと共通のアカウント）のプロフィール（読み取り専用）
//   ニックネーム変更・端末リセットはハブ（APP-1）側でのみ行う（同じ users 行を指すため、
//   二重に変更手段を持たせない）。
router.get('/', async (req, res, next) => {
  try {
    const [[user]] = await pool.query('SELECT id, display_name FROM users WHERE id = ?', [req.userId]);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
