import { breakdownRows, stat, sortableTable } from '../ui.js';
import { api } from '../api.js';
import { money, num, pctStr, esc, isNum, sourceTag, marginBadge } from '../format.js';
import { state as appState } from '../app.js';

export default function profitability(root, state) {
  const d = state.data;
  const t = d.totals;
  const listings = [...d.listings].sort((a, b) => (b.period.grossRevenue || 0) - (a.period.grossRevenue || 0));
  let selectedId = listings[0]?.id;

  root.innerHTML = `
    <div class="section">
      <div class="grid g-4">
        ${stat({ label: 'Facturación bruta', value: money(t.grossRevenue), hint: 'con IVA, lo que pagó el comprador' })}
        ${stat({ label: 'Dinero neto recibido', value: money(t.netReceived), hint: 'lo que deposita Mercado Libre' })}
        ${stat({ label: 'Ganancia', value: t.profitKnown ? money(t.profit) : '—', hint: t.profitKnown ? 'después del costo del producto' : `faltan costos en ${t.listingsWithoutCost} publicaciones` })}
        ${stat({ label: 'Margen', value: t.profitKnown ? pctStr(t.marginPct) : '—', hint: d.settings.taxCondition === 'responsable_inscripto' ? 'sobre venta neta de IVA' : 'sobre precio de venta' })}
      </div>
      <div class="note" style="margin-top:10px">
        <b>No confundir:</b> facturación bruta es lo que factura la operación; dinero neto recibido es caja; ganancia es lo que queda después del costo del producto${d.settings.taxCondition === 'responsable_inscripto' ? ' y sin el IVA, que no es tuyo' : ''}; margen es ganancia sobre venta.
      </div>
    </div>

    <div class="section">
      <h2>Calculadora de rentabilidad por publicación</h2>
      <div class="card card-pad">
        <div class="controls" style="margin-bottom:14px">
          <select id="pick" style="min-width:280px;flex:1;max-width:520px">
            ${listings.map((l) => `<option value="${esc(l.id)}">${esc(l.title)}${l.sku ? ` — ${esc(l.sku)}` : ''}</option>`).join('')}
          </select>
        </div>
        <div class="grid g-2-1">
          <div>
            <div class="controls" style="margin-bottom:12px">
              <label class="note">Precio simulado <input type="number" id="sim-price" step="100" style="width:130px;margin-left:6px"></label>
              <label class="note">Costo unitario <input type="number" id="sim-cost" step="100" style="width:130px;margin-left:6px"></label>
              <label class="note"><input type="checkbox" id="sim-inst" checked> con cuotas</label>
              <button class="btn sm" id="sim-reset">Volver al precio real</button>
            </div>
            <div id="calc"></div>
          </div>
          <div>
            <div class="note" style="margin-bottom:8px">Comparación cuotas</div>
            <div id="inst"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Rentabilidad de todas las publicaciones <span class="hint">unitaria, al precio de hoy</span></h2>
      <div id="tbl"></div>
    </div>`;

  const pick = root.querySelector('#pick');
  const priceInput = root.querySelector('#sim-price');
  const costInput = root.querySelector('#sim-cost');
  const instChk = root.querySelector('#sim-inst');

  function current() {
    return listings.find((l) => l.id === selectedId);
  }

  function fillInputs() {
    const l = current();
    priceInput.value = l.price ?? '';
    costInput.value = l.unitProfit.productCost.unitAmount ?? '';
    instChk.checked = true;
  }

  async function recalc() {
    const l = current();
    const calc = root.querySelector('#calc');
    calc.innerHTML = '<div class="note">Calculando…</div>';
    try {
      const r = await api.simulate({
        itemId: l.id,
        price: Number(priceInput.value) || l.price,
        unitCost: costInput.value === '' ? undefined : Number(costInput.value),
        withInstallments: instChk.checked,
        ...appState.period,
      });
      calc.innerHTML = renderCalc(r.result, l);
    } catch (e) {
      calc.innerHTML = `<div class="banner err"><div>${esc(e.message)}</div></div>`;
    }
    root.querySelector('#inst').innerHTML = renderInstallments(l);
  }

  pick.addEventListener('change', () => {
    selectedId = pick.value;
    fillInputs();
    recalc();
  });
  [priceInput, costInput].forEach((i) => i.addEventListener('change', recalc));
  instChk.addEventListener('change', recalc);
  root.querySelector('#sim-reset').addEventListener('click', () => {
    fillInputs();
    recalc();
  });

  fillInputs();
  recalc();

  // Tabla completa
  sortableTable(root.querySelector('#tbl'), {
    columns: [
      { key: 'title', label: 'Publicación', render: (r) => `<div class="tit"><span class="t">${esc(r.title)}</span><span class="s">${esc(r.sku || '—')}</span></div>` },
      { key: 'price', label: 'Precio', num: true, render: (r) => money(r.price) },
      { key: 'commission', label: 'Comisión', num: true, render: (r) => money(r.commission) },
      { key: 'financing', label: 'Cuotas', num: true, render: (r) => money(r.financing) },
      { key: 'shipping', label: 'Envío', num: true, render: (r) => money(r.shipping) },
      { key: 'net', label: 'Neto recibido', num: true, render: (r) => money(r.net) },
      { key: 'cost', label: 'Costo', num: true, render: (r) => (isNum(r.cost) ? money(r.cost) : '<span class="src missing">SIN DATO</span>') },
      { key: 'profit', label: 'Ganancia unit.', num: true, render: (r) => (isNum(r.profit) ? `<b class="${r.profit < 0 ? 'neg' : 'pos'}">${money(r.profit)}</b>` : '—') },
      { key: 'margin', label: 'Margen', num: true, render: (r) => marginBadge(r.margin) },
      { key: 'instImpact', label: 'Impacto cuotas', num: true, render: (r) => (isNum(r.instImpact) ? `<span class="neg">${pctStr(r.instImpact)}</span>` : '—') },
    ],
    rows: listings.map((l) => ({
      title: l.title,
      sku: l.sku,
      price: l.price,
      commission: l.unitProfit.charges.commission.amount,
      financing: l.unitProfit.charges.financing.amount,
      shipping: l.unitProfit.charges.shipping.amount,
      net: l.unitProfit.netReceived,
      cost: l.unitProfit.productCost.amount,
      profit: l.unitProfit.profit,
      margin: l.unitProfit.marginPct,
      instImpact: isNum(l.installments?.marginDelta) ? Math.abs(l.installments.marginDelta) : null,
    })),
    initialSort: { key: 'margin', dir: 'asc' },
    emptyText: 'Sin publicaciones.',
  });
}

