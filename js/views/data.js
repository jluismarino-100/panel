import { api } from '../api.js';
import { banner, openModal, closeModal } from '../ui.js';
import { esc, num, dateLong, isNum } from '../format.js';
import { load } from '../app.js';

/* ---------- Lectura de lo que pegás ---------- */
function splitRows(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  // Los reportes a veces traen títulos arriba de la tabla: el separador se
  // decide mirando varias líneas, no sólo la primera.
  const sample = lines.slice(0, 20);
  const count = (ch) => sample.reduce((a, l) => a + (l.split(ch).length - 1), 0);
  const d = sample.some((l) => l.includes('\t')) ? '\t' : count(';') > count(',') ? ';' : ',';
  return lines.map((l) => parseLine(l, d));
}
function parseLine(line, d) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === d && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
function toNum(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/[^\d,.\-]/g, '').trim();
  if (!s || s === '-') return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = s.length - lc - 1 <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  // Sólo puntos: en Argentina "180.000" es ciento ochenta mil, no 180.
  else if (ld > -1 && ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s))) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const MESES = { enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12' };
function toDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.toLowerCase().match(/(\d{1,2})\s*de\s*([a-záéíóú]+)\s*de\s*(\d{4})/);
  if (m && MESES[m[2]]) return `${m[3]}-${MESES[m[2]]}-${m[1].padStart(2, '0')}`;
  return null;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const TARGETS = {
  items: [
    ['title', 'Título', ['titulo', 'titulo de la publicacion', 'producto', 'descripcion', 'item', 'nombre']],
    ['sku', 'SKU', ['sku', 'codigo universal', 'codigo', 'codigo de producto', 'seller sku']],
    ['id', 'ID de publicación', ['id', 'codigo de publicacion', 'codigo de publicacion id', 'publicacion', 'mla']],
    ['price', 'Precio', ['precio', 'precio de venta', 'precio unitario', 'precio actual']],
    ['stock', 'Stock', ['stock', 'stock disponible', 'cantidad disponible', 'unidades disponibles']],
    ['type', 'Tipo de publicación', ['tipo de publicacion', 'tipo', 'exposicion']],
    ['installments', 'Cuotas', ['cuotas', 'cantidad de cuotas']],
    ['status', 'Estado', ['estado', 'status', 'situacion']],
    ['unitCost', 'Costo unitario', ['costo', 'costo unitario', 'costo del producto', 'precio de costo']],
  ],
  sales: [
    ['date', 'Fecha de venta', ['fecha', 'fecha de venta', 'fecha de la venta', 'fecha de creacion']],
    ['orderId', 'N.º de venta', ['n de venta', 'numero de venta', 'nro de venta', 'orden', 'venta', 'id de venta', 'operacion']],
    ['title', 'Producto', ['titulo de la publicacion', 'titulo', 'producto', 'descripcion', 'item']],
    ['sku', 'SKU', ['sku', 'codigo universal', 'codigo']],
    ['quantity', 'Unidades', ['unidades', 'cantidad', 'cant']],
    ['unitPrice', 'Precio unitario', ['precio unitario de venta de la publicacion', 'precio unitario', 'precio de venta', 'precio']],
    ['revenue', 'Ingresos por productos', ['ingresos por productos', 'total de la venta', 'importe', 'ingreso bruto', 'subtotal', 'total']],
    ['commission', 'Cargo por venta', ['cargo por venta e impuestos', 'cargo por venta', 'comision', 'comision por venta', 'tarifa de venta']],
    ['shipping', 'Costo de envío', ['costos de envio', 'costo de envio', 'envio', 'cargo por envio']],
    ['financing', 'Costo de cuotas', ['costo de cuotas', 'financiacion', 'cargo por financiacion', 'costo financiero']],
    ['other', 'Otros cargos', ['otros cargos']],
    ['installments', 'Cuotas', ['cuotas', 'cantidad de cuotas']],
  ],
  ads: [
    ['itemId', 'ID de la publicación', ['id de la publicacion', 'codigo de la publicacion', 'id del anuncio', 'codigo del anuncio', 'item id', 'mla', 'id']],
    ['title', 'Título del anuncio', ['titulo del anuncio', 'titulo de la publicacion', 'titulo', 'anuncio', 'producto']],
    ['campaign', 'Campaña', ['nombre de la campana', 'campana']],
    ['status', 'Estado', ['estado del anuncio', 'estado']],
    ['cost', 'Inversión', ['inversion', 'inversion moneda local', 'inversion total', 'costo', 'gasto', 'consumo']],
    ['clicks', 'Clics', ['clics', 'clicks']],
    ['prints', 'Impresiones', ['impresiones', 'prints']],
    ['directUnits', 'Ventas directas (unidades)', ['ventas directas', 'unidades vendidas directas', 'unidades directas']],
    ['indirectUnits', 'Ventas indirectas (unidades)', ['ventas indirectas', 'ventas asistidas', 'unidades indirectas']],
    ['directAmount', 'Ingresos por ventas directas', ['ingresos por ventas directas', 'ingresos directos', 'monto de ventas directas']],
    ['indirectAmount', 'Ingresos por ventas indirectas', ['ingresos por ventas indirectas', 'ingresos indirectos', 'ingresos asistidos']],
    ['totalAmount', 'Ingresos por publicidad', ['ingresos moneda local', 'ingresos', 'ingresos totales', 'ventas por publicidad moneda local', 'ingresos por publicidad']],
    ['organicUnits', 'Ventas sin publicidad (unidades)', ['ventas sin publicidad', 'unidades sin publicidad', 'ventas organicas']],
    ['organicAmount', 'Ingresos sin publicidad', ['ingresos sin publicidad', 'ingresos organicos']],
  ],
  competition: [
    ['sku', 'SKU o ID', ['sku', 'codigo', 'id']],
    ['priceToWin', 'Precio para ganar', ['precio para ganar', 'price to win', 'precio ganador', 'mejor precio']],
    ['compStatus', 'Estado en catálogo', ['estado', 'estado de competencia', 'situacion']],
  ],
};

function guessMap(headers, target) {
  const H = headers.map(norm);
  const map = {};
  for (const [key, , alts] of TARGETS[target]) {
    let best = -1, bs = 0;
    H.forEach((h, i) => {
      for (const a of alts) {
        const na = norm(a);
        let sc = 0;
        if (h === na) sc = 100;
        else if (h.startsWith(na) || na.startsWith(h)) sc = 70;
        else if (h.includes(na)) sc = 50;
        if (sc > bs) { bs = sc; best = i; }
      }
    });
    if (bs >= 50) map[key] = best;
  }
  return map;
}

/**
 * Los reportes de Mercado Libre a veces traen títulos y fechas arriba de la tabla.
 * Se busca como encabezado la primera fila (entre las primeras 15) donde se
 * reconocen al menos 2 columnas.
 */
function findHeaderRow(rows, target) {
  let best = 0, bestHits = 0;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const filled = rows[i].filter((c) => c !== '').length;
    if (filled < 2) continue;
    const hits = Object.keys(guessMap(rows[i], target)).length;
    if (hits > bestHits) { bestHits = hits; best = i; }
    if (hits >= 3) break;
  }
  return bestHits >= 2 ? best : 0;
}

