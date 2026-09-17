// ============================================================
// 生活管理アプリ（APP-1）フロントエンド（Web / Vanilla JS）
// ============================================================

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WEEKDAY_LABEL = { SU: '日', MO: '月', TU: '火', WE: '水', TH: '木', FR: '金', SA: '土' };

const state = {
  tab: 'today',
  todayDate: todayStr(),
  taskSubTab: 'today', // 'today' | 'defs'
  calMonth: todayStr().slice(0, 7),
  calView: 'calendar', // 'calendar' | 'monthly'
  recordsMonth: todayStr().slice(0, 7),
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
}

async function ensureCategories() {
  if (!state.categories.length) {
    state.categories = await api('/categories?all=1');
  }
  return state.categories;
}

// ------------------------------------------------------------
// ルーティング / タブ
// ------------------------------------------------------------
const TAB_TITLES = { today: '今日', tasks: 'タスク', calendar: 'カレンダー', records: '記録', settings: '設定' };

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('nav.tabbar button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.getElementById('topbar-title').textContent = TAB_TITLES[tab];
  document.getElementById('fab-add').style.display = tab === 'today' ? 'block' : 'none';
  render();
}

async function render() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="empty">読み込み中…</div>';
  try {
    if (state.tab === 'today') return renderToday(view);
    if (state.tab === 'tasks') return renderTasks(view);
    if (state.tab === 'calendar') return renderCalendar(view);
    if (state.tab === 'records') return renderRecords(view);
    if (state.tab === 'settings') return renderSettings(view);
  } catch (err) {
    view.innerHTML = `<div class="empty">エラー: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
// A1-01 当日サマリー
// ============================================================
async function renderToday(view) {
  const date = state.todayDate;
  const [summary, txs] = await Promise.all([
    api(`/summary/today?date=${date}`),
    api(`/transactions?date=${date}`),
  ]);

  const netClass = summary.net >= 0 ? 'positive' : 'negative';
  const rate = summary.task_rate;
  const rateLabel = rate === null ? '予定なし' : `${rate}%`;
  const ratePct = rate === null ? 0 : rate;

  view.innerHTML = `
    <div class="card">
      <div class="field" style="margin-bottom:10px;">
        <input type="date" id="today-date" value="${date}">
      </div>
      <h2>${escapeHtml(fmtDateLabel(date))}の収支</h2>
      <div class="balance-row">
        <div class="balance-item"><div class="label">収入</div><div class="value income">${fmtYen(summary.income)}</div></div>
        <div class="balance-item"><div class="label">支出</div><div class="value expense">${fmtYen(summary.expense)}</div></div>
        <div class="balance-item"><div class="label">収支</div><div class="value net ${netClass}">${fmtYen(summary.net)}</div></div>
      </div>
    </div>
    <div class="card">
      <h2>今日のタスク完遂率</h2>
      <div class="progress-wrap">
        <div class="progress-bar"><div style="width:${ratePct}%"></div></div>
        <div>${rateLabel}</div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px;">${summary.task_done}/${summary.task_planned} 件完了</div>
    </div>
    <div class="card">
      <h2>今日の記録</h2>
      <div id="today-tx-list">${renderTxList(txs)}</div>
    </div>
  `;

  document.getElementById('today-date').addEventListener('change', (e) => {
    state.todayDate = e.target.value;
    render();
  });
  bindTxDelete(view, () => render());
}

function renderTxList(txs) {
  if (!txs.length) return '<div class="empty">記録がありません</div>';
  return txs.map((t) => `
    <div class="tx-item" data-id="${t.id}">
      <span class="tx-cat">${escapeHtml(t.category)}</span>
      <span class="tx-memo">${escapeHtml(t.memo || '')}</span>
      <span class="tx-amount ${t.kind}">${t.kind === 'income' ? '+' : '-'}${fmtYen(t.amount)}</span>
      <button class="tx-del" data-del-tx="${t.id}">✕</button>
    </div>
  `).join('');
}

function bindTxDelete(root, onDone) {
  root.querySelectorAll('[data-del-tx]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('この記録を削除しますか？')) return;
      await api(`/transactions/${btn.dataset.delTx}`, { method: 'DELETE' });
      toast('削除しました');
      onDone();
    });
  });
}

// ============================================================
// A1-02 収支入力（モーダル）
// ============================================================
async function openTransactionModal(defaultDate) {
  await ensureCategories();
  let kind = 'expense';
  let amount = '';
  let categoryId = null;
  let memo = '';
  const date = defaultDate || state.todayDate;

  function catsFor(k) {
    return state.categories.filter((c) => c.kind === k && c.is_active);
  }

  function draw() {
    const cats = catsFor(kind);
    openModal(`
      <h2>収支入力</h2>
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
      <div class="keypad-display" id="amount-display">${amount ? Number(amount).toLocaleString('ja-JP') : '0'}<span style="font-size:18px;">円</span></div>
      <div class="field">
        <input type="text" id="tx-memo" placeholder="メモ（任意）" value="${escapeHtml(memo)}">
      </div>
      <div class="keypad" id="keypad">
        ${['7','8','9','4','5','6','1','2','3','C','0','⌫'].map((k) => `<button data-key="${k}">${k}</button>`).join('')}
      </div>
      <div style="height:12px;"></div>
      <button class="btn" id="tx-save">保存</button>
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
        document.getElementById('amount-display').innerHTML = `${amount ? Number(amount).toLocaleString('ja-JP') : '0'}<span style="font-size:18px;">円</span>`;
      });
    });
    document.getElementById('tx-memo').addEventListener('input', (e) => { memo = e.target.value; });
    document.getElementById('tx-date').addEventListener('change', (e) => { /* date read on save */ });

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
      state.todayDate = entryDate;
      if (state.tab === 'today') render();
    });
  }

  draw();
}

