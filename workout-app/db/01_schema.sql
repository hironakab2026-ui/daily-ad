-- ============================================================
-- 運動管理アプリ（APP-3）スキーマ
--   00_システム全体構成・連携仕様.md の推奨方針に従い、
--   APP-1（ハブ）と同じ MariaDB インスタンス・同じ life_manager
--   データベース・同じ users テーブルを共有する。
--   このファイルは exercises / workout_logs / workout_hub_connections の
--   3テーブルのみを追加する（users・content_summary_cache 等の
--   ハブ側テーブルは db/01_schema.sql・db/04_multiuser.sql・
--   db/05_service_connections.sql が既に作成済みであること）。
-- ============================================================
USE life_manager;

-- 種目マスタ（ユーザーごと）
CREATE TABLE exercises (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT          NOT NULL,
    name        VARCHAR(50)  NOT NULL,
    body_part   VARCHAR(20)  DEFAULT NULL,   -- 胸/背中/脚/肩/腕/腹 など（自由入力）
    sort_order  INT          NOT NULL DEFAULT 0,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    mets        DECIMAL(3,1) NOT NULL DEFAULT 3.5, -- 身体活動のメッツ表(METs)由来の推定値（出典はdefaultExercises.js参照）
    target_note VARCHAR(100) DEFAULT NULL,   -- 主に効く部位・筋肉の説明
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ex_user FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY uq_exercise (user_id, name)
) ENGINE=InnoDB;

-- トレーニング記録（1セット＝1行）
--   セット単位で持つことで、ボリューム（重量×回数×セット）や
--   週間トレンドを SQL の SUM/GROUP BY だけで算出できるようにする。
CREATE TABLE workout_logs (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT           NOT NULL,
    exercise_id  INT           NOT NULL,
    log_date     DATE          NOT NULL,     -- 'YYYY-MM-DD'
    set_no       INT           NOT NULL,     -- その日・その種目内での何セット目か
    weight_kg    DECIMAL(6,2)  NOT NULL,     -- kg。0.5kg刻み等に対応するためDECIMAL（浮動小数点誤差を避ける）
    reps         INT           NOT NULL,
    memo         VARCHAR(200)  DEFAULT NULL,
    deleted_at   DATETIME      DEFAULT NULL, -- 論理削除
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_wl_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_wl_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
    INDEX idx_wl_date (user_id, deleted_at, log_date)
) ENGINE=InnoDB;

-- ハブ（APP-1）との連携設定（このアプリ自身が発行された連携トークンを保持する側）
--   APP-1 の 設定 > 外部サービス連携 で「運動管理アプリ」を連携し、
--   発行されたトークンをこのアプリの 設定画面 に貼り付けて保存する。
CREATE TABLE workout_hub_connections (
    user_id        INT           PRIMARY KEY,
    hub_base_url   VARCHAR(255)  NOT NULL,   -- 例: http://localhost:3000
    token          VARCHAR(64)   NOT NULL,   -- ハブが発行したトークン（学習用デモのため平文保存。本番では暗号化すること）
    connected_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_synced_at DATETIME      DEFAULT NULL,
    last_error     VARCHAR(255)  DEFAULT NULL,

    CONSTRAINT fk_hc_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 日別集計ビュー（当日サマリー・履歴・ハブ連携の算出で共通利用）
CREATE OR REPLACE VIEW v_daily_workout AS
SELECT
    user_id,
    log_date,
    COUNT(*)                    AS sets,
    SUM(weight_kg * reps)       AS volume_kg,
    COUNT(DISTINCT exercise_id) AS exercise_count
FROM workout_logs
WHERE deleted_at IS NULL
GROUP BY user_id, log_date;
