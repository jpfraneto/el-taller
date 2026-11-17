// Del Sur Propiedades, second version (/nueva/): a corredora first. One page per thing (JP: "es confuso que todo esté en
// la misma página"): /nueva/ who they are + three doors, /nueva/comprar, /nueva/arrendar, /nueva/vender. Their monthly
// picks as a story (/nueva/noviembre, their own post: data/noviembre.json). "¿Qué buscas?" floats bottom right.
// The search, filters, map and fichas are app.js, the same as the first version (/nueva/3257 opens a listing).
import { abrir, operacion, waLink, precioTxt, mini, esc, fmt, listo } from './app.js';

const $ = (s) => document.querySelector(s);
const BASE = document.body.dataset.base;
const SEG = 7000; // ms per listing in the story (the cover: half)

let mes = null; // data/noviembre.json with each listing joined in
let todas = [];

// ——— pages ———
const PAGINAS = { '': 'inicio', comprar: 'buscar', arrendar: 'buscar', noviembre: 'buscar', vender: 'vender' };
const TITULOS = { inicio: 'Compra, arrienda o vende en Puerto Varas', comprar: 'Comprar', arrendar: 'Arrendar', vender: 'Vender o arrendar tu propiedad' };
const tramo = () => location.pathname.slice(BASE.length).replace(/\/$/, '');

// A double click on a door used to land its second click on whatever the new page had under the pointer (JP got
// "Industrial" selected). Clicks in the first moment after a page change are dropped, before app.js sees them.
let cambio = 0;
window.addEventListener('click', (e) => {
  if (performance.now() - cambio < 500) { e.stopPropagation(); e.preventDefault(); }
}, true);

function ir(seg, { empujar = true } = {}) {
  let op = null;
  if (/^\d+$/.test(seg)) { // a listing: its list underneath (app.js opens the ficha)
    const p = todas.find((x) => x.id === seg);
    op = p?.operacion || 'venta';
    seg = op === 'venta' ? 'comprar' : 'arrendar';
    empujar = false;
  }
  const pagina = PAGINAS[seg] ?? 'inicio';
  if (pagina === 'buscar') {
    op = op || (seg === 'arrendar' ? 'arriendo' : 'venta');
    // Coming in through a door starts clean (no filter left from before); back/forward keeps what was there.
    const entra = empujar && document.body.dataset.pagina !== 'buscar';
    if (entra || operacion() !== op) operacion(op);
    seg = seg === 'noviembre' ? 'comprar' : seg;
    $('#buscarTitulo').textContent = op === 'venta' ? 'Comprar' : 'Arrendar';
    if (mes) $('#mes').hidden = op !== 'venta';
  }
  document.body.dataset.lista = pagina === 'buscar' ? `${BASE}${seg}` : BASE;
  const antes = document.body.dataset.pagina;
  document.body.dataset.pagina = pagina;
  document.querySelectorAll('[data-ver]').forEach((s) => { s.hidden = s.dataset.ver !== pagina; });
  document.title = `${TITULOS[seg] || TITULOS[pagina] || 'Del Sur Propiedades'} · Del Sur Propiedades`;
  if (antes !== pagina || seg !== tramo()) window.scrollTo(0, 0);
  if (antes && antes !== pagina) cambio = performance.now();
  if (empujar && location.pathname !== `${BASE}${seg}`) history.pushState({}, '', `${BASE}${seg}`);
}

// ——— the three doors ———
function puertas() {
  const venta = todas.filter((p) => p.operacion === 'venta');
  const arriendo = todas.filter((p) => p.operacion === 'arriendo');
  $('#nCompra').textContent = `${fmt(venta.length)} en venta`;
  $('#nArriendo').textContent = `${fmt(arriendo.length)} en arriendo`;
  $('#fotoCompra').src = mini(venta.find((p) => p.id === '3257') || venta.find((p) => p.mini) || {});
  $('#fotoArriendo').src = mini(arriendo.find((p) => p.mini && p.tipo.startsWith('Casas')) || arriendo.find((p) => p.mini) || {});
}

// ——— their picks of the month: one banner on Comprar that opens the story ———
function banner() {
  const tapa = mes.propiedades.find((x) => x.id === mes.portada) || mes.propiedades[0];
  const desde = Math.min(...mes.propiedades.map((x) => x.p.uf || Infinity));
  $('#mesFoto').src = mini(tapa.p);
  $('#mesTitulo').textContent = mes.titulo;
  $('#mesSub').textContent = `${mes.propiedades.length} propiedades${Number.isFinite(desde) ? ` · desde UF ${fmt(desde)}` : ''}`;
}

