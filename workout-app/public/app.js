// ============================================================
// 運動管理アプリ（APP-3）フロントエンド（Web / Vanilla JS）
//   生活管理アプリ（APP-1）と同じ構成（ハブ＆アドオン）のアドオン側。
//   自分の記録（exercises / workout_logs）だけを持ち、
//   ハブへは要約（grade・badge・metrics）だけを送る。
// ============================================================

const GRADE_LABEL = { S: '絶好調', A: '好調', B: 'まずまず', C: '低調' };

const state = {
  tab: 'today',
  user: null,
  exercises: [],
  historyDays: 14,
  calendarMonth: todayStr().slice(0, 7),
};

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const todayFixed = todayStr();

// ------------------------------------------------------------
// 消費カロリーの推定
//   体重はこのアプリのDBに保存しない（他アプリ・ハブに送らない、この端末の
//   ブラウザにのみ残る値として扱う）。計算式・METs値の出典は
//   server/lib/defaultExercises.js のコメントを参照。
//   1セットの実施時間を記録していないため「1セット≒1分」と仮定する。
// ------------------------------------------------------------
const BODY_WEIGHT_KEY = 'workout-app:body-weight-kg';
const DEFAULT_BODY_WEIGHT = 60;

function getBodyWeight() {
  try {
    const v = Number(localStorage.getItem(BODY_WEIGHT_KEY));
    return v > 0 ? v : DEFAULT_BODY_WEIGHT;
  } catch (e) {
    return DEFAULT_BODY_WEIGHT;
  }
}

function setBodyWeight(kg) {
  try { localStorage.setItem(BODY_WEIGHT_KEY, String(kg)); } catch (e) { /* ignore */ }
}

// kcal = メッツ × 体重(kg) × 時間(h)。1セット = 1/60時間 という仮定のもとでの概算。
function estimateKcalFromMets(metsSum) {
  return Math.round(metsSum * getBodyWeight() * (1 / 60));
}

function addDaysStr(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function fmtDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  return `${m}月${d}日(${w})`;
}

function fmtDateShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    throw new Error(body?.error || `リクエストに失敗しました (${res.status})`);
  }
  return body;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function openModal(html) {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-sheet">${html}</div>
    </div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  fillIcons(document.getElementById('modal-root'));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fillIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.dataset.filled) {
      el.innerHTML = icon(el.dataset.icon, el.dataset.iconSize ? Number(el.dataset.iconSize) : 20);
      el.dataset.filled = '1';
    }
  });
}

async function ensureExercises() {
  state.exercises = await api('/exercises');
  return state.exercises;
}

// ------------------------------------------------------------
// ルーティング / タブ
// ------------------------------------------------------------
const TAB_TITLES = { today: '今日', log: '記録', exercises: '種目', summary: 'サマリー', settings: '設定' };

// カレンダー・日別詳細で使う分割メニューの予定カテゴリ
const PLAN_CATEGORIES = ['胸', '背中', '脚', '肩', '腕', '腹', '有酸素', 'OFF'];

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('nav.tabbar button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.getElementById('topbar-title').textContent = TAB_TITLES[tab];
  render();
}

