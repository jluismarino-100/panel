import { stat, openModal, closeModal, sortableTable } from '../ui.js';
import { api } from '../api.js';
import { money, pctStr, esc, isNum, num } from '../format.js';
import { state as appState } from '../app.js';

export default function competition(root, state) {
  const d = state.data;
  const inCatalog = d.listings.filter((l) => l.competition?.available);
  const winning = inCatalog.filter((l) => l.competition.status === 'winning');
  const sharing = inCatalog.filter((l) => l.competition.status === 'sharing_first_place');
  const losing = inCatalog.filter((l) => !['winning', 'sharing_first_place'].includes(l.competition.status));

  if (!inCatalog.length) {
    root.innerHTML = `<div class="card card-pad"><div class="empty">
      Ninguna de tus publicaciones tiene información de competencia disponible.<br>
      Mercado Libre sólo informa competencia para publicaciones que participan en <b>catálogo</b>.
      ${d.availability?.competition?.note ? `<div class="note" style="margin-top:10px">${esc(d.availability.competition.note)}</div>` : ''}
    </div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="section">
      <div class="grid g-4">
        ${stat({ label: 'En catálogo', value: num(inCatalog.length), hint: 'publicaciones con competencia' })}
        ${stat({ label: 'Ganando', value: num(winning.length), hint: 'primer puesto' })}
        ${stat({ label: 'Compartiendo', value: num(sharing.length), hint: 'empate en el primer puesto' })}
        ${stat({ label: 'Perdiendo', value: num(losing.length), hint: 'otro vendedor gana' })}
      </div>
    </div>

    <div class="section">
      <h2>Detalle por publicación</h2>
      <div id="cards"></div>
    </div>

    <div class="section">
      <h2>Resumen</h2>
      <div id="tbl"></div>
    </div>`;

  root.querySelector('#cards').innerHTML = [...losing, ...sharing, ...winning].map((l) => card(l)).join('');

  root.querySelectorAll('[data-price-action]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const l = d.listings.find((x) => x.id === btn.dataset.priceAction);
      openPriceFlow(l, state);
    })
  );

  sortableTable(root.querySelector('#tbl'), {
    columns: [
      { key: 'title', label: 'Publicación', render: (r) => `<div class="tit"><span class="t">${esc(r.title)}</span><span class="s">${esc(r.sku || '—')}</span></div>` },
      { key: 'statusLabel', label: 'Estado', render: (r) => `<span class="badge ${r.status === 'winning' ? 'good' : r.status === 'sharing_first_place' ? 'warn' : 'bad'}">${esc(r.statusLabel)}</span>` },
      { key: 'myPrice', label: 'Mi precio', num: true, render: (r) => money(r.myPrice) },
      { key: 'priceToWin', label: 'Precio para ganar', num: true, render: (r) => money(r.priceToWin) },
      { key: 'gap', label: 'Diferencia', num: true, render: (r) => (isNum(r.gap) ? `<span class="${r.gap > 0 ? 'neg' : 'pos'}">${money(r.gap)}</span>` : '—') },
      { key: 'gapPct', label: 'Dif. %', num: true, render: (r) => pctStr(r.gapPct) },
      { key: 'marginNow', label: 'Margen actual', num: true, render: (r) => pctStr(r.marginNow) },
      { key: 'competitors', label: 'Competidores', num: true, render: (r) => num(r.competitors) },
    ],
    rows: inCatalog.map((l) => ({
      title: l.title,
      sku: l.sku,
      status: l.competition.status,
      statusLabel: l.competition.statusLabel,
      myPrice: l.competition.myPrice,
      priceToWin: l.competition.priceToWin,
      gap: l.competition.priceGap,
      gapPct: l.competition.priceGapPct,
      marginNow: l.unitProfit.marginPct,
      competitors: l.competition.competitors.length,
    })),
    initialSort: { key: 'gap', dir: 'desc' },
  });
}