/** Busca dos fechas en las filas de arriba del reporte (ej. "01/08/2026 - 31/08/2026"). */
function findDateRange(rows, upto) {
  const found = [];
  for (let i = 0; i < Math.min(upto + 1, rows.length); i++) {
    for (const c of rows[i]) {
      const ms = String(c).match(/\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}-\d{2}-\d{2}/g) || [];
      for (const m of ms) { const d = toDate(m); if (d) found.push(d); }
    }
  }
  if (found.length < 2) return null;
  found.sort();
  return { from: found[0], to: found[found.length - 1] };
}

const HELP = {
  items: 'En Mercado Libre entrá a <b>Mis publicaciones</b> y usá <b>Descargar Excel</b>. Abrí el archivo, seleccioná todo con Ctrl+E, copiá con Ctrl+C y pegá acá abajo.',
  sales: 'En Mercado Libre entrá a <b>Ventas</b> y usá <b>Exportar a Excel</b> eligiendo el período. Abrí el archivo, Ctrl+E, Ctrl+C y pegá acá abajo.',
  competition: 'Pegá dos columnas: SKU y el <b>precio para ganar</b> del catálogo. Opcionalmente una tercera con el estado (ganando / compartiendo / perdiendo).',
  ads: 'En Mercado Libre entrá a <b>Publicidad → Product Ads</b>, elegí el rango de fechas y descargá el reporte <b>por anuncio</b>. Abrí el archivo, Ctrl+E, Ctrl+C y pegá acá abajo. <b>Indicá las mismas fechas</b> que elegiste al descargarlo: el reporte es un total para ese rango.',
};
const TITLES = { items: 'Importar publicaciones', sales: 'Importar ventas', competition: 'Importar precios de catálogo', ads: 'Importar reporte de publicidad' };

