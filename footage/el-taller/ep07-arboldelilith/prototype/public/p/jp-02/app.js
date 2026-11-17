// jp-02 «Te leo»: her posts end with a question and "te leo". Here the question is the home page: answer it
// privately, and then (only then) the circle. Same login, same data, same "Quiero ir" as jp-01 (inherited).
import { $, esc, api, quieroIr, unaHora, chipsEvento, precioTexto, estadoMio, fechaLarga, hoja, toast, nicho, vueltaDePago } from '/comun/lilith.js';
import { lunaDe, lunaSVG, proximasFases } from '/comun/luna.js';

// When no circle has a question yet: hers, from her posts (2026-06).
const PREGUNTA_SUYA = '¿Qué necesita más descanso en ti hoy?';
let eventos = [];

const fechaLocal = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 20); };
const isoDe = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function pintarLuna() {
  const l = lunaDe(new Date());
  $('#luna').innerHTML = lunaSVG(l.fraccion, { size: 112, luz: '#F6EDE2', sombra: '#3a2f25' });
  $('#fase').textContent = `${l.nombre} · ${l.arquetipo}`;
  const q = (eventos.find((e) => e.pregunta) || {}).pregunta || PREGUNTA_SUYA;
  $('#q').textContent = q;
  $('#responder').onclick = () => responder(q);
}

function responder(pregunta) {
  const h = hoja(`<p class="versal">Te leo</p><h2><em>${esc(pregunta)}</em></h2>
    <form id="fm"><label class="campo"><span>Escribe lo que quieras. Solo Pili lo lee.</span><textarea name="t" required maxlength="2000"></textarea></label>
    <label class="campo"><span>Tu nombre (si quieres)</span><input name="n" maxlength="60" autocomplete="given-name"></label>
    <button class="btn">Enviar a Pili</button></form>`);
  $('#fm', h.el).onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true;
    try {
      await api('/api/mensajes', { method: 'POST', body: { texto: e.target.t.value, nombre: e.target.n.value, pregunta } });
      const ev = eventos[0];
      h.set(`<div class="gracias"><img src="/comun/logo.jpg" alt="" width="92" height="92"><h2>Gracias</h2><p class="lead"><em>Te leo.</em> — Pili</p></div>
        ${ev ? `<div style="margin-top:8px;padding:16px;border-radius:18px;background:var(--pergamino)">
          <p class="versal" style="margin:0 0 4px">Si quieres vivirlo acompañada</p>
          <p style="font:500 24px/1.15 var(--serif);margin:0 0 4px">${esc(ev.nombre)}</p>
          <p style="margin:0 0 12px;color:var(--corteza)">${esc(fechaLarga(ev.fecha))} · ${esc(ev.hora)}${ev.lugar ? ' · ' + esc(ev.lugar) : ''}</p>
          <button class="btn" id="ir">Quiero ir</button></div>` : ''}`);
      const ir = $('#ir', h.el);
      if (ir) ir.onclick = () => { h.close(); setTimeout(() => quieroIr(ev, { onCambio: actualizar }), 330); };
    } catch (err) { toast(err.message); b.disabled = false; }
  };
}

/** The next moons (computed), each with the circle on that date, if there is one. Events off the moon go in too. */
function pintarFases() {
  const fases = proximasFases(new Date(), 6).map((f) => ({ ...f, iso: isoDe(f.fecha) }));
  const usados = new Set();
  const filas = fases.map((f) => {
    const ev = eventos.find((e) => Math.abs(fechaLocal(e.fecha) - fechaLocal(f.iso)) <= 1.5 * 86400000);
    if (ev) usados.add(ev.id);
    return { iso: f.iso, tipo: f.tipo, ev };
  });
  eventos.filter((e) => !usados.has(e.id)).forEach((ev) => filas.push({ iso: ev.fecha, tipo: null, ev }));
  filas.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  $('#fases').innerHTML = filas.map((f) => {
    const l = lunaDe(fechaLocal(f.iso));
    const nombre = f.tipo === 'llena' ? 'Luna llena' : f.tipo === 'nueva' ? 'Luna nueva' : l.nombre;
    const i = f.ev ? eventos.indexOf(f.ev) : -1;
    return `<div class="fase-row">
      <div class="m">${lunaSVG(l.fraccion, { size: 40, luz: '#E2C4AE', sombra: '#5D4233' })}<small>${esc(f.iso.slice(8))}/${esc(f.iso.slice(5, 7))}</small></div>
      <div class="t"><b>${esc(nombre)}</b><span>${esc(fechaLarga(f.iso))}</span>
      ${f.ev ? `<div class="card"><p class="versal" style="margin:0">${f.ev.tipo === 'taller' ? 'Taller' : 'Círculo de mujeres'}</p>
          <b>${esc(f.ev.nombre)}</b>${f.ev.bajada ? `<span><em>${esc(f.ev.bajada)}</em></span>` : ''}
          ${chipsEvento(f.ev)}<p style="margin:0 0 10px;color:var(--corteza);font-size:14px">${esc(precioTexto(f.ev))}</p>
          ${f.ev.mia ? `<p>${estadoMio(f.ev.mia)}</p>` : ''}
          <button class="btn" data-i="${i}">${f.ev.mia ? 'Ver mi lugar' : 'Quiero ir'}</button></div>`
        : '<p class="sinev">Sin círculo esta vez. Puedes escribirle igual.</p>'}</div></div>`;
  }).join('');
  $('#fases').querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => quieroIr(eventos[+b.dataset.i], { onCambio: actualizar })));
}

function actualizar(ev) {
  const i = eventos.findIndex((x) => x.id === ev.id);
  if (i >= 0) eventos[i] = ev;
  pintarFases();
}

async function cargar() {
  try { eventos = (await api('/api/eventos')).eventos; } catch (e) { toast(e.message); }
  pintarLuna(); pintarFases();
}

$('#hora').onclick = () => unaHora();
nicho();
vueltaDePago();
pintarLuna();
cargar();
