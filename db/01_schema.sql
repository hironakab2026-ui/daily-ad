-- ============================================================
-- 生活管理アプリ（APP-1）スキーマ  for MariaDB 10.6+
-- 対象：収支管理・タスク管理
-- ※ 実行未検証。エラーが出たら修正すること
-- ============================================================
-- データベースの作成（初回のみ）
CREATE DATABASE IF NOT EXISTS life_manager
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE life_manager;

-- ------------------------------------------------------------
-- カテゴリ（収支の用途）
-- ------------------------------------------------------------
CREATE TABLE categories (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    kind        VARCHAR(10)  NOT NULL,
    name        VARCHAR(50)  NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    CONSTRAINT chk_cat_kind   CHECK (kind IN ('income','expense')),
    CONSTRAINT chk_cat_active CHECK (is_active IN (0,1)),
    UNIQUE KEY uq_cat (kind, name)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 収支記録
--   MariaDB には DATE 型があるので文字列で持つ必要がない
--   金額は円単位の INT。小数を使わないので誤差が出ない
-- ------------------------------------------------------------
CREATE TABLE transactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    entry_date  DATE         NOT NULL,
    kind        VARCHAR(10)  NOT NULL,
    category_id INT          NOT NULL,
    amount      INT          NOT NULL,
    memo        VARCHAR(255),
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME     DEFAULT NULL,            -- 論理削除

    CONSTRAINT chk_tx_kind   CHECK (kind IN ('income','expense')),
    CONSTRAINT chk_tx_amount CHECK (amount > 0),
    CONSTRAINT fk_tx_cat FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

-- MariaDB は部分インデックス（WHERE句つき）に非対応のため
-- deleted_at を先頭に含めた複合インデックスで代替する
CREATE INDEX idx_tx_date ON transactions(deleted_at, entry_date);

-- ------------------------------------------------------------
-- タスク定義
--   繰り返し条件を RRULE の文字列ではなく列に分解して持つ。
--   → SQL だけで「この日が対象か」を判定できるようにするため
-- ------------------------------------------------------------
CREATE TABLE task_definitions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    task_type    VARCHAR(10)  NOT NULL,

    -- 繰り返し条件
    freq         VARCHAR(10)  NOT NULL,
    byweekday    VARCHAR(20)  DEFAULT NULL,  -- 'MO,WE,FR' 形式（weekly のとき）
    bymonthday   TINYINT      DEFAULT NULL,  -- monthly のとき

    -- 実行期間：削除の代わりにこれで制御する
    start_date   DATE         NOT NULL,
    end_date     DATE         DEFAULT NULL,  -- NULL = 無期限

    remind_time  TIME         DEFAULT NULL,
    color        VARCHAR(20)  DEFAULT NULL,
    memo         VARCHAR(255) DEFAULT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    deleted_at   DATETIME     DEFAULT NULL,

    CONSTRAINT chk_td_type  CHECK (task_type IN ('routine','single')),
    CONSTRAINT chk_td_freq  CHECK (freq IN ('daily','weekly','monthly','once')),
    CONSTRAINT chk_td_mday  CHECK (bymonthday IS NULL OR bymonthday BETWEEN 1 AND 31),
    -- 期間の整合性をDB側で担保する
    CONSTRAINT chk_td_range CHECK (end_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- タスク実行記録
--   「予定」も1行として持つ（is_done = 0 の状態で作る）。
--   こうしないと完遂率の分母（その日の予定件数）をSQLで出せない。
-- ------------------------------------------------------------
CREATE TABLE task_logs (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    task_definition_id INT          NOT NULL,
    target_date        DATE         NOT NULL,
    is_done            TINYINT(1)   NOT NULL DEFAULT 0,
    completed_at       DATETIME     DEFAULT NULL,   -- 実行ボタンを押した時刻
    is_backfilled      TINYINT(1)   NOT NULL DEFAULT 0,

    -- 定義変更後も当時の内容を再現するためのスナップショット
    task_name_snapshot VARCHAR(100) NOT NULL,
    task_type_snapshot VARCHAR(10)  NOT NULL,

    CONSTRAINT chk_log_done CHECK (is_done IN (0,1)),
    CONSTRAINT chk_log_back CHECK (is_backfilled IN (0,1)),
    -- 未実行なのに実行時刻がある状態を禁じる
    CONSTRAINT chk_log_time CHECK (is_done = 1 OR completed_at IS NULL),
    -- 同じ日に二重生成させない
    UNIQUE KEY uq_log (task_definition_id, target_date),
    CONSTRAINT fk_log_td FOREIGN KEY (task_definition_id)
        REFERENCES task_definitions(id)
) ENGINE=InnoDB;

CREATE INDEX idx_log_date ON task_logs(target_date);

-- ------------------------------------------------------------
-- コンテンツ要約キャッシュ（Phase 3 以降・食事/運動アプリの要約置き場）
-- ------------------------------------------------------------
CREATE TABLE content_summary_cache (
    content_key VARCHAR(30)  NOT NULL,
    target_date DATE         NOT NULL,
    status      VARCHAR(10)  NOT NULL,
    grade       VARCHAR(2)   DEFAULT NULL,
    badge       VARCHAR(20)  DEFAULT NULL,
    metrics     JSON         DEFAULT NULL,   -- MariaDB の JSON は実体が LONGTEXT
    deep_link   VARCHAR(255) DEFAULT NULL,
    fetched_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (content_key, target_date),
    CONSTRAINT chk_csc_status CHECK (status IN ('none','partial','recorded'))
) ENGINE=InnoDB;

-- ============================================================
-- ビュー：毎回同じ集計を書かずに済むよう、名前をつけて保存しておく
-- ============================================================

-- 日ごとの収支
CREATE OR REPLACE VIEW v_daily_balance AS
SELECT
    entry_date,
    SUM(CASE WHEN kind = 'income'  THEN amount ELSE 0 END) AS income,
    SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END) AS expense,
    SUM(CASE WHEN kind = 'income'  THEN amount ELSE -amount END) AS net
FROM transactions
WHERE deleted_at IS NULL
GROUP BY entry_date;

-- 日ごとのタスク完遂率
--   予定が0件の日はそもそも行が出ない = 「対象なし」として扱える
CREATE OR REPLACE VIEW v_daily_task AS
SELECT
    target_date,
    COUNT(*)                                  AS planned,
    SUM(is_done)                              AS done,
    ROUND(100.0 * SUM(is_done) / COUNT(*), 1) AS rate
FROM task_logs
GROUP BY target_date;

-- カレンダーのセル用：収支とタスクを1行にまとめる
CREATE OR REPLACE VIEW v_calendar_cell AS
SELECT
    d.target_date AS target_date,
    b.income, b.expense, b.net,
    d.planned, d.done, d.rate
FROM v_daily_task d
LEFT JOIN v_daily_balance b ON b.entry_date = d.target_date
UNION
SELECT
    b.entry_date, b.income, b.expense, b.net,
    NULL, NULL, NULL
FROM v_daily_balance b
WHERE b.entry_date NOT IN (SELECT target_date FROM v_daily_task);
