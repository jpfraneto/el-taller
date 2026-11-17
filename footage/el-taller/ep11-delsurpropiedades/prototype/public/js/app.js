// Del Sur Propiedades: everything they publish, seen instead of picked from dropdowns.
// Data: /data/propiedades.json (scripts/leer_delsur.py + scripts/preparar.py). /3257 opens listing 3257.

const $ = (s) => document.querySelector(s);
// Where this page lives: '/' (the first one) or '/nueva/' (js/nueva.js). Listings open at BASE + code.
const BASE = document.body.dataset.base || '/';
const POR_PAGINA = 24;
const UF = 41300; // only to sort and bucket prices written in $ next to the ones in UF

const estado = { op: 'venta', tipo: null, precios: new Set(), comuna: null, vista: 'fotos', mostrar: POR_PAGINA, ia: null };
let todas = [];
let config = { wa: '56990992056', demo: '' };
let mapa, capa;

const EJEMPLOS = {
  venta: ['Casa con vista al lago para una familia', 'Parcela con bosque cerca de Puerto Varas', 'Depto en el centro, hasta UF 6.000', 'Terreno para construir en Frutillar'],
  arriendo: ['Casa para arrendar con 3 dormitorios', 'Depto amoblado en el centro', 'Local comercial en Puerto Varas'],
};

// Price buckets: UF for buying, pesos per month for renting.
const TRAMOS = {
  venta: [[0, 3000, '< 3 mil'], [3000, 5000, '3–5 mil'], [5000, 8000, '5–8 mil'], [8000, 12000, '8–12 mil'], [12000, 20000, '12–20 mil'], [20000, Infinity, '20 mil +']],
  arriendo: [[0, 500000, '< 500 mil'], [500000, 800000, '500–800'], [800000, 1200000, '800–1,2 M'], [1200000, 2000000, '1,2–2 M'], [2000000, Infinity, '2 M +']],
};

const fmt = (n) => Math.round(n).toLocaleString('es-CL');
const valor = (p) => (estado.op === 'venta' ? (p.uf ?? (p.clp ? p.clp / UF : null)) : (p.clp ?? (p.uf ? p.uf * UF : null)));
const precioTxt = (p) => (p.uf ? `UF ${fmt(p.uf)}` : p.clp ? `$ ${fmt(p.clp)}` : 'Consultar');
const mini = (p) => p.mini || p.fotos?.[0] || '/img/logo.jpg';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function datos(p) {
  return [
    p.construido && `<span><b>${fmt(p.construido)}</b> m² const.</span>`,
    p.terreno && `<span><b>${fmt(p.terreno)}</b> m² terreno</span>`,
    p.dormitorios && `<span><b>${p.dormitorios}</b> dorm.</span>`,
    p.banos && `<span><b>${p.banos}</b> baños</span>`,
  ].filter(Boolean).join('');
}

function waLink(texto) {
  const pre = config.demo ? `[Demo ${config.demo}] ` : '';
  return `https://wa.me/${config.wa}?text=${encodeURIComponent(pre + texto)}`;
}

// ——— filters ———
const deOp = () => todas.filter((p) => p.operacion === estado.op);
const enTramo = (p) => {
  if (!estado.precios.size) return true;
  const v = valor(p);
  return v != null && [...estado.precios].some((i) => v >= TRAMOS[estado.op][i][0] && v < TRAMOS[estado.op][i][1]);
};
const filtradas = ({ sinTipo, sinPrecio, sinComuna } = {}) => deOp().filter((p) =>
  (sinTipo || !estado.tipo || p.tipo === estado.tipo) && (sinPrecio || enTramo(p)) && (sinComuna || !estado.comuna || p.comuna === estado.comuna));

function pintarTipos() {
  const base = filtradas({ sinTipo: true });
  const grupos = new Map();
  for (const p of deOp()) if (!grupos.has(p.tipo)) grupos.set(p.tipo, []);
  for (const p of base) grupos.get(p.tipo)?.push(p);
  $('#tipos').innerHTML = [...grupos].map(([tipo, ps]) => {
    const portada = ps.find((p) => p.mini) || deOp().find((p) => p.tipo === tipo);
    return `<button class="tipo ${estado.tipo === tipo ? 'on' : ''}" data-tipo="${esc(tipo)}">
      <div class="img"><img src="${esc(mini(portada))}" alt="" loading="lazy"><span class="n">${ps.length}</span></div>
      <span class="nom">${esc(tipo)}</span></button>`;
  }).join('');
}

