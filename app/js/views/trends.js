import { sortableTable, openModal } from '../ui.js';
import { money, compact, num, pctStr, esc, isNum, dateLong } from '../format.js';
import { columnChart, chartCard, seriesColor } from '../charts.js';
import { thumb, openDetail } from './listings.js';
import { setPeriod } from '../app.js';

/**
 * EVOLUCIÓN — cómo viene cada publicación, agrupada por semana, quincena o mes.
 *
 * Por defecto muestra sólo las publicaciones ACTIVAS en Mercado Libre: son las
 * únicas sobre las que podés hacer algo hoy. Las pausadas y cerradas se pueden
 * incluir con el interruptor, y el panel dice cuánta facturación deja afuera.
 *
 * Los cortes son de calendario (semanas de lunes a domingo, quincenas del 1 al
 * 15 y del 16 a fin de mes, meses completos), así que coinciden con cómo mirás
 * el negocio y con lo que te factura Mercado Libre.
 */

const GROUPS = [
  { id: 'week', label: 'Cada 7 días' },
  { id: 'fortnight', label: 'Cada 15 días' },
  { id: 'month', label: 'Por mes' },
];

const METRICS = [
  { id: 'units', label: 'Unidades', fmt: (v) => num(v), fmtShort: (v) => num(v), pick: (s) => s.quantity || 0 },
  { id: 'revenue', label: 'Facturación', fmt: (v) => money(v), fmtShort: (v) => compact(v), pick: (s) => s.grossRevenue || 0 },
  { id: 'net', label: 'Neto recibido', fmt: (v) => money(v), fmtShort: (v) => compact(v), pick: (s) => s.profit?.netReceived || 0 },
  { id: 'ads', label: 'Publicidad', fmt: (v) => money(v), fmtShort: (v) => compact(v), pick: (s) => s.profit?.advertising?.amount || 0 },
  { id: 'profit', label: 'Ganancia', fmt: (v) => money(v), fmtShort: (v) => compact(v), pick: (s) => s.profit?.profit || 0 },
];

// Cómo se nombra cada corte, con el género correcto.
const CUT = {
  month: { noun: 'mes', last: 'Último mes completo', vs: 'Contra el mes anterior', need: 'hace falta más de un mes completo', none: 'ningún mes entra entero en el período' },
  fortnight: { noun: 'quincena', last: 'Última quincena completa', vs: 'Contra la quincena anterior', need: 'hace falta más de una quincena completa', none: 'ninguna quincena entra entera en el período' },
  week: { noun: 'semana', last: 'Última semana completa', vs: 'Contra la semana anterior', need: 'hace falta más de una semana completa', none: 'ninguna semana entra entera en el período' },
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const d2 = (n) => String(n).padStart(2, '0');
const parse = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);

/** A qué corte pertenece una fecha, y cómo se llama ese corte. */
function bucketOf(iso, group) {
  const d = parse(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (group === 'month') {
    return { key: `${y}-${d2(m + 1)}`, label: `${MESES[m]} ${String(y).slice(2)}`, from: toIso(new Date(Date.UTC(y, m, 1, 12))), to: toIso(new Date(Date.UTC(y, m + 1, 0, 12))) };
  }
  if (group === 'fortnight') {
    const first = day <= 15;
    const from = new Date(Date.UTC(y, m, first ? 1 : 16, 12));
    const to = first ? new Date(Date.UTC(y, m, 15, 12)) : new Date(Date.UTC(y, m + 1, 0, 12));
    return { key: `${y}-${d2(m + 1)}-${first ? 'a' : 'b'}`, label: `${first ? '1–15' : `16–${to.getUTCDate()}`} ${MESES[m]}`, from: toIso(from), to: toIso(to) };
  }
  // Semana de lunes a domingo.
  const dow = (d.getUTCDay() + 6) % 7;
  const from = new Date(d.getTime() - dow * 86400000);
  const to = new Date(from.getTime() + 6 * 86400000);
  return { key: `w${toIso(from)}`, label: `${from.getUTCDate()}/${d2(from.getUTCMonth() + 1)}`, from: toIso(from), to: toIso(to) };
}

/** Todos los cortes del período, incluso los que no tuvieron ventas. */
function bucketsBetween(fromIso, toIso_, group) {
  const out = [];
  const seen = new Set();
  let cur = parse(fromIso);
  const end = parse(toIso_);
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    const b = bucketOf(toIso(cur), group);
    if (!seen.has(b.key)) {
      seen.add(b.key);
      out.push(b);
    }
    cur = new Date(parse(b.to).getTime() + 86400000);
  }
  return out;
}

