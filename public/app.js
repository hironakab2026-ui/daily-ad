// ============================================================
// 生活管理アプリ（APP-1）フロントエンド（Web / Vanilla JS）
// ============================================================

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WEEKDAY_LABEL = { SU: '日', MO: '月', TU: '火', WE: '水', TH: '木', FR: '金', SA: '土' };
const TASK_COLORS = ['#4c56d6', '#0f9d69', '#dc4a5e', '#f2a93b', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'];
const CATEGORY_COLORS = ['#4c56d6', '#0f9d69', '#f2a93b', '#dc4a5e', '#8b5cf6', '#06b6d4', '#f97316', '#64748b', '#22c55e', '#eab308'];

const todayFixed = todayStr();

const state = {
  tab: 'today',
  homeMonth: todayFixed.slice(0, 7),
  summaryMonth: todayFixed.slice(0, 7),
  recordsMonth: todayFixed.slice(0, 7),
  txOpen: false,
  taskOpen: true,
  categories: [],
  user: null,
};

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtYen(n) {
  return `¥${Number(n).toLocaleString('ja-JP')}`;
}

function fmtDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  return `${m}月${d}日(${w})`;
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
  if (res.status === 401 && !path.startsWith('/auth/')) {
    state.user = null;
    showAuthScreen();
    throw new Error('ログインが必要です');
  }
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
  toast._t = setTimeout(() => el.classList.remove('show'), 2000);
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

async function ensureCategories() {
  if (!state.categories.length) {
    state.categories = await api('/categories?all=1');
  }
  return state.categories;
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

// ------------------------------------------------------------
// ルーティング / タブ
// ------------------------------------------------------------
const TAB_TITLES = { today: '今日', tasks: 'タスク', summary: 'サマリー', records: '記録', settings: '設定' };

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
    else if (state.tab === 'tasks') await renderTasks(view);
    else if (state.tab === 'summary') await renderSummary(view);
    else if (state.tab === 'records') await renderRecords(view);
    else if (state.tab === 'settings') await renderSettings(view);
    fillIcons(view);
  } catch (err) {
    view.innerHTML = `<div class="empty">エラー: ${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================
// A1-01 今日（ホーム）：カレンダー＋収支/ゲージ＋タスク＋収支明細
// ============================================================
async function renderToday(view) {
  const date = todayFixed;
  const [summary, txs, tasks, calCells, connected] = await Promise.all([
    api(`/summary/today?date=${date}`),
    api(`/transactions?date=${date}`),
    api(`/tasks/today?date=${date}`),
    api(`/calendar?month=${state.homeMonth}`),
    api(`/summary/connected?date=${date}`),
  ]);

  view.innerHTML = `
    <div class="home-top">
      <div class="card" id="mini-cal-card">${miniCalendarHtml(state.homeMonth, calCells)}</div>
      <div class="card today-panel">
        <div class="date-label">${escapeHtml(fmtDateLabel(date))}</div>
        <div class="stat-line"><span>収入</span><span class="stat-val income">${fmtYen(summary.income)}</span></div>
        <div class="stat-line"><span>支出</span><span class="stat-val expense">${fmtYen(summary.expense)}</span></div>
        <div class="stat-line net"><span>収支</span><span class="stat-val ${summary.net >= 0 ? 'positive' : 'negative'}">${fmtYen(summary.net)}</span></div>
        <div class="gauge-wrap">${gaugeHtml(summary.task_done, summary.task_planned)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>今日のタスク</h2>
        <button class="btn-labeled" id="add-task-btn"><span data-icon="plus"></span>タスク</button>
      </div>
      <div id="home-task-list">
        ${tasks.length ? tasks.map(taskRowHtml).join('') : '<div class="empty">この日の予定タスクはありません</div>'}
      </div>
    </div>

    ${connected.map(connectedServiceCardHtml).join('')}

    <div class="card">
      <div class="accordion-header ${state.txOpen ? 'open' : ''}" id="tx-accordion-header">
        <div class="left"><h2 style="margin:0;">収支明細（${txs.length}件）</h2></div>
        <span class="chev" data-icon="chevronDown" data-icon-size="16"></span>
      </div>
      <div class="accordion-body ${state.txOpen ? 'open' : ''}" id="tx-accordion-body">
        <div style="height:8px;"></div>
        ${renderTxList(txs)}
        <div style="height:10px;"></div>
        <button class="btn-labeled" id="add-tx-btn"><span data-icon="plus"></span>収支</button>
      </div>
    </div>
  `;

  // ミニカレンダー月送り
  document.getElementById('mini-cal-card').querySelectorAll('[data-month-shift]').forEach((btn) => {
    btn.addEventListener('click', () => { state.homeMonth = shiftMonth(state.homeMonth, Number(btn.dataset.monthShift)); renderToday(view); });
  });
  document.getElementById('mini-cal-card').querySelectorAll('[data-date]').forEach((el) => {
    el.addEventListener('click', () => openDayDetailModal(el.dataset.date));
  });

  // タスクのチェック／編集
  document.getElementById('home-task-list').querySelectorAll('[data-toggle-log]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api(`/tasks/logs/${el.dataset.toggleLog}/toggle`, { method: 'POST' });
      renderToday(view);
    });
  });
  document.getElementById('home-task-list').querySelectorAll('[data-open-def]').forEach((row) => {
    row.addEventListener('click', async () => {
      const defs = await api('/tasks/definitions?all=1');
      const def = defs.find((d) => d.id === Number(row.dataset.openDef));
      if (def) openTaskDefModal(def, () => renderToday(view));
    });
  });
  document.getElementById('add-task-btn').addEventListener('click', () => openTaskDefModal(null, () => renderToday(view)));
  document.getElementById('add-tx-btn').addEventListener('click', () => openTransactionModal(date, () => renderToday(view)));
  bindServiceLinks(view);

  // 収支明細アコーディオン
  document.getElementById('tx-accordion-header').addEventListener('click', () => {
    state.txOpen = !state.txOpen;
    document.getElementById('tx-accordion-header').classList.toggle('open', state.txOpen);
    document.getElementById('tx-accordion-body').classList.toggle('open', state.txOpen);
  });
  bindTxDelete(view, () => renderToday(view));
}

function miniCalendarHtml(month, cells) {
  const byDate = {};
  cells.forEach((c) => { byDate[c.target_date] = c; });
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = new Date(y, m - 1, 1).getDay();

  let cellsHtml = '';
  ['日', '月', '火', '水', '木', '金', '土'].forEach((w) => { cellsHtml += `<div class="mc-head">${w}</div>`; });
  for (let i = 0; i < startWeekday; i++) cellsHtml += '<div class="mc-cell empty"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const c = byDate[dateStr];
    const net = c && c.net !== null && c.net !== undefined ? Number(c.net) : null;
    const isToday = dateStr === todayFixed;
    cellsHtml += `
      <div class="mc-cell ${isToday ? 'today' : ''}" data-date="${dateStr}">
        ${day}
        ${net !== null ? `<span class="mc-dot ${net >= 0 ? 'positive' : 'negative'}"></span>` : ''}
      </div>`;
  }
  return `
    <div class="mini-cal-head">
      <button data-month-shift="-1">${icon('chevronLeft', 16)}</button>
      <div class="month-label">${monthLabel(month)}</div>
      <button data-month-shift="1">${icon('chevronRight', 16)}</button>
    </div>
    <div class="mini-cal-grid">${cellsHtml}</div>
  `;
}

function gaugeHtml(done, planned) {
  const pct = planned > 0 ? Math.round((done / planned) * 100) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return `
    <div class="gauge-label" style="width:84px;height:84px;">
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--border)" stroke-width="9"/>
        <circle cx="42" cy="42" r="${r}" fill="none" stroke="${planned > 0 ? 'var(--primary)' : 'var(--border)'}"
          stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
      </svg>
      <div class="gauge-center">
        <div class="pct">${planned > 0 ? pct + '%' : '-'}</div>
        <div class="frac">${done}/${planned}</div>
      </div>
    </div>
  `;
}

function taskRowHtml(t) {
  const time = t.remind_time ? t.remind_time.slice(0, 5) : '';
  const color = t.color || '#c6cad6';
  return `
    <div class="task-row">
      <div class="task-checkbox ${t.is_done ? 'done' : ''}" data-toggle-log="${t.id}">${t.is_done ? icon('check', 14) : ''}</div>
      <span class="task-dot" style="background:${color}"></span>
      <div class="task-row-info" data-open-def="${t.task_definition_id}">
        <div class="task-row-name ${t.is_done ? 'done' : ''}">${escapeHtml(t.name)}</div>
        <div class="task-row-meta">${time ? time + (t.memo ? ' ・ ' : '') : ''}${t.memo ? escapeHtml(t.memo) : ''}</div>
      </div>
    </div>
  `;
}

function humanizeKey(key) {
  const s = String(key).replace(/[_-]+/g, ' ').trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// 連携中の外部サービスの要約カード（grade・badge・metrics最大6件のみ。詳細は deep_link へ遷移）
function connectedServiceCardHtml(s) {
  const hasData = s.status && s.status !== 'none';
  const metricsEntries = s.metrics ? Object.entries(s.metrics).slice(0, 6) : [];
  return `
    <div class="card">
      <div class="card-header">
        <h2>${escapeHtml(s.display_name)}</h2>
        ${s.grade ? `<span class="btn-labeled" style="background:var(--primary-soft);">${escapeHtml(s.grade)}</span>` : ''}
      </div>
      ${s.badge ? `<div style="font-size:12.5px;color:var(--muted);margin-bottom:6px;">${escapeHtml(s.badge)}</div>` : ''}
      ${hasData && metricsEntries.length ? `
        <div class="stat-line-grid">
          ${metricsEntries.map(([k, v]) => `<div class="stat-line"><span>${escapeHtml(humanizeKey(k))}</span><span class="stat-val">${escapeHtml(String(v))}</span></div>`).join('')}
        </div>
      ` : `<div class="empty" style="padding:6px 0;">まだこの日の記録はありません</div>`}
      ${s.deep_link ? `<div style="height:8px;"></div><button class="btn secondary" data-open-link="${escapeHtml(s.deep_link)}">${escapeHtml(s.display_name)}を開く</button>` : ''}
    </div>
  `;
}

function bindServiceLinks(root) {
  root.querySelectorAll('[data-open-link]').forEach((btn) => {
    btn.addEventListener('click', () => window.open(btn.dataset.openLink, '_blank', 'noopener'));
  });
}

function renderTxList(txs) {
  if (!txs.length) return '<div class="empty">記録がありません</div>';
  return txs.map((t) => `
    <div class="tx-item" data-id="${t.id}">
      <span class="tx-cat">${escapeHtml(t.category)}</span>
      <span class="tx-memo">${escapeHtml(t.memo || '')}</span>
      <span class="tx-amount ${t.kind}">${t.kind === 'income' ? '+' : '-'}${fmtYen(t.amount)}</span>
      <button class="icon-btn" data-del-tx="${t.id}" data-icon="x" data-icon-size="16"></button>
    </div>
  `).join('');
}

function bindTxDelete(root, onDone) {
  root.querySelectorAll('[data-del-tx]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('この記録を削除しますか？')) return;
      await api(`/transactions/${btn.dataset.delTx}`, { method: 'DELETE' });
      toast('削除しました');
      onDone();
    });
  });
}

async function openDayDetailModal(date) {
  const [detail, connected] = await Promise.all([
    api(`/calendar/day/${date}`),
    api(`/summary/connected?date=${date}`),
  ]);
  openModal(`
    <h2>${escapeHtml(fmtDateLabel(date))}の詳細</h2>
    <h3 style="font-size:13px;color:var(--muted);">収支</h3>
    <div id="detail-tx">${renderTxList(detail.transactions)}</div>
    <h3 style="font-size:13px;color:var(--muted);margin-top:16px;">タスク</h3>
    <div>${detail.tasks.length ? detail.tasks.map((t) => `
      <div class="task-row">
        <div class="task-checkbox ${t.is_done ? 'done' : ''}">${t.is_done ? icon('check', 14) : ''}</div>
        <div class="task-row-info"><div class="task-row-name ${t.is_done ? 'done' : ''}">${escapeHtml(t.name)}</div></div>
      </div>`).join('') : '<div class="empty">予定タスクなし</div>'}</div>
    ${connected.length ? `<div style="height:16px;"></div>${connected.map(connectedServiceCardHtml).join('')}` : ''}
    <div style="height:12px;"></div>
    <button class="btn secondary" id="detail-add-tx">この日に収支を追加</button>
  `);
  bindTxDelete(document.getElementById('modal-root'), () => openDayDetailModal(date));
  bindServiceLinks(document.getElementById('modal-root'));
  document.getElementById('detail-add-tx').addEventListener('click', () => openTransactionModal(date, () => { closeModal(); if (state.tab === 'today') render(); }));
}

// ============================================================
// A1-02 収支入力（モーダル）
// ============================================================
async function openTransactionModal(defaultDate, onSaved) {
  await ensureCategories();
  let kind = 'expense';
  let amount = '';
  let categoryId = null;
  let memo = '';
  const date = defaultDate || todayFixed;

  function catsFor(k) {
    return state.categories.filter((c) => c.kind === k && c.is_active);
  }

  function draw() {
    const cats = catsFor(kind);
    openModal(`
      <h2>収支を追加</h2>
      <div class="segmented" id="kind-seg">
        <button data-kind="expense" class="${kind === 'expense' ? 'active' : ''}">支出</button>
        <button data-kind="income" class="${kind === 'income' ? 'active' : ''}">収入</button>
      </div>
      <div class="field">
        <label>日付</label>
        <input type="date" id="tx-date" value="${date}">
      </div>
      <div class="cat-grid" id="cat-grid">
        ${cats.map((c) => `<div class="cat-chip ${c.id === categoryId ? 'selected' : ''}" data-cat="${c.id}">${escapeHtml(c.name)}</div>`).join('') || '<div class="empty">カテゴリがありません（設定から追加）</div>'}
      </div>
      <div class="keypad-display" id="amount-display">${amount ? Number(amount).toLocaleString('ja-JP') : '0'}<span style="font-size:16px;"> 円</span></div>
      <div class="field">
        <input type="text" id="tx-memo" placeholder="メモ（任意）" value="${escapeHtml(memo)}">
      </div>
      <div class="keypad" id="keypad">
        ${['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'].map((k) => `<button data-key="${k}">${k}</button>`).join('')}
      </div>
      <div style="height:12px;"></div>
      <button class="btn" id="tx-save"><span data-icon="check" data-icon-size="16"></span>保存</button>
    `);

    document.querySelectorAll('#kind-seg button').forEach((b) => {
      b.addEventListener('click', () => { kind = b.dataset.kind; categoryId = null; draw(); });
    });
    document.querySelectorAll('#cat-grid [data-cat]').forEach((el) => {
      el.addEventListener('click', () => { categoryId = Number(el.dataset.cat); draw(); });
    });
    document.querySelectorAll('#keypad [data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        if (k === 'C') amount = '';
        else if (k === '⌫') amount = amount.slice(0, -1);
        else if (amount.length < 9) amount = (amount + k).replace(/^0+(?=\d)/, '');
        document.getElementById('amount-display').innerHTML = `${amount ? Number(amount).toLocaleString('ja-JP') : '0'}<span style="font-size:16px;"> 円</span>`;
      });
    });
    document.getElementById('tx-memo').addEventListener('input', (e) => { memo = e.target.value; });

    document.getElementById('tx-save').addEventListener('click', async () => {
      const entryDate = document.getElementById('tx-date').value;
      const amt = Number(amount || 0);
      if (!categoryId) return toast('カテゴリを選択してください');
      if (!amt) return toast('金額を入力してください');
      await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ entry_date: entryDate, kind, category_id: categoryId, amount: amt, memo }),
      });
      toast('保存しました');
      closeModal();
      if (onSaved) onSaved();
    });
  }

  draw();
}

// ============================================================
// A1-03/A1-04 タスク（一覧 → 詳細／編集 → 新規登録のみ）
// ============================================================
async function renderTasks(view) {
  const defs = await api('/tasks/definitions');
  view.innerHTML = `
    <div class="card">
      <div class="card-header"><h2>タスク一覧</h2></div>
      <div id="def-list">${defs.length ? defs.map(defRowHtml).join('') : '<div class="empty">タスクがありません</div>'}</div>
    </div>
    <button class="btn" id="new-task-btn"><span data-icon="plus" data-icon-size="16"></span>新しいタスクを追加</button>
  `;
  fillIcons(view);
  document.getElementById('new-task-btn').addEventListener('click', () => openTaskDefModal(null, () => renderTasks(view)));
  view.querySelectorAll('[data-open-def]').forEach((row) => {
    const def = defs.find((d) => d.id === Number(row.dataset.openDef));
    row.addEventListener('click', () => openTaskDefModal(def, () => renderTasks(view)));
  });
}

function freqLabel(d) {
  if (d.freq === 'daily') return '毎日';
  if (d.freq === 'once') return `単発（${d.start_date}）`;
  if (d.freq === 'monthly') return `毎月${d.bymonthday}日`;
  if (d.freq === 'weekly') return `毎週 ${(d.byweekday || '').split(',').map((w) => WEEKDAY_LABEL[w] || w).join('・')}`;
  return d.freq;
}

function defRowHtml(d) {
  const stopped = d.end_date && d.end_date < todayFixed;
  return `
    <div class="task-def-row" data-open-def="${d.id}">
      <span class="task-dot" style="background:${d.color || '#c6cad6'}"></span>
      <div class="task-row-info">
        <div class="task-row-name">${escapeHtml(d.name)}${stopped ? '（停止中）' : ''}</div>
        <div class="task-row-meta">${freqLabel(d)}${d.remind_time ? ' ・ ' + d.remind_time.slice(0, 5) : ''}</div>
      </div>
      <span class="icon-btn" data-icon="chevronRight" data-icon-size="16"></span>
    </div>
  `;
}

async function openTaskDefModal(def, onSaved) {
  const isEdit = !!def;
  const d = def || { name: '', task_type: 'routine', freq: 'daily', byweekday: '', bymonthday: '', start_date: todayFixed, end_date: '', remind_time: '', color: TASK_COLORS[0], memo: '' };
  let selectedColor = d.color || TASK_COLORS[0];
  let selectedWeekdays = new Set((d.byweekday || '').split(',').filter(Boolean));

  function draw() {
    openModal(`
      <h2>${isEdit ? 'タスクの詳細' : '新しいタスク'}</h2>
      <div class="field"><label>名前</label><input type="text" id="f-name" value="${escapeHtml(d.name)}"></div>
      <div class="field">
        <label>色</label>
        <div class="color-picker" id="f-color">
          ${TASK_COLORS.map((c) => `<div class="color-swatch ${c === selectedColor ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>種別</label>
        <select id="f-type">
          <option value="routine" ${d.task_type === 'routine' ? 'selected' : ''}>ルーティン</option>
          <option value="single" ${d.task_type === 'single' ? 'selected' : ''}>単発</option>
        </select>
      </div>
      <div class="field">
        <label>繰り返し</label>
        <select id="f-freq">
          <option value="daily" ${d.freq === 'daily' ? 'selected' : ''}>毎日</option>
          <option value="weekly" ${d.freq === 'weekly' ? 'selected' : ''}>毎週</option>
          <option value="monthly" ${d.freq === 'monthly' ? 'selected' : ''}>毎月</option>
          <option value="once" ${d.freq === 'once' ? 'selected' : ''}>単発（1回のみ）</option>
        </select>
      </div>
      <div class="field" id="f-weekday-wrap" style="display:${d.freq === 'weekly' ? 'block' : 'none'}">
        <label>曜日</label>
        <div class="weekday-picker" id="f-weekday">
          ${WEEKDAYS.map((w) => `<button type="button" data-w="${w}" class="${selectedWeekdays.has(w) ? 'selected' : ''}">${WEEKDAY_LABEL[w]}</button>`).join('')}
        </div>
      </div>
      <div class="field" id="f-monthday-wrap" style="display:${d.freq === 'monthly' ? 'block' : 'none'}">
        <label>毎月の日付</label>
        <input type="number" id="f-monthday" min="1" max="31" value="${d.bymonthday || ''}">
      </div>
      <div class="field"><label>開始日</label><input type="date" id="f-start" value="${d.start_date}"></div>
      <div class="field"><label>終了日（任意・無期限ならあける）</label><input type="date" id="f-end" value="${d.end_date || ''}"></div>
      <div class="field"><label>リマインド時刻（任意）</label><input type="time" id="f-remind" value="${d.remind_time ? d.remind_time.slice(0, 5) : ''}"></div>
      <div class="field"><label>メモ（任意）</label><input type="text" id="f-memo" value="${escapeHtml(d.memo || '')}"></div>
      <button class="btn" id="def-save"><span data-icon="check" data-icon-size="16"></span>保存</button>
      ${isEdit && !d.end_date ? `<div style="height:8px;"></div><button class="btn secondary" id="def-stop"><span data-icon="stop" data-icon-size="16"></span>このタスクをやめる</button>` : ''}
    `);

    document.getElementById('f-freq').addEventListener('change', (e) => {
      d.freq = e.target.value;
      document.getElementById('f-weekday-wrap').style.display = d.freq === 'weekly' ? 'block' : 'none';
      document.getElementById('f-monthday-wrap').style.display = d.freq === 'monthly' ? 'block' : 'none';
    });
    document.querySelectorAll('#f-color [data-color]').forEach((sw) => {
      sw.addEventListener('click', () => { selectedColor = sw.dataset.color; draw(); });
    });
    document.querySelectorAll('#f-weekday [data-w]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = btn.dataset.w;
        if (selectedWeekdays.has(w)) selectedWeekdays.delete(w); else selectedWeekdays.add(w);
        btn.classList.toggle('selected');
      });
    });

    document.getElementById('def-save').addEventListener('click', async () => {
      const payload = {
        name: document.getElementById('f-name').value,
        task_type: document.getElementById('f-type').value,
        freq: document.getElementById('f-freq').value,
        byweekday: selectedWeekdays.size ? Array.from(selectedWeekdays).join(',') : '',
        bymonthday: document.getElementById('f-monthday').value || '',
        start_date: document.getElementById('f-start').value,
        end_date: document.getElementById('f-end').value,
        remind_time: document.getElementById('f-remind').value,
        color: selectedColor,
        memo: document.getElementById('f-memo').value,
      };
      if (!payload.name.trim()) return toast('名前を入力してください');
      try {
        if (isEdit) {
          await api(`/tasks/definitions/${def.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          await api('/tasks/definitions', { method: 'POST', body: JSON.stringify(payload) });
        }
        toast('保存しました');
        closeModal();
        onSaved();
      } catch (err) {
        toast(err.message);
      }
    });

    const stopBtn = document.getElementById('def-stop');
    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        if (!confirm('このタスクをやめますか？（過去の記録は残ります）')) return;
        await api(`/tasks/definitions/${def.id}/stop`, { method: 'POST', body: JSON.stringify({ end_date: todayFixed }) });
        toast('タスクをやめました');
        closeModal();
        onSaved();
      });
    }
  }
  draw();
}

// ============================================================
// A1-07 サマリー（月次・カテゴリ円グラフ・月比較）
// ============================================================
async function renderSummary(view) {
  view.innerHTML = `
    <div class="month-nav">
      <button id="sum-prev">${icon('chevronLeft', 20)}</button>
      <div class="month-label">${monthLabel(state.summaryMonth)}</div>
      <button id="sum-next">${icon('chevronRight', 20)}</button>
    </div>
    <div id="summary-body"></div>
  `;
  document.getElementById('sum-prev').addEventListener('click', () => { state.summaryMonth = shiftMonth(state.summaryMonth, -1); renderSummary(view); });
  document.getElementById('sum-next').addEventListener('click', () => { state.summaryMonth = shiftMonth(state.summaryMonth, 1); renderSummary(view); });

  const [summary, trend] = await Promise.all([
    api(`/summary/month?month=${state.summaryMonth}`),
    api('/summary/trend?months=6'),
  ]);

  const body = document.getElementById('summary-body');
  body.innerHTML = `
    <div class="card">
      <h2>月の収支</h2>
      <div class="stat-line"><span>収入</span><span class="stat-val income">${fmtYen(summary.income)}</span></div>
      <div class="stat-line"><span>支出</span><span class="stat-val expense">${fmtYen(summary.expense)}</span></div>
      <div class="stat-line net"><span>収支</span><span class="stat-val ${summary.net >= 0 ? 'positive' : 'negative'}">${fmtYen(summary.net)}</span></div>
    </div>
    <div class="card">
      <h2>カテゴリ別支出</h2>
      ${pieChartHtml(summary.by_category)}
    </div>
    <div class="card">
      <h2>今月のタスク完遂率</h2>
      ${summary.task.avg_rate !== null ? `
        <div style="display:flex;align-items:center;gap:14px;">
          ${gaugeHtml(summary.task.total_done, summary.task.total_planned)}
          <div style="font-size:12px;color:var(--muted);">
            予定のあった日数 ${summary.task.active_days}日<br>
            平均完遂率 ${summary.task.avg_rate}%
          </div>
        </div>` : '<div class="empty">予定タスクがありません</div>'}
    </div>
    <div class="card">
      <h2>収支の推移（直近6か月）</h2>
      ${trendLineChart(trend.map((t) => ({ label: t.month.slice(5) + '月', value: t.net })), { color: 'var(--primary)', zeroLine: true, formatValue: (v) => fmtYen(v) })}
    </div>
    <div class="card">
      <h2>タスク達成率の推移（直近6か月）</h2>
      ${trendLineChart(trend.map((t) => ({ label: t.month.slice(5) + '月', value: t.task_rate })), { color: 'var(--income)', min: 0, max: 100, formatValue: (v) => (v === null ? '-' : v + '%') })}
    </div>
  `;
}

function pieChartHtml(byCategory) {
  if (!byCategory.length) return '<div class="empty">支出記録がありません</div>';
  let acc = 0;
  const stops = byCategory.map((c, i) => {
    const start = acc;
    acc += c.pct;
    return `${CATEGORY_COLORS[i % CATEGORY_COLORS.length]} ${start}% ${acc}%`;
  });
  const gradient = `conic-gradient(${stops.join(', ')})`;
  return `
    <div class="pie-wrap">
      <div class="pie-chart" style="background:${gradient}"></div>
      <div class="pie-legend">
        ${byCategory.map((c, i) => `
          <div class="pie-legend-row">
            <span class="pie-legend-dot" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></span>
            <span class="pie-legend-name">${escapeHtml(c.category)}</span>
            <span class="pie-legend-val">${fmtYen(c.total)}（${c.pct}%）</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function trendLineChart(points, opts) {
  const w = 300, h = 96, padX = 10, padY = 16;
  const values = points.map((p) => p.value).filter((v) => v !== null && v !== undefined);
  if (!values.length) return '<div class="empty">データがありません</div>';
  const min = opts.min !== undefined ? opts.min : Math.min(0, ...values);
  const max = opts.max !== undefined ? opts.max : Math.max(0, ...values);
  const range = max - min || 1;
  const stepX = (w - padX * 2) / (points.length - 1 || 1);
  const xOf = (i) => padX + stepX * i;
  const yOf = (v) => h - padY - ((v - min) / range) * (h - padY * 2);

  const coords = points.map((p, i) => (p.value === null || p.value === undefined) ? null : [xOf(i), yOf(p.value)]);
  const pathParts = [];
  coords.forEach((c, i) => { if (c) pathParts.push(`${pathParts.length && coords[i - 1] ? 'L' : 'M'}${c[0]},${c[1]}`); });

  const zeroY = opts.zeroLine ? yOf(0) : null;

  return `
    <svg class="trend-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      ${zeroY !== null ? `<line class="zero-line" x1="${padX}" y1="${zeroY}" x2="${w - padX}" y2="${zeroY}"/>` : ''}
      <path class="line" d="${pathParts.join(' ')}" stroke="${opts.color}"/>
      ${coords.map((c) => c ? `<circle class="dot" cx="${c[0]}" cy="${c[1]}" r="2.6" fill="${opts.color}"/>` : '').join('')}
      ${points.map((p, i) => `<text class="axis-label" x="${xOf(i)}" y="${h - 3}" text-anchor="middle">${p.label}</text>`).join('')}
    </svg>
  `;
}

// ============================================================
// A1-08 記録一覧・一括編集
// ============================================================
async function renderRecords(view) {
  view.innerHTML = `
    <div class="month-nav">
      <button id="rec-prev">${icon('chevronLeft', 20)}</button>
      <div class="month-label">${monthLabel(state.recordsMonth)}</div>
      <button id="rec-next">${icon('chevronRight', 20)}</button>
    </div>
    <div id="rec-body"></div>
  `;
  document.getElementById('rec-prev').addEventListener('click', () => { state.recordsMonth = shiftMonth(state.recordsMonth, -1); renderRecords(view); });
  document.getElementById('rec-next').addEventListener('click', () => { state.recordsMonth = shiftMonth(state.recordsMonth, 1); renderRecords(view); });

  const cells = await api(`/calendar?month=${state.recordsMonth}`);
  const dates = cells.map((c) => c.target_date);
  const results = await Promise.all(dates.map((d) => api(`/transactions?date=${d}`).then((rows) => rows.map((r) => ({ ...r, entry_date: d })))));
  const all = results.flat().sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));

  const body = document.getElementById('rec-body');
  if (!all.length) {
    body.innerHTML = '<div class="empty">この月の記録はありません</div>';
    return;
  }
  body.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>記録一覧（${all.length}件）</h2>
        <button class="btn-labeled" id="bulk-del"><span data-icon="trash" data-icon-size="14"></span>選択削除</button>
      </div>
      ${all.map((t) => `
        <div class="tx-item" data-id="${t.id}">
          <input type="checkbox" class="bulk-check" data-id="${t.id}">
          <span style="font-size:11px;color:var(--muted);width:40px;flex-shrink:0;">${t.entry_date.slice(5)}</span>
          <span class="tx-cat">${escapeHtml(t.category)}</span>
          <span class="tx-memo">${escapeHtml(t.memo || '')}</span>
          <span class="tx-amount ${t.kind}">${t.kind === 'income' ? '+' : '-'}${fmtYen(t.amount)}</span>
        </div>
      `).join('')}
    </div>
  `;
  fillIcons(body);
  document.getElementById('bulk-del').addEventListener('click', async () => {
    const ids = Array.from(document.querySelectorAll('.bulk-check:checked')).map((c) => c.dataset.id);
    if (!ids.length) return toast('削除する項目を選択してください');
    if (!confirm(`${ids.length}件を削除しますか？`)) return;
    await Promise.all(ids.map((id) => api(`/transactions/${id}`, { method: 'DELETE' })));
    toast('削除しました');
    renderRecords(view);
  });
}

// ============================================================
// A1-09 設定・カテゴリ管理
// ============================================================
async function renderSettings(view) {
  state.categories = await api('/categories?all=1');
  const defs = await api('/tasks/definitions?all=1');
  const connections = await api('/connections');
  const expense = state.categories.filter((c) => c.kind === 'expense');
  const income = state.categories.filter((c) => c.kind === 'income');

  view.innerHTML = `
    <div class="card">
      <h2>アカウント</h2>
      <div style="font-size:14px;margin-bottom:10px;">${escapeHtml(state.user.display_name)}（${escapeHtml(state.user.email)}）</div>
      <button class="btn secondary" id="logout-btn">ログアウト</button>
    </div>
    <div class="card">
      <h2>外部サービス連携</h2>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">連携すると、要約（評価・指標）がホーム画面などに表示されます。詳細を見るには連携先アプリを開きます。</div>
      <ul class="settings-list" id="connections-list">
        ${connections.map(connectionRowHtml).join('')}
      </ul>
    </div>
    <div class="card">
      <h2>支出カテゴリ</h2>
      <ul class="settings-list" id="cat-expense">${expense.map(catRowHtml).join('')}</ul>
      <div style="height:8px;"></div>
      <button class="btn secondary" data-add-cat="expense">＋ 支出カテゴリを追加</button>
    </div>
    <div class="card">
      <h2>収入カテゴリ</h2>
      <ul class="settings-list" id="cat-income">${income.map(catRowHtml).join('')}</ul>
      <div style="height:8px;"></div>
      <button class="btn secondary" data-add-cat="income">＋ 収入カテゴリを追加</button>
    </div>
    <div class="card danger-zone">
      <h2>タスクの完全削除（元に戻せません）</h2>
      <ul class="settings-list">
        ${defs.map((d) => `
          <li>
            <span>${escapeHtml(d.name)}${d.end_date && d.end_date < todayFixed ? '（停止中）' : ''}</span>
            <button class="icon-btn" data-hard-del="${d.id}" data-name="${escapeHtml(d.name)}" data-icon="trash" data-icon-size="16"></button>
          </li>
        `).join('') || '<li class="empty">タスクがありません</li>'}
      </ul>
    </div>
  `;
  fillIcons(view);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    state.user = null;
    showAuthScreen();
  });
  view.querySelectorAll('[data-connect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { token } = await api(`/connections/${btn.dataset.connect}/connect`, { method: 'POST' });
      openTokenModal(token, () => renderSettings(view));
    });
  });
  view.querySelectorAll('[data-disconnect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`「${btn.dataset.name}」との連携を解除しますか？`)) return;
      await api(`/connections/${btn.dataset.disconnect}/disconnect`, { method: 'POST' });
      toast('連携を解除しました');
      renderSettings(view);
    });
  });
  view.querySelectorAll('[data-toggle-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cat = state.categories.find((c) => c.id === Number(btn.dataset.toggleCat));
      await api(`/categories/${cat.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: cat.is_active ? 0 : 1 }) });
      renderSettings(view);
    });
  });
  view.querySelectorAll('[data-add-cat]').forEach((btn) => {
    btn.addEventListener('click', () => openCategoryModal(btn.dataset.addCat, () => renderSettings(view)));
  });
  view.querySelectorAll('[data-hard-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = confirm(`「${btn.dataset.name}」を完全に削除します。過去の記録も含めて表示されなくなります。本当によろしいですか？`);
      if (!ok) return;
      await api(`/tasks/definitions/${btn.dataset.hardDel}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
      toast('削除しました');
      renderSettings(view);
    });
  });
}