function importModal(target) {
  const T = TARGETS[target];
  openModal({
    title: TITLES[target],
    wide: true,
    body: `
      <div class="banner"><div><b>De dónde sale este archivo</b><div>${HELP[target]}</div></div></div>
      ${target === 'ads' ? `<div class="controls" style="margin:10px 0">
        <label class="note">Desde <input type="date" id="ads-from"></label>
        <label class="note">Hasta <input type="date" id="ads-to"></label>
        <span class="note" id="ads-dates-note">las fechas del reporte</span>
      </div>` : ''}
      <textarea id="paste" rows="9" style="width:100%;font-family:ui-monospace,monospace;font-size:12px" placeholder="Pegá acá…"></textarea>
      <div id="mapzone" style="margin-top:14px"></div>
      <div id="impout" style="margin-top:12px"></div>`,
    footer: '<button class="btn" id="imp-cancel">Cancelar</button><button class="btn primary" id="imp-go" disabled>Importar</button>',
    onMount(root) {
      root.querySelector('#imp-cancel').addEventListener('click', closeModal);
      const ta = root.querySelector('#paste');
      const zone = root.querySelector('#mapzone');
      const out = root.querySelector('#impout');
      const go = root.querySelector('#imp-go');
      let rows = [], map = {}, hasHeader = true;

      ta.addEventListener('input', () => {
        rows = splitRows(ta.value);
        if (!rows.length) { zone.innerHTML = ''; go.disabled = true; return; }
        // Saltea títulos y líneas sueltas que haya arriba de la tabla.
        const hr = findHeaderRow(rows, target);
        if (target === 'ads' && hr > 0) {
          const dr = findDateRange(rows, hr - 1);
          const f = root.querySelector('#ads-from'), t = root.querySelector('#ads-to');
          if (dr && !f.value && !t.value) {
            f.value = dr.from; t.value = dr.to;
            root.querySelector('#ads-dates-note').textContent = 'fechas leídas del reporte: revisá que estén bien';
          }
        }
        rows = rows.slice(hr);
        const headers = rows[0];
        hasHeader = headers.some((h) => toNum(h) === null && h !== '');
        map = hasHeader ? guessMap(headers, target) : {};
        if (!hasHeader) T.forEach(([k], i) => { if (i < headers.length) map[k] = i; });
        zone.innerHTML = `
          <div class="controls" style="margin-bottom:8px">
            <b style="font-size:13px">Qué columna es cada cosa</b>
            <span class="note">${rows.length - (hasHeader ? 1 : 0)} filas detectadas</span>
          </div>
          <div class="grid g-3">
            ${T.map(([k, l]) => `
              <label class="note">${esc(l)}
                <select data-m="${k}" style="width:100%;margin-top:3px">
                  <option value="-1">— ninguna —</option>
                  ${headers.map((h, i) => `<option value="${i}" ${map[k] === i ? 'selected' : ''}>${esc(hasHeader ? (h || 'columna ' + (i + 1)) : 'columna ' + (i + 1))}</option>`).join('')}
                </select>
              </label>`).join('')}
          </div>
          <div class="note" style="margin-top:9px">Revisá que cada campo apunte a la columna correcta. Lo que dejes en “ninguna” queda sin dato y no se inventa.</div>`;
        zone.querySelectorAll('[data-m]').forEach((sel) => sel.addEventListener('change', () => { map[sel.dataset.m] = Number(sel.value); }));
        go.disabled = false;
      });

      go.addEventListener('click', async () => {
        const body = rows.slice(hasHeader ? 1 : 0);
        const get = (r, k) => { const i = map[k]; return i === undefined || i < 0 || i >= r.length ? null : r[i]; };
        const parsed = body.map((r) => {
          const o = {};
          for (const [k] of T) {
            const raw = get(r, k);
            if (k === 'date') o[k] = toDate(raw);
            else if (['price', 'stock', 'unitCost', 'quantity', 'unitPrice', 'revenue', 'commission', 'shipping', 'financing', 'other', 'installments', 'priceToWin', 'cost', 'clicks', 'prints', 'directUnits', 'indirectUnits', 'directAmount', 'indirectAmount', 'totalAmount', 'organicUnits', 'organicAmount'].includes(k)) o[k] = toNum(raw);
            else o[k] = raw;
          }
          return o;
        });
        let from = null, to = null;
        if (target === 'ads') {
          from = root.querySelector('#ads-from').value;
          to = root.querySelector('#ads-to').value;
          if (!from || !to) {
            out.innerHTML = '<div class="banner err"><div><b>Faltan las fechas</b><div>Indicá desde y hasta: son las mismas fechas que elegiste al descargar el reporte en Mercado Libre.</div></div></div>';
            return;
          }
        }
        go.disabled = true;
        out.innerHTML = '<div class="note">Importando…</div>';
        try {
          const fn = target === 'items' ? api.importItems : target === 'sales' ? api.importSales : target === 'ads' ? (r) => api.importAds({ from, to, rows: r }) : api.importCompetition;
          const res = await fn(parsed);
          const msg = target === 'items'
            ? `${res.nuevos} publicaciones nuevas y ${res.actualizados} actualizadas.`
            : target === 'sales'
              ? `${res.importadas} ventas importadas.`
              : target === 'ads'
                ? `${res.anuncios} anuncios con $${Math.round(res.inversion).toLocaleString('es-AR')} de inversión (${res.desde} a ${res.hasta}). Para verlos, elegí ese mismo período arriba.`
                : `${res.aplicados} publicaciones con precio de catálogo.`;
          out.innerHTML = `<div class="banner"><div><b>Listo</b><div>${esc(msg)}</div></div></div>`;
          setTimeout(async () => { closeModal(); await load(); }, 900);
        } catch (e) {
          out.innerHTML = `<div class="banner err"><div><b>No pude importar</b><div>${esc(e.message)}</div></div></div>`;
          go.disabled = false;
        }
      });
    },
  });
}

