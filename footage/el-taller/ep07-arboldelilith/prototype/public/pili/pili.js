// Pili's console: the niche's, not a product's. Who's coming (and who paid), what people wrote her,
// a new circle, and her tree of products (she picks which one lives at her domain).
import { $, esc, api, toast, plata, fechaLarga, fechaCorta } from '/comun/lilith.js';
import { proximasFases } from '/comun/luna.js';

let datos = null;
let tab = 'vienen';
let editando = null;
const LUGARES = ['Club Lunera, Puerto Varas', 'Anahata Lodge, Puerto Varas', 'Jacarandá Bienestar', 'Casa Kairos, Línea Nueva', 'Línea Nueva, Llanquihue'];
const isoDe = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

async function cargar() {
  try {
    datos = await api('/api/pili/resumen');
  } catch (e) {
    $('#main').innerHTML = `<p class="vacio">Este espacio es de Pili.<br>Entra con el link que te mandó JP por WhatsApp.</p>`;
    $('#sub').textContent = e.status === 403 ? 'Con esta cuenta no puedes entrar aquí.' : 'Sin entrar';
    return;
  }
  $('#tabs').hidden = false;
  $('#nl').textContent = datos.sinLeer || '';
  pintar();
}

function pintar() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  ({ vienen, leen, nuevo, productos })[tab]();
}

// ---------- Quién viene ----------
const LUGAR = { asegurado: 'Lugar asegurado', reservado: 'Reservado, sin pagar', espera: 'En espera' };
function horas() {
  const ss = (datos.sesiones || []).filter((s) => s.estado !== 'cancelada');
  if (!ss.length) return '';
  const EST = { pedida: 'Por agendar', agendada: 'Agendada', hecha: 'Hecha' };
  return `<article class="evento"><p class="versal">Horas 1:1 · $40.000</p><h2>${ss.filter((s) => s.estado === 'pedida').length} por agendar</h2>
    ${ss.map((s) => {
      const tel = s.paraTelefono || s.pideTelefono;
      const txt = `Hola${s.para ? ' ' + s.para : ''} 🌿 Soy Pili. ${s.para ? `${s.pide} te regaló una hora conmigo. ` : 'Recibí tu pedido de una hora 1:1. '}¿Qué día te acomoda? ${s.preferencia ? `(Me dijiste: ${s.preferencia})` : ''}`;
      return `<div class="persona ancha"><div class="n"><b>${esc(s.para || s.pide)}</b><small>${s.para ? `🎁 regalo de ${esc(s.pide)} · ` : ''}${esc(s.motivo)} · ${s.modalidad}${s.preferencia ? ` · «${esc(s.preferencia)}»` : ''}</small></div>
        <span class="estado ${s.pagada ? 'asegurado' : 'reservado'}">${s.pagada ? 'Pagó' : 'Falta pago'}</span>
        <div class="acc">
          ${tel ? `<a class="mini" target="_blank" rel="noopener" href="https://wa.me/${esc(tel)}?text=${encodeURIComponent(txt)}">Escribirle</a>` : ''}
          ${s.pagada ? '' : `<button class="mini ok" data-s="${s.id}" data-pagada="1">Pagó por transferencia</button>`}
          ${s.estado === 'pedida' ? `<button class="mini" data-s="${s.id}" data-estado="agendada">Ya la agendamos</button>` : s.estado === 'agendada' ? `<button class="mini" data-s="${s.id}" data-estado="hecha">Hecha</button>` : `<small>${EST[s.estado] || ''}</small>`}
        </div></div>`;
    }).join('')}</article>`;
}

