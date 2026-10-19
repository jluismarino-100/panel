import { api } from '../api.js';
import { esc, pctStr } from '../format.js';
import { load } from '../app.js';

export default function settings(root, state) {
  const st = state.status || {};
  const remoto = Boolean(st.soyRemoto);
  const s = state.settings || {};
  const params = new URLSearchParams(location.hash.split('?')[1] || '');

  root.innerHTML = `
    ${remoto ? '<div class="banner"><div><b>Sólo lectura</b><div>Entraste desde otra computadora. Esta pantalla te muestra cómo está configurado el panel, pero para cambiar algo tenés que hacerlo en la computadora donde corre.</div></div></div>' : ''}
    ${params.get('conectado') ? '<div class="banner"><div><b>Cuenta conectada</b><div>El panel ya trabaja con los datos reales de tu cuenta de Mercado Libre.</div></div></div>' : ''}
    ${params.get('error') ? `<div class="banner err"><div><b>No se pudo conectar</b><div>${esc(params.get('error'))}</div></div></div>` : ''}

    <div class="section">
      <h2>Conexión con Mercado Libre</h2>
      <div class="card card-pad">
        <dl class="kv" style="margin-bottom:14px">
          <dt>Credenciales en el archivo .env</dt><dd>${st.credentialsConfigured ? '<span class="badge good">configuradas</span>' : '<span class="badge bad">faltan</span>'}</dd>
          <dt>Cuenta conectada</dt><dd>${st.connected ? `<span class="badge good">sí — usuario ${esc(String(st.userId))}</span>` : '<span class="badge">no</span>'}</dd>
          <dt>Fuente de datos activa</dt><dd>${st.dataSource === 'live' ? '<span class="badge info">cuenta real</span>' : '<span class="badge warn">datos de ejemplo</span>'}</dd>
          ${st.connectedAt ? `<dt>Conectada el</dt><dd>${esc(new Date(st.connectedAt).toLocaleString('es-AR'))}</dd>` : ''}
          ${st.connected ? `<dt>Renovación automática</dt><dd>${st.autoRenew
            ? `<span class="badge good">activada</span> — no hace falta volver a autorizar${st.renewableUntil ? `. Se mantiene sola mientras abras el panel antes del ${esc(new Date(st.renewableUntil).toLocaleDateString('es-AR'))}` : ''}`
            : '<span class="badge warn">no disponible</span> — esta conexión es vieja, reconectá una vez y queda activada'}</dd>` : ''}
          ${st.scope ? `<dt>Permisos</dt><dd class="mono">${esc(st.scope)}</dd>` : ''}
        </dl>
        <div class="controls">
          <a class="btn primary ${st.credentialsConfigured ? '' : 'disabled'}" href="/api/auth/login" ${st.credentialsConfigured ? '' : 'onclick="return false"'}>${st.connected ? 'Reconectar' : 'Conectar con Mercado Libre'}</a>
          ${st.connected ? '<button class="btn danger" id="disc">Desconectar</button>' : ''}
        </div>
        ${!st.credentialsConfigured ? `<div class="banner" style="margin-top:16px;margin-bottom:0;display:block">
          <b style="font-size:14px">Paso 1 — Crear tu aplicación en Mercado Libre</b>
          <div style="margin:6px 0 14px">
            Entrá a <a href="https://developers.mercadolibre.com.ar/devcenter" target="_blank" rel="noopener">developers.mercadolibre.com.ar/devcenter</a>,
            apretá <b>Crear aplicación</b> y completá el formulario.<br>
            En <b>URI de redirect</b> pegá exactamente esto, sin barra al final:
            <div style="display:flex;gap:8px;align-items:center;margin:6px 0">
              <span class="mono" style="background:var(--surface-2);padding:5px 9px;border-radius:6px">${esc(state.config?.redirectUri || 'http://localhost:4321/api/auth/callback')}</span>
              <button class="btn sm" id="copy-uri">Copiar</button>
            </div>
            En <b>Flujos OAuth</b> tildá <b>Authorization Code</b> y <b>Refresh Token</b>. En <b>Negocios</b> tildá <b>Mercado Libre</b>.
            En <b>Permisos</b> pedí lectura de usuarios, publicaciones, órdenes, envíos y facturación (y escritura en publicaciones si querés poder cambiar precios desde acá).
            Guardá, y Mercado Libre te va a mostrar dos datos.
          </div>

          <b style="font-size:14px">Paso 2 — Pegá acá esos dos datos</b>
          <div class="note" style="margin:4px 0 10px">Se guardan en un archivo de esta computadora. No viajan a ningún lado ni se muestran nunca más en pantalla.</div>
          <div class="grid g-2" style="max-width:640px">
            <label class="note">App ID
              <input type="text" id="cid" placeholder="1234567890123456" autocomplete="off" style="width:100%;margin-top:3px">
            </label>
            <label class="note">Secret Key
              <input type="password" id="csec" placeholder="••••••••••••••••" autocomplete="off" style="width:100%;margin-top:3px">
            </label>
          </div>
          <div class="controls" style="margin-top:12px">
            <button class="btn primary" id="save-creds">Guardar y conectar</button>
            <span class="note" id="creds-msg"></span>
          </div>
        </div>` : ''}
        <div class="note" style="margin-top:14px">
          Nunca se te pide tu contraseña de Mercado Libre: la ingresás en el sitio de Mercado Libre y la app sólo recibe un permiso.
          Los tokens se guardan <b>cifrados</b> en tu equipo (<span class="mono">data/secure/</span>), nunca llegan al navegador ni se muestran en pantalla.
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Condición fiscal e IVA</h2>
      <div class="card card-pad">
        <div class="controls" style="margin-bottom:14px">
          <label class="note">Condición
            <select id="cond" style="margin-left:6px">
              <option value="responsable_inscripto" ${s.taxCondition === 'responsable_inscripto' ? 'selected' : ''}>Responsable Inscripto</option>
              <option value="monotributo" ${s.taxCondition === 'monotributo' ? 'selected' : ''}>Monotributo</option>
              <option value="exento" ${s.taxCondition === 'exento' ? 'selected' : ''}>Exento / otra</option>
            </select>
          </label>
          <label class="note"><input type="checkbox" id="costVat" ${s.productCostVatIncluded ? 'checked' : ''}> los costos que cargo incluyen IVA</label>
          <label class="note"><input type="checkbox" id="trackCosts" ${s.trackCosts !== false ? 'checked' : ''}> seguir ganancia y margen (necesita que cargues los costos)</label>
          <label class="note" title="Mercado Ads informa la inversión y el IVA se suma en la factura. Si en tu factura ves que no es así, tildalo."><input type="checkbox" id="adsVat" ${s.adsCostIncludesVat ? 'checked' : ''}> la inversión en publicidad que informa Mercado Ads ya incluye IVA</label>
        </div>
        <div class="grid g-3">
          ${Object.entries(s.vatRates || {}).map(([k, v]) => `
            <label class="note">${esc(rateLabel(k))}
              <input type="number" step="0.5" data-rate="${k}" value="${((v || 0) * 100).toFixed(1)}" style="width:90px;margin-left:6px"> %
            </label>`).join('')}
        </div>
        <div class="note" style="margin-top:12px">La app no asume 21% en todo. Si un cargo tiene otro tratamiento, cambialo acá y todos los cálculos se rehacen. Consultá con tu contador qué corresponde en tu caso.</div>
      </div>
    </div>

    <div class="section">
      <h2>Costo de financiación cuando Mercado Libre no lo informa</h2>
      <div class="card card-pad">
        <label class="note"><input type="checkbox" id="finEnabled" ${s.financingFallback?.enabled ? 'checked' : ''}> usar tasas propias como respaldo</label>
        <div class="grid g-4" style="margin-top:12px">
          ${Object.entries(s.financingFallback?.ratesByInstallments || {}).map(([q, v]) => `
            <label class="note">${esc(q)} cuotas
              <input type="number" step="0.5" data-fin="${q}" value="${((v || 0) * 100).toFixed(1)}" style="width:80px;margin-left:6px"> %
            </label>`).join('')}
        </div>
        <div class="note" style="margin-top:12px">Mientras esté desactivado, el costo de cuotas que Mercado Libre no informe aparece como <b>SIN DATO</b> y no se estima. Si lo activás, esos importes quedan marcados como <b>TU DATO</b>, no como dato de Mercado Libre.</div>
      </div>
    </div>

    <div class="section">
      <h2>Umbrales de alertas</h2>
      <div class="card card-pad">
        <div class="grid g-3">
          ${[
            ['minMarginPct', 'Margen mínimo aceptable (%)'],
            ['lowStock', 'Stock bajo (unidades)'],
            ['highVolumeUnits', 'Volumen alto (unidades)'],
            ['lowProfitPct', 'Margen bajo con volumen (%)'],
            ['financingMarginDropPts', 'Caída de margen por cuotas (puntos)'],
            ['competitorPriceDropPct', 'Baja de precio de competidor (%)'],
            ['maxAdsPctOfPrice', 'Publicidad por unidad: máximo (% del precio)'],
            ['adsSpendWithoutSalesMin', 'Publicidad sin ventas: avisar desde ($)'],
          ].map(([k, label]) => `
            <label class="note">${esc(label)}
              <input type="number" data-th="${k}" value="${s.alertThresholds?.[k] ?? ''}" style="width:90px;margin-left:6px">
            </label>`).join('')}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="controls">
        <button class="btn primary" id="save">Guardar configuración</button>
        <button class="btn" id="clear" title="Obliga a volver a pedirle todo a Mercado Libre. La próxima carga va a tardar varios minutos.">Vaciar toda la caché</button>
        <span class="note" id="saved"></span>
      </div>
    </div>

    <div class="section">
      <h2>Ver el panel desde casa (nube)</h2>
      <div class="card card-pad" id="nube">
        <div class="note">Cargando…</div>
      </div>
    </div>

    <div class="section">
      <h2>Acceso desde otra computadora</h2>
      <div class="card card-pad" id="acceso">
        <div class="note">Cargando…</div>
      </div>
    </div>

    <div class="section">
      <h2>Seguridad</h2>
      <div class="card card-pad note" style="line-height:1.8">
        · El servidor escucha sólo en <span class="mono">127.0.0.1</span>, salvo que actives el acceso desde otra computadora (ahí pide clave y esas sesiones son de sólo lectura).<br>
        · El <span class="mono">client_secret</span> vive únicamente en el archivo <span class="mono">.env</span>, del lado del servidor.<br>
        · Los access y refresh tokens se guardan cifrados con AES-256-GCM y nunca se envían al navegador.<br>
        · No se usa <span class="mono">localStorage</span> para credenciales (sólo para el tema y el período elegido).<br>
        · Toda acción que modifique precio, stock o estado de una publicación pide confirmación explícita antes de ejecutarse.<br>
        · Los costos que cargás quedan en tu equipo, en <span class="mono">data/costs.json</span>.
      </div>
    </div>`;

  // ---------- Nube (Supabase) ----------
  renderNube(root.querySelector('#nube'), state, remoto);

  // ---------- Acceso desde otra computadora ----------
  const accBox = root.querySelector('#acceso');
  if (remoto) {
    accBox.innerHTML = '<div class="note">El acceso desde otras computadoras se configura en la computadora donde corre el panel.</div>';
  } else api.access().then((a) => {
    accBox.innerHTML = `
      <div class="note" style="line-height:1.7;margin-bottom:14px">
        Por ahora el panel se abre <b>sólo en esta computadora</b>. Si lo activás, se puede entrar desde otra computadora
        <b>de la misma red</b> (la de tu oficina o fábrica) poniendo una clave.
        Quien entra desde otra computadora <b>puede mirar todo pero no puede cambiar nada</b>: ni la configuración, ni las claves de Mercado Libre, ni precios o stock.
        Esta computadora tiene que quedar prendida y con el panel abierto.
      </div>
      <dl class="kv" style="margin-bottom:14px">
        <dt>Estado</dt><dd>${a.enabled ? '<span class="badge good">activado</span>' : '<span class="badge">desactivado</span>'}</dd>
        <dt>Clave</dt><dd>${a.tienePassword ? '<span class="badge good">puesta</span>' : '<span class="badge warn">sin poner</span>'}</dd>
      </dl>
      ${a.enabled && a.direcciones?.length ? `<div class="note" style="margin-bottom:14px">En la otra computadora, escribí en el navegador:<br>${a.direcciones.map((u) => `<span class="mono" style="background:var(--surface-2);padding:4px 8px;border-radius:6px;display:inline-block;margin-top:5px">${esc(u)}</span>`).join('<br>')}<br>La primera vez el navegador va a avisar por el certificado: Avanzado → Continuar.</div>` : ''}
      <div class="grid g-2" style="max-width:640px">
        <label class="note">${a.tienePassword ? 'Cambiar la clave (opcional)' : 'Clave de acceso'}
          <input type="password" id="acc-pass" placeholder="mínimo 6 caracteres" autocomplete="new-password" style="width:100%;margin-top:3px">
        </label>
        <label class="note" style="display:flex;align-items:flex-end;gap:8px">
          <input type="checkbox" id="acc-on" ${a.enabled ? 'checked' : ''}> permitir entrar desde otra computadora de la red
        </label>
      </div>
      <div class="controls" style="margin-top:12px">
        <button class="btn primary" id="acc-save">Guardar</button>
        <span class="note" id="acc-msg"></span>
      </div>`;
    accBox.querySelector('#acc-save').addEventListener('click', async () => {
      const msg = accBox.querySelector('#acc-msg');
      msg.textContent = 'Guardando…';
      try {
        const r = await api.saveAccess({ enabled: accBox.querySelector('#acc-on').checked, password: accBox.querySelector('#acc-pass').value });
        msg.innerHTML = r.enabled
          ? `Listo. <b>Cerrá la ventana negra y abrí el panel de nuevo</b> para que empiece a escuchar en la red.${r.direcciones?.length ? ` Después, desde la otra computadora entrá a <span class="mono">${esc(r.direcciones[0])}</span>` : ''}`
          : 'Listo: el panel vuelve a abrirse sólo en esta computadora. Reiniciá para aplicarlo.';
      } catch (e) {
        msg.innerHTML = `<span style="color:var(--critical)">${esc(e.message)}</span>`;
      }
    });
  }).catch(() => {
    accBox.innerHTML = '<div class="note">No pude leer el estado del acceso.</div>';
  });

  root.querySelector('#copy-uri')?.addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(state.config?.redirectUri || 'http://localhost:4321/api/auth/callback');
      e.target.textContent = 'Copiado ✓';
      setTimeout(() => (e.target.textContent = 'Copiar'), 1600);
    } catch {}
  });

  root.querySelector('#save-creds')?.addEventListener('click', async () => {
    const msg = root.querySelector('#creds-msg');
    const btn = root.querySelector('#save-creds');
    const clientId = root.querySelector('#cid').value.trim();
    const clientSecret = root.querySelector('#csec').value.trim();
    msg.textContent = 'Guardando…';
    btn.disabled = true;
    try {
      await api.setup({ clientId, clientSecret });
      msg.textContent = 'Listo. Te llevo a Mercado Libre para autorizar…';
      setTimeout(() => { window.location.href = '/api/auth/login'; }, 700);
    } catch (e) {
      msg.innerHTML = `<span style="color:var(--critical)">${esc(e.message)}</span>`;
      btn.disabled = false;
    }
  });

  root.querySelector('#disc')?.addEventListener('click', async () => {
    if (!confirm('¿Desconectar la cuenta de Mercado Libre? Vas a tener que autorizar de nuevo.')) return;
    await api.disconnect();
    load();
  });

  root.querySelector('#clear').addEventListener('click', async () => {
    if (!confirm('Esto obliga a volver a pedirle a Mercado Libre todas las comisiones, opiniones y envíos. La próxima carga va a tardar varios minutos. ¿Seguir?')) return;
    await api.clearCacheAll();
    load();
  });

  if (remoto) {
    root.querySelectorAll('#save, #clear, #disc, #save-creds').forEach((b) => {
      b.disabled = true;
      b.title = 'Sólo se puede desde la computadora donde corre el panel';
    });
  }

  root.querySelector('#save').addEventListener('click', async () => {
    const vatRates = {};
    root.querySelectorAll('[data-rate]').forEach((i) => (vatRates[i.dataset.rate] = Number(i.value) / 100));
    const ratesByInstallments = {};
    root.querySelectorAll('[data-fin]').forEach((i) => (ratesByInstallments[i.dataset.fin] = Number(i.value) / 100));
    const alertThresholds = {};
    root.querySelectorAll('[data-th]').forEach((i) => (alertThresholds[i.dataset.th] = Number(i.value)));

    await api.saveSettings({
      taxCondition: root.querySelector('#cond').value,
      productCostVatIncluded: root.querySelector('#costVat').checked,
      trackCosts: root.querySelector('#trackCosts').checked,
      adsCostIncludesVat: root.querySelector('#adsVat').checked,
      vatRates,
      financingFallback: { enabled: root.querySelector('#finEnabled').checked, ratesByInstallments },
      alertThresholds,
    });
    root.querySelector('#saved').textContent = 'Guardado ✓';
    setTimeout(() => load(), 500);
  });
}

