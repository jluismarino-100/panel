/**
 * Gráficos en SVG puro (sin librerías externas).
 * Reglas aplicadas: marcas finas, grilla hairline sólida, un solo eje por gráfico,
 * separación por hueco de 2px, etiquetas selectivas, tooltip que complementa
 * (nunca es la única forma de leer el dato: cada gráfico tiene su tabla gemela).
 */

import { isNum, dateShort, dateLong, esc } from './format.js';

const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
export const seriesColor = (i) => `var(${SERIES[i % SERIES.length]})`;

const tipEl = () => document.getElementById('tip');

function showTip(html, evt) {
  const t = tipEl();
  t.innerHTML = html;
  t.classList.add('on');
  const pad = 14;
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
  t.style.left = x + 'px';
  t.style.top = y + 'px';
}
function hideTip() {
  tipEl().classList.remove('on');
}

function niceTicks(max, count = 4) {
  if (!isNum(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Gráfico de líneas con crosshair. data: [{date, value}] */
export function lineChart(container, { data, color = seriesColor(0), fmt = (v) => v, label = '' }) {
  const W = 100; // usamos viewBox responsivo
  const H = 190;
  const padL = 54, padR = 14, padT = 12, padB = 26;
  const width = container.clientWidth || 620;
  const innerW = Math.max(80, width - padL - padR);
  const innerH = H - padT - padB;

  const values = data.map((d) => d.value ?? 0);
  const max = Math.max(...values, 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i) => padL + (data.length <= 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const y = (v) => padT + innerH - ((v || 0) / top) * innerH;

  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ${pts} ${x(data.length - 1)},${padT + innerH}`;

  const gridLines = ticks
    .map((t) => `<line x1="${padL}" x2="${padL + innerW}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/>
       <text x="${padL - 8}" y="${y(t) + 3.5}" text-anchor="end" font-size="9.5" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${esc(fmt(t))}</text>`)
    .join('');

  const step = Math.max(1, Math.ceil(data.length / 8));
  const xLabels = data
    .map((d, i) => (i % step === 0 || i === data.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${dateShort(d.date)}</text>` : ''))
    .join('');

  const lastIdx = data.length - 1;
  const maxIdx = values.indexOf(max);

  container.innerHTML = `
    <svg class="chart" viewBox="0 0 ${width} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
      ${gridLines}
      <polygon points="${areaPts}" fill="${color}" opacity="0.10"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${xLabels}
      ${maxIdx >= 0 && max > 0 ? `<circle cx="${x(maxIdx)}" cy="${y(max)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>` : ''}
      ${lastIdx >= 0 ? `<circle cx="${x(lastIdx)}" cy="${y(values[lastIdx])}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
        <text x="${Math.min(x(lastIdx), width - padR)}" y="${Math.max(y(values[lastIdx]) - 10, 12)}" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--ink-2)">${esc(fmt(values[lastIdx]))}</text>` : ''}
      <line class="cross" x1="0" x2="0" y1="${padT}" y2="${padT + innerH}" stroke="var(--axis)" stroke-width="1" opacity="0"/>
      <rect x="${padL}" y="${padT}" width="${innerW}" height="${innerH}" fill="transparent" class="hit"/>
    </svg>`;

  const svg = container.querySelector('svg');
  const cross = svg.querySelector('.cross');
  const hit = svg.querySelector('.hit');
  hit.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const scale = width / rect.width;
    const px = (e.clientX - rect.left) * scale;
    let idx = data.length <= 1 ? 0 : Math.round(((px - padL) / innerW) * (data.length - 1));
    idx = Math.max(0, Math.min(data.length - 1, idx));
    cross.setAttribute('x1', x(idx));
    cross.setAttribute('x2', x(idx));
    cross.setAttribute('opacity', '1');
    showTip(`<div class="th">${dateLong(data[idx].date)}</div><div class="tr"><span>${esc(label)}</span><span>${esc(fmt(data[idx].value))}</span></div>`, e);
  });
  hit.addEventListener('mouseleave', () => {
    cross.setAttribute('opacity', '0');
    hideTip();
  });
}

/** Columnas verticales. data: [{date|label, value}] */
export function columnChart(container, { data, color = seriesColor(0), fmt = (v) => v, label = '', xKey = 'date', maxLabels = 8 }) {
  const H = 190;
  const padL = 54, padR = 14, padT = 12, padB = 26;
  const width = container.clientWidth || 620;
  const innerW = Math.max(80, width - padL - padR);
  const innerH = H - padT - padB;
  const values = data.map((d) => d.value ?? 0);
  const max = Math.max(...values, 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const band = innerW / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(3, band - 2)); // 2px de hueco entre barras
  const y = (v) => padT + innerH - ((v || 0) / top) * innerH;

  const grid = ticks
    .map((t) => `<line x1="${padL}" x2="${padL + innerW}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/>
      <text x="${padL - 8}" y="${y(t) + 3.5}" text-anchor="end" font-size="9.5" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${esc(fmt(t))}</text>`)
    .join('');

  const step = Math.max(1, Math.ceil(data.length / maxLabels));
  const bars = data
    .map((d, i) => {
      const cx = padL + band * i + band / 2;
      const h = Math.max(0, padT + innerH - y(d.value));
      const r = Math.min(4, bw / 2);
      return `<rect class="bar" data-i="${i}" x="${cx - bw / 2}" y="${y(d.value)}" width="${bw}" height="${h}" rx="${r}" ry="${r}" fill="${color}"/>
        ${h > 0 ? `<rect x="${cx - bw / 2}" y="${padT + innerH - Math.min(h, r)}" width="${bw}" height="${Math.min(h, r)}" fill="${color}"/>` : ''}
        ${i % step === 0 || i === data.length - 1 ? `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${esc(xKey === 'date' ? dateShort(d.date) : d.label)}</text>` : ''}`;
    })
    .join('');

  container.innerHTML = `<svg class="chart" viewBox="0 0 ${width} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${grid}${bars}</svg>`;

  container.querySelectorAll('.bar').forEach((r) => {
    r.addEventListener('mousemove', (e) => {
      const d = data[Number(r.dataset.i)];
      showTip(`<div class="th">${xKey === 'date' ? dateLong(d.date) : esc(d.label)}</div><div class="tr"><span>${esc(label)}</span><span>${esc(fmt(d.value))}</span></div>`, e);
    });
    r.addEventListener('mouseleave', hideTip);
  });
}

/** Barras horizontales para rankings. rows: [{label, value, sub}] */
export function barsH(container, { rows, color = seriesColor(0), fmt = (v) => v, label = '' }) {
  if (!rows.length) {
    container.innerHTML = '<div class="empty">Sin datos en el período</div>';
    return;
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.value ?? 0)), 1);
  container.innerHTML = rows
    .map((r, i) => {
      const w = Math.max(1, (Math.abs(r.value ?? 0) / max) * 100);
      return `<div class="bh" data-i="${i}" style="padding:6px 0;">
        <div style="display:flex;justify-content:space-between;gap:12px;font-size:12.5px;margin-bottom:4px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">${esc(r.label)}</span>
          <span style="font-variant-numeric:tabular-nums;color:var(--ink-2);font-weight:600;">${esc(fmt(r.value))}</span>
        </div>
        <div style="height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${w}%;background:${(r.value ?? 0) < 0 ? 'var(--critical)' : color};border-radius:4px;"></div>
        </div>
      </div>`;
    })
    .join('');
  container.querySelectorAll('.bh').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = rows[Number(el.dataset.i)];
      showTip(`<div class="th">${esc(r.label)}</div><div class="tr"><span>${esc(label)}</span><span>${esc(fmt(r.value))}</span></div>${r.sub ? `<div class="tr"><span>${esc(r.sub.k)}</span><span>${esc(r.sub.v)}</span></div>` : ''}`, e);
    });
    el.addEventListener('mouseleave', hideTip);
  });
}

