import { stat } from '../ui.js';
import { money, compact, num, pctStr, esc, isNum } from '../format.js';
import { lineChart, columnChart, barsH, stackedBar, chartCard, seriesColor } from '../charts.js';

export default function dashboard(root, state) {
  const d = state.data;
  const t = d.totals;
  const s = d.snapshot;

  const quick = (x) =>
    x.covered
      ? `${money(x.grossRevenue)} <span style="font-size:12px;color:var(--muted);font-weight:400">· ${x.orders} ventas</span>`
      : '<span style="font-size:14px;color:var(--muted)">sin datos en la ventana consultada</span>';

  const track = d.settings.trackCosts !== false;
  // Publicidad: sólo se suma a "lo que se lleva ML" si TODAS las ventas del
  // período tienen dato de publicidad; si no, se mezclarían ventas con y sin.
  const adsAll = t.adsCoverage === 'all';
  const adsAny = t.adsCoverage !== 'none';
  const takePct = adsAll ? t.totalPaidToMlPct : t.mlChargesPctOfRevenue;
  const profitValue = t.profitKnown ? money(t.profit) : '<span style="font-size:16px;color:var(--muted)">falta cargar costos</span>';

  root.innerHTML = `
    <div class="section">
      <div class="grid g-3">
        <div class="card stat"><div class="label">Ventas del día</div><div class="value sm">${quick(s.today)}</div></div>
        <div class="card stat"><div class="label">Últimos 7 días</div><div class="value sm">${quick(s.last7)}</div></div>
        <div class="card stat"><div class="label">Este mes</div><div class="value sm">${quick(s.month)}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="card card-pad" style="display:flex;flex-wrap:wrap;gap:26px;align-items:flex-end;">
        <div>
          <div style="font-size:12px;color:var(--ink-2)">Facturación bruta — ${esc(d.period.label)}</div>
          <div class="hero">${money(t.grossRevenue)}</div>
          <div class="note">${num(t.orders)} ventas · ${num(t.units)} unidades · ticket promedio ${money(t.avgTicket)}</div>
        </div>
        <div style="flex:1;min-width:240px;display:flex;gap:26px;flex-wrap:wrap;">
          <div><div class="note">Dinero neto recibido</div><div style="font-size:20px;font-weight:600">${money(t.netReceived)}</div></div>
          ${track ? `<div><div class="note">Ganancia estimada</div><div style="font-size:20px;font-weight:600" class="${t.profitKnown && t.profit < 0 ? 'neg' : ''}">${profitValue}</div></div>
          <div><div class="note">Margen</div><div style="font-size:20px;font-weight:600">${t.profitKnown ? pctStr(t.marginPct) : '—'}</div></div>`
          : `<div><div class="note">Se lleva Mercado Libre${adsAll ? ' (con publicidad)' : ''}</div><div style="font-size:20px;font-weight:600">${pctStr(takePct)}</div></div>
          <div><div class="note">Te queda${adsAll ? ' después de publicidad' : ''}</div><div style="font-size:20px;font-weight:600">${pctStr(100 - (takePct || 0))}</div></div>`}
        </div>
      </div>
      <div class="note" style="margin-top:8px">
        El <b>dinero neto recibido</b> es lo que Mercado Libre te deposita. La <b>publicidad</b> se cobra aparte, por eso se resta después. La <b>ganancia</b> resta además el costo del producto${d.settings.taxCondition === 'responsable_inscripto' ? ' y trabaja con importes netos de IVA' : ''}. No son lo mismo.
        ${!adsAny ? `<br>Publicidad: <span class="src missing">SIN DATO</span> ${esc(d.ads?.reason || '')} <a href="#/publicidad">Ver cómo cargarla →</a>` : t.adsCoverage === 'partial' ? `<br>La publicidad sólo cubre parte del período (${esc(d.ads?.coverage?.from || '')} a ${esc(d.ads?.coverage?.to || '')}), así que no se suma al total de lo que se lleva Mercado Libre.` : ''}
      </div>
    </div>

    <div class="section">
      <h2>Del bruto a la ganancia</h2>
      <div class="grid g-4">
        ${stat({ label: 'Facturación bruta', value: compact(t.grossRevenue), hint: 'lo que pagó el comprador' })}
        ${stat({ label: 'Comisiones Mercado Libre', value: compact(t.commission), hint: `${pctStr(pctOf(t.commission, t.grossRevenue))} de la facturación` })}
        ${stat({ label: 'Costos de envío', value: compact(t.shipping), hint: `${pctStr(pctOf(t.shipping, t.grossRevenue))} de la facturación` })}
        ${stat({ label: 'Costos de cuotas', value: compact(t.financing), hint: `${pctStr(pctOf(t.financing, t.grossRevenue))} de la facturación` })}
        ${stat({ label: 'Otros cargos', value: compact(t.other), hint: 'impuestos y cargos varios de la venta' })}
        ${stat({ label: 'Dinero neto recibido', value: compact(t.netReceived), hint: 'bruto − cargos de ML' })}
        ${adsAny ? stat({ label: 'Publicidad', value: compact(t.advertising), hint: `${pctStr(t.adsPctOfRevenue)} de la facturación${t.adsCoverage === 'partial' ? ' (período parcial)' : ''}`, tooltip: 'Product Ads cargada a las ventas del período. Se cobra aparte del depósito.' }) : ''}
        ${adsAny ? stat({ label: 'Te queda después de publicidad', value: adsAll ? compact(t.netAfterAds) : '—', hint: adsAll ? 'neto recibido − publicidad' : 'la publicidad no cubre todo el período' }) : ''}
        ${stat({ label: 'IVA débito de ventas', value: compact(t.vatDebit), hint: d.settings.taxCondition === 'responsable_inscripto' ? `crédito por cargos ${compact(t.vatCredit)}` : 'no aplica a tu condición' })}
        ${track
          ? stat({ label: 'Ganancia estimada', value: t.profitKnown ? compact(t.profit) : '—', hint: t.profitKnown ? `margen ${pctStr(t.marginPct)}` : `faltan costos en ${t.listingsWithoutCost} publicaciones` })
          : stat({ label: 'Ticket promedio', value: compact(t.avgTicket), hint: `${num(t.orders)} ventas · ${num(t.units)} unidades` })}
        ${adsAny ? stat({ label: 'Publicidad por unidad vendida', value: money(t.adsPerUnit), hint: 'promedio de todas tus ventas' }) : ''}
        ${adsAny ? stat({ label: 'Total que pagás a Mercado Libre', value: adsAll ? compact(t.totalPaidToMl) : '—', hint: adsAll ? `${pctStr(t.totalPaidToMlPct)} de la facturación, con publicidad` : 'la publicidad no cubre todo el período' }) : ''}
      </div>
    </div>

    <div class="section">
      <h2>Evolución diaria</h2>
      <div class="grid g-3" id="daily"></div>
    </div>

    <div class="section">
      <h2>Costos de Mercado Libre <span class="hint">${pctStr(adsAll ? t.totalPaidToMlPct : t.mlChargesPctOfRevenue)} de tu facturación bruta${adsAll ? ', con publicidad' : ''}</span></h2>
      <div class="card"><div class="card-pad" id="cost-mix"></div></div>
    </div>

    <div class="section">
      <h2>Productos</h2>
      <div class="grid g-3" id="rankings"></div>
    </div>

    <div class="section">
      <h2>Alertas <span class="hint">${d.alerts.length} en total</span></h2>
      <div class="card" id="alerts-preview"></div>
    </div>`;

  // --- gráficos diarios ---
  const daily = root.querySelector('#daily');
  const cards = [
    chartCard({
      title: 'Ventas por día',
      hint: 'unidades',
      render: (el) => columnChart(el, { data: d.series.map((r) => ({ date: r.date, value: r.units })), color: seriesColor(0), fmt: (v) => num(v), label: 'Unidades' }),
      tableHead: ['Día', 'Ventas', 'Unidades'],
      tableRows: d.series.map((r) => [r.date, num(r.orders), num(r.units)]),
    }),
    chartCard({
      title: 'Facturación por día',
      hint: 'ARS con IVA',
      render: (el) => lineChart(el, { data: d.series.map((r) => ({ date: r.date, value: r.grossRevenue })), color: seriesColor(1), fmt: (v) => compact(v), label: 'Facturación' }),
      tableHead: ['Día', 'Facturación', 'Neto recibido'],
      tableRows: d.series.map((r) => [r.date, money(r.grossRevenue), money(r.netReceived)]),
    }),
    track
      ? chartCard({
          title: 'Ganancia por día',
          hint: t.profitKnown ? 'después de costos' : 'incompleta: faltan costos',
          render: (el) => lineChart(el, { data: d.series.map((r) => ({ date: r.date, value: r.profit })), color: seriesColor(2), fmt: (v) => compact(v), label: 'Ganancia' }),
          tableHead: ['Día', 'Ganancia', 'Completo'],
          tableRows: d.series.map((r) => [r.date, money(r.profit), r.profitKnown ? 'sí' : 'faltan costos']),
        })
      : chartCard({
          title: 'Neto recibido por día',
          hint: 'lo que te deposita ML',
          render: (el) => lineChart(el, { data: d.series.map((r) => ({ date: r.date, value: r.netReceived })), color: seriesColor(2), fmt: (v) => compact(v), label: 'Neto recibido' }),
          tableHead: ['Día', 'Neto recibido', 'Facturación'],
          tableRows: d.series.map((r) => [r.date, money(r.netReceived), money(r.grossRevenue)]),
        }),
  ];
  daily.innerHTML = cards.map((c) => c.html).join('');
  cards.forEach((c) => c.mount(daily));

  // --- mix de costos ---
  stackedBar(root.querySelector('#cost-mix'), {
    fmt: (v) => money(v),
    segments: [
      { label: 'Comisión', value: t.commission, color: seriesColor(0) },
      { label: 'Envío', value: t.shipping, color: seriesColor(1) },
      { label: 'Cuotas', value: t.financing, color: seriesColor(2) },
      { label: 'Otros cargos', value: t.other, color: seriesColor(3) },
      ...(adsAll ? [{ label: 'Publicidad', value: t.advertising, color: seriesColor(4) }] : []),
    ],
  });

  // --- rankings ---
  const rk = root.querySelector('#rankings');
  const rankCards = [
    chartCard({
      title: 'Más vendidos',
      hint: 'unidades',
      render: (el) => barsH(el, { rows: d.rankings.topUnits.map((r) => ({ label: r.title, value: r.units, sub: { k: 'Facturación', v: money(r.revenue) } })), color: seriesColor(0), fmt: (v) => num(v), label: 'Unidades' }),
      tableHead: ['Producto', 'Unidades', 'Facturación'],
      tableRows: d.rankings.topUnits.map((r) => [esc(r.title), num(r.units), money(r.revenue)]),
    }),
    chartCard({
      title: track ? 'Mayor ganancia' : 'Más cargos de ML',
      hint: 'ARS en el período',
      render: (el) => barsH(el, track
        ? { rows: d.rankings.topProfit.map((r) => ({ label: r.title, value: r.profit, sub: { k: 'Margen', v: pctStr(r.margin) } })), color: seriesColor(2), fmt: (v) => money(v), label: 'Ganancia' }
        : { rows: [...d.listings].filter((l) => l.unitsSold > 0).sort((a, b) => (b.period.mlChargesTotal || 0) - (a.period.mlChargesTotal || 0)).slice(0, 8).map((l) => ({ label: l.title, value: l.period.mlChargesTotal, sub: { k: 'Facturación', v: money(l.period.grossRevenue) } })), color: seriesColor(2), fmt: (v) => money(v), label: 'Cargos de ML' }),
      tableHead: ['Producto', 'Ganancia', 'Margen'],
      tableRows: d.rankings.topProfit.map((r) => [esc(r.title), money(r.profit), pctStr(r.margin)]),
    }),
    chartCard({
      title: track ? 'Mayor margen' : 'Más peso de ML',
      hint: track ? '% sobre venta neta' : '% de la venta que se lleva ML',
      render: (el) => barsH(el, track
        ? { rows: d.rankings.topMargin.map((r) => ({ label: r.title, value: r.margin, sub: { k: 'Ganancia', v: money(r.profit) } })), color: seriesColor(3), fmt: (v) => pctStr(v), label: 'Margen' }
        : { rows: [...d.listings].filter((l) => l.unitsSold > 0 && l.period.mlChargesPctOfRevenue != null).sort((a, b) => b.period.mlChargesPctOfRevenue - a.period.mlChargesPctOfRevenue).slice(0, 8).map((l) => ({ label: l.title, value: l.period.mlChargesPctOfRevenue, sub: { k: 'Cargos', v: money(l.period.mlChargesTotal) } })), color: seriesColor(3), fmt: (v) => pctStr(v), label: 'Peso de ML' }),
      tableHead: ['Producto', 'Margen', 'Ganancia'],
      tableRows: d.rankings.topMargin.map((r) => [esc(r.title), pctStr(r.margin), money(r.profit)]),
    }),
  ];
  rk.innerHTML = rankCards.map((c) => c.html).join('');
  rankCards.forEach((c) => c.mount(rk));

  // --- alertas ---
  const ap = root.querySelector('#alerts-preview');
  const top = d.alerts.slice(0, 6);
  ap.innerHTML = top.length
    ? top.map((a) => `<div class="alert"><span class="dot ${a.severity}"></span><div><div class="m">${esc(a.message)}</div><div class="a">${esc(a.action)}</div></div></div>`).join('') +
      `<div class="alert"><a href="#/alertas" style="font-size:12.5px">Ver todas las alertas →</a></div>`
    : '<div class="empty">Sin alertas en el período.</div>';
}

function pctOf(a, b) {
  if (!isNum(a) || !isNum(b) || Number(b) === 0) return null;
  return (a / b) * 100;
}
