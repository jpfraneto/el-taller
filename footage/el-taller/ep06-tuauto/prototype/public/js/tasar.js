// "¿Cuánto vale tu auto?": photo → what car it is → year + km → range → how to sell it → WhatsApp + the team inbox.
import { state, $, esc, abrirHoja, cardHtml, foto, wa, nombreCorto } from './app.js';
import { tasar, parteDePago, clp, millones } from './precio.js';

const t = {}; // this valuation: foto, mini, auto, ano, km, res, camino, nombre, id
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const box = () => $('#tasacion');
const CERRAR = '<button class="cerrar" data-cerrar="hoja-tasar" aria-label="Cerrar">×</button>';
const ANO_ACTUAL = 2026;

async function reducir(blob, lado, calidad) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', calidad);
}

async function empezar(blob) {
  Object.keys(t).forEach((k) => delete t[k]);
  abrirHoja('hoja-tasar');
  box().innerHTML = `${CERRAR}<div class="hoja-pad"><p class="kicker">Preparando la foto…</p></div>`;
  try {
    t.foto = await reducir(blob, 1024, 0.85);
    t.mini = await reducir(blob, 480, 0.7);
  } catch {
    return error('No pude abrir esa imagen. Prueba con otra foto (JPG o PNG).');
  }
  mirando();
}

