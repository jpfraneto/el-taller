// TuAuto (El Taller, Ep. 06): one screen with one question (inicio), plus the stock 1:1, El Duelo and Nosotros as views.
// Wiring for the valuation (tasar.js) and El Duelo (duelo.js).
import { clp } from './precio.js';
import { iniciarTasacion } from './tasar.js';
import { iniciarDuelo, alDuelo } from './duelo.js';

export const WA = '56966492665'; // TuAuto: sell page + every car's "Contacto" button on their site. Confirm.
export const wa = (texto) => `https://wa.me/${WA}?text=${encodeURIComponent(texto)}`;
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const state = { autos: [], ref: { modelos: [] }, copiado: '' };

export const foto = (a, i = 0, chica = true) =>
  a.fotos?.[i] ? `${a.fotos[i]}${chica ? '-s' : ''}.jpg` : a.fotos_origen?.[i] || '/img/icon.png';
export const kmTxt = (km) => `${Number(km).toLocaleString('es-CL')} km`;
const TIPOS = { suv: 'SUV', pickup: 'Camionetas', hatchback: 'Hatchback', sedan: 'Sedán', citycar: 'Citycar', comerciales: 'Comerciales', coupe: 'Coupé' };
export const nombreCorto = (a) => a.titulo.split(' ').slice(0, 3).join(' ').replace(/\s+\d.*$/, '');

// ── Sheets ──────────────────────────────────────────────────────────────────
export function abrirHoja(id) {
  const h = document.getElementById(id);
  h.hidden = false;
  document.body.style.overflow = 'hidden';
  h.querySelector('.hoja-in').scrollTop = 0;
}
export function cerrarHoja(id) {
  document.getElementById(id).hidden = true;
  if (![...document.querySelectorAll('.hoja')].some((h) => !h.hidden)) document.body.style.overflow = '';
}
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('hoja')) cerrarHoja(e.target.id);
  const c = e.target.closest('[data-cerrar]');
  if (c) cerrarHoja(c.dataset.cerrar);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') [...document.querySelectorAll('.hoja')].filter((h) => !h.hidden).forEach((h) => cerrarHoja(h.id));
});

// ── Stock ───────────────────────────────────────────────────────────────────
const filtro = { tipo: '', q: '', orden: 'nuevo' };

export function cardHtml(a, extra = '') {
  const dias = (Date.now() - new Date(a.publicado).getTime()) / 864e5;
  return `<button class="card" data-auto="${a.slug}" type="button">
    <div class="ph"><img src="${foto(a)}" alt="${esc(a.titulo)}" loading="lazy">
      <span class="tag">${clp(a.precio)}</span>${dias < 8 ? '<span class="nuevo">Recién llegado</span>' : ''}</div>
    <div class="tx"><span class="ti">${esc(a.titulo)}</span>
      <span class="me num">${a.ano} · ${kmTxt(a.km)} · ${esc(a.transmision || '')}</span>${extra}</div>
  </button>`;
}

function pintarStock() {
  const q = filtro.q && filtro.q.toLowerCase();
  let xs = state.autos.filter((a) => (!filtro.tipo || a.tipo === filtro.tipo) && (!q || a.titulo.toLowerCase().includes(q)));
  const o = {
    'nuevo': (a, b) => b.publicado.localeCompare(a.publicado),
    'precio-asc': (a, b) => a.precio - b.precio,
    'precio-desc': (a, b) => b.precio - a.precio,
    'km-asc': (a, b) => a.km - b.km,
    'ano-desc': (a, b) => b.ano - a.ano || a.km - b.km,
  }[filtro.orden];
  xs = [...xs].sort(o);
  $('#grid').innerHTML = xs.map((a) => cardHtml(a)).join('');
  $('#vacio').hidden = xs.length > 0;
}

function pintarChips() {
  const cuenta = {};
  for (const a of state.autos) cuenta[a.tipo] = (cuenta[a.tipo] || 0) + 1;
  const tipos = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
  $('#chips').innerHTML = [`<button class="chip" data-tipo="" aria-pressed="${!filtro.tipo}">Todos<small>${state.autos.length}</small></button>`,
    ...tipos.map((t) => `<button class="chip" data-tipo="${t}" aria-pressed="${filtro.tipo === t}">${TIPOS[t] || t}<small>${cuenta[t]}</small></button>`)].join('');
}

