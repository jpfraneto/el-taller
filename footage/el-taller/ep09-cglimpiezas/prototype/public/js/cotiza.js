// Cotiza: a photo → /api/mirar reads what it is → the price range from public/js/precios.js → WhatsApp to CG.
import { ITEMS, estimar, clp, deCG } from './precios.js';

const $ = (s) => document.querySelector(s);
// Where "WhatsApp" goes (/api/config: El Taller's number while it's a demo, CG's once they approve).
let WA = '56948455809', DEMO = 'CG Limpiezas';
fetch('/api/config').then((r) => r.json()).then((c) => { WA = c.wa || WA; DEMO = c.demo; }).catch(() => {});
let lectura = null;
let casosCG = [];  // CG's public jobs with what CG charged (/tus-casos/)

// "Lo que hemos limpiado": every public job, its photo and what CG charged (or a gap until CG writes it).
const esc = (s) => String(s).replace(/[<&"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
function tamano(tipo, cantidad) {
  const it = ITEMS[tipo];
  if (!it || !cantidad) return '';
  if (tipo === 'colchon') return cantidad === 'king' ? 'King' : `${cantidad} plaza${cantidad === '1' ? '' : 's'}`;
  if (it.unidad === 'pieza') return Number(cantidad) === 1 ? '' : `${cantidad} piezas`;
  return `${cantidad} ${it.unidad}`;
}
async function trabajos() {
  const [base, pub] = await Promise.all([
    fetch('../data/casos.json').then((r) => r.json()),
    fetch('/api/casos').then((r) => r.json()).catch(() => ({ casos: [], ocultos: [] })),
  ]);
  casosCG = pub.casos || [];
  const de = Object.fromEntries(casosCG.map((c) => [c.id, c]));
  const fuera = new Set(pub.ocultos || []);
  $('#trabajos').innerHTML = base.casos.filter((c) => !fuera.has(c.id)).map((b) => {
    const c = { ...b, ...(de[b.id] || {}) };
    const que = [(ITEMS[c.tipo]?.nombre || 'Trabajo').split(' / ')[0], tamano(c.tipo, c.cantidad)].filter(Boolean).join(' · ');
    return `<li><a href="${esc(c.permalink)}" target="_blank" rel="noopener"><img src="../${esc(c.img)}" alt="" loading="lazy"></a>
      <div><div class="que">${esc(que)}</div><div class="cuando">${esc(c.fecha.slice(0, 7))}</div></div>
      <div class="cuanto">${c.precio ? clp(c.precio) : '<span class="hueco">$ por anotar</span>'}</div></li>`;
  }).join('');
}
trabajos();

for (const [k, it] of Object.entries(ITEMS)) $('#tipo').add(new Option(it.nombre, k));

// Phone photos are big: resize before sending (1280 px to read it, 640 px to keep it with the quote).
let fotoChica = '';
function achicar(file, lado = 1280) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => mal(new Error('No pude abrir esa foto.'));
    img.src = URL.createObjectURL(file);
  });
}

function cantidadPara(tipo, m) {
  const it = ITEMS[tipo];
  if (tipo === 'alfombra_muro' || tipo === 'alfombra_deco') return m?.m2 || it.pordefecto;
  if (tipo === 'colchon') return m?.plazas || it.pordefecto;
  return m?.cantidad || it.pordefecto;
}

function etiquetas(tipo) {
  const it = ITEMS[tipo];
  $('#lbl-plazas').hidden = tipo !== 'colchon';
  $('#lbl-cantidad').hidden = tipo === 'colchon';
  $('#txt-cantidad').textContent = it.unidad === 'm²' ? 'Metros cuadrados (aprox.)' : it.unidad === 'cuerpos' ? 'Cuerpos (1 a 3)' : 'Cuántas';
  if (it.rango) { $('#cantidad').min = it.rango[0]; $('#cantidad').max = it.rango[1]; }
}