async function render() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="empty">読み込み中…</div>';
  try {
    if (state.tab === 'today') await renderToday(view);
    else if (state.tab === 'log') await renderLog(view);
    else if (state.tab === 'exercises') await renderExercises(view);
    else if (state.tab === 'summary') await renderSummary(view);
    else if (state.tab === 'settings') await renderSettings(view);
    fillIcons(view);
  } catch (err) {
    view.innerHTML = `<div class="empty">エラー: ${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================
// A3-01 当日サマリー
// ============================================================
async function renderToday(view) {
  const date = todayFixed;
  const [summary, sets] = await Promise.all([
    api(`/summary/today?date=${date}`),
    api(`/workouts?date=${date}`),
  ]);

  view.innerHTML = `
    <div class="card">
      <div class="date-label" style="font-size:12px;color:var(--muted);margin-bottom:10px;">${escapeHtml(fmtDateLabel(date))}</div>
      <div class="grade-hero">
        ${gradeCircleHtml(summary.grade)}
        <div>
          <div style="font-weight:700;font-size:15px;">${GRADE_LABEL[summary.grade] || ''}（直近7日の頻度）</div>
          ${summary.badge ? `<div class="grade-badge-text">${escapeHtml(summary.badge)}</div>` : ''}
        </div>
      </div>
      <div class="stat-line-grid">
        <div class="stat-line"><span>今日のセット数</span><span class="stat-val">${summary.metrics.sets}</span></div>
        <div class="stat-line"><span>今日のボリューム</span><span class="stat-val">${summary.metrics.volume_kg} kg</span></div>
        <div class="stat-line"><span>推定消費カロリー</span><span class="stat-val">${estimateKcalFromMets(summary.mets_sum)} kcal</span></div>
        <div class="stat-line"><span>直近7日の実施日数</span><span class="stat-val">${summary.metrics.week_days} / 7日</span></div>
        <div class="stat-line"><span>連続トレーニング日数</span><span class="stat-val">${summary.metrics.streak_days}日</span></div>
      </div>
      <div class="li-sub" style="margin-top:8px;">消費カロリーはメッツ値と体重（現在${getBodyWeight()}kgで計算・設定タブで変更可）からの概算です</div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>今日の記録（${sets.length}セット）</h2>
        <button class="btn-labeled" id="add-set-btn"><span data-icon="plus"></span>記録</button>
      </div>
      <div id="today-set-list">
        ${sets.length ? sets.map(setRowHtml).join('') : '<div class="empty">まだ記録がありません</div>'}
      </div>
    </div>
  `;

  document.getElementById('add-set-btn').addEventListener('click', () => openAddSetModal(date, () => renderToday(view)));
  bindSetDelete(view, date, () => renderToday(view));
}

function gradeCircleHtml(grade) {
  const g = grade || 'C';
  return `<div class="grade-circle grade-${g}">${g}</div>`;
}

function setRowHtml(s) {
  return `
    <div class="set-row" data-id="${s.id}">
      <div class="body-icon sm">${icon(bodyPartIconName(s.exercise_body_part), 16)}</div>
      <div class="set-row-info">
        <div class="set-row-name">${escapeHtml(s.exercise_name)}</div>
        <div class="set-row-meta">${s.set_no}セット目 ・ ${s.weight_kg}kg × ${s.reps}回${s.memo ? ' ・ ' + escapeHtml(s.memo) : ''}</div>
      </div>
      <button class="icon-btn" data-del-set="${s.id}" data-icon="x" data-icon-size="16"></button>
    </div>
  `;
}

function bindSetDelete(root, date, onDone) {
  root.querySelectorAll('[data-del-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('この記録を削除しますか？')) return;
      await api(`/workouts/${btn.dataset.delSet}`, { method: 'DELETE' });
      toast('削除しました');
      onDone();
    });
  });
}

// ============================================================
// A3-02 トレーニング記録（カレンダーから日付を選んで記録・予定を管理）
// ============================================================
async function renderLog(view) {
  const calRows = await api(`/summary/calendar?month=${state.calendarMonth}`);

  view.innerHTML = `
    <div class="card" id="cal-card">${calendarHtml(state.calendarMonth, calRows)}</div>
    <div class="li-sub" style="padding:0 2px;">
      塗りつぶし = 実施済み ・ 点線の輪郭 = 予定のみ。日付をタップすると詳細・予定の編集ができます。
    </div>
  `;

  document.getElementById('cal-card').querySelectorAll('[data-month-shift]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.calendarMonth = shiftMonth(state.calendarMonth, Number(btn.dataset.monthShift));
      renderLog(view);
    });
  });
  document.getElementById('cal-card').querySelectorAll('[data-cal-date]').forEach((el) => {
    el.addEventListener('click', () => openDayDetailModal(el.dataset.calDate, () => renderLog(view)));
  });
}

async function openAddSetModal(date, onSaved) {
  const exercises = await ensureExercises();
  if (!exercises.length) {
    closeModal();
    toast('先に「種目」タブで種目を登録してください');
    return;
  }
  let exerciseId = exercises[0].id;
  let weight = '';
  let reps = '';
  let memo = '';

  function draw() {
    openModal(`
      <h2>記録を追加</h2>
      <div class="hint">${escapeHtml(fmtDateLabel(date))}</div>
      <div class="field">
        <label>種目</label>
        <div class="exercise-picker">
          ${exercises.map((e) => `
            <div class="exercise-chip ${e.id === exerciseId ? 'selected' : ''}" data-pick-ex="${e.id}">
              <div class="body-icon">${icon(bodyPartIconName(e.body_part), 20)}</div>
              <div class="chip-name">${escapeHtml(e.name)}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>重量 (kg)</label><input type="number" id="set-weight" value="${escapeHtml(weight)}" step="0.5" min="0" inputmode="decimal"></div>
        <div class="field"><label>回数</label><input type="number" id="set-reps" value="${escapeHtml(reps)}" step="1" min="1" inputmode="numeric"></div>
      </div>
      <div class="field"><label>メモ（任意）</label><input type="text" id="set-memo" value="${escapeHtml(memo)}"></div>
      <button class="btn" id="save-set">追加する</button>
    `);

    document.querySelectorAll('[data-pick-ex]').forEach((chip) => {
      chip.addEventListener('click', () => {
        exerciseId = Number(chip.dataset.pickEx);
        weight = document.getElementById('set-weight').value;
        reps = document.getElementById('set-reps').value;
        memo = document.getElementById('set-memo').value;
        draw();
      });
    });
    document.getElementById('save-set').addEventListener('click', async () => {
      const w = document.getElementById('set-weight').value;
      const r = document.getElementById('set-reps').value;
      if (w === '' || r === '') return toast('重量と回数を入力してください');
      try {
        await api('/workouts', {
          method: 'POST',
          body: JSON.stringify({
            log_date: date,
            exercise_id: exerciseId,
            weight_kg: Number(w),
            reps: Number(r),
            memo: document.getElementById('set-memo').value.trim() || null,
          }),
        });
        toast('記録しました');
        closeModal();
        onSaved();
      } catch (err) {
        toast(err.message);
      }
    });
  }

  draw();
}

