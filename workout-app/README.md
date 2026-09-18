# 運動管理アプリ（APP-3）

筋力トレーニングの記録・評価を行うアプリです。生活管理アプリ（APP-1・本リポジトリ直下）のアドオンとして、`00_システム全体構成・連携仕様.md` の連携方式（`content_summary_cache` 経由・トークン認証）でハブと連携します。

要件の一次情報は [`../03_要件定義書_運動管理アプリ.md`](../03_要件定義書_運動管理アプリ.md)（骨子）です。このアプリの実装にあたり、骨子で「未定」とされていた事項を以下のとおり決定しました（詳細はコード中のコメントを参照）。

| 未決定事項 | このアプリでの決定 |
| --- | --- |
| 記録の粒度 | セット単位（`workout_logs` の1行＝1セット） |
| 評価（grade）の算出方法 | 直近7日間のトレーニング日数によるS/A/B/C（`server/lib/grade.js`） |
| 種目マスタ | ユーザーごと（ハブの `categories` と同じ設計） |
| 同期のタイミング | 記録の作成・削除の都度、同期的にハブへ送信（バッチではない） |

これらは学習目的の暫定判断です。見直したい場合は `03_要件定義書_運動管理アプリ.md` を更新のうえ、実装を調整してください。

## アーキテクチャ上の位置づけ

- ハブ（APP-1）とは**別アプリ**（別ポート・別コードベース）として動作します。本アプリのコードを APP-1 の `server/` `public/` に混在させません（`CLAUDE.md` 4.1 の「ハブは他コンテンツの詳細を描画・編集しない」という制約を、アドオン側から見ても守るため）。
- `00_システム全体構成・連携仕様.md` の推奨方針に従い、**APP-1 と同じ MariaDB インスタンス・同じ `life_manager` データベース・同じ `users` テーブル**を共有します（認証を一本化するため）。このアプリは `exercises` / `workout_logs` / `workout_hub_connections` の3テーブルのみを追加します。
- ログインは APP-1 で作成したアカウントで行います（このアプリに新規登録機能はありません）。
- 記録の保存・削除のたびに、その日の要約（grade・badge・metrics最大6件）を `POST {ハブのURL}/api/integrations/summary` へ送信します。

## セットアップ

### 前提

- Node.js
- MySQL / MariaDB（APP-1 側の `db/01_schema.sql` `db/02_seed.sql` `db/04_multiuser.sql` `db/05_service_connections.sql` を適用済みであること）

### 手順

1. 依存パッケージをインストール

   ```bash
   cd workout-app
   npm install
   ```

2. 環境変数を設定（`.env.example` を `.env` にコピー）

   ```bash
   cp .env.example .env
   ```

   `PORT` は既定で `3100`（APP-1 の `3000` と衝突しないポート）です。

3. このアプリのテーブルを追加

   ```bash
   mysql -u root -p life_manager < db/01_schema.sql
   mysql -u root -p life_manager < db/02_seed.sql   # 任意：デモ用の種目を投入（user_id=1向け）
   ```

4. サーバーを起動

   ```bash
   npm start
   ```

   `http://localhost:3100` でアクセスできます。APP-1（`http://localhost:3000`）で作成したアカウントでログインしてください。

5. ハブと連携する（任意）

   1. APP-1（`http://localhost:3000`）の「設定 → 外部サービス連携 → 運動管理アプリ」で「連携する」を押し、表示されたトークンをコピーする。
   2. このアプリ（`http://localhost:3100`）の「設定」タブで、APP-1 のURL（既定で `http://localhost:3000`）とトークンを入力して「連携する」を押す。
   3. 以降、記録を追加・削除するたびに APP-1 のホーム画面へ評価と指標が反映されます。

## API

| メソッド | パス | 概要 |
| --- | --- | --- |
| POST | `/api/auth/login` | ログイン（アカウントはAPP-1と共通） |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | ログイン中ユーザー情報 |
| GET | `/api/exercises` | 種目一覧（`?all=1`で非表示分も含む） |
| POST | `/api/exercises` | 種目を追加 |
| PATCH | `/api/exercises/:id` | 種目を編集・非表示化 |
| GET | `/api/workouts?date=` | その日の記録一覧 |
| POST | `/api/workouts` | 記録を1セット追加（保存後、ハブへ自動同期） |
| DELETE | `/api/workouts/:id` | 記録を論理削除（削除後、ハブへ自動同期） |
| GET | `/api/summary/today?date=` | 当日サマリー（A3-01） |
| GET | `/api/summary/history?days=` | 日別のセット数・ボリューム推移（A3-04） |
| GET | `/api/summary/exercise-trend/:exerciseId` | 種目別の重量推移 |
| GET | `/api/hub/connection` | ハブ連携の状態 |
| POST | `/api/hub/connection` | ハブ連携のトークンを登録 |
| DELETE | `/api/hub/connection` | ハブ連携を解除 |
| POST | `/api/hub/sync` | 今日の要約を手動でハブへ再送 |

`/api/auth/*` 以外はログイン必須です。

## ディレクトリ構成

```
public/    フロントエンド（静的ファイル）
server/    Express サーバー・API ルーティング
  lib/     評価ロジック（grade.js）・ハブ同期処理（hubSync.js）
db/        このアプリ専用テーブルのスキーマ・初期データ
```
