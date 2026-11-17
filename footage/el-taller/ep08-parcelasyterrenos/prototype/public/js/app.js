// Parcelas y Terrenos: the marketplace (home, one listing, publish), the chat with Claude, visits, the sponsor form.
// One page, three views: the Worker sets <body data-vista> (inicio · todas · contacto · parcela · publicar).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;
const post = async (url, data) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.mensaje || 'Algo falló. Prueba de nuevo.');
  return j;
};

let P = [], SITIO = {}, ACTUAL = null;
const VISTA = document.body.dataset.vista || 'inicio';
const SERVICIOS = ['Rol propio', 'Luz', 'Agua potable', 'Pozo', 'Camino pavimentado', 'Vista a los volcanes', 'Vista al lago', 'Bosque nativo', 'Estero o río', 'Plana', 'Factibilidad de luz'];

// ── Cards ───────────────────────────────────────────────────────────────────

const precioDe = (p) => (p.precio ? pesos(p.precio) : 'Precio con el dueño');
const fotoDe = (p, cls = '') => (p.fotos?.length
  ? `<img class="${cls}" src="${esc(p.fotos[0])}" alt="${esc(p.titulo)}" loading="lazy">`
  : `<div class="sin-foto ${cls}"><span>${esc(p.superficie || 'Parcela')}</span><small>Sin fotos todavía</small></div>`);

function tarjeta(p) {
  return `<a class="card" href="/parcela/${esc(p.id)}">
    <div class="card-foto">${fotoDe(p)}
      ${p.fotos?.length > 1 ? `<span class="contador">${p.fotos.length} fotos</span>` : ''}</div>
    <div class="card-txt">
      <h3>${esc(p.titulo)}</h3>
      <p class="donde">${esc(p.comuna)}${p.sector ? ` · ${esc(p.sector)}` : ''}</p>
      <p class="datos"><b>${esc(p.superficie)}</b>${p.credito ? '<span>Crédito directo</span>' : ''}</p>
      <p class="precio-card">${esc(precioDe(p))}</p>
      <p class="quien"><span class="avatar">${esc(p.vendedor.nombre[0])}</span>${esc(p.vendedor.nombre)} · directo con el dueño</p>
    </div>
  </a>`;
}

const tarjetaPublicar = () => `<a class="card card-vacia" href="/publicar/">
  <div><p class="kicker oscuro">¿Tienes una parcela?</p><h3>Publícala gratis</h3><p>Sin comisión. Cinco minutos.</p><b>Publicar →</b></div></a>`;