export default function data(root, state) {
  const d = state.data;
  const demo = d?.source === 'mock';
  const live = state.status?.dataSource === 'live';

  root.innerHTML = `
    ${live
      ? banner('', 'Estás conectado a tu cuenta real', 'Los datos vienen directo de la API de Mercado Libre. Esta sección sólo hace falta si querés volver a trabajar con exportaciones.')
      : demo
        ? banner('mock', 'Ahora mismo ves datos de ejemplo', 'Son publicaciones y ventas inventadas para que puedas recorrer el panel. En cuanto importes tus publicaciones, se reemplazan solas.')
        : banner('', 'Estás trabajando con tus datos', 'El panel usa las exportaciones que importaste. Cuando quieras actualizarlas, volvé a pegar la exportación nueva: las ventas repetidas no se duplican.')}

    <div class="section">
      <h2>Paso a paso</h2>
      <div class="grid g-2">
        <div class="card card-pad">
          <h3 style="margin:0 0 6px;font-size:14px">1 · Tus publicaciones</h3>
          <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2)">Mercado Libre → <b>Mis publicaciones</b> → <b>Descargar Excel</b>. Trae título, SKU, precio, stock y tipo de publicación.</p>
          <button class="btn primary" data-imp="items">Pegar publicaciones</button>
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 6px;font-size:14px">2 · Tus ventas</h3>
          <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2)">Mercado Libre → <b>Ventas</b> → <b>Exportar a Excel</b>. De acá salen la comisión, el envío y los cargos reales de cada operación.</p>
          <button class="btn primary" data-imp="sales">Pegar ventas</button>
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 6px;font-size:14px">3 · Tus costos <span class="note">imprescindible</span></h3>
          <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2)">Mercado Libre no sabe cuánto te cuesta fabricar una bacha. Sin este dato el panel muestra cuánta plata entra, pero no cuánto ganás.</p>
          <a class="btn primary" href="#/costos">Ir a cargar costos</a>
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 6px;font-size:14px">5 · Publicidad <span class="note">${live ? 'si la API no la trae' : 'opcional'}</span></h3>
          <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2)">Mercado Libre → <b>Publicidad → Product Ads</b> → descargar el reporte por anuncio. Con esto el panel calcula cuánto te cuesta la publicidad por cada venta.</p>
          <button class="btn" data-imp="ads">Pegar reporte de publicidad</button>
          <button class="btn ghost" id="ads-clear" style="margin-left:6px">Borrar reporte</button>
        </div>
        <div class="card card-pad">
          <h3 style="margin:0 0 6px;font-size:14px">4 · Competencia <span class="note">opcional</span></h3>
          <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2)">Para las publicaciones en catálogo, cargá el <b>precio para ganar</b> que te muestra Mercado Libre.</p>
          <button class="btn" data-imp="competition">Pegar precios de catálogo</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Qué hay cargado <span class="hint" id="sum-hint"></span></h2>
      <div class="grid g-4" id="sum"></div>
      <div class="controls" style="margin-top:12px">
        <button class="btn" id="reset">Borrar mis datos y volver al ejemplo</button>
        <span class="note">No toca nada en tu cuenta de Mercado Libre: sólo limpia lo importado en esta app.</span>
      </div>
    </div>`;

  root.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', () => importModal(b.dataset.imp)));
  root.querySelector('#ads-clear').addEventListener('click', async () => {
    if (!confirm('¿Borrar el reporte de publicidad importado? No toca nada en Mercado Libre.')) return;
    await api.clearAds();
    await load();
  });

  api.importSummary().then((s) => {
    const tile = (l, v, h) => `<div class="card stat"><div class="label">${esc(l)}</div><div class="value sm">${v}</div><div class="delta">${esc(h)}</div></div>`;
    document.getElementById('sum').innerHTML =
      tile('Publicaciones importadas', num(s.items), s.sinCosto ? `${s.sinCosto} sin costo cargado` : 'todas con costo') +
      tile('Ventas importadas', num(s.sales), s.desde ? `${dateLong(s.desde)} → ${dateLong(s.hasta)}` : 'ninguna todavía') +
      tile('Con competencia', num(s.conCompetencia), 'publicaciones en catálogo') +
      tile('Reporte de publicidad', s.ads ? num(s.ads.anuncios) + ' anuncios' : 'no cargado', s.ads ? `${dateLong(s.ads.desde)} → ${dateLong(s.ads.hasta)}` : 'opcional') +
      tile('Fuente activa', live ? 'Cuenta real' : s.tieneDatos ? 'Tus datos' : 'Ejemplo', live ? 'conectada por OAuth' : s.tieneDatos ? 'exportaciones importadas' : 'datos de demostración');
  }).catch(() => {});

  root.querySelector('#reset').addEventListener('click', async () => {
    if (!confirm('Esto borra las publicaciones y ventas que importaste en la app y vuelve a los datos de ejemplo. En tu cuenta de Mercado Libre no cambia nada. ¿Seguimos?')) return;
    await api.importReset();
    await load();
  });
}
