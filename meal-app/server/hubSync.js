const pool = require('./db');
const { computeDailySummary } = require('./grading');

// F-07-01/02: 記録の追加・編集・削除の都度、その日の要約を再計算してハブへ UPSERT する。
// ハブ側の連携トークンが未設定のユーザーは黙ってスキップする（連携は任意のため）。
async function syncDayToHub(userId, dateStr) {
  const [[conn]] = await pool.query('SELECT token FROM hub_connections WHERE user_id = ?', [userId]);
  if (!conn || !conn.token) return { skipped: true };

  const summary = await computeDailySummary(userId, dateStr);
  const deepLink = process.env.MEAL_APP_PUBLIC_URL
    ? `${process.env.MEAL_APP_PUBLIC_URL}/#/summary/${dateStr}`
    : null;

  const res = await fetch(`${process.env.HUB_API_BASE}/api/integrations/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${conn.token}`,
    },
    body: JSON.stringify({
      target_date: dateStr,
      status: summary.status,
      grade: summary.grade,
      badge: summary.badge,
      metrics: summary.metrics,
      deep_link: deepLink,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`hub sync failed (${res.status}): ${body}`);
    return { skipped: false, ok: false };
  }
  return { skipped: false, ok: true };
}

module.exports = { syncDayToHub };
