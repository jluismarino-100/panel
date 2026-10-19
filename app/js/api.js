/**
 * api.js de la VERSIÓN DE AFUERA.
 *
 * Es el único archivo distinto respecto del panel de la fábrica. Las pantallas
 * son exactamente las mismas: lo único que cambia es de dónde salen los datos.
 *
 *   Panel de la fábrica:  pantallas → api.js → servidor local → Mercado Libre
 *   Acá:                  pantallas → api.js → Supabase (el paquete subido)
 *
 * Todo lo que escribe está deshabilitado a propósito: esta versión es para
 * mirar. Y no hace falta confiar en que el botón esté apagado — la base de
 * datos tampoco deja escribir: el usuario sólo tiene permiso de lectura.
 */

const NUBE = { url: 'https://bwbwttwikfizocgkfunx.supabase.co', anon: 'sb_publishable_n0OxxHgMvSP990vrfa_myg_s1zFRtFX' };

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const borrar = (k) => { try { localStorage.removeItem(k); } catch {} };

let token = leer('nube-token');
let paquete = null;

export function haySesion() { return Boolean(token); }

export async function entrar(email, password) {
  const r = await fetch(`${NUBE.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: NUBE.anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = String(j.error_description || j.msg || j.message || '');
    if (/invalid login/i.test(m)) throw new Error('Mail o contraseña incorrectos.');
    if (/not confirmed/i.test(m)) throw new Error('El usuario está sin confirmar.');
    throw new Error(m || 'No pude entrar.');
  }
  token = j.access_token;
  guardar('nube-token', token);
  paquete = null;
  return true;
}

export function salir() {
  token = null;
  paquete = null;
  borrar('nube-token');
  location.reload();
}

/** Descomprime el paquete. Viene en gzip: pesa unas 20 veces menos. */
async function descomprimir(buffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Tu navegador es muy viejo para abrir el paquete. Probá con Chrome actualizado.');
  }
  const flujo = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(flujo).text();
}

/** Baja el paquete una sola vez por sesión y lo deja en memoria. */
async function bajar() {
  if (paquete) return paquete;
  if (!token) { const e = new Error('Entrá con tu usuario.'); e.code = 'SIN_SESION'; throw e; }

  const r = await fetch(`${NUBE.url}/storage/v1/object/datos/panel.json.gz?v=${Date.now()}`, {
    headers: { apikey: NUBE.anon, authorization: `Bearer ${token}` },
  });
  if (r.status === 401 || r.status === 403) {
    const e = new Error('Tu sesión venció. Entrá de nuevo.');
    e.code = 'SIN_SESION';
    throw e;
  }
  if (r.status === 404) {
    const e = new Error('Todavía no se subió ningún paquete desde la computadora de la fábrica. Ahí: Configuración → Subir a la nube.');
    e.code = 'SIN_DATOS';
    throw e;
  }
  if (!r.ok) throw new Error(`No pude bajar los datos (${r.status}).`);

  paquete = JSON.parse(await descomprimir(await r.arrayBuffer()));
  return paquete;
}

const SOLO_LECTURA = 'Esta es la versión para mirar: los cambios se hacen en el panel de la fábrica.';
const noSePuede = () => Promise.reject(Object.assign(new Error(SOLO_LECTURA), { code: 'SOLO_LECTURA' }));

export const api = {
  // ---- lectura ----
  config: async () => ({
    dataSource: 'live', baseUrl: location.origin, https: true, siteId: 'MLA',
    credentialsConfigured: true, redirectUri: '', currency: 'ARS', locale: 'es-AR',
  }),
  status: async () => {
    const p = await bajar();
    const cuenta = p.dataset?.account || {};
    return {
      credentialsConfigured: true,
      connected: true,
      userId: cuenta.id ?? cuenta.userId ?? null,
      dataSource: p.dataset?.source || 'live',
      soyRemoto: true,                       // enciende el modo "mirar, no tocar"
      subidoEl: p.generado || null,
    };
  },
  settings: async () => (await bajar()).settings || {},
  dataset: async () => (await bajar()).dataset,
  costs: async () => (await bajar()).costs || {},
  wholesale: async () => (await bajar()).wholesale || {},
  periods: async () => [],
  importSummary: async () => ({}),
  cloud: async () => ({ configurado: false }),
  access: async () => ({}),
  clearCache: async () => { paquete = null; return {}; },
  clearCacheAll: async () => { paquete = null; return {}; },
  contextUrl: () => '#',
  context: noSePuede,

  // ---- todo lo que escribe: apagado ----
  setCost: noSePuede, bulkCosts: noSePuede, saveSettings: noSePuede,
  saveWholesale: noSePuede, simulate: noSePuede, ask: noSePuede,
  prepareAction: noSePuede, executeAction: noSePuede,
  importItems: noSePuede, importSales: noSePuede, importCompetition: noSePuede,
  importAds: noSePuede, clearAds: noSePuede, importReset: noSePuede,
  setup: noSePuede, disconnect: noSePuede, saveAccess: noSePuede,
  saveCloud: noSePuede, cloudPush: noSePuede,
};
