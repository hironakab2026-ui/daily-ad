-- ============================================================
-- マイグレーション：training_plans（部門別の分割メニュー予定）を追加
--   2026-09-18以降、db/01_schema.sql には最初からこのテーブルが含まれる。
--   それより前に db/01_schema.sql を適用済みのDBにのみ実行する。
-- ============================================================
USE life_manager;

CREATE TABLE training_plans (
    user_id    INT          NOT NULL,
    plan_date  DATE         NOT NULL,
    category   VARCHAR(20)  NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, plan_date),
    CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
