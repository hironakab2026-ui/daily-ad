const app = document.getElementById('app');
let currentUser = null;

// ---------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function ymStr(dateStr) { return dateStr.slice(0, 7); }
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
const MEAL_TYPE_LABEL = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };
const MACRO_COLOR = { protein_g: '#4c8fd6', fat_g: '#f2a93b', carbs_g: '#2e9e6b' };
const MACRO_LABEL = { protein_g: 'タンパク質', fat_g: '脂質', carbs_g: '炭水化物' };

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `エラーが発生しました（${res.status}）`);
  return data;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'summary';
  const [view, qs] = raw.split('?');
  return { view: view || 'summary', params: new URLSearchParams(qs || '') };
}
function navigate(view, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = `#/${view}${qs ? `?${qs}` : ''}`;
}

// ---------------------------------------------------------------
// シェル（ログイン後の共通レイアウト）
// ---------------------------------------------------------------
const NAV_ITEMS = [
  { view: 'summary', label: 'サマリー', iconName: 'home' },
  { view: 'meal', label: '食事', iconName: 'bowl' },
  { view: 'weight', label: '体重', iconName: 'scale' },
  { view: 'history', label: '履歴', iconName: 'calendar' },
  { view: 'report', label: 'レポート', iconName: 'chart' },
];

function renderShell(activeView, title, bodyHtml) {
  app.innerHTML = `
    <header class="topbar">
      <h1>${esc(title)}</h1>
      <button class="icon-btn" id="btn-settings" title="設定">${icon('settings', 20)}</button>
    </header>
    <main id="view-body">${bodyHtml}</main>
    <nav class="bottom-nav">
      ${NAV_ITEMS.map((item) => `
        <a href="#/${item.view}" class="${item.view === activeView ? 'active' : ''}">
          ${icon(item.iconName, 20)}${item.label}
        </a>`).join('')}
    </nav>
  `;
  document.getElementById('btn-settings').addEventListener('click', () => navigate('settings'));
}

