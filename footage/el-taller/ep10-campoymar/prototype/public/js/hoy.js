// /hoy/: the shop on one page. Catalog (with what came out today) → your order → the tests you reserve → where we are → your café.
// State from /api/estado (KV, written by Campo & Mar from /horno/); the catalog and the network from data/catalogo.json.
// The order ends as a written WhatsApp message (demo: El Taller's number, see wrangler.jsonc).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[<&"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));

let wa = { numero: '56948455809', demo: 'Campo & Mar' };
let est = { hoy: null, pruebas: [], llego: [] };
let abierta = null;
let cat = null;
const pedido = new Map();

const dia = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

function hace(iso) {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 2) return 'recién';
  if (m < 60) return `hace ${m} min`;
  if (m < 60 * 24) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} días`;
}


// what came out today, if they wrote it: a line over the catalog, and a "salió hoy" seal on the matching products
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function salioEn(p) {
  const h = est.hoy;
  if (!h) return [];
  const raiz = norm(p.nombre).split(/\s+/).filter((w) => w.length > 4).map((w) => w.slice(0, 5));
  return ['ancud', 'castro'].filter((c) => raiz.length && raiz.every((r) => norm(h[c] || '').includes(r)));
}

function pintarSalio() {
  const h = est.hoy;
  const una = (t) => t.split(/\n|,/).map((x) => x.trim()).filter(Boolean).map(esc).join(', ') || 'nada hoy';
  $('#salio-cuerpo').innerHTML = h
    ? `<div class="hoy-linea"><b>Hoy salió</b> <span>(${esc(h.hora)})</span><br>Ancud: ${una(h.ancud || '')}<br>Castro: ${una(h.castro || '')}</div>`
    : `<div class="hoy-linea vacia"><b>Hoy salió</b><br><span class="hueco">Todavía no cuentan qué salió hoy.</span>
        <span class="nota">Cada mañana lo escriben desde el teléfono y aparece aquí.</span></div>`;
}

const chip = (v, si, no) => v === true ? `<span class="chip">${si}</span>` : v === false ? `<span class="chip no">${no}</span>`
  : `<span class="chip nose">${si} ?</span>`;

function pintarVitrina() {
  if (!cat) return;
  $('#vitrina').innerHTML = cat.productos.filter((p) => !p.prueba).map((p) => {
    const n = pedido.get(p.id) || 0;
    const salio = salioEn(p);
    return `<article class="pieza">
      <div class="ft">${p.foto ? `<img src="../${esc(p.foto)}" alt="" loading="lazy">` : `<div class="placa ${esc(p.tipo)}">${esc(p.nombre)}</div>`}
        ${salio.length ? `<span class="salio-sello">salió hoy · ${salio.map((c) => c[0].toUpperCase() + c.slice(1)).join(' y ')}</span>` : ''}</div>
      <div class="tx">
        <div class="n">${esc(p.nombre)}</div>
        <div class="lleva">${p.lleva.map(esc).join(' · ')}</div>
        <div class="chips">${chip(p.sin_gluten, 'sin gluten', 'con gluten')}${chip(p.vegano, 'vegano', 'no vegano')}${p.aplv ? '<span class="chip">APLV</span>' : ''}
          ${p.endulzado ? `<span class="chip">${esc(p.endulzado)}</span>` : '<span class="chip nose">¿con qué se endulza?</span>'}</div>
        <button type="button" class="mas${n ? ' puesto' : ''}" data-agregar="${esc(p.id)}">${n ? `✓ ${n} en tu pedido` : '+ Agregar'}</button>
      </div>
    </article>`;
  }).join('');
}

function pintarPedido() {
  const items = [...pedido].filter(([, n]) => n > 0);
  const prod = (id) => cat.productos.find((x) => x.id === id);
  const mini = (p) => p.foto ? `<img src="../${esc(p.foto)}" alt="">` : `<span class="mini ${esc(p.tipo)}">${esc(p.nombre[0])}</span>`;
  $('#carrito').innerHTML = items.length
    ? items.map(([id, n]) => { const p = prod(id); return `<li class="item">${mini(p)}<span class="nom">${esc(p.nombre)}
        <button type="button" class="quitar" data-quitar="${esc(id)}">quitar</button></span>
        <span class="cant"><button type="button" data-menos="${esc(id)}" aria-label="Uno menos">−</button><span>${n}</span>
        <button type="button" data-agregar="${esc(id)}" aria-label="Uno más">+</button></span></li>`; }).join('')
    : '<li class="vacio">Tu pedido está vacío. Agrega algo:</li>';
  // what's not in the order yet, to add without leaving
  const resto = cat.productos.filter((p) => !p.prueba && !pedido.get(p.id));
  $('#sumar').innerHTML = resto.length ? `<div class="sumar-t">${items.length ? 'Agregar algo más' : ''}</div>
    <div class="sumar-fila">${resto.map((p) => `<button type="button" data-agregar="${esc(p.id)}">${mini(p)}<span>+ ${esc(p.nombre)}</span></button>`).join('')}</div>` : '';
  const total = items.reduce((t, [, n]) => t + n, 0);
  $('#barra-pedido').hidden = !total || $('#hoja').open;
  $('#barra-n').textContent = `${total} ${total === 1 ? 'cosa' : 'cosas'} en tu pedido`;
  armarWa();
}

function abrirHoja() {
  $('#hoja-cuerpo').append($('#form-pedido'));
  $('#hoja').showModal();
  $('#barra-pedido').hidden = true;
}
$('#hoja').addEventListener('close', () => {
  $('#encarga').append($('#form-pedido'));
  pintarPedido();
});

function armarWa() {
  const f = $('#form-pedido');
  const v = (k) => (f.elements[k]?.value || '').trim();
  const items = [...pedido].filter(([, n]) => n > 0).map(([id, n]) => `• ${n} × ${cat.productos.find((x) => x.id === id).nombre}`);
  const falta = [!items.length && 'algo del catálogo', !v('dia') && 'el día', !v('nombre') && 'tu nombre'].filter(Boolean);
  const texto = ['Hola Campo & Mar 🌿 Quiero encargar:', ...items, '', `Retiro en: ${f.querySelector('[name=retiro]:checked').value}`,
    `Para el: ${v('dia') ? dia(v('dia')) : ''}`, `Nombre: ${v('nombre')}`, v('nota') ? `Nota: ${v('nota')}` : null].filter((x) => x != null);
  const a = $('#wa-pedido');
  a.href = `https://wa.me/${wa.numero}?text=${encodeURIComponent((wa.demo ? `[demo · ${wa.demo}] ` : '') + texto.join('\n'))}`;
  a.setAttribute('aria-disabled', String(falta.length > 0));
  $('#falta').textContent = falta.length ? `Falta: ${falta.join(', ')}.` : 'Listo: se abre WhatsApp con tu pedido escrito.';
}

