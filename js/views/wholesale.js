import { stat, openModal, closeModal } from '../ui.js';
import { api } from '../api.js';
import { money, pctStr, esc, isNum } from '../format.js';
import { load } from '../app.js';

const IVA = 0.21;
const conIva = (neto) => neto * (1 + IVA);
const sinIva = (bruto) => bruto / (1 + IVA);

export default async function wholesale(root, state) {
  const d = state.data;
  root.innerHTML = '<div class="section"><div class="card card-pad note">Calculando la lista mayorista…</div></div>';

  let cfg, costos;
  try {
    [cfg, costos] = await Promise.all([api.wholesale(), api.costs()]);
  } catch (e) {
    root.innerHTML = `<div class="section"><div class="card card-pad"><b>No pude leer la configuración mayorista.</b><div class="note">${esc(e.message)}</div></div></div>`;
    return;
  }

  const productos = armarProductos(d, cfg, costos);

  root.innerHTML = `
    <div class="section">
      <div class="card card-pad">
        <b>Lista de precios por cantidad.</b>
        <div class="note" style="margin-top:6px">
          Esta pantalla es una <b>calculadora</b>: no modifica ninguna publicación ni ningún precio en Mercado Libre.
          Los precios salen de tus costos cargados, de la comisión que informa Mercado Libre y del envío que pagaste de verdad en tus ventas.
          Se listan <b>únicamente las publicaciones activas</b>.
        </div>
        ${avisoExcluidas(productos.excluidas)}
      </div>
    </div>

    <div class="section">
      <div class="grid g-4">
        ${stat({ label: 'Productos activos', value: String(productos.length), hint: cfg.skuPrefixes.join(' · ') })}
        ${stat({ label: 'Con costo cargado', value: `${productos.filter((p) => p.costoNeto !== null).length} de ${productos.length}`, hint: productos.some((p) => p.costoNeto === null) ? 'faltan costos' : 'completo' })}
        ${stat({ label: 'Margen objetivo', value: `${cfg.targetMarginPct}%`, hint: 'sobre la venta neta de IVA' })}
        ${stat({ label: 'Escalones', value: cfg.tiers.join(' / '), hint: 'unidades por orden' })}
      </div>
    </div>

    <div class="section">
      <h2>Supuestos del cálculo</h2>
      <div class="card card-pad">
        <div class="controls" style="flex-wrap:wrap;gap:14px">
          <label>Margen objetivo
            <input type="number" id="w-margen" value="${cfg.targetMarginPct}" min="0" max="90" step="1" style="width:80px"> %
          </label>
          <label>Escalones
            <input type="text" id="w-tiers" value="${cfg.tiers.join(', ')}" style="width:140px">
          </label>
          <label>Envío cuando lleva varias unidades
            <select id="w-envio">
              <option value="una_por_orden" ${cfg.shippingModel === 'una_por_orden' ? 'selected' : ''}>Un solo envío por orden</option>
              <option value="escalonado" ${cfg.shippingModel === 'escalonado' ? 'selected' : ''}>Escalonado (1 completo + extra por unidad)</option>
              <option value="por_unidad" ${cfg.shippingModel === 'por_unidad' ? 'selected' : ''}>Un envío por unidad (como hoy)</option>
            </select>
          </label>
          <label id="w-extra-wrap" ${cfg.shippingModel === 'escalonado' ? '' : 'style="display:none"'}>Cada unidad extra suma
            <input type="number" id="w-extra" value="${cfg.shippingExtraPct}" min="0" max="100" step="5" style="width:70px"> % del envío
          </label>
          <button class="btn primary" id="w-guardar">Guardar supuestos</button>
        </div>
        <div class="note" style="margin-top:10px">
          <b>Ojo con el envío.</b> Mercado Libre cobra el envío <b>por orden</b>, no por unidad, pero el costo sube con el peso.
          De tus ${d.sales?.length ?? 0} ventas del período, ${cantidadMulti(d)} fueron de más de una unidad, así que todavía no hay
          suficientes casos reales para medirlo. Por eso el valor por defecto es el del medio: no supone un ahorro que Mercado Libre no confirmó.
          Cuando tengas ventas de 6 o más unidades, el panel lo va a medir solo.
        </div>
      </div>
    </div>

    <div id="w-listas"></div>`;

  pintarListas(root.querySelector('#w-listas'), productos, cfg);

  root.querySelector('#w-envio').onchange = (e) => {
    root.querySelector('#w-extra-wrap').style.display = e.target.value === 'escalonado' ? '' : 'none';
  };
  root.querySelector('#w-guardar').onclick = async (e) => {
    e.target.disabled = true;
    try {
      await api.saveWholesale({
        targetMarginPct: Number(root.querySelector('#w-margen').value),
        tiers: root.querySelector('#w-tiers').value.split(/[,\s]+/).filter(Boolean),
        shippingModel: root.querySelector('#w-envio').value,
        shippingExtraPct: Number(root.querySelector('#w-extra').value),
      });
      load();
    } finally {
      e.target.disabled = false;
    }
  };

  root.querySelectorAll('[data-cargar-costo]').forEach((b) => {
    b.onclick = () => modalCosto(b.dataset.cargarCosto, b.dataset.titulo);
  });
}