// ---------------------------------------------------------------
// ログイン画面
// ---------------------------------------------------------------
function renderLogin(errorMsg) {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="card login-card">
        <h1 style="margin-top:0;">食事管理アプリ</h1>
        <p class="hint">生活管理アプリ（ハブ）と同じアカウントでログインしてください。</p>
        <form id="login-form" class="stack">
          <div>
            <label>メールアドレス</label>
            <input type="email" name="email" required autofocus>
          </div>
          <div>
            <label>パスワード</label>
            <input type="password" name="password" required>
          </div>
          <button type="submit" class="primary">ログイン</button>
          ${errorMsg ? `<div class="error-text">${esc(errorMsg)}</div>` : ''}
        </form>
      </div>
    </div>
  `;
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      currentUser = await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      navigate('summary');
      router();
    } catch (err) {
      renderLogin(err.message);
    }
  });
}

// ---------------------------------------------------------------
// A2-01 当日サマリー
// ---------------------------------------------------------------
async function renderSummary(params) {
  const date = params.get('date') || todayStr();
  renderShell('summary', '当日サマリー', '<div class="empty">読み込み中…</div>');
  let summary, meals;
  try {
    [summary, meals] = await Promise.all([api(`/summary/${date}`), api(`/meals?date=${date}`)]);
  } catch (err) {
    renderShell('summary', '当日サマリー', `<div class="error-text">${esc(err.message)}</div>`);
    return;
  }
  const grade = summary.grade || 'none';
  const statusLabel = { recorded: '記録あり', partial: '一部記録', none: '記録なし' }[summary.status] || summary.status;
  const chart = summary.chart || { actual: {}, target: {} };
  const actualMeals = meals.filter((m) => !m.is_planned);
  const plannedMeals = meals.filter((m) => m.is_planned);

  const kcalActual = chart.actual.kcal;
  const kcalTarget = chart.target.calories_kcal;
  const kcalPct = kcalActual != null && kcalTarget ? Math.round((kcalActual / kcalTarget) * 100) : null;

  const macroSegments = ['protein_g', 'fat_g', 'carbs_g']
    .map((k) => ({ key: k, value: Number(chart.actual[k]) || 0, color: MACRO_COLOR[k] }));
  const hasMacroData = macroSegments.some((s) => s.value > 0);

  const body = `
    <div class="card" style="display:flex; align-items:center; gap:16px;">
      <div class="grade-badge ${grade}">${summary.grade || '-'}</div>
      <div>
        <div style="font-weight:700;">${esc(date)}（${esc(statusLabel)}）</div>
        ${summary.badge ? `<span class="badge-pill">${esc(summary.badge)}</span>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>カロリー</h2></div>
      ${kcalActual != null ? `
        <div class="kcal-row">
          <span class="big">${kcalActual}<span class="muted">kcal</span></span>
          ${kcalTarget ? `<span class="muted">目標 ${kcalTarget}kcal（${kcalPct}%）</span>` : '<span class="muted">目標未設定</span>'}
        </div>
        ${progressBar(kcalPct ?? 0, { color: 'var(--primary)' })}
      ` : '<div class="empty">まだ食事の記録がありません</div>'}
    </div>

    <div class="card">
      <div class="card-header"><h2>PFCバランス</h2></div>
      ${hasMacroData ? `
        <div class="donut-row">
          ${donutChart(macroSegments.map((s) => ({ value: s.value, color: s.color })), { size: 108, stroke: 16 })}
          <div class="donut-legend">
            ${macroSegments.map((s) => `
              <div class="legend-item">
                <span class="legend-dot" style="background:${s.color}"></span>
                ${MACRO_LABEL[s.key]}
                <span class="legend-value">${s.value}g</span>
              </div>`).join('')}
          </div>
        </div>
      ` : '<div class="empty">タンパク質・脂質・炭水化物のデータがありません</div>'}
    </div>

    ${chart.weight_kg != null ? `
      <div class="card">
        <div class="card-header"><h2>体重</h2></div>
        <div class="kcal-row">
          <span class="big">${chart.weight_kg}<span class="muted">kg</span></span>
          ${chart.weight_diff != null ? `<span class="${chart.weight_diff > 0 ? 'diff-up' : 'diff-down'}">${chart.weight_diff > 0 ? '+' : ''}${chart.weight_diff}kg</span>` : ''}
        </div>
      </div>
    ` : ''}

    <div class="card">
      <div class="card-header"><h2>今日の食事（${actualMeals.length}件）</h2></div>
      ${actualMeals.length ? actualMeals.map((m) => `
        <div class="list-item">
          <div>
            <span class="meal-type-tag">${MEAL_TYPE_LABEL[m.meal_type] || m.meal_type}</span>
            <strong>${esc(m.food_name)}</strong>
          </div>
          <span class="meta">${m.calories_kcal != null ? `${m.calories_kcal}kcal` : ''}</span>
        </div>
      `).join('') : '<div class="empty">まだ記録がありません</div>'}
    </div>

    ${plannedMeals.length ? `
      <div class="card">
        <div class="card-header"><h2>献立予定（${plannedMeals.length}件）</h2></div>
        ${plannedMeals.map((m) => `
          <div class="list-item">
            <div>
              <span class="meal-type-tag">${MEAL_TYPE_LABEL[m.meal_type] || m.meal_type}</span>
              <strong>${esc(m.food_name)}</strong>
              <span class="planned-badge">${icon('clock', 12)}予定</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="row">
      <button class="primary" id="quick-meal">${icon('plus', 16)} 食事を記録</button>
      <button class="primary" id="quick-weight">${icon('plus', 16)} 体重を記録</button>
    </div>
  `;
  renderShell('summary', '当日サマリー', body);
  document.getElementById('quick-meal').addEventListener('click', () => navigate('meal', { date }));
  document.getElementById('quick-weight').addEventListener('click', () => navigate('weight', { date }));
}

// ---------------------------------------------------------------
// A2-02 食事記録
// ---------------------------------------------------------------
let mealFormState = { food: null, quantity: 1 };

function nutritionPreviewHtml(food, qty) {
  if (!food) return '';
  const scale = (v) => (v === null || v === undefined ? '-' : Math.round(Number(v) * qty * 10) / 10);
  return `
    <div class="selected-food-card">
      <div>
        <strong>${esc(food.name)}</strong>
        <div class="meta">${esc(food.serving_label)} あたり ${food.calories_kcal}kcal</div>
      </div>
      <button type="button" class="icon-btn" id="clear-food" title="選択解除">${icon('x', 16)}</button>
    </div>
    <div class="qty-stepper">
      <button type="button" id="qty-minus">${icon('minus', 14)}</button>
      <input type="number" id="qty-input" value="${qty}" min="0.5" step="0.5">
      <button type="button" id="qty-plus">${icon('plus', 14)}</button>
      <span class="hint">${esc(food.serving_label)} 分</span>
    </div>
    <div class="nutrition-preview">
      <span>カロリー <b>${scale(food.calories_kcal)}kcal</b></span>
      <span>タンパク質 <b>${scale(food.protein_g)}g</b></span>
      <span>脂質 <b>${scale(food.fat_g)}g</b></span>
      <span>炭水化物 <b>${scale(food.carbs_g)}g</b></span>
    </div>
  `;
}

async function renderMeal(params) {
  const date = params.get('date') || todayStr();
  renderShell('meal', '食事記録', '<div class="empty">読み込み中…</div>');
  let meals;
  try {
    meals = await api(`/meals?date=${date}`);
  } catch (err) {
    renderShell('meal', '食事記録', `<div class="error-text">${esc(err.message)}</div>`);
    return;
  }
  mealFormState = { food: null, quantity: 1 };

  const body = `
    <div class="card">
      <div class="card-header"><h2>${esc(date)} の記録を追加</h2></div>
      <div class="icon-btn-row">
        <button type="button" id="btn-photo">${icon('camera', 16)} 写真から入力</button>
        <button type="button" id="btn-barcode">${icon('barcode', 16)} バーコードでスキャン</button>
      </div>
      <div id="camera-panel"></div>
      <form id="meal-form" class="stack" style="margin-top:14px;">
        <div class="row">
          <div>
            <label>日付</label>
            <input type="date" name="meal_date" value="${esc(date)}" required>
          </div>
          <div>
            <label>区分</label>
            <select name="meal_type" required>
              ${Object.entries(MEAL_TYPE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="food-search">
          <label>食品名（入力すると候補が出ます）</label>
          <input type="text" id="food-name-input" name="food_name" placeholder="例：鶏むね肉" autocomplete="off" required>
          <div id="food-search-results" class="food-search-results" hidden></div>
        </div>
        <div id="food-detail"></div>
        <div id="manual-fields">
          <div class="row">
            <div><label>カロリー(kcal)</label><input type="number" name="calories_kcal" min="0"></div>
            <div><label>タンパク質(g)</label><input type="number" name="protein_g" min="0" step="0.1"></div>
          </div>
          <div class="row">
            <div><label>脂質(g)</label><input type="number" name="fat_g" min="0" step="0.1"></div>
            <div><label>炭水化物(g)</label><input type="number" name="carbs_g" min="0" step="0.1"></div>
          </div>
        </div>
        <div><label>メモ</label><textarea name="memo"></textarea></div>
        <label class="planned-toggle"><input type="checkbox" name="is_planned"> 献立予定として登録する（まだ食べていない）</label>
        <button type="submit" class="primary">記録する</button>
        <div class="error-text" id="meal-error"></div>
      </form>
    </div>
    <div class="card">
      <div class="card-header"><h2>${esc(date)} の記録一覧</h2></div>
      ${meals.length ? meals.map((m) => `
        <div class="list-item">
          <div>
            <span class="meal-type-tag">${MEAL_TYPE_LABEL[m.meal_type] || m.meal_type}</span>
            <strong>${esc(m.food_name)}</strong>
            ${m.is_planned ? `<span class="planned-badge">${icon('clock', 12)}予定</span>` : ''}
            <div class="meta">${m.calories_kcal != null ? `${m.calories_kcal}kcal` : 'カロリー未入力'}${m.memo ? ` ・ ${esc(m.memo)}` : ''}</div>
          </div>
          <div class="actions">
            ${m.is_planned ? `<button class="ghost" data-eaten="${m.id}">食べた</button>` : ''}
            <button class="link-danger" data-del="${m.id}">削除</button>
          </div>
        </div>
      `).join('') : '<div class="empty">この日の記録はまだありません</div>'}
    </div>
  `;
  renderShell('meal', '食事記録', body);
  wireMealForm(date);

  app.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('この記録を削除しますか？')) return;
      await api(`/meals/${btn.dataset.del}`, { method: 'DELETE' });
      renderMeal(new URLSearchParams({ date }));
    });
  });
  app.querySelectorAll('[data-eaten]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/meals/${btn.dataset.eaten}`, { method: 'PUT', body: { is_planned: false } });
      renderMeal(new URLSearchParams({ date }));
    });
  });
}