function pintarPrecios() {
  const base = filtradas({ sinPrecio: true });
  const tramos = TRAMOS[estado.op];
  const n = tramos.map(([a, b]) => base.filter((p) => { const v = valor(p); return v != null && v >= a && v < b; }).length);
  const max = Math.max(1, ...n);
  $('#precios').innerHTML = tramos.map(([, , nom], i) =>
    `<button class="barra-p ${estado.precios.has(i) ? 'on' : ''}" data-tramo="${i}" aria-label="${nom}: ${n[i]}">
      <small>${n[i]}</small><i style="height:${Math.round((n[i] / max) * 86)}%"></i><b>${nom}</b></button>`).join('');
}

function pintarComunas() {
  const base = filtradas({ sinComuna: true });
  const c = new Map();
  for (const p of base) c.set(p.comuna, (c.get(p.comuna) || 0) + 1);
  if (estado.comuna && !c.has(estado.comuna)) c.set(estado.comuna, 0);
  $('#comunas').innerHTML = [...c].sort((a, b) => b[1] - a[1]).map(([com, k]) =>
    `<button class="${estado.comuna === com ? 'on' : ''}" data-comuna="${esc(com)}">${esc(com)}<small>${k}</small></button>`).join('');
}

function carta(p, porque) {
  return `<button class="carta" data-id="${p.id}">
    <div class="foto"><img src="${esc(mini(p))}" alt="" loading="lazy">
      <span class="etq">${p.operacion === 'venta' ? 'En venta' : 'Arriendo'}</span><span class="cod">${p.id}</span>
      ${porque ? `<span class="por">${esc(porque)}</span>` : ''}</div>
    <div class="txt"><h3>${esc(p.titulo)}</h3><div class="donde">${esc(p.tipo)} · ${esc(p.comuna)}</div>
      <div class="precio">${precioTxt(p)}${p.uf && p.clp ? `<small>$ ${fmt(p.clp)}</small>` : ''}</div>
      <div class="datos">${datos(p)}</div></div></button>`;
}

function lista() {
  if (estado.ia) {
    const por = new Map(estado.ia.propiedades.map((x) => [String(x.id), x.porque]));
    return estado.ia.propiedades.map((x) => todas.find((p) => p.id === String(x.id))).filter(Boolean).map((p) => [p, por.get(p.id)]);
  }
  return filtradas().sort((a, b) => (valor(a) ?? 1e12) - (valor(b) ?? 1e12)).map((p) => [p, null]);
}

function pintarResultados() {
  const ps = lista();
  $('#cuantas').textContent = estado.ia ? `${ps.length} para lo que buscas` : `${ps.length} ${ps.length === 1 ? 'propiedad' : 'propiedades'}`;
  if (estado.vista === 'mapa') { pintarMapa(ps.map(([p]) => p)); $('#grilla').innerHTML = ''; $('#mas').hidden = true; return; }
  $('#grilla').innerHTML = ps.length ? ps.slice(0, estado.mostrar).map(([p, por]) => carta(p, por)).join('')
    : '<p class="vacio">Nada con esos filtros. Suelta alguno.</p>';
  $('#mas').hidden = ps.length <= estado.mostrar;
}

function pintar() {
  pintarTipos(); pintarPrecios(); pintarComunas(); pintarResultados();
  $('#cuanto').textContent = estado.op === 'venta' ? '¿Cuánto? · en UF' : '¿Cuánto? · al mes';
  $('#ejemplos').innerHTML = EJEMPLOS[estado.op].map((e) => `<button type="button">${e}</button>`).join('');
}

// ——— map ———
let enMapa = [];

function pintarMapa(ps) {
  if (!window.L) return;
  if (!mapa) {
    mapa = L.map('mapa', { zoomControl: false, attributionControl: true }).setView([-41.2, -72.9], 10);
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap',
    }).addTo(mapa);
    mapa.on('zoomend', agrupar);
  }
  enMapa = ps.filter((p) => p.lat != null);
  setTimeout(() => {
    mapa.invalidateSize();
    // Fit to the lake (within ~80 km of Puerto Varas) when there's something there; the far ones are a zoom-out away.
    const cerca = enMapa.filter((p) => Math.abs(p.lat + 41.32) < 0.75 && Math.abs(p.lng + 72.98) < 1);
    const ver = cerca.length ? cerca : enMapa;
    if (ver.length) mapa.fitBounds(ver.map((p) => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 13 });
    agrupar();
  }, 50);
}