// ============================================================
// A1-03 / A1-04 タスク
// ============================================================
async function renderTasks(view) {
  view.innerHTML = `
    <div class="segmented" id="task-seg">
      <button data-sub="today" class="${state.taskSubTab === 'today' ? 'active' : ''}">今日のタスク</button>
      <button data-sub="defs" class="${state.taskSubTab === 'defs' ? 'active' : ''}">タスク管理</button>
    </div>
    <div id="task-body"></div>
  `;
  document.querySelectorAll('#task-seg button').forEach((b) => {
    b.addEventListener('click', () => { state.taskSubTab = b.dataset.sub; renderTasks(view); });
  });
  const body = document.getElementById('task-body');
  if (state.taskSubTab === 'today') await renderTodayTasks(body);
  else await renderTaskDefs(body);
}

async function renderTodayTasks(body) {
  const date = state.todayDate;
  const tasks = await api(`/tasks/today?date=${date}`);
  body.innerHTML = `
    <div class="card">
      <div class="field" style="margin-bottom:10px;">
        <input type="date" id="task-date" value="${date}">
      </div>
      <h2>${escapeHtml(fmtDateLabel(date))}のタスク</h2>
      <div id="task-list">
        ${tasks.length ? tasks.map(taskItemHtml).join('') : '<div class="empty">この日の予定タスクはありません</div>'}
      </div>
    </div>
  `;
  document.getElementById('task-date').addEventListener('change', (e) => {
    state.todayDate = e.target.value;
    renderTasks(document.getElementById('view'));
  });
  body.querySelectorAll('[data-toggle-log]').forEach((el) => {
    el.addEventListener('click', async () => {
      await api(`/tasks/logs/${el.dataset.toggleLog}/toggle`, { method: 'POST' });
      renderTodayTasks(body);
    });
  });
}

function taskItemHtml(t) {
  const time = t.remind_time ? t.remind_time.slice(0, 5) : '';
  return `
    <div class="task-item">
      <div class="task-check ${t.is_done ? 'done' : ''}" data-toggle-log="${t.id}">${t.is_done ? '✓' : ''}</div>
      <div class="task-info">
        <div class="task-name ${t.is_done ? 'done' : ''}">${escapeHtml(t.name)}</div>
        <div class="task-meta">${time ? time + ' ' : ''}${t.memo ? escapeHtml(t.memo) : ''}</div>
      </div>
    </div>
  `;
}