// Listings found on other sites: facts only, no photo, and the way out to the original.
const UF = (n) => `UF ${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
const superficie = (m) => (!m ? '' : m >= 10000 ? `${(m / 10000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ha` : `${m.toLocaleString('es-CL')} m²`);
let FUENTES = {};
function tarjetaIndexada(x) {
  const f = FUENTES[x.f] || { nombre: x.f };
  const pr = x.monto ? (x.moneda === 'UF' ? UF(x.monto) : pesos(x.monto)) : x.f === 'bienes-nacionales' ? 'Precio al abrir la licitación' : 'Precio en la publicación';
  return `<article class="card card-ix">
    <a class="ix-link" href="${esc(x.url)}" target="_blank" rel="nofollow noopener">
      <div class="ix-top"><span>${esc(x.region || 'Chile')}</span><span class="sello">↗ ${esc(f.nombre)}</span></div>
      <div class="ix-m2">${esc(superficie(x.m2) || 'Parcela')}</div>
      <div class="card-txt">
        ${x.tipo ? `<p class="ix-tipo">${esc(x.tipo)}</p>` : ''}
        <h3>${esc(x.titulo)}</h3>
        <p class="donde">${esc(x.comuna || x.region || '')}</p>
        <p class="precio-card">${esc(pr)}${x.f === 'bienes-nacionales' && x.monto ? ' <small>mínimo</small>' : ''}</p>
        ${x.nota ? `<p class="ix-nota">${esc(x.nota)}</p>` : ''}
      </div>
    </a>
    <div class="ix-pie"><a href="${esc(x.url)}" target="_blank" rel="nofollow noopener">Ver en ${esc(f.nombre)} ↗</a>
      ${f.reclamable !== false ? `<a class="es-tuya" href="/publicar/?de=${encodeURIComponent(x.k)}">¿Es tuya?</a>` : ''}</div>
  </article>`;
}

function pintarFuentes(j) {
  $('#lista-fuentes').innerHTML = Object.entries(j.fuentes).map(([, f]) => `<div class="fuente">
    <div><b>${esc(f.nombre)}</b><a href="${esc(f.web)}" target="_blank" rel="noopener">${esc(f.web.replace(/^https?:\/\//, ''))}</a>${f.que ? `<small>${esc(f.que)}</small>` : ''}</div>
    <span>${f.n.toLocaleString('es-CL')} parcelas${f.t ? ` · actualizado ${new Date(f.t).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}` : ''}</span></div>`).join('')
    + `<div class="fuente"><div><b>Sus dueños, aquí</b><a href="/publicar/">Publicar gratis</a></div><span>${P.length} parcelas</span></div>`;
}

$('#form-quitar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#form-quitar .form-err');
  err.hidden = true;
  try {
    await post('/api/quitar', Object.fromEntries(new FormData(e.target)));
    e.target.reset();
    $('#form-quitar .form-ok').hidden = false;
  } catch (x) { err.textContent = x.message; err.hidden = false; }
});

// ── One listing ─────────────────────────────────────────────────────────────

function pintarDetalle() {
  const id = location.pathname.split('/')[2];
  const p = P.find((x) => x.id === id);
  if (!p) { location.href = '/parcelas/'; return; }
  ACTUAL = p;
  const v = p.vendedor;
  const fotos = p.fotos?.length ? p.fotos.map((f, i) => `<img src="${esc(f)}" alt="${esc(p.titulo)}, foto ${i + 1}" loading="${i ? 'lazy' : 'eager'}">`).join('') : fotoDe(p, 'grande');
  $('#detalle').innerHTML = `
    <div class="carrusel det-carrusel"><div class="fotos">${fotos}</div>
      ${p.fotos?.length > 1 ? `<span class="contador">1 / ${p.fotos.length}</span>` : ''}</div>
    <div class="det-txt">
      <a class="volver" href="/parcelas/">← Todas las parcelas</a>
      <h1>${esc(p.titulo)}</h1>
      <p class="donde">${esc(p.comuna)}${p.sector ? ` · ${esc(p.sector)}` : ''}</p>
      <div class="det-precio"><div><small>Superficie</small><b>${esc(p.superficie)}</b><span>${esc(p.cantidad || '')}</span></div>
        <div><small>Precio</small><b>${esc(p.precio ? pesos(p.precio) : 'Te lo da ' + v.nombre)}</b><span>${p.credito ? 'Crédito directo' : ''}</span></div></div>
      <div class="chips">${(p.chips || []).map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      ${p.texto ? `<p class="dice"><b>${esc(v.nombre)}:</b> “${esc(p.texto)}”</p>` : ''}
      <div class="vendedor-card">
        <p class="kicker oscuro">Quién la vende</p>
        <div class="v-fila"><span class="avatar grande">${esc(v.nombre[0])}</span>
          <div><b>${esc(v.nombre)}</b><span>${esc(v.lugar || p.comuna)} · publica aquí desde ${esc(v.desde)}</span></div></div>
        ${v.quien ? `<p>${esc(v.quien)}</p>` : ''}
        <p class="sin-comision">Trato directo con ${esc(v.nombre)}. Sin corredor, sin comisión.</p>
      </div>
      <div class="acciones">
        <button class="btn verde" data-visita="${esc(p.id)}">Agendar visita</button>
        <button class="btn borde-oscuro" data-chat>Preguntar</button>
      </div>
    </div>`;
  const el = $('#detalle .fotos');
  el.addEventListener('scroll', () => {
    const c = $('#detalle .contador');
    if (c) c.textContent = `${Math.round(el.scrollLeft / el.clientWidth) + 1} / ${el.children.length}`;
  }, { passive: true });
  $('#fila-mas').innerHTML = P.filter((x) => x.id !== p.id).map(tarjeta).join('') + tarjetaPublicar();
  $('#chat-sub').textContent = `Claude responde por ${v.nombre}, a cualquier hora`;
}

// ── Publish ─────────────────────────────────────────────────────────────────

let fotosElegidas = [];
async function pintarPublicar(j) {
  $('#p-region').innerHTML = '<option value="">Elige</option>' + j.lista_regiones.map((r) => `<option>${esc(r)}</option>`).join('');
  // "¿Es tuya?": a listing found on another site, claimed by its owner → the form starts with its facts.
  const de = new URLSearchParams(location.search).get('de');
  if (de) {
    const r = await fetch(`/api/parcelas?k=${encodeURIComponent(de)}`).then((x) => x.json()).catch(() => ({}));
    const x = r.item;
    if (x) {
      const f = $('#form-publicar');
      f.titulo.value = x.titulo; f.comuna.value = x.comuna || ''; f.region.value = x.region || '';
      if (x.m2) f.m2.value = x.m2;
      if (x.monto && x.moneda === 'CLP') f.precio.value = x.monto;
      $('#reclamo').hidden = false;
      $('#reclamo').innerHTML = `Encontramos tu parcela en <b>${esc((FUENTES[x.f] || {}).nombre || x.f)}</b>. Ya llenamos lo que sabíamos: agrega tus fotos y quién eres, y aparece aquí con tu nombre, antes que las de otros sitios.`;
    }
  }
  $('#servicios').innerHTML = SERVICIOS.map((x) => `<label class="chip-check"><input type="checkbox" name="servicios" value="${esc(x)}"><span>${esc(x)}</span></label>`).join('');
  $('#dueno-revisa').textContent = SITIO.dueno;
}

// Photos are shrunk on the phone before they travel (≤1600 px, JPEG): a 6 MB photo becomes ~300 KB.
function achicar(file) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = mal;
    img.src = URL.createObjectURL(file);
  });
}

const pintarPrevias = () => {
  $('#previas').innerHTML = fotosElegidas.map((f, i) => `<div><img src="${f}" alt=""><button type="button" data-quitar="${i}">×</button></div>`).join('');
};
$('#fotos').addEventListener('change', async (e) => {
  for (const f of [...e.target.files].slice(0, 8 - fotosElegidas.length)) fotosElegidas.push(await achicar(f));
  e.target.value = '';
  pintarPrevias();
});
$('#previas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-quitar]'); if (!b) return;
  fotosElegidas.splice(Number(b.dataset.quitar), 1);
  pintarPrevias();
});

$('#form-publicar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $('#form-publicar .form-err');
  err.hidden = true;
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    const datos = Object.fromEntries(f);
    delete datos.servicios;
    const r = await post('/api/publicar', { ...datos, servicios: f.getAll('servicios'), credito: f.has('credito'),
      fotos: fotosElegidas, demo: window.__demo === true });
    e.target.hidden = true;
    $('.publicado').hidden = false;
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (x) { err.textContent = x.message; err.hidden = false; }
  btn.disabled = false; btn.textContent = 'Publicar gratis';
});

// ── Navigation, lightbox ────────────────────────────────────────────────────

const RUTA = { inicio: '/', todas: '/parcelas/', contacto: '/contactanos/' };
const EN_INICIO = ['inicio', 'todas', 'contacto'].includes(VISTA);
function alScroll() {
  $('#top').classList.toggle('solido', !EN_INICIO || scrollY > innerHeight * 0.45);
  if (!$$('.hoja').some((h) => !h.hidden)) $('.burbuja').classList.toggle('oculta', VISTA === 'publicar' || VISTA === 'fuentes' || VISTA === 'corredoras' || (EN_INICIO && scrollY < innerHeight * 0.4));
}
addEventListener('scroll', alScroll, { passive: true });

document.addEventListener('click', (e) => {
  const ir = e.target.closest('[data-ir]');
  if (ir && EN_INICIO) {
    e.preventDefault();
    document.getElementById(ir.dataset.ir)?.scrollIntoView({ behavior: 'smooth' });
    history.replaceState(null, '', RUTA[ir.dataset.ir] || '/');
    return;
  }
  if (e.target.closest('[data-chat]')) return abrirChat();
  if (e.target.closest('[data-auspiciar]')) return window.abrirAuspicio(window.CARTELES_OCUPADOS || []);
  const v = e.target.closest('[data-visita]');
  if (v) return abrirVisita(v.dataset.visita);
  if (e.target.closest('[data-cerrar]')) return cerrarHojas();
  const img = e.target.closest('.fotos img');
  if (img) { $('#lightbox img').src = img.src; $('#lightbox').hidden = false; return; }
  if (e.target.closest('#lightbox')) $('#lightbox').hidden = true;
  const dice = e.target.closest('.dice');
  if (dice) dice.classList.toggle('abierta');
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarHojas(); $('#lightbox').hidden = true; } });

function abrirHoja(sel) {
  $$('.hoja').forEach((h) => (h.hidden = true));
  $(sel).hidden = false;
  $('.burbuja').classList.add('oculta');
}
function cerrarHojas() {
  $$('.hoja').forEach((h) => (h.hidden = true));
  alScroll();
  avisoPago();
}

// ── Chat ────────────────────────────────────────────────────────────────────

const ID = leer('pyt-id', null) || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2, 10));
guardar('pyt-id', ID);
let historial = leer('pyt-chat', []);
let listo = leer('pyt-listo', false);
let ocupado = false;

const bienvenida = () => (ACTUAL
  ? `Hola. Soy Claude y atiendo esta página a cualquier hora. ¿Qué quieres saber de "${ACTUAL.titulo}"? Si te interesa, te agendo una visita con ${ACTUAL.vendedor.nombre}.`
  : 'Hola. Soy Claude y atiendo esta página a cualquier hora. Cuéntame qué buscas (para qué, qué tamaño, qué zona) y te digo cuáles calzan.');

// The quick questions: on the map, what people come looking for (a place, a life); on a parcel, what they ask about it.
const rapidas = () => (ACTUAL
  ? ['¿Cuánto cuesta?', ...(ACTUAL.credito ? ['¿Cómo es el crédito directo?'] : []), '¿Tiene agua y luz?', 'Quiero ir a verla']
  : ['Quiero vivir en Puerto Varas', 'Parcela en la Patagonia', 'A una hora de Santiago', 'Con vista al mar o a un lago',
    'Para construir mi cabaña', 'Con crédito directo, sin banco']);

function pintarChat() {
  $('#rapidas').innerHTML = rapidas().map((t) => `<button>${esc(t)}</button>`).join('');
  const m = $('#mensajes');
  m.innerHTML = `<div class="msg el">${esc(bienvenida())}</div>` + historial.map((x) =>
    x.r === 'aviso' ? `<div class="aviso">${esc(x.c)}</div>` : `<div class="msg ${x.r === 'user' ? 'yo' : 'el'}">${esc(x.c)}</div>`).join('');
  $('#rapidas').hidden = historial.length > 0;
  m.scrollTop = m.scrollHeight;
}

function abrirChat() {
  abrirHoja('#chat');
  pintarChat();
  if (matchMedia('(min-width: 700px)').matches) $('#entrada').focus();
}

async function enviar(texto) {
  texto = String(texto || '').trim();
  if (!texto || ocupado) return;
  ocupado = true;
  historial.push({ r: 'user', c: texto });
  pintarChat();
  const m = $('#mensajes');
  m.insertAdjacentHTML('beforeend', '<div class="msg el escribiendo"><i></i><i></i><i></i></div>');
  m.scrollTop = m.scrollHeight;
  try {
    const j = await post('/api/chat', { id: ID, msg: texto, parcela: ACTUAL?.id || '' });
    historial.push({ r: 'assistant', c: j.respuesta });
    if (j.listo && !listo) { listo = true; guardar('pyt-listo', true); historial.push({ r: 'aviso', c: `✓ ${j.vendedor || SITIO.dueno} ya tiene tus datos` }); }
  } catch (x) {
    historial.push({ r: 'assistant', c: x.message || 'Se me cortó la conexión. Prueba de nuevo.' });
  }
  guardar('pyt-chat', historial.slice(-60));
  ocupado = false;
  pintarChat();
}

$('#escribir').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('#entrada').value;
  $('#entrada').value = '';
  enviar(t);
});
$('#rapidas').addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') enviar(e.target.textContent); });

// ── Visit ───────────────────────────────────────────────────────────────────

const HORAS = ['10:00', '11:00', '12:00', '15:00', '16:00', '17:00'];
let eleccion = {};

function dias() {
  const out = [];
  const d = new Date();
  for (let i = 1; out.length < 10; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    out.push({
      fecha: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`,
      corto: x.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', ''),
      num: x.getDate(),
      largo: x.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
    });
  }
  return out;
}

function abrirVisita(parcela) {
  abrirHoja('#visita');
  eleccion = {};
  $('#form-visita').hidden = false;
  $('.visita-ok').hidden = true;
  $('#form-visita .form-err').hidden = true;
  $('#v-parcela').innerHTML = P.map((p) => `<option value="${esc(p.id)}">${esc(p.titulo)} · ${esc(p.comuna)}</option>`).join('');
  if (parcela) $('#v-parcela').value = parcela;
  const p = P.find((x) => x.id === $('#v-parcela').value);
  $('#visita-sub').textContent = `${p?.vendedor.nombre || 'El dueño'} te la muestra y te confirma por WhatsApp`;
  $('#v-dias').innerHTML = dias().map((d) => `<button type="button" data-fecha="${d.fecha}" data-largo="${esc(d.largo)}"><small>${esc(d.corto)}</small>${d.num}</button>`).join('');
  $('#v-horas').innerHTML = HORAS.map((h) => `<button type="button" data-hora="${h}">${h}</button>`).join('');
}

$('#v-dias').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#v-dias button').forEach((x) => x.classList.toggle('si', x === b));
  eleccion.fecha = b.dataset.fecha; eleccion.dia = b.dataset.largo;
});
$('#v-horas').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#v-horas button').forEach((x) => x.classList.toggle('si', x === b));
  eleccion.hora = b.dataset.hora;
});

