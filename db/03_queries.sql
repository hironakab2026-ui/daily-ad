-- ============================================================
-- 学習用クエリ集  for MariaDB
--   アプリが実際に投げることになるSQLを、用途ごとにまとめたもの
--   ? や :name は実行時に値を差し込むプレースホルダ
-- ============================================================
USE life_manager;

-- ------------------------------------------------------------
-- Q1. その日に実行すべきタスクの「予定行」を生成する
--     当日タスク一覧を開いたときに、まずこれを実行する。
--     UNIQUE制約があるので、二度実行しても重複しない（INSERT IGNORE）。
--
--     DAYOFWEEK() は 1=日曜 … 7=土曜 を返す（SQLite の strftime('%w') とずれる）
-- ------------------------------------------------------------
INSERT IGNORE INTO task_logs
    (task_definition_id, target_date, is_done, task_name_snapshot, task_type_snapshot)
SELECT
    td.id,
    :target_date,
    0,
    td.name,
    td.task_type
FROM task_definitions td
WHERE td.deleted_at IS NULL
  -- 実行期間の内側にあるか
  AND :target_date >= td.start_date
  AND :target_date <= COALESCE(td.end_date, '9999-12-31')
  -- 繰り返し条件に合致するか
  AND (
        td.freq = 'daily'
     OR (td.freq = 'once'    AND td.start_date = :target_date)
     OR (td.freq = 'monthly' AND td.bymonthday = DAY(:target_date))
     OR (td.freq = 'weekly'  AND LOCATE(
            CASE DAYOFWEEK(:target_date)
                WHEN 1 THEN 'SU' WHEN 2 THEN 'MO' WHEN 3 THEN 'TU'
                WHEN 4 THEN 'WE' WHEN 5 THEN 'TH' WHEN 6 THEN 'FR'
                ELSE 'SA' END,
            td.byweekday
        ) > 0)
      );


-- ------------------------------------------------------------
-- Q2. 当日のタスク一覧を取得する（チェック画面用）
-- ------------------------------------------------------------
SELECT
    l.id,
    l.task_name_snapshot AS name,
    l.task_type_snapshot AS type,
    l.is_done,
    l.completed_at,
    td.memo,
    td.color
FROM task_logs l
JOIN task_definitions td ON td.id = l.task_definition_id
WHERE l.target_date = :target_date
ORDER BY td.remind_time IS NULL, td.remind_time, l.id;


-- ------------------------------------------------------------
-- Q3. 実行ボタンを押す／押し直す
--     押すたびに 0 ⇄ 1 が入れ替わり、時刻も連動する
--
--     注意：MariaDB の UPDATE は左から順に評価されるため、
--     is_done を先に書き換えると completed_at の判定が狂う。
--     completed_at を先に書くこと。
-- ------------------------------------------------------------
UPDATE task_logs
SET completed_at = CASE WHEN is_done = 0 THEN NOW() ELSE NULL END,
    is_done      = 1 - is_done
WHERE id = :log_id;


-- ------------------------------------------------------------
-- Q4. 指定月のカレンダー用データを一括取得する
--     画面を開くたびに日ごとに問い合わせない（性能要件）
-- ------------------------------------------------------------
SELECT *
FROM v_calendar_cell
WHERE target_date BETWEEN :month_start AND LAST_DAY(:month_start)
ORDER BY target_date;


-- ------------------------------------------------------------
-- Q5. 日別詳細：収支の明細
-- ------------------------------------------------------------
SELECT
    t.id,
    t.kind,
    c.name AS category,
    t.amount,
    t.memo
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.entry_date = :target_date
  AND t.deleted_at IS NULL
ORDER BY t.kind DESC, t.id;


-- ------------------------------------------------------------
-- Q6. 月次サマリー：カテゴリ別の支出内訳
-- ------------------------------------------------------------
SELECT
    c.name        AS category,
    SUM(t.amount) AS total,
    COUNT(*)      AS cnt,
    ROUND(100.0 * SUM(t.amount) / (
        SELECT SUM(amount) FROM transactions
        WHERE kind = 'expense' AND deleted_at IS NULL
          AND entry_date BETWEEN :month_start AND LAST_DAY(:month_start)
    ), 1) AS pct
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.kind = 'expense'
  AND t.deleted_at IS NULL
  AND t.entry_date BETWEEN :month_start AND LAST_DAY(:month_start)
GROUP BY c.name
ORDER BY total DESC;


-- ------------------------------------------------------------
-- Q7. 月次サマリー：タスクの平均完遂率
--     予定0件の日はそもそも v_daily_task に行がない
--     ＝「対象なし」が自動的に母数から外れる
-- ------------------------------------------------------------
SELECT
    ROUND(AVG(rate), 1) AS avg_rate,
    COUNT(*)            AS active_days,
    SUM(planned)        AS total_planned,
    SUM(done)           AS total_done
FROM v_daily_task
WHERE target_date BETWEEN :month_start AND LAST_DAY(:month_start);


-- ------------------------------------------------------------
-- Q8. ルーティンの連続達成日数（現在何日続いているか）
--     直近から遡り、未実行に当たった時点で止める
--     ウィンドウ関数は MariaDB 10.2 以降で使用可能
-- ------------------------------------------------------------
WITH ordered AS (
    SELECT
        target_date,
        is_done,
        ROW_NUMBER() OVER (ORDER BY target_date DESC) AS rn
    FROM task_logs
    WHERE task_definition_id = :task_id
      AND target_date <= :target_date
),
first_miss AS (
    SELECT MIN(rn) AS rn FROM ordered WHERE is_done = 0
)
SELECT COALESCE((SELECT rn FROM first_miss) - 1,
                (SELECT COUNT(*) FROM ordered)) AS streak;


-- ------------------------------------------------------------
-- Q9. タスクをやめる（削除しない）
--     終了日を入れるだけ。過去の task_logs は一切変わらない
-- ------------------------------------------------------------
UPDATE task_definitions
SET end_date = :target_date
WHERE id = :task_id;
-- updated_at は ON UPDATE CURRENT_TIMESTAMP により自動更新される


-- ------------------------------------------------------------
-- Q10. 収支の論理削除
--      物理削除しないので、同期時に「消した」ことを他端末へ伝えられる
-- ------------------------------------------------------------
UPDATE transactions
SET deleted_at = NOW()
WHERE id = :tx_id;


-- ============================================================
-- 動作確認用（手で打って結果を見る）
-- ============================================================
-- SELECT * FROM v_daily_balance;
-- SELECT * FROM v_daily_task;
-- SELECT * FROM v_calendar_cell ORDER BY target_date;

-- 制約が効いていることの確認（いずれもエラーになるのが正しい）
-- INSERT INTO transactions (entry_date,kind,category_id,amount)
--   VALUES ('2026-09-08','expense',1,-500);                      -- マイナス金額
-- INSERT INTO task_logs (task_definition_id,target_date,is_done,completed_at,
--                        task_name_snapshot,task_type_snapshot)
--   VALUES (1,'2026-09-20',0,'2026-09-20 10:00','x','routine');  -- 未実行なのに時刻あり
-- INSERT INTO task_definitions (name,task_type,freq,start_date,end_date)
--   VALUES ('x','single','once','2026-09-10','2026-09-01');      -- 終了日が開始日より前