// ---------------------------------------------------------------------------

/**
 * Las publicaciones de la familia que NO están activas. No entran en la lista
 * —una lista mayorista de algo pausado no sirve— pero se nombran para que
 * quede claro por qué falta un producto que esperabas ver.
 */
function avisoExcluidas(excluidas) {
  if (!excluidas || !excluidas.length) return '';
  const ESTADOS = {
    paused: 'pausada',
    closed: 'cerrada',
    under_review: 'en revisión de Mercado Libre',
    inactive: 'inactiva',
  };
  const porEstado = new Map();
  for (const l of excluidas) {
    const e = ESTADOS[l.status] || l.status;
    porEstado.set(e, [...(porEstado.get(e) || []), String(l.sku || l.id).toUpperCase()]);
  }
  const detalle = [...porEstado.entries()]
    .map(([estado, skus]) => {
      const unicos = [...new Set(skus)];
      const muestra = unicos.slice(0, 6).join(', ');
      return `<b>${esc(String(skus.length))}</b> ${esc(estado)} (${esc(muestra)}${unicos.length > 6 ? ', …' : ''})`;
    })
    .join(' · ');
  return `<div class="note" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
    Quedaron afuera ${esc(String(excluidas.length))} publicaciones de estos mismos SKU por no estar activas: ${detalle}.
    Si querés alguna en la lista, primero hay que reactivarla en Mercado Libre.
  </div>`;
}

/**
 * ¿Este SKU pertenece a la familia?
 *
 * Coincide el SKU exacto (M10) y sus variantes pegadas (M10C, M20P, M20PC),
 * pero NO los que llevan guion (M10-DISP-G4): ésos son combos con grifería o
 * dispenser, otro producto y otro costo. Si alguno te interesa, agregalo como
 * prefijo propio en los supuestos (por ejemplo M10-DISP).
 */
function coincide(sku, prefijos) {
  if (!sku) return false;
  return prefijos.some((p) => {
    if (sku === p) return true;
    if (!sku.startsWith(p)) return false;
    return /^[A-Z0-9]/.test(sku.slice(p.length));
  });
}

function cantidadMulti(d) {
  return (d.sales || []).filter((s) => (s.quantity || 1) > 1).length;
}

function armarProductos(d, cfg, costos) {
  const prefijos = cfg.skuPrefixes.map((s) => s.toUpperCase());
  const delFamilia = (d.listings || []).filter((l) => coincide(String(l.sku || '').toUpperCase(), prefijos));

  // SÓLO publicaciones activas: una lista mayorista de algo pausado o en
  // revisión no sirve para vender. Las que quedan afuera se avisan aparte,
  // para que no parezca que el producto desapareció.
  const listings = delFamilia.filter((l) => l.status === 'active');
  const excluidas = delFamilia.filter((l) => l.status !== 'active');

  // Una fila por SKU: si hay publicaciones activas repetidas, se toma una y se
  // avisa de las demás en vez de contarlas dos veces.
  const porSku = new Map();
  for (const l of listings) {
    const sku = String(l.sku || '').toUpperCase();
    if (!porSku.has(sku)) porSku.set(sku, l);
  }

  const envios = enviosMedidos(d);

  const filas = [...porSku.entries()].map(([sku, l]) => {
    const duplicadas = listings.filter((x) => String(x.sku || '').toUpperCase() === sku && x.id !== l.id);
    const c = costos[sku] || costos[l.id] || null;
    const costoNeto = c ? (c.vatIncluded ? sinIva(Number(c.unitCost)) : Number(c.unitCost)) : null;
    const comisionPct = l.unitProfit?.charges?.commission?.percentage ?? null;
    const env = envios.get(sku) ?? cfg.shippingFallback ?? null;
    return {
      sku,
      id: l.id,
      titulo: l.title || sku,
      estado: l.status,
      precio: Number(l.price) || 0,
      comisionPct,
      costoNeto,
      costoOrigen: c ? (c.vatIncluded ? 'cargado con IVA' : 'cargado sin IVA') : null,
      envioUnidad: env,
      envioUnidades: envios.has(sku) ? envios.get(sku + '::n') : null,
      duplicadas,
      logistica: l.logisticType || null,
    };
  }).sort((a, b) => a.sku.localeCompare(b.sku));

  filas.excluidas = excluidas;
  return filas;
}

