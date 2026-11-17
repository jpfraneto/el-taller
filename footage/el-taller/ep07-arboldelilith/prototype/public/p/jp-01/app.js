// jp-01 «La próxima luna»: her next circle is the whole home page. Pay there and the place is yours; sign up
// without paying and it's held until paid places fill it.
import { $, esc, api, yo, quieroIr, unaHora, plata, chipsEvento, precioTexto, estadoMio, fechaLarga, fechaCorta, cuando, hoja, toast, nicho, vueltaDePago, entrar } from '/comun/lilith.js';
import { lunaDe, lunaSVG } from '/comun/luna.js';

let eventos = [];

const fechaLocal = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 20); };
const LUNA = { llena: 'Luna llena', nueva: 'Luna nueva', solsticio: 'Solsticio' };

function pintarHero() {
  const ev = eventos[0];
  const hero = $('#hero');
  if (!ev) {
    hero.innerHTML = `<p class="versal">Círculos de mujeres</p><h1>Pronto, una nueva luna</h1>
      <p class="bajada">Todavía no hay fecha para el próximo círculo. Te aviso cuando la haya.</p>`;
    return;
  }
  const l = lunaDe(fechaLocal(ev.fecha));
  const x = Object.values(ev.modalidades);
  const puedePagar = x.some((m) => m.puedePagar);
  const hayLibres = x.some((m) => m.libres > 0);
  hero.innerHTML = `
    <p class="luna">${lunaSVG(l.fraccion, { size: 30, luz: '#E2C4AE', sombra: '#5D4233' })}<span>${esc(LUNA[ev.luna] || l.nombre)} · ${esc(cuando(ev.fecha))}</span></p>
    <p class="versal">${ev.tipo === 'taller' ? 'Taller' : 'Círculo de mujeres'}</p>
    <h1>${esc(ev.nombre)}</h1>
    ${ev.bajada ? `<p class="bajada">${esc(ev.bajada)}</p>` : ''}
    ${chipsEvento(ev)}
    <span class="aporte">${esc(precioTexto(ev))}</span>
    ${ev.mia ? `<p class="mio">${estadoMio(ev.mia)}</p>` : ''}
    <div class="acciones">
      ${ev.mia && ev.mia.estado === 'pagada' ? '<button class="btn suave" id="ver">Ver mi lugar o regalar uno</button>' : `
        ${puedePagar ? '<button class="btn" id="pagar">Pagar y asegurar mi lugar</button>' : ''}
        ${ev.mia ? '' : `<button class="btn suave" id="libre">${hayLibres ? 'Inscribirme sin pagar' : 'Anotarme en la lista de espera'}</button>`}`}
    </div>
    <p class="nota">${puedePagar ? 'Puedes pagar aquí mismo o inscribirte y pagar después.<br>Si se llenan los cupos, las que pagaron tienen prioridad.' : 'Los lugares ya están pagados. Si alguien se baja, te avisamos.'}</p>`;
  hero.querySelectorAll('#pagar,#libre,#ver').forEach((b) => (b.onclick = () => quieroIr(ev, { onCambio: actualizar })));

  const pq = $('#pregunta');
  if (ev.pregunta) {
    pq.hidden = false;
    pq.innerHTML = `<p class="versal">La pregunta de esta luna</p><p class="q">${esc(ev.pregunta)}</p>
      <button id="resp">Respóndele a Pili (solo ella lo lee)</button>`;
    $('#resp').onclick = () => escribir(ev.pregunta);
  }
}

function pintarLista() {
  const rest = eventos.slice(1);
  $('#despues').hidden = !rest.length;
  $('#eventos').innerHTML = rest.map((ev, i) => {
    const d = fechaLocal(ev.fecha);
    return `<button class="ev" data-i="${i + 1}">
      <span class="dia"><b>${d.getDate()}</b><span>${esc(fechaCorta(ev.fecha).split(' de ')[1].slice(0, 3))}</span></span>
      <span class="t"><b>${esc(ev.nombre)}</b><span>${esc(fechaLarga(ev.fecha))} · ${esc(ev.hora)}${ev.lugar ? ' · ' + esc(ev.lugar) : ''}</span><br>
      <span>${esc(precioTexto(ev))}</span>${ev.mia ? '<br>' + estadoMio(ev.mia) : ''}</span>
    </button>`;
  }).join('');
  $('#eventos').querySelectorAll('.ev').forEach((b) => (b.onclick = () => quieroIr(eventos[+b.dataset.i], { onCambio: actualizar })));
}

