// 依存ライブラリなしの軽量SVGチャート（ビルド不要のvanilla JSのまま）。
// 数値の羅列ではなく視覚的に見せるための最小限の実装。

function donutChart(segments, opts = {}) {
  const size = opts.size || 120;
  const stroke = opts.stroke || 16;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, seg) => sum + (seg.value || 0), 0);

  let offset = 0;
  const arcs = segments
    .filter((seg) => seg.value > 0)
    .map((seg) => {
      const frac = total > 0 ? seg.value / total : 0;
      const dash = frac * circumference;
      const circle = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${c} ${c})"/>`;
      offset += dash;
      return circle;
    })
    .join('');

  const centerLabel = opts.centerLabel
    ? `<text x="${c}" y="${c + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text)">${opts.centerLabel}</text>`
    : '';

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
    ${arcs}
    ${centerLabel}
  </svg>`;
}

function progressBar(pct, opts = {}) {
  const color = opts.color || 'var(--primary)';
  const width = Math.max(0, Math.min(100, pct));
  return `<div class="progress-track"><div class="progress-fill" style="width:${width}%;background:${color}"></div></div>`;
}

function lineChart(points, opts = {}) {
  const width = opts.width || 320;
  const height = opts.height || 100;
  const pad = 10;
  const values = points.map((p) => p.value).filter((v) => v !== null && v !== undefined);
  if (values.length === 0) {
    return `<div class="empty">データがありません</div>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

  let path = '';
  let started = false;
  const dots = [];
  points.forEach((p, i) => {
    const x = pad + i * stepX;
    if (p.value === null || p.value === undefined) {
      started = false;
      return;
    }
    const y = height - pad - ((p.value - min) / range) * (height - pad * 2);
    path += `${started ? ' L ' : 'M '}${x.toFixed(1)} ${y.toFixed(1)}`;
    started = true;
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="var(--primary)"/>`);
  });

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="var(--primary)" stroke-width="2.5"/>
    ${dots.join('')}
  </svg>`;
}

function gradeBarChart(days, opts = {}) {
  const scoreOf = { S: 4, A: 3, B: 2, C: 1 };
  const barWidth = opts.barWidth || 20;
  const gap = opts.gap || 8;
  const height = opts.height || 90;
  const bars = days
    .map((d, i) => {
      const score = scoreOf[d.grade] || 0;
      const h = score ? (score / 4) * (height - 10) + 6 : 4;
      const x = i * (barWidth + gap);
      const color = d.grade ? `var(--grade-${d.grade.toLowerCase()})` : 'var(--border)';
      return `<rect x="${x}" y="${height - h}" width="${barWidth}" height="${h}" rx="4" fill="${color}"/>`;
    })
    .join('');
  const width = Math.max(barWidth, days.length * (barWidth + gap) - gap);
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">${bars}</svg>`;
}