function vienen() {
  if (!datos.eventos.length && !(datos.sesiones || []).length) { $('#main').innerHTML = '<p class="vacio">No hay círculos por venir.<br>Crea uno en «Nuevo».</p>'; return; }
  $('#main').innerHTML = horas() + datos.eventos.map((ev, i) => {
    const cuentas = Object.entries(ev.modalidades).map(([m, x]) => `<div><b>${x.pagadas + x.reservadas - x.espera}/${x.cupos}</b>${m}: ${x.pagadas} pagadas · ${x.reservadas} sin pagar${x.espera ? ` · ${x.espera} en espera` : ''}</div>`).join('');
    const personas = ev.personas.length ? ev.personas.map((p) => `<div class="persona">
        <div class="n"><b>${esc(p.nombre)}</b><small>${p.regaloDe ? `🎁 regalo de ${esc(p.regaloDe)} · ` : ''}${p.modalidad} · ${LUGAR[p.lugar] || ''}${p.estado === 'pagada' ? ` · ${plata(p.monto)} ${p.metodo === 'transferencia' ? 'transferencia' : p.metodo === 'demo' ? '(pago de prueba)' : 'Mercado Pago'}` : ''}</small></div>
        <span class="estado ${p.lugar}">${p.estado === 'pagada' ? 'Pagó' : p.lugar === 'espera' ? 'Espera' : 'Falta pago'}</span>
        <div class="acc">
          ${p.estado === 'reservada' ? `<button class="mini ok" data-a="pagada" data-id="${p.id}">Pagó por transferencia</button>` : ''}
          ${p.estado === 'pagada' && p.metodo === 'transferencia' ? `<button class="mini" data-a="reservada" data-id="${p.id}">Deshacer</button>` : ''}
          ${p.telefono ? `<a class="mini" href="https://wa.me/${esc(p.telefono)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        </div></div>`).join('') : '<p class="vacio" style="padding:14px">Nadie todavía.</p>';
    return `<article class="evento">
      <p class="versal">${ev.tipo === 'taller' ? 'Taller' : 'Círculo'} · ${esc(fechaLarga(ev.fecha))} · ${esc(ev.hora)}</p>
      <h2>${esc(ev.nombre)}</h2>
      <p class="meta">${esc(ev.lugar || '')} · aporte hoy ${plata(ev.precio.monto)} · recaudado ${plata(ev.recaudado)}${ev.estado === 'cerrado' ? ' · <b>cerrado</b>' : ''}</p>
      <div class="cuenta">${cuentas}</div>
      ${personas}
      <div class="fila-btn">
        <button class="btn suave" data-copiar="${i}">Copiar recordatorio</button>
        <button class="btn suave" data-editar="${i}">Editar</button>
      </div></article>`;
  }).join('');
  $('#main').querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api(`/api/pili/inscripciones/${b.dataset.id}`, { method: 'POST', body: { estado: b.dataset.a } }); toast(b.dataset.a === 'pagada' ? 'Marcado como pagado' : 'Listo'); await cargar(); }
    catch (e) { toast(e.message); b.disabled = false; }
  }));
  $('#main').querySelectorAll('[data-s]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const body = b.dataset.pagada ? { pagada: true } : { estado: b.dataset.estado };
    try { await api(`/api/pili/sesiones/${b.dataset.s}`, { method: 'POST', body }); toast('Listo'); await cargar(); }
    catch (e) { toast(e.message); b.disabled = false; }
  }));
  $('#main').querySelectorAll('[data-copiar]').forEach((b) => (b.onclick = async () => {
    const ev = datos.eventos[+b.dataset.copiar];
    const txt = `Hola 🌿 Te recuerdo el ${ev.nombre}: ${fechaLarga(ev.fecha)}, ${ev.hora}${ev.lugar ? `, en ${ev.lugar}` : ''}. Si todavía no pagas tu aporte (${plata(ev.precio.monto)}), puedes hacerlo aquí: ${location.origin}/ · Las que pagan tienen el lugar asegurado. Te espero 🤎 Pili`;
    try { await navigator.clipboard.writeText(txt); toast('Copiado. Pégalo en WhatsApp.'); } catch { toast(txt); }
  }));
  $('#main').querySelectorAll('[data-editar]').forEach((b) => (b.onclick = () => { editando = datos.eventos[+b.dataset.editar]; tab = 'nuevo'; pintar(); }));
}