async function mirando() {
  box().innerHTML = `${CERRAR}
    <div class="tas-foto scan"><img src="${t.foto}" alt="Tu auto"><div class="scan-box"></div></div>
    <div class="hoja-pad">
      <p class="kicker">Mirando tu auto…</p>
      <ul class="lineas" id="lineas">
        <li>Buscando el auto en la foto</li><li>Marca y modelo</li><li>Generación y años</li><li>Cómo se ve: pintura, llantas, focos</li>
      </ul>
    </div>`;
  const lis = [...box().querySelectorAll('#lineas li')];
  let i = 0;
  const tick = setInterval(() => { if (i < lis.length) lis[i++].classList.add('on'); }, 900);
  const min = sleep(2600);
  try {
    const r = await fetch('/api/mirar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: t.foto }) });
    const d = await r.json();
    await min;
    clearInterval(tick);
    if (!r.ok) return error(d.message || 'No pude leer la foto. Prueba de nuevo.');
    t.auto = d.auto;
    t.motor = d.motor;
    if (!t.auto.es_auto) return error(t.auto.nota || 'No encontré un auto en la foto. Sácale una de lado o de frente, completo.', true);
    reconocido();
  } catch {
    clearInterval(tick);
    error('Se cortó la conexión. Prueba de nuevo.');
  }
}

function error(msg, otraFoto) {
  box().innerHTML = `${CERRAR}
    ${t.foto ? `<div class="tas-foto"><img src="${t.foto}" alt="Tu foto"></div>` : ''}
    <div class="hoja-pad">
      <p class="error">${esc(msg)}</p>
      <div class="acciones">
        <label class="btn-main btn-sm" for="foto-camara">${otraFoto ? 'Subir otra foto' : 'Intentar con otra foto'}</label>
        ${t.foto && !otraFoto ? '<button class="btn btn-ghost" id="reintentar" type="button">Reintentar</button>' : ''}
        <button class="btn btn-ghost" id="a-mano" type="button">Escribir el modelo a mano</button>
      </div>
    </div>`;
  $('#reintentar', box())?.addEventListener('click', mirando);
  $('#a-mano', box()).addEventListener('click', () => {
    t.auto = { es_auto: true, marca: '', modelo: '', version: '', generacion: '', ano_desde: 0, ano_hasta: 0, color: '', estado: 'bueno', detalles: [], confianza: 'baja', nota: '' };
    reconocido(true);
  });
}

function opcionesAno(a) {
  const desde = a.ano_desde ? Math.max(1995, a.ano_desde - 1) : 2005;
  const hasta = a.ano_hasta ? Math.min(ANO_ACTUAL, a.ano_hasta + 1) : ANO_ACTUAL;
  const xs = [];
  for (let y = hasta; y >= desde; y--) xs.push(y);
  return xs;
}

function datalists() {
  const marcas = new Set(), modelos = new Set();
  for (const m of state.ref.modelos || []) { marcas.add(m.marca); modelos.add(`${m.marca} ${m.modelo}`); }
  for (const a of state.autos) marcas.add(a.marca.charAt(0) + a.marca.slice(1).toLowerCase());
  return `<datalist id="dl-marcas">${[...marcas].sort().map((m) => `<option value="${esc(m)}">`).join('')}</datalist>`;
}

function reconocido(aMano = false) {
  const a = t.auto;
  const nombre = `${a.marca} ${a.modelo}`.trim();
  box().innerHTML = `${CERRAR}
    <div class="hoja-pad">
      <div class="verif">
        <img src="${t.foto}" alt="Tu auto">
        <div>
          ${aMano ? '<p class="reco" style="color:var(--tx-2)">Cuéntame qué auto es</p><h2 class="es-un">Tu auto</h2>' : `
          <p class="reco">✓ ${a.confianza === 'baja' ? 'Creo que es' : 'Lo reconocí'}</p>
          <h2 class="es-un">${esc(nombre)}<small>${esc([a.generacion, a.color].filter(Boolean).join(' · '))}</small></h2>`}
        </div>
      </div>
      ${aMano ? '' : `<div class="det-chips"><span class="est">Se ve ${esc(a.estado)}</span>${a.detalles.map((d) => `<span>${esc(d)}</span>`).join('')}</div>`}
      <form class="form" id="form-tas">
        <div class="two">
          <label>Marca<input name="marca" list="dl-marcas" value="${esc(a.marca)}" autocomplete="off" required></label>
          <label>Modelo<input name="modelo" value="${esc(a.modelo)}" autocomplete="off" required></label>
        </div>
        ${datalists()}
        <div class="two">
          <label>Año
            <select name="ano" required><option value="">Elige</option>${opcionesAno(a).map((y) => `<option>${y}</option>`).join('')}<option value="otro">Otro…</option></select>
          </label>
          <label>Kilómetros<input name="km" inputmode="numeric" placeholder="ej: 85.000" autocomplete="off" required></label>
        </div>
        <p class="hint">Revisa que esté bien. El año y los kilómetros los pones tú: la foto no los ve.</p>
        <button class="btn-main" type="submit" disabled>Ver cuánto vale</button>
      </form>
    </div>`;
  const f = $('#form-tas', box());
  const btn = f.querySelector('button[type=submit]');
  const km = f.km;
  const valido = () => { btn.disabled = !(f.ano.value && f.ano.value !== 'otro' && km.value && f.marca.value && f.modelo.value); };
  km.addEventListener('input', () => {
    const d = km.value.replace(/\D/g, '').slice(0, 7);
    km.value = d ? Number(d).toLocaleString('es-CL') : '';
    valido();
  });
  f.ano.addEventListener('change', () => {
    if (f.ano.value === 'otro') {
      const opts = [];
      for (let y = ANO_ACTUAL; y >= 1990; y--) opts.push(`<option>${y}</option>`);
      f.ano.innerHTML = `<option value="">Elige</option>${opts.join('')}`;
    }
    valido();
  });
  f.marca.addEventListener('input', valido);
  f.modelo.addEventListener('input', valido);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    t.auto.marca = f.marca.value.trim();
    t.auto.modelo = f.modelo.value.trim();
    t.ano = Number(f.ano.value);
    t.km = Number(km.value.replace(/\D/g, ''));
    resultado();
  });
}

