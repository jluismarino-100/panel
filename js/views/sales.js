import { sortableTable, openModal, breakdownRows, stat } from '../ui.js';
import { money, num, pctStr, esc, isNum, dateTime, sourceTag } from '../format.js';

export default function sales(root, state) {
  const d = state.data;
  const t = d.totals;
  let query = '';

  const rows = d.sales.map((s) => ({
    raw: s,
    orderId: s.orderId,
    date: s.date,
    title: s.title,
    sku: s.sku || '—',
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    discount: s.discount,
    commission: s.profit.charges.commission.amount,
    financing: s.profit.charges.financing.amount,
    shipping: s.profit.charges.shipping.amount,
    other: s.profit.charges.other.amount,
    vat: s.profit.vatDebit,
    netReceived: s.profit.netReceived,
    ads: s.profit.adsIncluded ? s.profit.advertising.amount : null,
    adsKnown: s.profit.adsIncluded,
    netAfterAds: s.profit.netAfterAds,
    profit: s.profit.profit,
  }));

  root.innerHTML = `
    <div class="section">
      <div class="grid g-4">
        ${stat({ label: 'Ventas', value: num(t.orders), hint: `${num(t.units)} unidades` })}
        ${stat({ label: 'Facturación bruta', value: money(t.grossRevenue), hint: `ticket promedio ${money(t.avgTicket)}` })}
        ${stat({ label: 'Cargos de Mercado Libre', value: money(t.mlChargesTotal), hint: `${pctStr(t.mlChargesPctOfRevenue)} de la facturación` })}
        ${stat({ label: 'Dinero neto recibido', value: money(t.netReceived), hint: 'no es ganancia' })}
      </div>
      ${t.adsCoverage !== 'none' ? `<div class="note" style="margin-top:8px">A estas ventas se les cargaron <b>${money(t.advertising)}</b> de publicidad (${money(t.adsPerUnit)} por unidad en promedio)${t.adsCoverage === 'partial' ? ', sólo a las que caen dentro del rango con datos de publicidad' : ''}. <a href="#/publicidad">Ver Publicidad →</a></div>` : ''}
    </div>
    <div class="section">
      <div class="controls" style="margin-bottom:12px">
        <input type="search" id="q" placeholder="Buscar por producto, SKU u orden…" style="min-width:280px;flex:1;max-width:420px">
      </div>
      <div id="tbl"></div>
      <div class="note" style="margin-top:10px">Tocá una venta para ver exactamente cómo se llegó al importe neto.</div>
    </div>`;

  const columns = [
    { key: 'date', label: 'Fecha', render: (r) => `<span style="white-space:nowrap">${dateTime(r.date)}</span>`, sort: (r) => new Date(r.date).getTime() },
    { key: 'orderId', label: 'Orden', render: (r) => `<span class="mono">${esc(r.orderId)}</span>` },
    { key: 'title', label: 'Producto', render: (r) => `<div class="tit"><span class="t">${esc(r.title)}</span><span class="s">${esc(r.sku)}</span></div>` },
    { key: 'quantity', label: 'Cant.', num: true, render: (r) => num(r.quantity) },
    { key: 'unitPrice', label: 'Precio', num: true, render: (r) => money(r.unitPrice) },
    { key: 'discount', label: 'Desc.', num: true, render: (r) => (r.discount ? '− ' + money(r.discount) : '—') },
    { key: 'commission', label: 'Comisión', num: true, render: (r) => money(r.commission) },
    { key: 'financing', label: 'Financiación', num: true, render: (r) => money(r.financing) },
    { key: 'shipping', label: 'Envío', num: true, render: (r) => money(r.shipping) },
    { key: 'other', label: 'Otros', num: true, render: (r) => money(r.other) },
    { key: 'vat', label: 'IVA', num: true, render: (r) => money(r.vat) },
    { key: 'netReceived', label: 'Neto recibido', num: true, render: (r) => `<b>${money(r.netReceived)}</b>` },
    { key: 'ads', label: 'Publicidad', num: true, render: (r) => (r.adsKnown ? money(r.ads) : '<span class="src missing">SIN DATO</span>') },
    { key: 'netAfterAds', label: 'Te queda', num: true, render: (r) => (isNum(r.netAfterAds) ? money(r.netAfterAds) : '—') },
    { key: 'profit', label: 'Ganancia', num: true, render: (r) => (isNum(r.profit) ? `<span class="${r.profit < 0 ? 'neg' : 'pos'}">${money(r.profit)}</span>` : '<span class="src missing">SIN COSTO</span>') },
  ];

  const tbl = root.querySelector('#tbl');
  function apply() {
    const out = query
      ? rows.filter((r) => `${r.title} ${r.sku} ${r.orderId}`.toLowerCase().includes(query.toLowerCase()))
      : rows;
    sortableTable(tbl, {
      columns,
      rows: out,
      initialSort: { key: 'date', dir: 'desc' },
      rowId: (r) => r.orderId + ':' + r.sku,
      emptyText: 'No hay ventas en el período seleccionado.',
      onRowClick: (r) => openSale(r.raw),
    });
  }
  root.querySelector('#q').addEventListener('input', (e) => {
    query = e.target.value;
    apply();
  });
  apply();
}

