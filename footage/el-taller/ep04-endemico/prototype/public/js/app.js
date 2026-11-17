// Endémico · web app (no build step). Hash routes, one file.
import qrcode from '../vendor/qrcode.mjs';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TZ = 'America/Santiago';
const view = $('#view');

const state = { config: null, user: null, resumen: null, pollers: [] };

/* ------------------------------------------------------------------ utils */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clp = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL');
const dayOf = (ts = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
const hora = (ts) => new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
const fecha = (ts, opts = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('es-CL', { timeZone: TZ, ...opts }).format(new Date(ts)).replace('.', '');
const fechaDia = (day, opts) => fecha(Date.parse(day + 'T15:00:00Z'), opts);
const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const firstName = (name) => String(name || '').split(' ')[0];
const prettyPhone = (p) => { const d = String(p || ''); return d.length === 11 ? `+${d.slice(0, 2)} ${d[2]} ${d.slice(3, 7)} ${d.slice(7)}` : '+' + d; };
const METHOD_LBL = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', mercadopago: 'Mercado Pago' };
const ESTADO = {
  al_dia: ['ok', 'Al día'], por_vencer: ['warn', 'Vence pronto'], vencido: ['bad', 'Pago vencido'],
  por_confirmar: ['info', 'Por confirmar'], sin_pago: ['dim', 'Sin pagos'],
};
const estadoChip = (e) => { const [c, l] = ESTADO[e] || ESTADO.sin_pago; return `<span class="chip ${c}">${l}</span>`; };
const planLbl = (n) => (n ? `${n * 4} clases al mes` : 'Sin plan');
const conceptoPago = (p) => (p.item === 'prueba' ? 'Pago de prueba' : p.item && p.item !== 'plan' ? ((state.config.servicios[p.item] || {}).nombre || p.item) : p.clases ? `Plan ${p.clases} clases` : 'Plan');
const weekdayOf = (day) => new Date(day + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/**
 * Which day of the plan (Día 1, 2, 3…) the member does next: their Nth class of the week is Día N, and it wraps
 * around if they come more often than the plan has days. If they already checked in today, it's today's.
 */
function miDiaIdx(plan, r) {
  const n = plan && plan.dias ? plan.dias.length : 0;
  if (!n || !r) return 0;
  const c = r.clasesSemana || 0;
  return r.hoyAt ? (Math.max(1, c) - 1) % n : c % n;
}
const mondayOf = (day) => { const wd = weekdayOf(day); return addDays(day, wd === 0 ? -6 : 1 - wd); };
const roundsTxt = (dia) => dia.bloques.map((b) => `${esc(b.nombre)}${b.formato ? ' ' + esc(b.formato) : ''}`).join(' · ');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || data.error || 'Error'); e.code = data.error; e.status = res.status; throw e; }
  return data;
}

let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/** Resize an image file to a JPEG data URL (keeps D1 rows small). */
function imageToDataUrl(file, max = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('No pude abrir esa imagen.'));
    img.src = URL.createObjectURL(file);
  });
}

function poll(fn, ms) {
  const id = setInterval(() => { if (!document.hidden) fn(); }, ms);
  state.pollers.push(id);
}
function stopPolls() { state.pollers.forEach(clearInterval); state.pollers = []; }

const ICON = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  semana: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
  planes: '<svg viewBox="0 0 24 24"><path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6l8 8a1.5 1.5 0 0 1 0 2.1l-7 7a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8.3" cy="8.3" r="1.6"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c.9-4 4-6.2 8-6.2s7.1 2.2 8 6.2"/></svg>',
  hist: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/></svg>',
  hoy: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  alumnos: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.3"/><circle cx="17" cy="9" r="2.6"/><path d="M2.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6M15 14.6c.7-.4 1.4-.6 2.2-.6 2.3 0 4 1.6 4.4 4.8"/></svg>',
  planilla: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M3.5 9h17M3.5 14h17M9 4v16M15 4v16"/></svg>',
  qr: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3h-3zM20.5 14v6.5H17M14 20.5h.01"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2.5h6L16.5 7h2A1.5 1.5 0 0 1 20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><circle cx="12" cy="13" r="3.8"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19.5 7"/></svg>',
  door: '<svg viewBox="0 0 24 24"><path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h9A1.5 1.5 0 0 1 17 4.5V21M3 21h18M13.5 12.5h.01"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9 0-1.4.7-2 1-2.3.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.1.1.7-.1 1.3z"/></svg>',
};

/* ------------------------------------------------------------------ shell */

function setShell({ tab = null, wide = false, tabbar = true, fit = false } = {}) {
  document.body.classList.toggle('wide', wide);
  document.body.classList.toggle('fit', fit);
  const u = state.user;
  const nav = $('#tabbar');
  let tabs = [];
  if (u && u.role === 'coach') tabs = [['#/coach', 'hoy', 'Hoy'], ['#/coach/alumnos', 'alumnos', 'Alumnos'], ['#/coach/planilla', 'planilla', 'Planilla'], ['#/coach/semana', 'semana', 'Semana']];
  else if (u && u.role === 'alumno') tabs = [['#/', 'home', 'Inicio'], ['#/semana', 'semana', 'Semana'], ['#/planes', 'planes', 'Planes'], ['#/calendario', 'hist', 'Calendario']];
  else if (u) tabs = [['#/semana', 'semana', 'Semana'], ['#/planes', 'planes', 'Planes'], ['#/cuenta', 'user', 'Mi cuenta']];
  else tabs = [['#/', 'home', 'Inicio'], ['#/semana', 'semana', 'Semana'], ['#/planes', 'planes', 'Planes'], ['#/entrar', 'user', 'Entrar']];
  const show = tabbar && tabs.length > 0;
  nav.hidden = !show;
  document.body.classList.toggle('no-tabbar', !show);
  nav.innerHTML = tabs.map(([href, ic, lbl]) => `<a href="${href}" class="${tab === ic ? 'on' : ''}">${ICON[ic]}<span>${lbl}</span></a>`).join('');
  const av = $('#avatar-btn');
  av.hidden = !u;
  if (u) { av.textContent = u.role === 'coach' ? 'COACH' : initials(u.name) || '·'; av.classList.toggle('coach', u.role === 'coach'); }
}

$('#avatar-btn').addEventListener('click', () => cuentaSheet());
function cuentaSheet() {
  const u = state.user;
  if (!u) return;
  openSheet(`
    <p class="kicker">${u.role === 'coach' ? 'Coach' : u.role === 'alumno' ? 'Alumno' : 'Entrenamiento de la semana'}</p>
    <h2 class="h-m" style="margin-top:8px">${esc(u.name || 'Sin nombre')}</h2>
    <p class="muted">${prettyPhone(u.phone)}</p>
    ${u.role === 'alumno' ? `<p class="muted" style="margin-top:4px">${planLbl(u.plan)} · ${clp(u.planMonto)}/mes</p>` : ''}
    ${u.role === 'remoto' ? `<p class="muted" style="margin-top:4px">${u.subUntil > Date.now() ? 'Suscrito hasta el ' + fecha(u.subUntil, { day: 'numeric', month: 'long' }) : 'Sin suscripción'}</p>` : ''}
    <button class="btn ghost block" id="logout" style="margin-top:22px"><span>Salir</span></button>`, (el) => {
    $('#logout', el).onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; closeSheet(); location.hash = '#/'; render(); };
  });
}

function openSheet(html, bind) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-back"></div><div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
  requestAnimationFrame(() => root.classList.add('open'));
  $('.sheet-back', root).onclick = closeSheet;
  if (bind) bind($('.sheet', root));
}
function closeSheet() {
  const root = $('#sheet-root');
  root.classList.remove('open');
  setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; }, 300);
}

/* ------------------------------------------------------------------ router */

async function loadMe() {
  const r = await api('/api/me');
  state.user = r.user;
  state.resumen = r.resumen || null;
}

async function render() {
  stopPolls();
  closeSheet();
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean);
  const u = state.user;
  window.scrollTo(0, 0);

  try {
    if (parts[0] === 'checkin') return await viewCheckin(decodeURIComponent(parts[1] || ''));
    if (parts[0] === 'entrar') return viewLogin(params);
    if (parts[0] === 'pago') return await viewPagoVuelta(parts[1] || '', params);
    if (parts[0] === 'semana') { if (u && u.role === 'alumno' && !state.resumen) await loadMe(); return await viewSemana(params); }
    if (parts[0] === 'puerta') return await viewPuerta();
    if (parts[0] === 'coach') {
      if (!u) return go(`#/entrar?next=${encodeURIComponent('#' + path)}`);
      if (u.role !== 'coach') return go('#/');
      if (parts[1] === 'alumnos' && parts[2]) return await viewCoachAlumno(+parts[2]);
      if (parts[1] === 'alumnos') return await viewCoachAlumnos();
      if (parts[1] === 'planilla') return await viewPlanilla();
      if (parts[1] === 'semana') return await viewCoachSemana();
      return await viewCoachHoy();
    }
    if (parts[0] === 'planes') return await viewPlanes(params);
    if (parts[0] === 'cuenta') { if (!u) return go('#/entrar'); go('#/semana'); return setTimeout(cuentaSheet, 350); }
    if (parts[0] === 'historial') return go('#/calendario');
    if (parts[0] === 'calendario') { if (!u) return go('#/entrar?next=%23%2Fcalendario'); if (u.role !== 'alumno') return go('#/planes'); return await viewCalendario(params); }
    // Home
    if (!u) return viewLanding();
    if (u.role === 'coach') return go('#/coach');
    if (u.role === 'remoto') return go('#/semana');
    return await viewHome();
  } catch (err) {
    if (err.status === 401) { state.user = null; return go(`#/entrar?next=${encodeURIComponent(location.hash)}`); }
    console.error(err);
    view.innerHTML = `<div class="empty">Algo falló: ${esc(err.message)}<br><br><a class="lime" href="#/">Volver</a></div>`;
  }
}

function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

window.addEventListener('hashchange', render);

/* ------------------------------------------------------------------ landing + login */

