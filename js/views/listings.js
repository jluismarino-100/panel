import { sortableTable, openModal, breakdownRows } from '../ui.js';
import { money, num, pctStr, esc, isNum, marginBadge, sourceTag } from '../format.js';

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'top_units', label: 'Más vendidos', sort: { key: 'unitsSold', dir: 'desc' }, f: (l) => l.unitsSold > 0 },
  { id: 'low_units', label: 'Menos vendidos', sort: { key: 'unitsSold', dir: 'asc' } },
  { id: 'top_lifetime', label: 'Más vendidos (histórico)', sort: { key: 'soldQuantity', dir: 'desc' }, f: (l) => isNum(l.soldQuantity) },
  { id: 'best_rating', label: 'Mejor puntaje', sort: { key: 'rating', dir: 'desc' }, f: (l) => isNum(l.rating) },
  { id: 'worst_rating', label: 'Peor puntaje', sort: { key: 'rating', dir: 'asc' }, f: (l) => isNum(l.rating) },
  { id: 'top_revenue', label: 'Mayor facturación', sort: { key: 'revenue', dir: 'desc' } },
  { id: 'top_profit', label: 'Mayor ganancia', sort: { key: 'profit', dir: 'desc' }, f: (l) => isNum(l.profit) },
  { id: 'top_margin', label: 'Mayor margen', sort: { key: 'margin', dir: 'desc' }, f: (l) => isNum(l.margin) },
  { id: 'low_margin', label: 'Menor margen', sort: { key: 'margin', dir: 'asc' }, f: (l) => isNum(l.margin) },
  { id: 'top_cost', label: 'Mayor costo', sort: { key: 'mlCharges', dir: 'desc' } },
  { id: 'top_ads', label: 'Más publicidad', sort: { key: 'ads', dir: 'desc' }, f: (l) => isNum(l.ads) && l.ads > 0 },
  { id: 'low_stock', label: 'Stock bajo', f: (l, s) => isNum(l.stock) && l.stock <= (s.alertThresholds?.lowStock ?? 5) },
  { id: 'in_catalog', label: 'En competencia', f: (l) => l.competitionAvailable },
  { id: 'winning', label: 'Ganadoras', f: (l) => l.competitionStatus === 'winning' },
];

/**
 * Vistas: la tabla completa tiene muchas columnas y para mirar "cómo viene cada
 * publicación" molestan. Por eso arranca en la vista corta (ventas y opiniones)
 * y la completa queda a un clic.
 */
const VISTAS = {
  ventas: ['title', 'catalog', 'status', 'price', 'stock', 'unitsSold', 'revenue', 'soldQuantity', 'rating', 'competitionLabel'],
  completa: null, // todas
};