function openSale(s) {
  const p = s.profit;
  const body = `
    <div class="grid g-2" style="margin-bottom:14px">
      <div>
        <div class="note">Producto</div>
        <div style="font-weight:600">${esc(s.title)}</div>
        <div class="note">${esc(s.sku || 'sin SKU')} · publicación ${esc(s.itemId)}</div>
      </div>
      <div>
        <dl class="kv">
          <dt>Orden</dt><dd class="mono">${esc(s.orderId)}</dd>
          <dt>Fecha</dt><dd>${dateTime(s.date)}</dd>
          <dt>Cantidad</dt><dd>${num(s.quantity)}</dd>
          <dt>Medio de pago</dt><dd>${esc(s.paymentMethod || '—')}</dd>
          <dt>Cuotas</dt><dd>${s.installments > 1 ? s.installments + 'x' : 'sin cuotas'}</dd>
          <dt>Envío</dt><dd>${esc(s.shippingMode || '—')}</dd>
        </dl>
      </div>
    </div>

    <h4 style="margin:16px 0 8px;font-size:13px">Del precio al importe neto</h4>
    ${breakdownRows([
      { label: `Precio de lista × ${s.quantity}`, value: money((s.listPrice || s.unitPrice) * s.quantity) },
      { label: 'Descuentos', value: s.discount ? '− ' + money(s.discount) : money(0), neg: Boolean(s.discount) },
      { label: 'Facturación bruta (lo que pagó el comprador)', value: money(p.grossRevenue), total: true },
      { label: 'Comisión Mercado Libre', value: '− ' + money(p.charges.commission.amount), neg: true, tag: sourceTag(p.charges.commission.source) },
      { label: 'Costo de financiación', value: '− ' + money(p.charges.financing.amount), neg: true, tag: sourceTag(p.charges.financing.source) },
      { label: 'Costo de envío', value: '− ' + money(p.charges.shipping.amount), neg: true, tag: sourceTag(p.charges.shipping.source) },
      ...(p.charges.other.items || []).map((o) => ({ label: o.label, value: '− ' + money(o.amount), neg: true, tag: sourceTag(o.source) })),
      { label: 'Dinero neto recibido', value: money(p.netReceived), total: true },
      { label: 'Publicidad (Product Ads, prorrateada)', value: p.adsIncluded ? '− ' + money(p.advertising.amount) : 'SIN DATO', neg: true, tag: sourceTag(p.advertising?.source || 'missing') },
      ...(p.adsIncluded ? [{ label: 'Te queda después de publicidad', value: money(p.netAfterAds), total: true }] : []),
      { label: 'IVA débito contenido en la venta', value: money(p.vatDebit), tag: sourceTag('derived') },
      { label: 'Costo del producto', value: isNum(p.productCost.amount) ? '− ' + money(p.productCost.amount) : 'SIN DATO', neg: true, tag: sourceTag(p.productCost.source) },
      { label: 'Ganancia', value: isNum(p.profit) ? money(p.profit) : '—', total: true, pos: isNum(p.profit) && p.profit >= 0, neg: isNum(p.profit) && p.profit < 0 },
      { label: 'Margen', value: isNum(p.marginPct) ? pctStr(p.marginPct) : '—', total: true },
    ])}

    ${[p.charges.commission.note, p.charges.financing.note, p.charges.shipping.note, p.advertising?.note ? 'Publicidad: ' + p.advertising.note : null].filter(Boolean).map((n) => `<div class="note">· ${esc(n)}</div>`).join('')}
    ${p.adsIncluded ? '<div class="note">· La publicidad no se descuenta del depósito: Mercado Libre la cobra aparte. Por eso va después del dinero neto recibido.</div>' : ''}

    <h4 style="margin:18px 0 8px;font-size:13px">Cómo se calculó</h4>
    <div class="mono" style="white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:8px">${esc((p.formula || []).join('\n'))}</div>`;

  openModal({ title: `Venta ${s.orderId}`, body, wide: true });
}
