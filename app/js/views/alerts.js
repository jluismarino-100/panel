import { esc, num } from '../format.js';
import { openDetail } from './listings.js';

const GROUPS = [
  { id: 'critical', label: 'Críticas', hint: 'perdés plata ahora' },
  { id: 'serious', label: 'Importantes', hint: 'corregir esta semana' },
  { id: 'warning', label: 'Para revisar', hint: 'tenelas en el radar' },
];

export default function alerts(root, state) {
  const d = state.data;
  const all = d.alerts;

  root.innerHTML = `
    <div class="section">
      <div class="grid g-3">
        ${GROUPS.map((g) => {
          const n = all.filter((a) => a.severity === g.id).length;
          return `<div class="card stat"><div class="label">${esc(g.label)}</div><div class="value">${num(n)}</div><div class="delta">${esc(g.hint)}</div></div>`;
        }).join('')}
      </div>
    </div>
    ${GROUPS.map((g) => {
      const rows = all.filter((a) => a.severity === g.id);
      if (!rows.length) return '';
      return `<div class="section">
        <h2>${esc(g.label)} <span class="hint">${rows.length}</span></h2>
        <div class="card">${rows
          .map(
            (a) => `<div class="alert" ${a.itemId ? `data-item="${esc(a.itemId)}" style="cursor:pointer"` : ''}>
              <span class="dot ${a.severity}"></span>
              <div style="flex:1">
                <div class="m">${esc(a.message)}</div>
                <div class="a">${esc(a.action)}${a.metrics ? ' · ' + esc(Object.entries(a.metrics).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')) : ''}</div>
              </div>
            </div>`
          )
          .join('')}</div>
      </div>`;
    }).join('')}
    ${all.length === 0 ? '<div class="card card-pad"><div class="empty">Sin alertas en el período. Todo dentro de los umbrales que configuraste.</div></div>' : ''}
    <div class="section">
      <div class="note">Los umbrales (margen mínimo, stock bajo, volumen, impacto de cuotas) se configuran en <a href="#/configuracion">Configuración</a>.</div>
    </div>`;

  root.querySelectorAll('[data-item]').forEach((el) =>
    el.addEventListener('click', () => {
      const l = d.listings.find((x) => x.id === el.dataset.item);
      if (l) openDetail(l, state);
    })
  );
}
