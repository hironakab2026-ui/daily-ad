// ハブ（APP-1）への要約送出。
//   00_システム全体構成・連携仕様.md 4.1 のルールに従い、
//   「記録が作成・更新されたタイミングで、その日の行を1回 UPSERT する」。
//   content_key は 'workout' 固定（トークンに紐づいているため送る必要はない）。
const pool = require('../db');
const { gradeForWeekDays } = require('./grade');

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

async function computeDaySummary(userId, date) {
  const [[today]] = await pool.query(
    'SELECT sets, volume_kg, exercise_count FROM v_daily_workout WHERE user_id = ? AND log_date = ?',
    [userId, date]
  );
  // 消費カロリー推定用：その日の全セットのメッツ値の合計
  // （体重はこのアプリのDBに持たないため、掛け算はフロントエンド側でローカル保存の体重を使って行う）
  const [[metsRow]] = await pool.query(
    `SELECT COALESCE(SUM(e.mets), 0) AS mets_sum
     FROM workout_logs l JOIN exercises e ON e.id = l.exercise_id
     WHERE l.user_id = ? AND l.log_date = ? AND l.deleted_at IS NULL`,
    [userId, date]
  );

  const weekStart = addDays(date, -6);
  const [weekRows] = await pool.query(
    'SELECT log_date, sets, volume_kg FROM v_daily_workout WHERE user_id = ? AND log_date BETWEEN ? AND ?',
    [userId, weekStart, date]
  );
  const weekDays = weekRows.length;
  const weekVolume = weekRows.reduce((sum, r) => sum + Number(r.volume_kg), 0);

  // 連続トレーニング日数（date から遡って、記録が途切れるまで）
  const [recentRows] = await pool.query(
    `SELECT DISTINCT log_date FROM workout_logs
     WHERE user_id = ? AND deleted_at IS NULL AND log_date <= ?
     ORDER BY log_date DESC LIMIT 60`,
    [userId, date]
  );
  const recentDates = new Set(recentRows.map((r) => r.log_date));
  let streak = 0;
  let cursor = date;
  while (recentDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const sets = today ? Number(today.sets) : 0;
  const volumeKg = today ? Number(today.volume_kg) : 0;

  return {
    status: sets > 0 ? 'recorded' : 'none',
    grade: gradeForWeekDays(weekDays),
    badge: streak >= 3 ? `${streak}日連続トレーニング` : null,
    metrics: {
      sets,
      volume_kg: Math.round(volumeKg),
      week_days: weekDays,
      week_volume_kg: Math.round(weekVolume),
      streak_days: streak,
    },
    mets_sum: Number(metsRow.mets_sum), // ハブへは送らない内部用の値ではないが、metricsの6件制限には含めない
  };
}

// 指定日の要約をハブへ UPSERT する。連携未設定なら何もしない。
// 呼び出し側の保存処理をブロックしないよう、失敗しても例外は投げない
// （エラーは workout_hub_connections.last_error に記録するのみ）。
async function syncDayToHub(userId, date) {
  const [[conn]] = await pool.query(
    'SELECT hub_base_url, token FROM workout_hub_connections WHERE user_id = ?',
    [userId]
  );
  if (!conn) return { skipped: true };

  const summary = await computeDaySummary(userId, date);
  const deepLink = process.env.PUBLIC_APP_URL ? `${process.env.PUBLIC_APP_URL}/` : null;

  try {
    const res = await fetch(`${conn.hub_base_url}/api/integrations/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.token}` },
      body: JSON.stringify({ target_date: date, deep_link: deepLink, ...summary }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `ハブへの送信に失敗しました (${res.status})`);
    }
    await pool.query('UPDATE workout_hub_connections SET last_synced_at = NOW(), last_error = NULL WHERE user_id = ?', [userId]);
    return { ok: true };
  } catch (err) {
    await pool.query('UPDATE workout_hub_connections SET last_error = ? WHERE user_id = ?', [err.message.slice(0, 255), userId]);
    return { ok: false, error: err.message };
  }
}

module.exports = { syncDayToHub, computeDaySummary };
