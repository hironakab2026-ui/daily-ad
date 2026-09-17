const crypto = require('crypto');
const pool = require('../db');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// 外部サービス（アドオン）からのリクエストを Authorization: Bearer <token> で認証する。
// トークンは connect 時に発行され、content_key ごと・ユーザーごとに1つだけ有効。
async function requireServiceToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return res.status(401).json({ error: 'Authorization: Bearer <token> が必要です' });

    const [[conn]] = await pool.query(
      'SELECT id, user_id, content_key FROM service_connections WHERE token_hash = ?',
      [hashToken(token)]
    );
    if (!conn) return res.status(401).json({ error: 'トークンが無効です（連携が解除された可能性があります）' });

    req.userId = conn.user_id;
    req.contentKey = conn.content_key;
    req.connectionId = conn.id;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireServiceToken, hashToken };
