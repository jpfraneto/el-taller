// One quote (/c/?id=…): the client sees the photo, what we saw and the price, and pays when CG confirms.
// CG's phone has its key (saved when it opened /tus-casos/ or a link with ?k=): then it also sees "Para CG".
import { clp } from './precios.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const id = (q.get('id') || '').toUpperCase();
if (q.get('k')) {
  try { localStorage.setItem('cg-clave', q.get('k')); } catch {}
  q.delete('k'); history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
}
let clave = '';
try { clave = localStorage.getItem('cg-clave') || ''; } catch {}
let cot = null;

const ESTADO = { nueva: 'Esperando que CG confirme', confirmada: 'Precio confirmado', pagada: 'Pagado ✓' };

function pintar() {
  const c = cot;
  $('#cot').hidden = false;
  $('#foto').src = c.foto;
  $('#estado').className = `estado ${c.estado}`;
  $('#estado').textContent = ESTADO[c.estado] || c.estado;
  $('#que').textContent = c.que || 'Limpieza';
  $('#veo').textContent = c.veo ? `“${c.veo}”` : '';
  if (c.precio) {
    $('#precio').textContent = clp(c.precio);
    $('#nota').textContent = c.nota || '';
  } else {
    const r = c.min && c.max ? (c.min === c.max ? clp(c.min) : `${clp(c.min)} a ${clp(c.max)}`) : '';
    $('#precio').innerHTML = r ? `<small>referencia</small> ${r}` : '';
    $('#nota').textContent = 'CG revisa la foto y te confirma el precio por WhatsApp. Cuando lo confirme, aquí mismo puedes pagar.';
  }
  if (c.estado === 'pagada') $('#nota').textContent = 'Listo. CG te escribe para agendar el día.';
  $('#pagar').hidden = c.estado !== 'confirmada';
  $('#pagar').textContent = `Pagar ${clp(c.precio || 0)} con Mercado Pago`;
  $('#prueba').hidden = true;
  if (clave) {
    $('#cg').hidden = c.estado === 'pagada';
    if (!$('#monto').value) $('#monto').value = (c.precio || c.min || '') ? Number(c.precio || c.min).toLocaleString('es-CL') : '';
    if (!$('#nota-cg').value) $('#nota-cg').value = c.nota || '';
    $('#copiar').hidden = c.estado !== 'confirmada';
  }
}

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(clave ? { 'x-clave': clave } : {}), ...(opts.headers || {}) } });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Algo falló. Prueba de nuevo.');
  return d;
}

function error(e) { $('#error').textContent = e.message; $('#error').hidden = false; }

async function cargar() {
  if (!id) throw new Error('Falta el código de la cotización.');
  const d = await api(`/api/cotizaciones/${id}`);
  cot = d.cotizacion;
  pintar();
  const h = new URLSearchParams(location.hash.slice(1)).get('pago');
  if (h && cot.estado !== 'pagada') $('#nota').textContent = h === 'pendiente' ? 'Tu pago está en proceso. Te avisamos cuando se acredite.' : 'El pago no se completó. Puedes intentarlo de nuevo.';
}

$('#monto').addEventListener('input', (e) => { const n = e.target.value.replace(/\D/g, ''); e.target.value = n ? Number(n).toLocaleString('es-CL') : ''; });

$('#confirmar').addEventListener('click', async () => {
  try {
    const d = await api(`/api/cotizaciones/${id}`, { method: 'POST', body: JSON.stringify({ precio: $('#monto').value, nota: $('#nota-cg').value }) });
    cot = d.cotizacion; pintar();
    $('#cg-msg').textContent = 'Confirmado. Ahora mándale la respuesta por WhatsApp: el cliente paga desde este mismo link.';
  } catch (e) { error(e); }
});

$('#copiar').addEventListener('click', async () => {
  const t = `Listo 🙌 Son ${clp(cot.precio)}${cot.nota ? ` (${cot.nota})` : ''}. Puedes pagar aquí y agendamos: ${location.origin}/c/?id=${id}`;
  try { await navigator.clipboard.writeText(t); $('#cg-msg').textContent = 'Copiado. Pégalo en el chat del cliente.'; }
  catch { $('#cg-msg').textContent = t; }
});

$('#pagar').addEventListener('click', async () => {
  try {
    const d = await api(`/api/cotizaciones/${id}/pagar`, { method: 'POST' });
    if (d.tipo === 'mercadopago') location.href = d.url;
    else { $('#prueba').hidden = false; $('#pagar').hidden = true; }
  } catch (e) { error(e); }
});

$('#simular').addEventListener('click', async () => {
  try { const d = await api(`/api/cotizaciones/${id}/pago-prueba`, { method: 'POST' }); cot = d.cotizacion; pintar(); }
  catch (e) { error(e); }
});

cargar().catch(error);
