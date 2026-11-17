// /pide/: the café door (wholesale), over the same catalog (data/catalogo.json). The order for a person lives in /hoy#encarga.
// It ends as a written WhatsApp message (demo: El Taller's number, see wrangler.jsonc).
// Old links to "para ti" (/pide without ?para=cafe, with a hash) go to the order in /hoy.
if (location.hash && new URLSearchParams(location.search).get('para') !== 'cafe') location.replace('/hoy/#encarga');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[<&"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));

let cat = { productos: [], tiendas: [], puntos: [] };
let wa = { numero: '56948455809', demo: 'Campo & Mar' };
const carrito = { cafe: new Map() };

function chip(valor, si, no) {
  if (valor === true) return `<span class="chip">${si}</span>`;
  if (valor === false) return `<span class="chip no">${no}</span>`;
  return `<span class="chip nose" title="No está público todavía">${si} ?</span>`;
}

function tarjeta(p, puerta) {
  const foto = p.foto
    ? `<img class="foto" src="../${p.foto}" alt="${esc(p.nombre)}" loading="lazy">`
    : `<div class="sinfoto ${p.tipo}">${esc(p.nombre)}</div>`;
  const endulzado = p.endulzado
    ? `<span class="chip">endulzado: ${esc(p.endulzado)}</span>`
    : '<span class="chip nose" title="No está público todavía">¿con qué se endulza?</span>';
  const n = carrito[puerta].get(p.id) || 0;
  return `<article class="prod">
    ${foto}
    <div>
      <div class="n">${esc(p.nombre)}</div>
      <div class="lleva">${p.lleva.map(esc).join(' · ')}</div>
      <div class="chips">
        ${chip(p.sin_gluten, 'sin gluten', 'con gluten')}
        ${chip(p.vegano, 'vegano', 'no vegano')}
        ${p.aplv ? '<span class="chip">APLV</span>' : ''}
        ${endulzado}
        ${p.prueba ? '<span class="chip prueba">en prueba</span>' : ''}
      </div>
      ${p.nota ? `<p class="nota">${esc(p.nota)}</p>` : ''}
      <div class="pie">
        <span class="precio"><span class="hueco">${puerta === 'cafe' ? '$ mayorista' : '$ precio'}</span></span>
        <button type="button" class="mas${n ? ' puesto' : ''}" data-agregar="${p.id}" data-puerta="${puerta}">${n ? `✓ ${n}` : '+ Agregar'}</button>
      </div>
      <div class="fuente">fuente: ${esc(p.fuente)}</div>
    </div>
  </article>`;
}

function pintarProductos() {
  $('#prod-cafe').innerHTML = cat.productos.filter((p) => !p.prueba).map((p) => tarjeta(p, 'cafe')).join('');
}

function pintarCarrito(puerta) {
  const items = [...carrito[puerta]].filter(([, n]) => n > 0);
  const ul = $(`#carrito-${puerta}`);
  ul.innerHTML = items.length
    ? items.map(([id, n]) => {
      const p = cat.productos.find((x) => x.id === id);
      return `<li><span>${esc(p.nombre)}${puerta === 'cafe' ? ' <small style="color:var(--mute)">por semana</small>' : ''}</span>
        <span class="cant"><button type="button" data-menos="${id}" data-puerta="${puerta}" aria-label="Uno menos">−</button>
        <span>${n}</span><button type="button" data-agregar="${id}" data-puerta="${puerta}" aria-label="Uno más">+</button></span></li>`;
    }).join('')
    : `<li class="vacio">${puerta === 'cafe' ? 'Marca arriba lo que te interesa.' : 'Agrega arriba lo que quieres.'}</li>`;
  armarWa(puerta);
}

function fecha(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function armarWa(puerta) {
  const f = $(`#form-${puerta}`);
  const items = [...carrito[puerta]].filter(([, n]) => n > 0)
    .map(([id, n]) => `• ${n} × ${cat.productos.find((x) => x.id === id).nombre}`);
  const v = (k) => (f.elements[k]?.value || '').trim();
  const ciudad = v('ciudad') === 'otra' ? v('otra') : v('ciudad');
  const listo = items.length && v('local') && ciudad && v('nombre');
  const texto = ['Hola Campo & Mar 🌿 Tengo un café y quiero ser punto de venta.', `Local: ${v('local')} (${ciudad})`,
    `Soy ${v('nombre')}.`, '', 'Me interesa, por semana:', ...items, '', '¿Me mandan los precios mayoristas, el mínimo y los días de despacho?'];
  const msg = (wa.demo ? `[demo · ${wa.demo}] ` : '') + texto.join('\n');
  const a = $(`#wa-${puerta}`);
  a.href = `https://wa.me/${wa.numero}?text=${encodeURIComponent(msg)}`;
  a.setAttribute('aria-disabled', String(!listo));
}

document.addEventListener('click', (e) => {
  const mas = e.target.closest('[data-agregar]');
  const menos = e.target.closest('[data-menos]');
  if (mas || menos) {
    const b = mas || menos, c = carrito[b.dataset.puerta], id = b.dataset.agregar || b.dataset.menos;
    c.set(id, Math.max(0, (c.get(id) || 0) + (mas ? 1 : -1)));
    pintarProductos();
    return pintarCarrito(b.dataset.puerta);
  }
  if (e.target.closest('#huecos')) {
    const on = document.body.classList.toggle('mostrar-huecos');
    $('#huecos').setAttribute('aria-pressed', String(on));
  }
});
$('#form-cafe').addEventListener('input', () => {
  $('#otra-ciudad').hidden = $('#form-cafe').elements.ciudad.value !== 'otra';
  armarWa('cafe');
});
$('#form-cafe').addEventListener('submit', (e) => e.preventDefault());

Promise.all([
  fetch('../data/catalogo.json').then((r) => r.json()),
  fetch('/api/config').then((r) => r.json()).catch(() => null),
]).then(([c, conf]) => {
  cat = c;
  if (conf?.wa) wa = { numero: conf.wa, demo: conf.demo };
  $('#puntos-cafe').innerHTML = cat.puntos.map((p) => p.ig
    ? `<a class="punto" href="https://instagram.com/${p.ig}" target="_blank" rel="noopener"><b>@${esc(p.ig)}</b><span>${esc(p.ciudad)}</span></a>`
    : `<div class="punto"><b>${esc(p.nombre)}</b><span>${esc(p.ciudad)}</span></div>`).join('');
  pintarProductos();
  pintarCarrito('cafe');
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
});