function viewLanding() {
  setShell({ tab: 'home', fit: true });
  view.innerHTML = `
    <section class="landing">
      <video class="landing-video" src="/assets/video/hero.mp4" poster="/assets/video/hero.jpg" autoplay muted loop playsinline></video>
      <div class="landing-copy">
        <div class="dashes"><i></i><i></i><i></i><i></i><i></i></div>
        <h1 class="h-xl">Tu gimnasio,<br><span class="lime">en tu teléfono</span></h1>
      </div>
    </section>
    <div class="props">
      <a class="prop" href="#/entrar">${ICON.qr}<div><b>Check-in con un toque</b><span>Escanea el QR de la puerta</span></div></a>
      <a class="prop" href="#/entrar">${ICON.hist}<div><b>Tus clases y tus pagos</b><span>Paga con Mercado Pago</span></div></a>
      <a class="prop" href="#/semana">${ICON.semana}<div><b>La semana, donde estés</b><span>El plan de Seba, con o sin equipo</span></div></a>
    </div>
    <p class="small muted" style="text-align:center;margin-top:12px">¿Primera vez? <a class="lime" href="https://wa.me/${state.config.gymWa}?text=${encodeURIComponent('Hola! Necesito comenzar a entrenar con ustedes!')}" target="_blank" rel="noopener">Escríbele a Endémico</a></p>`;
}

function showWaNote(code) {
  const el = $('#wa-note');
  el.innerHTML = `<div class="wa-ic">${ICON.wa}</div><div><b>Endémico</b><small>WhatsApp · ahora</small><p>Tu código para entrar es <b style="display:inline">${code}</b></p></div><span class="demo-tag">demo</span>`;
  // iPhone: with the keyboard open Safari shifts the page, and a plain `position: fixed; top` ends up off-screen.
  // Pin it to the top of what's actually visible (the visual viewport) while it's up.
  const vv = window.visualViewport;
  const place = () => { el.style.top = vv ? `calc(${Math.max(0, vv.offsetTop) + 10}px + env(safe-area-inset-top, 0px))` : ''; };
  place();
  if (vv) { vv.addEventListener('resize', place); vv.addEventListener('scroll', place); }
  setTimeout(() => { if (vv) { vv.removeEventListener('resize', place); vv.removeEventListener('scroll', place); } }, 9500);
  el.classList.add('show');
  el.onclick = () => { const i = $('#code'); if (i) { i.value = code; i.dispatchEvent(new Event('input')); } el.classList.remove('show'); };
  setTimeout(() => el.classList.remove('show'), 9000);
}

function viewLogin(params) {
  setShell({ tab: 'user', fit: true });
  const next = params.get('next') || '';
  const intent = ['remoto', 'comprar'].includes(params.get('intent')) ? params.get('intent') : 'login';
  view.innerHTML = `
    <div class="login-wrap">
      <div class="dashes"><i></i><i></i><i></i><i></i><i></i></div>
      <h1 class="h-l">${intent === 'remoto' ? 'Entrena<br><span class="lime">desde donde estés</span>' : intent === 'comprar' ? 'Tu número<br><span class="lime">y pagas</span>' : 'Entra con<br><span class="lime">tu número</span>'}</h1>
      <p>Te llega un código por WhatsApp.</p>
      <form id="f-phone">
        <label class="field"><span>Tu número</span><input class="input" id="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="9 1234 5678" required></label>
        <button class="btn block" style="margin-top:14px"><span>Mandarme el código</span></button>
        <p class="err" id="err1"></p>
      </form>
      <form id="f-code" hidden>
        <label class="field" id="name-f" hidden><span>Tu nombre</span><input class="input" id="name" autocomplete="name" placeholder="Nombre y apellido"></label>
        <label class="field"><span>Código de 6 dígitos</span><input class="input code" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······"></label>
        <button class="btn block" style="margin-top:14px"><span>Entrar</span></button>
        <p class="err" id="err2"></p>
        <button type="button" class="muted small" id="back" style="margin-top:6px">Cambiar número</button>
      </form>
      <div id="unknown" hidden></div>
    </div>`;
  let phone = '';
  $('#phone').focus();
  $('#f-phone').onsubmit = async (e) => {
    e.preventDefault();
    $('#err1').textContent = '';
    try {
      const r = await api('/api/auth/start', { method: 'POST', body: { phone: $('#phone').value, intent } });
      phone = r.phone;
      if (r.status === 'desconocido') {
        $('#f-phone').hidden = true;
        $('#unknown').hidden = false;
        $('#unknown').innerHTML = `
          <div class="card">
            <p class="h-s">Ese número no está en Endémico</p>
            <p class="muted small" style="margin-top:8px">Elige tu plan, paga con Mercado Pago y agenda tu primera clase. Si ya entrenas aquí, pídele a Seba que te agregue.</p>
            <a class="btn block sm" style="margin-top:14px" href="#/planes"><span>Ver planes</span></a>
            <a class="btn wa block sm" style="margin-top:10px" target="_blank" rel="noopener" href="https://wa.me/${state.config.gymWa}?text=${encodeURIComponent('Hola! Entreno en Endémico y quiero entrar a la app. Mi número es ' + prettyPhone(phone))}"><span>Ya entreno aquí</span></a>
          </div>
          <div class="card">
            <p class="h-s">¿Entrenas en otro lado?</p>
            <p class="muted small" style="margin-top:8px">Puedes seguir el entrenamiento de la semana de Endémico desde donde estés.</p>
            <a class="btn dark block sm" style="margin-top:14px" href="#/entrar?intent=remoto&next=%23%2Fsemana"><span>Ver el entrenamiento</span></a>
          </div>
          <button class="muted small" style="margin-top:14px" onclick="location.reload()">Probar otro número</button>`;
        return;
      }
      $('#f-phone').hidden = true;
      $('#f-code').hidden = false;
      if (r.nuevo && intent !== 'login') { $('#name-f').hidden = false; $('#name').focus(); }
      // With the demo code, close the keyboard: the page goes back in place and the WhatsApp notification is
      // visible on top. Tapping it fills the code. Without it, go straight to typing the code.
      else if (r.demoCode && document.activeElement) document.activeElement.blur();
      else $('#code').focus();
      if (r.demoCode) setTimeout(() => showWaNote(r.demoCode), 900);
      if (r.coachCode) $('#f-code .field span').textContent = 'Tu código de coach';
    } catch (err) { $('#err1').textContent = err.message; }
  };
  $('#code').addEventListener('input', (e) => { if (e.target.value.replace(/\D/g, '').length === 6 && ($('#name-f').hidden || $('#name').value.trim())) $('#f-code').requestSubmit(); });
  $('#back').onclick = () => { $('#f-code').hidden = true; $('#f-phone').hidden = false; };
  $('#f-code').onsubmit = async (e) => {
    e.preventDefault();
    $('#err2').textContent = '';
    try {
      if (!$('#name-f').hidden && !$('#name').value.trim()) { $('#err2').textContent = 'Escribe tu nombre.'; return; }
      const r = await api('/api/auth/verify', { method: 'POST', body: { phone, code: $('#code').value, name: $('#name').value } });
      $('#wa-note').classList.remove('show');
      await loadMe();
      toast(r.user.role === 'coach' ? '¡Hola profe! 💪' : `¡Hola ${firstName(r.user.name) || ''}!`);
      go(next || (r.user.role === 'coach' ? '#/coach' : r.user.role === 'remoto' ? '#/semana' : '#/'));
    } catch (err) { $('#err2').textContent = err.message; }
  };
}

/* ------------------------------------------------------------------ member */

/**
 * Month calendar. `fui` = days they came (filled lime). `reservas` = Map day → hora (lime outline + the time).
 * With `agendar`, today and the coming days that have classes can be tapped to book.
 */
function monthCal(fui, monthDay = dayOf(), { reservas = new Map(), agendar = false, plan = 0 } = {}) {
  const [y, m] = monthDay.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const today = dayOf();
  const last = addDays(today, state.config.agendaDias || 30);
  let html = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < offset; i++) html += '<div class="d blank"></div>';
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const res = reservas.get(key);
    const open = agendar && !fui.has(key) && key >= today && key <= last && (state.config.horario[weekdayOf(key)] || []).length > 0;
    const cls = ['d', fui.has(key) ? 'on' : '', res && !fui.has(key) ? 'res' : '', key === today ? 'today' : '', open ? 'open' : '', key < today ? 'past' : ''].filter(Boolean).join(' ');
    html += `<${open ? 'button' : 'div'} class="${cls}" ${open ? `data-agendar="${key}"` : ''}><span>${d}</span>${res && !fui.has(key) ? `<small>${res.slice(0, 2)}h</small>` : ''}</${open ? 'button' : 'div'}>`;
  }
  return `<div class="cal">${html}</div>`;
}

/** Name of what's being booked: 'clase' or a service key. */
const servNombre = (k) => (k === 'clase' ? 'Clase' : (state.config.servicios[k] || {}).nombre || k);

/** Today (if classes are left) and the next days with classes, for "¿cuándo vienes?". */
function proximosDias(n = 6) {
  const out = [];
  const nowH = +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  for (let i = 0; out.length < n && i < 14; i++) {
    const d = addDays(dayOf(), i);
    const horas = state.config.horario[weekdayOf(d)] || [];
    if (horas.length && (i > 0 || horas.some((h) => +h.slice(0, 2) > nowH))) out.push(d);
  }
  return out;
}

/** Pay for something from Planes: straight to Mercado Pago (logging in first if needed). */
async function pagarItem(item, btn) {
  if (!state.user) return go(`#/entrar?intent=comprar&next=${encodeURIComponent('#/planes?comprar=' + item)}`);
  if (!state.config.mercadoPago) return toast('Falta conectar Mercado Pago.', 3000);
  return goToMp('/api/comprar', btn, { item });
}

/**
 * Pick a time for a class or a service session on a day. One class a day; tapping another time moves it.
 * Shows what's left (classes of the paid month, or paid sessions) and lets you buy right there when nothing is.
 */