function updateFoodDetail() {
  document.getElementById('food-detail').innerHTML = nutritionPreviewHtml(mealFormState.food, mealFormState.quantity);
  document.getElementById('manual-fields').style.display = mealFormState.food ? 'none' : '';
  if (mealFormState.food) {
    document.getElementById('clear-food').addEventListener('click', () => {
      mealFormState = { food: null, quantity: 1 };
      document.getElementById('food-name-input').value = '';
      updateFoodDetail();
    });
    document.getElementById('qty-minus').addEventListener('click', () => setQuantity(mealFormState.quantity - 0.5));
    document.getElementById('qty-plus').addEventListener('click', () => setQuantity(mealFormState.quantity + 0.5));
    document.getElementById('qty-input').addEventListener('change', (e) => setQuantity(Number(e.target.value)));
  }
}
function setQuantity(v) {
  mealFormState.quantity = Math.max(0.5, Math.round(v * 2) / 2);
  updateFoodDetail();
}

function wireMealForm(date) {
  const input = document.getElementById('food-name-input');
  const resultsBox = document.getElementById('food-search-results');

  const doSearch = debounce(async (q) => {
    if (!q.trim()) { resultsBox.hidden = true; return; }
    const results = await api(`/foods/search?q=${encodeURIComponent(q)}`);
    if (!results.length) { resultsBox.hidden = true; return; }
    resultsBox.innerHTML = results.map((f) => `
      <div class="food-search-item" data-id="${f.id}">
        <span>${esc(f.name)}</span>
        <span class="meta">${esc(f.serving_label)} ${f.calories_kcal}kcal</span>
      </div>
    `).join('');
    resultsBox.hidden = false;
    resultsBox.querySelectorAll('.food-search-item').forEach((item) => {
      item.addEventListener('click', () => {
        const food = results.find((f) => String(f.id) === item.dataset.id);
        mealFormState = { food, quantity: 1 };
        input.value = food.name;
        resultsBox.hidden = true;
        updateFoodDetail();
      });
    });
  }, 250);

  input.addEventListener('input', (e) => {
    if (mealFormState.food && e.target.value !== mealFormState.food.name) {
      mealFormState.food = null;
      updateFoodDetail();
    }
    doSearch(e.target.value);
  });
  document.addEventListener('click', (e) => {
    if (!resultsBox.contains(e.target) && e.target !== input) resultsBox.hidden = true;
  });

  document.getElementById('btn-photo').addEventListener('click', () => openPhotoCapture());
  document.getElementById('btn-barcode').addEventListener('click', () => openBarcodeScan());

  document.getElementById('meal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      meal_date: fd.get('meal_date'),
      meal_type: fd.get('meal_type'),
      memo: fd.get('memo'),
      is_planned: fd.get('is_planned') === 'on',
    };
    if (mealFormState.food) {
      payload.food_id = mealFormState.food.id;
      payload.quantity = mealFormState.quantity;
    } else {
      payload.food_name = fd.get('food_name');
      ['calories_kcal', 'protein_g', 'fat_g', 'carbs_g'].forEach((k) => {
        const v = fd.get(k);
        payload[k] = v === '' || v === null ? null : Number(v);
      });
    }
    try {
      await api('/meals', { method: 'POST', body: payload });
      renderMeal(new URLSearchParams({ date: payload.meal_date }));
    } catch (err) {
      document.getElementById('meal-error').textContent = err.message;
    }
  });
}

