const express = require('express');
const pool = require('../db');
const { requireServiceToken } = require('../middleware/tokenAuth');

const router = express.Router();

const STATUSES = ['none', 'partial', 'recorded'];

// POST /api/integrations/summary
// 外部サービス（アドオン）が Authorization: Bearer <token> で認証し、
// その日の要約を1件 UPSERT する。content_key はトークンに紐づくものに固定される
// （リクエストボディでは指定させない＝他サービスの領域を書けないようにする）。
router.post('/summary', requireServiceToken, async (req, res, next) => {
  try {
    const { target_date, status, grade, badge, metrics, deep_link } = req.body;

    if (!target_date || !/^\d{4}-\d{2}-\d{2}$/.test(target_date)) {
      return res.status(400).json({ error: 'target_date は YYYY-MM-DD 形式で指定してください' });
    }
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `status は ${STATUSES.join('/')} のいずれかにしてください` });
    }
    if (grade !== undefined && grade !== null && String(grade).length > 2) {
      return res.status(400).json({ error: 'grade は2文字以内にしてください' });
    }
    if (badge !== undefined && badge !== null && String(badge).length > 20) {
      return res.status(400).json({ error: 'badge は20文字以内にしてください' });
    }
    if (deep_link !== undefined && deep_link !== null && String(deep_link).length > 255) {
      return res.status(400).json({ error: 'deep_link は255文字以内にしてください' });
    }
    let metricsJson = null;
    if (metrics !== undefined && metrics !== null) {
      if (typeof metrics !== 'object' || Array.isArray(metrics)) {
        return res.status(400).json({ error: 'metrics はオブジェクトで指定してください' });
      }
      const keys = Object.keys(metrics);
      if (keys.length > 6) {
        return res.status(400).json({ error: 'metrics は最大6件までです' });
      }
      metricsJson = JSON.stringify(metrics);
    }

    await pool.query(
      `INSERT INTO content_summary_cache
         (user_id, content_key, target_date, status, grade, badge, metrics, deep_link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status), grade = VALUES(grade), badge = VALUES(badge),
         metrics = VALUES(metrics), deep_link = VALUES(deep_link), fetched_at = NOW()`,
      [req.userId, req.contentKey, target_date, status, grade || null, badge || null, metricsJson, deep_link || null]
    );
    await pool.query('UPDATE service_connections SET last_synced_at = NOW() WHERE id = ?', [req.connectionId]);

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
