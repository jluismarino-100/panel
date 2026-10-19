import { api } from './api.js';
import { banner, closeModal } from './ui.js';
import { esc } from './format.js';

import dashboard from './views/dashboard.js';
import listings from './views/listings.js';
import sales from './views/sales.js';
import trends from './views/trends.js';
import profitability from './views/profitability.js';
import competition from './views/competition.js';
import costs from './views/costs.js';
import wholesale from './views/wholesale.js';
import adsView from './views/ads.js';
import tax from './views/tax.js';
import analysis from './views/analysis.js';
import alerts from './views/alerts.js';
import settingsView from './views/settings.js';
import dataView from './views/data.js';

/**
 * Período guardado. "Personalizado" se recuerda CON sus fechas; si por algún
 * motivo no están, se vuelve a 30 días (antes quedaba en "hoy" con las fechas
 * vacías y el panel mostraba un solo día sin avisar).
 */
function initialPeriod() {
  const get = (k) => {
    try {
      return localStorage.getItem(k) || '';
    } catch {
      return '';
    }
  };
  const period = get('period') || 'last30';
  const from = get('periodFrom');
  const to = get('periodTo');
  if (period === 'custom' && !(from && to)) return { period: 'last30', from: '', to: '' };
  return { period, from: period === 'custom' ? from : '', to: period === 'custom' ? to : '' };
}
function savePeriod(p) {
  try {
    localStorage.setItem('period', p.period);
    localStorage.setItem('periodFrom', p.from || '');
    localStorage.setItem('periodTo', p.to || '');
  } catch {}
}

export const state = {
  config: null,
  status: null,
  settings: null,
  data: null,
  loading: false,
  error: null,
  period: initialPeriod(),
};

const VIEWS = {
  dashboard: { title: 'Dashboard', icon: '▤', label: 'Dashboard', render: dashboard, needsData: true },
  publicaciones: { title: 'Mis publicaciones', icon: '▦', label: 'Mis publicaciones', render: listings, needsData: true },
  ventas: { title: 'Ventas', icon: '↗', label: 'Ventas', render: sales, needsData: true },
  evolucion: { title: 'Evolución', icon: '◪', label: 'Evolución', render: trends, needsData: true },
  rentabilidad: { title: 'Rentabilidad', icon: '%', label: 'Rentabilidad', render: profitability, needsData: true },
  competencia: { title: 'Competencia', icon: '◎', label: 'Competencia', render: competition, needsData: true },
  costos: { title: 'Costos y comisiones', icon: '◈', label: 'Costos y comisiones', render: costs, needsData: true },
  mayoristas: { title: 'Mayoristas', icon: '▥', label: 'Mayoristas', render: wholesale, needsData: true },
  publicidad: { title: 'Publicidad', icon: '◉', label: 'Publicidad', render: adsView, needsData: true },
  facturacion: { title: 'Facturación / IVA', icon: '§', label: 'Facturación / IVA', render: tax, needsData: true },
  alertas: { title: 'Alertas', icon: '!', label: 'Alertas', render: alerts, needsData: true },
};

const NAV_GROUPS = [
  { title: null, items: ['dashboard'] },
  { title: 'Operación', items: ['publicaciones', 'ventas', 'evolucion', 'rentabilidad', 'competencia'] },
  { title: 'Finanzas', items: ['costos', 'mayoristas', 'publicidad', 'facturacion'] },
  { title: 'Inteligencia', items: ['alertas'] },
];

const PERIODS = [
  ['today', 'Hoy'],
  ['last7', '7 días'],
  ['last30', '30 días'],
  ['this_month', 'Este mes'],
  ['last_month', 'Mes anterior'],
  ['last3m', '3 meses'],
  ['last6m', '6 meses'],
  ['this_year', 'Este año'],
  ['custom', 'Personalizado'],
];

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  return VIEWS[h] ? h : 'dashboard';
}