// ---- 写真からの自動入力 ----
function openPhotoCapture() {
  const panel = document.getElementById('camera-panel');
  panel.innerHTML = `
    <div class="camera-panel card" style="margin-top:10px;">
      <input type="file" id="photo-input" accept="image/*" capture="environment">
      <div id="photo-status" class="hint"></div>
    </div>
  `;
  document.getElementById('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('photo-status');
    statusEl.textContent = 'AIが写真から栄養価を推定しています…';
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    try {
      const result = await api('/foods/recognize-photo', { method: 'POST', body: { image: dataUrl } });
      mealFormState = { food: null, quantity: 1 };
      document.getElementById('food-name-input').value = result.name;
      document.querySelector('[name="calories_kcal"]').value = result.calories_kcal ?? '';
      document.querySelector('[name="protein_g"]').value = result.protein_g ?? '';
      document.querySelector('[name="fat_g"]').value = result.fat_g ?? '';
      document.querySelector('[name="carbs_g"]').value = result.carbs_g ?? '';
      statusEl.textContent = result.note || 'AIによる推定値です。内容を確認してから記録してください。';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

// ---- バーコードでのスキャン ----
async function lookupBarcode(barcode, statusEl) {
  statusEl.textContent = '商品を検索しています…';
  try {
    const food = await api('/foods/barcode', { method: 'POST', body: { barcode } });
    mealFormState = { food, quantity: 1 };
    document.getElementById('food-name-input').value = food.name;
    updateFoodDetail();
    statusEl.textContent = `「${food.name}」を見つけました。`;
    document.getElementById('camera-panel').innerHTML = '';
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

function openBarcodeScan() {
  const panel = document.getElementById('camera-panel');
  const supportsNative = 'BarcodeDetector' in window;
  panel.innerHTML = `
    <div class="camera-panel card" style="margin-top:10px;">
      ${supportsNative ? '<video id="barcode-video" autoplay playsinline muted></video>' : ''}
      <div class="row" style="margin-top:8px;">
        <input type="text" id="barcode-input" placeholder="バーコード番号を入力（USBスキャナ入力にも対応）">
        <button type="button" class="primary" id="barcode-search-btn">検索</button>
      </div>
      <div id="barcode-status" class="hint"></div>
    </div>
  `;
  const statusEl = document.getElementById('barcode-status');
  document.getElementById('barcode-search-btn').addEventListener('click', () => {
    const v = document.getElementById('barcode-input').value.trim();
    if (v) lookupBarcode(v, statusEl);
  });
  document.getElementById('barcode-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v) lookupBarcode(v, statusEl);
    }
  });

  if (supportsNative) {
    startNativeBarcodeScan(statusEl);
  } else {
    statusEl.textContent = 'このブラウザはカメラでの自動スキャンに対応していません。バーコード番号を入力してください。';
  }
}

async function startNativeBarcodeScan(statusEl) {
  const video = document.getElementById('barcode-video');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    statusEl.textContent = 'バーコードにカメラを向けてください…';
    let stopped = false;
    const stop = () => {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
    };
    const loop = async () => {
      if (stopped || !document.body.contains(video)) { stop(); return; }
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          stop();
          await lookupBarcode(codes[0].rawValue, statusEl);
          return;
        }
      } catch { /* 検出できないフレームは無視して継続 */ }
      requestAnimationFrame(loop);
    };
    loop();
  } catch (err) {
    statusEl.textContent = 'カメラを起動できませんでした。バーコード番号を入力してください。';
  }
}

