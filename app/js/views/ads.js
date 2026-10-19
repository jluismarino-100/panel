import { stat, sortableTable, openModal, breakdownRows, banner } from '../ui.js';
import { money, compact, num, pctStr, esc, isNum, dateLong } from '../format.js';
import { columnChart, lineChart, chartCard, seriesColor } from '../charts.js';
import { thumb } from './listings.js';
import { setPeriod } from '../app.js';

/**
 * PUBLICIDAD — cuánto te cuesta realmente vender con Product Ads.
 * Sólo lee: el panel nunca modifica campañas ni anuncios.
 */

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'spend', label: 'Más inversión', sort: { key: 'allocatedSort', dir: 'desc' } },
  { id: 'per_unit', label: 'Más cara por unidad', sort: { key: 'perUnit', dir: 'desc' }, f: (r) => isNum(r.perUnit) },
  { id: 'losing', label: 'Pierden plata por anuncio', f: (r) => r.verdict === 'pierde' },
  { id: 'no_sales', label: 'Gastan sin vender', f: (r) => r.verdict === 'sin_ventas' || r.verdict === 'pocos_dias' },
  { id: 'good', label: 'Rinden bien', f: (r) => r.verdict === 'bien' },
];

const VERDICT = {
  sin_ventas: { label: 'Gasta sin vender', cls: 'bad', why: 'El anuncio gastó en el período y la publicación no vendió ninguna unidad.' },
  pierde: { label: 'Pierde plata por anuncio', cls: 'bad', why: 'El ACOS (lo que gasta el anuncio por cada $100 que vende) es mayor que lo que te queda de cada venta después de comisión y envío.' },
  cara: { label: 'Cara', cls: 'warn', why: 'La publicidad por unidad supera el límite que pusiste en Configuración (% del precio).' },
  bien: { label: 'Rinde bien', cls: 'good', why: 'El ACOS es menos de la mitad de lo que te queda de cada venta.' },
  ok: { label: 'Aceptable', cls: '', why: 'Gasta menos de lo que te deja cada venta, pero con poco margen de sobra.' },
  pocos_dias: { label: 'Sin ventas estos días', cls: '', why: 'Con menos de una semana de datos es normal que un anuncio no haya vendido: todavía no alcanza para juzgarlo.' },
  sin_datos: { label: 'Esperando a Mercado Ads', cls: '', why: 'Mercado Ads todavía no informó las ventas que trajo el anuncio en estos días.' },
};