/** Barra apilada 100% con hueco de 2px entre segmentos. */
export function stackedBar(container, { segments, fmt = (v) => v }) {
  const total = segments.reduce((a, s) => a + Math.abs(s.value || 0), 0);
  if (!total) {
    container.innerHTML = '<div class="empty">Sin costos registrados en el período</div>';
    return;
  }
  const bar = segments
    .map((s, i) => {
      const w = (Math.abs(s.value || 0) / total) * 100;
      if (w <= 0) return '';
      return `<div class="seg" data-i="${i}" style="width:${w}%;background:${s.color};height:100%;${i < segments.length - 1 ? 'margin-right:2px;' : ''}border-radius:${i === 0 ? '4px 0 0 4px' : i === segments.length - 1 ? '0 4px 4px 0' : '0'};"></div>`;
    })
    .join('');
  container.innerHTML = `
    <div style="display:flex;height:22px;border-radius:4px;overflow:hidden;background:var(--surface-2);">${bar}</div>
    <div class="legend" style="padding:12px 0 0;">
      ${segments.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} · <b style="font-variant-numeric:tabular-nums">${esc(fmt(s.value))}</b></span>`).join('')}
    </div>`;
  container.querySelectorAll('.seg').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const s = segments[Number(el.dataset.i)];
      showTip(`<div class="th">${esc(s.label)}</div><div class="tr"><span>Importe</span><span>${esc(fmt(s.value))}</span></div><div class="tr"><span>Participación</span><span>${((Math.abs(s.value) / total) * 100).toFixed(1)}%</span></div>`, e);
    });
    el.addEventListener('mouseleave', hideTip);
  });
}

/** Envuelve un gráfico en una tarjeta con su tabla gemela (accesibilidad). */
export function chartCard({ title, hint, render, tableRows, tableHead }) {
  const id = 'c' + Math.random().toString(36).slice(2, 9);
  const html = `
    <div class="card" id="${id}">
      <div class="card-head">
        <h3>${esc(title)}</h3>
        ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
        <span style="flex:1"></span>
        <button class="btn ghost sm" data-toggle="${id}">Ver tabla</button>
      </div>
      <div class="chart-wrap" data-chart="${id}"></div>
      <div class="table-wrap" data-table="${id}" hidden>
        <table><thead><tr>${(tableHead || []).map((h, i) => `<th class="no-sort ${i ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${(tableRows || []).map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>
    </div>`;
  return {
    html,
    mount(root) {
      const card = root.querySelector('#' + id);
      if (!card) return;
      const chartBox = card.querySelector(`[data-chart="${id}"]`);
      render(chartBox);
      card.querySelector(`[data-toggle="${id}"]`).addEventListener('click', (e) => {
        const tbl = card.querySelector(`[data-table="${id}"]`);
        const showing = !tbl.hidden;
        tbl.hidden = showing;
        chartBox.hidden = !showing;
        e.target.textContent = showing ? 'Ver tabla' : 'Ver gráfico';
        if (showing === false) render(chartBox);
      });
    },
  };
}
