# 生活管理アプリ（APP-1）

収支管理・タスク管理を行う個人向け生活管理システムのハブアプリです。詳細な要件・設計方針は [CLAUDE.md](./CLAUDE.md) を参照してください。

**ログインはありません。** 初回アクセス時にサーバーが端末（ブラウザ）ごとに自動でユーザーを作成し、署名付きCookieで識別します（詳しくは `server/middleware/auth.js`）。Cookieを消す・別ブラウザ／別端末でアクセスすると別のデータになります。

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

   `.env.example` を `.env` にコピーし、DB接続情報などを環境に合わせて変更してください。`SESSION_SECRET` は端末Cookieの署名に使うので、他人に推測されない値にしてください。

   ```bash
   cp .env.example .env
   ```

3. データベースを初期化

   `db/` 配下の SQL を順番に実行します。

   ```bash
   mysql -u root -p life_manager < db/01_schema.sql
   mysql -u root -p life_manager < db/02_seed.sql
   mysql -u root -p life_manager < db/04_multiuser.sql
   mysql -u root -p life_manager < db/05_service_connections.sql
   ```

4. サーバーを起動

   ```bash
   npm start
   ```

   開発時はファイル変更を監視する `npm run dev` が使えます。

   起動後 `http://localhost:3000`（`.env` の `PORT` に従う）でアプリにアクセスできます。初回アクセスで自動的に新しい端末として登録されます。

## API

| メソッド | パス | 概要 |
| --- | --- | --- |
| GET | `/api/device` | この端末のプロフィール |
| PATCH | `/api/device` | ニックネームの変更 |
| POST | `/api/device/reset` | この端末の紐付けを解除（次回アクセスで新規端末になる） |
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
| GET | `/api/summary/trend` | 月別の収支・タスク達成率の推移 |
| GET | `/api/summary/connected` | 連携中の外部サービスの当日の要約 |
| GET | `/api/calendar` | カレンダー表示用データ |
| GET | `/api/calendar/day/:date` | 日別詳細データ |
| GET | `/api/connections` | 連携可能なサービス一覧・連携状況 |
| POST | `/api/connections/:contentKey/connect` | 連携トークンを発行 |
| POST | `/api/connections/:contentKey/disconnect` | 連携を解除 |
| POST | `/api/integrations/summary` | （外部サービス用・トークン認証）その日の要約をpush |

`/api/integrations/*` 以外は端末Cookie必須です（`server/middleware/auth.js`、ログイン画面はなし）。`/api/integrations/*` は `Authorization: Bearer <トークン>` で認証します（詳細は [00_システム全体構成・連携仕様.md](./00_システム全体構成・連携仕様.md)）。

## ディレクトリ構成

```
public/    フロントエンド（静的ファイル）
server/    Express サーバー・API ルーティング
db/        スキーマ・初期データ・クエリ集（MySQL/MariaDB）
```