// ============================================================
// A3-03 種目マスタ管理
// ============================================================
async function renderExercises(view) {
  const exercises = await api('/exercises?all=1');
  view.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>種目一覧</h2>
        <button class="btn-labeled" id="add-ex-btn"><span data-icon="plus"></span>種目</button>
      </div>
      <ul class="settings-list" id="ex-list">
        ${exercises.length ? exercises.map(exerciseRowHtml).join('') : '<li class="empty">まだ種目がありません</li>'}
      </ul>
    </div>
  `;
  document.getElementById('add-ex-btn').addEventListener('click', () => openExerciseModal(null, () => renderExercises(view)));
  view.querySelectorAll('[data-edit-ex]').forEach((row) => {
    row.addEventListener('click', () => {
      const ex = exercises.find((e) => e.id === Number(row.dataset.editEx));
      if (ex) openExerciseModal(ex, () => renderExercises(view));
    });
  });
}

function exerciseRowHtml(e) {
  return `
    <li data-edit-ex="${e.id}" style="cursor:pointer;${e.is_active ? '' : 'opacity:0.5;'}">
      <div class="body-icon">${icon(bodyPartIconName(e.body_part), 20)}</div>
      <div class="li-main">
        <div>${escapeHtml(e.name)}</div>
        <div class="li-sub">${e.body_part ? escapeHtml(e.body_part) + ' ・ ' : ''}${e.target_note ? escapeHtml(e.target_note) : ''}${e.mets ? ` ・ ${e.mets} METs` : ''}</div>
      </div>
      ${e.is_active ? '' : '<span class="li-sub">非表示</span>'}
      <span data-icon="edit" data-icon-size="16" style="color:var(--muted);"></span>
    </li>
  `;
}

function openExerciseModal(exercise, onSaved) {
  const isNew = !exercise;
  openModal(`
    <h2>${isNew ? '種目を追加' : '種目を編集'}</h2>
    <div class="field"><label>名前</label><input type="text" id="ex-name" value="${exercise ? escapeHtml(exercise.name) : ''}"></div>
    <div class="field"><label>部位（任意）</label><input type="text" id="ex-part" value="${exercise ? escapeHtml(exercise.body_part || '') : ''}" placeholder="例：胸・背中・脚"></div>
    <div class="field"><label>効く部位・筋肉（任意）</label><input type="text" id="ex-target" value="${exercise ? escapeHtml(exercise.target_note || '') : ''}" placeholder="例：大胸筋・上腕三頭筋"></div>
    <div class="field">
      <label>METs（消費カロリー計算用・任意）</label>
      <input type="number" id="ex-mets" value="${exercise && exercise.mets ? exercise.mets : ''}" step="0.1" min="0.1" max="29.9" placeholder="例：3.5（不明なら空欄でOK）">
      <div class="li-sub">出典：改訂第2版 身体活動のメッツ表 成人版（医薬基盤・健康・栄養研究所, 2024）。ぴったりの種目がない場合は近いカテゴリの値を目安に。</div>
    </div>
    <button class="btn" id="save-ex">${isNew ? '追加する' : '保存する'}</button>
    ${!isNew ? `
      <div style="height:8px;"></div>
      <button class="btn secondary" id="toggle-ex">${exercise.is_active ? '非表示にする（記録は残ります）' : '再表示する'}</button>
    ` : ''}
  `);

  document.getElementById('save-ex').addEventListener('click', async () => {
    const name = document.getElementById('ex-name').value.trim();
    if (!name) return toast('名前を入力してください');
    const bodyPart = document.getElementById('ex-part').value.trim() || null;
    const targetNote = document.getElementById('ex-target').value.trim() || null;
    const metsInput = document.getElementById('ex-mets').value;
    const mets = metsInput === '' ? undefined : Number(metsInput);
    try {
      if (isNew) {
        await api('/exercises', { method: 'POST', body: JSON.stringify({ name, body_part: bodyPart, target_note: targetNote, mets }) });
      } else {
        await api(`/exercises/${exercise.id}`, { method: 'PATCH', body: JSON.stringify({ name, body_part: bodyPart, target_note: targetNote, mets }) });
      }
      toast('保存しました');
      closeModal();
      state.exercises = [];
      onSaved();
    } catch (err) {
      toast(err.message);
    }
  });

  if (!isNew) {
    document.getElementById('toggle-ex').addEventListener('click', async () => {
      await api(`/exercises/${exercise.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: exercise.is_active ? 0 : 1 }) });
      toast('更新しました');
      closeModal();
      state.exercises = [];
      onSaved();
    });
  }
}

