import { stat, breakdownRows } from '../ui.js';
import { money, pctStr, esc, isNum, num, dateShort } from '../format.js';

const CONDITION_LABEL = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributo: 'Monotributo',
  exento: 'Exento / otra',
};

export default function tax(root, state) {
  const d = state.data;
  const t = d.totals;
  const s = state.settings;
  const ri = s.taxCondition === 'responsable_inscripto';
  const billing = d.billing;

  root.innerHTML = `
    <div class="section">
      <div class="banner">
        <div>
          <b>Esto es un cálculo de gestión, no una declaración jurada.</b>
          <div>Condición fiscal configurada: <b>${esc(CONDITION_LABEL[s.taxCondition] || s.taxCondition)}</b>. Las alícuotas son parámetros que cargaste vos en <a href="#/configuracion">Configuración</a>: Mercado Libre no informa qué tratamiento fiscal te corresponde. Validá todo con tu contador antes de usarlo para presentar.</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="grid g-4">
        ${stat({ label: 'Importe bruto (con IVA)', value: money(t.grossRevenue), hint: 'facturación del período' })}
        ${stat({ label: 'Importe neto sin IVA', value: money(t.netRevenue), hint: ri ? `alícuota ventas ${pctStr((s.vatRates.sales || 0) * 100)}` : 'no se discrimina' })}
        ${stat({ label: 'IVA débito', value: money(t.vatDebit), hint: 'contenido en tus ventas' })}
        ${stat({ label: ri ? 'IVA crédito por cargos de ML' : 'IVA en cargos de ML', value: money(t.vatCredit), hint: ri ? 'computable como crédito fiscal' : 'costo pleno, no computable' })}
      </div>
    </div>

    <div class="section">
      <h2>Cómo se descompone el período</h2>
      <div class="grid g-2">
        <div class="card card-pad">
          ${breakdownRows([
            { label: 'Facturación bruta (con IVA)', value: money(t.grossRevenue) },
            { label: `IVA débito (${pctStr((s.vatRates.sales || 0) * 100)})`, value: '− ' + money(t.vatDebit), neg: true },
            { label: 'Venta neta de IVA', value: money(t.netRevenue), total: true },
            { label: 'Comisión ML (con IVA)', value: money(t.commission) },
            { label: 'Envíos (con IVA)', value: money(t.shipping) },
            { label: 'Financiación (con IVA)', value: money(t.financing) },
            { label: 'Otros cargos (con IVA)', value: money(t.other) },
            { label: ri ? 'IVA crédito de cargos' : 'IVA incluido en cargos (no computable)', value: money(t.vatCredit), total: true },
            ...(ri ? [{ label: 'Saldo técnico de IVA del período', value: isNum(t.vatBalance) ? money(t.vatBalance) : '—', total: true }] : []),
          ])}
          ${ri ? '<div class="note" style="margin-top:10px">El saldo mostrado sólo considera ventas de Mercado Libre y cargos de la plataforma. No incluye el IVA crédito de tus compras de materia prima ni otras operaciones.</div>' : ''}
        </div>
        <div class="card card-pad">
          <div class="note" style="font-weight:600;margin-bottom:8px">Alícuotas aplicadas (parámetros tuyos)</div>
          <dl class="kv">
            ${Object.entries(s.vatRates).map(([k, v]) => `<dt>${esc(rateLabel(k))}</dt><dd>${pctStr((v || 0) * 100)}</dd>`).join('')}
          </dl>
          <div class="note" style="margin-top:12px">
            La app <b>no</b> asume 21% en todo: cada concepto tiene su propia alícuota configurable. Si un cargo de Mercado Libre te llega con otro tratamiento, cambialo en Configuración y todos los cálculos se rehacen.
          </div>
          ${s.otherTaxes?.enabled ? `<div class="note" style="margin-top:10px">Ingresos Brutos configurado: ${pctStr(s.otherTaxes.grossIncomePct)} — se muestra a título informativo, no está incluido en la ganancia.</div>` : ''}
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Comprobantes de Mercado Libre</h2>
      <div class="card">${billingBlock(billing, d)}</div>
    </div>

    <div class="section">
      <h2>IVA por publicación</h2>
      <div class="table-wrap"><table>
        <thead><tr><th class="no-sort">Publicación</th><th class="no-sort num">Bruto</th><th class="no-sort num">Neto sin IVA</th><th class="no-sort num">IVA débito</th><th class="no-sort num">IVA cargos</th></tr></thead>
        <tbody>${d.listings.filter((l) => l.unitsSold > 0).sort((a, b) => (b.period.grossRevenue || 0) - (a.period.grossRevenue || 0)).map((l) => `
          <tr><td class="tit"><span class="t">${esc(l.title)}</span><span class="s">${esc(l.sku || '—')}</span></td>
          <td class="num">${money(l.period.grossRevenue)}</td>
          <td class="num">${money(l.period.netRevenue)}</td>
          <td class="num">${money(l.period.vatDebit)}</td>
          <td class="num">${money(l.period.vatCredit)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Sin ventas en el período.</div></td></tr>'}
        </tbody></table></div>
    </div>`;
}

function billingBlock(billing, d) {
  if (!billing || !billing.available) {
    return `<div class="card-pad">
      <div class="banner err" style="margin-bottom:0"><div>
        <b>Facturación no disponible por API</b>
        <div>${esc(billing?.reason || d.availability?.billing?.note || 'Los comprobantes de Mercado Libre no están accesibles para esta aplicación.')}</div>
        <div class="note" style="margin-top:8px">Podés descargar los comprobantes desde tu cuenta de Mercado Libre (Ventas → Facturación) y cruzarlos con los cargos que la app calcula desde cada venta.</div>
      </div></div>
    </div>`;
  }
  return `<div class="table-wrap"><table>
    <thead><tr><th class="no-sort">Fecha</th><th class="no-sort">Concepto</th><th class="no-sort">Comprobante</th><th class="no-sort num">Importe</th></tr></thead>
    <tbody>${billing.documents.slice(0, 200).map((doc) => `<tr>
      <td>${esc(String(doc.date_created || doc.period || '').slice(0, 10))}</td>
      <td>${esc(doc.charge_info || doc.detail_type || doc.concept || '—')}</td>
      <td class="mono">${esc(doc.document_id || doc.invoice_id || '—')}</td>
      <td class="num">${money(doc.detail_amount ?? doc.amount)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function rateLabel(k) {
  return {
    sales: 'Ventas',
    commission: 'Comisión de Mercado Libre',
    shipping: 'Envíos',
    financing: 'Financiación',
    other: 'Otros cargos',
    productCost: 'Compras / costo de producto',
  }[k] || k;
}