function barra(p) {
  if (!p.meta) {
    return `<div class="contador"><b>${p.cuenta}</b> ${p.cuenta === 1 ? 'persona la quiere' : 'personas la quieren'}
      ${p.ultima ? `<span class="ult">· la última ${hace(p.ultima)}</span>` : ''}</div>
      <div class="nota">¿Cuántas reservas para hornearla? <span class="hueco">lo ponen ellos</span></div>`;
  }
  const pct = Math.min(100, Math.round((p.cuenta / p.meta) * 100));
  const faltan = Math.max(0, p.meta - p.cuenta);
  return `<div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="${p.meta}" aria-valuenow="${p.cuenta}"><i style="width:${pct}%"></i></div>
    <div class="contador"><b>${p.cuenta}</b> de ${p.meta} · ${faltan ? `faltan ${faltan} para hornearla` : 'se llenó'}
      ${p.ultima ? `<span class="ult">· la última ${hace(p.ultima)}</span>` : ''}</div>`;
}

function pintarPruebas() {
  $('#pruebas').innerHTML = est.pruebas.filter((p) => p.estado !== 'cerrada').map((p) => `
    <article class="prueba${p.estado === 'sale' ? ' sale' : ''}">
      ${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : ''}
      <div class="cuerpo">
        ${p.estado === 'sale' ? `<div class="sello">sale ${esc(p.sale || 'pronto')}</div>` : ''}
        <div class="n">${esc(p.nombre)}</div>
        <p>${esc(p.texto)}</p>
        ${barra(p)}
        ${p.estado === 'abierta' ? `<button type="button" class="quiero" data-reservar="${esc(p.id)}">Yo quiero</button>` : ''}
        <div class="fuente">${esc(p.fuente)}</div>
      </div>
    </article>`).join('') || '<p class="nota">No hay pruebas abiertas ahora.</p>';
}