async function agendarSheet(day, onDone, servicio = 'clase', { fijo = false } = {}) {
  openSheet('<div class="spinner"></div>');
  let a;
  try { a = await api(`/api/agenda?day=${day}&servicio=${servicio}`); } catch (err) { closeSheet(); return toast(err.message, 3500); }
  const u = state.user;
  const titulo = fechaDia(day, { weekday: 'long', day: 'numeric', month: 'long' });
  const c = a.creditos;
  const sv = servicio === 'clase' ? null : state.config.servicios[servicio];
  const sesiones = servicio === 'clase' ? 0 : a.servicios[servicio] || 0;
  // What can be booked here: classes, plus any service with paid sessions left.
  const opciones = ['clase', ...Object.keys(a.servicios)];
  if (!opciones.includes(servicio)) opciones.push(servicio);

  let estado = '', bloqueo = '';
  if (servicio === 'clase') {
    if (!c.cubierto && !a.mia) {
      bloqueo = `<div class="blocked"><b>${c.hastaPagado ? `Tu plan cubre hasta el ${fechaDia(c.hastaPagado, { day: 'numeric', month: 'long' })}` : 'Aún no tienes un plan'}</b>
        <p class="muted small">${c.hastaPagado ? 'Renuévalo y agenda este día al tiro.' : 'Elige tus clases al mes y agenda al tiro.'}</p>
        ${u.plan ? `<button class="btn block" data-buy="plan${u.plan}" style="margin-top:12px"><span>Renovar · ${clp(u.planMonto)}</span></button>` : ''}
        <a class="btn ${u.plan ? 'ghost' : ''} block" href="#/planes" style="margin-top:10px"><span>Ver planes</span></a></div>`;
    } else {
      const usadas = c.usadas + (a.mia ? 1 : 0);
      estado = `<div class="quota">
        <div class="bar"><i style="width:${Math.min(100, (usadas / c.clases) * 100)}%"></i></div>
        <p class="small"><b>${a.mia ? `Con esta llevas ${usadas} de ${c.clases}` : c.quedan ? `Te ${c.quedan === 1 ? 'queda' : 'quedan'} ${c.quedan} de ${c.clases} clases` : `Usaste tus ${c.clases} clases`}</b> <span class="muted">· hasta el ${fechaDia(c.hasta, { day: 'numeric', month: 'short' })}</span></p></div>`;
      if (!a.mia && !c.quedan) bloqueo = `<div class="blocked"><b>No te quedan clases en este mes de tu plan</b>
        <a class="btn block" href="#/planes" style="margin-top:12px"><span>Comprar más clases</span></a></div>`;
    }
  } else {
    estado = `<div class="quota"><p class="small"><b>${a.mia ? 'Tu sesión' : sesiones ? `Tienes ${sesiones} ${sesiones === 1 ? 'sesión' : 'sesiones'} por agendar` : 'Sesión individual'}</b> <span class="muted">· ${esc(sv.nombre)} · ${clp(sv.precio)}</span></p></div>`;
    if (!a.mia && !sesiones) bloqueo = `<div class="blocked"><b>Paga la sesión y agéndala</b>
      <button class="btn block" data-buy="${servicio}" style="margin-top:12px"><span>Pagar ${clp(sv.precio)}</span></button></div>`;
  }

  openSheet(`
    <p class="kicker">Agendar</p>
    <h2 class="h-m" style="margin-top:8px">${esc(titulo)}</h2>
    ${opciones.length > 1 && !fijo ? `<div class="seg" style="margin-bottom:12px">${opciones.map((k) => `<button data-serv="${k}" class="${k === servicio ? 'on' : ''}">${esc(servNombre(k))}</button>`).join('')}</div>` : ''}
    ${estado}
    ${bloqueo || (a.horas.length ? `<div class="slots">${a.horas.map((h) => `<button data-h="${h.hora}" class="${a.mia === h.hora ? 'on' : ''}" ${h.ocupada || (a.mia && !a.cancelable && a.mia !== h.hora) ? 'disabled' : ''}><b class="num">${h.hora}</b><small>${a.mia === h.hora ? 'tu hora' : h.ocupada ? 'ocupada' : servicio !== 'clase' ? 'libre' : h.n ? h.n + (h.n === 1 ? ' agendado' : ' agendados') : 'libre'}</small></button>`).join('')}</div>`
      : '<div class="empty">Ya no quedan horas para este día.</div>')}
    ${a.mia ? `<button class="btn ghost block" id="cancel" style="margin-top:14px" ${a.cancelable ? '' : 'disabled'}><span>Cancelar mi hora</span></button>
      <p class="muted small" style="text-align:center;margin-top:8px">${a.cancelable ? `Máximo ${a.cancelMin} min antes ${servicio === 'clase' ? 'de la clase' : 'de la sesión'}` : `Ya no se puede cancelar: es máximo ${a.cancelMin} min antes`}</p>`
      : !bloqueo && servicio === 'clase' ? `<p class="muted small" style="text-align:center;margin-top:12px">Si agendas este día te ${c.quedan - 1 === 1 ? 'queda' : 'quedan'} ${Math.max(0, c.quedan - 1)}. Puedes cancelar hasta ${a.cancelMin} min antes.</p>`
      : !bloqueo ? `<p class="muted small" style="text-align:center;margin-top:12px">Puedes cancelar o cambiar la hora hasta ${a.cancelMin} min antes.</p>` : ''}
    <p class="err" id="err"></p>`, (el) => {
    $$('[data-serv]', el).forEach((b) => (b.onclick = () => agendarSheet(day, onDone, b.dataset.serv)));
    $$('[data-buy]', el).forEach((b) => (b.onclick = () => pagarItem(b.dataset.buy, b)));
    $$('[data-h]', el).forEach((b) => (b.onclick = async () => {
      if (b.dataset.h === a.mia) return closeSheet();
      try {
        await api('/api/me/reserva', { method: 'POST', body: { day, hora: b.dataset.h, servicio } });
        closeSheet(); toast(`${servNombre(servicio)}: ${fechaDia(day, { weekday: 'long' })} ${b.dataset.h} ✓`); onDone && onDone();
      } catch (err) { $('#err', el).textContent = err.message; }
    }));
    const cn = $('#cancel', el);
    if (cn) cn.onclick = async () => {
      try { await api(`/api/me/reserva?day=${day}&servicio=${servicio}`, { method: 'DELETE' }); closeSheet(); toast('Hora cancelada'); onDone && onDone(); }
      catch (err) { $('#err', el).textContent = err.message; }
    };
  });
}

function informarSheet(onDone) {
  const u = state.user;
  openSheet(`
    <h2 class="h-m">Informar transferencia</h2>
    <p class="muted small">Sube la captura del comprobante. Seba la confirma con un toque.</p>
    <label class="field" style="margin-top:14px"><span>Monto</span><input class="input" id="monto" inputmode="numeric" value="${u.planMonto || ''}"></label>
    <label class="pizarra-drop" style="margin-top:14px;min-height:130px" id="drop">${ICON.camera}<b>Foto o captura del comprobante</b><span class="muted small" id="fname">Toca para elegir</span><input type="file" accept="image/*" id="file"></label>
    <button class="btn block" id="send" style="margin-top:14px" disabled><span>Enviar</span></button>
    <p class="err" id="err"></p>`, (el) => {
    let dataUrl = null;
    $('#file', el).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      dataUrl = await imageToDataUrl(f, 1100, 0.8);
      $('#fname', el).textContent = f.name;
      $('#drop', el).style.backgroundImage = `url(${dataUrl})`;
      $('#drop', el).style.backgroundSize = 'cover';
      $('#send', el).disabled = false;
    };
    $('#send', el).onclick = async () => {
      try {
        await api('/api/me/pago', { method: 'POST', body: { amount: +$('#monto', el).value.replace(/\D/g, ''), receipt: dataUrl } });
        closeSheet(); toast('Listo. Seba lo confirma en un rato.'); onDone && onDone();
      } catch (err) { $('#err', el).textContent = err.message; }
    };
  });
}

/** One line about payment: quiet when it's paid, a button when it's due. */
function payStrip(r, u) {
  if (!u.plan) return `<a class="pay-strip warn" href="#/planes"><div class="grow"><b>Elige tus clases al mes</b><span class="muted small">Paga con Mercado Pago y agenda al tiro</span></div><span class="lime">→</span></a>`;
  if (r.estado === 'al_dia') return `<p class="pay-line muted small">${ICON.check}Pagado hasta el ${fecha(r.pagadoHasta, { day: 'numeric', month: 'long' })}</p>`;
  if (r.estado === 'por_confirmar') return `<p class="pay-line small"><span class="chip info">Por confirmar</span> Seba está confirmando tu transferencia</p>`;
  const txt = r.estado === 'vencido' ? 'Tu plan venció' : r.estado === 'por_vencer' ? `Vence el ${fecha(r.pagadoHasta, { day: 'numeric', month: 'long' })}` : 'Aún no hay pagos';
  return `<div class="pay-strip ${r.estado === 'vencido' ? 'bad' : 'warn'}">
      <div class="grow"><b>${txt}</b>${r.pendientes === 0 ? '<button class="small muted" id="informar">Ya transferí · subir comprobante</button>' : ''}</div>
      ${state.config.mercadoPago ? `<button class="btn sm" id="mp-pay"><span>Renovar ${clp(u.planMonto)}</span></button>` : ''}
    </div>`;
}

async function viewHome() {
  setShell({ tab: 'home', fit: true });
  await loadMe();
  if (!state.user || state.user.role !== 'alumno') return render(); // the session changed under us
  const u = state.user, r = state.resumen;
  const [hist, sem] = await Promise.all([api('/api/me/historial'), api('/api/semana').catch(() => ({}))]);
  const fui = new Set(hist.checkins.map((c) => c.day));
  const reservas = new Map((hist.reservas || []).filter((x) => x.servicio === 'clase').map((x) => [x.day, x.hora]));
  const sesiones = (hist.reservas || []).filter((x) => x.servicio !== 'clase');
  const plan = sem.week && sem.week.plan;
  const idx = miDiaIdx(plan, r);
  const dia = plan && plan.dias[idx];
  const c = r.creditos;
  const kicker = r.hoyAt ? `Adentro · ${hora(r.hoyAt)}` : r.reservaHoy ? `Hoy a las ${r.reservaHoy}` : 'Tu próximo entrenamiento';
  view.innerHTML = `
    <div class="home-top">
      <h1 class="h-l">Hola, <span class="lime">${esc(firstName(u.name))}</span></h1>
      ${c.cubierto ? `<a class="wk" href="#/planes"><div class="credit"><b class="num">${c.quedan}</b><small>${c.quedan === 1 ? 'clase' : 'clases'}<br>disponibles</small></div><div class="bar"><i style="width:${Math.min(100, (c.usadas / c.clases) * 100)}%"></i></div><small class="muted">${c.usadas} de ${c.clases} · hasta el ${fechaDia(c.hasta, { day: 'numeric', month: 'short' })}</small></a>`
        : `<a class="chip warn" href="#/planes">Sin clases · ver planes</a>`}
    </div>
    ${dia ? `
      <a class="card today-card ${r.hoyAt ? 'done' : ''}" href="#/semana?dia=${idx + 1}">
        <div class="row between"><span class="kicker">${kicker}</span><span class="lime">→</span></div>
        <div class="row" style="align-items:flex-end;gap:12px;margin-top:8px"><span class="h-xl dia-n">${esc(dia.dia)}</span></div>
        <p class="h-s" style="margin-top:6px">${esc(dia.foco)}</p>
        <p class="muted small" style="margin-top:4px">${roundsTxt(dia)}</p>
      </a>` : ''}
    ${r.hoyAt ? '' : `<div class="checkin-strip">${ICON.qr}<div class="grow"><b>Al llegar, escanea el QR</b></div>${state.config.demoDoor ? `<a class="chip dim" href="#/checkin/${encodeURIComponent(state.config.demoDoor)}">simular</a>` : ''}</div>`}
    ${sesiones.map((x) => `<button class="sesion-strip" data-ses="${x.day}|${x.servicio}"><b>${esc(servNombre(x.servicio))}</b><span class="muted small">${fechaDia(x.day, { weekday: 'long', day: 'numeric' })} · ${x.hora}</span><span class="lime">→</span></button>`).join('')}
    ${Object.entries(r.servicios || {}).map(([k, n]) => `<button class="sesion-strip todo" data-ses="${proximosDias(1)[0]}|${k}"><b>${esc(servNombre(k))}</b><span class="muted small">${n === 1 ? 'Pagada · falta agendarla' : n + ' pagadas · falta agendarlas'}</span><span class="chip ok">Agendar</span></button>`).join('')}
    <div class="home-cal">
      <div class="section-h"><h2 class="h-s">${fecha(Date.now(), { month: 'long' })} <span class="lime num">· ${r.clasesMes} ${r.clasesMes === 1 ? 'clase' : 'clases'}</span></h2><span class="muted small">Toca un día para agendar</span></div>
      ${monthCal(fui, dayOf(), { reservas, agendar: true })}
    </div>
    ${payStrip(r, u)}`;
  $$('[data-agendar]').forEach((b) => (b.onclick = () => agendarSheet(b.dataset.agendar, render)));
  $$('[data-ses]').forEach((b) => (b.onclick = () => { const [d, k] = b.dataset.ses.split('|'); agendarSheet(d, render, k); }));
  const b = $('#informar');
  if (b) b.onclick = () => informarSheet(() => render());
  const mp = $('#mp-pay');
  if (mp) mp.onclick = () => goToMp('/api/comprar', mp, { item: 'plan' + u.plan });
}

