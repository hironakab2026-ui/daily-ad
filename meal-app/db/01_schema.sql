-- ============================================================
-- 食事管理アプリ（APP-2）スキーマ  for MariaDB 10.6+
-- 対象：食事記録・体重記録・栄養目標・ハブ連携トークン
-- 前提：ハブ（APP-1・life_manager データベース）と DB / users テーブルを共有する
--       （00_システム全体構成・連携仕様.md 3章の合意に基づく）
-- ※ 実行未検証。エラーが出たら修正すること
-- ============================================================
USE life_manager;

-- ------------------------------------------------------------
-- 食事記録（F-04）
--   朝食・昼食・夕食・間食の4区分＋日時。1日に何件でも記録できる。
--   カロリー・PFCは任意入力（未入力なら栄養評価から除外）。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_logs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL,
    meal_date     DATE         NOT NULL,
    meal_type     VARCHAR(10)  NOT NULL,
    logged_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    food_name     VARCHAR(100) NOT NULL,
    calories_kcal INT          DEFAULT NULL,
    protein_g     DECIMAL(5,1) DEFAULT NULL,
    fat_g         DECIMAL(5,1) DEFAULT NULL,
    carbs_g       DECIMAL(5,1) DEFAULT NULL,
    memo          VARCHAR(255) DEFAULT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
    deleted_at    DATETIME     DEFAULT NULL,             -- 論理削除（ハブと同じ方針）

    CONSTRAINT chk_meal_type CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
    CONSTRAINT chk_meal_kcal CHECK (calories_kcal IS NULL OR calories_kcal >= 0),
    CONSTRAINT fk_meal_user  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- MariaDBは部分インデックス非対応のため deleted_at を複合indexの先頭に含める
CREATE INDEX idx_meal_date ON meal_logs(user_id, deleted_at, meal_date);

-- ------------------------------------------------------------
-- 体重記録（F-05）
--   1日1件が基本だが、複数回記録した場合は logged_at が最新のものを採用する。
--   （UNIQUE制約は設けず、履歴として複数行を許容する）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weight_logs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL,
    log_date      DATE         NOT NULL,
    logged_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    weight_kg     DECIMAL(5,1) NOT NULL,
    body_fat_pct  DECIMAL(4,1) DEFAULT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at    DATETIME     DEFAULT NULL,

    CONSTRAINT fk_weight_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE INDEX idx_weight_date ON weight_logs(user_id, deleted_at, log_date);

-- ------------------------------------------------------------
-- 栄養目標（設定画面 A2-06）
--   ユーザーごとに1行。未設定項目はNULLのまま（評価から除外）。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nutrition_targets (
    user_id               INT          NOT NULL PRIMARY KEY,
    target_calories_kcal  INT          DEFAULT NULL,
    target_protein_g      DECIMAL(5,1) DEFAULT NULL,
    target_fat_g          DECIMAL(5,1) DEFAULT NULL,
    target_carbs_g        DECIMAL(5,1) DEFAULT NULL,
    target_weight_kg      DECIMAL(5,1) DEFAULT NULL,
    updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                 ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_target_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ハブ連携トークン（設定画面 A2-06）
--   APP-1の「設定→認証トークン」で発行されたトークンを保存する。
--   生トークンをそのまま保存する（アドオン側が送信元になるため）。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hub_connections (
    user_id     INT          NOT NULL PRIMARY KEY,
    token       VARCHAR(64)  DEFAULT NULL,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_hubconn_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