// ---------- Te leen ----------
async function leen() {
  $('#main').innerHTML = '<p class="vacio">Cargando…</p>';
  const { mensajes } = await api('/api/pili/mensajes');
  if (!mensajes.length) { $('#main').innerHTML = '<p class="vacio">Todavía nadie te ha escrito.</p>'; return; }
  $('#main').innerHTML = mensajes.map((m) => `<div class="msg ${m.leido ? '' : 'nuevo'}" data-id="${m.id}">
    ${m.pregunta ? `<div class="q">${esc(m.pregunta)}</div>` : ''}<p>${esc(m.texto)}</p>
    <small>${esc(m.nombre || 'Sin nombre')} · ${new Date(m.created_at).toLocaleString('es-CL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('');
  $('#main').querySelectorAll('.msg.nuevo').forEach((el) => (el.onclick = async () => {
    el.classList.remove('nuevo');
    await api(`/api/pili/mensajes/${el.dataset.id}/leido`, { method: 'POST' }).catch(() => {});
    datos.sinLeer = Math.max(0, (datos.sinLeer || 0) - 1); $('#nl').textContent = datos.sinLeer || '';
  }));
}

// ---------- Nuevo / editar ----------
function nuevo() {
  const ev = editando;
  let precios = [];
  try { precios = ev ? JSON.parse(ev.precios) : [{ hasta: null, monto: 15000 }]; } catch { precios = [{ hasta: null, monto: 15000 }]; }
  const fases = proximasFases(new Date(), 6);
  $('#main').innerHTML = `<form class="form" id="fe">
    <h2>${ev ? 'Editar' : 'Nuevo círculo o taller'}</h2>
    <label class="campo"><span>Nombre</span><input name="nombre" required maxlength="80" value="${esc(ev ? ev.nombre : '')}" placeholder="Círculo de Luna Llena"></label>
    <label class="campo"><span>Una línea (en cursiva, debajo del nombre)</span><input name="bajada" maxlength="160" value="${esc(ev ? ev.bajada || '' : '')}" placeholder="Haz una pausa. Vacía lo que pesa."></label>
    <div class="dos">
      <label class="campo"><span>Tipo</span><select name="tipo"><option value="circulo">Círculo</option><option value="taller" ${ev && ev.tipo === 'taller' ? 'selected' : ''}>Taller</option></select></label>
      <label class="campo"><span>Luna</span><select name="luna"><option value="">—</option>${['llena', 'nueva', 'solsticio'].map((l) => `<option value="${l}" ${ev && ev.luna === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="campo"><span>Fecha</span><input name="fecha" type="date" required value="${esc(ev ? ev.fecha : '')}"></label>
    <div class="lunas">${fases.map((f) => `<button type="button" data-f="${isoDe(f.fecha)}" data-l="${f.tipo}">${f.tipo === 'llena' ? '🌕' : '🌑'} ${fechaCorta(isoDe(f.fecha))}</button>`).join('')}</div>
    <div class="dos">
      <label class="campo"><span>Desde</span><input name="hora" type="time" required value="${esc(ev ? ev.hora : '19:00')}"></label>
      <label class="campo"><span>Hasta</span><input name="hora_fin" type="time" value="${esc(ev ? ev.hora_fin || '' : '21:00')}"></label>
    </div>
    <label class="campo"><span>Lugar</span><input name="lugar" list="lugares" maxlength="120" value="${esc(ev ? ev.lugar || '' : '')}"><datalist id="lugares">${LUGARES.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></label>
    <div class="dos">
      <label class="campo"><span>Cupos presenciales</span><input name="cupos_presencial" type="number" min="0" inputmode="numeric" value="${ev ? ev.cupos_presencial : 15}"></label>
      <label class="campo"><span>Cupos online</span><input name="cupos_online" type="number" min="0" inputmode="numeric" value="${ev ? ev.cupos_online : 15}"></label>
    </div>
    <p class="versal" style="margin:4px 0 8px">Aporte (puede bajar si pagan antes)</p>
    <div id="tramos">${precios.map(tramo).join('')}</div>
    <button type="button" class="mini" id="mastramo" style="margin:0 0 14px">+ otro precio por fecha</button>
    <label class="campo"><span>Tu pregunta para esta luna</span><input name="pregunta" maxlength="200" value="${esc(ev ? ev.pregunta || '' : '')}" placeholder="¿Qué necesita más descanso en ti hoy?"></label>
    <label class="campo"><span>Descripción (opcional)</span><textarea class="corto" name="descripcion" maxlength="1500">${esc(ev ? ev.descripcion || '' : '')}</textarea></label>
    ${ev ? `<label class="campo"><span>Estado</span><select name="estado"><option value="abierto">Abierto</option><option value="cerrado" ${ev.estado === 'cerrado' ? 'selected' : ''}>Cerrado (no recibe inscripciones)</option></select></label>` : ''}
    <button class="btn">${ev ? 'Guardar cambios' : 'Publicar'}</button>
    ${ev ? '<button type="button" class="btn suave" id="cancelar" style="margin-top:10px">Cancelar</button>' : ''}
  </form>`;
  const f = $('#fe');
  f.querySelectorAll('.lunas button').forEach((b) => (b.onclick = () => { f.fecha.value = b.dataset.f; f.luna.value = b.dataset.l; }));
  $('#mastramo').onclick = () => $('#tramos').insertAdjacentHTML('afterbegin', tramo({ hasta: '', monto: '' }));
  $('#tramos').onclick = (e) => { if (e.target.matches('[data-quitar]') && $('#tramos').children.length > 1) e.target.closest('.tramo').remove(); };
  if ($('#cancelar')) $('#cancelar').onclick = () => { editando = null; tab = 'vienen'; pintar(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = f.querySelector('button.btn'); b.disabled = true;
    const v = Object.fromEntries(new FormData(f));
    v.precios = [...f.querySelectorAll('.tramo')].map((t) => ({ hasta: t.querySelector('[name=t_hasta]').value || null, monto: +t.querySelector('[name=t_monto]').value }));
    try {
      await api(ev ? `/api/pili/eventos/${ev.id}` : '/api/pili/eventos', { method: 'POST', body: v });
      toast(ev ? 'Guardado' : 'Publicado. Ya está en tu página.');
      editando = null; tab = 'vienen'; await cargar();
    } catch (err) { toast(err.message); b.disabled = false; }
  };
}
function tramo(t) {
  return `<div class="tramo">
    <label class="campo"><span>Monto</span><input name="t_monto" type="number" min="0" step="500" inputmode="numeric" value="${esc(t.monto)}" required></label>
    <label class="campo"><span>Hasta el (vacío = siempre)</span><input name="t_hasta" type="date" value="${esc(t.hasta || '')}"></label>
    <button type="button" class="mini" data-quitar style="margin-bottom:14px">×</button></div>`;
}

// ---------- Tu árbol (the products competing for her domain) ----------
function productos() {
  const ps = datos.productos;
  $('#main').innerHTML = `<div class="arbol">
    <p class="intro">Cada una de estas es una versión de tu página, hecha por alguien que creyó algo distinto sobre lo que necesitas. Las inscripciones y los mensajes son los mismos en todas. <b>Tú eliges cuál vive en arboldelilith.jpfraneto.com.</b></p>
    ${ps.map((p) => `<div class="prod ${p.padre ? 'hijo' : ''} ${p.id === datos.campeon ? 'campeon' : ''}">
      ${p.id === datos.campeon ? '<span class="sello">La que se ve hoy</span>' : ''}
      <h3>${esc(p.nombre)}</h3><span class="de">${esc(p.id)} · de ${esc(p.autor)} · ${esc(fechaCorta(p.fecha))}${p.padre ? ` · nace de ${esc(p.padre)}` : ''}</span>
      <p>${esc(p.cree_que)}</p>
      <div class="fila-btn">
        <a class="btn suave" href="/?probar=${esc(p.id)}" target="_blank" rel="noopener">Probarla</a>
        ${p.id === datos.campeon ? '' : `<button class="btn" data-elegir="${esc(p.id)}">Elegir esta</button>`}
      </div></div>`).join('')}
    <p class="proponer">¿Alguien quiere hacerte otra? Que le escriba a JP.<br>Aparece aquí como una rama nueva, y tú decides.</p></div>`;
  $('#main').querySelectorAll('[data-elegir]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api('/api/pili/campeon', { method: 'POST', body: { id: b.dataset.elegir } }); datos.campeon = b.dataset.elegir; toast('Listo. Tu página ya cambió.'); productos(); }
    catch (e) { toast(e.message); b.disabled = false; }
  }));
}

$('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; if (tab !== 'nuevo') editando = null; pintar(); };
cargar();