/** Envío real a tu cargo, promediado por unidad, sacado de las ventas del período. */
function enviosMedidos(d) {
  const acc = new Map();
  for (const s of d.sales || []) {
    const sku = String(s.sku || '').toUpperCase();
    if (!sku) continue;
    const monto = s.shipping?.amount;
    if (typeof monto !== 'number') continue;
    const q = s.quantity || 1;
    const a = acc.get(sku) || { total: 0, unidades: 0 };
    a.total += monto;
    a.unidades += q;
    acc.set(sku, a);
  }
  const out = new Map();
  for (const [sku, a] of acc) {
    if (!a.unidades) continue;
    out.set(sku, a.total / a.unidades);
    out.set(sku + '::n', a.unidades);
  }
  return out;
}

/** Costo de envío de una orden de n unidades, según el supuesto elegido. */
function envioOrden(envioUnidad, n, cfg) {
  if (!isNum(envioUnidad)) return null;
  if (cfg.shippingModel === 'por_unidad') return envioUnidad * n;
  if (cfg.shippingModel === 'una_por_orden') return envioUnidad;
  return envioUnidad * (1 + (cfg.shippingExtraPct / 100) * (n - 1));
}

/**
 * Precio que deja el margen objetivo.
 *
 *   venta neta × (1 − comisión − margen) = envío neto + costo neto × unidades
 *
 * El margen se mide sobre la venta NETA de IVA, igual que en el resto del panel.
 */
function calcularEscalon(p, n, cfg) {
  if (p.costoNeto === null || !isNum(p.comisionPct)) return null;
  const c = p.comisionPct / 100;
  const m = cfg.targetMarginPct / 100;
  const resto = 1 - c - m;
  if (resto <= 0) return { imposible: true };

  const envio = envioOrden(p.envioUnidad, n, cfg);
  const envioNeto = isNum(envio) ? sinIva(envio) : 0;
  const ventaNeta = (envioNeto + p.costoNeto * n) / resto;
  const unitNeto = ventaNeta / n;
  const unitBruto = conIva(unitNeto);
  const ganancia = ventaNeta * m;

  return {
    n,
    unitNeto,
    unitBruto,
    ganancia,
    gananciaUnidad: ganancia / n,
    envio,
    envioSinDato: !isNum(envio),
    descuentoPct: p.precio ? (1 - unitBruto / p.precio) * 100 : null,
    total: unitBruto * n,
  };
}

/** Lo que te queda HOY vendiendo una unidad al precio publicado. */
function hoy(p) {
  if (p.costoNeto === null || !isNum(p.comisionPct)) return null;
  const ventaNeta = sinIva(p.precio);
  const comision = ventaNeta * (p.comisionPct / 100);
  const envioNeto = isNum(p.envioUnidad) ? sinIva(p.envioUnidad) : 0;
  const ganancia = ventaNeta - comision - envioNeto - p.costoNeto;
  return { ganancia, margenPct: ventaNeta ? (ganancia / ventaNeta) * 100 : null, envioSinDato: !isNum(p.envioUnidad) };
}

