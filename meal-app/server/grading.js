const pool = require('./db');

// F-06-01: 目標カロリーに対する達成率から grade（S/A/B/C）を出す。
// 閾値は暫定値（未定事項として要件定義書に明記済み）。目標未設定・カロリー未入力なら null。
//   差5%以内 → S / 15%以内 → A / 30%以内 → B / それ以外 → C
function gradeFromAchievementPct(pct) {
  if (pct === null || pct === undefined) return null;
  const diff = Math.abs(100 - pct);
  if (diff <= 5) return 'S';
  if (diff <= 15) return 'A';
  if (diff <= 30) return 'B';
  return 'C';
}

// F-06-01 補助：PFC（タンパク質・脂質・炭水化物）バランスの評価。
// 3栄養素それぞれの目標達成率を出し、最も悪い（100%から遠い）ものを採用する。
function pfcScore(actual, target) {
  const pcts = [];
  for (const key of ['protein_g', 'fat_g', 'carbs_g']) {
    if (actual[key] !== null && target[key] !== null && target[key] !== undefined && Number(target[key]) > 0) {
      pcts.push((Number(actual[key]) / Number(target[key])) * 100);
    }
  }
  if (pcts.length === 0) return null;
  const worstPct = pcts.reduce((worst, pct) => (Math.abs(100 - pct) > Math.abs(100 - worst) ? pct : worst));
  return gradeFromAchievementPct(worstPct);
}

// その日の食事・体重記録から content_summary_cache 用の要約を組み立てる（F-06 / F-07-01）。
async function computeDailySummary(userId, dateStr) {
  const [meals] = await pool.query(
    `SELECT calories_kcal, protein_g, fat_g, carbs_g
       FROM meal_logs WHERE user_id = ? AND meal_date = ? AND deleted_at IS NULL AND is_planned = 0`,
    [userId, dateStr]
  );
  const [[todayWeight]] = await pool.query(
    `SELECT weight_kg FROM weight_logs
       WHERE user_id = ? AND log_date = ? AND deleted_at IS NULL
       ORDER BY logged_at DESC LIMIT 1`,
    [userId, dateStr]
  );
  const [[prevWeight]] = await pool.query(
    `SELECT weight_kg FROM weight_logs
       WHERE user_id = ? AND log_date < ? AND deleted_at IS NULL
       ORDER BY log_date DESC, logged_at DESC LIMIT 1`,
    [userId, dateStr]
  );
  const [[target]] = await pool.query(
    `SELECT target_calories_kcal, target_protein_g, target_fat_g, target_carbs_g, target_weight_kg
       FROM nutrition_targets WHERE user_id = ?`,
    [userId]
  );

  const sum = (rows, key) => {
    const values = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
    if (values.length === 0) return null;
    return values.reduce((total, v) => total + Number(v), 0);
  };

  const totalKcal = sum(meals, 'calories_kcal');
  const totalProtein = sum(meals, 'protein_g');
  const actual = {
    protein_g: totalProtein,
    fat_g: sum(meals, 'fat_g'),
    carbs_g: sum(meals, 'carbs_g'),
  };
  const targetRow = target || {};

  const hasMeals = meals.length > 0;
  const hasWeight = !!todayWeight;
  const status = hasMeals ? 'recorded' : hasWeight ? 'partial' : 'none';

  let kcalTargetPct = null;
  if (totalKcal !== null && targetRow.target_calories_kcal) {
    kcalTargetPct = Math.round((totalKcal / targetRow.target_calories_kcal) * 100);
  }
  const grade = kcalTargetPct !== null ? gradeFromAchievementPct(kcalTargetPct) : null;
  const pfc = pfcScore(actual, {
    protein_g: targetRow.target_protein_g,
    fat_g: targetRow.target_fat_g,
    carbs_g: targetRow.target_carbs_g,
  });

  const weightDiff = todayWeight && prevWeight
    ? Math.round((Number(todayWeight.weight_kg) - Number(prevWeight.weight_kg)) * 10) / 10
    : null;

  let badge = null;
  if (weightDiff !== null && weightDiff <= -0.1) {
    badge = `体重${weightDiff}kg`;
  } else if (grade === 'S') {
    badge = '目標達成';
  }

  const metrics = {};
  if (totalKcal !== null) metrics.kcal = totalKcal;
  if (kcalTargetPct !== null) metrics.kcal_target_pct = kcalTargetPct;
  if (totalProtein !== null) metrics.protein_g = totalProtein;
  if (todayWeight) metrics.weight_kg = Number(todayWeight.weight_kg);
  if (weightDiff !== null) metrics.weight_diff = weightDiff;
  if (pfc !== null) metrics.pfc_score = pfc;

  // chart は自アプリの画面（グラフ表示）専用の詳細データ。
  // metrics はハブに送る要約で最大6キーの制約があるため（00_システム全体構成・連携仕様.md 4.1）、
  // ここでしか使わない fat_g / carbs_g 等はこちらに入れ、metrics には混ぜない。
  const chart = {
    actual: { kcal: totalKcal, protein_g: totalProtein, fat_g: actual.fat_g, carbs_g: actual.carbs_g },
    target: {
      calories_kcal: targetRow.target_calories_kcal ?? null,
      protein_g: targetRow.target_protein_g ?? null,
      fat_g: targetRow.target_fat_g ?? null,
      carbs_g: targetRow.target_carbs_g ?? null,
    },
    weight_kg: todayWeight ? Number(todayWeight.weight_kg) : null,
    weight_diff: weightDiff,
  };

  return { status, grade, badge, metrics, chart };
}

module.exports = { computeDailySummary, gradeFromAchievementPct };