function actualizar(ev) {
  const i = eventos.findIndex((x) => x.id === ev.id);
  if (i >= 0) eventos[i] = ev;
  pintarHero(); pintarLista(); pintarMis();
}

async function pintarMis() {
  const u = await yo();
  const b = $('#mis');
  b.hidden = false;
  b.textContent = u ? 'Mis lugares' : 'Entrar';
  b.onclick = async () => {
    if (!(await yo())) { const r = await entrar(); r.sheet.close(); await cargar(); return; }
    const { eventos: mias, sesiones } = await api('/api/mias');
    const vacio = !mias.length && !sesiones.length;
    const h = hoja(`<h2>Mis lugares</h2>${mias.map((e) => `<p><b class="serif" style="font-size:21px">${esc(e.nombre)}</b><br>
        <span style="color:var(--corteza)">${esc(fechaLarga(e.fecha))} · ${esc(e.hora)}</span><br>
        ${e.mia ? `${estadoMio(e.mia)} <small style="color:var(--arcilla)">${e.mia.modalidad}</small><br>` : ''}
        ${(e.regalos || []).map((g) => `<small style="color:var(--corteza)">🎁 ${esc(g.nombre)}:</small> ${estadoMio(g, false)}<br>`).join('')}</p>`).join('')}
      ${sesiones.map((s) => `<p><b class="serif" style="font-size:21px">Una hora 1:1${s.para ? ` · regalo para ${esc(s.para)}` : ''}</b><br>
        <span style="color:var(--corteza)">${esc(s.motivo)} · ${s.modalidad} · ${s.estado === 'agendada' ? 'agendada' : 'Pili te escribe para fijar el día'}</span><br>
        <span class="estado ${s.pagada ? 'asegurado' : 'reservado'}">${s.pagada ? 'Pagada' : 'Falta pagar'} · ${plata(s.monto)}</span></p>`).join('')}
      ${vacio ? '<p class="lead">Todavía no tienes lugares. El próximo círculo está arriba.</p>' : ''}
      <button class="btn suave" id="salir" style="margin-top:12px">Salir</button>`);
    $('#salir', h.el).onclick = async () => { await api('/api/auth/salir', { method: 'POST' }); await yo(true); h.close(); cargar(); };
  };
}

function escribir(pregunta, titulo = 'Te leo') {
  const h = hoja(`<h2>${esc(titulo)}</h2><p class="lead"><em>${esc(pregunta)}</em></p>
    <form id="fm"><label class="campo"><span>Escribe lo que quieras. Solo Pili lo lee.</span><textarea name="t" required maxlength="2000"></textarea></label>
    <label class="campo"><span>Tu nombre (si quieres)</span><input name="n" maxlength="60" autocomplete="given-name"></label>
    <button class="btn">Enviar a Pili</button></form>`);
  $('#fm', h.el).onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true;
    try {
      await api('/api/mensajes', { method: 'POST', body: { texto: e.target.t.value, nombre: e.target.n.value, pregunta } });
      h.set('<div style="text-align:center"><img src="/comun/logo.jpg" alt="" width="96" height="96" style="margin:0 auto 10px;border-radius:50%"><h2>Gracias</h2><p class="lead"><em>Te leo.</em> — Pili</p></div>');
    } catch (err) { toast(err.message); b.disabled = false; }
  };
}

async function pintarOfrece() {
  const c = await api('/api/cosa');
  $('#ofrecelist').innerHTML = c.ofrece.filter((o) => !o.destacado).map((o) => `<div class="of"><b>${esc(o.nombre)}</b><p>${esc(o.linea)}</p>
    <div class="fila"><small>${esc(o.precio || '')}</small>${o.accion === 'hora' ? '<button data-hora>Pedir una hora</button>' : `<button data-q="${esc(o.nombre)}">Quiero saber más</button>`}</div></div>`).join('');
  $('#ofrecelist').querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => escribir(`Quiero saber más: ${b.dataset.q}`, b.dataset.q)));
  $('#ofrecelist').querySelectorAll('[data-hora]').forEach((b) => (b.onclick = () => unaHora()));
}

async function cargar() {
  try {
    eventos = (await api('/api/eventos')).eventos;
  } catch (e) { toast(e.message); }
  pintarHero(); pintarLista(); pintarMis();
}

$('#hora').onclick = () => unaHora();
nicho();
vueltaDePago();
cargar();
pintarOfrece();