// ── Car detail ──────────────────────────────────────────────────────────────
export function abrirAuto(slug) {
  const a = state.autos.find((x) => x.slug === slug);
  if (!a) return;
  const n = Math.max(a.fotos?.length || 0, Math.min(a.fotos_origen?.length || 0, 12));
  const fotos = Array.from({ length: n }, (_, i) => foto(a, i, false));
  const desc = a.descripcion.filter((l) => !/^VALOR CONTADO|^Valor sujeto|^Financiamiento desde|^Garant[ií]a \d/i.test(l));
  $('#detalle').innerHTML = `
    <button class="cerrar" data-cerrar="hoja-auto" aria-label="Cerrar">×</button>
    <div style="position:relative"><div class="galeria" id="gal">${fotos.map((f, i) => `<img src="${f}" alt="${esc(a.titulo)}, foto ${i + 1}" ${i > 1 ? 'loading="lazy"' : ''}>`).join('')}</div>
      <span class="gal-n" id="gal-n">1 / ${fotos.length}</span></div>
    <div class="hoja-pad">
      <p class="kicker">${esc(TIPOS[a.tipo] || a.tipo || '')} · ${esc(a.marca)}</p>
      <h2 class="det-ti">${esc(a.titulo)}</h2>
      <div class="precios">
        <div class="p1"><span>Precio</span><span class="tag">${clp(a.precio)}</span></div>
        <div class="row"><span>Valor sujeto a financiamiento automotriz</span></div>
        ${a.precio_contado ? `<div class="row"><span>Valor contado</span><b class="num">${clp(a.precio_contado)}</b></div>` : ''}
        ${a.pie_desde ? `<div class="row"><span>Financiamiento desde</span><b class="num">${clp(a.pie_desde)}</b></div>` : ''}
        ${a.garantia ? `<div class="row"><span>Garantía</span><b>${esc(a.garantia)}</b></div>` : ''}
      </div>
      <div class="specs">
        <div class="spec"><small>Año</small><b>${a.ano}</b></div>
        <div class="spec"><small>Km</small><b class="num">${Number(a.km).toLocaleString('es-CL')}</b></div>
        <div class="spec"><small>Motor</small><b>${esc(a.motor || '–')}</b></div>
        <div class="spec"><small>Transmisión</small><b>${esc(a.transmision || '–')}</b></div>
        <div class="spec"><small>Combustible</small><b>${esc(a.combustible || '–')}</b></div>
        <div class="spec"><small>Garantía</small><b>${esc(a.garantia || '–')}</b></div>
      </div>
      <ul class="desc">${desc.map((l) => `<li class="${/^[A-ZÁÉÍÓÚÑ0-9 ,.]+$/.test(l) && l.length > 6 ? 'b' : ''}">${esc(l)}</li>`).join('')}</ul>
      <div class="acciones">
        <a class="btn btn-wa" target="_blank" rel="noopener" href="${wa(`Hola TuAuto, me interesa el ${a.titulo} ${a.ano} (${clp(a.precio)}) que vi en su web.`)}">¡Me interesa!</a>
        <button class="btn btn-navy" type="button" data-duelo="${a.slug}">Ponlo en un duelo</button>
      </div>
      <p class="fuente">Publicado en automotriztuauto.cl el ${new Date(a.publicado + 'T12:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}. <a href="${a.url}" target="_blank" rel="noopener">Ver en su web</a></p>
    </div>`;
  const gal = $('#gal');
  gal.addEventListener('scroll', () => { $('#gal-n').textContent = `${Math.round(gal.scrollLeft / gal.clientWidth) + 1} / ${fotos.length}`; }, { passive: true });
  abrirHoja('hoja-auto');
}

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-auto]');
  if (c) { e.preventDefault(); abrirAuto(c.dataset.auto); return; }
  const d = e.target.closest('[data-duelo]');
  if (d) { cerrarHoja('hoja-auto'); irA('duelo'); alDuelo(d.dataset.duelo); }
});