function pintarListas(cont, productos, cfg) {
  if (!productos.length) {
    const hayInactivas = productos.excluidas?.length || 0;
    cont.innerHTML = `<div class="section"><div class="card card-pad">
      <b>No hay publicaciones activas con esos SKU.</b>
      <div class="note">Buscaba: ${esc(cfg.skuPrefixes.join(', '))}.
      ${hayInactivas ? `Encontré ${hayInactivas} publicación(es) con esos SKU, pero ninguna está activa.` : 'Revisá los prefijos en los supuestos.'}</div></div></div>`;
    return;
  }

  cont.innerHTML = productos.map((p) => {
    const h = hoy(p);
    const filas = cfg.tiers.map((n) => calcularEscalon(p, n, cfg));

    const avisos = [];
    if (p.duplicadas.length) avisos.push(`<span class="badge warn">${p.duplicadas.length} publicación(es) activa(s) más con el mismo SKU</span>`);
    if (p.envioUnidad === null) avisos.push('<span class="badge bad">sin envío medido: falta ese costo en el cálculo</span>');

    const cuerpo = p.costoNeto === null
      ? `<div class="card-pad">
           <b>Falta el costo de este producto.</b>
           <div class="note" style="margin:6px 0 10px">Sin el costo no se puede calcular ningún precio. No lo invento.</div>
           <button class="btn primary" data-cargar-costo="${esc(p.sku)}" data-titulo="${esc(p.titulo)}">Cargar el costo de ${esc(p.sku)}</button>
         </div>`
      : `<table style="font-size:12.5px">
           <thead><tr>
             <th class="no-sort">Cantidad</th>
             <th class="no-sort">Precio unitario<br><span class="note">sin IVA</span></th>
             <th class="no-sort">Precio unitario<br><span class="note">final con IVA</span></th>
             <th class="no-sort">Dto. vs. el precio de hoy</th>
             <th class="no-sort">Envío de la orden</th>
             <th class="no-sort">Te queda por unidad</th>
             <th class="no-sort">Te queda en la operación</th>
             <th class="no-sort">Total que paga el cliente</th>
           </tr></thead>
           <tbody>
             ${filas.map((f) => filaEscalon(f)).join('')}
           </tbody>
         </table>`;

    return `
    <div class="section">
      <h2>${esc(p.sku)} <span class="hint">${esc(p.titulo.slice(0, 70))}</span></h2>
      <div class="card">
        <div class="card-pad" style="border-bottom:1px solid var(--line, #e5e7eb)">
          <div class="grid g-4">
            ${stat({ label: 'Precio publicado hoy', value: money(p.precio), hint: p.estado === 'active' ? 'activa' : p.estado })}
            ${stat({ label: 'Costo (neto de IVA)', value: money(p.costoNeto), hint: p.costoOrigen || 'sin cargar' })}
            ${stat({ label: 'Comisión ML', value: isNum(p.comisionPct) ? `${p.comisionPct.toFixed(2)}%` : '—', hint: 'informada por Mercado Libre' })}
            ${stat({ label: 'Envío real por unidad', value: isNum(p.envioUnidad) ? money(p.envioUnidad) : '—', hint: isNum(p.envioUnidad) ? `promedio de ${p.envioUnidades ?? '?'} unidades vendidas` : 'Mercado Libre no lo informó' })}
          </div>
          ${h ? `<div class="note" style="margin-top:10px">Hoy, vendiendo <b>una</b> unidad a ${money(p.precio)}, te quedan <b>${money(h.ganancia)}</b> (${pctStr(h.margenPct)} sobre la venta neta)${h.envioSinDato ? ' — <b>sin descontar envío</b>, porque no hay dato' : ''}.</div>` : ''}
          ${avisos.length ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${avisos.join('')}</div>` : ''}
        </div>
        ${cuerpo}
      </div>
    </div>`;
  }).join('');
}

function filaEscalon(f) {
  if (!f) return '';
  if (f.imposible) {
    return `<tr><td colspan="8" class="note">El margen objetivo más la comisión superan el 100%: bajá el margen.</td></tr>`;
  }
  const destacar = f.n === 1 ? ' style="opacity:.75"' : '';
  return `<tr${destacar}>
    <td><b>${f.n}</b> ${f.n === 1 ? 'unidad' : 'unidades'}</td>
    <td>${money(f.unitNeto)}</td>
    <td><b>${money(f.unitBruto)}</b></td>
    <td>${isNum(f.descuentoPct) ? (f.descuentoPct >= 0 ? `−${f.descuentoPct.toFixed(1)}%` : `+${Math.abs(f.descuentoPct).toFixed(1)}%`) : '—'}</td>
    <td>${f.envioSinDato ? '<span class="note">sin dato</span>' : money(f.envio)}</td>
    <td>${money(f.gananciaUnidad)}</td>
    <td><b>${money(f.ganancia)}</b></td>
    <td>${money(f.total)}</td>
  </tr>`;
}

function modalCosto(sku, titulo) {
  openModal({
    title: `Costo de ${sku}`,
    body: `
      <div class="note" style="margin-bottom:10px">${esc(titulo)}</div>
      <label style="display:block;margin-bottom:10px">Costo por unidad
        <input type="number" id="mc-valor" step="0.01" style="width:100%;margin-top:4px" placeholder="por ejemplo 28500">
      </label>
      <label style="display:block;margin-bottom:10px">
        <input type="checkbox" id="mc-iva"> el valor que puse <b>incluye</b> IVA
      </label>
      <div class="note">Si es precio de lista sin IVA, dejá la casilla destildada.</div>`,
    footer: '<button class="btn" id="mc-cancel">Cancelar</button><button class="btn primary" id="mc-ok">Guardar</button>',
    onMount: (el) => {
      el.querySelector('#mc-cancel').onclick = closeModal;
      el.querySelector('#mc-ok').onclick = async () => {
        const valor = Number(el.querySelector('#mc-valor').value);
        if (!Number.isFinite(valor) || valor <= 0) return;
        await api.setCost({ key: sku, unitCost: valor, vatIncluded: el.querySelector('#mc-iva').checked, note: 'Cargado desde Mayoristas' });
        closeModal();
        load();
      };
    },
  });
}