// The story: cover, one slide per listing (their words, the price, their photos), and an end that opens everything else.
let h = { i: 0, t0: 0, pausa: 0, raf: 0, fotos: 0 };

function escenas() {
  return [{ tipo: 'portada' }, ...mes.propiedades.map((x) => ({ tipo: 'prop', x })), { tipo: 'fin' }];
}

function fotosDe(p) {
  const f = (p.fotos || []).slice(0, 4);
  return f.length ? f : [mini(p)];
}

function pintarEscena() {
  const e = escenas()[h.i];
  const n = mes.propiedades.length;
  clearInterval(h.fotos);
  let html = '';
  if (e.tipo === 'portada') {
    const tapa = mes.propiedades.find((x) => x.id === mes.portada) || mes.propiedades[0];
    html = `<div class="h-fondo"><img src="${esc(fotosDe(tapa.p)[0])}" alt=""></div>
      <div class="h-portada"><img class="h-logo" src="/img/logo.jpg" alt="Del Sur Propiedades">
        <h2>${esc(mes.titulo)}</h2><p class="h-bajada">${esc(mes.bajada)}</p>
        <p>${esc(mes.intro)}</p><p class="h-n">${n} propiedades seleccionadas →</p></div>`;
  } else if (e.tipo === 'prop') {
    const { x } = e;
    const fs = fotosDe(x.p);
    html = `<div class="h-fondo">${fs.map((f, k) => `<img src="${esc(f)}" alt="" class="${k ? '' : 'on'}">`).join('')}</div>
      <p class="h-num">${h.i} de ${n} · Cód. ${x.id}</p>
      <div class="h-tarjeta">
        <h2>${esc(x.nombre)}</h2><p class="h-donde">${esc(x.lugar)}</p>
        <ul>${x.puntos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="h-precio">${precioTxt(x.p)}${x.p.uf && x.p.clp ? `<small>$ ${fmt(x.p.clp)} referencial</small>` : ''}</p>
        <div class="h-acciones"><button data-ficha="${x.id}">Ver la propiedad</button>
          <a class="wa" target="_blank" rel="noopener" href="${waLink(`Hola, vi las oportunidades de noviembre y me interesa la ${x.id}: ${x.nombre} (${precioTxt(x.p)}). ${location.origin}${BASE}${x.id}`)}">Me interesa</a></div>
      </div>`;
    let k = 0;
    h.fotos = setInterval(() => {
      const imgs = document.querySelectorAll('.h-fondo img');
      if (imgs.length < 2) return;
      imgs[k].classList.remove('on'); k = (k + 1) % imgs.length; imgs[k].classList.add('on');
    }, 2300);
  } else {
    const venta = todas.filter((p) => p.operacion === 'venta').length;
    html = `<div class="h-fondo"><img src="/img/caminando.webp" alt=""></div>
      <div class="h-portada h-fin"><h2>¿Ninguna es la tuya?</h2><p>Tenemos ${fmt(venta)} propiedades en venta. Míralas todas, o cuéntanos qué buscas y te ayudamos a elegir bien.</p>
        <div class="h-acciones"><button data-todas>Ver todas</button>
          <a class="wa" target="_blank" rel="noopener" href="${waLink('Hola, vi las oportunidades de noviembre. Estoy buscando ')}">Cuéntanos qué buscas</a></div></div>`;
  }
  $('#hEscena').innerHTML = html;
  $('#hBarras').innerHTML = escenas().map((_, k) => `<i><b style="width:${k < h.i ? 100 : 0}%"></b></i>`).join('');
  // the next slide's first photo, so it's there when the bar fills
  const sig = escenas()[h.i + 1];
  if (sig?.tipo === 'prop') new Image().src = fotosDe(sig.x.p)[0];
  h.t0 = performance.now(); h.pausa = 0;
}

function duracion() {
  const e = escenas()[h.i];
  return e.tipo === 'portada' ? SEG / 2 : e.tipo === 'fin' ? Infinity : SEG;
}

function correr(ahora) {
  if ($('#historia').hidden) return;
  if (!h.pausa) {
    const r = Math.min(1, (ahora - h.t0) / duracion());
    const b = document.querySelectorAll('#hBarras b')[h.i];
    if (b) b.style.width = `${r * 100}%`;
    if (r >= 1) escena(h.i + 1);
  }
  h.raf = requestAnimationFrame(correr);
}

function escena(i) {
  const total = escenas().length;
  h.i = Math.max(0, Math.min(total - 1, i));
  pintarEscena();
}

function abrirHistoria(i = 0, { empujar = true } = {}) {
  $('#historia').hidden = false;
  document.body.style.overflow = 'hidden';
  escena(i);
  cancelAnimationFrame(h.raf);
  h.raf = requestAnimationFrame(correr);
  if (empujar) history.pushState({ historia: true }, '', `${BASE}noviembre`);
}