const isoDay = (d, n = 0) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export default function ads(root, state) {
  const d = state.data;
  const a = d.ads || { available: false, reason: 'Sin datos de publicidad.' };
  const maxPct = d.settings.alertThresholds?.maxAdsPctOfPrice ?? 10;

  if (!a.available) {
    root.innerHTML = notAvailable(a, d);
    root.querySelector('#see-range')?.addEventListener('click', () =>
      setPeriod({ period: 'custom', from: a.reportRange.from, to: a.reportRange.to })
    );
    return;
  }

  const r = a.reported; // tal cual Mercado Ads
  const cov = a.coverage;
  const vatNote = a.vatFactor ? `Mercado Ads informa ${money(r.cost)} sin IVA; con el ${pctStr(a.vatFactor * 100)} de IVA pagás ${money(a.spendPaid)}.` : 'Configuraste que la inversión que informa Mercado Ads ya incluye IVA.';
  const srcLabel = a.source === 'import' ? 'reporte que importaste' : a.source === 'mock' ? 'datos de ejemplo' : 'Mercado Ads (API)';
  const adsAlerts = d.alerts.filter((x) => String(x.type).startsWith('publicidad'));

  const shortRange = (a.days || 0) < 7;
  const rows = (a.perProduct || []).map((p) => {
    const verdict = p.spendWithoutSales
      ? shortRange ? 'pocos_dias' : 'sin_ventas'
      : a.allIncomplete
        ? 'sin_datos'
        : isNum(p.acos) && isNum(p.keepPctBeforeAds) && p.metrics?.adUnits > 0 && p.acos > p.keepPctBeforeAds
        ? 'pierde'
        : isNum(p.pctOfPrice) && p.pctOfPrice >= maxPct
          ? 'cara'
          : isNum(p.acos) && isNum(p.keepPctBeforeAds) && p.acos <= p.keepPctBeforeAds / 2
            ? 'bien'
            : 'ok';
    return {
      raw: p,
      id: p.id,
      title: p.title,
      sku: p.sku || '—',
      thumbnail: p.thumbnail,
      allocated: p.allocated,
      allocatedSort: p.spendWithoutSales ? p.costPaid : p.allocated,
      clicks: p.metrics?.clicks ?? null,
      cpc: p.metrics?.cpc ?? null,
      adUnits: p.metrics?.adUnits ?? null,
      organicUnits: p.metrics?.organicUnits ?? null,
      units: p.unitsCovered ?? 0,
      perUnit: p.perUnit,
      pctOfPrice: p.pctOfPrice,
      acos: p.acos,
      tacos: p.tacos,
      keepBefore: p.keepPctBeforeAds,
      keepAfter: p.keepPctAfterAds,
      status: p.status,
      stock: p.stock,
      price: p.price,
      prints: p.metrics?.prints ?? null,
      costPaid: p.costPaid,
      verdict,
    };
  });
  const count = (v) => rows.filter((x) => x.verdict === v).length;

  const lcd = a.lastCompleteDay;
  const lagBanner = a.incompleteFrom
    ? `<div class="banner mock"><div><b>${a.allIncomplete ? 'Mercado Ads todavía no cerró los números de estos días' : 'Los últimos días todavía no están completos'}</b>
        <div>Mercado Ads informa el <b>gasto</b> en el momento, pero las <b>ventas que trajo el anuncio</b> las cierra a las 10 de la mañana del día siguiente.
        ${a.allIncomplete ? 'Por eso acá el ACOS y el ROAS aparecen vacíos y parece que ningún anuncio vendió.' : `Desde el ${dateLong(a.incompleteFrom)} el ACOS y el ROAS pueden salir peor de lo que son.`}
        <div style="margin-top:8px"><button class="btn primary sm" id="last30ok">Ver los últimos 30 días completos (hasta el ${dateLong(lcd)})</button></div></div></div></div>`
    : '';
  const shortBanner = shortRange && !a.allIncomplete
    ? banner('', 'Período corto', `Estás mirando ${a.days} día(s). Con menos de una semana es normal que muchos anuncios no hayan vendido todavía: para decidir, mirá 30 días.`)
    : '';
  const noAdSales = a.allIncomplete || !(r.totalAmount > 0);

  root.innerHTML = `
    ${lagBanner}
    ${shortBanner}
    ${a.note ? banner('', 'Rango de la publicidad', esc(a.note)) : ''}
    ${!a.reconciles ? banner('err', 'Revisar', 'Lo prorrateado más lo no asignado no coincide con el total informado. Avisame: es un error de cálculo.') : ''}

    <div class="section">
      <div class="card card-pad" style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-end">
        <div style="min-width:0">
          <div style="font-size:12.5px;color:var(--ink-2)">Cuánto te cuesta la publicidad por cada unidad que vendés</div>
          <div class="hero">${money(a.perUnitSold)}</div>
          <div class="note">del ${dateLong(cov.from)} al ${dateLong(cov.to)} · fuente: ${esc(srcLabel)}</div>
        </div>
        <div style="flex:1;min-width:240px;display:flex;gap:26px;flex-wrap:wrap">
          <div><div class="note">Por venta (orden)</div><div style="font-size:20px;font-weight:600">${money(a.perOrder)}</div></div>
          <div><div class="note">De toda tu facturación</div><div style="font-size:20px;font-weight:600">${pctStr(a.tacos)}</div></div>
          <div><div class="note">Por venta que trajo el anuncio</div><div style="font-size:20px;font-weight:600">${money(a.perAdSale)}</div></div>
        </div>
      </div>
      <div class="note" style="margin-top:8px;line-height:1.6">
        Gastaste <b>${money(a.spendPaid)}</b> en publicidad y en esas fechas vendiste <b>${num(a.salesInCoverage.units)} unidades</b> (${num(a.salesInCoverage.orders)} ventas), con y sin clic en un anuncio:
        <b>${money(a.spendPaid)} ÷ ${num(a.salesInCoverage.units)} = ${money(a.perUnitSold)}</b> por unidad. ${esc(vatNote)}
      </div>
    </div>

    <div class="section">
      <div class="grid g-4">
        ${stat({ label: 'Inversión en publicidad', value: compact(a.spendPaid), hint: a.vatFactor ? `${compact(r.cost)} + IVA` : 'con IVA incluido', tooltip: vatNote })}
        ${stat({ label: 'Ventas que trajo el anuncio', value: compact(r.totalAmount), hint: `${num(r.adUnits)} unidades · ${pctStr(a.shareOfSalesFromAds)} de lo que facturaste` })}
        ${stat({ label: 'ACOS (Mercado Ads)', value: noAdSales ? '—' : pctStr(r.acos), hint: a.allIncomplete ? 'Mercado Ads todavía no informó las ventas' : noAdSales ? 'el anuncio no trajo ventas en estos días' : `gasta $${Math.round(r.acos)} por cada $100 que vende el anuncio`, tooltip: 'Inversión ÷ ventas atribuidas al anuncio (directas + indirectas). Es el número que muestra Mercado Ads.' })}
        ${stat({ label: 'ROAS', value: noAdSales ? '—' : `${r.roas.toLocaleString('es-AR', { maximumFractionDigits: 1 })}x`, hint: a.allIncomplete ? 'Mercado Ads todavía no informó las ventas' : 'ventas por cada $1 invertido' })}
        ${stat({ label: 'Te queda después de publicidad', value: compact(a.netAfterAllAds), hint: `${pctStr(pctOf(a.netAfterAllAds, a.salesInCoverage.grossRevenue))} de lo facturado`, tooltip: 'Lo que Mercado Libre te depositó por las ventas del rango, menos TODA la publicidad (incluida la que no vendió).' })}
        ${stat({ label: 'Gasto sin ventas', value: compact(a.unallocatedPaid), hint: `${a.unallocated.length} anuncio(s) que no vendieron${shortRange ? ' en estos pocos días' : ''}`, tooltip: 'Publicidad que no se puede cargar a ninguna venta porque ese producto no vendió en el período. Igual la pagaste.' })}
        ${stat({ label: 'Clics', value: num(r.clicks), hint: `a ${money(r.cpc)} cada uno · ${pctStr(r.ctr)} de las veces que se vio` })}
        ${stat({ label: 'Publicaciones con gasto', value: num(a.listingsWithSpend ?? a.advertisedListings), hint: `con clics o gasto en el período · ${count('pierde')} pierden plata`, tooltip: 'Publicaciones cuyo anuncio tuvo gasto o clics en estas fechas. Las que están en una campaña pero no gastaron nada no se cuentan.' })}
      </div>
    </div>

    <div class="section">
      <h2>Del depósito de Mercado Libre a lo que te queda</h2>
      <div class="card card-pad" style="max-width:720px">
        ${breakdownRows([
          { label: `Facturación de las ventas del ${dateLong(cov.from)} al ${dateLong(cov.to)}`, value: money(a.salesInCoverage.grossRevenue) },
          { label: 'Comisión, envío, cuotas y otros cargos', value: '− ' + money(a.salesInCoverage.grossRevenue - a.salesInCoverage.netReceived), neg: true },
          { label: 'Dinero neto recibido (lo que deposita ML)', value: money(a.salesInCoverage.netReceived), total: true },
          { label: 'Publicidad cargada a esas ventas', value: '− ' + money(a.allocatedPaid), neg: true },
          { label: 'Publicidad que no vendió nada', value: '− ' + money(a.unallocatedPaid), neg: true },
          { label: 'Te queda después de publicidad', value: money(a.netAfterAllAds), total: true },
        ])}
        <div class="note" style="margin-top:10px">La publicidad <b>no</b> se descuenta del depósito de cada venta: Mercado Libre la cobra aparte. Por eso el "dinero neto recibido" sigue siendo lo que te deposita, y la publicidad se resta después.${d.settings.trackCosts ? ' La ganancia ya la incluye.' : ''}</div>
      </div>
    </div>

    ${a.daily?.length ? `<div class="section"><h2>Día por día</h2><div class="grid g-2" id="daily"></div></div>` : ''}

    ${sinVenderBlock(rows, shortRange)}

    <div class="section">
      <h2>Por publicación <span class="hint">tocá una fila para ver el detalle</span></h2>
      <div class="controls" style="margin-bottom:12px">
        <input type="search" id="q" placeholder="Buscar por título, SKU o ID…" style="min-width:260px;flex:1;max-width:420px">
      </div>
      <div class="chips" id="chips" style="margin-bottom:14px">
        ${FILTERS.map((f) => `<button class="chip ${f.id === 'all' ? 'on' : ''}" data-f="${f.id}">${esc(f.label)}</button>`).join('')}
      </div>
      <div id="tbl"></div>
      <div class="note" style="margin-top:10px;line-height:1.6">
        <b>Publicidad por unidad</b>: lo que se le cargó a esta publicación ÷ las unidades que vendió (con y sin anuncio).
        <b>ACOS</b>: lo que dice Mercado Ads (gasto ÷ ventas del anuncio).
        <b>Te queda</b>: de cada $100 facturados, cuánto te deposita ML antes → después de la publicidad.
      </div>
    </div>

    ${a.unallocated.length ? `<div class="section">
      <h2>Publicidad que no se pudo cargar a ninguna venta <span class="hint">${money(a.unallocatedPaid)} en total</span></h2>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th class="no-sort">Anuncio</th><th class="no-sort num">Inversión</th><th class="no-sort num">Clics</th><th class="no-sort">Motivo</th></tr></thead>
        <tbody>${a.unallocated.map((u) => `<tr><td>${esc(u.title)}<div class="note">${esc(u.listingIds?.[0] || u.externalId || '')}</div></td><td class="num">${money(u.costPaid)}</td><td class="num">${num(u.clicks)}</td><td class="note">${esc(u.reason)}</td></tr>`).join('')}</tbody>
      </table></div></div>
    </div>` : ''}

    ${a.campaigns?.length ? `<div class="section">
      <h2>Campañas</h2>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th class="no-sort">Campaña</th><th class="no-sort">Estado</th><th class="no-sort">Estrategia</th><th class="no-sort num">Presupuesto</th><th class="no-sort num">ROAS objetivo</th><th class="no-sort num">Inversión</th><th class="no-sort num">Ventas del anuncio</th><th class="no-sort num">ACOS</th><th class="no-sort num">ROAS real</th></tr></thead>
        <tbody>${a.campaigns.map((c) => `<tr>
          <td>${esc(c.name || c.id)}</td>
          <td><span class="badge ${c.status === 'active' ? 'good' : ''}">${c.status === 'active' ? 'Activa' : c.status === 'paused' ? 'Pausada' : esc(c.status || '—')}</span></td>
          <td>${esc(strategyLabel(c.strategy))}</td>
          <td class="num">${money(c.budget)}</td>
          <td class="num">${isNum(c.roasTarget) ? c.roasTarget + 'x' : isNum(c.acosTarget) ? 'ACOS ' + pctStr(c.acosTarget) : '—'}</td>
          <td class="num">${money(c.metrics.cost * (1 + (a.vatFactor || 0)))}</td>
          <td class="num">${money(c.metrics.totalAmount)}</td>
          <td class="num">${pctStr(c.metrics.acos)}</td>
          <td class="num">${isNum(c.metrics.roas) ? c.metrics.roas.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'x' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div></div>
      <div class="note" style="margin-top:8px">El presupuesto es el que informa Mercado Ads (promedio diario). La inversión está ${a.vatFactor ? 'con IVA sumado' : 'tal cual la informa Mercado Ads'}.</div>
    </div>` : ''}

    ${billingBlock(a)}

    ${adsAlerts.length ? `<div class="section">
      <h2>Qué revisar <span class="hint">${adsAlerts.length} aviso(s)</span></h2>
      <div class="card">${adsAlerts.slice(0, 8).map((x) => `<div class="alert"><span class="dot ${x.severity}"></span><div><div class="m">${esc(x.message)}</div><div class="a">${esc(x.action)}</div></div></div>`).join('')}
        ${adsAlerts.length > 8 ? '<div class="alert"><a href="#/alertas" style="font-size:12.5px">Ver todas en Alertas →</a></div>' : ''}
      </div>
      <div class="note" style="margin-top:8px">El panel no toca tus campañas. Cualquier cambio lo hacés vos en Mercado Libre → Publicidad.</div>
    </div>` : ''}

    <div class="section">
      <h2>Cómo se calcula</h2>
      <div class="card card-pad note" style="line-height:1.75">
        · Mercado Ads cobra por <b>clic</b>, no por venta. No existe "la publicidad de esta orden": existe lo que gastó cada anuncio en un rango de fechas.<br>
        · Para saber cuánto te cuesta por venta, el gasto de cada anuncio se reparte entre <b>todas</b> las unidades que vendió esa publicación en el rango (con y sin clic), porque el gasto se paga igual. Es lo que Mercado Libre llama TACOS.<br>
        · Si un anuncio gastó y su publicación no vendió nada, ese gasto <b>no se carga a otro producto</b>: queda en "gasto sin ventas", a la vista.<br>
        · Control: lo cargado a ventas + lo que no vendió = ${money(a.allocatedPaid)} + ${money(a.unallocatedPaid)} = <b>${money(a.allocatedPaid + a.unallocatedPaid)}</b>, igual a la inversión total ${a.reconciles ? '✓' : '✗'}.<br>
        · ${esc(vatNote)} Lo podés cambiar en Configuración.<br>
        · Mercado Ads guarda sólo los últimos 90 días y actualiza los números una vez por día (10 h), así que lo de hoy puede estar incompleto.
      </div>
    </div>`;

  root.querySelector('#last30ok')?.addEventListener('click', () => setPeriod({ period: 'custom', from: isoDay(lcd, -29), to: lcd }));

  // --- gráficos diarios ---
  if (a.daily?.length) {
    const days = fillDays(a.daily, cov);
    const box = root.querySelector('#daily');
    const cards = [
      chartCard({
        title: 'Inversión por día',
        hint: a.vatFactor ? 'con IVA' : '',
        render: (el) => columnChart(el, { data: days.map((x) => ({ date: x.date, value: x.cost * (1 + (a.vatFactor || 0)) })), color: seriesColor(1), fmt: (v) => compact(v), label: 'Inversión' }),
        tableHead: ['Día', 'Inversión', 'Clics'],
        tableRows: days.map((x) => [x.date, money(x.cost * (1 + (a.vatFactor || 0))), num(x.clicks)]),
      }),
      chartCard({
        title: 'Ventas que trajo el anuncio por día',
        hint: 'según Mercado Ads',
        render: (el) => lineChart(el, { data: days.map((x) => ({ date: x.date, value: x.totalAmount })), color: seriesColor(0), fmt: (v) => compact(v), label: 'Ventas del anuncio' }),
        tableHead: ['Día', 'Ventas del anuncio', 'ACOS'],
        tableRows: days.map((x) => [x.date, money(x.totalAmount), pctStr(x.acos)]),
      }),
    ];
    box.innerHTML = cards.map((c) => c.html).join('');
    cards.forEach((c) => c.mount(box));
  }

  // --- tabla por publicación ---
  const columns = [
    { key: 'title', label: 'Publicación', render: (x) => `<div class="tit with-ph">${thumb(x)}<span class="txt"><span class="t">${esc(x.title)}</span><span class="s">${esc(x.sku)} · ${esc(x.id)}${x.raw.shared ? ' · anuncio compartido' : ''}</span></span></div>` },
    { key: 'allocatedSort', label: 'Publicidad', num: true, render: (x) => (x.verdict === 'sin_ventas' ? `<span class="neg">${money(x.raw.costPaid)}</span>` : money(x.allocated)) },
    { key: 'clicks', label: 'Clics', num: true, render: (x) => num(x.clicks) },
    { key: 'cpc', label: 'Costo x clic', num: true, render: (x) => money(x.cpc) },
    { key: 'adUnits', label: 'U. por anuncio', num: true, render: (x) => num(x.adUnits) },
    { key: 'units', label: 'U. vendidas', num: true, render: (x) => num(x.units) },
    { key: 'perUnit', label: 'Public. por unidad', num: true, render: (x) => (isNum(x.perUnit) ? `<b>${money(x.perUnit)}</b>` : '—') },
    { key: 'pctOfPrice', label: '% del precio', num: true, render: (x) => (isNum(x.pctOfPrice) ? `<span class="${x.pctOfPrice >= maxPct ? 'neg' : ''}">${pctStr(x.pctOfPrice)}</span>` : '—') },
    { key: 'acos', label: 'ACOS', num: true, render: (x) => pctStr(x.acos) },
    { key: 'tacos', label: 'TACOS', num: true, render: (x) => pctStr(x.tacos) },
    { key: 'keepAfter', label: 'Te queda', num: true, render: (x) => (isNum(x.keepBefore) ? `<span class="note">${pctStr(x.keepBefore)} →</span> <b>${pctStr(x.keepAfter)}</b>` : '—') },
    { key: 'verdict', label: 'Veredicto', render: (x) => `<span class="badge ${VERDICT[x.verdict].cls}" title="${esc(VERDICT[x.verdict].why)}">${esc(VERDICT[x.verdict].label)}</span>` },
  ];
  let activeFilter = 'all';
  let query = '';
  const tbl = root.querySelector('#tbl');
  function apply() {
    const f = FILTERS.find((x) => x.id === activeFilter);
    let out = rows;
    if (f?.f) out = out.filter(f.f);
    if (query) {
      const q = query.toLowerCase();
      out = out.filter((x) => `${x.title} ${x.sku} ${x.id}`.toLowerCase().includes(q));
    }
    sortableTable(tbl, {
      columns,
      rows: out,
      initialSort: f?.sort || { key: 'allocatedSort', dir: 'desc' },
      rowId: (x) => x.id,
      emptyText: 'Ninguna publicación con anuncio coincide.',
      onRowClick: (x) => openAdDetail(x, a, maxPct),
    });
  }
  root.querySelector('#q').addEventListener('input', (e) => {
    query = e.target.value;
    apply();
  });
  root.querySelectorAll('#chips .chip').forEach((c) =>
    c.addEventListener('click', () => {
      activeFilter = c.dataset.f;
      root.querySelectorAll('#chips .chip').forEach((x) => x.classList.toggle('on', x === c));
      apply();
    })
  );
  apply();
}

/* ---------------- Gastando sin vender ----------------
 * Junta los anuncios que gastaron en el período y no vendieron NADA, y los
 * separa por el motivo, porque cada caso se arregla distinto:
 *   1. La publicación no puede vender (pausada o sin stock) → pausar el anuncio ya.
 *   2. Paga clics y no convierte → el problema está en la publicación: precio, fotos, ficha.
 *   3. Gasta sin clics → el anuncio casi no se muestra o no llama: puja o segmentación.
 * El importe que se muestra es lo que PAGÁS (con IVA si corresponde).
 */
function sinVenderBlock(rows, shortRange) {
  const malos = rows.filter((x) => x.verdict === 'sin_ventas' || x.verdict === 'pocos_dias');
  if (!malos.length) {
    return `<div class="section"><h2>Gastando sin vender</h2>
      <div class="card card-pad note">Ningún anuncio gastó sin vender en este período. Bien ahí.</div></div>`;
  }
  const gasto = (x) => x.costPaid || 0;
  const total = malos.reduce((t, x) => t + gasto(x), 0);

  const trabada = (x) => x.status !== 'active' || x.stock === 0;
  const grupos = [
    {
      id: 'trabada',
      titulo: 'La publicación no puede vender',
      detalle: 'Está pausada o sin stock, pero el anuncio sigue gastando. Es plata tirada: pausá el anuncio.',
      cls: 'bad',
      items: malos.filter((x) => trabada(x)),
    },
    {
      id: 'no_convierte',
      titulo: 'Paga clics y no convierte',
      detalle: 'La gente entra pero no compra. El anuncio funciona; el problema está en la publicación: precio, fotos, descripción o envío.',
      cls: 'bad',
      items: malos.filter((x) => !trabada(x) && (x.clicks || 0) > 0),
    },
    {
      id: 'sin_clics',
      titulo: 'Gasta sin clics',
      detalle: 'Se muestra pero nadie entra. Suele ser puja baja, mala segmentación o una miniatura que no llama.',
      cls: 'warn',
      items: malos.filter((x) => !trabada(x) && !(x.clicks || 0)),
    },
  ].filter((g) => g.items.length);

  const fila = (x) => `
    <tr>
      <td><div class="tit with-ph">${thumb(x)}<span class="txt"><span class="t">${esc(x.title)}</span>
        <span class="s">${esc(x.sku)} · ${esc(x.id)}${x.status !== 'active' ? ` · <b>${esc(x.status === 'paused' ? 'pausada' : x.status)}</b>` : ''}${x.stock === 0 ? ' · <b>sin stock</b>' : ''}</span></span></div></td>
      <td class="num"><b class="neg">${money(gasto(x))}</b></td>
      <td class="num">${isNum(x.prints) ? num(x.prints) : '—'}</td>
      <td class="num">${isNum(x.clicks) ? num(x.clicks) : '—'}</td>
      <td class="num">${isNum(x.cpc) ? money(x.cpc) : '—'}</td>
      <td class="num">${isNum(x.price) ? money(x.price) : '—'}</td>
      <td class="num">${isNum(x.stock) ? num(x.stock) : '—'}</td>
    </tr>`;

  return `<div class="section">
    <h2>Gastando sin vender <span class="hint">${num(malos.length)} anuncio(s) · ${money(total)} en el período</span></h2>
    ${shortRange ? `<div class="banner"><div><b>Ojo con el período corto</b><div>Con pocos días es normal que un anuncio todavía no haya vendido. Para decidir si lo pausás, mirá 30 días.</div></div></div>` : ''}
    ${grupos.map((g) => {
      const t = g.items.reduce((s2, x) => s2 + gasto(x), 0);
      return `<div class="card" style="margin-bottom:14px">
        <div class="card-pad" style="padding-bottom:6px">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span class="badge ${g.cls}">${esc(g.titulo)}</span>
            <b>${money(t)}</b>
            <span class="note">${num(g.items.length)} anuncio(s) · ${pctStr(total ? (t / total) * 100 : 0)} de lo que se gasta sin vender</span>
          </div>
          <div class="note" style="margin-top:6px">${esc(g.detalle)}</div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th class="no-sort">Publicación</th><th class="no-sort num">Gastó</th><th class="no-sort num">Impresiones</th>
            <th class="no-sort num">Clics</th><th class="no-sort num">Costo por clic</th><th class="no-sort num">Precio</th><th class="no-sort num">Stock</th></tr></thead>
          <tbody>${g.items.sort((p1, p2) => gasto(p2) - gasto(p1)).map(fila).join('')}</tbody>
        </table></div>
      </div>`;
    }).join('')}
    <div class="note">El importe es lo que pagás por esos anuncios en el período elegido, no lo que se le cargó a las ventas (no hubo). Tocá cualquier publicación en la tabla de abajo para ver su detalle completo.</div>
  </div>`;
}

function openAdDetail(x, a, maxPct) {
  const p = x.raw;
  const m = p.metrics || {};
  const v = VERDICT[x.verdict];
  const body = `
    <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px">
      ${thumb(p, 80)}
      <div style="min-width:0">
        <div style="font-weight:600">${esc(p.title)}</div>
        <div class="note">${esc(p.sku || 'sin SKU')} · ${esc(p.id)}${p.campaignNames?.length ? ' · campaña ' + esc(p.campaignNames.join(', ')) : ''}</div>
        <div style="margin-top:6px"><span class="badge ${v.cls}">${esc(v.label)}</span> <span class="note">${esc(v.why)}</span></div>
      </div>
    </div>
    ${p.shared ? `<div class="banner" style="margin-bottom:12px"><div><b>Anuncio compartido</b><div>Mercado Ads agrupa este anuncio con otras publicaciones (variantes o catálogo). Las métricas de abajo son del grupo entero; el gasto se repartió según lo que vendió cada una.</div></div></div>` : ''}
    <div class="grid g-2">
      <div>
        <h4 style="margin:0 0 8px;font-size:13px">Lo que informa Mercado Ads</h4>
        <dl class="kv">
          <dt>Inversión del anuncio</dt><dd>${money(m.cost)}${a.vatFactor ? ' + IVA' : ''}</dd>
          <dt>Veces que se mostró</dt><dd>${num(m.prints)}</dd>
          <dt>Clics</dt><dd>${num(m.clicks)} (${pctStr(m.ctr)})</dd>
          <dt>Costo por clic</dt><dd>${money(m.cpc)}</dd>
          <dt>Ventas directas</dt><dd>${num(m.directUnits)} u · ${money(m.directAmount)}</dd>
          <dt>Ventas indirectas</dt><dd>${num(m.indirectUnits)} u · ${money(m.indirectAmount)}</dd>
          <dt>Ventas sin anuncio</dt><dd>${num(m.organicUnits)} u · ${money(m.organicAmount)}</dd>
          <dt>ACOS</dt><dd>${pctStr(m.acos)}</dd>
          <dt>ROAS</dt><dd>${isNum(m.roas) ? m.roas.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'x' : '—'}</dd>
        </dl>
        <div class="note" style="margin-top:8px">Indirecta: alguien hizo clic en este anuncio y terminó comprando otro producto tuyo.</div>
      </div>
      <div>
        <h4 style="margin:0 0 8px;font-size:13px">Lo que te cuesta a vos</h4>
        <dl class="kv">
          <dt>Publicidad cargada a sus ventas</dt><dd><b>${money(p.allocated)}</b></dd>
          <dt>Unidades vendidas (con y sin anuncio)</dt><dd>${num(p.unitsCovered)}</dd>
          <dt>Publicidad por unidad</dt><dd><b>${money(p.perUnit)}</b></dd>
          <dt>Precio actual</dt><dd>${money(p.price)}</dd>
          <dt>% del precio</dt><dd class="${isNum(p.pctOfPrice) && p.pctOfPrice >= maxPct ? 'neg' : ''}">${pctStr(p.pctOfPrice)}</dd>
          <dt>TACOS (sobre todo lo que facturó)</dt><dd>${pctStr(p.tacos)}</dd>
          <dt>Te queda antes de publicidad</dt><dd>${pctStr(p.keepPctBeforeAds)}</dd>
          <dt>Te queda después de publicidad</dt><dd><b>${pctStr(p.keepPctAfterAds)}</b></dd>
        </dl>
        ${p.perUnitNote ? `<div class="note" style="margin-top:8px">${esc(p.perUnitNote)}</div>` : ''}
      </div>
    </div>
    ${isNum(p.acos) && isNum(p.keepPctBeforeAds) ? `<div class="note" style="margin-top:14px;line-height:1.6">
      <b>Cómo leerlo:</b> de cada $100 que factura esta publicación, Mercado Libre te deposita $${Math.round(p.keepPctBeforeAds)}.
      De cada $100 que vende el anuncio, gasta $${Math.round(p.acos)} en clics.
      ${p.acos > p.keepPctBeforeAds
        ? '<b class="neg">El anuncio gasta más de lo que te deja cada venta que trae: con este ACOS, vender por publicidad te hace perder plata.</b>'
        : `Te sobran $${Math.round(p.keepPctBeforeAds - p.acos)} de cada $100 vendidos por anuncio para pagar el producto y ganar.`}
    </div>` : ''}`;
  openModal({ title: 'Publicidad de la publicación', body, wide: true });
}

function notAvailable(a, d) {
  const billing = billingBlock(a);
  const isImportRange = a.source === 'import' && a.reportRange;
  return `
    ${banner(a.code === 'ADS_SCOPE' ? 'err' : '', 'Todavía no puedo mostrarte la publicidad', esc(a.reason || 'Sin datos de publicidad.'))}
    ${a.help?.length ? `<div class="section"><h2>Cómo habilitarla</h2><div class="card card-pad"><ol style="margin:0;padding-left:20px;line-height:1.9">${a.help.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></div></div>` : ''}
    <div class="section">
      <h2>${isImportRange ? 'Ver el reporte importado' : 'Mientras tanto, podés importar el reporte'}</h2>
      <div class="card card-pad" style="line-height:1.8">
        ${isImportRange
          ? `Tu reporte cubre del <b>${dateLong(a.reportRange.from)}</b> al <b>${dateLong(a.reportRange.to)}</b>. <button class="btn primary sm" id="see-range" style="margin-left:6px">Ver ese período</button>`
          : `1. En Mercado Libre entrá a <b>Publicidad → Product Ads</b>.<br>
             2. Elegí el rango de fechas (por ejemplo, el último mes) y descargá el reporte <b>por anuncio</b> en Excel.<br>
             3. Abrilo, seleccioná todo (Ctrl+A), copiá (Ctrl+C) y pegalo en <a href="#/datos">Importar datos → Publicidad</a>, indicando las mismas fechas.`}
      </div>
    </div>
    ${billing}`;
}

function billingBlock(a) {
  const b = a.billing;
  const periods = Array.isArray(b) ? b : b?.periods || [];
  const withData = periods.filter((p) => p.available);
  if (!withData.length) return '';
  return `<div class="section">
    <h2>Lo que Mercado Libre te facturó por publicidad</h2>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th class="no-sort">Período de facturación</th><th class="no-sort">Estado</th><th class="no-sort num">Cargo por publicidad</th><th class="no-sort num">Bonificado</th></tr></thead>
      <tbody>${withData.map((p) => `<tr><td>${dateLong(p.from)} al ${dateLong(p.to)}</td><td>${p.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}</td><td class="num">${money(p.charged)}</td><td class="num">${p.refunded ? money(p.refunded) : '—'}</td></tr>`).join('')}</tbody>
    </table></div></div>
    <div class="note" style="margin-top:8px">Sirve para contrastar: los períodos de facturación no coinciden con el rango elegido arriba, así que los totales no tienen por qué ser iguales. Si en un mismo rango la factura da ~21% más que la inversión de Mercado Ads, confirma que el informe viene sin IVA.</div>
  </div>`;
}

function fillDays(daily, cov) {
  const by = new Map(daily.map((x) => [x.date, x]));
  const out = [];
  for (let t = new Date(`${cov.from}T12:00:00Z`); t <= new Date(`${cov.to}T12:00:00Z`); t = new Date(t.getTime() + 86400000)) {
    const k = t.toISOString().slice(0, 10);
    out.push(by.get(k) || { date: k, cost: 0, clicks: 0, totalAmount: 0, acos: null });
  }
  return out;
}

function strategyLabel(s) {
  return { PROFITABILITY: 'Rentabilidad', INCREASE: 'Crecimiento', VISIBILITY: 'Visibilidad' }[s] || s || '—';
}

function pctOf(a, b) {
  if (!isNum(a) || !isNum(b) || Number(b) === 0) return null;
  return (a / b) * 100;
}
