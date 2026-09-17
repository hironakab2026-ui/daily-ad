const express = require('express');
const pool = require('../db');

const router = express.Router();

// ============================================================
// スケジュール管理アプリ（APP-4）
//   04_要件定義書_スケジュール管理アプリ.md に対応。
//   本来は別アプリとして content_summary_cache 経由（トークン認証）で
//   ハブに要約を渡す想定だが（00_システム全体構成・連携仕様.md）、
//   学習段階の単一リポジトリ構成のため、この router 内で直接
//   content_summary_cache を UPSERT する（syncDaySummary）。
//   ハブ側（server/routes/summary.js）は同キャッシュを読むだけで、
//   このファイルの他のテーブルには触れない（CLAUDE.md 4.1 の境界を維持）。
// ============================================================

const FREQS = ['once', 'daily', 'weekly', 'monthly'];

function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function todayForServer() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// task_definitions と同じ「予定を先に行として生成する」方式（CLAUDE.md 4.4）。
// 生成済みの行（は個別編集・削除されていても）は UNIQUE KEY により上書きされない。
async function ensureOccurrencesGenerated(userId, startDate, endDate) {
  await pool.query(
    `INSERT IGNORE INTO schedule_occurrences
        (user_id, schedule_definition_id, occurrence_date, title, location, memo, is_all_day, start_at, end_at)
     WITH RECURSIVE dates AS (
        SELECT CAST(? AS DATE) AS d
        UNION ALL
        SELECT d + INTERVAL 1 DAY FROM dates WHERE d < ?
     )
     SELECT sd.user_id, sd.id, dt.d, sd.title, sd.location, sd.memo, sd.is_all_day,
            CASE WHEN sd.is_all_day THEN NULL ELSE TIMESTAMP(dt.d, sd.start_time) END,
            CASE WHEN sd.is_all_day THEN NULL ELSE TIMESTAMP(dt.d, sd.end_time) END
     FROM dates dt
     JOIN schedule_definitions sd
       ON sd.user_id = ?
      AND sd.deleted_at IS NULL
      AND dt.d >= sd.start_date
      AND dt.d <= COALESCE(sd.end_date, '9999-12-31')
      AND (
            sd.freq = 'daily'
         OR (sd.freq = 'once'    AND sd.start_date = dt.d)
         OR (sd.freq = 'monthly' AND sd.bymonthday = DAY(dt.d))
         OR (sd.freq = 'weekly'  AND LOCATE(
                CASE DAYOFWEEK(dt.d)
                    WHEN 1 THEN 'SU' WHEN 2 THEN 'MO' WHEN 3 THEN 'TU'
                    WHEN 4 THEN 'WE' WHEN 5 THEN 'TH' WHEN 6 THEN 'FR'
                    ELSE 'SA' END,
                sd.byweekday
            ) > 0)
          )`,
    [startDate, endDate, userId]
  );
}

function hourDecimal(datetimeStr) {
  // dateStrings:true のため 'YYYY-MM-DD HH:MM:SS' 形式の文字列で来る
  const time = datetimeStr.split(' ')[1] || '00:00:00';
  const [h, m] = time.split(':').map(Number);
  return Math.round((h + m / 60) * 10) / 10;
}

// その日の要約を content_summary_cache（content_key='schedule'）に反映する。
// ハブ（A1-01/A1-06）には棒状（bars）＋件数のみを渡し、予定名などの詳細は渡さない（CLAUDE.md 4.1）。
async function syncDaySummary(userId, date) {
  const [rows] = await pool.query(
    `SELECT o.is_all_day, o.start_at, o.end_at
     FROM schedule_occurrences o
     JOIN schedule_definitions sd ON sd.id = o.schedule_definition_id
     JOIN schedule_calendars sc ON sc.id = sd.calendar_id
     WHERE o.user_id = ? AND o.occurrence_date = ? AND o.deleted_at IS NULL
       AND sc.deleted_at IS NULL AND sc.is_visible = 1
     ORDER BY o.start_at`,
    [userId, date]
  );
  const timed = rows.filter((r) => !r.is_all_day && r.start_at && r.end_at);
  const allDayCount = rows.length - timed.length;
  const bars = timed.slice(0, 6).map((r) => [hourDecimal(r.start_at), hourDecimal(r.end_at)]);

  const status = rows.length > 0 ? 'recorded' : 'none';
  const badge = rows.length > 0 ? `${rows.length}件` : null;
  const metrics = rows.length > 0 ? JSON.stringify({ event_count: rows.length, all_day_count: allDayCount, bars }) : null;

  await pool.query(
    `INSERT INTO content_summary_cache (user_id, content_key, target_date, status, grade, badge, metrics, deep_link)
     VALUES (?, 'schedule', ?, ?, NULL, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status), badge = VALUES(badge), metrics = VALUES(metrics),
       deep_link = VALUES(deep_link), fetched_at = NOW()`,
    [userId, date, status, badge, metrics, `/?tab=schedule&date=${date}`]
  );
}