function connectionRowHtml(s) {
  return `
    <li>
      <span>${escapeHtml(s.display_name)}${s.connected ? '（連携済み）' : ''}</span>
      ${s.connected
        ? `<button class="link-row" data-disconnect="${s.content_key}" data-name="${escapeHtml(s.display_name)}" style="background:none;border:none;font-size:13px;">連携を解除</button>`
        : `<button class="btn-labeled" data-connect="${s.content_key}"><span data-icon="plus" data-icon-size="14"></span>連携する</button>`}
    </li>
  `;
}

function openTokenModal(token, onClose) {
  openModal(`
    <h2>連携トークンを発行しました</h2>
    <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">このトークンは今だけ表示されます。連携先アプリの設定画面に貼り付けてください。もう一度表示することはできません（再連携すると新しいトークンが発行されます）。</div>
    <div class="field">
      <input type="text" id="token-value" value="${escapeHtml(token)}" readonly>
    </div>
    <button class="btn secondary" id="token-copy">コピーする</button>
    <div style="height:8px;"></div>
    <button class="btn" id="token-done">閉じる</button>
  `);
  document.getElementById('token-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast('コピーしました');
    } catch (e) {
      document.getElementById('token-value').select();
      toast('選択状態にしました（手動でコピーしてください）');
    }
  });
  document.getElementById('token-done').addEventListener('click', () => { closeModal(); onClose(); });
}

