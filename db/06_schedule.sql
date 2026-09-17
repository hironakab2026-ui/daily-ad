-- ============================================================
-- スケジュール管理アプリ（APP-4）スキーマ  for MariaDB 10.6+
--   04_要件定義書_スケジュール管理アプリ.md に対応。
--   学習段階のため、別アプリ・別DBには分けず life_manager を共有する
--   （00_システム全体構成・連携仕様.md 3章の方針に合わせる）。
--   タスク（task_definitions / task_logs）と同じ「定義＋生成済み行」の
--   2層構造を踏襲する（CLAUDE.md 4.4）。
-- ============================================================
USE life_manager;

-- ------------------------------------------------------------
-- 用途別カレンダー（仕事・プライベート等の色分けグループ）
-- ------------------------------------------------------------
CREATE TABLE schedule_calendars (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT          NOT NULL,
    name        VARCHAR(50)  NOT NULL,
    color       VARCHAR(20)  NOT NULL,
    is_visible  TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order  INT          NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME     DEFAULT NULL,

    CONSTRAINT chk_scal_visible CHECK (is_visible IN (0,1)),
    CONSTRAINT fk_scal_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE INDEX idx_scal_user ON schedule_calendars(user_id, deleted_at);

-- ------------------------------------------------------------
-- 予定の定義
--   task_definitions と同じく、繰り返し条件を列に分解して持つ
--   （SQLだけで「この日が対象か」を判定できるようにするため）。
-- ------------------------------------------------------------
CREATE TABLE schedule_definitions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT          NOT NULL,
    calendar_id  INT          NOT NULL,

    title        VARCHAR(100) NOT NULL,
    location     VARCHAR(255) DEFAULT NULL,
    memo         VARCHAR(255) DEFAULT NULL,

    is_all_day   TINYINT(1)   NOT NULL DEFAULT 0,
    start_time   TIME         DEFAULT NULL,  -- is_all_day=0 のとき必須
    end_time     TIME         DEFAULT NULL,  -- is_all_day=0 のとき必須（日をまたぐ予定は本フェーズ非対応）

    -- 繰り返し条件（task_definitions と同じ語彙）
    freq         VARCHAR(10)  NOT NULL,
    byweekday    VARCHAR(20)  DEFAULT NULL,  -- 'MO,WE,FR' 形式（weekly のとき）
    bymonthday   TINYINT      DEFAULT NULL,  -- monthly のとき

    -- 実行期間：削除の代わりにこれで制御する（CLAUDE.md 4.3 と同じ考え方）
    start_date   DATE         NOT NULL,
    end_date     DATE         DEFAULT NULL,  -- NULL = 無期限

    remind_minutes_before SMALLINT DEFAULT NULL,  -- 本フェーズは1件のみ（複数リマインドは将来拡張）

    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    deleted_at   DATETIME     DEFAULT NULL,

    CONSTRAINT chk_sdef_allday CHECK (is_all_day IN (0,1)),
    CONSTRAINT chk_sdef_freq   CHECK (freq IN ('once','daily','weekly','monthly')),
    CONSTRAINT chk_sdef_mday   CHECK (bymonthday IS NULL OR bymonthday BETWEEN 1 AND 31),
    CONSTRAINT chk_sdef_range  CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT fk_sdef_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_sdef_cal  FOREIGN KEY (calendar_id) REFERENCES schedule_calendars(id)
) ENGINE=InnoDB;

CREATE INDEX idx_sdef_user ON schedule_definitions(user_id, deleted_at);

-- ------------------------------------------------------------
-- 予定の生成済みの回（「予定」も1行として先に持つ。 CLAUDE.md 4.4 と同じ理由）
--   生成時に定義の内容をコピーする（task_logs のスナップショット方式）。
--   1回だけの変更・キャンセルはこの行を直接編集する（is_exception=1 にする）。
--   定義（schedule_definitions）を編集しても、既に生成済みの行は
--   自動的には書き換わらない（task_definitions の PATCH と同じ仕様）。
-- ------------------------------------------------------------
CREATE TABLE schedule_occurrences (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT      NOT NULL,
    schedule_definition_id INT   NOT NULL,
    occurrence_date     DATE     NOT NULL,

    title               VARCHAR(100) NOT NULL,
    location            VARCHAR(255) DEFAULT NULL,
    memo                VARCHAR(255) DEFAULT NULL,
    is_all_day          TINYINT(1)   NOT NULL DEFAULT 0,
    start_at            DATETIME     DEFAULT NULL,  -- is_all_day=1 のとき NULL
    end_at              DATETIME     DEFAULT NULL,

    is_exception        TINYINT(1)   NOT NULL DEFAULT 0,  -- この回だけ個別編集済み
    deleted_at          DATETIME     DEFAULT NULL,        -- この回だけキャンセル
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                               ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_socc_allday CHECK (is_all_day IN (0,1)),
    CONSTRAINT chk_socc_exc    CHECK (is_exception IN (0,1)),
    -- 同じ定義・同じ日に二重生成させない（INSERT IGNORE で担保する）
    UNIQUE KEY uq_socc (schedule_definition_id, occurrence_date),
    CONSTRAINT fk_socc_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_socc_def  FOREIGN KEY (schedule_definition_id) REFERENCES schedule_definitions(id)
) ENGINE=InnoDB;

CREATE INDEX idx_socc_range ON schedule_occurrences(user_id, deleted_at, occurrence_date);

-- ------------------------------------------------------------
-- 既存ユーザーへの初期データ：予定は必ず1つのカレンダーに属する必要があるため、
-- このマイグレーションを流す時点で存在するユーザーにも既定カレンダーを1つ用意する
-- （新規ユーザーは server/middleware/auth.js が自動作成する）
-- ------------------------------------------------------------
INSERT INTO schedule_calendars (user_id, name, color, sort_order)
SELECT id, '個人', '#4c56d6', 1 FROM users;