// ------------------------------------------------------------
// カレンダー（用途別グループ）
// ------------------------------------------------------------
router.get('/calendars', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, color, is_visible, sort_order FROM schedule_calendars WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order, id',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/calendars', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name は必須です' });
    if (!color) return res.status(400).json({ error: 'color は必須です' });
    const [[{ maxOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM schedule_calendars WHERE user_id = ?',
      [req.userId]
    );
    const [result] = await pool.query(
      'INSERT INTO schedule_calendars (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)',
      [req.userId, name.trim(), color, maxOrder + 1]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

router.patch('/calendars/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'color', 'is_visible'];
    const fields = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(req.body[key]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: '更新する項目がありません' });
    params.push(req.params.id, req.userId);
    await pool.query(`UPDATE schedule_calendars SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// カレンダーの削除（論理削除）。所属する予定（定義）も今後分を停止する。過去の記録は消えない。
router.delete('/calendars/:id', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const [[{ cnt }]] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM schedule_calendars WHERE user_id = ? AND deleted_at IS NULL',
      [req.userId]
    );
    if (cnt <= 1) {
      return res.status(400).json({ error: '最後の1つのカレンダーは削除できません' });
    }
    await conn.beginTransaction();
    await conn.query('UPDATE schedule_calendars SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    const [defs] = await conn.query(
      'SELECT id FROM schedule_definitions WHERE calendar_id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, req.userId]
    );
    if (defs.length) {
      const defIds = defs.map((d) => d.id);
      await conn.query(`UPDATE schedule_definitions SET deleted_at = NOW() WHERE id IN (?)`, [defIds]);
      await conn.query(
        `UPDATE schedule_occurrences SET deleted_at = NOW()
         WHERE schedule_definition_id IN (?) AND occurrence_date >= CURDATE() AND deleted_at IS NULL`,
        [defIds]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------
// 予定の定義（作成・編集・削除＝シリーズ停止）
// ------------------------------------------------------------
router.post('/events', async (req, res, next) => {
  try {
    const {
      calendar_id, title, location, memo, is_all_day,
      start_time, end_time, freq, byweekday, bymonthday,
      start_date, end_date, remind_minutes_before,
    } = req.body;

    if (!calendar_id) return res.status(400).json({ error: 'calendar_id は必須です' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'title は必須です' });
    if (!FREQS.includes(freq)) return res.status(400).json({ error: 'freq が不正です' });
    if (!start_date || !isDate(start_date)) return res.status(400).json({ error: 'start_date は必須です' });
    if (end_date && end_date < start_date) return res.status(400).json({ error: 'end_date は start_date 以降にしてください' });
    if (freq === 'weekly' && !byweekday) return res.status(400).json({ error: 'freq=weekly の場合 byweekday は必須です' });
    if (freq === 'monthly' && !bymonthday) return res.status(400).json({ error: 'freq=monthly の場合 bymonthday は必須です' });
    if (!is_all_day && (!start_time || !end_time)) {
      return res.status(400).json({ error: '終日でない場合 start_time / end_time は必須です' });
    }
    if (!is_all_day && start_time >= end_time) {
      return res.status(400).json({ error: 'end_time は start_time より後にしてください（日をまたぐ予定は未対応）' });
    }

    const [result] = await pool.query(
      `INSERT INTO schedule_definitions
        (user_id, calendar_id, title, location, memo, is_all_day, start_time, end_time,
         freq, byweekday, bymonthday, start_date, end_date, remind_minutes_before)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId, calendar_id, title.trim(), location || null, memo || null,
        is_all_day ? 1 : 0, is_all_day ? null : start_time, is_all_day ? null : end_time,
        freq, byweekday || null, bymonthday || null,
        start_date, end_date || null, remind_minutes_before || null,
      ]
    );
    // occurrences は本来 GET /events 等で遅延生成されるが、それだと今日作成した予定が
    // ハブの当日サマリー（棒状カード）に即時反映されないため、当日分だけ先に生成しておく
    await ensureOccurrencesGenerated(req.userId, todayForServer(), todayForServer());
    await syncDaySummary(req.userId, todayForServer());
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// シリーズ全体の編集フォームを開くための単一定義の取得
router.get('/events/:id', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT id, calendar_id, title, location, memo, is_all_day, start_time, end_time,
              freq, byweekday, bymonthday, start_date, end_date, remind_minutes_before
       FROM schedule_definitions WHERE id = ? AND user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!row) return res.status(404).json({ error: '見つかりません' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// 定義の編集。task_definitions と同じく、既に生成済みの occurrences には遡って反映しない
// （まだ生成されていない未来の回にのみ、新しい内容が使われる）。
router.patch('/events/:id', async (req, res, next) => {
  try {
    const allowed = [
      'calendar_id', 'title', 'location', 'memo', 'is_all_day', 'start_time', 'end_time',
      'freq', 'byweekday', 'bymonthday', 'start_date', 'end_date', 'remind_minutes_before',
    ];
    const fields = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(req.body[key] === '' ? null : req.body[key]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: '更新する項目がありません' });
    params.push(req.params.id, req.userId);
    await pool.query(`UPDATE schedule_definitions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params);
    await ensureOccurrencesGenerated(req.userId, todayForServer(), todayForServer());
    await syncDaySummary(req.userId, todayForServer());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// シリーズの削除（論理削除）。過去に生成済みの回は残す。今日以降の回はキャンセルする。
router.delete('/events/:id', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE schedule_definitions SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    await conn.query(
      `UPDATE schedule_occurrences SET deleted_at = NOW()
       WHERE schedule_definition_id = ? AND occurrence_date >= CURDATE() AND deleted_at IS NULL`,
      [req.params.id]
    );
    await conn.commit();
    await syncDaySummary(req.userId, todayForServer());
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------
// 予定の生成済み一覧（週表示・日表示・月表示 共通）
// ------------------------------------------------------------
router.get('/events', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!isDate(start) || !isDate(end)) {
      return res.status(400).json({ error: 'start / end は YYYY-MM-DD 形式で指定してください' });
    }
    await ensureOccurrencesGenerated(req.userId, start, end);

    const [rows] = await pool.query(
      `SELECT o.id, o.schedule_definition_id, o.occurrence_date, o.title, o.location, o.memo,
              o.is_all_day, o.start_at, o.end_at, o.is_exception,
              sd.freq, sd.remind_minutes_before,
              sc.id AS calendar_id, sc.name AS calendar_name, sc.color AS calendar_color
       FROM schedule_occurrences o
       JOIN schedule_definitions sd ON sd.id = o.schedule_definition_id
       JOIN schedule_calendars sc ON sc.id = sd.calendar_id
       WHERE o.user_id = ? AND o.deleted_at IS NULL
         AND sc.deleted_at IS NULL AND sc.is_visible = 1
         AND o.occurrence_date BETWEEN ? AND ?
       ORDER BY o.occurrence_date, o.is_all_day DESC, o.start_at`,
      [req.userId, start, end]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// 月表示・ホーム画面カード用：日ごとの「棒状」サマリー（時間帯の配列のみ。予定名は含まない＝視覚専用）
router.get('/bars', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!isDate(start) || !isDate(end)) {
      return res.status(400).json({ error: 'start / end は YYYY-MM-DD 形式で指定してください' });
    }
    await ensureOccurrencesGenerated(req.userId, start, end);

    const [rows] = await pool.query(
      `SELECT o.occurrence_date, o.is_all_day, o.start_at, o.end_at, sc.color
       FROM schedule_occurrences o
       JOIN schedule_definitions sd ON sd.id = o.schedule_definition_id
       JOIN schedule_calendars sc ON sc.id = sd.calendar_id
       WHERE o.user_id = ? AND o.deleted_at IS NULL
         AND sc.deleted_at IS NULL AND sc.is_visible = 1
         AND o.occurrence_date BETWEEN ? AND ?
       ORDER BY o.occurrence_date, o.start_at`,
      [req.userId, start, end]
    );

    const byDate = {};
    for (const r of rows) {
      const d = r.occurrence_date;
      if (!byDate[d]) byDate[d] = { count: 0, all_day_count: 0, segments: [] };
      byDate[d].count += 1;
      if (r.is_all_day || !r.start_at || !r.end_at) {
        byDate[d].all_day_count += 1;
      } else if (byDate[d].segments.length < 8) {
        byDate[d].segments.push([hourDecimal(r.start_at), hourDecimal(r.end_at), r.color]);
      }
    }
    res.json(byDate);
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------
// 生成済みの回（occurrence）単位の編集・キャンセル（F-09-04：この回だけ変更する）
// ------------------------------------------------------------
router.patch('/occurrences/:id', async (req, res, next) => {
  try {
    const allowed = ['title', 'location', 'memo', 'is_all_day', 'start_at', 'end_at'];
    const fields = ['is_exception = 1'];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(req.body[key] === '' ? null : req.body[key]);
      }
    }
    params.push(req.params.id, req.userId);
    await pool.query(`UPDATE schedule_occurrences SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params);
    const [[row]] = await pool.query('SELECT occurrence_date FROM schedule_occurrences WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (row) await syncDaySummary(req.userId, row.occurrence_date);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// この回だけキャンセル（シリーズ自体は残る）
router.delete('/occurrences/:id', async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT occurrence_date FROM schedule_occurrences WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    await pool.query('UPDATE schedule_occurrences SET deleted_at = NOW(), is_exception = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (row) await syncDaySummary(req.userId, row.occurrence_date);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
