// 既存の seed データ（db/02_seed.sql）の持ち主となるデモユーザーを作成する。
// マイグレーション db/04_multiuser.sql が既存データを user_id=1 に割り当てる前提のため、
// このスクリプトは users テーブル作成直後・他の ALTER 前に一度だけ実行する。
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function main() {
  const email = process.argv[2] || 'demo@example.com';
  const password = process.argv[3] || 'demo1234';
  const displayName = process.argv[4] || 'デモユーザー';

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
    [email, hash, displayName]
  );
  console.log(`user created: id=${result.insertId} email=${email} password=${password}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