// ============================================================
// A3-04 履歴・評価
// ============================================================
async function renderSummary(view) {
  const days = state.historyDays;
  const rows = await api(`/summary/history?days=${days}`);
  const byDate = Object.fromEntries(rows.map((r) => [r.log_date, r]));
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(addDaysStr(todayFixed, -i));

  const volumeSeries = dates.map((d) => byDate[d]?.volume_kg || 0);
  const setsSeries = dates.map((d) => byDate[d]?.sets || 0);
  const kcalSeries = dates.map((d) => estimateKcalFromMets(byDate[d]?.mets_sum || 0));
  const activeDays = dates.filter((d) => byDate[d]).length;
  const totalVolume = volumeSeries.reduce((a, b) => a + b, 0);
  const totalKcal = kcalSeries.reduce((a, b) => a + b, 0);

  view.innerHTML = `
    <div class="segmented" id="range-seg">
      <button data-range="14" class="${days === 14 ? 'active' : ''}">2週間</button>
      <button data-range="30" class="${days === 30 ? 'active' : ''}">1か月</button>
      <button data-range="60" class="${days === 60 ? 'active' : ''}">2か月</button>
    </div>
    <div class="card">
      <h2>ボリューム推移（重量×回数の合計）</h2>
      ${barChartHtml(dates, volumeSeries)}
      <div class="stat-line"><span>実施日数</span><span class="stat-val">${activeDays} / ${days}日</span></div>
      <div class="stat-line"><span>合計ボリューム</span><span class="stat-val">${totalVolume.toLocaleString('ja-JP')} kg</span></div>
    </div>
    <div class="card">
      <h2>セット数推移</h2>
      ${barChartHtml(dates, setsSeries)}
    </div>
    <div class="card">
      <h2>推定消費カロリー推移</h2>
      ${barChartHtml(dates, kcalSeries)}
      <div class="stat-line"><span>合計（概算）</span><span class="stat-val">${totalKcal.toLocaleString('ja-JP')} kcal</span></div>
      <div class="li-sub">体重${getBodyWeight()}kgとして計算（設定タブで変更可）</div>
    </div>
  `;

  view.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.historyDays = Number(btn.dataset.range);
      renderSummary(view);
    });
  });
}