function renderNav() {
  const route = currentRoute();
  const alertCount = state.data?.alerts?.filter((a) => a.severity === 'critical' || a.severity === 'serious').length || 0;
  document.getElementById('nav').innerHTML = NAV_GROUPS.map(
    (g) => `${g.title ? `<div class="nav-sep">${esc(g.title)}</div>` : ''}${g.items
      .map((k) => {
        const v = VIEWS[k];
        const badge = k === 'alertas' && alertCount ? `<span class="nav-badge">${alertCount}</span>` : '';
        return `<a href="#/${k}" class="${route === k ? 'active' : ''}"><span class="ic">${v.icon}</span>${esc(v.label)}${badge}</a>`;
      })
      .join('')}`
  ).join('');

  const st = state.status;
  document.getElementById('conn-foot').innerHTML = st
    ? `<div><span class="conn-dot ${st.connected ? 'on' : 'off'}"></span>${st.connected ? `Conectado (${st.userId})` : 'Sin conectar'}</div>
       <div style="margin-top:3px">Fuente: <b>${state.data?.source === 'live' ? 'cuenta real' : state.data?.source === 'manual' ? 'tus datos' : 'datos de ejemplo'}</b></div>`
    : '';
}

function renderPeriodControls() {
  // Afuera se ve la foto que se subió desde la fábrica: no hay otro rango que pedir.
  const el = document.getElementById('period-controls');
  const d = state.data;
  el.innerHTML = d
    ? `<span class="note" style="white-space:nowrap">${d.period.label}</span>`
    : '';
}

/** Cambia el período desde cualquier vista (por ejemplo, "ver el rango del reporte"). */
export function setPeriod({ period, from = '', to = '' }) {
  state.period = { period, from, to };
  savePeriod(state.period);
  renderPeriodControls();
  load();
}

/**
 * Mientras la primera carga con la cuenta real está en curso, el navegador no
 * tiene nada que mostrar. En vez de un "Cargando…" mudo, se cuenta el tiempo y
 * se explica qué está haciendo, porque con cientos de publicaciones la primera
 * vez tarda varios minutos.
 */
let loadingTimer = null;
function startLoadingTicker() {
  clearInterval(loadingTimer);
  const started = Date.now();
  const live = state.status?.dataSource === 'live' || state.config?.dataSource === 'live';
  const tick = () => {
    const box = document.getElementById('loading-note');
    if (!box) {
      clearInterval(loadingTimer);
      return;
    }
    const s = Math.round((Date.now() - started) / 1000);
    const t = s < 60 ? `${s} segundos` : `${Math.floor(s / 60)} min ${s % 60} s`;
    box.innerHTML = live
      ? `Le estoy preguntando a Mercado Libre la comisión, el envío, las opiniones y la competencia de cada publicación.<br>
         La primera vez tarda varios minutos; después queda en caché y abre en segundos.<br>
         <b>${t}</b> transcurridos. No cierres esta ventana.`
      : `<b>${t}</b> transcurridos.`;
  };
  tick();
  loadingTimer = setInterval(tick, 1000);
}

export async function load() {
  state.loading = true;
  state.error = null;
  const content = document.getElementById('content');
  content.classList.add('skeleton-hold');
  try {
    const [status, settings] = await Promise.all([api.status(), api.settings()]);
    state.status = status;
    state.settings = settings;
    // Se dibuja el menú y el cartel de "cargando" apenas se sabe con qué cuenta
    // estamos trabajando, para no dejar la pantalla vacía durante la consulta larga.
    if (!state.data) render();
    state.data = await api.dataset(state.period);
    state.error = null;
  } catch (e) {
    state.error = e;
    state.data = null;
  } finally {
    state.loading = false;
    clearInterval(loadingTimer);
    content.classList.remove('skeleton-hold');
    render();
  }
}

