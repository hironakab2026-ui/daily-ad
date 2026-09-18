-- ============================================================
-- 初期データ（定番種目・手動バックフィル用）
--   2026-09-18以降、新規ユーザー（端末）が作成されると
--   server/middleware/auth.js が自動でこの一覧を投入するようになったため、
--   このファイルは「それより前に作られた既存ユーザー」への
--   バックフィル、または任意のDBへの手動投入にのみ使う。
--   INSERT IGNORE なので、同名の種目が既にあるユーザーには重複投入されない
--   （ただし既存行の mets・target_note が更新されるわけではない点に注意）。
--   mets・target_note の出典は server/lib/defaultExercises.js のコメントを参照。
-- ============================================================
USE life_manager;

INSERT IGNORE INTO exercises (user_id, name, body_part, sort_order, mets, target_note)
SELECT u.id, x.name, x.body_part, x.sort_order, x.mets, x.target_note
FROM users u
CROSS JOIN (
    SELECT 'ベンチプレス' AS name, '胸' AS body_part, 1 AS sort_order, 5.0 AS mets, '大胸筋・三角筋前部・上腕三頭筋' AS target_note
    UNION ALL SELECT '腕立て伏せ', '胸', 2, 3.0, '大胸筋・上腕三頭筋・体幹'
    UNION ALL SELECT 'ダンベルフライ', '胸', 3, 3.5, '大胸筋（ストレッチを重視する種目）'
    UNION ALL SELECT 'デッドリフト', '背中', 4, 5.0, '脊柱起立筋・臀筋・ハムストリングス・背中全体'
    UNION ALL SELECT '懸垂', '背中', 5, 3.8, '広背筋・上腕二頭筋'
    UNION ALL SELECT 'ラットプルダウン', '背中', 6, 3.5, '広背筋・僧帽筋'
    UNION ALL SELECT 'スクワット', '脚', 7, 5.0, '大腿四頭筋・臀筋・ハムストリングス'
    UNION ALL SELECT 'レッグプレス', '脚', 8, 3.5, '大腿四頭筋・臀筋'
    UNION ALL SELECT 'ランジ', '脚', 9, 3.0, '大腿四頭筋・臀筋・体幹バランス'
    UNION ALL SELECT 'ショルダープレス', '肩', 10, 3.5, '三角筋・上腕三頭筋'
    UNION ALL SELECT 'サイドレイズ', '肩', 11, 3.5, '三角筋（中部）'
    UNION ALL SELECT 'アームカール', '腕', 12, 3.5, '上腕二頭筋'
    UNION ALL SELECT 'トライセプスエクステンション', '腕', 13, 3.5, '上腕三頭筋'
    UNION ALL SELECT 'クランチ', '腹', 14, 2.8, '腹直筋（上部）'
    UNION ALL SELECT 'プランク', '腹', 15, 2.8, '腹直筋・体幹全体（アイソメトリック）'
) x;

-- 既存行（このマイグレーション以前に投入されたユーザー分）の mets・target_note を
-- 定番種目と同名であれば埋める（INSERT IGNOREでは更新されないため別途UPDATE）。
UPDATE exercises e
JOIN (
    SELECT 'ベンチプレス' AS name, 5.0 AS mets, '大胸筋・三角筋前部・上腕三頭筋' AS target_note
    UNION ALL SELECT '腕立て伏せ', 3.0, '大胸筋・上腕三頭筋・体幹'
    UNION ALL SELECT 'ダンベルフライ', 3.5, '大胸筋（ストレッチを重視する種目）'
    UNION ALL SELECT 'デッドリフト', 5.0, '脊柱起立筋・臀筋・ハムストリングス・背中全体'
    UNION ALL SELECT '懸垂', 3.8, '広背筋・上腕二頭筋'
    UNION ALL SELECT 'ラットプルダウン', 3.5, '広背筋・僧帽筋'
    UNION ALL SELECT 'スクワット', 5.0, '大腿四頭筋・臀筋・ハムストリングス'
    UNION ALL SELECT 'レッグプレス', 3.5, '大腿四頭筋・臀筋'
    UNION ALL SELECT 'ランジ', 3.0, '大腿四頭筋・臀筋・体幹バランス'
    UNION ALL SELECT 'ショルダープレス', 3.5, '三角筋・上腕三頭筋'
    UNION ALL SELECT 'サイドレイズ', 3.5, '三角筋（中部）'
    UNION ALL SELECT 'アームカール', 3.5, '上腕二頭筋'
    UNION ALL SELECT 'トライセプスエクステンション', 3.5, '上腕三頭筋'
    UNION ALL SELECT 'クランチ', 2.8, '腹直筋（上部）'
    UNION ALL SELECT 'プランク', 2.8, '腹直筋・体幹全体（アイソメトリック）'
) x ON x.name = e.name
SET e.mets = x.mets, e.target_note = x.target_note
WHERE e.target_note IS NULL;