function calendarHtml(month, rows) {
  const byDate = Object.fromEntries(rows.map((r) => [r.log_date, r]));
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = new Date(y, m - 1, 1).getDay();

  let cells = '';
  ['日', '月', '火', '水', '木', '金', '土'].forEach((w) => { cells += `<div class="cal-dow">${w}</div>`; });
  for (let i = 0; i < startWeekday; i++) cells += '<div class="cal-cell empty"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rec = byDate[dateStr];
    const isToday = dateStr === todayFixed;
    const hasRecord = rec && rec.sets > 0;
    const category = hasRecord ? rec.dominant_body_part : rec?.plan_category;
    const isOff = !hasRecord && rec?.plan_category === 'OFF';
    const stateClass = hasRecord ? 'has-record' : (rec?.plan_category ? (isOff ? 'plan-only plan-off' : 'plan-only') : '');
    cells += `
      <div class="cal-cell ${isToday ? 'today' : ''} ${stateClass}" data-cal-date="${dateStr}">
        <span>${day}</span>
        ${category ? `<span class="cal-cell-icon">${icon(bodyPartIconName(category), 15)}</span>` : ''}
      </div>`;
  }
  return `
    <div class="cal-head">
      <button data-month-shift="-1">${icon('chevronLeft', 18)}</button>
      <div class="month-label">${monthLabel(month)}</div>
      <button data-month-shift="1">${icon('chevronRight', 18)}</button>
    </div>
    <div class="cal-grid">${cells}</div>
  `;
}

