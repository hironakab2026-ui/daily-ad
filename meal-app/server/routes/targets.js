const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/targets  （設定画面 A2-06）
router.get('/', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT target_calories_kcal, target_protein_g, target_fat_g, target_carbs_g, target_weight_kg
         FROM nutrition_targets WHERE user_id = ?`,
      [req.userId]
    );
    res.json(row || {
      target_calories_kcal: null, target_protein_g: null, target_fat_g: null, target_carbs_g: null, target_weight_kg: null,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/targets
router.put('/', async (req, res, next) => {
  try {
    const { target_calories_kcal, target_protein_g, target_fat_g, target_carbs_g, target_weight_kg } = req.body;
    await pool.query(
      `INSERT INTO nutrition_targets (user_id, target_calories_kcal, target_protein_g, target_fat_g, target_carbs_g, target_weight_kg)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         target_calories_kcal = VALUES(target_calories_kcal), target_protein_g = VALUES(target_protein_g),
         target_fat_g = VALUES(target_fat_g), target_carbs_g = VALUES(target_carbs_g), target_weight_kg = VALUES(target_weight_kg)`,
      [req.userId, target_calories_kcal ?? null, target_protein_g ?? null, target_fat_g ?? null, target_carbs_g ?? null, target_weight_kg ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