function cerrarHistoria({ volver = true } = {}) {
  $('#historia').hidden = true;
  document.body.style.overflow = '';
  clearInterval(h.fotos);
  cancelAnimationFrame(h.raf);
  const lista = document.body.dataset.lista || BASE;
  if (volver && location.pathname !== lista) history.pushState({}, '', lista);
}

// Hold to pause, tap the left third to go back, anywhere else to go forward (buttons and links do their own thing).
const visor = $('#historia');
visor.addEventListener('pointerdown', (e) => { if (!e.target.closest('button, a')) h.pausa = performance.now(); });
visor.addEventListener('pointerup', (e) => {
  if (e.target.closest('button, a')) return;
  const sostenido = h.pausa && performance.now() - h.pausa > 350;
  if (h.pausa) h.t0 += performance.now() - h.pausa;
  h.pausa = 0;
  if (sostenido) return;
  escena(e.clientX < window.innerWidth * 0.3 ? h.i - 1 : h.i + 1);
});
$('#hCerrar').addEventListener('click', () => cerrarHistoria());
$('#hEscena').addEventListener('click', (e) => {
  const ver = e.target.closest('[data-ficha]');
  if (ver) { cerrarHistoria({ volver: false }); history.replaceState({}, '', document.body.dataset.lista); abrir(ver.dataset.ficha); return; }
  if (e.target.closest('[data-todas]')) { cerrarHistoria(); $('.resultados').scrollIntoView({ behavior: 'smooth' }); }
});

// ——— owners: "cuéntanos de tu propiedad" → WhatsApp ———
document.querySelectorAll('.chips').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
}));
$('#tuya').addEventListener('submit', (e) => {
  e.preventDefault();
  const elegido = (c) => document.querySelector(`.chips[data-campo="${c}"] .on`)?.textContent || '';
  const donde = $('#tuyaDonde').value.trim();
  const mas = $('#tuyaMas').value.trim();
  const nombre = $('#tuyaNombre').value.trim();
  const texto = [`Hola, quiero ${elegido('quiero')} ${elegido('es')}${donde ? ` en ${donde}` : ''}.`, mas, nombre && `Soy ${nombre}.`]
    .filter(Boolean).join(' ');
  window.open(waLink(texto), '_blank', 'noopener');
});

// ——— "¿Qué buscas?": the floating button opens the search box (app.js runs it) and their WhatsApp ———
const hoja = (abierta) => {
  $('#hoja').hidden = !abierta;
  document.body.style.overflow = abierta ? 'hidden' : '';
  if (abierta) setTimeout(() => $('#texto').focus(), 50);
};
$('#flota').addEventListener('click', () => hoja(true));
$('#hojaCerrar').addEventListener('click', () => hoja(false));
$('#hoja').addEventListener('click', (e) => { if (e.target.id === 'hoja') hoja(false); });
// A search shows its answer over the list: from Inicio or Vender it goes to the list first.
const alBuscar = () => {
  hoja(false);
  if (document.body.dataset.pagina !== 'buscar') ir(operacion() === 'arriendo' ? 'arrendar' : 'comprar');
};
$('#busca').addEventListener('submit', () => { if ($('#texto').value.trim()) alBuscar(); });
$('#ejemplos').addEventListener('click', (e) => { if (e.target.closest('button')) alBuscar(); });

// ——— links between pages, the month banner, back/forward ———
document.addEventListener('click', (e) => {
  const t = e.target.closest('a[data-ruta], button[data-ruta], button[data-historia]');
  if (!t) return;
  if (t.dataset.historia !== undefined) return abrirHistoria(Number(t.dataset.historia));
  e.preventDefault();
  ir(t.dataset.ruta);
});
window.addEventListener('popstate', () => {
  const seg = tramo();
  ir(seg, { empujar: false });
  if (seg === 'noviembre' && mes) abrirHistoria(0, { empujar: false });
  else if (!$('#historia').hidden) cerrarHistoria({ volver: false });
});

(async () => {
  const [lista, nov] = await Promise.all([listo, fetch('/data/noviembre.json').then((r) => r.json()).catch(() => null)]);
  todas = lista;
  puertas();
  $('#waHoja').href = waLink('Hola, vengo de su página. Estoy buscando ');
  if (nov) {
    const props = nov.propiedades.map((x) => ({ ...x, p: todas.find((p) => p.id === x.id) })).filter((x) => x.p);
    if (props.length) { mes = { ...nov, propiedades: props }; banner(); }
  }
  ir(tramo(), { empujar: false });
  if (mes && tramo() === 'noviembre') abrirHistoria(0, { empujar: false });
})();