function card(l) {
  const c = l.competition;
  const cls = c.status === 'winning' ? 'good' : c.status === 'sharing_first_place' ? 'warn' : 'bad';
  const maxPrice = Math.max(...c.competitors.map((x) => x.price || 0), c.myPrice || 0, 1);

  return `<div class="card" style="margin-bottom:14px">
    <div class="card-head">
      <h3>${esc(l.title)}</h3>
      <span class="hint">${esc(l.sku || l.id)}</span>
      <span style="flex:1"></span>
      <span class="badge ${cls}">${esc(c.statusLabel)}</span>
    </div>
    <div class="card-pad">
      <div class="grid g-2-1">
        <div>
          <div class="note" style="margin-bottom:8px">Precios en el catálogo</div>
          ${c.competitors.length
            ? c.competitors
                .map(
                  (x) => `<div style="padding:5px 0">
                    <div style="display:flex;justify-content:space-between;gap:12px;font-size:12.5px;margin-bottom:3px">
                      <span style="${x.isMine ? 'font-weight:700' : ''}">${esc(x.sellerLabel)}${x.isWinner ? ' <span class="badge good">gana</span>' : ''}${x.freeShipping ? ' <span class="badge">envío gratis</span>' : ''}</span>
                      <span style="font-variant-numeric:tabular-nums;font-weight:600">${money(x.price)}</span>
                    </div>
                    <div style="height:7px;background:var(--surface-2);border-radius:4px;overflow:hidden">
                      <div style="height:100%;width:${((x.price || 0) / maxPrice) * 100}%;background:${x.isMine ? 'var(--s1)' : 'var(--s2)'};border-radius:4px"></div>
                    </div>
                  </div>`
                )
                .join('')
            : `<div class="note">Mercado Libre no devolvió la lista de competidores para este catálogo. Sí informó el estado y el precio para ganar.</div>
               <div style="margin-top:10px"><b>Mi publicación:</b> ${money(c.myPrice)} · <b>Precio para ganar:</b> ${money(c.priceToWin)}</div>`}
        </div>
        <div>
          <dl class="kv">
            <dt>Mi precio</dt><dd>${money(c.myPrice)}</dd>
            <dt>Precio para ganar</dt><dd>${money(c.priceToWin)}</dd>
            <dt>Diferencia</dt><dd>${money(c.priceGap)}</dd>
            <dt>Margen actual</dt><dd>${pctStr(l.unitProfit.marginPct)}</dd>
          </dl>
          ${c.factors?.length ? `<div class="note" style="margin-top:8px">Factores: ${esc(c.factors.join(', '))}</div>` : ''}
          ${c.recommendation ? `<div class="banner" style="margin-top:12px"><div><b>Recomendación</b><div>${esc(c.recommendation)}</div></div></div>` : ''}
          ${isNum(c.priceToWin) && c.status !== 'winning' ? `<button class="btn" data-price-action="${esc(l.id)}">Simular / cambiar precio…</button>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

async function openPriceFlow(l, state) {
  const target = l.competition.priceToWin;
  openModal({
    title: 'Simular cambio de precio',
    body: `<div class="note" style="margin-bottom:12px">La app <b>nunca</b> modifica un precio por su cuenta. Primero mirá el impacto y después confirmá.</div>
      <div style="font-weight:600;margin-bottom:10px">${esc(l.title)}</div>
      <div class="controls" style="margin-bottom:14px">
        <label class="note">Nuevo precio <input type="number" id="np" value="${target ?? l.price}" step="100" style="width:150px;margin-left:6px"></label>
        <button class="btn" id="calc">Calcular impacto</button>
      </div>
      <div id="out"><div class="note">Precio actual ${money(l.price)} · margen actual ${pctStr(l.unitProfit.marginPct)}</div></div>`,
    footer: `<button class="btn ghost" id="cancel">Cancelar</button><button class="btn primary" id="apply" disabled>Confirmar cambio en Mercado Libre</button>`,
    onMount(rootEl) {
      const np = rootEl.querySelector('#np');
      const out = rootEl.querySelector('#out');
      const applyBtn = rootEl.querySelector('#apply');
      let lastSim = null;

      rootEl.querySelector('#cancel').addEventListener('click', closeModal);

      rootEl.querySelector('#calc').addEventListener('click', async () => {
        out.innerHTML = '<div class="note">Calculando…</div>';
        applyBtn.disabled = true;
        try {
          const r = await api.simulate({ itemId: l.id, price: Number(np.value), ...appState.period });
          lastSim = r.result;
          const before = l.unitProfit;
          out.innerHTML = `<div class="grid g-2">
              <div class="card card-pad"><div class="note" style="font-weight:700">HOY — ${money(l.price)}</div>
                <dl class="kv"><dt>Neto recibido</dt><dd>${money(before.netReceived)}</dd><dt>Ganancia</dt><dd>${isNum(before.profit) ? money(before.profit) : '—'}</dd><dt>Margen</dt><dd>${pctStr(before.marginPct)}</dd></dl></div>
              <div class="card card-pad"><div class="note" style="font-weight:700">SIMULADO — ${money(Number(np.value))}</div>
                <dl class="kv"><dt>Neto recibido</dt><dd>${money(r.result.netReceived)}</dd><dt>Ganancia</dt><dd>${isNum(r.result.profit) ? money(r.result.profit) : '—'}</dd><dt>Margen</dt><dd>${pctStr(r.result.marginPct)}</dd></dl></div>
            </div>
            ${isNum(r.result.profit) && r.result.profit < 0 ? '<div class="banner err" style="margin-top:12px"><div><b>Cuidado</b><div>A ese precio la publicación queda a pérdida. Ganar el catálogo así te cuesta plata en cada venta.</div></div></div>' : ''}
            ${state.status?.dataSource !== 'live' ? '<div class="banner mock" style="margin-top:12px"><div><b>Modo datos de ejemplo</b><div>No se puede modificar nada en tu cuenta real desde este modo.</div></div></div>' : ''}`;
          applyBtn.disabled = state.status?.dataSource !== 'live';
        } catch (e) {
          out.innerHTML = `<div class="banner err"><div>${esc(e.message)}</div></div>`;
        }
      });

      applyBtn.addEventListener('click', async () => {
        if (!lastSim) return;
        const ok = confirm(`¿Confirmás cambiar el precio de "${l.title}" de $${l.price} a $${np.value} en tu cuenta real de Mercado Libre?`);
        if (!ok) return;
        applyBtn.disabled = true;
        try {
          const prep = await api.prepareAction({ type: 'update_price', itemId: l.id, currentPrice: l.price, newPrice: Number(np.value), marginAfter: lastSim.marginPct });
          const res = await api.executeAction({ token: prep.token });
          out.innerHTML = `<div class="banner"><div><b>Precio actualizado</b><div>${esc(l.title)} quedó en ${money(res.item?.price)}. Actualizá el tablero para ver el impacto.</div></div></div>`;
        } catch (e) {
          out.innerHTML = `<div class="banner err"><div>${esc(e.message)}</div></div>`;
          applyBtn.disabled = false;
        }
      });
    },
  });
}