async function openDayDetailModal(date, onClose) {
  const [summary, sets, planRows] = await Promise.all([
    api(`/summary/today?date=${date}`),
    api(`/workouts?date=${date}`),
    api(`/plans?month=${date.slice(0, 7)}`),
  ]);
  const currentPlan = planRows.find((p) => p.plan_date === date)?.category || null;

  openModal(`
    <h2>${escapeHtml(fmtDateLabel(date))}の記録</h2>
    <div class="field">
      <label>この日の予定（部門）</label>
      <div class="exercise-picker" id="plan-picker" style="grid-template-columns:repeat(4, 1fr);">
        ${PLAN_CATEGORIES.map((cat) => `
          <div class="exercise-chip ${cat === currentPlan ? 'selected' : ''}" data-plan-cat="${escapeHtml(cat)}">
            <div class="body-icon sm">${icon(bodyPartIconName(cat), 15)}</div>
            <div class="chip-name">${escapeHtml(cat)}</div>
          </div>
        `).join('')}
      </div>
      <div class="li-sub">選択中のカテゴリをもう一度タップすると予定を取り消せます</div>
    </div>
    <div class="grade-hero">
      ${gradeCircleHtml(summary.grade)}
      <div>
        <div style="font-weight:700;font-size:15px;">${GRADE_LABEL[summary.grade] || ''}（直近7日の頻度）</div>
        ${summary.badge ? `<div class="grade-badge-text">${escapeHtml(summary.badge)}</div>` : ''}
      </div>
    </div>
    <div class="stat-line-grid" style="margin-bottom:14px;">
      <div class="stat-line"><span>セット数</span><span class="stat-val">${summary.metrics.sets}</span></div>
      <div class="stat-line"><span>ボリューム</span><span class="stat-val">${summary.metrics.volume_kg} kg</span></div>
      <div class="stat-line"><span>推定消費カロリー</span><span class="stat-val">${estimateKcalFromMets(summary.mets_sum)} kcal</span></div>
    </div>
    <div id="day-detail-sets">${sets.length ? sets.map(setRowHtml).join('') : '<div class="empty">この日の記録はありません</div>'}</div>
    <div style="height:10px;"></div>
    <button class="btn secondary" id="day-detail-add">この日に記録を追加</button>
  `);

  function refresh() { openDayDetailModal(date, onClose); if (onClose) onClose(); }

  document.getElementById('plan-picker').querySelectorAll('[data-plan-cat]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      const cat = chip.dataset.planCat;
      if (cat === currentPlan) {
        await api(`/plans/${date}`, { method: 'DELETE' });
        toast('予定を取り消しました');
      } else {
        await api(`/plans/${date}`, { method: 'PUT', body: JSON.stringify({ category: cat }) });
        toast('予定を保存しました');
      }
      refresh();
    });
  });
  bindSetDelete(document.getElementById('modal-root'), date, refresh);
  document.getElementById('day-detail-add').addEventListener('click', () => {
    openAddSetModal(date, () => { closeModal(); if (onClose) onClose(); });
  });
}