export function render() {
  const route = currentRoute();
  const view = VIEWS[route];
  document.getElementById('view-title').textContent = view.title;
  document.getElementById('view-sub').textContent = state.data
    ? `${state.data.period.label} · ${state.data.period.from} → ${state.data.period.to}`
    : '';
  renderNav();
  const content = document.getElementById('content');

  if (state.loading && !state.data) {
    content.innerHTML = `<div class="loading" id="loading-box">
        <div>Cargando datos…</div>
        <div class="note" id="loading-note" style="margin-top:8px"></div>
      </div>`;
    startLoadingTicker();
    return;
  }

  let head = '';
  if (state.status?.soyRemoto) {
    head += banner('', 'Estás mirando desde otra computadora', 'Podés ver todo, pero los cambios (configuración, costos, precios) se hacen desde la computadora donde corre el panel.');
  }
  if (state.data?.source === 'mock') {
    head += banner('mock', 'Datos de ejemplo', 'Ningún número de esta pantalla es de tu cuenta. Andá a <a href="#/datos">Importar datos</a> y pegá tus publicaciones y ventas, o conectá la cuenta desde <a href="#/configuracion">Configuración</a>.');
  }
  if (state.error && view.needsData) {
    head += banner('err', 'No pude traer los datos', `${esc(state.error.message)}${state.error.code === 'NOT_CONNECTED' || state.error.code === 'NO_CREDENTIALS' ? ' <a href="#/configuracion">Ir a Configuración</a>' : ''}`);
    content.innerHTML = head;
    return;
  }
  for (const w of state.data?.warnings || []) {
    if (state.data.source === 'mock' && w.startsWith('Estás viendo')) continue;
    head += banner('', 'Atención', esc(w));
  }

  content.innerHTML = head + '<div id="view-root"></div>';
  const root = document.getElementById('view-root');
  try {
    // Algunas vistas son asíncronas (piden algo a la API antes de dibujar):
    // si fallan, el error tiene que mostrarse igual y no quedar suelto.
    const r = view.render(root, state);
    if (r && typeof r.catch === 'function') {
      r.catch((e) => {
        root.innerHTML = banner('err', 'Error al dibujar la vista', esc(e.message));
        console.error(e);
      });
    }
  } catch (e) {
    root.innerHTML = banner('err', 'Error al dibujar la vista', esc(e.message));
    console.error(e);
  }
}

// ---------- arranque ----------
window.addEventListener('hashchange', () => {
  closeModal();
  document.getElementById('app').classList.remove('nav-open');
  render();
});

document.getElementById('refresh-btn').addEventListener('click', async () => {
  await api.clearCache().catch(() => {});
  load();
});

/**
 * Imprimir o guardar en PDF.
 * Abre el diálogo del navegador; ahí, en "Destino", está la opción
 * "Guardar como PDF". Antes de abrirlo se arma un encabezado que dice qué
 * pantalla es, de qué período y cuándo se sacó, para que la hoja se entienda
 * sola cuando se la mostrás a alguien.
 */
document.getElementById('print-btn').addEventListener('click', () => {
  const view = VIEWS[currentRoute()];
  const cab = document.getElementById('print-head');
  const periodo = state.data
    ? `${state.data.period.label} · ${state.data.period.from} → ${state.data.period.to}`
    : 'sin datos cargados';
  const cuenta = state.status?.userId ? `Cuenta de Mercado Libre ${state.status.userId}` : '';
  const ahora = new Date().toLocaleString('es-AR');
  cab.innerHTML = `
    <div class="ph-titulo">${esc(view.title)}</div>
    <div class="ph-sub">${esc(periodo)}</div>
    <div class="ph-pie">Panel de rentabilidad · ${esc(cuenta)} · impreso el ${esc(ahora)}</div>`;
  window.print();
});

document.getElementById('menu-btn').addEventListener('click', () => {
  document.getElementById('app').classList.toggle('nav-open');
});

const themeBtn = document.getElementById('theme-btn');
const savedTheme = localStorage.getItem('theme');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  render();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => state.data && render(), 220);
});

(async function boot() {
  try {
    state.config = await api.config();
  } catch {}
  renderPeriodControls();
  await load();
})();
