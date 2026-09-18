-- ============================================================
-- 食品辞書・献立予定 マイグレーション（APP-2）
--   F-04 改善: 食品名から標準栄養価を自動入力できるようにする辞書テーブルと、
--   献立予定（is_planned）・数量（quantity）を meal_logs に追加する。
-- ============================================================
USE life_manager;

-- ------------------------------------------------------------
-- 食品辞書：食品名 → 1食分あたりの標準栄養価
--   values は serving_label（例 '100g' '1個' '1杯'）あたりの量。
--   meal_logs 側では quantity（何人前・何個か）を掛けて実際の値を計算し、
--   スナップショットとして保存する（辞書を後から編集しても過去記録は変わらない）。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS foods (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    serving_label VARCHAR(20)  NOT NULL DEFAULT '100g',
    serving_grams DECIMAL(6,1) DEFAULT NULL,
    calories_kcal INT          NOT NULL,
    protein_g     DECIMAL(5,1) DEFAULT NULL,
    fat_g         DECIMAL(5,1) DEFAULT NULL,
    carbs_g       DECIMAL(5,1) DEFAULT NULL,
    barcode       VARCHAR(20)  DEFAULT NULL,
    source        VARCHAR(20)  NOT NULL DEFAULT 'seed',  -- 'seed' | 'barcode' | 'user'
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_food_source CHECK (source IN ('seed', 'barcode', 'user')),
    UNIQUE KEY uq_food_barcode (barcode),
    UNIQUE KEY uq_food_name (name)
) ENGINE=InnoDB;

CREATE INDEX idx_food_name ON foods(name);

-- ------------------------------------------------------------
-- meal_logs 拡張
--   food_id    : 辞書から選んだ場合の参照（フリー入力のみの場合は NULL のまま）
--   quantity   : 辞書の1食分（serving_label）に対する倍率。何人前・何個の選択に使う
--   is_planned : 献立予定（まだ食べていない）。1なら栄養評価の実績集計から除外する
-- ------------------------------------------------------------
ALTER TABLE meal_logs
    ADD COLUMN food_id    INT          DEFAULT NULL AFTER meal_type,
    ADD COLUMN quantity   DECIMAL(5,2) NOT NULL DEFAULT 1 AFTER food_id,
    ADD COLUMN is_planned TINYINT(1)   NOT NULL DEFAULT 0 AFTER memo;

ALTER TABLE meal_logs
    ADD CONSTRAINT fk_meal_food FOREIGN KEY (food_id) REFERENCES foods(id),
    ADD CONSTRAINT chk_meal_planned CHECK (is_planned IN (0, 1)),
    ADD CONSTRAINT chk_meal_qty CHECK (quantity > 0);
