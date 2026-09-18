const express = require('express');
const pool = require('../db');
const { syncDayToHub } = require('../hubSync');

const router = express.Router();

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

function syncQuiet(userId, dateStr) {
  // ハブ連携は best effort。失敗しても記録自体は保存済みなのでリクエストは失敗させない。
  syncDayToHub(userId, dateStr).catch((err) => console.error('hub sync error:', err.message));
}

// food_id + quantity が指定されたら、辞書の1食分あたりの値に quantity を掛けて
// スナップショットとして保存する値を計算する（辞書を後から編集しても過去記録は変わらない）。
async function resolveNutrition(userId, { food_id, quantity, food_name, calories_kcal, protein_g, fat_g, carbs_g }) {
  if (!food_id) {
    return {
      food_id: null,
      quantity: quantity ?? 1,
      food_name: food_name?.trim(),
      calories_kcal: calories_kcal ?? null,
      protein_g: protein_g ?? null,
      fat_g: fat_g ?? null,
      carbs_g: carbs_g ?? null,
    };
  }

  const [[food]] = await pool.query('SELECT * FROM foods WHERE id = ?', [food_id]);
  if (!food) {
    const err = new Error('指定された食品が見つかりません');
    err.status = 400;
    throw err;
  }
  const qty = quantity ?? 1;
  const scale = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * qty * 10) / 10);
  return {
    food_id,
    quantity: qty,
    food_name: food_name?.trim() || `${food.name}（${food.serving_label} x${qty}）`,
    calories_kcal: food.calories_kcal === null ? null : Math.round(Number(food.calories_kcal) * qty),
    protein_g: scale(food.protein_g),
    fat_g: scale(food.fat_g),
    carbs_g: scale(food.carbs_g),
  };
}

// GET /api/meals?date=YYYY-MM-DD  (F-04-04: 1日に何件でも)
// is_planned=0 の実績と is_planned=1 の献立予定を両方返す（画面側で表示を分ける）。
router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date は YYYY-MM-DD 形式で指定してください' });
    }
    const [rows] = await pool.query(
      `SELECT id, meal_date, meal_type, logged_at, food_id, quantity, food_name,
              calories_kcal, protein_g, fat_g, carbs_g, memo, is_planned
         FROM meal_logs
        WHERE user_id = ? AND meal_date = ? AND deleted_at IS NULL
        ORDER BY is_planned ASC, logged_at ASC`,
      [req.userId, date]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/meals
router.post('/', async (req, res, next) => {
  try {
    const { meal_date, meal_type, memo, is_planned } = req.body;
    if (!meal_date || !/^\d{4}-\d{2}-\d{2}$/.test(meal_date)) {
      return res.status(400).json({ error: 'meal_date は YYYY-MM-DD 形式で指定してください' });
    }
    if (!MEAL_TYPES.includes(meal_type)) {
      return res.status(400).json({ error: `meal_type は ${MEAL_TYPES.join('/')} のいずれかにしてください` });
    }

    const nutrition = await resolveNutrition(req.userId, req.body);
    if (!nutrition.food_name) {
      return res.status(400).json({ error: 'food_name は必須です' });
    }

    const [result] = await pool.query(
      `INSERT INTO meal_logs
         (user_id, meal_date, meal_type, food_id, quantity, food_name, calories_kcal, protein_g, fat_g, carbs_g, memo, is_planned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, meal_date, meal_type, nutrition.food_id, nutrition.quantity, nutrition.food_name,
        nutrition.calories_kcal, nutrition.protein_g, nutrition.fat_g, nutrition.carbs_g, memo || null, is_planned ? 1 : 0]
    );
    if (!is_planned) syncQuiet(req.userId, meal_date);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// food_id/quantity/food_name/カロリー等、栄養に関わるフィールドが送られてきた時だけ
// 栄養値を再計算する（例：「食べた」ボタンで is_planned だけ送るリクエストで
// 既存の栄養データを null 上書きしてしまわないようにするため）。
const NUTRITION_FIELDS = ['food_id', 'quantity', 'food_name', 'calories_kcal', 'protein_g', 'fat_g', 'carbs_g'];

// PUT /api/meals/:id （F-04-05: 編集。献立予定を「食べた」に切り替える時もこれを使う）
router.put('/:id', async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      'SELECT * FROM meal_logs WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: '記録が見つかりません' });

    const { meal_date, meal_type, memo, is_planned } = req.body;
    if (meal_type && !MEAL_TYPES.includes(meal_type)) {
      return res.status(400).json({ error: `meal_type は ${MEAL_TYPES.join('/')} のいずれかにしてください` });
    }

    const touchesNutrition = NUTRITION_FIELDS.some((k) => k in req.body);
    const nutrition = touchesNutrition ? await resolveNutrition(req.userId, req.body) : {
      food_id: existing.food_id,
      quantity: existing.quantity,
      food_name: existing.food_name,
      calories_kcal: existing.calories_kcal,
      protein_g: existing.protein_g,
      fat_g: existing.fat_g,
      carbs_g: existing.carbs_g,
    };
    const nextPlanned = is_planned !== undefined ? (is_planned ? 1 : 0) : existing.is_planned;
    const nextMemo = memo !== undefined ? (memo || null) : existing.memo;

    await pool.query(
      `UPDATE meal_logs SET
         meal_date = COALESCE(?, meal_date), meal_type = COALESCE(?, meal_type),
         food_id = ?, quantity = ?, food_name = COALESCE(?, food_name),
         calories_kcal = ?, protein_g = ?, fat_g = ?, carbs_g = ?, memo = ?, is_planned = ?
       WHERE id = ? AND user_id = ?`,
      [meal_date || null, meal_type || null,
        nutrition.food_id, nutrition.quantity, nutrition.food_name,
        nutrition.calories_kcal, nutrition.protein_g, nutrition.fat_g, nutrition.carbs_g, nextMemo, nextPlanned,
        req.params.id, req.userId]
    );

    syncQuiet(req.userId, existing.meal_date);
    if (meal_date && meal_date !== existing.meal_date) syncQuiet(req.userId, meal_date);
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/meals/:id （論理削除。F-04-05）
router.delete('/:id', async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      'SELECT meal_date FROM meal_logs WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: '記録が見つかりません' });

    await pool.query('UPDATE meal_logs SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    syncQuiet(req.userId, existing.meal_date);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
