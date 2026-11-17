// Árbol de Lilith · what every product inherits from the niche: talking to /api, the login, and "Quiero ir"
// (sign up, pay or not, see your place). A product imports what it wants and draws its own screens.

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || 'Algo falló. Intenta de nuevo.'); e.code = data.error; e.status = res.status; throw e; }
  return data;
}

// ---------- words ----------
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaDe = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const fechaLarga = (iso) => { const d = fechaDe(iso); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const fechaCorta = (iso) => { const d = fechaDe(iso); return `${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const plata = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL');
export const diasPara = (iso) => Math.round((fechaDe(iso) - new Date(new Date().toDateString()).setHours(12)) / 86400000);
export const cuando = (iso) => { const n = diasPara(iso); return n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 7 ? `este ${DIAS[fechaDe(iso).getDay()]}` : `en ${n} días`; };

export const ICON = {
  fecha: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  hora: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  lugar: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  cupos: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M15.8 14.5c2.3.1 4 1.5 4.7 4"/></svg>',
  online: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="11" rx="2"/><path d="M9 20h6M12 16v4"/></svg>',
};

export function chipsEvento(ev) {
  const libres = Object.entries(ev.modalidades).map(([m, x]) => {
    if (x.libres > 0) return `${x.libres} ${m === 'presencial' ? (x.libres === 1 ? 'presencial' : 'presenciales') : 'online'}`;
    return x.puedePagar ? `${m}: pagando aseguras` : `${m}: lista de espera`;
  }).join(' · ');
  return `<div class="chips">
    <span class="chip">${ICON.fecha}${esc(fechaLarga(ev.fecha))}</span>
    <span class="chip">${ICON.hora}${esc(ev.hora)}${ev.hora_fin ? '–' + esc(ev.hora_fin) : ''}</span>
    ${ev.lugar ? `<span class="chip">${ICON.lugar}${esc(ev.lugar)}</span>` : ''}
    <span class="chip">${ICON.cupos}${esc(libres)}</span>
  </div>`;
}

export function precioTexto(ev) {
  const p = ev.precio;
  let s = `Aporte ${plata(p.monto)}`;
  if (p.hasta && p.siguiente) s += ` hasta el ${fechaCorta(p.hasta)} (después ${plata(p.siguiente)})`;
  return s;
}

export function estadoMio(mia, tuyo = true) {
  if (!mia) return '';
  const t = tuyo
    ? { asegurado: 'Tu lugar está asegurado', reservado: 'Inscrita · falta pagar', espera: 'En lista de espera' }[mia.lugar]
    : { asegurado: 'Lugar asegurado', reservado: 'Reservado · falta pagar', espera: 'En lista de espera' }[mia.lugar];
  return `<span class="estado ${mia.lugar}">${t || ''}${tuyo && mia.regaloDe ? ` · regalo de ${esc(mia.regaloDe)} 🌿` : ''}</span>`;
}

// ---------- toast + sheets ----------
let toastT;
export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
}

export function hoja(html, { onClose } = {}) {
  const velo = document.createElement('div'); velo.className = 'velo';
  const el = document.createElement('section'); el.className = 'hoja'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="asa"></div><button class="cerrar" aria-label="Cerrar">×</button><div class="cuerpo">${html}</div>`;
  document.body.append(velo, el);
  requestAnimationFrame(() => { velo.classList.add('on'); el.classList.add('on'); });
  const close = () => { velo.classList.remove('on'); el.classList.remove('on'); setTimeout(() => { velo.remove(); el.remove(); }, 320); onClose && onClose(); };
  velo.onclick = close; $('.cerrar', el).onclick = close;
  // Focus the first text field once the sheet is up; screens that redraw while you type pass { focus: false }.
  const TEXTO = 'input:not([type=checkbox]):not([type=radio]),textarea';
  const set = (h, { focus = true } = {}) => { $('.cuerpo', el).innerHTML = h; const f = focus && el.querySelector(TEXTO); if (f) setTimeout(() => f.focus(), 340); };
  const f = el.querySelector(TEXTO); if (f) setTimeout(() => f.focus(), 340);
  return { el, close, set };
}

// ---------- who's here ----------
let yoCache;
export async function yo(force = false) {
  if (!yoCache || force) yoCache = api('/api/yo').then((r) => r.user).catch(() => null);
  return yoCache;
}

/** Phone → code (shown as a fake WhatsApp message in the prototype) → name if new. Resolves with the user. */
export function entrar({ titulo = 'Entra con tu teléfono', lead = 'Te mandamos un código por WhatsApp. Sin contraseñas.', h } = {}) {
  return new Promise((resolve) => {
    let phone = '';
    const sheet = h || hoja('');
    const paso1 = () => {
      sheet.set(`<h2>${esc(titulo)}</h2><p class="lead">${esc(lead)}</p>
        <form id="f1"><label class="campo"><span>Tu WhatsApp</span><input name="p" type="tel" inputmode="tel" autocomplete="tel" placeholder="9 1234 5678" required></label>
        <button class="btn">Recibir código</button></form>`);
      $('#f1', sheet.el).onsubmit = async (e) => {
        e.preventDefault();
        const b = e.target.querySelector('button'); b.disabled = true;
        try {
          const r = await api('/api/auth/start', { method: 'POST', body: { phone: e.target.p.value } });
          phone = r.phone; paso2(r);
        } catch (err) { toast(err.message); b.disabled = false; }
      };
    };
    const paso2 = (r) => {
      sheet.set(`<h2>${r.name ? `Hola, ${esc(r.name)}` : 'Revisa tu WhatsApp'}</h2><p class="lead">Escribe el código de 6 números.</p>
        ${r.demoCode ? `<div class="wa"><span>💬</span><span>Árbol de Lilith: tu código es <b>${esc(r.demoCode)}</b><span class="demo">Prototipo: el mensaje se muestra aquí en vez de llegar a tu WhatsApp.</span></span></div>` : ''}
        <form id="f2"><label class="campo"><span>Código</span><input name="c" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>
        ${r.nuevo ? '<label class="campo"><span>¿Cómo te llamas?</span><input name="n" autocomplete="given-name" required maxlength="60"></label>' : ''}
        <button class="btn">Entrar</button></form>`);
      $('#f2', sheet.el).onsubmit = async (e) => {
        e.preventDefault();
        const b = e.target.querySelector('button'); b.disabled = true;
        try {
          const v = await api('/api/auth/verify', { method: 'POST', body: { phone, code: e.target.c.value, name: e.target.n ? e.target.n.value : '' } });
          yoCache = Promise.resolve(v.user);
          resolve({ user: v.user, sheet });
        } catch (err) { toast(err.message); b.disabled = false; }
      };
    };
    paso1();
  });
}

// ---------- "Quiero ir" ----------

/**
 * The whole sign-up for one event, in one sheet: login if needed → presencial/online → pay (locks the place) or
 * sign up without paying (the place is held until paid ones fill it). onCambio(ev) gets the updated event.
 */
export async function quieroIr(ev, { onCambio } = {}) {
  let user = await yo();
  let sheet;
  if (!user) {
    const r = await entrar({ titulo: ev.nombre, lead: `${fechaLarga(ev.fecha)} · ${ev.hora}. Primero, tu teléfono: así te guardamos el lugar.` });
    user = r.user; sheet = r.sheet;
  } else sheet = hoja('');
  const mods = Object.keys(ev.modalidades);
  let modalidad = (ev.mia && ev.mia.modalidad) || (mods.includes('presencial') ? 'presencial' : mods[0]);
  const yaPagado = () => ev.mia && ev.mia.estado === 'pagada';
  let conmigo = !yaPagado();
  const invitadas = []; // [{nombre, telefono}]: places she gifts, named right here

  const elegir = () => {
    const x = ev.modalidades[modalidad];
    const mia = ev.mia;
    const n = (conmigo && !yaPagado() ? 1 : 0) + invitadas.length;
    const total = n * ev.precio.monto;
    const segs = mods.length > 1 ? `<div class="seg">${mods.map((m) => {
      const y = ev.modalidades[m];
      const sub = y.libres > 0 ? `quedan ${y.libres}` : y.puedePagar ? 'pagando aseguras' : 'lista de espera';
      return `<button type="button" data-m="${m}" class="${m === modalidad ? 'on' : ''}" ${mia && mia.estado === 'pagada' && mia.modalidad !== m ? 'disabled' : ''}><b>${m === 'presencial' ? 'Presencial' : 'Online'}</b><small>${sub}</small></button>`;
    }).join('')}</div>` : '';
    const filaYo = yaPagado()
      ? `<div class="lugar-fila"><span class="quien">Tú${user.firstName ? ', ' + esc(user.firstName) : ''}</span>${estadoMio(mia)}</div>`
      : `<label class="lugar-fila"><input type="checkbox" id="conmigo" ${conmigo ? 'checked' : ''}><span class="quien">Yo también voy${user.firstName ? ` (${esc(user.firstName)})` : ''}</span>${mia ? estadoMio(mia) : ''}</label>`;
    const filas = invitadas.map((g, i) => `<div class="regalo" data-i="${i}">
        <div class="regalo-top"><span class="versal">Regalo ${invitadas.length > 1 ? i + 1 : ''}</span><button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar">×</button></div>
        <input class="g-n" placeholder="Su nombre" maxlength="60" value="${esc(g.nombre)}" autocomplete="off">
        <input class="g-t" placeholder="Su WhatsApp (para que vea su lugar)" type="tel" inputmode="tel" value="${esc(g.telefono)}" autocomplete="off">
      </div>`).join('');
    const yaRegalados = (ev.regalos || []).length ? `<p class="nota" style="text-align:left">Ya regalaste: ${ev.regalos.map((g) => esc(g.nombre)).join(', ')}</p>` : '';
    sheet.set(`<p class="versal">${ev.tipo === 'taller' ? 'Taller' : 'Círculo de mujeres'}</p>
      <h2>${esc(ev.nombre)}</h2>
      <p class="lead">${esc(fechaLarga(ev.fecha))} · ${esc(ev.hora)}${ev.lugar ? ' · ' + esc(ev.lugar) : ''}<br>${esc(precioTexto(ev))} por persona</p>
      ${segs}
      <div class="lugares">${filaYo}${filas}
        ${invitadas.length < 5 ? '<button type="button" class="mas-regalo" id="mas">+ Regalarle un lugar a otra persona</button>' : ''}
      </div>${yaRegalados}
      ${n ? `<p class="total"><span>${n} ${n === 1 ? 'lugar' : 'lugares'}</span><b>${plata(total)}</b></p>` : ''}
      ${n && x.puedePagar ? `<button class="btn" id="pagar">${n > 1 ? `Pagar los ${n} lugares` : 'Pagar y asegurar el lugar'} <small>${plata(total)}</small></button>` : ''}
      ${n && !(conmigo && mia && !invitadas.length) ? `<button class="btn suave" id="libre" style="margin-top:10px">${x.libres >= n ? (n > 1 || !conmigo ? 'Reservar sin pagar' : 'Inscribirme sin pagar') : 'Anotar en la lista de espera'}</button>` : ''}
      <p class="nota">${x.puedePagar ? 'Si se llenan los cupos, los lugares pagados tienen prioridad.' : 'Los lugares ya están todos pagados. Si alguien se baja, te avisamos.'}</p>`, { focus: false });
    const el = sheet.el;
    el.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { modalidad = b.dataset.m; elegir(); }));
    const cm = $('#conmigo', el); if (cm) cm.onchange = () => { conmigo = cm.checked; elegir(); };
    const mas = $('#mas', el);
    if (mas) mas.onclick = () => { invitadas.push({ nombre: '', telefono: '' }); elegir(); setTimeout(() => { const f = el.querySelectorAll('.g-n'); f[f.length - 1].focus(); }, 30); };
    el.querySelectorAll('.regalo').forEach((r) => {
      const g = invitadas[+r.dataset.i];
      $('.g-n', r).oninput = (e) => { g.nombre = e.target.value; };
      $('.g-t', r).oninput = (e) => { g.telefono = e.target.value; };
    });
    el.querySelectorAll('[data-quitar]').forEach((b) => (b.onclick = () => { invitadas.splice(+b.dataset.quitar, 1); elegir(); }));
    const go = async (pagar, btn) => {
      if (invitadas.some((g) => !g.nombre.trim())) { toast('Falta el nombre de alguien a quien le regalas el lugar.'); return; }
      btn.disabled = true;
      try {
        const r = await api(`/api/eventos/${ev.id}/inscribir`, { method: 'POST', body: { modalidad, pagar, yo: conmigo && !yaPagado(), invitadas } });
        ev = r.evento; onCambio && onCambio(ev);
        if (r.pago) return pago(sheet, r.pago, (r2) => { ev = r2.evento; onCambio && onCambio(ev); listo(); });
        listo();
      } catch (err) { toast(err.message); btn.disabled = false; }
    };
    const bp = $('#pagar', el); if (bp) bp.onclick = () => go(true, bp);
    const bl = $('#libre', el); if (bl) bl.onclick = () => go(false, bl);
  };

  const listo = () => {
    const mia = ev.mia;
    const regalos = ev.regalos || [];
    const online = (mia ? mia.modalidad : modalidad) === 'online';
    const titulo = mia ? (mia.lugar === 'asegurado' ? 'Te esperamos' : mia.lugar === 'reservado' ? 'Quedaste inscrita' : 'Estás en la lista') : 'Listo';
    const msg = mia ? {
      asegurado: online ? 'El link para conectarte te llega el día antes.' : 'Ven con ropa cómoda. Si algo cambia, Pili te escribe.',
      reservado: 'Tu lugar está reservado. Si los cupos se llenan con pagos, pasas a la lista de espera: pagar lo asegura.',
      espera: 'Si se libera un lugar, te avisamos por WhatsApp.',
    }[mia.lugar] : '';
    const regalosHtml = regalos.length ? `<div class="regalos-listos"><p class="versal">Tus regalos</p>${regalos.map((g) => `<div class="lugar-fila">
        <span class="quien">${esc(g.nombre)}</span>${estadoMio(g, false)}
        ${g.telefono ? `<a class="mini-wa" target="_blank" rel="noopener" href="https://wa.me/${esc(g.telefono)}?text=${encodeURIComponent(textoRegalo(ev, g, user))}">Avisarle por WhatsApp</a>`
          : `<button class="mini-wa" data-copiar="${esc(g.nombre)}">Copiar mensaje para ella</button>`}
      </div>`).join('')}</div>` : '';
    sheet.set(`<div style="text-align:center;padding-top:6px">
      <img src="/comun/logo.jpg" alt="" width="88" height="88" style="margin:0 auto 10px;border-radius:50%">
      <h2>${titulo}</h2>
      <p class="lead">${esc(fechaLarga(ev.fecha))} · ${esc(ev.hora)}${!online && ev.lugar ? '<br>' + esc(ev.lugar) : online ? '<br>Online' : ''}</p>
      ${mia ? `<p>${estadoMio(mia)}</p><p style="color:var(--corteza)">${msg}</p>` : ''}</div>
      ${regalosHtml}
      ${mia && mia.lugar !== 'espera' ? `<a class="btn suave" download="${esc(ev.nombre)}.ics" href="${ics(ev)}" style="margin-top:12px">Agregar a mi calendario</a>` : ''}
      ${mia && mia.lugar === 'reservado' && ev.modalidades[mia.modalidad].puedePagar ? '<button class="btn" id="pagar2" style="margin-top:10px">Pagar ahora y asegurarlo</button>' : ''}`);
    const b = $('#pagar2', sheet.el);
    if (b) b.onclick = async () => {
      b.disabled = true;
      try { const r = await api(`/api/inscripciones/${mia.id}/pagar`, { method: 'POST' }); pago(sheet, r.pago, (r2) => { ev = r2.evento; onCambio && onCambio(ev); listo(); }); }
      catch (err) { toast(err.message); b.disabled = false; }
    };
    sheet.el.querySelectorAll('[data-copiar]').forEach((c) => (c.onclick = async () => {
      const g = regalos.find((x) => x.nombre === c.dataset.copiar);
      try { await navigator.clipboard.writeText(textoRegalo(ev, g, user)); toast('Copiado. Mándaselo como quieras.'); } catch { toast(textoRegalo(ev, g, user)); }
    }));
  };
  elegir();
}

