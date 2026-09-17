-- ============================================================
-- 外部サービス連携（APP-2/APP-3などのアドオンをハブに接続する）
--   00_システム全体構成・連携仕様.md の連携方式を実装するためのテーブル。
--   ハブはこのテーブルのトークンで認証されたリクエストのみ、
--   content_summary_cache への書き込みを許可する。
-- ============================================================
USE life_manager;

CREATE TABLE service_connections (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT          NOT NULL,
    content_key    VARCHAR(30)  NOT NULL,   -- 'meal' | 'workout' など
    token_hash     CHAR(64)     NOT NULL,   -- トークンのSHA-256（生トークンは保存しない）
    connected_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_synced_at DATETIME     DEFAULT NULL,

    CONSTRAINT fk_conn_user FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY uq_conn_user_key (user_id, content_key),
    UNIQUE KEY uq_conn_token (token_hash)
) ENGINE=InnoDB;
