-- ============================================================
-- 初期データ（カテゴリ）＋ 動作確認用のサンプル  for MariaDB
-- ============================================================
USE life_manager;

-- 支出カテゴリ
INSERT INTO categories (kind, name, sort_order) VALUES
  ('expense','食費',     1),
  ('expense','日用品',   2),
  ('expense','交通費',   3),
  ('expense','交際費',   4),
  ('expense','娯楽',     5),
  ('expense','医療',     6),
  ('expense','固定費',   7),
  ('expense','その他',   99);

-- 収入カテゴリ
INSERT INTO categories (kind, name, sort_order) VALUES
  ('income','給与',      1),
  ('income','副収入',    2),
  ('income','臨時収入',  3);

-- ------------------------------------------------------------
-- サンプル：収支
-- ------------------------------------------------------------
INSERT INTO transactions (entry_date, kind, category_id, amount, memo) VALUES
  ('2026-09-01','income',  (SELECT id FROM categories WHERE name='給与'   AND kind='income'),  280000, '9月分'),
  ('2026-09-01','expense', (SELECT id FROM categories WHERE name='固定費' AND kind='expense'),  75000, '家賃'),
  ('2026-09-02','expense', (SELECT id FROM categories WHERE name='食費'   AND kind='expense'),   1280, 'スーパー'),
  ('2026-09-02','expense', (SELECT id FROM categories WHERE name='交通費' AND kind='expense'),    420, '電車'),
  ('2026-09-03','expense', (SELECT id FROM categories WHERE name='食費'   AND kind='expense'),    980, 'コンビニ'),
  ('2026-09-03','expense', (SELECT id FROM categories WHERE name='娯楽'   AND kind='expense'),   1800, '映画'),
  ('2026-09-04','expense', (SELECT id FROM categories WHERE name='食費'   AND kind='expense'),   2400, '外食'),
  ('2026-09-05','expense', (SELECT id FROM categories WHERE name='日用品' AND kind='expense'),   3200, '洗剤など');

-- ------------------------------------------------------------
-- サンプル：タスク定義
-- ------------------------------------------------------------
-- 毎日のルーティン
INSERT INTO task_definitions (name, task_type, freq, start_date, remind_time, memo)
VALUES ('ストレッチ', 'routine', 'daily', '2026-09-01', '07:00', '起床後10分');

-- 週3回のルーティン（月・水・金）
INSERT INTO task_definitions (name, task_type, freq, byweekday, start_date, remind_time)
VALUES ('ジムへ行く', 'routine', 'weekly', 'MO,WE,FR', '2026-09-01', '19:00');

-- 毎月1日
INSERT INTO task_definitions (name, task_type, freq, bymonthday, start_date)
VALUES ('家計の締め', 'routine', 'monthly', 1, '2026-09-01');

-- 単独タスク
INSERT INTO task_definitions (name, task_type, freq, start_date, end_date)
VALUES ('健康診断の予約', 'single', 'once', '2026-09-03', '2026-09-03');

-- 途中でやめたタスク（終了日を設定 ＝ 削除しない）
INSERT INTO task_definitions (name, task_type, freq, byweekday, start_date, end_date)
VALUES ('日記を書く', 'routine', 'weekly', 'SA,SU', '2026-09-01', '2026-09-03');
