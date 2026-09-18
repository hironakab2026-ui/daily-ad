# 生活管理アプリ（APP-1）

収支管理・タスク管理を行う個人向け生活管理システムのハブアプリです。詳細な要件・設計方針は [CLAUDE.md](./CLAUDE.md) を参照してください。

運動管理アプリ（APP-3）は [`workout-app/`](./workout-app/) に独立したアプリとして実装しています。セットアップは [`workout-app/README.md`](./workout-app/README.md) を参照してください。

## セットアップ

### 前提

- Node.js
- MySQL / MariaDB（起動済みであること）

### 手順

1. 依存パッケージをインストール

   ```bash
   npm install
   ```

2. 環境変数を設定

   `.env.example` を `.env` にコピーし、DB接続情報などを環境に合わせて変更してください。

   ```bash
   cp .env.example .env
   ```

3. データベースを初期化

   `db/` 配下の SQL を順番に実行します。

   ```bash
   mysql -u root -p life_manager < db/01_schema.sql
   mysql -u root -p life_manager < db/02_seed.sql
   mysql -u root -p life_manager < db/04_multiuser.sql
   ```

4. デモユーザーを作成（任意）

   ```bash
   node server/scripts/create_demo_user.js [email] [password] [表示名]
   ```

5. サーバーを起動

   ```bash
   npm start
   ```

   開発時はファイル変更を監視する `npm run dev` が使えます。

   起動後 `http://localhost:3000`（`.env` の `PORT` に従う）でアプリにアクセスできます。

## API

| メソッド | パス | 概要 |
| --- | --- | --- |
| POST | `/api/auth/register` | 新規登録 |
| POST | `/api/auth/login` | ログイン |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | ログイン中ユーザー情報 |
| GET | `/api/categories` | カテゴリ一覧 |
| POST | `/api/categories` | カテゴリ作成 |
| PATCH | `/api/categories/:id` | カテゴリ更新 |
| GET | `/api/transactions` | 収支記録一覧 |
| POST | `/api/transactions` | 収支記録作成 |
| DELETE | `/api/transactions/:id` | 収支記録削除 |
| GET | `/api/tasks/definitions` | タスク定義一覧 |
| POST | `/api/tasks/definitions` | タスク定義作成 |
| PATCH | `/api/tasks/definitions/:id` | タスク定義更新 |
| POST | `/api/tasks/definitions/:id/stop` | タスク定義を終了（`end_date` 設定） |
| DELETE | `/api/tasks/definitions/:id` | タスク定義を論理削除 |
| GET | `/api/tasks/today` | 本日のタスク一覧 |
| POST | `/api/tasks/logs/:id/toggle` | タスクの実行状態を切り替え |
| GET | `/api/tasks/definitions/:id/streak` | タスクの継続日数 |
| GET | `/api/summary/today` | 当日サマリー |
| GET | `/api/summary/month` | 月次サマリー |
| GET | `/api/calendar` | カレンダー表示用データ |
| GET | `/api/calendar/day/:date` | 日別詳細データ |

`/api/auth/*` 以外はログイン必須です（`server/middleware/auth.js`）。

## ディレクトリ構成

```
public/    フロントエンド（静的ファイル）
server/    Express サーバー・API ルーティング
db/        スキーマ・初期データ・クエリ集（MySQL/MariaDB）
```