async function renderTaskDefs(body) {
  const defs = await api('/tasks/definitions');
  body.innerHTML = `
    <div class="card">
      <h2>タスク定義一覧</h2>
      <div id="def-list">${defs.length ? defs.map(defItemHtml).join('') : '<div class="empty">タスクがありません</div>'}</div>
    </div>
    <button class="btn" id="new-task-btn">＋ 新しいタスクを追加</button>
  `;
  document.getElementById('new-task-btn').addEventListener('click', () => openTaskDefModal(null, () => renderTaskDefs(body)));
  body.querySelectorAll('[data-edit-def]').forEach((btn) => {
    const def = defs.find((d) => d.id === Number(btn.dataset.editDef));
    btn.addEventListener('click', () => openTaskDefModal(def, () => renderTaskDefs(body)));
  });
  body.querySelectorAll('[data-stop-def]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('このタスクをやめますか？（過去の記録は残ります）')) return;
      await api(`/tasks/definitions/${btn.dataset.stopDef}/stop`, {
        method: 'POST',
        body: JSON.stringify({ end_date: todayStr() }),
      });
      toast('タスクをやめました');
      renderTaskDefs(body);
    });
  });
}

function freqLabel(d) {
  if (d.freq === 'daily') return '毎日';
  if (d.freq === 'once') return `単発（${d.start_date}）`;
  if (d.freq === 'monthly') return `毎月${d.bymonthday}日`;
  if (d.freq === 'weekly') {
    return `毎週 ${(d.byweekday || '').split(',').map((w) => WEEKDAY_LABEL[w] || w).join('・')}`;
  }
  return d.freq;
}

function defItemHtml(d) {
  const stopped = d.end_date && d.end_date < todayStr();
  return `
    <div class="task-item">
      <div class="task-info">
        <div class="task-name">${escapeHtml(d.name)}${stopped ? '（停止中）' : ''}</div>
        <div class="task-meta">${freqLabel(d)}${d.remind_time ? ' ・ ' + d.remind_time.slice(0, 5) : ''}</div>
      </div>
      <button class="tx-del" data-edit-def="${d.id}" title="編集" style="font-size:14px;">編集</button>
      ${!d.end_date ? `<button class="tx-del" data-stop-def="${d.id}" title="やめる">やめる</button>` : ''}
    </div>
  `;
}

async function openTaskDefModal(def, onSaved) {
  const isEdit = !!def;
  const d = def || { name: '', task_type: 'routine', freq: 'daily', byweekday: '', bymonthday: '', start_date: todayStr(), end_date: '', remind_time: '', memo: '' };

  function draw() {
    openModal(`
      <h2>${isEdit ? 'タスクを編集' : '新しいタスク'}</h2>
      <div class="field"><label>名前</label><input type="text" id="f-name" value="${escapeHtml(d.name)}"></div>
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
          ${WEEKDAYS.map((w) => `<button type="button" data-w="${w}" class="${(d.byweekday || '').split(',').includes(w) ? 'selected' : ''}">${WEEKDAY_LABEL[w]}</button>`).join('')}
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
      <button class="btn" id="def-save">保存</button>
    `);

    document.getElementById('f-freq').addEventListener('change', (e) => {
      d.freq = e.target.value;
      document.getElementById('f-weekday-wrap').style.display = d.freq === 'weekly' ? 'block' : 'none';
      document.getElementById('f-monthday-wrap').style.display = d.freq === 'monthly' ? 'block' : 'none';
    });
    let selectedWeekdays = new Set((d.byweekday || '').split(',').filter(Boolean));
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
  }
  draw();
}

// ============================================================
// A1-05 カレンダー / A1-07 月次サマリー
// ============================================================
async function renderCalendar(view) {
  view.innerHTML = `
    <div class="segmented" id="cal-seg">
      <button data-view="calendar" class="${state.calView === 'calendar' ? 'active' : ''}">カレンダー</button>
      <button data-view="monthly" class="${state.calView === 'monthly' ? 'active' : ''}">月次サマリー</button>
    </div>
    <div class="month-nav">
      <button id="prev-month">‹</button>
      <div class="month-label" id="month-label"></div>
      <button id="next-month">›</button>
    </div>
    <div id="cal-body"></div>
  `;
  document.querySelectorAll('#cal-seg button').forEach((b) => {
    b.addEventListener('click', () => { state.calView = b.dataset.view; renderCalendar(view); });
  });
  document.getElementById('prev-month').addEventListener('click', () => { shiftMonth(-1); renderCalendar(view); });
  document.getElementById('next-month').addEventListener('click', () => { shiftMonth(1); renderCalendar(view); });
  document.getElementById('month-label').textContent = monthLabel(state.calMonth);

  const body = document.getElementById('cal-body');
  if (state.calView === 'calendar') await renderCalendarGrid(body);
  else await renderMonthlySummary(body);
}