// ---------------------------------------------------------------
// A2-03 体重記録
// ---------------------------------------------------------------
async function renderWeight(params) {
  const date = params.get('date') || todayStr();
  renderShell('weight', '体重記録', '<div class="empty">読み込み中…</div>');
  let entries, prev;
  try {
    entries = await api(`/weights?date=${date}`);
    const prevList = await api(`/weights?from=${addDays(date, -14)}&to=${addDays(date, -1)}`);
    prev = prevList.length ? prevList[prevList.length - 1] : null;
  } catch (err) {
    renderShell('weight', '体重記録', `<div class="error-text">${esc(err.message)}</div>`);
    return;
  }
  const latest = entries.length ? entries[entries.length - 1] : null;
  const diff = latest && prev ? Math.round((latest.weight_kg - prev.weight_kg) * 10) / 10 : null;

  const body = `
    <div class="card">
      <div class="card-header"><h2>${esc(date)} の記録を追加</h2></div>
      <form id="weight-form" class="stack">
        <div>
          <label>日付</label>
          <input type="date" name="log_date" value="${esc(date)}" required>
        </div>
        <div class="row">
          <div><label>体重(kg)</label><input type="number" name="weight_kg" min="0" step="0.1" required></div>
          <div><label>体脂肪率(%・任意)</label><input type="number" name="body_fat_pct" min="0" step="0.1"></div>
        </div>
        <button type="submit" class="primary">記録する</button>
        <div class="error-text" id="weight-error"></div>
      </form>
      ${diff !== null ? `<div class="hint">前回記録（${prev.log_date}）から <span class="${diff > 0 ? 'diff-up' : 'diff-down'}">${diff > 0 ? '+' : ''}${diff}kg</span></div>` : ''}
    </div>
    <div class="card">
      <div class="card-header"><h2>${esc(date)} の記録一覧</h2></div>
      ${entries.length ? entries.map((w) => `
        <div class="list-item">
          <div>
            <strong>${w.weight_kg}kg</strong>
            <div class="meta">${w.body_fat_pct != null ? `体脂肪率 ${w.body_fat_pct}%` : ''} ・ ${w.logged_at}</div>
          </div>
          <div class="actions"><button class="link-danger" data-del="${w.id}">削除</button></div>
        </div>
      `).join('') : '<div class="empty">この日の記録はまだありません</div>'}
    </div>
  `;
  renderShell('weight', '体重記録', body);

  document.getElementById('weight-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      log_date: fd.get('log_date'),
      weight_kg: Number(fd.get('weight_kg')),
      body_fat_pct: fd.get('body_fat_pct') === '' ? null : Number(fd.get('body_fat_pct')),
    };
    try {
      await api('/weights', { method: 'POST', body: payload });
      renderWeight(new URLSearchParams({ date: payload.log_date }));
    } catch (err) {
      document.getElementById('weight-error').textContent = err.message;
    }
  });
  app.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('この記録を削除しますか？')) return;
      await api(`/weights/${btn.dataset.del}`, { method: 'DELETE' });
      renderWeight(new URLSearchParams({ date }));
    });
  });
}