function textoRegalo(ev, g, user) {
  const de = user && user.firstName ? user.firstName : 'Yo';
  const pagado = g.estado === 'pagada';
  return `${de} te ${pagado ? 'regaló' : 'reservó'} un lugar en el ${ev.nombre} con Pili (Árbol de Lilith) 🌿 ${fechaLarga(ev.fecha)}, ${ev.hora}${ev.lugar && g.modalidad !== 'online' ? `, en ${ev.lugar}` : ' (online)'}.${pagado ? ' Ya está pagado.' : ''} Tu lugar: ${location.origin}/ (entra con tu WhatsApp)`;
}

/** The payment step, for anything (places or the 1:1 hour). Mercado Pago when it's set up; otherwise a test screen. */
function pago(sheet, p, onPagado) {
  if (p.tipo === 'mercadopago') { location.href = p.url; return; }
  sheet.set(`<p class="versal">Pago de prueba</p><h2>${plata(p.monto)}</h2>
    <p class="lead">${esc(p.title)}</p>
    <div class="wa" style="background:#E8F0FB;color:#14365d"><span>💳</span><span>Aquí se abre <b style="letter-spacing:0">Mercado Pago</b> con la cuenta de Pili.<span class="demo">Prototipo: no se cobra nada. El botón marca el pago como hecho.</span></span></div>
    <button class="btn" id="ok">Pagar ${plata(p.monto)} (prueba)</button>`);
  $('#ok', sheet.el).onclick = async (e) => {
    e.target.disabled = true;
    try { onPagado(await api(`/api/demo/pagar/${p.compra}`, { method: 'POST' })); }
    catch (err) { toast(err.message); e.target.disabled = false; }
  };
}