export default function trends(root, state) {
  const d = state.data;
  const track = d.settings.trackCosts !== false;
  const metrics = METRICS.filter((m) => (m.id === 'profit' ? track : m.id === 'ads' ? d.totals.adsCoverage !== 'none' : true));

  let group = localStorage.getItem('trendsGroup') || 'month';
  if (!GROUPS.some((g) => g.id === group)) group = 'month';
  let metricId = localStorage.getItem('trendsMetric') || 'units';
  if (!metrics.some((m) => m.id === metricId)) metricId = 'units';
  let onlyActive = localStorage.getItem('trendsOnlyActive') !== 'no';
  let onlyMesadas = localStorage.getItem('trendsOnlyMesadas') === 'si';
  let query = '';

  const byId = new Map(d.listings.map((l) => [l.id, l]));
  // Publicaciones que son mesadas (la medida se lee del título). Sirve para
  // mirar TODA la pantalla con mesadas solamente, sin escribir nada.
  const mesadaIds = new Set(d.listings.filter((l) => mesadaOf(l.title)).map((l) => l.id));
  const activeIds = new Set(d.listings.filter((l) => l.status === 'active').map((l) => l.id));
  const pausedRevenue = d.sales.filter((s) => !activeIds.has(s.itemId)).reduce((a, s) => a + (s.grossRevenue || 0), 0);
  const pausedListings = new Set(d.sales.filter((s) => !activeIds.has(s.itemId)).map((s) => s.itemId)).size;

  const html = () => {
    const metric = metrics.find((m) => m.id === metricId);
    const buckets = bucketsBetween(d.period.from, d.period.to, group).map((b) => ({
      ...b,
      // Un corte es "completo" sólo si entra entero en el período elegido.
      // Los cortes cortados por las puntas (la semana en curso, el mes a medias)
      // se marcan y no se usan para comparar, porque no son comparables.
      complete: b.from >= d.period.from && b.to <= d.period.to,
    }));
    let sales = onlyActive ? d.sales.filter((s) => activeIds.has(s.itemId)) : d.sales;
    if (onlyMesadas) sales = sales.filter((s) => mesadaIds.has(s.itemId));

    // --- totales por corte ---
    const totals = new Map(buckets.map((b) => [b.key, 0]));
    const perListing = new Map();
    for (const s of sales) {
      const b = bucketOf(s.date, group);
      if (!totals.has(b.key)) continue;
      const v = metric.pick(s);
      totals.set(b.key, totals.get(b.key) + v);
      if (!perListing.has(s.itemId)) perListing.set(s.itemId, { id: s.itemId, cells: new Map(), total: 0, units: 0 });
      const row = perListing.get(s.itemId);
      row.cells.set(b.key, (row.cells.get(b.key) || 0) + v);
      row.total += v;
      row.units += s.quantity || 0;
    }

    const rows = [...perListing.values()]
      .map((r) => {
        const l = byId.get(r.id) || {};
        const series = buckets.map((b) => r.cells.get(b.key) || 0);
        const full = buckets.map((b, i) => (b.complete ? series[i] : null)).filter((v) => v !== null);
        const last = full[full.length - 1] ?? 0;
        const prev = full[full.length - 2] ?? 0;
        return {
          raw: l,
          id: r.id,
          title: l.title || r.id,
          sku: l.sku || '—',
          thumbnail: l.thumbnail || null,
          status: l.status || null,
          price: l.price ?? null,
          stock: l.stock ?? null,
          series,
          total: Math.round(r.total * 100) / 100,
          units: r.units,
          last,
          delta: full.length < 2 ? undefined : prev > 0 ? ((last - prev) / prev) * 100 : last > 0 ? null : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    const maxCell = Math.max(1, ...rows.flatMap((r) => r.series));
    const grand = buckets.map((b) => totals.get(b.key) || 0);
    const sum = grand.reduce((a, v) => a + v, 0);
    const completeIdx = buckets.map((b, i) => (b.complete ? i : -1)).filter((i) => i >= 0);
    const ci = completeIdx.length;
    const lastComplete = ci ? { i: completeIdx[ci - 1], v: grand[completeIdx[ci - 1]] } : null;
    const prevComplete = ci >= 2 ? { i: completeIdx[ci - 2], v: grand[completeIdx[ci - 2]] } : null;
    const deltaTotal = lastComplete && prevComplete && prevComplete.v > 0 ? ((lastComplete.v - prevComplete.v) / prevComplete.v) * 100 : null;
    const best = rows[0];

    return { metric, buckets, rows, maxCell, grand, sum, deltaTotal, best, lastComplete, prevComplete };
  };

  root.innerHTML = `
    <div class="section">
      <div class="controls" style="margin-bottom:10px;align-items:center">
        <span class="note">Agrupar:</span>
        <div class="chips" id="g-chips">${GROUPS.map((g) => `<button class="chip ${g.id === group ? 'on' : ''}" data-g="${g.id}">${esc(g.label)}</button>`).join('')}</div>
        <span style="flex:1"></span>
        <span class="note">Ver:</span>
        <div class="chips" id="m-chips">${metrics.map((m) => `<button class="chip ${m.id === metricId ? 'on' : ''}" data-m="${m.id}">${esc(m.label)}</button>`).join('')}</div>
      </div>
      <div class="controls" style="margin-bottom:14px;align-items:center">
        <label class="note"><input type="checkbox" id="only-active" ${onlyActive ? 'checked' : ''}> sólo publicaciones activas en Mercado Libre</label>
        <label class="note" title="Deja en pantalla únicamente las publicaciones de mesada (la medida se lee del título)."><input type="checkbox" id="only-mesadas" ${onlyMesadas ? 'checked' : ''}> <b>sólo mesadas</b></label>
        <span class="note" id="paused-note"></span>
        <span style="flex:1"></span>
        <span class="note">Período rápido:</span>
        <button class="btn sm" data-range="3">3 meses</button>
        <button class="btn sm" data-range="6">6 meses</button>
        <button class="btn sm" data-range="12">12 meses</button>
      </div>
      <div id="top"></div>
    </div>

    <div class="section" id="mesadas"></div>

    <div class="section">
      <h2>Publicación por publicación <span class="hint" id="rows-hint"></span></h2>
      <div class="controls" style="margin-bottom:12px">
        <input type="search" id="q" placeholder="Buscar por título, SKU o ID…" style="min-width:260px;flex:1;max-width:420px">
      </div>
      <div id="grid"></div>
      <div class="note" style="margin-top:10px;line-height:1.6" id="grid-note">
        Cada fila es una publicación y cada columna un corte de tiempo. Cuanto más fuerte el color, más vendió en ese tramo.
        Tocá una fila para ver el detalle completo de esa publicación. La columna <b>Tendencia</b> compara el último corte completo con el anterior.
        <span id="partial-note"></span>
      </div>
    </div>`;

  const topEl = root.querySelector('#top');
  const gridEl = root.querySelector('#grid');

  function render() {
    const { metric, buckets, rows, maxCell, grand, sum, deltaTotal, best, lastComplete, prevComplete } = html();
    const cut = CUT[group];
    const partials = buckets.filter((b) => !b.complete).length;

    root.querySelector('#paused-note').textContent = onlyActive && pausedListings
      ? `Quedan afuera ${pausedListings} publicaciones pausadas o cerradas (${money(pausedRevenue)} de facturación).`
      : '';
    root.querySelector('#rows-hint').textContent = `${rows.length} publicaciones con ventas · ${buckets.length} cortes${onlyMesadas ? ' · sólo mesadas' : ''}`;

    // --- gráfico y resumen ---
    const card = chartCard({
      title: `${metric.label} por ${cut.noun}`,
      hint: `${dateLong(d.period.from)} al ${dateLong(d.period.to)}${onlyActive ? ' · sólo activas' : ''}${onlyMesadas ? ' · sólo mesadas' : ''}`,
      render: (el) =>
        columnChart(el, {
          data: buckets.map((b, i) => ({ label: b.label, value: grand[i] })),
          xKey: 'label',
          maxLabels: 14,
          color: seriesColor(0),
          fmt: metric.fmtShort,
          label: metric.label,
        }),
      tableHead: ['Corte', 'Desde', 'Hasta', metric.label, 'Completo'],
      tableRows: buckets.map((b, i) => [b.label, dateLong(b.from), dateLong(b.to), metric.fmt(grand[i]), b.complete ? 'sí' : 'parcial']),
    });
    topEl.innerHTML = `
      <div class="grid g-4" style="margin-bottom:14px">
        <div class="card stat"><div class="label">${esc(metric.label)} del período</div><div class="value sm">${metric.fmt(sum)}</div><div class="delta">${buckets.length} cortes</div></div>
        <div class="card stat"><div class="label">${esc(cut.last)}</div><div class="value sm">${lastComplete ? metric.fmt(lastComplete.v) : '—'}</div><div class="delta">${lastComplete ? esc(buckets[lastComplete.i].label) : esc(cut.none)}</div></div>
        <div class="card stat"><div class="label">${esc(cut.vs)}</div><div class="value sm ${isNum(deltaTotal) && deltaTotal < 0 ? 'neg' : isNum(deltaTotal) ? 'pos' : ''}">${isNum(deltaTotal) ? (deltaTotal >= 0 ? '▲ ' : '▼ ') + pctStr(Math.abs(deltaTotal)) : '—'}</div><div class="delta">${prevComplete ? 'vs ' + esc(buckets[prevComplete.i].label) : esc(cut.need)}</div></div>
        <div class="card stat"><div class="label">La que más aporta</div><div class="value sm" style="font-size:15px">${best ? esc(best.title.slice(0, 40)) : '—'}</div><div class="delta">${best ? metric.fmt(best.total) : ''}</div></div>
      </div>
      ${card.html}`;
    card.mount(topEl);

    // --- grilla por publicación ---
    const q = query.trim().toLowerCase();
    const shown = q ? rows.filter((r) => `${r.title} ${r.sku} ${r.id}`.toLowerCase().includes(q)) : rows;
    const cell = (v) => {
      const a = v > 0 ? 0.12 + (v / maxCell) * 0.55 : 0;
      return `<td class="num heat" style="${v > 0 ? `background:color-mix(in srgb, var(--s1) ${Math.round(a * 100)}%, transparent)` : ''}">${v ? metric.fmtShort(v) : '<span class="note">·</span>'}</td>`;
    };
    gridEl.innerHTML = `<div class="table-wrap"><table class="heatgrid">
      <thead><tr>
        <th class="no-sort sticky">Publicación</th>
        ${buckets.map((b) => `<th class="no-sort num ${b.complete ? '' : 'partial'}" title="${esc(dateLong(b.from))} al ${esc(dateLong(b.to))}${b.complete ? '' : ' — corte parcial: el período elegido no lo cubre entero'}">${esc(b.label)}${b.complete ? '' : ' *'}</th>`).join('')}
        <th class="no-sort num">Total</th>
        <th class="no-sort num">Tendencia</th>
      </tr></thead>
      <tbody>
        ${shown.length ? shown.map((r) => `<tr data-id="${esc(r.id)}" style="cursor:pointer">
          <td class="sticky"><div class="tit with-ph">${thumb(r)}<span class="txt"><span class="t">${esc(r.title)}</span><span class="s">${esc(r.sku)}${isNum(r.stock) ? ` · stock ${num(r.stock)}` : ''}</span></span></div></td>
          ${r.series.map(cell).join('')}
          <td class="num"><b>${metric.fmtShort(r.total)}</b></td>
          <td class="num">${trendCell(r.delta)}</td>
        </tr>`).join('')
        : `<tr><td colspan="${buckets.length + 3}"><div class="empty">Ninguna publicación con ventas en el período.</div></td></tr>`}
      </tbody>
      <tfoot><tr>
        <th class="sticky">Total</th>
        ${grand.map((v) => `<td class="num"><b>${metric.fmtShort(v)}</b></td>`).join('')}
        <td class="num"><b>${metric.fmtShort(sum)}</b></td><td></td>
      </tr></tfoot>
    </table></div>`;
    renderMesadas(root.querySelector('#mesadas'), { d, metric, onlyActive, activeIds, byId });

    const pn = root.querySelector('#partial-note');
    if (pn) pn.innerHTML = partials ? ` Las columnas con <b>*</b> son cortes parciales: el período elegido no los cubre enteros, así que no se usan para comparar.` : '';
    gridEl.querySelectorAll('tbody tr[data-id]').forEach((tr) =>
      tr.addEventListener('click', () => {
        const l = byId.get(tr.dataset.id);
        if (l) openDetail(l, state);
      })
    );
  }

  root.querySelectorAll('#g-chips .chip').forEach((c) =>
    c.addEventListener('click', () => {
      group = c.dataset.g;
      localStorage.setItem('trendsGroup', group);
      root.querySelectorAll('#g-chips .chip').forEach((x) => x.classList.toggle('on', x === c));
      render();
    })
  );
  root.querySelectorAll('#m-chips .chip').forEach((c) =>
    c.addEventListener('click', () => {
      metricId = c.dataset.m;
      localStorage.setItem('trendsMetric', metricId);
      root.querySelectorAll('#m-chips .chip').forEach((x) => x.classList.toggle('on', x === c));
      render();
    })
  );
  root.querySelector('#only-active').addEventListener('change', (e) => {
    onlyActive = e.target.checked;
    localStorage.setItem('trendsOnlyActive', onlyActive ? 'si' : 'no');
    render();
  });
  root.querySelector('#only-mesadas').addEventListener('change', (e) => {
    onlyMesadas = e.target.checked;
    localStorage.setItem('trendsOnlyMesadas', onlyMesadas ? 'si' : 'no');
    render();
  });
  root.querySelector('#q').addEventListener('input', (e) => {
    query = e.target.value;
    render();
  });
  root.querySelectorAll('[data-range]').forEach((b) =>
    b.addEventListener('click', () => {
      const n = Number(b.dataset.range);
      const today = new Date();
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (n - 1), 1, 12));
      setPeriod({ period: 'custom', from: toIso(from), to: toIso(today) });
    })
  );

  render();
}


/* ---------------- Mesadas por medida ----------------
 * La medida sale del título de la publicación, que es donde está: "Mesada 120cm",
 * "Mesada De 140 Cm", "Mesada ... 1,60 Mts". Antes de buscarla se descartan las
 * medidas de bacha (56x42x22), que si no se confundirían con el largo.
 * Se agrupan todas las mesadas de la misma medida, sean simples, dobles o ciegas.
 * Si el título no dice la medida, esa publicación NO se inventa: queda afuera y
 * el panel te dice cuántas quedaron sin leer.
 */
const DIMS = /\d+\s*[,.]?\d*\s*[x*]\s*\d+\s*[,.]?\d*\s*(?:[x*]\s*\d+\s*[,.]?\d*)?/g;
const normTitle = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

export function mesadaOf(title) {
  const s = normTitle(title);
  if (!s.includes('mesada')) return null;
  const t = s.replace(DIMS, ' '); // fuera las medidas de bacha
  const cands = [];
  for (const m of t.matchAll(/(\d{2,3})\s*(?:cms|cm)\b/g)) cands.push(Number(m[1]));
  for (const m of t.matchAll(/(\d[,.]\d{1,2})\s*(?:mts|mt|m)\b/g)) cands.push(Math.round(Number(m[1].replace(',', '.')) * 100));
  for (const m of t.matchAll(/\bde\s+(\d{2,3})\b(?!\s*%)/g)) cands.push(Number(m[1]));
  const ok = cands.filter((c) => c >= 40 && c <= 320);
  if (!ok.length) return null;
  const count = new Map();
  for (const c of ok) count.set(c, (count.get(c) || 0) + 1);
  const size = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const tipo = s.includes('doble')
    ? 'doble'
    : s.includes('ciega') || s.includes('sin bacha') || s.includes('sinbacha')
      ? 'ciega'
      : s.includes('simple')
        ? 'simple'
        : 'otra';
  return { size, tipo };
}

function trendCell(delta) {
  if (delta === undefined) return '<span class="note">—</span>';
  if (!isNum(delta)) return '<span class="badge">nueva</span>';
  if (Math.abs(delta) < 1) return '<span class="note">igual</span>';
  const up = delta > 0;
  return `<span class="${up ? 'pos' : 'neg'}" style="white-space:nowrap">${up ? '▲' : '▼'} ${pctStr(Math.abs(delta))}</span>`;
}


/** Gráfico final: cuánto vendiste de mesadas, agrupado por medida. */
function renderMesadas(box, { d, metric, onlyActive, activeIds, byId }) {
  const info = new Map(); // itemId -> {size, tipo}
  let sinMedida = 0;
  for (const l of d.listings) {
    if (onlyActive && l.status !== 'active') continue;
    const m = mesadaOf(l.title);
    if (m) info.set(l.id, m);
    else {
      // "Bacha sobre mesada 56x42x22" no es una mesada sin medida: es una bacha.
      const t = normTitle(l.title);
      if (t.includes('mesada') && !DIMS.test(t) && !/^bachas?\b/.test(t)) sinMedida++;
      DIMS.lastIndex = 0;
    }
  }

  const bySize = new Map();
  let totalUnits = 0;
  for (const s of d.sales) {
    const m = info.get(s.itemId);
    if (!m) continue;
    if (!bySize.has(m.size)) bySize.set(m.size, { size: m.size, value: 0, units: 0, revenue: 0, tipos: { simple: 0, doble: 0, ciega: 0, otra: 0 }, ids: new Set() });
    const row = bySize.get(m.size);
    row.value += metric.pick(s);
    row.units += s.quantity || 0;
    row.revenue += s.grossRevenue || 0;
    row.tipos[m.tipo] += s.quantity || 0;
    row.ids.add(s.itemId);
    totalUnits += s.quantity || 0;
  }
  const rows = [...bySize.values()].sort((a, b) => a.size - b.size);

  if (!rows.length) {
    box.innerHTML = `<h2>Mesadas por medida</h2>
      <div class="card card-pad note">No encontré ventas de mesadas en este período${onlyActive ? ' entre las publicaciones activas' : ''}.</div>`;
    return;
  }

  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  const extraCol = metric.id !== 'units' && metric.id !== 'revenue'; // no repetir columnas
  const top = [...rows].sort((a, b) => b.value - a.value)[0];
  const card = chartCard({
    title: `Mesadas: ${metric.label.toLowerCase()} por medida`,
    hint: `${dateLong(d.period.from)} al ${dateLong(d.period.to)}${onlyActive ? ' · sólo activas' : ''}`,
    render: (el) =>
      columnChart(el, {
        data: rows.map((r) => ({ label: `${r.size} cm`, value: r.value })),
        xKey: 'label',
        maxLabels: 20,
        color: seriesColor(2),
        fmt: metric.fmtShort,
        label: metric.label,
      }),
    tableHead: ['Medida', 'Unidades', 'Facturación', 'Publicaciones'],
    tableRows: rows.map((r) => [`${r.size} cm`, num(r.units), money(r.revenue), num(r.ids.size)]),
  });

  box.innerHTML = `
    <h2>Mesadas por medida <span class="hint">todas juntas: simples, dobles y ciegas</span></h2>
    <div class="grid g-4" style="margin-bottom:14px">
      <div class="card stat"><div class="label">Mesadas vendidas</div><div class="value sm">${num(totalUnits)} u</div><div class="delta">${rows.length} medidas distintas</div></div>
      <div class="card stat"><div class="label">${metric.id === 'units' ? 'Facturación en mesadas' : esc(metric.label) + ' en mesadas'}</div><div class="value sm">${metric.id === 'units' ? money(rows.reduce((a, r) => a + r.revenue, 0)) : metric.fmt(totalValue)}</div><div class="delta">${pctStr(pctOfTotal(totalUnits, d))} de las unidades que vendiste</div></div>
      <div class="card stat"><div class="label">La medida que más vende</div><div class="value sm">${top.size} cm</div><div class="delta">${metric.fmt(top.value)} · ${num(top.units)} u</div></div>
      <div class="card stat"><div class="label">Medidas sin leer</div><div class="value sm">${num(sinMedida)}</div><div class="delta">${sinMedida ? 'publicaciones con "mesada" en el título sin medida clara' : 'todas las mesadas quedaron clasificadas'}</div></div>
    </div>
    ${card.html}
    <div class="card" style="margin-top:14px"><div class="table-wrap"><table>
      <thead><tr>
        <th class="no-sort">Medida</th>${extraCol ? `<th class="no-sort num">${esc(metric.label)}</th>` : ''}<th class="no-sort num">Unidades</th>
        <th class="no-sort num">Facturación</th><th class="no-sort num">Precio promedio</th>
        <th class="no-sort num">Simples</th><th class="no-sort num">Dobles</th><th class="no-sort num">Ciegas</th><th class="no-sort num">Otras</th>
        <th class="no-sort num">Publicaciones</th>
      </tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><b>${r.size} cm</b></td>
        ${extraCol ? `<td class="num">${metric.fmt(r.value)}</td>` : ''}
        <td class="num">${num(r.units)}</td>
        <td class="num">${money(r.revenue)}</td>
        <td class="num">${money(r.units ? r.revenue / r.units : null)}</td>
        <td class="num">${r.tipos.simple || '<span class="note">·</span>'}</td>
        <td class="num">${r.tipos.doble || '<span class="note">·</span>'}</td>
        <td class="num">${r.tipos.ciega || '<span class="note">·</span>'}</td>
        <td class="num">${r.tipos.otra || '<span class="note">·</span>'}</td>
        <td class="num">${num(r.ids.size)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><th>Total</th>${extraCol ? `<td class="num"><b>${metric.fmt(totalValue)}</b></td>` : ''}<td class="num"><b>${num(totalUnits)}</b></td>
        <td class="num"><b>${money(rows.reduce((a, r) => a + r.revenue, 0))}</b></td><td colspan="6"></td></tr></tfoot>
    </table></div></div>
    <div class="note" style="margin-top:10px;line-height:1.6">
      La medida sale del título de la publicación ("Mesada 120cm", "Mesada de 140 Cm", "1,60 mts"). Antes de leerla se descartan las medidas de bacha (56x42x22), para no confundirlas con el largo.
      ${sinMedida ? `Hay <b>${num(sinMedida)}</b> publicaciones con la palabra "mesada" en el título donde no pude leer una medida: no se inventan, quedan afuera de este cuadro.` : ''}
    </div>`;
  card.mount(box);
}

function pctOfTotal(units, d) {
  const all = d.sales.reduce((a, s) => a + (s.quantity || 0), 0);
  return all ? (units / all) * 100 : null;
}