$('#form-visita').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $('#form-visita .form-err');
  if (!eleccion.fecha || !eleccion.hora) { err.textContent = 'Elige un día y una hora.'; err.hidden = false; return; }
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    const j = await post('/api/visita', { id: ID, parcela: f.get('parcela'), nombre: f.get('nombre'), telefono: f.get('telefono'), ...eleccion });
    $('#ok-nombre').textContent = String(f.get('nombre')).split(' ')[0];
    $('#ok-cuando').textContent = `${eleccion.dia.charAt(0).toUpperCase()}${eleccion.dia.slice(1)}, ${eleccion.hora}`;
    $('#ok-vendedor').textContent = j.vendedor;
    $('#form-visita').hidden = true;
    $('.visita-ok').hidden = false;
    listo = true; guardar('pyt-listo', true);
  } catch (x) { err.textContent = x.message; err.hidden = false; }
  btn.disabled = false;
});

// ── Sponsor: write your link, pay with Mercado Pago, it's on the map (in one of the cupos, taking turns with the others) ──

window.abrirAuspicio = (orden = [], numero = 0) => {
  abrirHoja('#hoja-auspicio');
  // Before the ads can be sold (sitio.venta_carteles false): "próximamente" and a WhatsApp to the site's owner.
  $('#form-auspicio').hidden = !SITIO.venta_carteles;
  $('#a-pronto').hidden = Boolean(SITIO.venta_carteles);
  if (!SITIO.venta_carteles) {
    const msg = `Hola ${SITIO.dueno}, vi ${numero ? `el letrero ${numero}` : 'los letreros'} de la Ruta 5 en parcelasyterrenos.cl y me interesa poner mi marca ahí.`;
    $('#a-wa').href = `https://wa.me/${SITIO.whatsapp}?text=${encodeURIComponent(msg)}`;
    return;
  }
  const n = SITIO.cupos_auspicio || 5, tomados = orden.filter((x) => x && !x.ong).length, libres = Math.max(0, n - tomados);
  $('#a-cupos').innerHTML = [...Array(n).keys()].map((k) => `<i class="${k < tomados ? 'tomado' : ''}"></i>`).join('')
    + `<span>${libres ? `Quedan ${libres} de ${n} cupos este mes` : `Los ${n} cupos están tomados este mes`}</span>`;
  $('#a-pagar').textContent = `Pagar ${pesos(SITIO.precio_auspicio)} con Mercado Pago`;
  $('#a-pagar').disabled = !libres;
  previaAuspicio();
};
// The sponsor's image, cut to the billboard's shape (3:1) and made small on the phone.
let imagenCartel = '';
function recortar(file) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 900; c.height = 300;
      const k = Math.max(c.width / img.width, c.height / img.height), w = img.width * k, h = img.height * k;
      c.getContext('2d').drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = mal;
    img.src = URL.createObjectURL(file);
  });
}
function previaAuspicio() {
  const f = $('#form-auspicio');
  $('#a-previa').innerHTML = caraLetrero({ empresa: dominio(f.url.value.trim()) || 'tu-link.cl', img: imagenCartel }) + '<i class="patas"></i>';
}
// What the billboard will say: the domain of the link, and nothing else.
const dominio = (v) => { try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, ''); } catch { return ''; } };
$('#form-auspicio').addEventListener('input', previaAuspicio);
// How many wanted a billboard before they were on sale (the panel shows it): clic:<mes>:interes-letrero.
$('#a-wa').addEventListener('click', () => navigator.sendBeacon?.('/api/clic', JSON.stringify({ f: 'interes-letrero' })));
$('#form-auspicio').imagen.addEventListener('change', async (e) => {
  imagenCartel = e.target.files[0] ? await recortar(e.target.files[0]).catch(() => '') : '';
  previaAuspicio();
});
$('#form-auspicio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#form-auspicio .form-err');
  err.hidden = true;
  const f = e.target;
  try {
    const r = await post('/api/pagar', { tipo: 'auspicio', url: f.url.value.trim(), imagen: imagenCartel });
    location.href = r.url;
  } catch (x) { err.textContent = x.message; err.hidden = false; }
});

