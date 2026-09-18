-- ============================================================
-- マイグレーション：exercises に mets（METs値）・target_note（効く部位）を追加
--   2026-09-18以降、db/01_schema.sql には最初からこの2列が含まれるようになった。
--   このファイルは、それより前に db/01_schema.sql を適用済みのDBにのみ実行する
--   （01_schema.sql からそのまま作成した場合は不要・実行するとエラーになる）。
-- ============================================================
USE life_manager;

ALTER TABLE exercises
  ADD COLUMN mets DECIMAL(3,1) NOT NULL DEFAULT 3.5 COMMENT '身体活動のメッツ表(METs)由来の推定値',
  ADD COLUMN target_note VARCHAR(100) DEFAULT NULL COMMENT '主に効く部位・筋肉の説明';