export default function listings(root, state) {
  const d = state.data;
  const settings = state.settings;
  let activeFilter = 'all';
  let query = '';
  let vista = localStorage.getItem('pubVista') === 'completa' ? 'completa' : 'ventas';
  let estado = localStorage.getItem('pubEstado') || 'activas'; // activas | pausadas | todas
  let soloCatalogo = localStorage.getItem('pubCatalogo') === 'si';

  const rows = d.listings.map((l) => ({
    raw: l,
    id: l.id,
    title: l.title,
    sku: l.sku || '—',
    thumbnail: l.thumbnail || null,
    price: l.price,
    stock: l.stock,
    unitsSold: l.unitsSold,
    soldQuantity: isNum(l.soldQuantity) ? l.soldQuantity : null,
    rating: l.reviews?.available ? l.reviews.average : null,
    reviewCount: l.reviews?.available ? l.reviews.total : null,
    revenue: l.period.grossRevenue,
    commission: l.period.commission,
    financing: l.period.financing,
    shipping: l.period.shipping,
    other: l.period.other,
    ads: l.period.adsLines ? l.period.advertising : null,
    adsPerUnit: l.ads?.available ? l.ads.perUnit : null,
    adsUnknown: !l.ads?.available,
    vat: l.period.vatDebit,
    netReceived: l.period.netReceived,
    productCost: l.period.profitKnown ? l.period.productCost : null,
    profit: l.period.profitKnown ? l.period.profit : null,
    margin: l.period.marginPct,
    mlCharges: l.period.mlChargesTotal,
    status: l.status,
    catalog: Boolean(l.catalogListing),
    catalogProductId: l.catalogProductId || null,
    listingTypeName: l.listingTypeName,
    installments: l.installmentsOffered,
    competitionAvailable: Boolean(l.competition?.available),
    competitionStatus: l.competition?.status || null,
    competitionLabel: l.competition?.available ? l.competition.statusLabel : 'Sin catálogo',
  }));

  const nAct = rows.filter((r) => r.status === 'active').length;
  const nPau = rows.filter((r) => r.status === 'paused').length;
  const nOtras = rows.length - nAct - nPau;
  const nCat = rows.filter((r) => r.catalog).length;
  const nCatAct = rows.filter((r) => r.catalog && r.status === 'active').length;

  root.innerHTML = `
    <div class="section">
      <div class="grid g-4" style="margin-bottom:14px">
        <div class="card stat"><div class="label">Activas</div><div class="value sm">${num(nAct)}</div><div class="delta">publicadas hoy en Mercado Libre</div></div>
        <div class="card stat"><div class="label">Pausadas o cerradas</div><div class="value sm">${num(nPau + nOtras)}</div><div class="delta">${nPau ? `${num(nPau)} pausadas` : 'ninguna pausada'}${nOtras ? ` · ${num(nOtras)} cerradas o inactivas` : ''}</div></div>
        <div class="card stat"><div class="label">De catálogo</div><div class="value sm">${num(nCat)}</div><div class="delta">${num(nCatAct)} activas · compiten por la ficha del producto</div></div>
        <div class="card stat"><div class="label">Publicaciones propias</div><div class="value sm">${num(rows.length - nCat)}</div><div class="delta">compiten por título y posicionamiento</div></div>
      </div>

      <div class="controls" style="margin-bottom:10px;align-items:center">
        <span class="note">Estado:</span>
        <div class="chips" id="estado">
          ${[['activas', `Activas (${num(nAct)})`], ['pausadas', `Pausadas o cerradas (${num(nPau + nOtras)})`], ['todas', `Todas (${num(rows.length)})`]]
            .map(([v, l]) => `<button class="chip ${estado === v ? 'on' : ''}" data-e="${v}">${l}</button>`).join('')}
        </div>
        <label class="note" title="Las publicaciones de catálogo compiten por la ficha del producto: gana la mejor oferta."><input type="checkbox" id="solo-cat" ${soloCatalogo ? 'checked' : ''}> sólo de catálogo</label>
        <span style="flex:1"></span>
        <span class="note">Vista:</span>
        <div class="chips" id="vista">
          <button class="chip ${vista === 'ventas' ? 'on' : ''}" data-v="ventas">Ventas y opiniones</button>
          <button class="chip ${vista === 'completa' ? 'on' : ''}" data-v="completa">Completa</button>
        </div>
      </div>

      <div class="controls" style="margin-bottom:12px">
        <input type="search" id="q" placeholder="Buscar por título, SKU o ID…" style="min-width:280px;flex:1;max-width:420px">
        <span class="note" id="cuenta"></span>
      </div>
      <div class="chips" id="chips" style="margin-bottom:14px">
        ${FILTERS.map((f) => `<button class="chip ${f.id === 'all' ? 'on' : ''}" data-f="${f.id}">${esc(f.label)}</button>`).join('')}
      </div>
      <div id="tbl"></div>
      <div class="note" style="margin-top:10px">Tocá cualquier fila para ver el desglose completo del cálculo. Podés ordenar por cualquier columna haciendo clic en su encabezado.</div>
    </div>`;

  const columns = [
    { key: 'title', label: 'Publicación', render: (r) => `<div class="tit with-ph">${thumb(r)}<span class="txt"><span class="t">${esc(r.title)}</span><span class="s">${esc(r.sku)} · ${esc(r.id)}</span></span></div>` },
    { key: 'price', label: 'Precio', num: true, render: (r) => money(r.price) },
    { key: 'stock', label: 'Stock', num: true, render: (r) => (isNum(r.stock) ? `<span class="${r.stock <= (settings.alertThresholds?.lowStock ?? 5) ? 'neg' : ''}">${num(r.stock)}</span>` : '—') },
    { key: 'unitsSold', label: 'U. vendidas', num: true, render: (r) => num(r.unitsSold) },
    { key: 'soldQuantity', label: 'Vendidos histórico', num: true, render: (r) => (isNum(r.soldQuantity) ? num(r.soldQuantity) : '<span class="src missing">SIN DATO</span>') },
    { key: 'rating', label: 'Opiniones', num: true, render: (r) => stars(r.rating, r.reviewCount) },
    { key: 'revenue', label: 'Facturación', num: true, render: (r) => money(r.revenue) },
    { key: 'commission', label: 'Comisión', num: true, render: (r) => money(r.commission) },
    { key: 'financing', label: 'Cuotas', num: true, render: (r) => money(r.financing) },
    { key: 'shipping', label: 'Envío', num: true, render: (r) => money(r.shipping) },
    { key: 'other', label: 'Otros', num: true, render: (r) => money(r.other) },
    { key: 'ads', label: 'Publicidad', num: true, render: (r) => (r.adsUnknown ? '<span class="src missing" title="Sin datos de publicidad">SIN DATO</span>' : money(r.ads)) },
    { key: 'adsPerUnit', label: 'Public./u', num: true, render: (r) => (isNum(r.adsPerUnit) ? money(r.adsPerUnit) : '—') },
    { key: 'vat', label: 'IVA', num: true, render: (r) => money(r.vat) },
    { key: 'netReceived', label: 'Neto recibido', num: true, render: (r) => `<b>${money(r.netReceived)}</b>` },
    { key: 'productCost', label: 'Costo prod.', num: true, render: (r) => (isNum(r.productCost) ? money(r.productCost) : '<span class="src missing">SIN DATO</span>') },
    { key: 'profit', label: 'Ganancia', num: true, render: (r) => (isNum(r.profit) ? `<b class="${r.profit < 0 ? 'neg' : 'pos'}">${money(r.profit)}</b>` : '—') },
    { key: 'margin', label: 'Margen', num: true, render: (r) => marginBadge(r.margin) },
    { key: 'status', label: 'Estado', render: (r) => `<span class="badge ${r.status === 'active' ? 'good' : ''}">${r.status === 'active' ? 'Activa' : r.status === 'paused' ? 'Pausada' : r.status === 'inactive' ? 'Inactiva' : esc(r.status)}</span>` },
    { key: 'catalog', label: 'Catálogo', render: (r) => (r.catalog ? '<span class="badge info" title="Publicación de catálogo: compite por la ficha del producto">Catálogo</span>' : '<span class="note">propia</span>') },
    { key: 'listingTypeName', label: 'Tipo', render: (r) => esc(r.listingTypeName || '—') },
    { key: 'installments', label: 'Cuotas', num: true, render: (r) => (isNum(r.installments) ? `${r.installments}x` : '—') },
    { key: 'competitionLabel', label: 'Competencia', render: (r) => competitionBadge(r) },
  ];

  const tbl = root.querySelector('#tbl');
  let table;

  function apply() {
    const f = FILTERS.find((x) => x.id === activeFilter);
    let out = rows;
    if (estado === 'activas') out = out.filter((r) => r.status === 'active');
    else if (estado === 'pausadas') out = out.filter((r) => r.status !== 'active');
    if (soloCatalogo) out = out.filter((r) => r.catalog);
    if (f?.f) out = out.filter((r) => f.f(r, settings));
    if (query) {
      const q = query.toLowerCase();
      out = out.filter((r) => `${r.title} ${r.sku} ${r.id}`.toLowerCase().includes(q));
    }
    const sinCosto = out.filter((r) => !isNum(r.productCost)).length;
    root.querySelector('#cuenta').textContent =
      `${out.length} publicaciones${out.length !== rows.length ? ` de ${rows.length}` : ''} · ${sinCosto} sin costo cargado`;
    const cols = VISTAS[vista] ? VISTAS[vista].map((k) => columns.find((c) => c.key === k)).filter(Boolean) : columns;
    const initialSort = f?.sort || { key: 'revenue', dir: 'desc' };
    table = sortableTable(tbl, {
      columns: cols,
      rows: out,
      initialSort,
      rowId: (r) => r.id,
      emptyText: 'Ninguna publicación coincide con el filtro.',
      onRowClick: (r) => openDetail(r.raw, state),
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
  root.querySelectorAll('#estado .chip').forEach((c) =>
    c.addEventListener('click', () => {
      estado = c.dataset.e;
      localStorage.setItem('pubEstado', estado);
      root.querySelectorAll('#estado .chip').forEach((x) => x.classList.toggle('on', x === c));
      apply();
    })
  );
  root.querySelectorAll('#vista .chip').forEach((c) =>
    c.addEventListener('click', () => {
      vista = c.dataset.v;
      localStorage.setItem('pubVista', vista);
      root.querySelectorAll('#vista .chip').forEach((x) => x.classList.toggle('on', x === c));
      apply();
    })
  );
  root.querySelector('#solo-cat').addEventListener('change', (e) => {
    soloCatalogo = e.target.checked;
    localStorage.setItem('pubCatalogo', soloCatalogo ? 'si' : 'no');
    apply();
  });
  apply();
}

/** Foto de la publicación. Si Mercado Libre no la trajo, va un cuadrito vacío. */
export function thumb(r, size = 40) {
  if (!r.thumbnail) return `<span class="ph" style="width:${size}px;height:${size}px" title="Sin foto disponible">◫</span>`;
  return `<img class="ph" src="${esc(r.thumbnail)}" alt="" loading="lazy" width="${size}" height="${size}">`;
}

/** Puntaje de opiniones. Sin opiniones no se muestra 0: se muestra "—". */
export function stars(avg, count) {
  if (!isNum(avg)) return '<span class="note">—</span>';
  const a = Number(avg);
  const full = Math.round(a);
  return `<span class="stars" title="${a.toFixed(1)} de 5${isNum(count) ? ` · ${count} opiniones` : ''}">
      <span class="s5">${'★'.repeat(full)}${'☆'.repeat(Math.max(0, 5 - full))}</span>
      <span class="n">${a.toFixed(1)}${isNum(count) ? ` <span class="note">(${num(count)})</span>` : ''}</span>
    </span>`;
}

function competitionBadge(r) {
  if (!r.competitionAvailable) return '<span class="badge">Sin catálogo</span>';
  const cls = r.competitionStatus === 'winning' ? 'good' : r.competitionStatus === 'sharing_first_place' ? 'warn' : 'bad';
  return `<span class="badge ${cls}">${esc(r.competitionLabel)}</span>`;
}

export function openDetail(l, state) {
  const p = l.period.grossRevenue ? l.profit : l.unitProfit;
  const isPeriod = l.unitsSold > 0;
  const inst = l.installments;

  const body = `
    <div class="grid g-2" style="margin-bottom:16px">
      <div style="display:flex;gap:14px;align-items:flex-start;min-width:0">
        ${thumb(l, 96)}
        <div style="min-width:0">
          <div class="note">Publicación</div>
          <div style="font-weight:600;margin-bottom:4px">${esc(l.title)}</div>
          <div class="note">${esc(l.sku || 'sin SKU')} · ${esc(l.id)}</div>
          <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span class="badge ${l.status === 'active' ? 'good' : ''}">${l.status === 'active' ? 'Activa' : l.status === 'paused' ? 'Pausada' : l.status === 'inactive' ? 'Inactiva' : esc(l.status)}</span>
            <span class="badge">${esc(l.listingTypeName || 'tipo n/d')}</span>
            ${l.catalogListing ? '<span class="badge info" title="Compite por la ficha del producto: gana la mejor oferta">Publicación de catálogo</span>' : ''}
            ${l.reviews?.available ? stars(l.reviews.average, l.reviews.total) : ''}
          </div>
          ${l.permalink ? `<div style="margin-top:8px"><a href="${esc(l.permalink)}" target="_blank" rel="noopener">Ver en Mercado Libre ↗</a></div>` : ''}
        </div>
      </div>
      <div>
        <dl class="kv">
          <dt>Precio actual</dt><dd>${money(l.price)}</dd>
          <dt>Stock</dt><dd>${num(l.stock)}</dd>
          <dt>Unidades vendidas (período)</dt><dd>${num(l.unitsSold)}</dd>
          <dt>Vendidos desde que existe</dt><dd>${isNum(l.soldQuantity) ? num(l.soldQuantity) : '<span class="src missing">SIN DATO</span>'}</dd>
          <dt>Opiniones</dt><dd>${l.reviews?.available ? `${Number(l.reviews.average).toFixed(1)} de 5 · ${num(l.reviews.total)} opiniones` : `<span class="note">${esc(l.reviews?.reason || 'sin datos')}</span>`}</dd>
          <dt>Cuotas ofrecidas</dt><dd>${isNum(l.installmentsOffered) ? l.installmentsOffered + 'x' + (l.installmentsInterestFree ? ' sin interés' : '') : 'no ofrece'}</dd>
        </dl>
      </div>
    </div>
    ${reviewBars(l.reviews)}

    <h4 style="margin:18px 0 8px;font-size:13px">${isPeriod ? 'Desglose del período' : 'Desglose por unidad al precio de hoy'}</h4>
    ${breakdownRows([
      { label: 'Facturación bruta (con IVA)', value: money(p.grossRevenue) },
      { label: 'IVA débito', value: '− ' + money(p.vatDebit), tag: sourceTag('derived') },
      { label: 'Venta neta de IVA', value: money(p.netRevenue) },
      { label: 'Comisión Mercado Libre', value: '− ' + money(p.charges.commission.amount), neg: true, tag: sourceTag(p.charges.commission.source) },
      { label: 'Costo de envío', value: '− ' + money(p.charges.shipping.amount), neg: true, tag: sourceTag(p.charges.shipping.source) },
      { label: 'Costo de financiación (cuotas)', value: '− ' + money(p.charges.financing.amount), neg: true, tag: sourceTag(p.charges.financing.source) },
      { label: 'Otros cargos', value: '− ' + money(p.charges.other.amount), neg: true, tag: sourceTag(p.charges.other.source) },
      { label: 'Dinero neto recibido', value: money(p.netReceived), total: true },
      { label: 'Publicidad (Product Ads, prorrateada)', value: p.adsIncluded ? '− ' + money(p.advertising?.amount) : 'SIN DATO', neg: true, tag: sourceTag(p.advertising?.source || 'missing') },
      ...(p.adsIncluded ? [{ label: 'Te queda después de publicidad', value: money(p.netAfterAds), total: true }] : []),
      { label: 'Costo del producto', value: isNum(p.productCost.amount) ? '− ' + money(p.productCost.amount) : 'SIN DATO', neg: true, tag: sourceTag(p.productCost.source) },
      { label: 'Ganancia estimada', value: isNum(p.profit) ? money(p.profit) : '—', total: true, pos: isNum(p.profit) && p.profit >= 0, neg: isNum(p.profit) && p.profit < 0 },
      { label: 'Margen', value: isNum(p.marginPct) ? pctStr(p.marginPct) : '—', total: true },
    ])}

    ${p.charges.commission.note ? `<div class="note" style="margin-top:8px">Comisión: ${esc(p.charges.commission.note)}</div>` : ''}
    ${p.advertising?.note ? `<div class="note" style="margin-top:4px">Publicidad: ${esc(p.advertising.note)}</div>` : ''}
    ${l.ads?.advertised ? `<div class="note" style="margin-top:4px">Anuncio: ${num(l.ads.metrics?.clicks)} clics · ${num(l.ads.metrics?.adUnits)} unidades vendidas por el anuncio · ACOS ${pctStr(l.ads.acos)} · ${money(l.ads.perUnit)} de publicidad por unidad (${pctStr(l.ads.pctOfPrice)} del precio). <a href="#/publicidad">Ver en Publicidad →</a></div>` : ''}
    ${p.missing?.length ? `<div class="banner err" style="margin-top:14px"><div><b>Faltan datos</b><div>${esc(p.missing.join(', '))}. Mientras falten, la ganancia no se calcula (no se estima).</div></div></div>` : ''}

    <h4 style="margin:20px 0 8px;font-size:13px">Impacto de las cuotas</h4>
    ${installmentsBlock(inst)}

    ${l.competition?.available ? `<h4 style="margin:20px 0 8px;font-size:13px">Competencia de catálogo</h4>
      <dl class="kv">
        <dt>Estado</dt><dd>${esc(l.competition.statusLabel)}</dd>
        <dt>Tu precio</dt><dd>${money(l.competition.myPrice)}</dd>
        <dt>Precio para ganar</dt><dd>${money(l.competition.priceToWin)}</dd>
        <dt>Diferencia</dt><dd>${money(l.competition.priceGap)}</dd>
      </dl>
      ${l.competition.recommendation ? `<div class="note" style="margin-top:8px">${esc(l.competition.recommendation)}</div>` : ''}` : ''}

    <h4 style="margin:20px 0 8px;font-size:13px">Cómo se calculó</h4>
    <div class="mono" style="white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:8px">${esc((p.formula || []).join('\n'))}</div>
  `;

  openModal({ title: 'Detalle de publicación', body, wide: true });
}

/** Distribución de estrellas, cuando Mercado Libre la informa. */
function reviewBars(rev) {
  if (!rev?.available || !rev.levels) return '';
  const total = [5, 4, 3, 2, 1].reduce((a, k) => a + (rev.levels[k] || 0), 0);
  if (!total) return '';
  return `<div class="card card-pad" style="margin-bottom:16px">
      <div class="note" style="margin-bottom:8px;font-weight:600">Cómo te puntúan (${num(total)} opiniones)</div>
      ${[5, 4, 3, 2, 1].map((k) => {
        const n = rev.levels[k] || 0;
        const w = total ? (n / total) * 100 : 0;
        return `<div class="rev-row"><span class="k">${k}★</span><span class="bar"><span style="width:${w.toFixed(1)}%"></span></span><span class="v">${num(n)}</span></div>`;
      }).join('')}
    </div>`;
}

function installmentsBlock(inst) {
  if (!inst) return '<div class="note">Sin datos de cuotas.</div>';
  const a = inst.withoutInstallments;
  const b = inst.withInstallments;
  const cell = (x) => `
    <dl class="kv">
      <dt>Precio</dt><dd>${money(x.grossRevenue)}</dd>
      <dt>Comisión</dt><dd>${money(x.charges.commission.amount)}</dd>
      <dt>Financiación</dt><dd>${money(x.charges.financing.amount)}</dd>
      <dt>Envío + otros</dt><dd>${money((x.charges.shipping.amount || 0) + (x.charges.other.amount || 0))}</dd>
      <dt>Neto recibido</dt><dd>${money(x.netReceived)}</dd>
      <dt>Ganancia</dt><dd>${isNum(x.profit) ? money(x.profit) : '—'}</dd>
      <dt>Margen</dt><dd>${isNum(x.marginPct) ? pctStr(x.marginPct) : '—'}</dd>
    </dl>`;
  return `<div class="grid g-2">
      <div class="card card-pad"><div class="note" style="margin-bottom:8px;font-weight:600">SIN CUOTAS</div>${cell(a)}</div>
      <div class="card card-pad"><div class="note" style="margin-bottom:8px;font-weight:600">CON CUOTAS</div>${cell(b)}</div>
    </div>
    <div class="note" style="margin-top:10px">
      ${isNum(inst.profitDelta)
        ? `Ofrecer cuotas te cuesta <b>${money(Math.abs(inst.profitDelta))}</b> por unidad y <b>${isNum(inst.marginDelta) ? pctStr(Math.abs(inst.marginDelta)) : '—'}</b> de margen. ${sourceTag(inst.financingSource)}`
        : 'Mercado Libre no informó el costo de financiación para esta publicación, así que no se estima. Podés cargar una tasa en Configuración y quedará marcada como parámetro tuyo.'}
    </div>`;
}