// ---------------------------------------------------------------
// A2-04 履歴・カレンダー
// ---------------------------------------------------------------
const WEEKDAY_LABEL = ['日', '月', '火', '水', '木', '金', '土'];

async function renderHistory(params) {
  const ym = params.get('ym') || ymStr(todayStr());
  renderShell('history', '履歴・カレンダー', '<div class="empty">読み込み中…</div>');
  const [year, month] = ym.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const from = `${ym}-01`;
  const to = `${ym}-${String(daysInMonth).padStart(2, '0')}`;

  let days, weights;
  try {
    [days, weights] = await Promise.all([
      api(`/summary/month/${ym}`),
      api(`/weights?from=${from}&to=${to}`),
    ]);
  } catch (err) {
    renderShell('history', '履歴・カレンダー', `<div class="error-text">${esc(err.message)}</div>`);
    return;
  }
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const firstDay = new Date(year, month - 1, 1);
  const leadBlanks = firstDay.getDay();

  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push('<div></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${ym}-${String(day).padStart(2, '0')}`;
    const info = byDate[dateStr];
    const gradeClass = info?.grade || '';
    cells.push(`
      <a href="#/summary?date=${dateStr}" class="calendar-cell ${gradeClass}" title="${dateStr}">
        <span class="day-num">${day}</span>
        ${info?.metrics?.kcal != null ? `<span>${info.metrics.kcal}kcal</span>` : ''}
        ${info?.has_planned ? '<span class="planned-dot"></span>' : ''}
      </a>
    `);
  }

  const weightPoints = [];
  const weightByDate = Object.fromEntries(weights.map((w) => [w.log_date, Number(w.weight_kg)]));
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${ym}-${String(day).padStart(2, '0')}`;
    weightPoints.push({ value: weightByDate[dateStr] ?? null });
  }

  const prevYm = ymStr(addDays(from, -1));
  const nextYm = ymStr(addDays(to, 1));

  const body = `
    <div class="card">
      <div class="card-header">
        <button class="ghost" id="prev-month">${icon('chevronLeft', 16)}</button>
        <h2 style="font-size:15px;">${ym}</h2>
        <button class="ghost" id="next-month">${icon('chevronRight', 16)}</button>
      </div>
      <div class="calendar-grid">
        ${WEEKDAY_LABEL.map((w) => `<div class="calendar-weekday">${w}</div>`).join('')}
        ${cells.join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2>体重の推移</h2></div>
      ${lineChart(weightPoints, { width: 320, height: 100 })}
      <div class="chart-caption">${ym} の記録がある日のみ結びます</div>
    </div>
  `;
  renderShell('history', '履歴・カレンダー', body);
  document.getElementById('prev-month').addEventListener('click', () => navigate('history', { ym: prevYm }));
  document.getElementById('next-month').addEventListener('click', () => navigate('history', { ym: nextYm }));
}

// ---------------------------------------------------------------
// A2-05 栄養評価レポート
// ---------------------------------------------------------------
async function renderReport(params) {
  const range = params.get('range') || 'week';
  const end = params.get('end') || todayStr();
  const start = range === 'month' ? `${ymStr(end)}-01` : addDays(end, -6);

  renderShell('report', '栄養評価レポート', '<div class="empty">読み込み中…</div>');
  let report;
  try {
    report = await api(`/summary/report/${start}/${end}`);
  } catch (err) {
    renderShell('report', '栄養評価レポート', `<div class="error-text">${esc(err.message)}</div>`);
    return;
  }

  const body = `
    <div class="card">
      <div class="card-header">
        <h2>期間</h2>
        <div class="row" style="max-width:220px;">
          <button class="ghost ${range === 'week' ? 'primary' : ''}" id="range-week">週次</button>
          <button class="ghost ${range === 'month' ? 'primary' : ''}" id="range-month">月次</button>
        </div>
      </div>
      <div class="hint">${start} 〜 ${end}</div>
    </div>
    <div class="card" style="display:flex; align-items:center; gap:16px;">
      <div class="grade-badge ${report.average_grade || 'none'}">${report.average_grade || '-'}</div>
      <div>平均グレード</div>
    </div>
    <div class="card">
      <div class="card-header"><h2>日別の傾向</h2></div>
      ${report.days.length ? `
        ${gradeBarChart(report.days)}
        <div class="metrics-grid" style="margin-top:10px;">
          ${report.days.map((d) => `
            <div class="metric">
              <div class="label">${d.date.slice(5)}</div>
              <div class="value">${d.grade || '-'}</div>
            </div>`).join('')}
        </div>
      ` : '<div class="empty">この期間の記録はありません</div>'}
    </div>
  `;
  renderShell('report', '栄養評価レポート', body);
  document.getElementById('range-week').addEventListener('click', () => navigate('report', { range: 'week', end }));
  document.getElementById('range-month').addEventListener('click', () => navigate('report', { range: 'month', end }));
}

// ---------------------------------------------------------------
// A2-06 設定
// ---------------------------------------------------------------
async function renderSettings() {
  renderShell('settings', '設定', '<div class="empty">読み込み中…</div>');
  const [targets, hubConn] = await Promise.all([api('/targets'), api('/hub-connection')]);

  const body = `
    <div class="card">
      <div class="card-header"><h2>栄養目標</h2></div>
      <form id="targets-form" class="stack">
        <div class="row">
          <div><label>目標カロリー(kcal)</label><input type="number" name="target_calories_kcal" value="${targets.target_calories_kcal ?? ''}"></div>
          <div><label>目標体重(kg)</label><input type="number" step="0.1" name="target_weight_kg" value="${targets.target_weight_kg ?? ''}"></div>
        </div>
        <div class="row">
          <div><label>目標タンパク質(g)</label><input type="number" step="0.1" name="target_protein_g" value="${targets.target_protein_g ?? ''}"></div>
          <div><label>目標脂質(g)</label><input type="number" step="0.1" name="target_fat_g" value="${targets.target_fat_g ?? ''}"></div>
        </div>
        <div><label>目標炭水化物(g)</label><input type="number" step="0.1" name="target_carbs_g" value="${targets.target_carbs_g ?? ''}"></div>
        <button type="submit" class="primary">保存</button>
        <div class="error-text" id="targets-error"></div>
      </form>
    </div>
    <div class="card">
      <div class="card-header"><h2>ハブ（生活管理アプリ）連携</h2></div>
      <div class="hint">生活管理アプリの「設定→認証トークン」で発行したトークンを貼り付けてください。</div>
      <div class="hint">現在の状態：${hubConn.connected ? '連携済み' : '未連携'}</div>
      <form id="hub-form" class="stack" style="margin-top:10px;">
        <input type="text" name="token" placeholder="トークンを貼り付け">
        <button type="submit" class="primary">連携する</button>
        <div class="error-text" id="hub-error"></div>
      </form>
      ${hubConn.connected ? '<button class="link-danger" id="hub-disconnect" style="margin-top:6px;">連携を解除する</button>' : ''}
    </div>
    <div class="card">
      <button class="ghost" id="logout-btn">ログアウト</button>
    </div>
  `;
  renderShell('settings', '設定', body);

  document.getElementById('targets-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    Object.keys(payload).forEach((k) => { payload[k] = payload[k] === '' ? null : Number(payload[k]); });
    try {
      await api('/targets', { method: 'PUT', body: payload });
      renderSettings();
    } catch (err) {
      document.getElementById('targets-error').textContent = err.message;
    }
  });
  document.getElementById('hub-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = new FormData(e.target).get('token');
    try {
      await api('/hub-connection', { method: 'PUT', body: { token } });
      renderSettings();
    } catch (err) {
      document.getElementById('hub-error').textContent = err.message;
    }
  });
  document.getElementById('hub-disconnect')?.addEventListener('click', async () => {
    if (!confirm('連携を解除しますか？')) return;
    await api('/hub-connection', { method: 'DELETE' });
    renderSettings();
  });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    currentUser = null;
    navigate('summary');
    router();
  });
}

// ---------------------------------------------------------------
// ルーター
// ---------------------------------------------------------------
async function router() {
  if (!currentUser) {
    try {
      currentUser = await api('/auth/me');
    } catch {
      renderLogin();
      return;
    }
  }
  const { view, params } = parseHash();
  if (view === 'meal') return renderMeal(params);
  if (view === 'weight') return renderWeight(params);
  if (view === 'history') return renderHistory(params);
  if (view === 'report') return renderReport(params);
  if (view === 'settings') return renderSettings(params);
  return renderSummary(params);
}

window.addEventListener('hashchange', router);
router();
