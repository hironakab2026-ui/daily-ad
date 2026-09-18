// ハブ（APP-1）が 2026-09-17 に「ログイン画面を廃止し、端末ごとの自動識別に変更」
// （コミット 592ca5a）したため、このアプリも同じ方式に合わせる。
//   - device_id という名前の署名付きCookieに user_id を直接持たせる
//   - 署名の secret にハブと同じ SESSION_SECRET を使うことで、Cookieはポートを
//     区別しないブラウザの仕様上、ハブ（:3000）とこのアプリ（:3100）の間で
//     そのまま共有される（＝どちらを先に開いても同じ端末として識別される）
// メール/パスワードのログイン・新規登録は行わない（ハブ同様、画面自体を持たない）。
const crypto = require('crypto');
const pool = require('../db');
const { DEFAULT_EXERCISES } = require('../lib/defaultExercises');

const DEVICE_COOKIE = 'device_id';
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60 * 1000; // 400日

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

    // 注意：ここで作る新規ユーザーには、ハブ（APP-1）の初期カテゴリは投入しない
    // （カテゴリは収支管理の概念でありこのアプリの責務外）。
    // そのため、このアプリを先に開いて端末登録した後にハブを開くと、
    // ハブ側は既存ユーザーとして扱いカテゴリが空になる（既知の制限。README参照）。
    // 一方、種目マスタは本アプリの責務なので、定番種目（DEFAULT_EXERCISES）を
    // 初期投入する（ハブが新規ユーザーに初期カテゴリを投入するのと対になる設計）。
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const suffix = crypto.randomBytes(8).toString('hex');
      const [result] = await conn.query(
        'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
        [`device-${suffix}@local.invalid`, suffix, 'マイプラン']
      );
      const userId = result.insertId;
      for (const [name, bodyPart, sortOrder, mets, targetNote] of DEFAULT_EXERCISES) {
        await conn.query(
          'INSERT INTO exercises (user_id, name, body_part, sort_order, mets, target_note) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, name, bodyPart, sortOrder, mets, targetNote]
        );
      }
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