// ---------- the 1:1 hour ----------

/** "Una hora 1:1 con Pili": for me or as a gift, what for, where, when suits; pay now or later. Pili sets the day by WhatsApp. */
export async function unaHora() {
  const info = await api('/api/sesion');
  let user = await yo();
  let sheet;
  if (!user) {
    const r = await entrar({ titulo: info.nombre, lead: `${plata(info.precio)} · ${info.duracion} minutos. Primero, tu teléfono: así Pili te escribe para elegir el día.` });
    user = r.user; sheet = r.sheet;
  } else sheet = hoja('');
  const st = { para: 'yo', para_nombre: '', para_telefono: '', motivo: info.motivos[0], modalidad: 'presencial', preferencia: '' };
  const pintar = () => {
    sheet.set(`<p class="versal">1:1 · ${info.duracion} minutos</p><h2>${esc(info.nombre)}</h2>
      <p class="lead">${esc(info.linea)}</p>
      <p class="campo-t">¿Para quién?</p>
      <div class="seg"><button type="button" data-para="yo" class="${st.para === 'yo' ? 'on' : ''}"><b>Para mí</b></button><button type="button" data-para="otra" class="${st.para === 'otra' ? 'on' : ''}"><b>Para regalar</b></button></div>
      ${st.para === 'otra' ? `<div class="regalo"><input class="p-n" placeholder="Su nombre" maxlength="60" value="${esc(st.para_nombre)}"><input class="p-t" placeholder="Su WhatsApp (opcional)" type="tel" inputmode="tel" value="${esc(st.para_telefono)}"></div>` : ''}
      <p class="campo-t">¿Qué te gustaría?</p>
      <div class="opciones">${info.motivos.map((m) => `<button type="button" data-motivo="${esc(m)}" class="${st.motivo === m ? 'on' : ''}">${esc(m)}</button>`).join('')}</div>
      <p class="campo-t">¿Dónde?</p>
      <div class="seg">${Object.entries(info.modalidades).map(([k, v]) => `<button type="button" data-mod="${k}" class="${st.modalidad === k ? 'on' : ''}"><b>${esc(v)}</b></button>`).join('')}</div>
      <label class="campo"><span>¿Cuándo te acomoda? (Pili te escribe para fijar el día)</span><input class="p-pref" maxlength="160" placeholder="Ej: martes o jueves en la tarde" value="${esc(st.preferencia)}"></label>
      <p class="total"><span>1 hora</span><b>${plata(info.precio)}</b></p>
      <button class="btn" id="pagar">Pagar y pedir la hora <small>${plata(info.precio)}</small></button>
      <button class="btn suave" id="despues" style="margin-top:10px">Pedir la hora y pagar después</button>`, { focus: false });
    const el = sheet.el;
    el.querySelectorAll('[data-para]').forEach((b) => (b.onclick = () => { st.para = b.dataset.para; pintar(); }));
    el.querySelectorAll('[data-motivo]').forEach((b) => (b.onclick = () => { st.motivo = b.dataset.motivo; pintar(); }));
    el.querySelectorAll('[data-mod]').forEach((b) => (b.onclick = () => { st.modalidad = b.dataset.mod; pintar(); }));
    const pn = $('.p-n', el); if (pn) pn.oninput = (e) => { st.para_nombre = e.target.value; };
    const pt = $('.p-t', el); if (pt) pt.oninput = (e) => { st.para_telefono = e.target.value; };
    $('.p-pref', el).oninput = (e) => { st.preferencia = e.target.value; };
    const go = async (pagar, btn) => {
      if (st.para === 'otra' && !st.para_nombre.trim()) { toast('¿Para quién es la hora?'); return; }
      btn.disabled = true;
      try {
        const r = await api('/api/sesiones', { method: 'POST', body: { ...st, pagar } });
        if (r.pago) return pago(sheet, r.pago, (r2) => listo(r2.sesion));
        listo(r.sesion);
      } catch (err) { toast(err.message); btn.disabled = false; }
    };
    $('#pagar', el).onclick = (e) => go(true, e.currentTarget);
    $('#despues', el).onclick = (e) => go(false, e.currentTarget);
  };
  const listo = (s) => {
    const regalo = s.para;
    const txt = `${user.firstName || 'Yo'} te regaló una hora 1:1 con Pili (Árbol de Lilith) 🌿 ${s.motivo}${s.modalidad === 'online' ? ', online' : ', en Llanquihue'}.${s.pagada ? ' Ya está pagada.' : ''} Pili te va a escribir para elegir el día.`;
    sheet.set(`<div style="text-align:center;padding-top:6px">
      <img src="/comun/logo.jpg" alt="" width="88" height="88" style="margin:0 auto 10px;border-radius:50%">
      <h2>${regalo ? 'Tu regalo está listo' : 'Listo'}</h2>
      <p class="lead">${esc(s.motivo)} · ${s.modalidad === 'online' ? 'online' : 'presencial'}${s.preferencia ? '<br>' + esc(s.preferencia) : ''}</p>
      <p><span class="estado ${s.pagada ? 'asegurado' : 'reservado'}">${s.pagada ? 'Pagada' : 'Falta pagar'}</span></p>
      <p style="color:var(--corteza)">Pili ${regalo ? `le` : 'te'} escribe por WhatsApp para fijar el día.${regalo && !s.paraTelefono ? ' Como no dejaste su número, Pili te escribe a ti.' : ''}</p></div>
      ${regalo ? (s.paraTelefono ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(s.paraTelefono)}?text=${encodeURIComponent(txt)}">Avisarle a ${esc(regalo)} por WhatsApp</a>` : `<button class="btn" id="copiar">Copiar mensaje para ${esc(regalo)}</button>`) : ''}
      ${s.pagada ? '' : '<button class="btn suave" id="pagarya" style="margin-top:10px">Pagar ahora</button>'}`);
    const c = $('#copiar', sheet.el); if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('Copiado.'); } catch { toast(txt); } };
    const p = $('#pagarya', sheet.el);
    if (p) p.onclick = async () => { p.disabled = true; try { const r = await api(`/api/sesiones/${s.id}/pagar`, { method: 'POST' }); pago(sheet, r.pago, (r2) => listo(r2.sesion)); } catch (err) { toast(err.message); p.disabled = false; } };
  };
  pintar();
}

function ics(ev) {
  const d = ev.fecha.replace(/-/g, '');
  const t = (h) => (h || '').replace(':', '') + '00';
  const s = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Arbol de Lilith//ES', 'BEGIN:VEVENT',
    `UID:evento-${ev.id}@arboldelilith.jpfraneto.com`, `DTSTART;TZID=America/Santiago:${d}T${t(ev.hora)}`,
    ev.hora_fin ? `DTEND;TZID=America/Santiago:${d}T${t(ev.hora_fin)}` : '', `SUMMARY:${ev.nombre} · Árbol de Lilith`,
    ev.lugar ? `LOCATION:${ev.lugar}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(s);
}

// ---------- the niche around the product ----------

/** If someone is trying a challenger, say so on top, with the way back. Every product calls it. */
export async function nicho() {
  try {
    const n = await api('/api/nicho');
    if (n.probando) {
      const p = n.productos.find((x) => x.id === n.activo);
      const bar = document.createElement('div'); bar.className = 'probando';
      bar.innerHTML = `<span>Estás probando <b>«${esc(p.nombre)}»</b>, de ${esc(p.autor)}</span><a href="/?probar=">Volver al de Pili</a>`;
      document.body.prepend(bar);
    }
    return n;
  } catch { return null; }
}

/** Back from Mercado Pago: /#pago=approved|pending|rejected. */
export function vueltaDePago() {
  const m = location.hash.match(/pago=(\w+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  toast({ approved: 'Pago recibido. Tu lugar está asegurado.', pending: 'Tu pago está en proceso. Te avisamos.', rejected: 'El pago no pasó. Puedes intentar de nuevo.' }[m[1]] || '');
}
