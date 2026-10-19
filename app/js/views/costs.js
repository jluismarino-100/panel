import { stat, sortableTable, openModal, closeModal } from '../ui.js';
import { api } from '../api.js';
import { money, pctStr, esc, isNum, num, sourceTag } from '../format.js';
import { barsH, stackedBar, chartCard, seriesColor } from '../charts.js';
import { load } from '../app.js';

export default function costs(root, state) {
  const d = state.data;
  const t = d.totals;

  root.innerHTML = `
    <div class="section">
      <div class="grid g-4">
        ${stat({ label: 'Cargos de Mercado Libre', value: money(t.mlChargesTotal), hint: `${pctStr(t.mlChargesPctOfRevenue)} de la facturación` })}
        ${stat({ label: 'Comisión por venta', value: money(t.commission), hint: `${pctStr(pctOf(t.commission, t.grossRevenue))} de la facturación` })}
        ${stat({ label: 'Financiación (cuotas)', value: money(t.financing), hint: `${pctStr(pctOf(t.financing, t.grossRevenue))} de la facturación` })}
        ${stat({ label: 'Logística / envíos', value: money(t.shipping), hint: `${pctStr(pctOf(t.shipping, t.grossRevenue))} de la facturación` })}
      </div>
    </div>

    <div class="section">
      <h2>De dónde sale cada costo</h2>
      <div class="card card-pad">
        <table style="font-size:12.5px">
          <thead><tr><th class="no-sort">Concepto</th><th class="no-sort">Origen del dato</th><th class="no-sort">Estado</th></tr></thead>
          <tbody>
            ${availRow('Comisión por venta', '/sites/MLA/listing_prices → sale_fee_amount, percentage_fee, fixed_fee', d.availability?.fees)}
            ${availRow('Costo de envío', '/shipments/{id}/costs → costo a cargo del vendedor', d.availability?.shipping)}
            ${availRow('Costo de financiación', 'detalle de cargos del pago de la orden', d.availability?.financing)}
            ${availRow('Facturación / comprobantes', '/billing/integration/...', d.availability?.billing)}
            ${availRow('Competencia de catálogo', '/items/{id}/price_to_win', d.availability?.competition)}
            ${availRow('Publicidad (Product Ads)', '/advertising/…/product_ads/ad_groups/search → gasto por anuncio, o el reporte que importes', d.availability?.ads)}
            <tr><td>Costo del producto</td><td class="note">Lo cargás vos: Mercado Libre no lo conoce</td><td>${t.listingsWithoutCost ? `<span class="badge bad">faltan ${t.listingsWithoutCost}</span>` : '<span class="badge good">completo</span>'}</td></tr>
          </tbody>
        </table>
        <div class="note" style="margin-top:10px">Cuando Mercado Libre informa un costo, la app usa <b>ese</b> valor. Nunca se completa un costo faltante con un porcentaje inventado.</div>
      </div>
    </div>

    <div class="section">
      <h2>Composición de los costos de Mercado Libre</h2>
      <div class="card"><div class="card-pad" id="mix"></div></div>
    </div>

    <div class="section">
      <h2>Comisión por publicación</h2>
      <div class="grid g-2" id="charts"></div>
    </div>

    <div class="section">
      <h2>Costos de producto por SKU <span class="hint">este dato es tuyo, no de Mercado Libre</span></h2>
      <div class="controls" style="margin-bottom:12px">
        <input type="search" id="q" placeholder="Buscar…" style="min-width:240px">
        <button class="btn" id="import">Importar desde Excel / CSV</button>
        <span class="note">${t.listingsWithoutCost} publicaciones sin costo cargado</span>
      </div>
      <div id="tbl"></div>
    </div>`;

  stackedBar(root.querySelector('#mix'), {
    fmt: (v) => money(v),
    segments: [
      { label: 'Comisión', value: t.commission, color: seriesColor(0) },
      { label: 'Envío', value: t.shipping, color: seriesColor(1) },
      { label: 'Cuotas', value: t.financing, color: seriesColor(2) },
      { label: 'Otros', value: t.other, color: seriesColor(3) },
      ...(t.adsCoverage === 'all' ? [{ label: 'Publicidad', value: t.advertising, color: seriesColor(4) }] : []),
    ],
  });

  const withSales = d.listings.filter((l) => l.unitsSold > 0);
  const chartsEl = root.querySelector('#charts');
  const cc = [
    chartCard({
      title: 'Publicaciones que más comisión pagan',
      hint: 'ARS en el período',
      render: (el) => barsH(el, { rows: [...withSales].sort((a, b) => (b.period.commission || 0) - (a.period.commission || 0)).slice(0, 8).map((l) => ({ label: l.title, value: l.period.commission, sub: { k: 'Facturación', v: money(l.period.grossRevenue) } })), color: seriesColor(0), fmt: (v) => money(v), label: 'Comisión' }),
      tableHead: ['Publicación', 'Comisión', 'Facturación'],
      tableRows: [...withSales].sort((a, b) => (b.period.commission || 0) - (a.period.commission || 0)).slice(0, 8).map((l) => [esc(l.title), money(l.period.commission), money(l.period.grossRevenue)]),
    }),
    chartCard({
      title: 'Peso de Mercado Libre sobre la venta',
      hint: '% de la facturación de cada publicación',
      render: (el) => barsH(el, { rows: [...withSales].sort((a, b) => (b.period.mlChargesPctOfRevenue || 0) - (a.period.mlChargesPctOfRevenue || 0)).slice(0, 8).map((l) => ({ label: l.title, value: l.period.mlChargesPctOfRevenue, sub: { k: 'Cargos', v: money(l.period.mlChargesTotal) } })), color: seriesColor(1), fmt: (v) => pctStr(v), label: 'Cargos ML' }),
      tableHead: ['Publicación', '% de la venta', 'Cargos'],
      tableRows: [...withSales].sort((a, b) => (b.period.mlChargesPctOfRevenue || 0) - (a.period.mlChargesPctOfRevenue || 0)).slice(0, 8).map((l) => [esc(l.title), pctStr(l.period.mlChargesPctOfRevenue), money(l.period.mlChargesTotal)]),
    }),
  ];
  chartsEl.innerHTML = cc.map((c) => c.html).join('');
  cc.forEach((c) => c.mount(chartsEl));

  // --- tabla de costos editable ---
  let query = '';
  const tbl = root.querySelector('#tbl');
  function rowsFor() {
    const base = d.listings.map((l) => ({
      id: l.id,
      key: l.sku || l.id,
      title: l.title,
      sku: l.sku || '—',
      price: l.price,
      commissionPct: l.unitProfit.charges.commission.vatRate !== undefined ? pctOf(l.unitProfit.charges.commission.amount, l.price) : null,
      commission: l.unitProfit.charges.commission.amount,
      commissionSource: l.unitProfit.charges.commission.source,
      shipping: l.unitProfit.charges.shipping.amount,
      financing: l.unitProfit.charges.financing.amount,
      cost: l.unitProfit.productCost.unitAmount,
      margin: l.unitProfit.marginPct,
    }));
    return query ? base.filter((r) => `${r.title} ${r.sku} ${r.id}`.toLowerCase().includes(query.toLowerCase())) : base;
  }

  function draw() {
    sortableTable(tbl, {
      columns: [
        { key: 'title', label: 'Publicación', render: (r) => `<div class="tit"><span class="t">${esc(r.title)}</span><span class="s">${esc(r.sku)}</span></div>` },
        { key: 'price', label: 'Precio', num: true, render: (r) => money(r.price) },
        { key: 'commission', label: 'Comisión', num: true, render: (r) => `${money(r.commission)} ${sourceTag(r.commissionSource)}` },
        { key: 'commissionPct', label: '% s/ precio', num: true, render: (r) => pctStr(r.commissionPct) },
        { key: 'shipping', label: 'Envío', num: true, render: (r) => money(r.shipping) },
        { key: 'financing', label: 'Cuotas', num: true, render: (r) => money(r.financing) },
        {
          key: 'cost',
          label: 'Costo del producto',
          num: true,
          render: (r) => `<input type="number" step="100" data-cost="${esc(r.key)}" value="${isNum(r.cost) ? r.cost : ''}" placeholder="cargar" style="width:120px;text-align:right">`,
        },
        { key: 'margin', label: 'Margen', num: true, render: (r) => pctStr(r.margin) },
      ],
      rows: rowsFor(),
      initialSort: { key: 'commission', dir: 'desc' },
    });
    tbl.querySelectorAll('[data-cost]').forEach((inp) =>
      inp.addEventListener('change', async () => {
        const key = inp.dataset.cost;
        inp.disabled = true;
        try {
          await api.setCost({ key, unitCost: inp.value === '' ? null : Number(inp.value), vatIncluded: state.settings.productCostVatIncluded });
          await load();
        } catch (e) {
          alert('No se pudo guardar el costo: ' + e.message);
          inp.disabled = false;
        }
      })
    );
  }
  root.querySelector('#q').addEventListener('input', (e) => {
    query = e.target.value;
    draw();
  });
  draw();

  root.querySelector('#import').addEventListener('click', () => openImport());
}

