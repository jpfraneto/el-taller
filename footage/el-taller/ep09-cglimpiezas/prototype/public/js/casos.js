// Tus casos (private, /tus-casos/?k=…): CG puts a price on each public job. Base list: data/casos.json (their posts,
// with the AI's guess of type and size); what CG saved: /api/casos/todo.
import { ITEMS, clp } from './precios.js';

const $ = (s) => document.querySelector(s);
const k = new URLSearchParams(location.search).get('k') || '';
try { if (k) localStorage.setItem('cg-clave', k); } catch {}  // this phone is CG's: /c/ links show "Para CG"
const esc = (s) => String(s).replace(/[<&"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
const peso = (n) => (n ? Number(n).toLocaleString('es-CL') : '');

function unidad(tipo) {
  const it = ITEMS[tipo];
  return !it ? 'cantidad' : it.unidad === 'm²' ? 'm² (aprox.)' : it.unidad === 'plazas' ? 'plazas' : it.unidad;
}

function tarjeta(c) {
  const opts = Object.entries(ITEMS).map(([v, it]) => `<option value="${v}"${v === c.tipo ? ' selected' : ''}>${esc(it.nombre)}</option>`).join('');
  const el = document.createElement('section');
  el.className = 'tarjeta caso';
  el.dataset.id = c.id;
  el.innerHTML = `
    <a href="${esc(c.permalink)}" target="_blank" rel="noopener"><img src="../${esc(c.img)}" alt=""></a>
    <div><div class="f">${esc(c.fecha)}</div><div class="t">${esc(c.texto)}</div></div>
    <div class="campos">
      <label>Qué es<select data-c="tipo">${opts}<option value="otro"${c.tipo === 'otro' ? ' selected' : ''}>Otro</option></select></label>
      <label><span data-u>${unidad(c.tipo)}</span><input type="text" inputmode="decimal" data-c="cantidad" value="${esc(c.cantidad ?? '')}"></label>
    </div>
    <label class="precio-in"><span class="f">Cuánto cobraron (total, en pesos)</span>
      <input inputmode="numeric" data-c="precio" placeholder="$" value="${peso(c.precio)}"></label>
    <label class="mostrar"><input type="checkbox" data-c="mostrar"${c.mostrar === false ? '' : ' checked'}> Usar este precio en el cotizador</label>`;
  el.querySelector('[data-c=tipo]').addEventListener('change', (e) => { el.querySelector('[data-u]').textContent = unidad(e.target.value); });
  el.querySelector('[data-c=precio]').addEventListener('input', (e) => {
    const n = e.target.value.replace(/\D/g, '');
    e.target.value = peso(n);
    contar();
  });
  return el;
}

function leer() {
  return [...document.querySelectorAll('.caso')].map((el) => ({
    id: el.dataset.id,
    tipo: el.querySelector('[data-c=tipo]').value,
    cantidad: el.querySelector('[data-c=cantidad]').value.replace(',', '.'),
    precio: el.querySelector('[data-c=precio]').value.replace(/\D/g, ''),
    mostrar: el.querySelector('[data-c=mostrar]').checked,
  }));
}

function contar() {
  const l = leer();
  const n = l.filter((c) => c.precio).length;
  $('#progreso').textContent = `${n} de ${l.length} con precio`;
}

const ESTADO = { nueva: 'por confirmar', confirmada: 'confirmada', pagada: 'pagada ✓' };
async function recientes() {
  const r = await fetch('/api/cotizaciones', { headers: { 'x-clave': k } });
  if (!r.ok) return;
  const { cotizaciones: cs } = await r.json();
  if (!cs.length) return;
  $('#cotizaciones').hidden = false;
  $('#lista-cot').innerHTML = cs.map((c) => `<li><a href="../c/?id=${c.id}"><img src="${c.foto}" alt="" loading="lazy"></a>
    <div><div class="que"><a href="../c/?id=${c.id}">${esc(c.que || 'Cotización')}</a></div>
    <div class="cuando">${new Date(c.ts).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${ESTADO[c.estado] || c.estado}</div></div>
    <div class="cuanto">${c.precio ? clp(c.precio) : '<span class="hueco">$ ?</span>'}</div></li>`).join('');
}

async function main() {
  recientes();
  const [base, guardado] = await Promise.all([
    fetch('../data/casos.json').then((r) => r.json()),
    fetch('/api/casos/todo', { headers: { 'x-clave': k } }).then(async (r) => {
      if (r.status === 401) throw new Error('Este link no es válido. Pídele a JP el tuyo.');
      return r.json();
    }),
  ]);
  const ya = Object.fromEntries((guardado.casos || []).map((c) => [c.id, c]));
  $('#lista').replaceChildren(...base.casos.map((c) => tarjeta({ ...c, ...(ya[c.id] || {}) })));
  contar();
}

$('#guardar').addEventListener('click', async () => {
  const b = $('#guardar');
  b.disabled = true; b.textContent = 'Guardando…';
  try {
    const r = await fetch('/api/casos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-clave': k }, body: JSON.stringify({ casos: leer() }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'No se pudo guardar.');
    b.textContent = `Guardado ✓ (${d.con_precio} con precio)`;
  } catch (e) {
    b.textContent = 'Guardar'; $('#error').textContent = e.message; $('#error').hidden = false;
  } finally {
    setTimeout(() => { b.disabled = false; b.textContent = 'Guardar'; }, 2200);
  }
});

main().catch((e) => { $('#error').textContent = e.message; $('#error').hidden = false; $('#guardar').hidden = true; });