function grafico(res) {
  const W = 300, H = 110, P = 16;
  const pts = res.puntos;
  const anos = [...pts.map((p) => p.ano), t.ano];
  let x0 = Math.min(...anos) - 1, x1 = Math.max(...anos) + 1;
  const ys = [...pts.map((p) => p.precio), res.min, res.max];
  const y0 = Math.min(...ys) * 0.9, y1 = Math.max(...ys) * 1.05;
  const X = (a) => P + ((a - x0) / (x1 - x0)) * (W - 2 * P);
  const Y = (v) => H - P - ((v - y0) / (y1 - y0)) * (H - 2 * P);
  const ticks = [];
  const paso = x1 - x0 > 8 ? 2 : 1;
  for (let a = Math.ceil(x0); a <= x1; a += paso) ticks.push(`<text x="${X(a)}" y="${H - 2}" text-anchor="middle">${a}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Precios publicados por año">
    <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" stroke="rgba(255,255,255,.2)"/>
    ${ticks.join('')}
    <rect x="${X(t.ano) - 7}" y="${Y(res.max)}" width="14" height="${Math.max(4, Y(res.min) - Y(res.max))}" rx="7" fill="#ffd23f"/>
    ${pts.map((p) => p.fuente === 'tuauto'
      ? `<circle cx="${X(p.ano)}" cy="${Y(p.precio)}" r="5" fill="none" stroke="#ffd23f" stroke-width="2"/>`
      : `<circle cx="${X(p.ano)}" cy="${Y(p.precio)}" r="${3 + Math.min(3, (p.n || 1) / 4)}" fill="#fff" opacity=".85"/>`).join('')}
    <text x="${X(t.ano)}" y="${Y(res.max) - 6}" text-anchor="middle" style="fill:#ffd23f;font-weight:800">tu auto</text>
  </svg>`;
}

function resultado() {
  const a = t.auto;
  t.res = tasar({ ref: state.ref, autos: state.autos, marca: a.marca, modelo: a.modelo, version: a.version, ano: t.ano, km: t.km, estado: a.estado });
  const r = t.res;
  const nombre = `${a.marca} ${a.modelo} ${t.ano}`;
  const fuentes = r.ok ? [r.nAvisos ? `${r.nAvisos} avisos de Chile` : '', r.stock.length ? `${r.stock.length === 1 ? 'un auto' : `${r.stock.length} autos`} del stock de TuAuto` : '']
    .filter(Boolean).join(' y ') : '';
  box().innerHTML = `${CERRAR}
    <div class="hoja-pad">
      <p class="kicker">${esc(nombre)} · ${t.km.toLocaleString('es-CL')} km</p>
      ${r.ok ? `
      <div class="precio-tag">
        <div class="lbl">Autos como el tuyo se publican entre</div>
        <div class="monto">$${millones(r.min)}<span> – </span>$${millones(r.max)}</div>
        <div class="mill">millones de pesos</div>
      </div>
      <p class="base">Con ${fuentes}${r.confianza === 'baja' ? ' · pocos datos para ese año' : ''}.</p>
      <details class="mas">
        <summary>¿De dónde sale este número?</summary>
        <div class="chart">${grafico(r)}</div>
        <div class="ley"><span><i style="background:#fff"></i>avisos en Chile</span>${r.stock.length ? '<span><i style="border:2px solid #ffd23f"></i>en TuAuto hoy</span>' : ''}<span><i style="background:#ffd23f"></i>tu auto</span></div>
        <p class="honesto">Es lo que se <b>pide</b> por autos así en avisos, no una oferta. La foto no ve la mantención, los papeles ni cómo anda: el número final te lo da una persona de TuAuto, en la revisión.</p>
      </details>`
      : `<div class="precio-tag" style="transform:rotate(-1deg)"><div class="lbl">Todavía no tengo avisos de</div><div class="monto" style="font-size:1.9rem;white-space:normal">${esc(a.marca)} ${esc(a.modelo)}</div></div>
      <p class="base">Este modelo no está en mi tabla. TuAuto te lo tasa igual: mándales el auto y lo ven.</p>`}
      ${a.talla ? `<div class="talla" id="talla">
        <span class="k">Lo que dice tu auto</span>
        <p>“${esc(a.talla)}”</p>
        <button class="btn-share" type="button" id="compartir">Compartir mi tasación</button>
      </div>` : ''}
      <div class="vender">
        <h3>¿Lo vendemos?</h3>
        <div class="caminos" id="caminos">
          <button type="button" class="camino" data-camino="hoy" aria-pressed="false">
            <span class="k">Hoy</span><b>Te lo compramos</b><small>Revisión en Prieto Sur 1073, oferta en el momento, dinero en minutos.</small></button>
          <button type="button" class="camino" data-camino="consigna" aria-pressed="false">
            <span class="k">A tu ritmo</span><b>Lo vendemos por ti</b><small>Lo certifican y publican. Lo usas hasta el último día.</small></button>
        </div>
        <form class="form" id="form-env" hidden>
          <label>¿Cómo te llamas? <span class="hint">(opcional)</span><input name="nombre" autocomplete="given-name" maxlength="40"></label>
          <a class="enviar-wa" id="enviar" target="_blank" rel="noopener" href="#">Mandar a TuAuto por WhatsApp</a>
          <p class="hint">Se abre WhatsApp con el mensaje listo. Tu foto le llega al equipo con un código: no tienes que explicar nada de nuevo.</p>
        </form>
      </div>
      ${r.ok ? pagoHtml(r) : ''}
      <button class="link otra" type="button" id="otra">Tasar otro auto</button>
    </div>`;
  const caminos = $('#caminos', box());
  caminos.addEventListener('click', (e) => {
    const b = e.target.closest('[data-camino]');
    if (!b) return;
    t.camino = b.dataset.camino;
    caminos.querySelectorAll('.camino').forEach((x) => x.setAttribute('aria-pressed', x === b));
    const f = $('#form-env', box());
    f.hidden = false;
    actualizarEnlace();
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  const f = $('#form-env', box());
  f.nombre.addEventListener('input', actualizarEnlace);
  $('#enviar', box()).addEventListener('click', enviar);
  $('#otra', box()).addEventListener('click', () => $('#foto-camara').click());
  $('#compartir', box())?.addEventListener('click', compartir);
}

// The shareable card: the photo, the joke, the range, the link. Shared as an image (or downloaded where share isn't there).
function lineas(ctx, texto, ancho) {
  const out = [];
  let cur = '';
  for (const w of texto.split(/\s+/)) {
    const prueba = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(prueba).width > ancho && cur) { out.push(cur); cur = w; } else cur = prueba;
  }
  if (cur) out.push(cur);
  return out;
}

async function tarjeta() {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#0b0c0f'; x.fillRect(0, 0, W, H);
  const img = await createImageBitmap(await fetch(t.foto).then((r) => r.blob()));
  const fh = 640, k = Math.max(W / img.width, fh / img.height);
  x.drawImage(img, (W - img.width * k) / 2, (fh - img.height * k) / 2, img.width * k, img.height * k);
  const g = x.createLinearGradient(0, fh - 220, 0, fh);
  g.addColorStop(0, 'rgba(11,12,15,0)'); g.addColorStop(1, '#0b0c0f');
  x.fillStyle = g; x.fillRect(0, fh - 220, W, 220);
  const a = t.auto, r = t.res;
  x.fillStyle = '#ffffff'; x.font = '700 44px system-ui, -apple-system, sans-serif';
  x.fillText(`${a.marca} ${a.modelo} ${t.ano}`, 72, fh + 30);
  x.font = '800 58px system-ui, -apple-system, sans-serif';
  let y = fh + 130;
  for (const l of lineas(x, `“${a.talla}”`, W - 144).slice(0, 5)) { x.fillText(l, 72, y); y += 72; }
  if (r.ok) {
    y += 30;
    x.fillStyle = '#ffd23f'; x.font = '600 34px system-ui, -apple-system, sans-serif';
    x.fillText('Autos como el mío se publican entre', 72, y);
    x.font = '850 76px system-ui, -apple-system, sans-serif';
    x.fillText(`$${millones(r.min)} – $${millones(r.max)} millones`, 72, y + 86);
  }
  x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '600 36px system-ui, -apple-system, sans-serif';
  x.fillText('¿Y el tuyo? Sácale una foto →  tuauto.jpfraneto.com', 72, H - 72);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
}

async function compartir() {
  const b = $('#compartir', box());
  b.textContent = 'Armando la tarjeta…';
  const blob = await tarjeta();
  const file = new File([blob], 'mi-auto-tuauto.jpg', { type: 'image/jpeg' });
  const texto = `Le saqué una foto a mi auto y me dijo: “${t.auto.talla}” ¿Y el tuyo? https://tuauto.jpfraneto.com`;
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: texto }); b.textContent = 'Compartir de nuevo'; return; }
  } catch { /* cancelled */ }
  const url = URL.createObjectURL(blob);
  box().querySelector('#talla').insertAdjacentHTML('beforeend', `<img class="talla-card" src="${url}" alt="Tu tarjeta para compartir">`);
  const dl = document.createElement('a'); dl.href = url; dl.download = 'mi-auto-tuauto.jpg'; dl.click();
  b.textContent = 'Listo: guardada';
}