function catRowHtml(c) {
  return `
    <li>
      <span style="${c.is_active ? '' : 'color:var(--muted);text-decoration:line-through;'}">${escapeHtml(c.name)}</span>
      <button class="link-row" data-toggle-cat="${c.id}" style="background:none;border:none;font-size:13px;">${c.is_active ? '非表示にする' : '再表示する'}</button>
    </li>
  `;
}

function openCategoryModal(kind, onSaved) {
  openModal(`
    <h2>${kind === 'expense' ? '支出' : '収入'}カテゴリを追加</h2>
    <div class="field"><label>名前</label><input type="text" id="new-cat-name"></div>
    <button class="btn" id="save-cat">追加</button>
  `);
  document.getElementById('save-cat').addEventListener('click', async () => {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) return toast('名前を入力してください');
    try {
      await api('/categories', { method: 'POST', body: JSON.stringify({ kind, name }) });
      toast('追加しました');
      closeModal();
      onSaved();
    } catch (err) {
      toast(err.message);
    }
  });
}

// ============================================================
// 認証（ログイン／新規登録）
// ============================================================
function showAuthScreen() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  renderAuthScreen('login');
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

function renderAuthScreen(mode, errorMsg) {
  const root = document.getElementById('auth-screen');
  const isLogin = mode === 'login';
  root.innerHTML = `
    <div class="auth-card">
      <h1>生活管理アプリ</h1>
      <div class="subtitle">${isLogin ? 'ログイン' : '新規登録'}</div>
      ${errorMsg ? `<div class="auth-error">${escapeHtml(errorMsg)}</div>` : ''}
      <form id="auth-form">
        ${!isLogin ? `<div class="field"><label>お名前</label><input type="text" id="auth-name" required></div>` : ''}
        <div class="field"><label>メールアドレス</label><input type="email" id="auth-email" required></div>
        <div class="field"><label>パスワード（8文字以上）</label><input type="password" id="auth-password" minlength="8" required></div>
        <button type="submit" class="btn">${isLogin ? 'ログイン' : '登録する'}</button>
      </form>
      <div class="auth-switch">
        ${isLogin ? 'アカウントをお持ちでない方は <a id="auth-switch-link">新規登録</a>' : 'すでにアカウントをお持ちの方は <a id="auth-switch-link">ログイン</a>'}
      </div>
    </div>
  `;
  document.getElementById('auth-switch-link').addEventListener('click', () => renderAuthScreen(isLogin ? 'register' : 'login'));
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    try {
      const user = isLogin
        ? await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
        : await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, display_name: document.getElementById('auth-name').value.trim() }) });
      state.user = user;
      state.categories = [];
      showApp();
      setTab('today');
    } catch (err) {
      renderAuthScreen(mode, err.message);
    }
  });
}

async function boot() {
  fillIcons(document);
  try {
    state.user = await api('/auth/me');
    showApp();
    setTab('today');
  } catch (err) {
    showAuthScreen();
  }
}

// ============================================================
// 初期化
// ============================================================
document.querySelectorAll('nav.tabbar button').forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

boot();
