-- ============================================================
-- マルチユーザー対応マイグレーション（APP-1）
--   各データを user_id で分離する。既存データ（seedデータ）は
--   デモユーザー（id=1、server/scripts/create_demo_user.js で作成）に割り当てる。
-- ============================================================
USE life_manager;

CREATE TABLE users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(50)  NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- categories: カテゴリもユーザーごとに持つ（同名でもユーザーが違えば別物）
-- ------------------------------------------------------------
ALTER TABLE categories
    ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE categories DROP INDEX uq_cat;
ALTER TABLE categories
    ADD CONSTRAINT fk_cat_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD UNIQUE KEY uq_cat (user_id, kind, name);
ALTER TABLE categories ALTER COLUMN user_id DROP DEFAULT;

-- ------------------------------------------------------------
-- transactions
-- ------------------------------------------------------------
ALTER TABLE transactions
    ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE transactions DROP INDEX idx_tx_date;
ALTER TABLE transactions
    ADD CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD INDEX idx_tx_date (user_id, deleted_at, entry_date);
ALTER TABLE transactions ALTER COLUMN user_id DROP DEFAULT;

-- ------------------------------------------------------------
-- task_definitions
-- ------------------------------------------------------------
ALTER TABLE task_definitions
    ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE task_definitions
    ADD CONSTRAINT fk_td_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE task_definitions ALTER COLUMN user_id DROP DEFAULT;

-- ------------------------------------------------------------
-- task_logs: 結合せずに絞り込めるよう user_id を非正規化して持つ
-- ------------------------------------------------------------
ALTER TABLE task_logs
    ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE task_logs DROP INDEX idx_log_date;
ALTER TABLE task_logs
    ADD CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD INDEX idx_log_date (user_id, target_date);
ALTER TABLE task_logs ALTER COLUMN user_id DROP DEFAULT;

-- ------------------------------------------------------------
-- content_summary_cache（Phase 3以降・未使用だが将来のため揃えておく）
-- ------------------------------------------------------------
ALTER TABLE content_summary_cache
    ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER content_key;
ALTER TABLE content_summary_cache DROP PRIMARY KEY;
ALTER TABLE content_summary_cache
    ADD CONSTRAINT fk_csc_user FOREIGN KEY (user_id) REFERENCES users(id),
    ADD PRIMARY KEY (user_id, content_key, target_date);
ALTER TABLE content_summary_cache ALTER COLUMN user_id DROP DEFAULT;

-- ============================================================
-- ビューの再定義（user_id をキーに含める）
-- ============================================================
CREATE OR REPLACE VIEW v_daily_balance AS
SELECT
    user_id,
    entry_date,
    SUM(CASE WHEN kind = 'income'  THEN amount ELSE 0 END) AS income,
    SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END) AS expense,
    SUM(CASE WHEN kind = 'income'  THEN amount ELSE -amount END) AS net
FROM transactions
WHERE deleted_at IS NULL
GROUP BY user_id, entry_date;

CREATE OR REPLACE VIEW v_daily_task AS
SELECT
    user_id,
    target_date,
    COUNT(*)                                  AS planned,
    SUM(is_done)                              AS done,
    ROUND(100.0 * SUM(is_done) / COUNT(*), 1) AS rate
FROM task_logs
GROUP BY user_id, target_date;

CREATE OR REPLACE VIEW v_calendar_cell AS
SELECT
    d.user_id, d.target_date AS target_date,
    b.income, b.expense, b.net,
    d.planned, d.done, d.rate
FROM v_daily_task d
LEFT JOIN v_daily_balance b ON b.user_id = d.user_id AND b.entry_date = d.target_date
UNION
SELECT
    b.user_id, b.entry_date, b.income, b.expense, b.net,
    NULL, NULL, NULL
FROM v_daily_balance b
WHERE NOT EXISTS (
    SELECT 1 FROM v_daily_task d WHERE d.user_id = b.user_id AND d.target_date = b.entry_date
);