function renderCalc(p, l) {
  return (
    breakdownRows([
      { label: 'Precio de venta (con IVA)', value: money(p.grossRevenue) },
      { label: 'IVA débito', value: '− ' + money(p.vatDebit), tag: sourceTag('derived') },
      { label: 'Venta neta de IVA', value: money(p.netRevenue) },
      { label: 'Comisión Mercado Libre', value: '− ' + money(p.charges.commission.amount), neg: true, tag: sourceTag(p.charges.commission.source) },
      { label: 'Costo de cuotas', value: '− ' + money(p.charges.financing.amount), neg: true, tag: sourceTag(p.charges.financing.source) },
      { label: 'Costo de envío', value: '− ' + money(p.charges.shipping.amount), neg: true, tag: sourceTag(p.charges.shipping.source) },
      { label: 'Otros cargos', value: '− ' + money(p.charges.other.amount), neg: true },
      { label: 'Dinero neto recibido', value: money(p.netReceived), total: true },
      { label: 'Costo del producto', value: isNum(p.productCost.amount) ? '− ' + money(p.productCost.amount) : 'SIN DATO', neg: true, tag: sourceTag(p.productCost.source) },
      { label: 'Ganancia estimada', value: isNum(p.profit) ? money(p.profit) : '—', total: true, pos: isNum(p.profit) && p.profit >= 0, neg: isNum(p.profit) && p.profit < 0 },
      { label: 'Margen', value: isNum(p.marginPct) ? pctStr(p.marginPct) : '—', total: true },
    ]) +
    (p.charges.commission.note ? `<div class="note" style="margin-top:8px">Comisión: ${esc(p.charges.commission.note)}</div>` : '') +
    (p.missing.length ? `<div class="note" style="margin-top:6px;color:var(--critical)">Faltan: ${esc(p.missing.join(', '))}. No se estima ningún valor faltante.</div>` : '') +
    `<div class="mono" style="white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:8px;margin-top:12px">${esc((p.formula || []).join('\n'))}</div>`
  );
}

function renderInstallments(l) {
  const i = l.installments;
  if (!i) return '<div class="note">Sin datos.</div>';
  const col = (title, x) => `
    <div class="card card-pad" style="margin-bottom:10px">
      <div class="note" style="font-weight:700;margin-bottom:6px">${title}</div>
      <dl class="kv">
        <dt>Precio</dt><dd>${money(x.grossRevenue)}</dd>
        <dt>Comisión</dt><dd>${money(x.charges.commission.amount)}</dd>
        <dt>Financiación</dt><dd>${money(x.charges.financing.amount)}</dd>
        <dt>Costos</dt><dd>${money((x.charges.shipping.amount || 0) + (x.charges.other.amount || 0))}</dd>
        <dt>Neto</dt><dd>${money(x.netReceived)}</dd>
        <dt>Ganancia</dt><dd>${isNum(x.profit) ? money(x.profit) : '—'}</dd>
        <dt>Margen</dt><dd>${isNum(x.marginPct) ? pctStr(x.marginPct) : '—'}</dd>
      </dl>
    </div>`;
  return (
    col('SIN CUOTAS', i.withoutInstallments) +
    col('CON CUOTAS', i.withInstallments) +
    `<div class="note">${
      isNum(i.profitDelta)
        ? `Las cuotas te cuestan <b>${money(Math.abs(i.profitDelta))}</b> por unidad y <b>${isNum(i.marginDelta) ? pctStr(Math.abs(i.marginDelta)) : '—'}</b> de margen.`
        : 'Mercado Libre no informa el costo de financiación de esta publicación; no se estima.'
    }</div>`
  );
}
