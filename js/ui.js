import { esc, money, compact, pctStr, isNum } from './format.js';

export function stat({ label, value, hint, delta, deltaGood, small, tooltip }) {
  const d = isNum(delta) ? `<div class="delta ${delta >= 0 ? (deltaGood === false ? 'down' : 'up') : deltaGood === false ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${pctStr(Math.abs(delta))} vs. período anterior</div>` : hint ? `<div class="delta">${esc(hint)}</div>` : '';
  return `<div class="card stat"${tooltip ? ` title="${esc(tooltip)}"` : ''}>
    <div class="label">${esc(label)}</div>
    <div class="value ${small ? 'sm' : ''}">${value}</div>
    ${d}
  </div>`;
}

export function banner(kind, title, body) {
  return `<div class="banner ${kind}"><div><b>${esc(title)}</b><div>${body}</div></div></div>`;
}

let modalCleanup = null;
export function openModal({ title, body, footer, onMount, wide }) {
  closeModal();
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal" style="${wide ? 'max-width:980px' : ''}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="btn ghost" data-close>✕</button></div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div></div>`;
  root.querySelector('[data-close]').addEventListener('click', closeModal);
  root.querySelector('.modal-bg').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-bg')) closeModal();
  });
  const onKey = (e) => e.key === 'Escape' && closeModal();
  document.addEventListener('keydown', onKey);
  modalCleanup = () => document.removeEventListener('keydown', onKey);
  if (onMount) onMount(root);
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  if (modalCleanup) modalCleanup();
  modalCleanup = null;
}

/** Tabla ordenable + buscable. columns: [{key,label,num,render,sort}] */
export function sortableTable(container, { columns, rows, initialSort, emptyText = 'Sin resultados', onRowClick, rowId }) {
  let sortKey = initialSort?.key || columns[0].key;
  let sortDir = initialSort?.dir || 'desc';

  function render() {
    const sorted = [...rows].sort((a, b) => {
      const col = columns.find((c) => c.key === sortKey);
      const va = col?.sort ? col.sort(a) : a[sortKey];
      const vb = col?.sort ? col.sort(b) : b[sortKey];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    container.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>${columns.map((c) => `<th data-k="${c.key}" class="${c.num ? 'num' : ''}">${esc(c.label)}${sortKey === c.key ? `<span class="arrow">${sortDir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${sorted.length
        ? sorted.map((r) => `<tr ${rowId ? `data-id="${esc(rowId(r))}"` : ''} ${onRowClick ? 'style="cursor:pointer"' : ''}>${columns.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${columns.length}"><div class="empty">${esc(emptyText)}</div></td></tr>`}</tbody>
    </table></div>`;

    container.querySelectorAll('th[data-k]').forEach((th) =>
      th.addEventListener('click', () => {
        const k = th.dataset.k;
        if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else {
          sortKey = k;
          sortDir = 'desc';
        }
        render();
      })
    );
    if (onRowClick) {
      container.querySelectorAll('tbody tr[data-id]').forEach((tr) =>
        tr.addEventListener('click', () => onRowClick(rows.find((r) => String(rowId(r)) === tr.dataset.id)))
      );
    }
  }
  render();
  return { setRows(r) { rows = r; render(); } };
}

export function breakdownRows(items) {
  return items
    .map((it) => `<div class="wf-row ${it.total ? 'total' : ''}">
      <div class="l"><span>${esc(it.label)}</span>${it.tag || ''}</div>
      <div class="v ${it.neg ? 'neg' : it.pos ? 'pos' : ''}">${it.value}</div>
    </div>`)
    .join('');
}

export const money0 = money;
export const moneyC = compact;