function pagoHtml(r) {
  const xs = parteDePago(state.autos, r.centro);
  if (!xs.length) return '';
  const dif = (a) => clp(Math.max(100000, Math.round((a.precio - r.centro) / 100000) * 100000));
  return `<details class="mas">
    <summary>¿Y si lo dejas en parte de pago?</summary>
    <div class="mini">${xs.map((a) => cardHtml(a, `<span class="dif">Diferencia ~${dif(a)}</span>`)).join('')}</div>
    <p class="hint" style="margin-top:8px">Si TuAuto lo recibe cerca del centro del rango. La diferencia también se puede financiar.</p>
  </details>`;
}

const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function nuevoCodigo() {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (n) => CODE[n % CODE.length]).join('');
}

function mensaje() {
  const a = t.auto, r = t.res;
  const nombre = $('#form-env', box())?.nombre.value.trim();
  return [
    'Hola TuAuto 👋 Quiero vender mi auto.',
    `🚗 ${a.marca} ${a.modelo} ${t.ano}, ${t.km.toLocaleString('es-CL')} km`,
    r.ok ? `💬 Tasación de la web: $${millones(r.min)} – $${millones(r.max)} millones` : '💬 Tasación de la web: sin datos de este modelo',
    `✅ ${t.camino === 'consigna' ? 'Quiero que lo vendan por mí (lo sigo usando)' : 'Quiero que me lo compren hoy'}`,
    `📷 Código de mi foto: ${t.id}`,
    nombre ? `Me llamo ${nombre}.` : '',
  ].filter(Boolean).join('\n');
}