function shiftMonth(delta) {
  const [y, m] = state.calMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

async function renderCalendarGrid(body) {
  const cells = await api(`/calendar?month=${state.calMonth}`);
  const byDate = {};
  cells.forEach((c) => { byDate[c.target_date] = c; });

  const [y, m] = state.calMonth.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = firstDay.getDay();
  const today = todayStr();

  let html = '<div class="card"><div class="cal-grid">';
  ['日', '月', '火', '水', '木', '金', '土'].forEach((w) => { html += `<div class="cal-head">${w}</div>`; });
  for (let i = 0; i < startWeekday; i++) html += '<div class="cal-cell empty"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const c = byDate[dateStr];
    const net = c && c.net !== null ? Number(c.net) : null;
    const rate = c && c.rate !== null && c.rate !== undefined ? Number(c.rate) : null;
    html += `
      <div class="cal-cell ${dateStr === today ? 'today' : ''}" data-date="${dateStr}">
        <div class="date-num">${day}</div>
        ${net !== null ? `<div class="cal-net ${net >= 0 ? 'positive' : 'negative'}">${net >= 0 ? '+' : ''}${Math.round(net / 1000)}k</div>` : ''}
        ${rate !== null ? `<div class="cal-rate">${rate}%</div>` : ''}
      </div>`;
  }
  html += '</div></div>';
  body.innerHTML = html;

  body.querySelectorAll('[data-date]').forEach((el) => {
    el.addEventListener('click', () => openDayDetailModal(el.dataset.date));
  });
}

async function openDayDetailModal(date) {
  const detail = await api(`/calendar/day/${date}`);
  openModal(`
    <h2>${escapeHtml(fmtDateLabel(date))}の詳細</h2>
    <h3 style="font-size:13px;color:var(--muted);">収支</h3>
    <div id="detail-tx">${renderTxList(detail.transactions)}</div>
    <h3 style="font-size:13px;color:var(--muted);margin-top:16px;">タスク</h3>
    <div>${detail.tasks.length ? detail.tasks.map((t) => `
      <div class="task-item">
        <div class="task-check ${t.is_done ? 'done' : ''}">${t.is_done ? '✓' : ''}</div>
        <div class="task-info"><div class="task-name ${t.is_done ? 'done' : ''}">${escapeHtml(t.name)}</div></div>
      </div>`).join('') : '<div class="empty">予定タスクなし</div>'}</div>
    <div style="height:12px;"></div>
    <button class="btn secondary" id="detail-add-tx">この日に収支を追加</button>
  `);
  bindTxDelete(document.getElementById('modal-root'), () => openDayDetailModal(date));
  document.getElementById('detail-add-tx').addEventListener('click', () => openTransactionModal(date));
}

async function renderMonthlySummary(body) {
  const summary = await api(`/summary/month?month=${state.calMonth}`);
  const maxTotal = summary.by_category.length ? Number(summary.by_category[0].total) : 1;
  body.innerHTML = `
    <div class="card">
      <h2>月の収支</h2>
      <div class="balance-row">
        <div class="balance-item"><div class="label">収入</div><div class="value income">${fmtYen(summary.income)}</div></div>
        <div class="balance-item"><div class="label">支出</div><div class="value expense">${fmtYen(summary.expense)}</div></div>
        <div class="balance-item"><div class="label">収支</div><div class="value net ${summary.net >= 0 ? 'positive' : 'negative'}">${fmtYen(summary.net)}</div></div>
      </div>
    </div>
    <div class="card">
      <h2>カテゴリ別支出</h2>
      ${summary.by_category.length ? summary.by_category.map((c) => `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(c.category)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(c.total / maxTotal) * 100}%"></div></div>
          <div class="bar-value">${fmtYen(c.total)}</div>
        </div>`).join('') : '<div class="empty">支出記録がありません</div>'}
    </div>
    <div class="card">
      <h2>タスク完遂率</h2>
      ${summary.task.avg_rate !== null ? `
        <div class="progress-wrap">
          <div class="progress-bar"><div style="width:${summary.task.avg_rate}%"></div></div>
          <div>${summary.task.avg_rate}%</div>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px;">
          ${summary.task.total_done}/${summary.task.total_planned} 件・予定のあった日数 ${summary.task.active_days}日
        </div>` : '<div class="empty">予定タスクがありません</div>'}
    </div>
  `;
}

