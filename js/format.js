const LOC = 'es-AR';

export const isNum = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));

export function money(v, { decimals = 0, dash = '—' } = {}) {
  if (!isNum(v)) return dash;
  return '$' + Number(v).toLocaleString(LOC, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function money2(v, dash = '—') {
  return money(v, { decimals: 2, dash });
}

export function compact(v, dash = '—') {
  if (!isNum(v)) return dash;
  const n = Math.abs(Number(v));
  if (n >= 1e9) return '$' + (v / 1e9).toLocaleString(LOC, { maximumFractionDigits: 2 }) + 'MM';
  if (n >= 1e6) return '$' + (v / 1e6).toLocaleString(LOC, { maximumFractionDigits: 2 }) + 'M';
  if (n >= 1e4) return '$' + (v / 1e3).toLocaleString(LOC, { maximumFractionDigits: 0 }) + 'K';
  return money(v);
}

export function num(v, dash = '—') {
  if (!isNum(v)) return dash;
  return Number(v).toLocaleString(LOC, { maximumFractionDigits: 0 });
}

export function pctStr(v, dash = '—') {
  if (!isNum(v)) return dash;
  return Number(v).toLocaleString(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

export function dateShort(d) {
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}`;
}

export function dateLong(d) {
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
}

export function dateTime(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 16).replace('T', ' ');
  return dt.toLocaleString(LOC, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Etiqueta del origen del dato: API de ML / parámetro tuyo / sin dato. */
export function sourceTag(source) {
  if (source === 'ml_api') return '<span class="src api" title="Valor informado por la API de Mercado Libre">API ML</span>';
  if (source === 'user_input') return '<span class="src user" title="Parámetro configurado por vos, no es dato de Mercado Libre">TU DATO</span>';
  if (source === 'mock') return '<span class="src" title="Dato de ejemplo">EJEMPLO</span>';
  if (source === 'derived') return '<span class="src" title="Calculado a partir de otros datos">CALCULADO</span>';
  if (source === 'missing') return '<span class="src missing" title="Mercado Libre no informó este dato y no se inventa">SIN DATO</span>';
  return '';
}

export function marginBadge(m) {
  if (!isNum(m)) return '<span class="badge">sin costo</span>';
  const cls = m < 0 ? 'bad' : m < 10 ? 'warn' : m < 20 ? '' : 'good';
  return `<span class="badge ${cls}">${pctStr(m)}</span>`;
}

export function signed(v, fmt = money2) {
  if (!isNum(v)) return '—';
  const s = fmt(Math.abs(v));
  return (v < 0 ? '−' : '+') + s.replace('$', '$');
}