// ── NGOs: the 6th billboard is free. They sign up, the site's owner approves, and they take turns on it ──

window.abrirOng = () => {
  abrirHoja('#hoja-ong');
  $('#form-ong').hidden = false; $('.ong-ok').hidden = true;
  previaOng();
};
const previaOng = () => { $('#o-previa').innerHTML = caraLetrero({ empresa: dominio($('#form-ong').url.value.trim()) || 'tu-ong.cl', ong: true, bajada: 'ONG' }) + '<i class="patas"></i>'; };
$('#form-ong').addEventListener('input', previaOng);
$('#form-ong').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#form-ong .form-err'), btn = f.querySelector('button[type=submit]');
  err.hidden = true; btn.disabled = true;
  try {
    await post('/api/ong', { nombre: f.nombre.value, url: f.url.value.trim(), que: f.que.value, contacto: f.contacto.value });
    f.reset(); f.hidden = true; $('.ong-ok').hidden = false;
  } catch (x) { err.textContent = x.message; err.hidden = false; }
  btn.disabled = false;
});
if (location.hash === '#ong') setTimeout(() => window.abrirOng(), 300);

// Back from Mercado Pago: say what happened, with some confetti if it worked.
function avisoPago() {
  const q = new URLSearchParams(location.search).get('pago');
  if (!q) return;
  history.replaceState(null, '', location.pathname);
  const t = $('#toast');
  t.textContent = q === 'approved' ? '¡Pagado! Ya está en el mapa, por 30 días.' : q === 'pending' ? 'Tu pago está en proceso: apenas Mercado Pago lo confirme, se activa solo.' : 'El pago no se completó. Puedes intentarlo de nuevo.';
  t.className = `toast ${q}`; t.hidden = false;
  setTimeout(() => (t.hidden = true), 6000);
  if (q === 'approved' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('i');
      c.className = 'confeti';
      c.style.cssText = `left:${Math.random() * 100}vw;background:${['#f6d55c', '#1d3528', '#6b8a55', '#e76f51', '#9fd0e2'][i % 5]};animation-delay:${Math.random() * .6}s;animation-duration:${1.6 + Math.random()}s`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3200);
    }
  }
}