// ── Views: inicio (the one question), stock, duelo, nosotros ─────────────────
const VISTAS = ['inicio', 'stock', 'duelo', 'nosotros'];
function vistaDeHash() {
  const h = location.hash.slice(1);
  return VISTAS.find((v) => v !== 'inicio' && (h === v || h.startsWith(`${v}=`))) || 'inicio';
}
export function mostrarVista(v = vistaDeHash()) {
  if (document.body.dataset.vista === v) return;
  document.body.dataset.vista = v;
  for (const x of VISTAS) $(`#v-${x}`).hidden = x !== v;
  $('#pie').hidden = v === 'inicio';
  document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  window.scrollTo(0, 0);
}
export function irA(v) {
  if (location.hash.slice(1) !== v) history.pushState(null, '', v === 'inicio' ? location.pathname : `#${v}`);
  mostrarVista(v);
}
window.addEventListener('hashchange', () => mostrarVista());
window.addEventListener('popstate', () => mostrarVista());

// ── Hero: their studio photos, one after another, each with its price tag ────
const HERO = ['chevrolet-silverado-4x4-3-0l-aut-high-country', 'subaruwrx-awd-2-4-mt', 'volvo-xc40-b4-plus-2-0-aut',
  'toyotacorolla-crossseg-cvt-2-0-aut', 'ford-f-150-lariat-sport-4x4-5-0l-aut', 'suzuki-swiftdit-hb-1-0-mt', 'hyundai-santa-fe-4x4-2-4-at', 'haval-dargo-deluxe-4x4-2-0-aut'];
function pintarHero() {
  const autos = HERO.map((s) => state.autos.find((a) => a.slug === s)).filter((a) => a?.fotos?.[1]);
  if (!autos.length) return;
  const bg = $('#hero-bg');
  const tag = $('#hero-tag');
  bg.innerHTML = autos.map((a, i) => `<img src="${foto(a, 1, false)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join('');
  const imgs = [...bg.querySelectorAll('img')];
  let i = 0;
  const poner = () => {
    const a = autos[i];
    imgs.forEach((im, k) => im.classList.toggle('on', k === i));
    tag.classList.add('fuera');
    setTimeout(() => {
      tag.innerHTML = `<b>${clp(a.precio)}</b><small>${esc(nombreCorto(a))} ${a.ano} · en TuAuto hoy</small>`;
      tag.dataset.auto = a.slug;
      tag.hidden = false;
      tag.classList.remove('fuera');
    }, 700);
  };
  poner();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setInterval(() => { if (!document.hidden && document.body.dataset.vista === 'inicio') { i = (i + 1) % autos.length; poner(); } }, 6000);
}

function pintarMarcas() {
  const cuenta = {};
  for (const a of state.autos) cuenta[a.marca] = (cuenta[a.marca] || 0) + 1;
  const titulo = (m) => (m.length <= 3 ? m : m.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()));
  $('#marcas').innerHTML = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]).slice(0, 8)
    .map((m) => `<button type="button" data-marca="${esc(m)}" title="${cuenta[m]} en stock">${esc(titulo(m))}</button>`).join('');
}
$('#marcas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-marca]');
  if (!b) return;
  Object.assign(filtro, { tipo: '', q: b.textContent });
  $('#buscar').value = b.textContent;
  pintarChips();
  pintarStock();
  irA('stock');
});

async function init() {
  const [s, r] = await Promise.all([
    fetch('/data/stock.json').then((x) => x.json()),
    fetch('/data/precios.json').then((x) => (x.ok ? x.json() : { modelos: [] })).catch(() => ({ modelos: [] })),
  ]);
  state.autos = s.autos.filter((a) => a.precio && a.ano);
  state.copiado = s.copiado;
  state.ref = r;
  $('#stock-n').textContent = state.autos.length;
  $('#stock-n2').textContent = state.autos.length;
  $('#stock-fecha').textContent = new Date(s.copiado + 'T12:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#wa-visita').href = wa('Hola TuAuto, quiero agendar una visita a su showroom.');
  $('#wa-top').href = wa('Hola TuAuto 👋');
  pintarHero();
  pintarMarcas();
  pintarChips();
  pintarStock();
  iniciarTasacion();
  iniciarDuelo();
}
mostrarVista();

$('#chips').addEventListener('click', (e) => {
  const c = e.target.closest('[data-tipo]');
  if (!c) return;
  filtro.tipo = c.dataset.tipo;
  pintarChips();
  pintarStock();
});
$('#buscar').addEventListener('input', (e) => { filtro.q = e.target.value.trim(); pintarStock(); });
$('#orden').addEventListener('change', (e) => { filtro.orden = e.target.value; pintarStock(); });
$('#limpiar').addEventListener('click', () => { Object.assign(filtro, { tipo: '', q: '' }); $('#buscar').value = ''; pintarChips(); pintarStock(); });

init();