function actualizarEnlace() {
  t.id = t.id || nuevoCodigo();
  $('#enviar', box()).href = wa(mensaje());
}

function enviar() {
  const a = t.auto, r = t.res;
  const nombre = $('#form-env', box()).nombre.value.trim();
  fetch('/api/solicitudes', {
    method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: t.id, foto: t.mini, auto: `${a.marca} ${a.modelo}`, ano: t.ano, km: t.km,
      min: r.ok ? r.min : null, max: r.ok ? r.max : null, camino: t.camino, nombre }),
  }).catch(() => {});
  setTimeout(enviado, 400);
}

function enviado() {
  box().innerHTML = `${CERRAR}
    <div class="hoja-pad enviado">
      <p class="kicker">Listo</p>
      <h2>Tu auto va en camino.</h2>
      <div class="cod">${t.id}</div>
      <p class="nota">Ese es el código de tu foto. En TuAuto ya la tienen con el modelo, el año, los kilómetros y el rango: te escriben para agendar la revisión.</p>
      <div class="acciones">
        <a class="enviar-wa" target="_blank" rel="noopener" href="${wa(mensaje())}">Abrir WhatsApp de nuevo</a>
        <a class="btn btn-ghost" href="#stock" data-cerrar="hoja-tasar">Mirar autos para comprar</a>
      </div>
    </div>`;
}

export function iniciarTasacion() {
  for (const id of ['foto-camara']) {
    $(`#${id}`).addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) empezar(f);
    });
  }
  $('#probar').addEventListener('click', async () => {
    const conFoto = state.autos.filter((a) => a.fotos?.[1]);
    const a = conFoto[Math.floor(Math.random() * conFoto.length)];
    if (!a) return;
    const blob = await fetch(foto(a, 1, false)).then((r) => r.blob());
    empezar(blob);
  });
}