function openImport() {
  openModal({
    title: 'Importar costos',
    body: `<div class="note" style="margin-bottom:10px">Pegá dos columnas: <b>SKU</b> (o ID de publicación) y <b>costo unitario</b>. Podés copiar directo desde Excel. Separadores aceptados: tabulación, punto y coma o coma.</div>
      <textarea id="csv" rows="12" style="width:100%;font-family:ui-monospace,monospace" placeholder="BAC-3440	18500&#10;MES-120	148000"></textarea>
      <div class="note" style="margin-top:8px">Los costos se guardan en tu equipo, en <span class="mono">data/costs.json</span>. No se envían a Mercado Libre ni a ningún servicio externo.</div>
      <div id="imp-out" style="margin-top:10px"></div>`,
    footer: `<button class="btn ghost" id="c">Cancelar</button><button class="btn primary" id="go">Importar</button>`,
    onMount(rootEl) {
      rootEl.querySelector('#c').addEventListener('click', closeModal);
      rootEl.querySelector('#go').addEventListener('click', async () => {
        const text = rootEl.querySelector('#csv').value;
        const rows = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const parts = line.split(/\t|;|,(?=\s*\d)/).map((x) => x.trim());
            return { key: parts[0], unitCost: parts[1] };
          })
          .filter((r) => r.key && r.unitCost);
        try {
          const res = await api.bulkCosts(rows);
          rootEl.querySelector('#imp-out').innerHTML = `<div class="banner"><div><b>Listo</b><div>Se importaron ${res.applied} costos. Total cargado: ${res.total}.</div></div></div>`;
          setTimeout(async () => {
            closeModal();
            await load();
          }, 900);
        } catch (e) {
          rootEl.querySelector('#imp-out').innerHTML = `<div class="banner err"><div>${esc(e.message)}</div></div>`;
        }
      });
    },
  });
}

function availRow(label, endpoint, a) {
  const ok = a?.ok;
  return `<tr><td>${esc(label)}</td><td class="note mono">${esc(endpoint)}</td>
    <td><span class="badge ${ok ? 'good' : 'warn'}">${ok ? 'disponible' : 'no disponible'}</span>
    <div class="note">${esc(a?.note || '')}</div></td></tr>`;
}

function pctOf(a, b) {
  if (!isNum(a) || !isNum(b) || Number(b) === 0) return null;
  return (a / b) * 100;
}
