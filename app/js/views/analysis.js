import { api } from '../api.js';
import { esc, money, pctStr, num, isNum } from '../format.js';
import { state as appState } from '../app.js';

function cell(colName, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (!isNum(v)) return esc(v);
  if (/margen|pct|%/i.test(colName)) return pctStr(v);
  if (/unidades|cantidad|stock/i.test(colName)) return num(v);
  return money(v);
}

const QUESTIONS = [
  '¿Cuáles son mis 10 publicaciones más rentables?',
  '¿Cuáles venden mucho pero me dejan poca ganancia?',
  '¿Qué productos debería subir de precio?',
  '¿Qué productos tienen margen peligroso?',
  '¿Cuánto pagué en comisiones este mes?',
  '¿Cuánto me costaron las cuotas?',
  '¿Cuál fue mi producto más vendido?',
  '¿Cuál fue mi producto más rentable?',
  '¿Qué publicaciones están perdiendo contra la competencia?',
  '¿Qué productos debería revisar primero?',
  '¿Cuánto dinero realmente recibí este mes?',
  '¿Cuánto facturé sin IVA?',
  '¿Cuánto representa Mercado Libre de mis costos?',
  '¿Qué productos tienen stock bajo?',
];

export default function analysis(root, state) {
  root.innerHTML = `
    <div class="section">
      <div class="card card-pad">
        <div class="controls">
          <input type="text" id="q" placeholder="Preguntá sobre tus datos…" style="flex:1;min-width:260px">
          <button class="btn primary" id="ask">Analizar</button>
          <button class="btn" id="copy">Copiar contexto para Claude</button>
        </div>
        <div class="chips" style="margin-top:12px">
          ${QUESTIONS.map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
        </div>
        <div class="note" style="margin-top:12px">
          Todas las respuestas se calculan sobre los datos cargados en el período seleccionado. Si falta información, la respuesta dice exactamente qué falta en vez de estimarla.
        </div>
      </div>
    </div>
    <div class="section" id="out"></div>`;

  const input = root.querySelector('#q');
  const out = root.querySelector('#out');

  async function ask(question) {
    if (!question.trim()) return;
    input.value = question;
    out.innerHTML = '<div class="card card-pad"><div class="note">Analizando…</div></div>';
    try {
      const r = await api.ask({ question, ...appState.period });
      out.innerHTML = renderAnswer(r);
    } catch (e) {
      out.innerHTML = `<div class="banner err"><div>${esc(e.message)}</div></div>`;
    }
  }

  root.querySelector('#ask').addEventListener('click', () => ask(input.value));
  input.addEventListener('keydown', (e) => e.key === 'Enter' && ask(input.value));
  root.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));

  root.querySelector('#copy').addEventListener('click', async () => {
    try {
      const ctx = await api.context(appState.period);
      await navigator.clipboard.writeText(JSON.stringify(ctx, null, 2));
      root.querySelector('#copy').textContent = 'Copiado ✓';
      setTimeout(() => (root.querySelector('#copy').textContent = 'Copiar contexto para Claude'), 1800);
    } catch (e) {
      window.open(api.contextUrl(appState.period), '_blank');
    }
  });

  ask(QUESTIONS[0]);
}

function renderAnswer(r) {
  const list = (arr) => (Array.isArray(arr) ? arr.map((x) => `<li>${esc(x)}</li>`).join('') : `<li>${esc(arr)}</li>`);
  return `<div class="card">
    <div class="card-head"><h3>${esc(r.pregunta)}</h3><span class="hint">${esc(r.periodo)}</span></div>
    <div class="card-pad">
      <div style="margin-bottom:16px">
        <div class="note" style="font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:10.5px">Resultado</div>
        <ul style="margin:6px 0 0;padding-left:18px;line-height:1.7">${list(r.resultado)}</ul>
      </div>
      <div style="margin-bottom:16px">
        <div class="note" style="font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:10.5px">Recomendación</div>
        <div style="margin-top:4px">${esc(r.recomendacion)}</div>
      </div>
      <div class="grid g-2">
        <div>
          <div class="note" style="font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:10.5px">Datos utilizados</div>
          <div class="note" style="margin-top:4px">${esc(r.datos_utilizados)}</div>
          <div class="note" style="margin-top:6px">Fuente: <b>${esc(r.fuente || '')}</b></div>
        </div>
        <div>
          <div class="note" style="font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:10.5px">Cálculo</div>
          <div class="note" style="margin-top:4px">${esc(r.calculo)}</div>
        </div>
      </div>
      ${r.faltante?.length ? `<div class="banner err" style="margin-top:16px;margin-bottom:0"><div><b>Falta información</b><ul style="margin:6px 0 0;padding-left:18px">${list(r.faltante)}</ul></div></div>` : ''}
      ${r.tabla?.length ? tableOf(r.tabla) : ''}
    </div>
  </div>`;
}

function tableOf(rows) {
  const cols = Object.keys(rows[0]);
  return `<div class="table-wrap" style="margin-top:16px"><table>
    <thead><tr>${cols.map((c, i) => `<th class="no-sort ${i ? 'num' : ''}">${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c, i) => `<td class="${i ? 'num' : ''}">${cell(c, r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}