// ============================================================
// A1-08 記録一覧・一括編集
// ============================================================
async function renderRecords(view) {
  view.innerHTML = `
    <div class="month-nav">
      <button id="rec-prev">‹</button>
      <div class="month-label" id="rec-month-label"></div>
      <button id="rec-next">›</button>
    </div>
    <div id="rec-body"></div>
  `;
  document.getElementById('rec-month-label').textContent = monthLabel(state.recordsMonth);
  document.getElementById('rec-prev').addEventListener('click', () => { shiftRecordsMonth(-1); renderRecords(view); });
  document.getElementById('rec-next').addEventListener('click', () => { shiftRecordsMonth(1); renderRecords(view); });

  const monthStart = `${state.recordsMonth}-01`;
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h2 style="margin:0;">記録一覧（${all.length}件）</h2>
        <button class="tx-del" id="bulk-del" style="border:1px solid var(--border);border-radius:6px;">選択削除</button>
      </div>
      ${all.map((t) => `
        <div class="tx-item" data-id="${t.id}">
          <input type="checkbox" class="bulk-check" data-id="${t.id}">
          <span style="font-size:12px;color:var(--muted);width:44px;flex-shrink:0;">${t.entry_date.slice(5)}</span>
          <span class="tx-cat">${escapeHtml(t.category)}</span>
          <span class="tx-memo">${escapeHtml(t.memo || '')}</span>
          <span class="tx-amount ${t.kind}">${t.kind === 'income' ? '+' : '-'}${fmtYen(t.amount)}</span>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('bulk-del').addEventListener('click', async () => {
    const ids = Array.from(document.querySelectorAll('.bulk-check:checked')).map((c) => c.dataset.id);
    if (!ids.length) return toast('削除する項目を選択してください');
    if (!confirm(`${ids.length}件を削除しますか？`)) return;
    await Promise.all(ids.map((id) => api(`/transactions/${id}`, { method: 'DELETE' })));
    toast('削除しました');
    renderRecords(view);
  });
}

function shiftRecordsMonth(delta) {
  const [y, m] = state.recordsMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.recordsMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ============================================================
// A1-09 設定・カテゴリ管理
// ============================================================
async function renderSettings(view) {
  state.categories = await api('/categories?all=1');
  const defs = await api('/tasks/definitions?all=1');
  const expense = state.categories.filter((c) => c.kind === 'expense');
  const income = state.categories.filter((c) => c.kind === 'income');

  view.innerHTML = `
    <div class="card">
      <h2>アカウント</h2>
      <div style="font-size:14px;margin-bottom:10px;">${escapeHtml(state.user.display_name)}（${escapeHtml(state.user.email)}）</div>
      <button class="btn secondary" id="logout-btn">ログアウト</button>
    </div>
    <div class="card">
      <h2>支出カテゴリ</h2>
      <ul class="settings-list" id="cat-expense">
        ${expense.map(catRowHtml).join('')}
      </ul>
      <div style="height:8px;"></div>
      <button class="btn secondary" data-add-cat="expense">＋ 支出カテゴリを追加</button>
    </div>
    <div class="card">
      <h2>収入カテゴリ</h2>
      <ul class="settings-list" id="cat-income">
        ${income.map(catRowHtml).join('')}
      </ul>
      <div style="height:8px;"></div>
      <button class="btn secondary" data-add-cat="income">＋ 収入カテゴリを追加</button>
    </div>
    <div class="card danger-zone">
      <h2>タスクの完全削除（元に戻せません）</h2>
      <ul class="settings-list">
        ${defs.map((d) => `
          <li>
            <span>${escapeHtml(d.name)}${d.end_date && d.end_date < todayStr() ? '（停止中）' : ''}</span>
            <button class="tx-del" data-hard-del="${d.id}" data-name="${escapeHtml(d.name)}">完全に削除</button>
          </li>
        `).join('') || '<li class="empty">タスクがありません</li>'}
      </ul>
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    state.user = null;
    showAuthScreen();
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
document.getElementById('fab-add').addEventListener('click', () => openTransactionModal(state.todayDate));

boot();