/**
 * Nube: guardar la dirección del proyecto + la clave secreta (que se queda en
 * esta computadora) y subir los números del período que se esté mirando.
 * La clave nunca vuelve del servidor: si ya está puesta, sólo se dice que está.
 */
function renderNube(box, state, remoto) {
  if (!box) return;
  if (remoto) {
    box.innerHTML = '<div class="note">La subida a la nube se maneja desde la computadora donde corre el panel.</div>';
    return;
  }
  const fecha = (d) => (d ? new Date(d).toLocaleString('es-AR') : '—');

  api.cloud().then((c) => {
    box.innerHTML = `
      <div class="note" style="line-height:1.7;margin-bottom:14px">
        Esta computadora hace todas las cuentas y <b>sube el resultado</b> a tu proyecto de Supabase.
        Después vas a poder mirar los números desde tu casa o el celular, sin que esta máquina quede prendida.
        A la nube sube el resultado, no tus claves de Mercado Libre.
      </div>
      <dl class="kv" style="margin-bottom:14px">
        <dt>Proyecto</dt><dd>${c.host ? `<span class="mono">${esc(c.host)}</span>` : '<span class="badge warn">sin configurar</span>'}</dd>
        <dt>Clave secreta</dt><dd>${c.tieneClave ? '<span class="badge good">guardada en esta computadora</span>' : '<span class="badge warn">falta</span>'}</dd>
        <dt>Última subida</dt><dd>${c.ultima ? `${esc(fecha(c.ultima.synced_at))} · ${c.ultima.sales_rows ?? 0} ventas, ${c.ultima.listing_rows ?? 0} publicaciones (${esc(String(c.ultima.period_from ?? ''))} → ${esc(String(c.ultima.period_to ?? ''))})` : 'todavía no subiste nada'}</dd>
      </dl>

      <div class="grid g-2" style="max-width:720px">
        <label class="note">Dirección del proyecto
          <input type="text" id="nube-url" placeholder="https://abcdefg.supabase.co" autocomplete="off" style="width:100%;margin-top:3px">
        </label>
        <label class="note">Clave secreta (service_role)
          <input type="password" id="nube-key" placeholder="${c.tieneClave ? '•••••••• (ya guardada)' : 'eyJhbGciOi…'}" autocomplete="new-password" style="width:100%;margin-top:3px">
        </label>
      </div>
      <div class="note" style="margin:8px 0 14px">
        Las dos cosas se sacan de Supabase → <b>Project Settings</b> → <b>API</b>. La clave <b>service_role</b> es secreta:
        se guarda en el archivo <span class="mono">.env</span> de esta computadora y nunca se muestra ni viaja al navegador.
      </div>
      <div class="controls">
        <button class="btn" id="nube-save">Guardar datos del proyecto</button>
        <button class="btn primary" id="nube-push" ${c.configurado ? '' : 'disabled'}>Subir a la nube</button>
        <span class="note" id="nube-msg"></span>
      </div>`;

    const msg = box.querySelector('#nube-msg');

    box.querySelector('#nube-save').addEventListener('click', async () => {
      const url = box.querySelector('#nube-url').value.trim();
      const serviceKey = box.querySelector('#nube-key').value.trim();
      msg.textContent = 'Guardando…';
      try {
        const r = await api.saveCloud({ url, serviceKey });
        msg.innerHTML = r.error
          ? `Guardado, pero al probar la conexión: <span style="color:var(--critical)">${esc(r.error)}</span>`
          : 'Guardado y probado ✓';
        if (!r.error) setTimeout(() => renderNube(box, state, remoto), 900);
      } catch (e) {
        msg.innerHTML = `<span style="color:var(--critical)">${esc(e.message)}</span>`;
      }
    });

    box.querySelector('#nube-push').addEventListener('click', async () => {
      const btn = box.querySelector('#nube-push');
      btn.disabled = true;
      msg.textContent = 'Subiendo… (puede tardar un rato la primera vez)';
      try {
        const r = await api.cloudPush(state.period);
        msg.innerHTML = `Listo ✓ ${r.ventas} ventas, ${r.publicaciones} publicaciones y ${r.diasPublicidad} días de publicidad, del ${esc(String(r.periodo.from))} al ${esc(String(r.periodo.to))}.`;
        setTimeout(() => renderNube(box, state, remoto), 1200);
      } catch (e) {
        msg.innerHTML = `<span style="color:var(--critical)">${esc(e.message)}</span>`;
        btn.disabled = false;
      }
    });
  }).catch(() => {
    box.innerHTML = '<div class="note">No pude leer el estado de la nube.</div>';
  });
}

function rateLabel(k) {
  return {
    sales: 'IVA ventas',
    commission: 'IVA comisión ML',
    shipping: 'IVA envíos',
    financing: 'IVA financiación',
    other: 'IVA otros cargos',
    productCost: 'IVA compras',
    advertising: 'IVA publicidad',
  }[k] || k;
}