// Pins closer than ~44 px on screen become one numbered pin (redone on every zoom). Most listings only say their comuna,
// so many share the comuna's center: tapping a group shows its photos in a row.
function agrupar() {
  if (capa) capa.remove();
  capa = L.layerGroup().addTo(mapa);
  const celdas = new Map();
  for (const p of enMapa) {
    const pt = mapa.project([p.lat, p.lng], mapa.getZoom());
    const k = `${Math.floor(pt.x / 44)},${Math.floor(pt.y / 44)}`;
    if (!celdas.has(k)) celdas.set(k, []);
    celdas.get(k).push(p);
  }
  for (const grupo of celdas.values()) {
    const lat = grupo.reduce((s, p) => s + p.lat, 0) / grupo.length;
    const lng = grupo.reduce((s, p) => s + p.lng, 0) / grupo.length;
    const n = grupo.length;
    const t = n === 1 ? 22 : Math.min(52, 28 + Math.sqrt(n) * 2.5);
    const m = L.marker([lat, lng], { icon: L.divIcon({ className: '', html: `<div class="pin ${n === 1 ? 'uno' : ''}" style="width:${t}px;height:${t}px">${n === 1 ? '' : n}</div>`, iconSize: [t, t] }) });
    m.bindPopup(`<div class="pop">${grupo.slice(0, 40).map((p) => `<button data-id="${p.id}"><img src="${esc(mini(p))}" loading="lazy" alt=""><b>${esc(p.titulo)}</b><span>${precioTxt(p)} · ${esc(p.comuna)}${p.aprox === 'comuna' ? ' (referencial)' : ''}</span></button>`).join('')}</div>`, { maxWidth: 260, minWidth: 240 });
    m.addTo(capa);
  }
}

