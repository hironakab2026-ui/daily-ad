const express = require('express');
const pool = require('../db');
const { recognizePhoto } = require('../photoRecognition');

const router = express.Router();

// GET /api/foods/search?q=...  食品名オートコンプリート（F-04改善）
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const [rows] = await pool.query(
      `SELECT id, name, serving_label, serving_grams, calories_kcal, protein_g, fat_g, carbs_g
         FROM foods WHERE name LIKE ? ORDER BY name LIMIT 20`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/foods/barcode { barcode }
// まず辞書を探し、無ければ Open Food Facts で調べて辞書に追加する。
router.post('/barcode', async (req, res, next) => {
  try {
    const { barcode } = req.body;
    if (!barcode || !/^\d{6,14}$/.test(barcode)) {
      return res.status(400).json({ error: 'barcode は6〜14桁の数字で指定してください' });
    }

    const [[existing]] = await pool.query('SELECT * FROM foods WHERE barcode = ?', [barcode]);
    if (existing) return res.json(existing);

    const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    if (!offRes.ok) return res.status(502).json({ error: '商品データベースへの問い合わせに失敗しました' });
    const offData = await offRes.json();
    if (offData.status !== 1 || !offData.product) {
      return res.status(404).json({ error: 'このバーコードの商品が見つかりませんでした' });
    }

    const p = offData.product;
    const n = p.nutriments || {};
    const kcal = n['energy-kcal_100g'];
    if (kcal === undefined || kcal === null) {
      return res.status(404).json({ error: '商品は見つかりましたが栄養情報がありませんでした' });
    }

    const name = p.product_name || p.generic_name || `商品(${barcode})`;
    const [result] = await pool.query(
      `INSERT INTO foods (name, serving_label, serving_grams, calories_kcal, protein_g, fat_g, carbs_g, barcode, source)
       VALUES (?, '100g', 100, ?, ?, ?, ?, ?, 'barcode')`,
      [name, Math.round(kcal), n.proteins_100g ?? null, n.fat_100g ?? null, n.carbohydrates_100g ?? null, barcode]
    );
    const [[created]] = await pool.query('SELECT * FROM foods WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const [[existing]] = await pool.query('SELECT * FROM foods WHERE barcode = ?', [req.body.barcode]);
      if (existing) return res.json(existing);
    }
    next(err);
  }
});

// POST /api/foods/recognize-photo { image: 'data:image/jpeg;base64,...' }
// 写真から食品名・概算栄養価をAIで推定する（F-04改善）。ANTHROPIC_API_KEY 未設定なら501。
router.post('/recognize-photo', async (req, res, next) => {
  try {
    const { image } = req.body;
    if (!image || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'image は data:image/... 形式のBase64で指定してください' });
    }
    const result = await recognizePhoto(image);
    res.json(result);
  } catch (err) {
    if (err.code === 'NO_API_KEY') {
      return res.status(501).json({ error: 'この機能を使うには meal-app/.env に ANTHROPIC_API_KEY を設定してください' });
    }
    next(err);
  }
});

module.exports = router;