/**
 * Calendario: one calendar for everything they can book. The dropdown picks what (classes or a service);
 * the calendar shows when they came / what they booked, and tapping a day books it (paying first if needed).
 */
async function viewCalendario(params) {
  setShell({ tab: 'hist' });
  await loadMe();
  const u = state.user, r = state.resumen;
  const h = await api('/api/me/historial');
  const servs = state.config.servicios;
  let serv = params.get('servicio') || sessionStorage.getItem('cal_serv') || 'clase';
  if (serv !== 'clase' && !servs[serv]) serv = 'clase';
  const today = dayOf();
  const firstOf = (d) => d.slice(0, 8) + '01';
  const shiftMonth = (d, k) => { const x = new Date(firstOf(d) + 'T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + k); return x.toISOString().slice(0, 10); };
  const minMonth = shiftMonth(today, -5), maxMonth = firstOf(addDays(today, state.config.agendaDias || 30));
  let month = firstOf(today);
  const fui = new Set(h.checkins.map((c) => c.day));
  const proximas = (h.reservas || []).filter((x) => x.day > today || (x.day === today && !(x.servicio === 'clase' && fui.has(x.day))));

  function estadoServ() {
    if (serv === 'clase') {
      const c = r.creditos;
      return c.cubierto
        ? `<b class="lime">${c.quedan}</b> ${c.quedan === 1 ? 'clase disponible' : 'clases disponibles'} <span class="muted">· ${c.usadas} de ${c.clases} · hasta el ${fechaDia(c.hasta, { day: 'numeric', month: 'short' })}</span>`
        : `<span class="muted">Sin clases disponibles ·</span> <a class="lime" href="#/planes">ver planes</a>`;
    }
    const n = (r.servicios || {})[serv] || 0;
    return n ? `<b class="lime">${n}</b> ${n === 1 ? 'sesión pagada' : 'sesiones pagadas'} <span class="muted">· falta agendar</span>`
      : `<span class="muted">${clp(servs[serv].precio)} la sesión · pagas al agendar</span>`;
  }

  function draw() {
    const res = new Map((h.reservas || []).filter((x) => x.servicio === serv).map((x) => [x.day, x.hora]));
    const vine = serv === 'clase' ? fui : new Set();
    const nMes = serv === 'clase' ? h.checkins.filter((c) => c.day.slice(0, 7) === month.slice(0, 7)).length : 0;
    view.innerHTML = `
      <h1 class="h-l">Calendario</h1>
      <label class="select-wrap" style="margin-top:14px">
        <select id="serv" class="select">
          <option value="clase" ${serv === 'clase' ? 'selected' : ''}>Clases</option>
          ${Object.entries(servs).map(([k, s]) => `<option value="${k}" ${serv === k ? 'selected' : ''}>${esc(s.nombre)}${(r.servicios || {})[k] ? ' · por agendar' : ''}</option>`).join('')}
        </select>
      </label>
      <p class="small serv-estado">${estadoServ()}</p>
      <div class="cal-nav">
        <button id="prev" ${month <= minMonth ? 'disabled' : ''} aria-label="Mes anterior">‹</button>
        <h2 class="h-s">${fechaDia(month, { month: 'long', year: 'numeric' })}${serv === 'clase' ? ` <span class="lime num">· ${nMes} ${nMes === 1 ? 'clase' : 'clases'}</span>` : ''}</h2>
        <button id="next" ${month >= maxMonth ? 'disabled' : ''} aria-label="Mes siguiente">›</button>
      </div>
      ${monthCal(vine, month, { reservas: res, agendar: true })}
      <div class="cal-legend small muted">${serv === 'clase' ? '<span><i class="on"></i>Viniste</span>' : ''}<span><i class="res"></i>Agendado</span><span>Toca un día para agendar</span></div>
      <div class="section">
        <div class="section-h"><h2 class="h-s">Próximas</h2></div>
        <div class="card list">${proximas.length ? proximas.map((x) => `
          <button class="item prox" data-prox="${x.day}|${x.servicio}"><div class="grow"><b>${esc(servNombre(x.servicio))}</b><div class="muted small">${fechaDia(x.day, { weekday: 'long', day: 'numeric', month: 'long' })}</div></div><span class="h-s num">${x.hora}</span><span class="lime">→</span></button>`).join('')
          : '<div class="empty">No tienes nada agendado.</div>'}</div>
      </div>
      <div class="section">
        <div class="section-h"><h2 class="h-s">Tus pagos</h2></div>
        <div class="card list">
          ${h.pagos.length ? h.pagos.map((p) => `
            <div class="item">
              <div class="grow"><b class="num">${clp(p.amount)}</b> <span class="small">${esc(conceptoPago(p))}</span><div class="muted small">${fecha(p.paid_at, { day: 'numeric', month: 'long', year: 'numeric' })} · ${METHOD_LBL[p.method]}</div></div>
              ${p.status === 'por_confirmar' ? '<span class="chip info">Por confirmar</span>' : '<span class="chip ok">Pagado</span>'}
            </div>`).join('') : '<div class="empty">Aún no hay pagos registrados.</div>'}
        </div>
      </div>`;
    $('#serv').onchange = (e) => { serv = e.target.value; sessionStorage.setItem('cal_serv', serv); draw(); };
    $('#prev').onclick = () => { month = shiftMonth(month, -1); draw(); };
    $('#next').onclick = () => { month = shiftMonth(month, 1); draw(); };
    // The dropdown already says what's being booked: no switch inside the sheet.
    $$('[data-agendar]').forEach((b) => (b.onclick = () => agendarSheet(b.dataset.agendar, render, serv, { fijo: true })));
    $$('[data-prox]').forEach((b) => (b.onclick = () => { const [d, k] = b.dataset.prox.split('|'); agendarSheet(d, render, k, { fijo: true }); }));
  }
  draw();
}

async function viewCheckin(door) {
  setShell({ tabbar: false, fit: true });
  if (!state.user) return go(`#/entrar?next=${encodeURIComponent('#/checkin/' + encodeURIComponent(door))}`);
  view.innerHTML = '<div class="spinner"></div>';
  let r;
  try {
    r = await api('/api/checkin', { method: 'POST', body: { door } });
  } catch (err) {
    view.innerHTML = `<div class="empty" style="padding-top:80px"><p class="h-m" style="color:var(--white)">${esc(err.message)}</p><br><a class="btn dark sm" href="#/"><span>Volver</span></a></div>`;
    return;
  }
  state.resumen = r.resumen;
  const sem = await api('/api/semana').catch(() => ({}));
  const plan = sem.week && sem.week.plan;
  const idx = miDiaIdx(plan, r.resumen);
  const dia = plan && plan.dias[idx];
  if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
  view.innerHTML = `
    <section class="checkin-ok">
      <div class="ck-top">
        <div class="check-badge"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19.5 7"/></svg></div>
        <div>
          <h1 class="h-l">${r.nuevo ? 'Adentro' : 'Ya estás'}</h1>
          <p class="meta"><b>${esc(firstName(r.user.name))}</b> · ${hora(r.at)} · clase n.º ${r.resumen.clasesMes} en ${fecha(Date.now(), { month: 'long' })}</p>
        </div>
      </div>
      ${r.resumen.estado === 'vencido' ? `<p class="small" style="margin-top:10px;color:var(--amber)">Tu pago está vencido. Puedes pagarlo desde Inicio.</p>` : ''}
      ${dia ? `
        <div class="ck-dia">
          <p class="kicker">Hoy te toca</p>
          <div class="row" style="align-items:baseline;gap:12px;margin-top:4px"><h2 class="h-xl dia-n">${esc(dia.dia)}</h2><span class="h-s">${esc(dia.foco)}</span></div>
          ${diaHtml(dia, 'gimnasio', true)}
        </div>` : ''}
      <a class="btn ghost block" href="#/" style="margin-top:16px"><span>Listo</span></a>
    </section>`;
}

/** Ask the server for a Mercado Pago link and go there (same tab, so the return lands back here). */
async function goToMp(endpoint, btn, body) {
  if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Abriendo Mercado Pago…'; }
  try {
    const r = await api(endpoint, { method: 'POST', body });
    location.href = r.url;
  } catch (err) {
    toast(err.message, 4000);
    if (btn) { btn.disabled = false; render(); }
  }
}

/** Back from Mercado Pago. If it's paid, go straight to "¿cuándo vienes?". */
async function viewPagoVuelta(estado, params) {
  setShell({ tabbar: false, fit: true });
  await loadMe().catch(() => {});
  const t = params.get('t') || '';
  const semana = t === 'semana';
  const servicio = state.config.servicios[t] ? t : null;
  const esPlan = /^plan\d?$/.test(t);
  const ok = estado === 'approved';
  const pend = estado === 'pending' || estado === 'in_process';
  const c = state.resumen && state.resumen.creditos;
  const agendar = ok && state.user && state.user.role === 'alumno' && (servicio || esPlan);
  let detalle = '';
  if (ok && esPlan && c && c.cubierto) detalle = `Tienes <b class="lime">${c.quedan} clases</b> hasta el ${fechaDia(c.hasta, { day: 'numeric', month: 'long' })}.`;
  else if (ok && servicio) detalle = `Tu sesión de ${esc(servNombre(servicio).toLowerCase())} está pagada.`;
  else if (ok && semana) detalle = 'Ya tienes toda la semana de Endémico.';
  else if (ok) detalle = 'Quedó registrado. Seba no tiene que anotar nada.';
  view.innerHTML = `
    <section class="checkin-ok vuelta" style="${ok ? '' : 'background:none'}">
      ${ok ? `<div class="check-badge"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19.5 7"/></svg></div>` : ''}
      <p class="kicker">Mercado Pago</p>
      <h1 class="h-xl" style="margin-top:8px">${ok ? 'Pagado' : pend ? 'En proceso' : 'No se pagó'}</h1>
      <p class="meta">${ok ? detalle : pend ? 'Mercado Pago está procesando el pago. Te aparece apenas se confirme.' : 'No se completó el pago. Puedes intentarlo de nuevo.'}</p>
      ${agendar ? `
        <p class="h-m" style="margin-top:24px">¿Cuándo <span class="lime">vienes?</span></p>
        <div class="dias-chips">${proximosDias(6).map((d) => `<button data-dia="${d}"><small>${fechaDia(d, { weekday: 'short' })}</small><b>${+d.slice(8)}</b></button>`).join('')}</div>` : ''}
      <a class="btn ${ok && !agendar ? '' : 'dark'} block" href="${semana ? '#/semana' : ok ? '#/' : '#/planes'}" style="margin-top:22px"><span>${semana ? 'Ver la semana' : ok ? (agendar ? 'Después' : 'Ir al inicio') : 'Volver a planes'}</span></a>
    </section>`;
  $$('[data-dia]').forEach((b) => (b.onclick = () => agendarSheet(b.dataset.dia, () => go('#/'), servicio || 'clase')));
}

/* ------------------------------------------------------------------ weekly workout */

const MODES = [['gimnasio', 'Gimnasio'], ['mancuernas', 'Mancuernas'], ['sin_equipo', 'Sin equipo']];

/** One day of the plan: each block (Warmup, Serie 1, Serie 2) with its rounds (x4, x3) on top. */
function diaHtml(d, mode, compact = false) {
  return d.bloques.map((b) => `
    <div class="bloque ${compact ? 'compact' : ''}">
      <div class="bloque-h">${b.formato ? `<span class="rounds">${esc(b.formato)}</span>` : ''}<h3 class="h-s">${esc(b.nombre)}</h3></div>
      ${b.ejercicios.map((e, i) => {
        const name = mode === 'gimnasio' ? e.nombre : e[mode] || e.nombre;
        const sub = !compact && mode !== 'gimnasio' && name !== e.nombre ? `En el gimnasio: ${e.nombre}` : '';
        // Technique notes belong to the exercise Seba wrote; only show them when it's that same exercise.
        const nota = !compact && e.nota && (name === e.nombre || e.nota === 'no se lee bien') ? e.nota : '';
        return `<div class="ej"><span class="n">${i + 1}</span><div class="t"><b>${esc(name)}</b>${nota ? `<small class="${nota === 'no se lee bien' ? 'warn' : ''}">${esc(nota)}</small>` : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</div><span class="dose">${esc(e.dosis)}</span></div>`;
      }).join('')}
    </div>`).join('');
}

async function viewSemana(params = new URLSearchParams()) {
  const u = state.user;
  setShell({ tab: 'semana' });
  const r = await api('/api/semana');
  if (!r.week) { view.innerHTML = '<div class="empty">Seba todavía no sube la pizarra de esta semana.</div>'; return; }
  const plan = r.week.plan;
  // Members land on the day they have to do; ?dia=N opens a given day.
  const mio = u && u.role === 'alumno' && state.resumen ? miDiaIdx(plan, state.resumen) : -1;
  let dayIdx = +params.get('dia') > 0 ? Math.min(plan.dias.length, +params.get('dia')) - 1 : Math.max(0, mio);
  if (!r.full && plan.dias[dayIdx].bloqueado) dayIdx = 0;
  let mode = localStorage.getItem('en_mode') || (u && u.role === 'alumno' ? 'gimnasio' : 'mancuernas');
  const ws = r.week.weekStart;
  const wsEnd = new Date(ws + 'T12:00:00Z'); wsEnd.setUTCDate(wsEnd.getUTCDate() + 5);

  function draw() {
    const d = plan.dias[dayIdx];
    view.innerHTML = `
      <div class="semana-head">
        <div class="row between"><span class="kicker">Semana del ${fechaDia(ws)} al ${fecha(wsEnd)}</span>${r.week.source === 'foto' ? '<span class="chip dim">desde la pizarra</span>' : ''}</div>
        <h1 class="h-m">El entrenamiento <span class="lime">de la semana</span></h1>
      </div>
      <div class="seg" style="margin-top:14px">${MODES.map(([k, l]) => `<button data-mode="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="days">${plan.dias.map((x, i) => `<button data-day="${i}" class="${i === dayIdx ? 'on' : ''} ${i === mio ? 'mine' : ''}"><b>${esc(x.dia)}${x.bloqueado ? ' <span class="lock">🔒</span>' : ''}</b><small>${i === mio ? 'te toca' : esc(x.foco)}</small></button>`).join('')}</div>
      <p class="dia-foco">${esc(d.foco)}</p>
      ${d.bloqueado ? lockedCard() : diaHtml(d, mode)}
      ${!r.full && !d.bloqueado ? lockedCard(true) : ''}
      ${plan.nota ? `<p class="muted small slashes" style="margin-top:18px">${esc(plan.nota)}</p>` : ''}
      ${!u ? `<p class="muted small" style="text-align:center;margin-top:22px">¿Entrenas en Endémico? <a class="lime" href="#/entrar?next=%23%2Fsemana">Entra con tu número</a></p>` : ''}`;
    $$('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; localStorage.setItem('en_mode', mode); draw(); }));
    $$('[data-day]').forEach((b) => (b.onclick = () => { dayIdx = +b.dataset.day; draw(); }));
    $$('[data-sub]').forEach((b) => (b.onclick = subscribe));
  }

  function lockedCard(teaser = false) {
    return `<div class="locked">
      <p class="kicker">${teaser ? `El ${esc(plan.dias[0].dia)} es gratis` : 'Solo suscriptores'}</p>
      <p class="h-m">Toda la semana de Endémico,<br><span class="lime">desde donde estés</span></p>
      <p class="muted small">Con gimnasio, mancuernas o sin nada.</p>
      <div class="price">${clp(state.config.semanaPrecio)}<span class="h-s muted"> /30 días</span></div>
      <button class="btn block" data-sub style="margin-top:14px"><span>Pagar con Mercado Pago</span></button>
    </div>`;
  }

  async function subscribe(e) {
    if (!state.user) return go('#/entrar?intent=remoto&next=%23%2Fsemana');
    if (state.user.role !== 'remoto') return toast('Ya lo tienes incluido.');
    if (!state.config.mercadoPago) return toast('Falta conectar Mercado Pago.', 3000);
    goToMp('/api/semana/mp', e && e.currentTarget);
  }

  draw();
}

/* ------------------------------------------------------------------ planes: buy and book */

/** Everything for sale, from their "Nuestros Planes" post. */
function itemInfo(item) {
  const cfg = state.config;
  const pm = item.match(/^plan([1-5])$/);
  if (pm) {
    const n = +pm[1], clases = n * cfg.clasesPorVez;
    return { titulo: `${clases} clases al mes`, sub: `${n} ${n === 1 ? 'vez' : 'veces'} por semana`, precio: cfg.planes[n],
      puntos: [`${clases} clases para usar en 30 días`, 'Agendas tus horas en el calendario', 'Cancelas hasta 30 min antes y la clase vuelve', 'Incluye el entrenamiento de la semana'] };
  }
  if (cfg.servicios[item]) {
    const s = cfg.servicios[item];
    return { titulo: s.nombre, sub: '1 sesión', precio: s.precio, puntos: ['Pagas y eliges el día y la hora al tiro', 'Cancelas o cambias hasta 30 min antes'] };
  }
  return { titulo: 'El entrenamiento de la semana', sub: 'Online · 30 días', precio: cfg.semanaPrecio, puntos: ['La pizarra de Seba, cada semana', 'Con gimnasio, mancuernas o sin nada'] };
}

function compraSheet(item) {
  const i = itemInfo(item);
  const u = state.user;
  openSheet(`
    <p class="kicker">${esc(i.sub)}</p>
    <h2 class="h-m" style="margin-top:8px">${esc(i.titulo)}</h2>
    <div class="price-big">${clp(i.precio)}</div>
    <ul class="puntos">${i.puntos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    <button class="btn block" id="pagar" style="margin-top:16px"><span>${u ? `Pagar ${clp(i.precio)}` : 'Entrar y pagar'}</span></button>
    <p class="muted small" style="text-align:center;margin-top:10px">Pagas con Mercado Pago${u ? '' : ' (te pedimos tu número primero)'} y vuelves aquí a agendar.</p>`, (el) => {
    $('#pagar', el).onclick = (e) => pagarItem(item, e.currentTarget);
  });
}

async function viewPlanes(params) {
  setShell({ tab: 'planes' });
  const u = state.user;
  if (u && u.role === 'alumno') await loadMe();
  const r = state.resumen;
  const cfg = state.config;
  const alumno = u && u.role === 'alumno';
  const c = alumno && r ? r.creditos : null;
  view.innerHTML = `
    <p class="kicker">Nuestros planes</p>
    <h1 class="h-l" style="margin-top:8px">Invierte en <span class="lime">tu rendimiento</span></h1>
    ${c && c.cubierto ? `<div class="card mi-plan"><div class="grow"><span class="kicker">Tu plan</span><p class="h-s" style="margin-top:6px">${u.plan * cfg.clasesPorVez} clases al mes</p><p class="muted small">Te ${c.quedan === 1 ? 'queda' : 'quedan'} ${c.quedan} · hasta el ${fechaDia(c.hasta, { day: 'numeric', month: 'long' })}</p></div><button class="btn sm" data-buy="plan${u.plan}"><span>Renovar</span></button></div>` : ''}
    <div class="section-h" style="margin-top:22px"><h2 class="h-s">Clases al mes</h2><span class="muted small">Agendas cuando quieras</span></div>
    <div class="planes-grid">${[1, 2, 3, 4, 5].map((n) => {
      const clases = n * cfg.clasesPorVez;
      const mio = alumno && u.plan === n;
      return `<button class="plan-card ${mio ? 'mine' : ''}" data-item="plan${n}">
        ${mio ? '<span class="tag">Tu plan</span>' : ''}
        <b class="clases">${clases}</b><span class="lbl">clases al mes</span>
        <span class="muted small">${n} ${n === 1 ? 'vez' : 'veces'} por semana</span>
        <span class="precio">${clp(cfg.planes[n])}</span>
        <span class="muted small">${clp(Math.round(cfg.planes[n] / clases))} la clase</span>
      </button>`;
    }).join('')}</div>
    <div class="section-h" style="margin-top:22px"><h2 class="h-s">Sesiones</h2><span class="muted small">Pagas y agendas</span></div>
    <div class="card list">${Object.entries(cfg.servicios).map(([k, s]) => {
      const tengo = alumno && r && r.servicios && r.servicios[k];
      return `<div class="item"><div class="grow"><b>${esc(s.nombre)}</b><div class="muted small">${tengo ? `Tienes ${tengo} por agendar` : '1 sesión'}</div></div>
        <span class="h-s num">${clp(s.precio)}</span>
        ${tengo ? `<button class="btn sm dark" data-agendar-serv="${k}"><span>Agendar</span></button>` : `<button class="btn sm" data-item="${k}"><span>Pagar</span></button>`}</div>`;
    }).join('')}</div>
    ${alumno ? '' : `<div class="section-h" style="margin-top:22px"><h2 class="h-s">Online</h2></div>
      <button class="card online" data-item="semana"><div class="grow"><b>El entrenamiento de la semana</b><div class="muted small">Desde donde estés · 30 días</div></div><span class="h-s num">${clp(cfg.semanaPrecio)}</span></button>`}
    <p class="muted small" style="margin-top:20px;text-align:center">Lunes a viernes 07–12 y 15–21 · Sábado 09–12<br>Camino Línea Nueva, Llanquihue</p>`;
  $$('[data-item]').forEach((b) => (b.onclick = () => compraSheet(b.dataset.item)));
  $$('[data-buy]').forEach((b) => (b.onclick = () => compraSheet(b.dataset.buy)));
  $$('[data-agendar-serv]').forEach((b) => (b.onclick = () => go(`#/calendario?servicio=${b.dataset.agendarServ}`)));
  // Coming back from logging in to pay: open what they were buying.
  const want = params.get('comprar');
  if (want && u) { history.replaceState(null, '', '#/planes'); compraSheet(want); }
}

/* ------------------------------------------------------------------ coach */

function waTo(phone, text) { return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`; }

async function viewCoachHoy() {
  setShell({ tab: 'hoy' });
  let seen = null;
  async function load() {
    const d = await api('/api/coach/hoy');
    const fresh = new Set(seen ? d.checkins.filter((c) => !seen.has(c.id)).map((c) => c.id) : []);
    seen = new Set(d.checkins.map((c) => c.id));
    view.innerHTML = `
      <div class="row between"><p class="kicker">${fechaDia(d.hoy, { weekday: 'long', day: 'numeric', month: 'long' })}</p><span class="row small muted" style="gap:6px"><span class="live-dot"></span>en vivo</span></div>
      <div class="counter"><div class="big num">${d.checkins.length}</div><div class="lbl">vinieron<br><span class="lime">hoy</span></div></div>
      <div class="quick">
        <a href="#/coach/semana">${ICON.camera}<span>Foto de la pizarra</span></a>
        <a href="#/puerta">${ICON.qr}<span>QR de la puerta</span></a>
      </div>
      ${d.porConfirmar.length ? `
        <div class="section"><div class="alert-h"><span class="chip info">${d.porConfirmar.length}</span> Transferencias por confirmar</div>
        <div class="card list" style="margin-top:10px">${d.porConfirmar.map((p) => `
          <div class="item"><div class="avatar">${initials(p.name)}</div><div class="grow"><b>${esc(p.name)}</b><div class="muted small">${clp(p.amount)} · ${fecha(p.paid_at)}</div></div>
          <button class="btn dark sm" data-ver="${p.id}"><span>Ver</span></button><button class="btn sm" data-ok="${p.id}"><span>✓</span></button></div>`).join('')}</div></div>` : ''}
      ${d.agendados.length ? `
        <div class="section">
          <div class="section-h"><h2 class="h-s">Agendados hoy</h2><span class="muted small">${d.agendados.length} personas</span></div>
          <div class="card list">${Object.entries(d.agendados.reduce((g, x) => ((g[x.hora] ||= []).push(x), g), {})).map(([h, xs]) => `
            <div class="item agenda-row"><b class="h-s num">${h}</b><div class="grow">${xs.map((x) => `<a href="#/coach/alumnos/${x.user_id}" class="chip ${x.servicio !== 'clase' ? 'info' : x.vino_at ? 'ok' : 'dim'}">${x.servicio !== 'clase' ? esc(servNombre(x.servicio)) + ' · ' : ''}${x.vino_at ? '✓ ' : ''}${esc(firstName(x.name))} ${esc((x.name.split(' ')[1] || '').slice(0, 1))}${x.name.split(' ')[1] ? '.' : ''}</a>`).join('')}</div><span class="muted small">${xs.length}</span></div>`).join('')}</div>
        </div>` : ''}
      <div class="section">
        <div class="section-h"><h2 class="h-s">Check-ins de hoy</h2><span class="muted small">${d.totalActivos} alumnos activos</span></div>
        <div class="card list" id="today-list">${d.checkins.length ? d.checkins.map((c) => `
          <a class="item ${fresh.has(c.id) ? 'fresh' : ''}" href="#/coach/alumnos/${c.user_id}"><div class="avatar">${initials(c.name)}</div><div class="grow"><b>${esc(c.name)}</b><div class="muted small">${planLbl(c.plan)}${c.source === 'coach' ? ' · lo marcaste tú' : ''}</div></div><span class="h-s num">${hora(c.at)}</span></a>`).join('') : '<div class="empty">Todavía nadie. El primero que escanee aparece aquí.</div>'}</div>
      </div>
      ${d.ausentes.length ? `
        <div class="section"><div class="alert-h">No han venido en 10 días</div>

        <div class="card list" style="margin-top:10px">${d.ausentes.map((a) => `
          <div class="item"><div class="avatar">${initials(a.name)}</div><div class="grow"><b>${esc(a.name)}</b><div class="muted small">Última vez: hace ${a.diasSinVenir} días</div></div>
          <a class="btn wa sm" target="_blank" rel="noopener" href="${waTo(a.phone, `Hola ${firstName(a.name)}! Te echamos de menos en Endémico 💪 ¿Todo bien? Te esperamos esta semana.`)}"><span>Escribir</span></a></div>`).join('')}</div></div>` : ''}
      ${d.vencidos.length ? `
        <div class="section"><div class="alert-h">Pagos</div>
        <div class="card list" style="margin-top:10px">${d.vencidos.map((a) => `
          <div class="item"><div class="avatar">${initials(a.name)}</div><div class="grow"><b>${esc(a.name)}</b><div class="muted small">${a.pagadoHasta ? 'Pagado hasta ' + fecha(a.pagadoHasta) : 'Sin pagos'}</div></div>
          ${state.config.mercadoPago ? `<button class="btn sm" data-link="${a.id}"><span>Link</span></button>` : estadoChip(a.estado)}<button class="btn dark sm" data-pagar="${a.id}"><span>Pagó</span></button></div>`).join('')}</div></div>` : ''}`;
    $$('[data-ok]').forEach((b) => (b.onclick = async () => { await api(`/api/coach/pagos/${b.dataset.ok}/confirmar`, { method: 'POST' }); toast('Pago confirmado ✓'); load(); }));
    $$('[data-ver]').forEach((b) => (b.onclick = () => verComprobante(+b.dataset.ver, load)));
    $$('[data-pagar]').forEach((b) => (b.onclick = () => { const a = d.vencidos.find((x) => x.id === +b.dataset.pagar); pagoSheet(a, load); }));
    $$('[data-link]').forEach((b) => (b.onclick = () => mpLinkSheet(d.vencidos.find((x) => x.id === +b.dataset.link))));
  }
  await load();
  poll(load, 4000);
}

async function verComprobante(id, onDone) {
  const r = await api(`/api/coach/pagos/${id}/comprobante`);
  openSheet(`<h2 class="h-m">Comprobante</h2><img class="receipt-img" src="${esc(r.receipt)}" alt="Comprobante"><button class="btn block" id="ok" style="margin-top:14px"><span>Confirmar pago</span></button>`, (el) => {
    $('#ok', el).onclick = async () => { await api(`/api/coach/pagos/${id}/confirmar`, { method: 'POST' }); closeSheet(); toast('Pago confirmado ✓'); onDone && onDone(); };
  });
}

/** Seba creates a Mercado Pago link for a member and sends it from his own WhatsApp. */
async function mpLinkSheet(a) {
  if (!state.config.mercadoPago) return toast('Falta conectar Mercado Pago (MP_ACCESS_TOKEN).', 3500);
  openSheet('<div class="spinner"></div>');
  try {
    const r = await api('/api/coach/mp-link', { method: 'POST', body: { userId: a.id } });
    const msg = `Hola ${firstName(r.name)}! Aquí está tu link para pagar Endémico (${clp(r.amount)}): ${r.url}`;
    openSheet(`
      <p class="kicker">Link de Mercado Pago</p>
      <h2 class="h-m" style="margin-top:8px">${esc(a.name)}</h2>
      <p class="muted">${esc(r.title)} · <b>${clp(r.amount)}</b></p>
      <p class="small" style="margin-top:10px;word-break:break-all;color:var(--blue)">${esc(r.url)}</p>
      <a class="btn wa block" style="margin-top:16px" target="_blank" rel="noopener" href="${waTo(r.phone, msg)}"><span>Mandar por WhatsApp</span></a>
      <button class="btn ghost block" id="copy" style="margin-top:10px"><span>Copiar link</span></button>
      <p class="muted small" style="margin-top:10px">Cuando pague, queda registrado solo. Dura 7 días.</p>`, (el) => {
      $('#copy', el).onclick = async () => { await navigator.clipboard.writeText(r.url); toast('Link copiado'); };
    });
  } catch (err) { closeSheet(); toast(err.message, 4000); }
}

/** One tap per payment: the amount comes from the plan, Seba only picks how they paid. */
function pagoSheet(a, onDone) {
  openSheet(`
    <p class="kicker">Registrar pago</p>
    <h2 class="h-m" style="margin-top:8px">${esc(a.name)}</h2>
    <label class="field"><span>Monto · ${planLbl(a.plan)}</span><input class="input" id="monto" inputmode="numeric" value="${a.planMonto || ''}"></label>
    <div class="methods">
      <button data-m="efectivo"><span>💵</span>Efectivo</button>
      <button data-m="transferencia"><span>🏦</span>Transferencia</button>
      <button data-m="tarjeta"><span>💳</span>Tarjeta</button>
    </div>
    <p class="err" id="err"></p>`, (el) => {
    $$('[data-m]', el).forEach((b) => (b.onclick = async () => {
      try {
        await api('/api/coach/pagos', { method: 'POST', body: { userId: a.id, method: b.dataset.m, amount: +$('#monto', el).value.replace(/\D/g, '') } });
        closeSheet(); toast(`Pago de ${firstName(a.name)} registrado ✓`); onDone && onDone();
      } catch (err) { $('#err', el).textContent = err.message; }
    }));
  });
}

async function viewCoachAlumnos() {
  setShell({ tab: 'alumnos' });
  const { alumnos } = await api('/api/coach/alumnos');
  let q = '';
  let filtro = 'todos';
  function draw() {
    const list = alumnos.filter((a) => (!q || norm(a.name).includes(norm(q)) || a.phone.includes(q)) &&
      (filtro === 'todos' || (filtro === 'pagos' && ['vencido', 'por_vencer', 'por_confirmar', 'sin_pago'].includes(a.estado)) || (filtro === 'ausentes' && a.diasSinVenir >= 10)));
    $('#list').innerHTML = list.length ? list.map((a) => `
      <a class="item" href="#/coach/alumnos/${a.id}"><div class="avatar">${initials(a.name)}</div>
        <div class="grow"><b class="ellipsis" style="display:block">${esc(a.name)}</b><div class="muted small">${planLbl(a.plan)} · ${a.clasesMes} este mes${a.ultimaVisita ? ` · ${a.diasSinVenir === 0 ? 'vino hoy' : 'hace ' + a.diasSinVenir + 'd'}` : ''}</div></div>
        ${estadoChip(a.estado)}</a>`).join('') : '<div class="empty">Nadie con ese filtro.</div>';
  }
  view.innerHTML = `
    <div class="row between"><h1 class="h-l">Alumnos</h1><button class="btn sm" id="nuevo"><span>+ Nuevo</span></button></div>
    <input class="input search" id="q" placeholder="Buscar por nombre o número">
    <div class="seg" style="margin-top:10px"><button data-f="todos" class="on">Todos · ${alumnos.length}</button><button data-f="pagos">Pagos</button><button data-f="ausentes">Ausentes</button></div>
    <div class="card list" id="list" style="margin-top:12px"></div>`;
  $('#q').oninput = (e) => { q = e.target.value; draw(); };
  $$('[data-f]').forEach((b) => (b.onclick = () => { filtro = b.dataset.f; $$('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  $('#nuevo').onclick = () => nuevoSheet();
  draw();
}

function nuevoSheet() {
  const P = state.config.planes;
  openSheet(`
    <h2 class="h-m">Nuevo alumno</h2>
    <label class="field"><span>Nombre</span><input class="input" id="n" autocomplete="off"></label>
    <label class="field"><span>Teléfono (con este entra a la app)</span><input class="input" id="p" type="tel" inputmode="tel" placeholder="9 1234 5678"></label>
    <label class="field"><span>Plan</span><select class="input" id="pl">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${planLbl(n)} · ${clp(P[n])}</option>`).join('')}</select></label>
    <button class="btn block" id="save" style="margin-top:16px"><span>Agregar</span></button>
    <p class="err" id="err"></p>`, (el) => {
    $('#n', el).focus();
    $('#save', el).onclick = async () => {
      try {
        await api('/api/coach/alumnos', { method: 'POST', body: { name: $('#n', el).value, phone: $('#p', el).value, plan: +$('#pl', el).value } });
        closeSheet(); toast('Agregado ✓ Ya puede entrar con su número.'); render();
      } catch (err) { $('#err', el).textContent = err.message; }
    };
  });
}

async function viewCoachAlumno(id) {
  setShell({ tab: 'alumnos' });
  const { alumno: a, checkins, pagos } = await api(`/api/coach/alumnos/${id}`);
  const days = new Set(checkins.map((c) => c.day));
  view.innerHTML = `
    <a class="muted small" href="#/coach/alumnos">← Alumnos</a>
    <div class="row" style="margin-top:12px"><div class="avatar" style="width:54px;height:54px;font-size:18px">${initials(a.name)}</div><div class="grow"><h1 class="h-m">${esc(a.name)}</h1><p class="muted small">${prettyPhone(a.phone)}</p></div></div>
    <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">${estadoChip(a.estado)}<span class="chip dim">${planLbl(a.plan)} · ${clp(a.planMonto)}</span>${a.pagadoHasta ? `<span class="chip dim">Pagado hasta ${fecha(a.pagadoHasta)}</span>` : ''}</div>
    <div class="row" style="gap:10px;margin-top:16px">
      <button class="btn block" id="pago" style="flex:1"><span>Registrar pago</span></button>
      <button class="btn dark" id="chk" ${a.hoyAt ? 'disabled' : ''}><span>${a.hoyAt ? 'Vino ' + hora(a.hoyAt) : 'Check-in'}</span></button>
    </div>
    <div class="section"><div class="section-h"><h2 class="h-s">${fecha(Date.now(), { month: 'long' })}</h2><span class="lime h-s">${a.clasesMes} clases</span></div>${monthCal(days)}</div>
    <div class="section"><div class="section-h"><h2 class="h-s">Pagos</h2></div>
      <div class="card list">${pagos.length ? pagos.map((p) => `<div class="item"><div class="grow"><b class="num">${clp(p.amount)}</b><div class="muted small">${fecha(p.paid_at, { day: 'numeric', month: 'long' })} · ${METHOD_LBL[p.method]}</div></div>${p.status === 'por_confirmar' ? `<button class="btn sm" data-ver="${p.id}"><span>Ver y confirmar</span></button>` : '<span class="chip ok">Pagado</span>'}</div>`).join('') : '<div class="empty">Sin pagos.</div>'}</div></div>
    ${state.config.mercadoPago ? `<button class="btn wa block" id="mplink" style="margin-top:10px"><span>Mandarle link de Mercado Pago</span></button>` : ''}
    <div class="section"><button class="muted small" id="plan">Cambiar plan</button></div>`;
  $('#pago').onclick = () => pagoSheet(a, render);
  if ($('#mplink')) $('#mplink').onclick = () => mpLinkSheet(a);
  $('#chk').onclick = async () => { await api('/api/coach/checkin', { method: 'POST', body: { userId: a.id } }); toast('Check-in marcado ✓'); render(); };
  $$('[data-ver]').forEach((b) => (b.onclick = () => verComprobante(+b.dataset.ver, render)));
  $('#plan').onclick = () => {
    const P = state.config.planes;
    openSheet(`<h2 class="h-m">Plan de ${esc(firstName(a.name))}</h2>
      <select class="input" id="pl">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === a.plan ? 'selected' : ''}>${planLbl(n)} · ${clp(P[n])}</option>`).join('')}</select>
      <button class="btn block" id="save" style="margin-top:14px"><span>Guardar</span></button>
      <button class="btn ghost block" id="baja" style="margin-top:10px"><span>${a.activo ? 'Dar de baja' : 'Reactivar'}</span></button>`, (el) => {
      $('#save', el).onclick = async () => { await api(`/api/coach/alumnos/${a.id}`, { method: 'PATCH', body: { plan: +$('#pl', el).value } }); closeSheet(); render(); };
      $('#baja', el).onclick = async () => { await api(`/api/coach/alumnos/${a.id}`, { method: 'PATCH', body: { activo: !a.activo } }); closeSheet(); render(); };
    });
  };
}

/* ------------------------------------------------------------------ the spreadsheet */

const COLS = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const ESTADO_TXT = { al_dia: 'Al día', por_vencer: 'Vence pronto', vencido: 'Vencido', por_confirmar: 'Por confirmar', sin_pago: 'Sin pago' };

function sheetsFrom(d) {
  // Asistencia: running count per person per month, like a hand-kept sheet would have.
  const counter = {};
  const asistencia = d.asistencia.map((c) => {
    const k = c.name + c.day.slice(0, 7);
    counter[k] = (counter[k] || 0) + 1;
    return { id: 'c' + c.id, cells: [fechaDia(c.day, { day: '2-digit', month: '2-digit', year: 'numeric' }), hora(c.at), c.name, c.plan ? c.plan * 4 + '/mes' : '', counter[k], c.source === 'coach' ? 'Seba' : 'QR'] };
  });
  return {
    Alumnos: {
      head: ['Nombre', 'Teléfono', 'Plan', 'Monto', 'Último pago', 'Pagado hasta', 'Clases mes', 'Última visita', 'Estado'],
      right: [3, 6],
      rows: d.alumnos.map((a) => ({ id: 'a' + a.id, cls: { 8: 'st-' + a.estado }, cells: [a.name, a.phone, a.plan ? a.plan * 4 + ' clases/mes' : '', a.planMonto, a.ultimoPago ? fecha(a.ultimoPago, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '', a.pagadoHasta ? fecha(a.pagadoHasta, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '', a.clasesMes, a.ultimaVisita ? fechaDia(a.ultimaVisita, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '', ESTADO_TXT[a.estado]] })),
    },
    Asistencia: { head: ['Fecha', 'Hora', 'Nombre', 'Plan', 'Clase N° (mes)', 'Registro'], right: [4], rows: asistencia },
    Pagos: {
      head: ['Fecha', 'Nombre', 'Concepto', 'Monto', 'Medio', 'Estado'],
      right: [3],
      rows: d.pagos.map((p) => ({ id: 'p' + p.id, cls: { 5: p.status === 'confirmado' ? 'st-al_dia' : 'st-por_confirmar' }, cells: [fecha(p.paid_at, { day: '2-digit', month: '2-digit', year: 'numeric' }), p.name, conceptoPago(p), p.amount, METHOD_LBL[p.method], p.status === 'confirmado' ? 'Confirmado' : 'Por confirmar'] })),
    },
  };
}

let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return (xlsxLoading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/xlsx.core.min.js'; s.onload = () => res(window.XLSX); s.onerror = rej; document.head.appendChild(s); }));
}

async function viewPlanilla() {
  setShell({ tab: 'planilla', wide: true });
  let tab = sessionStorage.getItem('xl_tab') || 'Asistencia';
  let sheets = null, seen = null, fresh = new Set(), sel = null;

  view.innerHTML = `
    <div class="row between no-print"><div><p class="kicker">La planilla de siempre</p><h1 class="h-m" style="margin-top:6px">Se llena <span class="lime">sola</span></h1></div></div>
    <div class="xl">
      <div class="xl-title"><span class="xl-ic">X</span><b>Endémico_gestión.xlsx</b><span class="live"><span class="live-dot"></span>En vivo</span></div>
      <div class="xl-tools">
        <button class="primary" id="dl">⬇ Descargar Excel</button>
        <label>⬆ Subir mi Excel de alumnos<input type="file" id="up" accept=".xlsx,.xls,.csv"></label>
      </div>
      <div class="xl-fx"><span class="ref" id="ref">A1</span><span class="fx">fx</span><span class="val" id="val"></span></div>
      <div class="xl-grid" id="grid"></div>
      <div class="xl-tabs" id="tabs"></div>
    </div>`;

  function drawGrid(scrollBottom) {
    const s = sheets[tab];
    const cols = COLS(s.head.length);
    const grid = $('#grid');
    const atBottom = grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 30;
    grid.innerHTML = `<table><thead><tr><th class="corner"></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
      <tr class="hdr"><th>1</th>${s.head.map((h) => `<td>${esc(h)}</td>`).join('')}</tr>
      ${s.rows.map((r, i) => `<tr class="${fresh.has(r.id) ? 'new' : ''}"><th>${i + 2}</th>${r.cells.map((v, j) => `<td data-ref="${cols[j]}${i + 2}" class="${s.right.includes(j) ? 'r' : ''} ${(r.cls && r.cls[j]) || ''}">${typeof v === 'number' && s.head[j] === 'Monto' ? clp(v) : esc(v)}</td>`).join('')}</tr>`).join('')}
      ${Array.from({ length: 12 }, (_, k) => `<tr><th>${s.rows.length + 2 + k}</th>${cols.map(() => '<td></td>').join('')}</tr>`).join('')}
    </tbody></table>`;
    $('#tabs').innerHTML = Object.keys(sheets).map((k) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${k}</button>`).join('') + `<span class="count">${s.rows.length} filas</span>`;
    $$('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; sessionStorage.setItem('xl_tab', tab); fresh = new Set(); drawGrid(tab === 'Asistencia'); }));
    $$('td[data-ref]', grid).forEach((td) => (td.onclick = () => { if (sel) sel.classList.remove('sel'); sel = td; td.classList.add('sel'); $('#ref').textContent = td.dataset.ref; $('#val').textContent = td.textContent; }));
    if (scrollBottom || (atBottom && fresh.size)) grid.scrollTop = grid.scrollHeight;
  }

  async function load(first) {
    const d = await api('/api/coach/planilla');
    sheets = sheetsFrom(d);
    const ids = new Set(Object.values(sheets).flatMap((s) => s.rows.map((r) => r.id)));
    fresh = seen ? new Set([...ids].filter((x) => !seen.has(x))) : new Set();
    seen = ids;
    if (first || fresh.size) drawGrid(first ? tab === 'Asistencia' : false);
    if (fresh.size && !first) toast(`${fresh.size === 1 ? 'Nueva fila' : fresh.size + ' filas nuevas'} en la planilla`);
  }

  $('#dl').onclick = async () => {
    const X = await loadXlsx();
    const d = await api('/api/coach/planilla');
    const s = sheetsFrom(d);
    const wb = X.utils.book_new();
    for (const [name, sh] of Object.entries(s)) {
      const ws = X.utils.aoa_to_sheet([sh.head, ...sh.rows.map((r) => r.cells)]);
      ws['!cols'] = sh.head.map((h) => ({ wch: Math.max(10, h.length + 4, name === 'Alumnos' && h === 'Nombre' ? 24 : 0) }));
      X.utils.book_append_sheet(wb, ws, name);
    }
    X.writeFile(wb, `Endemico_gestion_${dayOf()}.xlsx`);
  };

  $('#up').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const X = await loadXlsx();
    const wb = X.read(await f.arrayBuffer());
    const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
    const head = (rows[0] || []).map(norm);
    const find = (...keys) => head.findIndex((h) => keys.some((k) => h.includes(k)));
    const iN = find('nombre', 'alumno'), iT = find('telefono', 'fono', 'celular', 'whatsapp', 'numero'), iP = find('plan', 'veces', 'frecuencia'), iM = find('monto', 'valor', 'precio');
    if (iN < 0 || iT < 0) return toast('No encontré columnas "Nombre" y "Teléfono" en la primera hoja.', 4000);
    const data = rows.slice(1).filter((r) => r[iN] && r[iT]).map((r) => ({
      nombre: r[iN], telefono: r[iT],
      plan: iP >= 0 ? parseInt(String(r[iP]).replace(/\D/g, ''), 10) || 0 : 0,
      monto: iM >= 0 ? String(r[iM]).replace(/\D/g, '') : '',
    }));
    openSheet(`<h2 class="h-m">Subir ${data.length} alumnos</h2><p class="muted small">De <b>${esc(f.name)}</b>. Los que ya están se actualizan; los nuevos ya pueden entrar con su número.</p>
      <div class="card list" style="margin-top:12px;max-height:240px;overflow:auto">${data.slice(0, 50).map((r) => `<div class="item"><div class="grow"><b>${esc(r.nombre)}</b><div class="muted small">${esc(r.telefono)}${r.plan ? ' · ' + planLbl(r.plan) : ''}</div></div></div>`).join('')}</div>
      <button class="btn block" id="go" style="margin-top:14px"><span>Subir</span></button>`, (el) => {
      $('#go', el).onclick = async () => {
        const r = await api('/api/coach/import', { method: 'POST', body: { rows: data } });
        closeSheet(); toast(`${r.nuevos} nuevos · ${r.actualizados} actualizados${r.saltados ? ' · ' + r.saltados + ' sin teléfono válido' : ''}`, 4000); load(true);
      };
    });
    e.target.value = '';
  };

  await load(true);
  poll(() => load(false), 4000);
}

/* ------------------------------------------------------------------ coach: whiteboard → weekly page */

async function viewCoachSemana() {
  setShell({ tab: 'semana' });
  const r = await api('/api/semana');
  const w = r.week;
  view.innerHTML = `
    <p class="kicker">El domingo, como siempre</p>
    <h1 class="h-l" style="margin-top:8px">Escribe la pizarra.<br><span class="lime">Sácale una foto.</span></h1>

    <div id="up-area" style="margin-top:18px">
      <label class="pizarra-drop">${ICON.camera}<b class="h-s">Foto de la pizarra</b><span class="muted small">${state.config.lectorPizarra ? 'Toca para sacarla o elegirla' : 'Falta conectar el lector (ANTHROPIC_API_KEY)'}</span><input type="file" accept="image/*" capture="environment" id="foto"></label>
    </div>
    <p class="err" id="err"></p>
    ${w ? `
      <div class="section">
        <div class="section-h"><h2 class="h-s">Esta semana</h2><a class="lime small" href="#/semana">Ver como alumno →</a></div>
        <div class="card"><div class="row">
          ${w.hasPhoto ? '<img class="photo-thumb" id="thumb" alt="Pizarra">' : ''}
          <div class="grow"><b>${esc(w.plan.titulo || 'Semana del ' + fechaDia(w.weekStart))}</b><div class="muted small">${w.plan.dias.length} días · ${w.plan.dias.reduce((n, d) => n + d.bloques.reduce((m, b) => m + b.ejercicios.length, 0), 0)} ejercicios · ${w.source === 'foto' ? 'leída de la pizarra' : w.source === 'demo' ? 'ejemplo' : 'editada a mano'}</div></div>
        </div>
        <div class="list" style="margin-top:8px">${w.plan.dias.map((d) => `<div class="item"><b style="width:86px">${esc(d.dia)}</b><span class="muted grow">${esc(d.foco)}</span></div>`).join('')}</div></div>
      </div>` : ''}`;
  if (w && w.hasPhoto) api('/api/semana?foto=1').then((x) => { const t = $('#thumb'); if (t && x.photo) t.src = x.photo; });
  $('#foto').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('#err').textContent = '';
    const dataUrl = await imageToDataUrl(f, 1600, 0.85);
    $('#up-area').innerHTML = `<div class="scan"><img src="${dataUrl}" alt=""><div class="scan-lbl">Leyendo la pizarra…</div></div>`;
    try {
      await api('/api/coach/semana/foto', { method: 'POST', body: { image: dataUrl } });
      toast('¡Lista la semana! ✓');
      go('#/semana');
    } catch (err) {
      $('#err').textContent = err.message;
      $('#up-area').innerHTML = `<label class="pizarra-drop">${ICON.camera}<b class="h-s">Probar con otra foto</b><input type="file" accept="image/*" capture="environment" id="foto2"></label>`;
      $('#foto2').onchange = $('#foto').onchange;
    }
  };
}