// ——— one listing ———
function abrir(id, { empujar = true } = {}) {
  const p = todas.find((x) => x.id === String(id));
  if (!p) { alertaCodigo(id); return; }
  const porque = estado.ia?.propiedades.find((x) => String(x.id) === p.id)?.porque;
  const fotos = p.fotos?.length ? p.fotos : [mini(p)];
  $('#fichaIn').innerHTML = `<button class="cerrar" aria-label="Cerrar">✕</button>
    <div class="galeria" id="galeria">${fotos.map((f, i) => `<img src="${esc(f)}" alt="" ${i ? '' : `style="background-image:url('${esc(mini(p))}')"`} ${i > 1 ? 'loading="lazy"' : ''}>`).join('')}</div>
    <div class="contador" id="contador">1 / ${fotos.length} · desliza</div>
    <div class="cuerpo">
      <p class="kicker">${p.operacion === 'venta' ? 'En venta' : 'Arriendo'} · Código ${p.id}</p>
      <h2>${esc(p.titulo)}</h2>
      <div class="donde">${esc(p.tipo)} · ${esc(p.comuna)}</div>
      <div class="precio">${precioTxt(p)}${p.uf && p.clp ? `<small>$ ${fmt(p.clp)} (referencial)</small>` : ''}</div>
      <div class="datos">${datos(p)}</div>
      ${porque ? `<div class="porque">${esc(porque)}</div>` : ''}
      <div class="desc">${esc(p.descripcion)}</div>
      <div class="links">
        ${p.lugar ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(p.lugar)}" target="_blank" rel="noopener">Ver en Google Maps (referencial)</a>` : ''}
        <a href="${esc(p.url)}" target="_blank" rel="noopener">Ver en delsurpropiedades.cl</a>
      </div>
    </div>
    <div class="accion">
      <a class="wa" target="_blank" rel="noopener" href="${waLink(`Hola, me interesa la propiedad ${p.id}: ${p.titulo} (${precioTxt(p)}). ${location.origin}${BASE}${p.id}`)}">Me interesa</a>
      <button id="compartir">Compartir</button>
    </div>`;
  $('#ficha').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#fichaIn').scrollTop = 0;
  const g = $('#galeria');
  g.addEventListener('scroll', () => { $('#contador').textContent = `${Math.round(g.scrollLeft / g.clientWidth) + 1} / ${fotos.length}`; }, { passive: true });
  $('#compartir').onclick = async () => {
    const url = `${location.origin}${BASE}${p.id}`;
    try { if (navigator.share) await navigator.share({ title: p.titulo, url }); else { await navigator.clipboard.writeText(url); $('#compartir').textContent = 'Copiado'; } } catch {}
  };
  if (empujar) history.pushState({ id: p.id }, '', `${BASE}${p.id}`);
  document.title = `${p.titulo} · Del Sur Propiedades`;
}

function cerrar({ volver = true } = {}) {
  $('#ficha').hidden = true;
  document.body.style.overflow = '';
  document.title = 'Del Sur Propiedades · Puerto Varas';
  if (volver && location.pathname !== volverA()) history.pushState({}, '', volverA());
}

// Where closing a ficha goes back to: the page itself, or (in /nueva/) the list it was opened over (body data-lista).
const volverA = () => document.body.dataset.lista || BASE;

function alertaCodigo(id) {
  const i = $('#cod');
  i.value = ''; i.placeholder = 'no está'; i.focus();
  setTimeout(() => { i.placeholder = '3257'; }, 2200);
  if (location.pathname !== volverA()) history.replaceState({}, '', volverA());
  console.log('código no encontrado', id);
}

// ——— "cuéntanos cómo quieres vivir" ———
async function buscar(texto) {
  const btn = $('#buscaBtn');
  btn.disabled = true; btn.textContent = 'Buscando…';
  const r = $('#respuesta');
  try {
    const res = await fetch('/api/busca', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto, operacion: estado.op }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'No resultó.');
    estado.ia = j;
    r.innerHTML = `<p>${esc(j.respuesta)}</p><button class="limpia" type="button">Ver todas otra vez</button>`;
    r.hidden = false;
    r.querySelector('.limpia').onclick = () => { estado.ia = null; r.hidden = true; pintarResultados(); };
    estado.vista = 'fotos'; marcarVista();
    pintarResultados();
    $('.resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    r.innerHTML = `<p>${esc(e.message)}</p>`; r.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar';
  }
}

function marcarVista() {
  document.querySelectorAll('.vista button').forEach((b) => b.classList.toggle('on', b.dataset.vista === estado.vista));
  $('#mapa').hidden = estado.vista !== 'mapa';
}

// Comprar / Arrendar: starts over with that operation's listings. Without an argument: which one is showing.
function operacion(op) {
  if (!op) return estado.op;
  estado.op = op; estado.tipo = null; estado.precios.clear(); estado.comuna = null; estado.ia = null; estado.mostrar = POR_PAGINA;
  $('#respuesta').hidden = true;
  document.querySelectorAll('.operacion button').forEach((b) => b.classList.toggle('on', b.dataset.op === estado.op));
  pintar();
}

// ——— events ———
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) { if (e.target.id === 'ficha') cerrar(); return; }
  if (t.matches('.cerrar')) return cerrar();
  if (t.dataset.id) return abrir(t.dataset.id);
  if (t.dataset.op) return operacion(t.dataset.op);
  if (t.dataset.tipo !== undefined) { estado.tipo = estado.tipo === t.dataset.tipo ? null : t.dataset.tipo; estado.ia = null; estado.mostrar = POR_PAGINA; return pintar(); }
  if (t.dataset.tramo !== undefined) { const i = Number(t.dataset.tramo); estado.precios.has(i) ? estado.precios.delete(i) : estado.precios.add(i); estado.ia = null; estado.mostrar = POR_PAGINA; return pintar(); }
  if (t.dataset.comuna !== undefined) { estado.comuna = estado.comuna === t.dataset.comuna ? null : t.dataset.comuna; estado.ia = null; estado.mostrar = POR_PAGINA; return pintar(); }
  if (t.dataset.vista) { estado.vista = t.dataset.vista; marcarVista(); return pintarResultados(); }
  if (t.id === 'mas') { estado.mostrar += POR_PAGINA; return pintarResultados(); }
  if (t.closest('#ejemplos')) { $('#texto').value = t.textContent; return buscar(t.textContent); }
});

$('#busca').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#texto').value.trim(); if (v) buscar(v); });
$('#texto').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#busca').requestSubmit(); } });
$('#codigo').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#cod').value.replace(/\D/g, ''); if (v) abrir(v); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#ficha').hidden) cerrar(); });
window.addEventListener('popstate', () => {
  const id = location.pathname.replace(/\D/g, '');
  if (id) abrir(id, { empujar: false }); else cerrar({ volver: false });
});

// ——— start ———
// js/nueva.js imports these: it waits for `listo` (the listings) and opens fichas / WhatsApp the same way.
export { abrir, operacion, waLink, precioTxt, mini, esc, fmt };
export const listo = (async () => {
  const [d, club, cfg] = await Promise.all([
    fetch('/data/propiedades.json').then((r) => r.json()),
    fetch('/data/club.json').then((r) => r.json()).catch(() => ({ alianzas: [] })),
    fetch('/api/config').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  todas = d.propiedades;
  if (cfg?.wa) config = cfg;
  $('#leido').textContent = new Date(`${d.leido}T12:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#waGeneral').href = waLink('Hola, vengo de su página. Estoy buscando ');
  $('#club').innerHTML = club.alianzas.filter((a) => a.foto).map((a) => `<a href="${esc(a.link)}" target="_blank" rel="noopener">
    <img src="${esc(a.foto)}" alt="" loading="lazy"><div><b>${esc(a.nombre)}</b>${esc(a.beneficio)}</div></a>`).join('');
  pintar();
  const id = location.pathname.replace(/\D/g, '');
  if (id) abrir(id, { empujar: false });
  return todas;
})();