function calcular() {
  const tipo = $('#tipo').value;
  const it = ITEMS[tipo];
  const cant = tipo === 'colchon' ? $('#plazas').value : Number($('#cantidad').value);
  const e = estimar(tipo, cant, { orina: $('#orina').checked });
  const cg = deCG(casosCG, tipo, cant);
  const rango = (x) => (x.min === x.max ? clp(x.min) : `${clp(x.min)} <small>a</small> ${clp(x.max)}`);
  const base = it.n === 1 ? 'solo 1 empresa publica este precio' : `${it.n} empresas publican este precio`;
  if (cg) {
    $('#precio').innerHTML = rango(cg);
    $('#nota-precio').textContent = `Según ${cg.n === 1 ? 'un trabajo parecido' : cg.n + ' trabajos parecidos'} nuestros (abajo).`;
  } else {
    $('#precio').innerHTML = e.desde ? `desde ${clp(e.min)}` : rango(e);
    $('#nota-precio').textContent = `Referencia del mercado en Santiago (${base}).`;
  }
  const nombre = it.nombre.split(' / ')[0];
  const que = tipo === 'colchon' ? `${nombre} de ${$('#plazas').selectedOptions[0].text}`
    : it.unidad === 'pieza' ? (cant > 1 ? `${nombre} (${cant})` : nombre) : `${nombre}, ${cant} ${it.unidad}`;
  const r = cg || e;
  actual = { tipo, que: que + ($('#orina').checked ? ', con pipí de mascota' : ''), veo: lectura?.veo || '',
    min: r.min, max: r.max, fuente: cg ? 'cg' : 'mercado' };
}

// "Agendar por WhatsApp": the quote is saved with its own link (/c/?id=…), and that link is what the client sends.
// CG opens it from the chat, sets the price, and the client pays there.
let actual = null;
async function agendar(ev) {
  ev.preventDefault();
  const b = $('#wa');
  b.setAttribute('aria-busy', 'true');
  try {
    const r = await fetch('/api/cotizaciones', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...actual, foto: fotoChica }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'No se pudo guardar.');
    const link = `${location.origin}/c/?id=${d.id}`;
    const texto = (DEMO ? `[demo · ${DEMO}] ` : '') + `Hola 👋 vengo por esta cotización: ${link}`;
    location.href = `https://wa.me/${WA}?text=${encodeURIComponent(texto)}`;
  } catch (e) {
    $('#error').textContent = e.message; $('#error').hidden = false;
  } finally {
    b.removeAttribute('aria-busy');
  }
}
$('#wa').addEventListener('click', agendar);

async function mirar(file) {
  $('#resultado').hidden = false;
  $('#lectura').hidden = true; $('#error').hidden = true; $('#mirando').hidden = false;
  $('#preview').src = URL.createObjectURL(file);
  $('#paso-foto').hidden = true;
  try {
    const [image, chica] = await Promise.all([achicar(file), achicar(file, 640)]);
    fotoChica = chica;
    const r = await fetch('/api/mirar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Algo falló. Prueba de nuevo.');
    lectura = d.mirada;
    if (!lectura.es_limpiable || lectura.tipo === 'otro') {
      $('#veo').textContent = lectura.veo || 'No vi algo que limpiemos en esta foto.';
      $('#veo').insertAdjacentHTML('beforeend', ' Dinos qué es en "¿No calza? Ajusta".');
      lectura.tipo = 'sillon';
    } else {
      $('#veo').textContent = lectura.veo;
    }
    $('#tipo').value = lectura.tipo;
    etiquetas(lectura.tipo);
    const c = cantidadPara(lectura.tipo, lectura);
    if (lectura.tipo === 'colchon') $('#plazas').value = c; else $('#cantidad').value = c;
    $('#orina').checked = Boolean(lectura.mascotas);
    calcular();
    $('#lectura').hidden = false;
  } catch (e) {
    $('#error').textContent = e.message;
    $('#error').hidden = false;
    $('#paso-foto').hidden = false;
  } finally {
    $('#mirando').hidden = true;
  }
}

$('#foto').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) mirar(f); e.target.value = ''; });
$('#tipo').addEventListener('change', () => {
  const t = $('#tipo').value;
  etiquetas(t);
  const c = cantidadPara(t, lectura?.tipo === t ? lectura : null);
  if (t === 'colchon') $('#plazas').value = c; else $('#cantidad').value = c;
  calcular();
});
for (const id of ['#cantidad', '#plazas', '#orina']) $(id).addEventListener('input', calcular);
$('#otra').addEventListener('click', () => { $('#resultado').hidden = true; $('#paso-foto').hidden = false; lectura = null; });