function barChartHtml(dates, values) {
  const max = Math.max(...values, 1);
  const showLabelEvery = Math.max(1, Math.ceil(dates.length / 8));
  return `
    <div class="bar-chart">
      ${dates.map((d, i) => {
        const v = values[i];
        const h = Math.max(2, Math.round((v / max) * 100));
        return `
          <div class="bar-col" title="${escapeHtml(fmtDateShort(d))}: ${v}">
            <div class="bar ${v ? '' : 'empty-bar'}" style="height:${h}%;"></div>
            <div class="bar-label">${i % showLabelEvery === 0 ? escapeHtml(fmtDateShort(d)) : ''}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ============================================================
// 設定（アカウント・ハブ連携）
// ============================================================
async function renderSettings(view) {
  const hub = await api('/hub/connection');

  view.innerHTML = `
    <div class="card">
      <h2>この端末</h2>
      <div style="font-size:14px;margin-bottom:4px;">${escapeHtml(state.user.display_name)}</div>
      <div class="li-sub">生活管理アプリ（APP-1）と共通の端末識別です。ニックネームの変更や端末のリセットは、生活管理アプリの設定画面から行ってください。</div>
    </div>
    <div class="card">
      <h2>消費カロリーの推定に使う体重</h2>
      <div class="li-sub" style="margin-bottom:10px;">この端末のブラウザにのみ保存され、生活管理アプリやサーバーには送信されません。未入力の場合は${DEFAULT_BODY_WEIGHT}kgとして概算します。</div>
      <div class="field-row" style="align-items:flex-end;">
        <div class="field" style="margin-bottom:0;"><input type="number" id="body-weight-input" value="${getBodyWeight()}" min="20" max="200" step="0.1"></div>
        <button class="btn secondary" id="save-weight-btn" style="width:auto;flex-shrink:0;">保存</button>
      </div>
    </div>
    <div class="card">
      <h2>生活管理アプリとの連携</h2>
      <div class="li-sub" style="margin-bottom:10px;">生活管理アプリの「設定 → 外部サービス連携 → 運動管理アプリ」で発行したトークンを登録すると、記録するたびに評価（grade）と主要指標がハブのホーム画面に表示されます。</div>
      <div class="status-line">
        <span><span class="status-dot ${hub.connected ? (hub.last_error ? 'error' : 'ok') : 'off'}"></span>${hub.connected ? '連携中' : '未連携'}</span>
      </div>
      ${hub.connected ? `
        <div class="li-sub">接続先: ${escapeHtml(hub.hub_base_url)}</div>
        <div class="li-sub">最終同期: ${hub.last_synced_at ? escapeHtml(hub.last_synced_at) : 'まだ同期していません'}</div>
        ${hub.last_error ? `<div class="li-sub" style="color:#c0392b;">エラー: ${escapeHtml(hub.last_error)}</div>` : ''}
        <div style="height:10px;"></div>
        <button class="btn secondary" id="resync-btn">今すぐ同期</button>
        <div style="height:8px;"></div>
        <button class="btn danger" id="disconnect-btn">連携を解除</button>
      ` : `
        <div style="height:10px;"></div>
        <button class="btn" id="connect-btn">トークンを登録する</button>
      `}
    </div>
  `;

  document.getElementById('save-weight-btn').addEventListener('click', () => {
    const kg = Number(document.getElementById('body-weight-input').value);
    if (!(kg > 0)) return toast('体重を正しく入力してください');
    setBodyWeight(kg);
    toast('保存しました');
  });

  if (hub.connected) {
    document.getElementById('resync-btn').addEventListener('click', async () => {
      const result = await api('/hub/sync', { method: 'POST' });
      toast(result.ok ? '同期しました' : `同期に失敗しました: ${result.error || ''}`);
      renderSettings(view);
    });
    document.getElementById('disconnect-btn').addEventListener('click', async () => {
      if (!confirm('連携を解除しますか？')) return;
      await api('/hub/connection', { method: 'DELETE' });
      toast('連携を解除しました');
      renderSettings(view);
    });
  } else {
    document.getElementById('connect-btn').addEventListener('click', () => openHubConnectModal(() => renderSettings(view)));
  }
}

function openHubConnectModal(onSaved) {
  openModal(`
    <h2>生活管理アプリと連携</h2>
    <div class="hint">生活管理アプリの設定画面で発行したトークンを貼り付けてください。</div>
    <div class="field"><label>生活管理アプリのURL</label><input type="url" id="hub-url" value="http://localhost:3000" placeholder="http://localhost:3000"></div>
    <div class="field"><label>トークン</label><input type="text" id="hub-token" placeholder="発行されたトークンを貼り付け"></div>
    <button class="btn" id="save-hub">連携する</button>
  `);
  document.getElementById('save-hub').addEventListener('click', async () => {
    const hubUrl = document.getElementById('hub-url').value.trim();
    const token = document.getElementById('hub-token').value.trim();
    if (!hubUrl || !token) return toast('URLとトークンを入力してください');
    try {
      const result = await api('/hub/connection', { method: 'POST', body: JSON.stringify({ hub_base_url: hubUrl, token }) });
      closeModal();
      toast(result.sync?.ok ? '連携しました' : `連携情報を保存しましたが、同期に失敗しました: ${result.sync?.error || ''}`);
      onSaved();
    } catch (err) {
      toast(err.message);
    }
  });
}

// ============================================================
// 起動（ログイン画面はない。ハブ（APP-1）と同じ端末識別Cookieで自動的に
// 同じアカウントとして扱われる）
// ============================================================
async function boot() {
  fillIcons(document);
  state.user = await api('/device');
  setTab('today');
}

// ============================================================
// 初期化
// ============================================================
document.querySelectorAll('nav.tabbar button').forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

boot();