function pintarLlego(cat) {
  $('#llego-semana').innerHTML = est.llego.length
    ? `<ul class="llegadas">${est.llego.map((l) => `<li><b>${esc(l.que)}</b> llegó a <b>${esc(l.donde)}</b>${l.ciudad ? `, ${esc(l.ciudad)}` : ''}
        <span>${esc(dia(l.fecha))}</span></li>`).join('')}</ul>`
    : '<p class="nota" style="margin-top:12px">Esta semana: <span class="hueco">por contar a qué café llegó cada cosa</span></p>';
  $('#tiendas').innerHTML = cat.tiendas.map((t) => `<div class="tienda letrero">
    <div class="ciudad">${esc(t.ciudad.toUpperCase())}</div>
    <div class="dir">${t.duda ? `Thompson <span class="hueco" title="${esc(t.duda)}">${esc(t.direccion.split(' ').pop())}</span>` : esc(t.direccion)}</div>
    <a class="mapa" href="https://www.google.com/maps/search/${encodeURIComponent(`${t.direccion}, ${t.ciudad}, Chile`)}" target="_blank" rel="noopener">Cómo llegar</a>
  </div>`).join('');
  fetch('/data/mapa.svg').then((r) => r.text()).then((svg) => { $('#mapa').innerHTML = svg; }).catch(() => {});
  // the legend, north to south, the same groups as the map (a place in two cities shows in both)
  const orden = ['Osorno', 'Llanquihue', 'Puerto Varas', 'Nueva Braunau', 'Chonchi', 'Quellón'];
  const grupos = {};
  for (const p of cat.puntos) for (const c of p.ciudad.split(/ y /)) (grupos[c] ||= []).push(p);
  const id = (c) => c.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  $('#puntos').innerHTML = orden.filter((c) => grupos[c]).map((c) => `<li id="en-${id(c)}"><span class="n">${grupos[c].length}</span><div>
    <b>${esc(c.toUpperCase())}</b><span>${grupos[c].map((p) => p.ig
      ? `<a href="https://instagram.com/${esc(p.ig)}" target="_blank" rel="noopener">@${esc(p.ig)}</a>` : esc(p.nombre)).join(' · ')}</span></div></li>`).join('');
}

function abrirReserva(id) {
  abierta = est.pruebas.find((p) => p.id === id);
  if (!abierta) return;
  $('#r-titulo').textContent = abierta.nombre;
  $('#form-reserva').hidden = false;
  $('#r-listo').hidden = true;
  $('#reserva').showModal();
}

$('#form-reserva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const tienda = f.querySelector('[name=tienda]:checked').value;
  const btn = f.querySelector('[type=submit]');
  btn.disabled = true;
  $('#r-error').textContent = '';
  try {
    const r = await fetch('/api/reservar', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prueba: abierta.id, nombre: f.elements.nombre.value, tienda }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || 'No se pudo reservar.');
    $('#r-texto').innerHTML = `Eres la reserva número <b>${j.cuenta}</b> de ${esc(abierta.nombre.toLowerCase())}. `
      + (j.meta ? `Con ${j.meta} la hornean.` : 'Cuando se junten las reservas, la hornean.') + ` La retiras en ${esc(tienda)}.`;
    const msg = `${wa.demo ? `[demo · ${wa.demo}] ` : ''}Hola Campo & Mar 🌿 Reservé ${abierta.nombre} (retiro en ${tienda}). Soy ${f.elements.nombre.value}. Avísenme cuando salga.`;
    $('#r-wa').href = `https://wa.me/${wa.numero}?text=${encodeURIComponent(msg)}`;
    f.hidden = true;
    $('#r-listo').hidden = false;
    await cargar();
  } catch (err) {
    $('#r-error').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener('click', (e) => {
  const r = e.target.closest('[data-reservar]');
  if (r) return abrirReserva(r.dataset.reservar);
  if (e.target.closest('[data-cerrar]')) return $('#reserva').close();
  if (e.target.closest('#barra-pedido')) return abrirHoja();
  if (e.target.closest('[data-cerrar-hoja]') || e.target === $('#hoja')) return $('#hoja').close();
  const q = e.target.closest('[data-quitar]');
  if (q) { pedido.delete(q.dataset.quitar); pintarVitrina(); return pintarPedido(); }
  const mas = e.target.closest('[data-agregar]'), menos = e.target.closest('[data-menos]');
  if (mas || menos) {
    const id = (mas || menos).dataset.agregar || menos.dataset.menos;
    pedido.set(id, Math.max(0, (pedido.get(id) || 0) + (mas ? 1 : -1)));
    pintarVitrina();
    return pintarPedido();
  }
  if (e.target.closest('#huecos')) {
    const on = document.body.classList.toggle('mostrar-huecos');
    $('#huecos').setAttribute('aria-pressed', String(on));
  }
});

async function cargar() {
  est = await fetch('/api/estado').then((r) => r.json());
  pintarSalio();
  pintarPruebas();
  pintarVitrina();
}

$('#form-pedido').addEventListener('input', armarWa);
$('#form-pedido').addEventListener('submit', (e) => e.preventDefault());
$('#form-pedido').elements.dia.min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

$('#fecha').textContent = new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long' });
fetch('/api/config').then((r) => r.json()).then((c) => { if (c.wa) wa = { numero: c.wa, demo: c.demo }; }).catch(() => {});
cargar();
fetch('../data/catalogo.json').then((r) => r.json()).then((c) => {
  cat = c;
  pintarLlego(cat);
  pintarVitrina();
  pintarPedido();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
});