// ── Start ───────────────────────────────────────────────────────────────────

async function cargar() {
  const j = await fetch('/api/parcelas?mapa=1').then((r) => r.json());
  P = j.parcelas.sort((a, b) => b.t - a.t);   // own listings: the newest first
  SITIO = j.sitio;
  FUENTES = j.fuentes;
  const vistaMain = { parcela: 'parcela', publicar: 'publicar', fuentes: 'fuentes', corredoras: 'corredoras' }[VISTA] || 'inicio';
  $$('.vista').forEach((v) => (v.hidden = v.id !== `vista-${vistaMain}`));
  if ($('#dueno-nombre')) {                       // the contact block (not on every view)
    $('#dueno-nombre').textContent = SITIO.dueno;
    $('#dueno-tel').textContent = SITIO.whatsapp_texto;
    $('#dueno-tel').href = `tel:+${SITIO.whatsapp}`;
    $('#wa-contacto').href = `https://wa.me/${SITIO.whatsapp}?text=${encodeURIComponent('Hola, vi parcelasyterrenos.cl y tengo una pregunta.')}`;
  }
  $('#auspicio-sub').textContent = SITIO.venta_carteles
    ? `${pesos(SITIO.precio_auspicio)} al mes · ${SITIO.cupos_auspicio} ${SITIO.cupos_auspicio === 1 ? 'cupo' : 'cupos'}` : 'Próximamente';
  if (vistaMain === 'inicio') window.iniciarMapa?.(j);   // public/js/mapa.js
  if (vistaMain === 'parcela') pintarDetalle();
  if (vistaMain === 'publicar') pintarPublicar(j);
  if (vistaMain === 'fuentes') pintarFuentes(j);
  if (vistaMain === 'corredoras') pintarCorredoras();
  alScroll();
  avisoPago();
}
// ── Corredoras: the sign-up, with a live preview of how their parcels will look ──
function pintarCorredoras() {
  const f = $('#form-corredora');
  const previa = () => {
    const nombre = f.nombre.value.trim() || 'Tu corredora';
    let logo = '';
    try { logo = f.web.value.trim() ? `${new URL(f.web.value.trim()).origin}/favicon.ico` : ''; } catch {}
    $('#co-previa').innerHTML = `<div class="fila demo-fila"><span class="fila-logo">${logo ? `<img src="${esc(logo)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'${esc(nombre[0])}'}))">` : `<b>${esc(nombre[0])}</b>`}</span>
      <span class="fila-txt"><em class="fila-ok">✓ Corredora verificada</em><b>Parcela de 5.000 m² con vista</b><span>${esc(f.comuna.value.trim() || 'Tu comuna')} · 5.000 m²</span>
      <strong>UF 1.450</strong></span><span class="fila-ir">Ver en ${esc(nombre)} ↗</span></div>`;
  };
  f.addEventListener('input', previa);
  previa();
  $('#vias').addEventListener('change', () => {
    const t = f.tipo.value;
    $$('.via-extra').forEach((x) => (x.hidden = x.dataset.via !== t));
  });
  $('#probar-feed').addEventListener('click', async (e) => {
    const out = $('#probado');
    e.target.disabled = true; e.target.textContent = 'Leyendo…';
    try {
      const j = await post('/api/corredoras/probar', { feed: f.feed.value.trim() });
      out.className = 'probado ok';
      out.innerHTML = j.n ? `✓ Encontramos <b>${j.n}</b> ${j.n === 1 ? 'parcela' : 'parcelas'}: ${j.ejemplos.map((x) => esc(x.titulo)).join(' · ')}`
        : 'El feed se lee bien, pero no tiene parcelas ni terrenos en venta.';
    } catch (x) { out.className = 'probado mal'; out.textContent = x.message; }
    out.hidden = false;
    e.target.disabled = false; e.target.textContent = 'Probar';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#form-corredora .form-err');
    err.hidden = true;
    const t = f.tipo.value;
    try {
      await post('/api/corredoras', { nombre: f.nombre.value, web: f.web.value.trim(), whatsapp: f.whatsapp.value, comuna: f.comuna.value,
        tipo: t, feed: f.feed.value.trim(), clave: t === 'easybroker' ? f.clave_easybroker.value : t === 'tokko' ? f.clave_tokko.value : '',
        autoriza: f.autoriza.checked });
      f.hidden = true; $('.co-listo').hidden = false; $('#co-previa').hidden = true;
      scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  });
}

window.PyT = { esc, pesos, superficie, tarjetaIndexada: null, abrirHoja, cerrarHojas };
cargar();