async function viewPuerta() {
  setShell({ tab: 'hoy', tabbar: !!state.user });
  if (!state.user || state.user.role !== 'coach') return go('#/entrar?next=%23%2Fpuerta');
  const { url } = await api('/api/coach/puerta');
  view.innerHTML = `
    <div class="poster">
      <div class="wordmark" style="font-size:34px">ENDÉMICO</div>
      <div class="dashes" style="justify-content:center;margin-top:14px"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <h1 class="h-xl" style="margin-top:18px">Check-<span class="lime">in</span></h1>
      <div class="qr">${qrSvg(url)}</div>
      <p class="h-m">Escanéame <span class="outline">al</span> <span class="lime">llegar</span></p>
      <p class="muted" style="margin-top:10px">Abre la cámara del teléfono y apunta aquí.</p>
    </div>
    <div class="no-print" style="margin-top:16px">
      <button class="btn block" onclick="print()"><span>Imprimir para la puerta</span></button>
      <p class="muted small" style="margin-top:10px;word-break:break-all">${esc(url)}</p>
    </div>`;
}

/* ------------------------------------------------------------------ boot */

(async function boot() {
  try {
    [state.config] = await Promise.all([api('/api/config'), loadMe()]);
  } catch (err) {
    view.innerHTML = `<div class="empty">No pude conectar: ${esc(err.message)}</div>`;
    return;
  }
  $('#demo-pill').hidden = !state.config.demo;
  render();
})();
