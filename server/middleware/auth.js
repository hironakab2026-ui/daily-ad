const crypto = require('crypto');
const pool = require('../db');
const { DEFAULT_CATEGORIES } = require('../services');

const DEVICE_COOKIE = 'device_id';
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60 * 1000; // 400日（Cookieの実務上の上限に合わせる）

// ログイン画面を持たない「端末ごとの自動識別」。
// 署名付きCookieに user_id を直接持たせるので、サーバーを再起動しても
// （express-session のようにメモリ上のセッションが消えて）再ログインを求められることがない。
async function ensureDeviceUser(req, res, next) {
  try {
    const cookieUserId = req.signedCookies?.[DEVICE_COOKIE];
    if (cookieUserId) {
      const [[user]] = await pool.query('SELECT id FROM users WHERE id = ?', [cookieUserId]);
      if (user) {
        req.userId = user.id;
        return next();
      }
      // Cookieはあるが該当ユーザーが存在しない（削除された等）→ 新規発行に倒す
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const suffix = crypto.randomBytes(8).toString('hex');
      const [result] = await conn.query(
        'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
        [`device-${suffix}@local.invalid`, suffix, 'マイプラン']
      );
      const userId = result.insertId;
      for (const [kind, name, sortOrder] of DEFAULT_CATEGORIES) {
        await conn.query(
          'INSERT INTO categories (user_id, kind, name, sort_order) VALUES (?, ?, ?, ?)',
          [userId, kind, name, sortOrder]
        );
      }
      // スケジュール管理アプリ（APP-4）用：予定は必ず1つのカレンダーに属するため、既定のものを1つ用意する
      await conn.query(
        'INSERT INTO schedule_calendars (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)',
        [userId, '個人', '#4c56d6', 1]
      );
      await conn.commit();

      res.cookie(DEVICE_COOKIE, String(userId), {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
      req.userId = userId;
      next();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { ensureDeviceUser, DEVICE_COOKIE };
