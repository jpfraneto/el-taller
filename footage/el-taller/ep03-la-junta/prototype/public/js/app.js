// La Junta · web app (no build step, plain ES modules).
import { t, getLang, setLang, locale } from './i18n.js';
import qrcode from '../vendor/qrcode.mjs';

const TZ = 'America/Santiago';
const state = {
  config: null,
  user: null,
  home: null,
  weather: null,
  juntas: null,
  socios: null,
  filter: 'all',
  gym: null,       // live 3D instance while on the gym route
  login: null,     // pending WhatsApp login
};

/* ================================================================== utils */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || t('err.generic'));
    err.code = data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = ['#EAE5DC', '#C97C2A', '#2EAD82', '#3A8FB5', '#E0B07A', '#9CC9B5'];
function avatar(name, cls = '') {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="avatar ${cls}" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${esc(initials(name))}</span>`;
}

function fmtPhone(p) {
  if (!p) return '';
  if (/^569\d{8}$/.test(p)) return `+56 9 ${p.slice(3, 7)} ${p.slice(7)}`;
  return `+${p}`;
}

function money(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

function dateParts(ms) {
  const d = new Date(ms);
  const f = (o) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, ...o }).format(d);
  return {
    wd: f({ weekday: 'short' }).replace('.', ''),
    day: f({ day: 'numeric' }),
    month: f({ month: 'short' }).replace('.', ''),
    time: f({ hour: '2-digit', minute: '2-digit', hour12: false }),
    long: f({ weekday: 'long', day: 'numeric', month: 'long' }),
    iso: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
  };
}

// Wall-clock date+time in Puerto Varas → Unix ms.
function santiagoToMs(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const local = new Date(new Date(guess).toLocaleString('en-US', { timeZone: TZ }));
  const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return guess + (utc - local);
}

function todayInPV(offsetDays = 0) {
  return dateParts(Date.now() + offsetDays * 864e5).iso;
}

function nextSaturdayISO() {
  const wd = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getDay();
  const add = ((6 - wd + 7) % 7) || 7;
  return todayInPV(add);
}

function qrSvg(text, cell = 4) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
}

const isTouch = () => matchMedia('(pointer: coarse)').matches;

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

const WA_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.25.69-1.44 1.32-2 1.4-.51.08-1.15.11-1.86-.12-.43-.13-.97-.31-1.67-.61-2.94-1.27-4.86-4.23-5-4.43-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.59-.37.79-.37h.57c.18 0 .43-.07.67.51.25.59.84 2.04.91 2.19.07.15.12.32.02.52-.1.2-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.05 1.13 1.01 2.09 1.32 2.39 1.47.3.15.47.12.64-.07.17-.2.74-.86.94-1.16.2-.3.39-.25.67-.15.27.1 1.73.82 2.03.97.3.15.49.22.57.34.07.12.07.71-.18 1.4Z"/></svg>`;

/* ================================================================== sheets */

let currentSheet = null;

function openSheet(html, { onClose, noClose } = {}) {
  closeSheet(true);
  const root = $('#sheet-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.innerHTML = `<div class="sheet-grip"></div>${noClose ? '' : '<button class="sheet-close" data-close aria-label="Cerrar">✕</button>'}<div class="sheet-body"></div>`;
  $('.sheet-body', sheet).innerHTML = html;
  root.append(backdrop, sheet);
  requestAnimationFrame(() => { backdrop.classList.add('open'); sheet.classList.add('open'); });
  const api = {
    el: sheet,
    body: $('.sheet-body', sheet),
    set(h) { this.body.innerHTML = h; },
    close: () => closeSheet(),
    onClose,
  };
  if (!noClose) backdrop.addEventListener('click', () => closeSheet());
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  currentSheet = { backdrop, sheet, api };
  return api;
}

function closeSheet(instant = false) {
  if (!currentSheet) return;
  const { backdrop, sheet, api } = currentSheet;
  currentSheet = null;
  api.onClose?.();
  if (instant) { backdrop.remove(); sheet.remove(); return; }
  backdrop.classList.remove('open');
  sheet.classList.remove('open');
  setTimeout(() => { backdrop.remove(); sheet.remove(); }, 350);
}

/* ================================================================== data */

async function loadMe() {
  const { user } = await api('/api/me');
  state.user = user;
  renderTopbar();
}

async function loadHome() {
  state.home = await api('/api/home');
}

async function loadWeather() {
  try { state.weather = await api('/api/weather'); } catch { state.weather = { error: true }; }
}

async function loadJuntas() {
  state.juntas = (await api('/api/juntas')).juntas;
}

async function loadSocios() {
  state.socios = await api('/api/socios');
}

/* ================================================================== chrome */

function renderTopbar() {
  const btn = $('#avatar-btn');
  if (state.user) {
    btn.className = 'avatar-btn logged' + (state.user.socio ? ' socio' : '');
    btn.innerHTML = esc(initials(state.user.name));
    btn.onclick = () => (location.hash = '#/perfil');
  } else {
    btn.className = 'avatar-btn';
    btn.innerHTML = `${WA_ICON.replace('<svg', '<svg width="16" height="16"')}<span>${t('login')}</span>`;
    btn.onclick = () => openLogin();
  }
  $('#lang-btn').textContent = getLang() === 'es' ? 'EN' : 'ES';
  $('#demo-pill').hidden = !state.config?.demo;
  $$('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
}

function setActiveTab(tab) {
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}

/* ================================================================== router */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { path: path || '', params: new URLSearchParams(qs || '') };
}

async function router() {
  const { path, params } = parseHash();
  const view = $('#view');
  if (currentSheet) closeSheet(true);

  if (state.gym && path !== 'gimnasio') {
    state.gym.destroy();
    state.gym = null;
  }
  document.body.classList.toggle('route-gym', path === 'gimnasio');
  $('#topbar').hidden = path === 'gimnasio';
  view.classList.toggle('fullbleed', path === 'gimnasio');

  const routes = {
    '': [renderHome, 'inicio'],
    juntas: [renderJuntas, 'juntas'],
    gimnasio: [renderGym, 'gimnasio'],
    socios: [renderSocios, 'socios'],
    perfil: [renderPerfil, ''],
  };
  const [fn, tab] = routes[path] || routes[''];
  setActiveTab(tab);
  window.scrollTo(0, 0);
  await fn(view, params);
}

/* ================================================================== home */

function statsHTML() {
  const h = state.home || { people: '–', juntas: '–', socios: '–', cupos: 100 };
  return `
      <div class="stat"><b>${h.people}</b><span>${t('home.stat.people')}</span></div>
      <div class="stat"><b>${h.juntas}</b><span>${t('home.stat.juntas')}</span></div>
      <div class="stat"><b>${h.socios}</b><span>${t('home.stat.socios', { cupos: h.cupos })}</span></div>`;
}

function pillarsHTML() {
  const h = state.home || { juntas: '–', socios: '–', cupos: 100 };
  const pct = typeof h.socios === 'number' ? Math.max(3, (h.socios / h.cupos) * 100) : 0;
  return `
      <a class="card pillar" href="#/gimnasio">
        <img class="pillar-bg" src="/assets/brand/render-camara.jpg" alt="">
        <div class="pillar-content">
          <span><span class="tag">01 · 3D</span></span>
          <div class="pillar-word">${t('home.t1')}</div>
          <div class="pillar-text">${t('p.escala.text')}</div>
          <div class="pillar-foot">${t('p.escala.foot')}<span class="arrow">→</span></div>
        </div>
      </a>
      <a class="card pillar" href="#/juntas">
        <img class="pillar-bg" src="/assets/brand/foto-07.jpg" alt="">
        <div class="pillar-content">
          <span><span class="tag teal">02 · ${t('tab.juntas')}</span></span>
          <div class="pillar-word">${t('home.t2')}</div>
          <div class="pillar-text">${t('p.comparte.text')}</div>
          <div class="pillar-foot">${t('p.comparte.foot', { n: h.juntas })}<span class="arrow">→</span></div>
        </div>
      </a>
      <a class="card pillar" href="#/socios">
        <img class="pillar-bg" src="/assets/brand/render-terraza.jpg" alt="">
        <div class="pillar-content">
          <span><span class="tag orange">03 · ${t('tab.socios')}</span></span>
          <div class="pillar-word">${t('home.t3')}</div>
          <div class="pillar-text">${t('p.separte.text')}</div>
          <div class="pillar-foot"><span class="bar"><i style="width:0%" data-w="${pct}%"></i></span>${t('p.separte.foot', { n: h.socios, cupos: h.cupos })}<span class="arrow">→</span></div>
        </div>
      </a>`;
}

function renderHomeHTML() {
  const u = state.user;
  return `
    <section class="hero">
      <img class="poster" src="/assets/brand/render-escalada.jpg" alt="">
      <video src="/assets/brand/render-escalada.mp4" poster="/assets/brand/render-escalada.jpg" autoplay muted loop playsinline preload="auto"></video>
      <div class="hero-content fade-in">
        <span class="tag">${t('home.place')}</span>
        <h1 class="hero-title mt-12"><span>${t('home.t1')}</span><span>${t('home.t2')}</span><span>${t('home.t3')}</span></h1>
        ${u
          ? `<p class="hero-sub">${t('home.hi', { name: esc(u.name.split(' ')[0]) })} 👋</p>`
          : `<p class="hero-sub">${t('home.sub')}</p>
             <button class="btn wa block hero-cta" data-act="login">${WA_ICON}${t('home.cta')}</button>`}
      </div>
    </section>

    <div class="stats" id="stats-slot">${statsHTML()}</div>

    <div class="section"><div class="pillars" id="pillars-slot">${pillarsHTML()}</div></div>

    <div class="section mt-12">
      <span class="eyebrow">${t('home.founders')}</span>
      <div class="founders mt-12">
        <div class="founder"><img src="/assets/brand/foto-paul.jpg" alt="Paul Behrens" loading="lazy"><b>Paul Behrens</b><span>${t('home.paul')}</span></div>
        <div class="founder"><img src="/assets/brand/foto-juan.jpg" alt="Juan Rozas" loading="lazy"><b>Juan Rozas</b><span>${t('home.juan')}</span></div>
      </div>
      <p class="lead mt-16">${t('home.why')}</p>
    </div>`;
}

async function renderHome(view) {
  view.innerHTML = renderHomeHTML();
  animateBars(view);
  const onHome = () => parseHash().path === '' && $('#stats-slot');
  loadHome().then(() => {
    if (!onHome()) return;
    $('#stats-slot').innerHTML = statsHTML();
    $('#pillars-slot').innerHTML = pillarsHTML();
    animateBars(view);
  }).catch(() => {});
}

function animateBars(root) {
  requestAnimationFrame(() => setTimeout(() => $$('.bar i[data-w]', root).forEach((i) => (i.style.width = i.dataset.w)), 60));
}

/* ================================================================== juntas */

function forecastFor(junta) {
  const w = state.weather?.spots;
  if (!w) return null;
  const spot = /cocham/i.test(junta.place) ? w.cochamo : w.pv;
  if (!spot || spot.error) return null;
  const iso = dateParts(junta.startsAt).iso;
  const day = [spot.today, ...(spot.next || [])].find((d) => d && d.date === iso);
  return day && day.prob >= 60 ? { p: day.prob, spot: spot.name } : null;
}

function juntaCard(j) {
  const d = dateParts(j.startsAt);
  const kindTag = { roca: 'tag', cordada: 'tag orange', sesion: 'tag teal' }[j.kind];
  const free = Math.max(0, j.seats - j.joinedCount);
  const seatsHtml = j.kind === 'roca' && j.seats > 0
    ? `<div class="seats">${Array.from({ length: j.seats }, (_, i) => `<span class="seat ${i < j.joinedCount ? 'taken' : ''}"></span>`).join('')}
         <span class="seats-label">${j.full ? t('j.full') : t('j.seats.roca', { free, seats: j.seats })}</span></div>`
    : `<div class="row"><div class="avatars">${j.members.slice(0, 4).map((m) => avatar(m.name, 'sm')).join('')}</div>
         <span class="seats-label">${t('j.seats.other', { n: j.joinedCount })}</span></div>`;
  const fc = j.kind === 'sesion' ? null : forecastFor(j);
  const waText = t('j.wa.msg', { name: j.organizer.name.split(' ')[0], place: j.place, date: `${d.wd} ${d.day}` });

  let actions;
  if (j.mine) {
    actions = `<span class="tag cream">${t('j.yours')}</span><span class="spacer"></span>
      <button class="btn ghost sm" data-act="del-junta" data-id="${j.id}">${t('j.delete')}</button>`;
  } else if (j.joined) {
    actions = `<a class="btn wa sm" href="https://wa.me/${esc(j.organizer.phone)}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">${WA_ICON}${t('j.write')}</a>
      <span class="spacer"></span><button class="small" data-act="leave" data-id="${j.id}" style="text-decoration:underline">${t('j.leave')}</button>`;
  } else {
    actions = `${seatsHtml}<span class="spacer"></span>
      <button class="btn sm" data-act="join" data-id="${j.id}" ${j.full ? 'disabled' : ''}>${j.full ? t('j.full') : t('j.join')}</button>`;
  }

  return `
    <article class="card junta fade-in">
      <div class="junta-top">
        <div class="junta-date"><div class="d">${esc(d.wd)}</div><div class="n">${esc(d.day)}</div><div class="t">${esc(d.time)}</div></div>
        <div style="flex:1;min-width:0">
          <span class="${kindTag}">${t('j.kind.' + j.kind)}</span>
          <div class="junta-place">${esc(j.place)}</div>
          ${j.meet ? `<div class="junta-meet">${t('j.meet', { meet: esc(j.meet) })}</div>` : ''}
        </div>
      </div>
      ${j.note ? `<p class="junta-note">${esc(j.note)}</p>` : ''}
      ${fc ? `<div class="wx-warn">🌧️ ${t('j.wxwarn', fc)}</div>` : ''}
      <div class="junta-org">
        ${avatar(j.organizer.name)}
        <div><b>${esc(j.organizer.name)}</b><span>${t('lvl.' + j.organizer.level)} · ${t('org.' + j.organizer.origin)}</span></div>
      </div>
      ${j.mine || j.joined ? `<div class="junta-foot" style="border-top:0;padding-top:0">${seatsHtml}</div>` : ''}
      <div class="junta-foot">${actions}</div>
    </article>`;
}

function visitCard() {
  const hostel = (ico, text) => `<div class="hostel"><span class="ico">${ico}</span><span class="small" style="color:var(--cream)">${text}</span></div>`;
  return `
    <article class="card card-pad visit mt-12">
      <span class="tag">${t('visit.title')}</span>
      <p class="lead mt-12" style="color:var(--cream)">${t('visit.text')}</p>
      <div class="eyebrow mt-16">${t('visit.hostels')}</div>
      <div class="mt-8">
        ${hostel('🛏️', t('visit.h1'))}
        ${hostel('🗓️', t('visit.h2'))}
        ${hostel('🎒', t('visit.h3'))}
      </div>
      <p class="small mt-8" style="opacity:.7">${t('visit.soon')}</p>
    </article>`;
}

function renderJuntasHTML() {
  const list = state.juntas;
  const filters = ['all', 'roca', 'cordada', 'sesion'];
  const items = list ? list.filter((j) => state.filter === 'all' || j.kind === state.filter) : null;
  let body;
  if (!items) body = `<div class="card skeleton" style="height:220px"></div><div class="card skeleton mt-12" style="height:220px"></div>`;
  else if (!items.length) body = `<div class="empty"><div class="big">🧗</div><p class="mt-8">${t('j.empty')}</p></div>`;
  else body = items.map((j, i) => juntaCard(j) + (i === 1 ? visitCard() : '')).join('');
  if (items && items.length < 2) body += visitCard();
  return `
    <div class="page-head">
      <div class="head-row"><h1 class="h1">${t('j.title')}</h1><span class="spacer"></span>
        <button class="btn sm" data-act="new-junta">+ ${t('j.create')}</button></div>
      <p class="lead mt-8">${t('j.sub')}</p>
      <div class="chips mt-16">${filters.map((f) => `<button class="chip ${state.filter === f ? 'active' : ''}" data-act="filter" data-f="${f}">${t('j.' + f)}</button>`).join('')}</div>
    </div>
    <div style="padding:6px 18px 24px">${body}</div>`;
}

async function renderJuntas(view) {
  view.innerHTML = renderJuntasHTML();
  await Promise.all([loadJuntas(), state.weather ? null : loadWeather()]);
  if (parseHash().path === 'juntas') view.innerHTML = renderJuntasHTML();
}

async function refreshJuntas() {
  await loadJuntas();
  if (parseHash().path === 'juntas') $('#view').innerHTML = renderJuntasHTML();
}

function openJuntaForm() {
  if (!state.user) return openLogin(() => openJuntaForm());
  const f = { kind: 'roca', seats: 3, date: nextSaturdayISO(), time: '08:00' };
  const sheet = openSheet('');
  const draw = () => {
    sheet.set(`
      <h2 class="h2">${t('f.title')}</h2>
      <div class="field"><span>${t('f.kind')}</span>
        <div class="seg">${['roca', 'cordada', 'sesion'].map((k) => `<button type="button" class="${f.kind === k ? 'active' : ''}" data-k="${k}">${t('j.' + k)}</button>`).join('')}</div>
      </div>
      <label class="field"><span>${t('f.place')}</span><input class="input" name="place" placeholder="${t('f.place.ph')}" value="${esc(f.place || '')}" maxlength="60"></label>
      <div class="chips mt-8" style="padding-left:0;margin-left:0">${['Valle Cochamó', 'Ensenada', 'Puerto Varas'].map((p) => `<button type="button" class="chip" data-p="${p}">${p}</button>`).join('')}</div>
      <label class="field"><span>${t('f.meet')}</span><input class="input" name="meet" placeholder="${t('f.meet.ph')}" value="${esc(f.meet || '')}" maxlength="80"></label>
      <div class="two">
        <label class="field"><span>${t('f.date')}</span><input class="input" type="date" name="date" value="${f.date}" min="${todayInPV()}"></label>
        <label class="field"><span>${t('f.time')}</span><input class="input" type="time" name="time" value="${f.time}"></label>
      </div>
      <div class="field"><span>${f.kind === 'roca' ? t('f.seats.roca') : t('f.seats.other')}</span>
        <div class="stepper"><button type="button" data-s="-1">−</button><b>${f.seats}</b><button type="button" data-s="1">+</button></div>
      </div>
      <label class="field"><span>${t('f.note')}</span><textarea class="textarea" name="note" placeholder="${t('f.note.ph')}" maxlength="280">${esc(f.note || '')}</textarea></label>
      <div class="err-text" id="f-err"></div>
      <button class="btn block mt-8" id="f-submit">${t('f.submit')}</button>`);
  };
  const sync = () => $$('input, textarea', sheet.body).forEach((i) => (f[i.name] = i.value));
  draw();
  sheet.body.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-k]');
    const s = e.target.closest('[data-s]');
    const p = e.target.closest('[data-p]');
    if (k) { sync(); f.kind = k.dataset.k; f.seats = f.kind === 'roca' ? 3 : 1; draw(); }
    if (s) { sync(); f.seats = Math.max(f.kind === 'roca' ? 1 : 1, Math.min(12, f.seats + +s.dataset.s)); draw(); }
    if (p) { sync(); f.place = p.dataset.p; draw(); }
    if (e.target.closest('#f-submit')) {
      sync();
      const btn = $('#f-submit', sheet.body);
      btn.disabled = true;
      try {
        await api('/api/juntas', { method: 'POST', body: { kind: f.kind, place: f.place, meet: f.meet, note: f.note, seats: f.seats, startsAt: santiagoToMs(f.date, f.time) } });
        closeSheet();
        toast(t('f.done') + ' 🧗');
        state.filter = 'all';
        if (parseHash().path !== 'juntas') location.hash = '#/juntas';
        else refreshJuntas();
        loadHome().catch(() => {});
      } catch (err) {
        $('#f-err', sheet.body).textContent = err.message;
        btn.disabled = false;
      }
    }
  });
}

/* ================================================================== gym (3D) */

async function renderGym(view, params) {
  const poi = params.get('poi') || '';
  view.innerHTML = `
    <div class="gym-wrap">
      <div class="gym-canvas" id="gym-canvas"></div>
      <div class="gym-loading" id="gym-loading">${t('gym.loading')}</div>
      <div class="gym-top">
        <div class="gym-title">
          <a class="back" href="#/">←</a>
          <div><b>${t('gym.title')}</b><span>${t('gym.sub')}</span></div>
        </div>
        <div class="gym-pois"><div class="chips" id="gym-chips"></div></div>
      </div>
      <div class="gym-info hide" id="gym-info"></div>
    </div>`;

  const [mod] = await Promise.all([
    import('./gym3d.js').catch((e) => { console.error(e); return null; }),
    state.socios ? null : loadSocios().catch(() => {}),
  ]);
  if (parseHash().path !== 'gimnasio') return;

  const fallback = () => {
    $('#gym-loading')?.remove();
    $('#gym-canvas').innerHTML = `<div class="gym-fallback"><div><p class="small">${t('gym.fallback')}</p>
      <video class="mt-16" src="/assets/brand/render-camara.mp4" autoplay muted loop playsinline style="border-radius:14px"></video></div></div>`;
  };
  if (!mod || !hasWebGL()) return fallback();

  const mySocio = state.user?.socio;
  const names = (state.socios?.lista || []).map((s) => s.name);
  const lang = getLang();
  const chips = $('#gym-chips');
  chips.innerHTML = mod.POIS.map((p) => {
    const star = p.id === 'muro-socios' && mySocio;
    return `<button class="chip ${star ? 'star' : ''}" data-poi="${p.id}">${star ? '⭐ ' : ''}${esc(p.label[lang] || p.label.es)}</button>`;
  }).join('');

  const info = $('#gym-info');
  const showPoi = (p) => {
    if (!p) return;
    $$('#gym-chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.poi === p.id));
    $(`#gym-chips [data-poi="${p.id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    let extra = '';
    if (p.id === 'muro-socios') {
      extra = mySocio
        ? ` <b style="display:inline;color:var(--orange-2)">Nº ${String(mySocio.number).padStart(2, '0')} · ${esc(mySocio.display_name)}</b>`
        : ` <a href="#/socios" style="color:var(--orange-2);font-weight:700">${t('me.become')} →</a>`;
    }
    info.innerHTML = `<b>${esc(p.label[lang] || p.label.es)}</b><span>${esc(p.blurb[lang] || p.blurb.es)}${extra}</span>`;
    info.classList.remove('hide');
  };

  try {
    state.gym = mod.mountGym($('#gym-canvas'), {
      names,
      highlightName: mySocio?.display_name,
      startAt: poi || undefined,
      lang,
      onPoi: showPoi,
      onReady: () => $('#gym-loading')?.remove(),
    });
  } catch (e) {
    console.error(e);
    return fallback();
  }
  setTimeout(() => $('#gym-loading')?.remove(), 6000);

  chips.addEventListener('click', (e) => {
    const c = e.target.closest('[data-poi]');
    if (!c || !state.gym) return;
    state.gym.goTo(c.dataset.poi);
    showPoi(mod.POIS.find((p) => p.id === c.dataset.poi));
  });
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/* ================================================================== socios */

function carnetHTML(socio) {
  const n = String(socio.number).padStart(2, '0');
  return `
    <div class="carnet">
      <img class="iso" src="/assets/brand/isotipo-blanco.png" alt="">
      <img class="logo" src="/assets/brand/logo-blanco-horizontal.png" alt="La Junta">
      <div class="kind">${t('carnet.kind')}</div>
      <div class="num">Nº ${n}</div>
      <div class="name">${esc(socio.display_name || socio.name)}</div>
      <div class="since">${t('carnet.since')} · ${state.socios?.cupos || 100} ${t('s.title')}</div>
      <div class="qr">${qrSvg(`${location.origin}/#/socios?n=${socio.number}`, 3)}</div>
    </div>`;
}

function renderSociosHTML() {
  const s = state.socios;
  const mine = state.user?.socio;
  const cupos = s?.cupos || state.config?.cupos || 100;
  const taken = s?.tomados ?? 0;
  const next = taken + 1;
  const byN = Object.fromEntries((s?.lista || []).map((x) => [x.n, x]));
  const cells = Array.from({ length: cupos }, (_, i) => {
    const n = i + 1;
    const x = byN[n];
    const cls = x ? (x.mine ? 'cell taken mine' : 'cell taken') : (n === next && !mine ? 'cell next' : 'cell');
    return `<div class="${cls}" title="${x ? esc(x.name) : ''}">${n}</div>`;
  }).join('');
  const perks = [['🧗', 's.perk1'], ['🪧', 's.perk2'], ['🎫', 's.perk3'], ['🎉', 's.perk4'], ['🗳️', 's.perk5']];

  return `
    <section class="socios-hero">
      <img class="forma" src="/assets/brand/forma-04.png" alt="">
      ${mine ? `<div class="fade-in">${carnetHTML(mine)}</div><div class="mt-24"></div>` : ''}
      <div class="socios-big">${cupos}</div>
      <div class="socios-title">${t('s.title')}</div>
      <p class="lead mt-12">${t('s.claim')}</p>
      <div class="price-row"><b>${t('s.price')}</b><span>${t('s.priceSub')}</span></div>
    </section>

    <div class="section">
      <div class="card card-pad">
        <div class="row"><span class="h3">${t('s.wall')}</span><span class="spacer"></span><span class="tag orange">${t('s.left', { n: cupos - taken })}</span></div>
        <p class="small mt-8">${t('s.wallSub')}</p>
        <div class="grid100 mt-16">${cells}</div>
        ${s?.lista?.length ? `<div class="wall-names">${s.lista.map((x) => `<div><i>${String(x.n).padStart(2, '0')}</i>${esc(x.name)}</div>`).join('')}</div>` : ''}
        <a class="btn ghost sm block mt-16" href="#/gimnasio?poi=muro-socios">🧱 ${t('ok.wall')}</a>
      </div>
    </div>

    <div class="section">
      <span class="eyebrow">${t('s.perks')}</span>
      <ul class="perks mt-8">${perks.map(([e, k]) => `<li><span class="k">${e}</span><span>${t(k)}</span></li>`).join('')}</ul>
      <p class="small mt-12" style="opacity:.7">${t('s.proposal')}</p>
    </div>

    <div class="sticky-cta">
      ${mine
        ? `<a class="btn cream block" href="#/perfil">${t('s.ctaMine')}</a>`
        : taken >= cupos
          ? `<button class="btn block" disabled>${t('s.sold')}</button>`
          : `<button class="btn block" data-act="become">${t('s.cta', { n: next })}</button>`}
    </div>`;
}

async function renderSocios(view) {
  view.innerHTML = renderSociosHTML();
  await loadSocios();
  if (parseHash().path === 'socios') view.innerHTML = renderSociosHTML();
}

function openCheckout() {
  if (!state.user) return openLogin(() => openCheckout());
  if (state.user.socio) { location.hash = '#/perfil'; return; }
  const next = (state.socios?.tomados ?? 0) + 1;
  let method = 'card';
  const sheet = openSheet('');
  const draw = (name = state.user.name) => sheet.set(`
    <span class="tag orange">${t('carnet.kind')}</span>
    <h2 class="h2 mt-12">${t('pay.title', { n: String(next).padStart(2, '0') })}</h2>
    <label class="field"><span>${t('pay.name')}</span><input class="input" id="pay-name" value="${esc(name)}" maxlength="40"></label>
    <div class="field"><span>${t('pay.method')}</span>
      <div class="seg"><button type="button" data-m="card" class="${method === 'card' ? 'active' : ''}">💳 ${t('pay.card')}</button><button type="button" data-m="transfer" class="${method === 'transfer' ? 'active' : ''}">🏦 ${t('pay.transfer')}</button></div>
    </div>
    <div class="row mt-24"><span class="lead">${t('pay.total')}</span><span class="spacer"></span><b class="h2">${money(state.config?.precio || 100000)}</b></div>
    <p class="small mt-12">${t('pay.sim')}</p>
    <div class="err-text" id="pay-err"></div>
    <button class="btn block mt-8" id="pay-btn">${t('pay.btn')}</button>`);
  draw();
  sheet.body.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-m]');
    if (m) { method = m.dataset.m; draw($('#pay-name', sheet.body).value); return; }
    if (!e.target.closest('#pay-btn')) return;
    const btn = $('#pay-btn', sheet.body);
    const displayName = $('#pay-name', sheet.body).value.trim();
    btn.disabled = true;
    btn.textContent = t('pay.processing');
    try {
      await new Promise((r) => setTimeout(r, 1300));
      const { socio } = await api('/api/socios/checkout', { method: 'POST', body: { displayName } });
      await Promise.all([loadMe(), loadSocios(), loadHome()]);
      closeSheet(true);
      showSocioWelcome(socio.number);
      if (parseHash().path === 'socios') $('#view').innerHTML = renderSociosHTML();
    } catch (err) {
      $('#pay-err', sheet.body).textContent = err.message;
      btn.disabled = false;
      btn.textContent = t('pay.btn');
    }
  });
}

function showSocioWelcome(n) {
  confetti();
  const sheet = openSheet(`
    <div style="text-align:center">
      <div style="font-size:44px">🎉</div>
      <h2 class="h1 mt-8">${t('ok.title')}</h2>
      <p class="lead mt-8">${t('ok.sub', { n: String(n).padStart(2, '0') })}</p>
    </div>
    <div class="mt-24">${carnetHTML(state.user.socio)}</div>
    <a class="btn block mt-24" href="#/gimnasio?poi=muro-socios" data-close>🧱 ${t('ok.wall')}</a>
    <button class="btn ghost block mt-12" id="share-btn">${t('ok.share')}</button>`);
  $('#share-btn', sheet.body).onclick = async () => {
    const text = t('ok.shareText', { n: String(n).padStart(2, '0') });
    try {
      if (navigator.share) await navigator.share({ text, url: location.origin });
      else { await navigator.clipboard.writeText(`${text} ${location.origin}`); toast('📋 ✓'); }
    } catch {}
  };
}

function confetti() {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.append(c);
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const ctx = c.getContext('2d');
  const colors = ['#C97C2A', '#E08F37', '#2EAD82', '#3A8FB5', '#EAE5DC'];
  const parts = Array.from({ length: 140 }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.3, y: c.height * 0.35,
    vx: (Math.random() - 0.5) * 18 * dpr, vy: (-Math.random() * 16 - 6) * dpr,
    s: (5 + Math.random() * 7) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    col: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(now) {
    const el = now - t0;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.5 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - el / 2600);
      ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (el < 2600) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

/* ================================================================== perfil */

async function renderPerfil(view) {
  if (!state.user) {
    view.innerHTML = `<div class="empty"><div class="big">🧗</div><p class="mt-8">${t('need.login')}</p>
      <button class="btn wa mt-16" data-act="login">${WA_ICON}${t('home.cta')}</button></div>`;
    return;
  }
  const draw = () => {
    const u = state.user;
    const mine = (state.juntas || []).filter((j) => j.mine || j.joined);
    view.innerHTML = `
      <div class="page-head">
        <div class="row">${avatar(u.name, 'lg')}
          <div><h1 class="h2">${esc(u.name)}</h1><p class="small">${fmtPhone(u.phone)}</p></div>
          <span class="spacer"></span><button class="btn ghost sm" data-act="edit-profile">✎</button>
        </div>
        <div class="chips mt-16" style="padding-left:0;margin-left:0">
          ${u.level ? `<span class="chip">${t('lvl.' + u.level)}</span>` : ''}
          ${u.origin ? `<span class="chip">${t('org.' + u.origin)}</span>` : ''}
        </div>
      </div>
      <div class="section">
        ${u.socio ? carnetHTML(u.socio) : `<a class="card card-pad row" href="#/socios" style="background:linear-gradient(120deg,#3b2a17,#262626)"><span style="font-size:28px">⭐</span><div><b class="h3">${t('me.become')}</b><p class="small">${t('p.separte.text')}</p></div></a>`}
      </div>
      <div class="section">
        <span class="eyebrow">${t('me.juntas')}</span>
        <div class="mt-12">${mine.length ? mine.map(juntaCard).join('') : `<p class="small">${t('me.none')}</p>`}</div>
      </div>
      <div class="section mt-12"><button class="btn ghost block" data-act="logout">${t('me.logout')}</button></div>`;
  };
  draw();
  if (!state.socios) loadSocios().catch(() => {});
  await loadJuntas().catch(() => {});
  if (parseHash().path === 'perfil' && state.user) draw();
}

/* ================================================================== login (WhatsApp OTP) */

let pollTimer = null;
let afterLogin = null;

function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

function openLogin(after) {
  afterLogin = typeof after === 'function' ? after : null;
  const sheet = openSheet('', { onClose: stopPolling });
  drawLoginIntro(sheet);
}

const isManual = () => Boolean(state.config?.manualLogin);

function drawLoginIntro(sheet) {
  const m = isManual();
  sheet.set(`
    <div style="width:56px;height:56px;border-radius:16px;background:rgba(37,211,102,.15);color:var(--wa);display:grid;place-items:center">${WA_ICON.replace('<svg', '<svg width="30" height="30"')}</div>
    <h2 class="h2 mt-16">${t('login.title')}</h2>
    <p class="lead mt-8">${t('login.sub')}</p>
    <div class="steps">
      <div class="step"><i>1</i><p>${t(m ? 'login.m.s1' : 'login.s1')}</p></div>
      <div class="step"><i>2</i><p>${t(m ? 'login.m.s2' : 'login.s2')}</p></div>
      <div class="step"><i>3</i><p>${t('login.s3')}</p></div>
    </div>
    ${m ? `<label class="field"><span>${t('login.phone')}</span><input class="input" id="l-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+56 9 1234 5678" value="${esc(localStorage.getItem('lj_phone') || '')}"></label>` : ''}
    <div class="err-text" id="l-err"></div>
    <button class="btn wa block mt-8" id="l-start">${WA_ICON}${t('login.btn')}</button>`);
  $('#l-start', sheet.body).onclick = () => startLogin(sheet);
  $('#l-phone', sheet.body)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') startLogin(sheet); });
}

/** "Empezar de nuevo": manual mode goes back to the phone field; otherwise ask for a new code. */
function restartLogin(sheet) {
  stopPolling();
  if (isManual()) drawLoginIntro(sheet);
  else startLogin(sheet);
}

async function startLogin(sheet) {
  const btn = $('#l-start', sheet.body);
  const phoneInput = $('#l-phone', sheet.body);
  if (isManual() && !phoneInput) return drawLoginIntro(sheet);
  const phone = phoneInput?.value.trim();
  if (phoneInput && phone.replace(/\D/g, '').length < 8) {
    $('#l-err', sheet.body).textContent = t('login.phone.err');
    phoneInput.focus();
    return;
  }
  if (btn) btn.disabled = true;
  try {
    state.login = await api('/api/auth/start', { method: 'POST', body: { lang: getLang(), phone } });
  } catch (err) {
    if (btn) btn.disabled = false;
    $('#l-err', sheet.body).textContent = err.message;
    return;
  }
  if (state.login.manual) {
    localStorage.setItem('lj_phone', phone);
    stopPolling();
    drawOtp(sheet, { phone: state.login.phone, manual: true });
    openWhatsApp();
    return;
  }
  drawWaiting(sheet);
  openWhatsApp();
  stopPolling();
  pollTimer = setInterval(() => pollLogin(sheet), 2000);
}

function openWhatsApp() {
  const l = state.login;
  if (!l) return;
  if (isTouch()) location.href = l.waLink;
  else window.open(l.waLink, '_blank', 'noopener');
}

function drawWaiting(sheet) {
  const l = state.login;
  sheet.set(`
    <h2 class="h2">${t('login.waiting')}</h2>
    <p class="small mt-8">${t('login.sendThis')}</p>
    <div class="codebox mt-12">${esc(l.code)}</div>
    <div class="waiting mt-16"><span class="dots"><i></i><i></i><i></i></span>${t('login.waiting')}</div>
    ${!isTouch() ? `<p class="small mt-16" style="text-align:center">${t('login.desk')}</p><div class="qrbox">${qrSvg(l.waLink)}</div>` : ''}
    <button class="btn wa block mt-24" id="l-reopen">${WA_ICON}${t('login.reopen')}</button>`);
  $('#l-reopen', sheet.body).onclick = openWhatsApp;
}

async function pollLogin(sheet) {
  if (!currentSheet || currentSheet.api !== sheet) return stopPolling();
  let s;
  try { s = await api('/api/auth/status'); } catch { return; }
  if (s.status === 'code_sent' && !$('#otp', sheet.body)) drawOtp(sheet, s);
  if (s.status === 'expired' || s.status === 'none') {
    stopPolling();
    sheet.set(`<h2 class="h2">${t('login.expired')}</h2><button class="btn wa block mt-24" id="l-again">${WA_ICON}${t('login.restart')}</button>`);
    $('#l-again', sheet.body).onclick = () => restartLogin(sheet);
  }
}

function drawOtp(sheet, s) {
  const m = s.manual || isManual();
  sheet.set(`
    <div style="font-size:34px">💬</div>
    <h2 class="h2 mt-8">${t(m ? 'login.m.got' : 'login.got', { phone: esc(s.phone) })}</h2>
    <p class="small mt-8">${t(m ? 'login.m.enter' : 'login.enter')}</p>
    <input id="otp" class="otp-input mt-16" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="······">
    <div class="err-text" id="otp-err"></div>
    <div class="two mt-8">
      <button class="btn ghost" id="otp-paste">📋 ${t('login.paste')}</button>
      <button class="btn wa" id="otp-go">${t('login.verify')}</button>
    </div>
    ${m && state.login?.waLink ? `<button class="btn ghost block mt-12" id="l-reopen">${WA_ICON}${t('login.reopen')}</button>` : ''}
    <button class="small mt-16" id="otp-restart" style="display:block;margin:16px auto 0;text-decoration:underline">${t('login.restart')}</button>`);
  const reopen = $('#l-reopen', sheet.body);
  if (reopen) reopen.onclick = openWhatsApp;
  const input = $('#otp', sheet.body);
  setTimeout(() => input.focus(), 350);
  const submit = async () => {
    const otp = input.value.replace(/\D/g, '');
    if (otp.length !== 6) return;
    $('#otp-go', sheet.body).disabled = true;
    try {
      const { user, isNew } = await api('/api/auth/verify', { method: 'POST', body: { otp } });
      stopPolling();
      state.login = null;
      await loadMe();
      closeSheet(true);
      const first = user.name.split(' ')[0];
      toast((first ? t('login.welcome', { name: first }) : t('login.welcome0')) + ' 🧗');
      const done = () => { const fn = afterLogin; afterLogin = null; router().then(() => fn?.()); };
      if (isNew || !user.onboarded) openOnboarding(done);
      else done();
    } catch (err) {
      input.classList.remove('err'); void input.offsetWidth; input.classList.add('err');
      $('#otp-err', sheet.body).textContent = err.message;
      $('#otp-go', sheet.body).disabled = false;
      input.select();
    }
  };
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) submit();
  });
  $('#otp-go', sheet.body).onclick = submit;
  $('#otp-paste', sheet.body).onclick = async () => {
    let v = '';
    try { v = (await navigator.clipboard.readText()).replace(/\D/g, '').slice(0, 6); } catch {}
    if (v) { input.value = v; submit(); }
  };
  $('#otp-restart', sheet.body).onclick = () => restartLogin(sheet);
}

/* ---------------------------------------------- onboarding */

function openOnboarding(done) {
  const u = state.user;
  const f = { name: u.name || '', level: u.level || '', origin: u.origin || '' };
  const sheet = openSheet('', { noClose: false, onClose: () => setTimeout(done, 0) });
  let saved = false;
  const draw = () => sheet.set(`
    <h2 class="h2">${t('ob.title')}</h2>
    <p class="small mt-8">${t('ob.sub')}</p>
    <label class="field"><span>${t('ob.name')}</span><input class="input" id="ob-name" value="${esc(f.name)}" maxlength="60" autocomplete="name"></label>
    <div class="field"><span>${t('ob.level')}</span><div class="choice">
      ${[['empiezo', '🌱'], ['escalo', '🧗'], ['anos', '🏔️']].map(([k, e]) => `<button type="button" data-l="${k}" class="${f.level === k ? 'active' : ''}"><span class="e">${e}</span>${t('ob.level.' + k)}</button>`).join('')}
    </div></div>
    <div class="field"><span>${t('ob.origin')}</span><div class="choice">
      ${[['pv', '🌋'], ['chile', '🇨🇱'], ['mundo', '🌎']].map(([k, e]) => `<button type="button" data-o="${k}" class="${f.origin === k ? 'active' : ''}"><span class="e">${e}</span>${t('ob.origin.' + k)}</button>`).join('')}
    </div></div>
    <div class="err-text" id="ob-err"></div>
    <button class="btn block mt-8" id="ob-save">${t('ob.save')}</button>`);
  draw();
  sheet.body.addEventListener('click', async (e) => {
    const l = e.target.closest('[data-l]');
    const o = e.target.closest('[data-o]');
    if (l || o) {
      f.name = $('#ob-name', sheet.body).value;
      if (l) f.level = l.dataset.l;
      if (o) {
        f.origin = o.dataset.o;
        // A visiting climber gets the app in English right away.
        if (f.origin === 'mundo' && getLang() !== 'en') { setLang('en'); renderTopbar(); toast('Switched to English 🌎'); }
      }
      draw();
      return;
    }
    if (!e.target.closest('#ob-save') || saved) return;
    f.name = $('#ob-name', sheet.body).value.trim();
    try {
      const { user } = await api('/api/me', { method: 'PATCH', body: { ...f, lang: getLang() } });
      saved = true;
      state.user = { ...state.user, ...user };
      renderTopbar();
      closeSheet();
    } catch (err) {
      $('#ob-err', sheet.body).textContent = err.message;
    }
  });
}

/* ================================================================== global actions */

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act === 'login') return openLogin();
  if (act === 'filter') { state.filter = el.dataset.f; $('#view').innerHTML = renderJuntasHTML(); return; }
  if (act === 'new-junta') return openJuntaForm();
  if (act === 'become') return openCheckout();
  if (act === 'edit-profile') return openOnboarding(() => router());
  if (act === 'logout') {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    renderTopbar();
    location.hash = '#/';
    return;
  }
  if (act === 'join') {
    if (!state.user) return openLogin(() => joinJunta(id));
    return joinJunta(id);
  }
  if (act === 'leave') {
    el.disabled = true;
    await api(`/api/juntas/${id}/join`, { method: 'DELETE' }).catch((err) => toast(err.message));
    return refreshAfterJuntaChange();
  }
  if (act === 'del-junta') {
    // Two taps instead of a confirm() dialog.
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = t('j.sure'); setTimeout(() => { delete el.dataset.armed; el.textContent = t('j.delete'); }, 3000); return; }
    await api(`/api/juntas/${id}`, { method: 'DELETE' }).catch((err) => toast(err.message));
    return refreshAfterJuntaChange();
  }
});

async function joinJunta(id) {
  try {
    await api(`/api/juntas/${id}/join`, { method: 'POST' });
    toast('🤝 ' + t('j.joined'));
  } catch (err) { toast(err.message); }
  if (parseHash().path !== 'juntas') location.hash = '#/juntas';
  else refreshAfterJuntaChange();
}

async function refreshAfterJuntaChange() {
  await loadJuntas();
  const p = parseHash().path;
  if (p === 'juntas') $('#view').innerHTML = renderJuntasHTML();
  if (p === 'perfil') router();
  loadHome().catch(() => {});
}

$('#lang-btn').addEventListener('click', async () => {
  setLang(getLang() === 'es' ? 'en' : 'es');
  renderTopbar();
  if (state.user) api('/api/me', { method: 'PATCH', body: { lang: getLang() } }).catch(() => {});
  if (state.gym) { state.gym.destroy(); state.gym = null; }
  router();
});

// Coming back from the WhatsApp app: check the login right away instead of waiting for the next poll.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && pollTimer && currentSheet) pollLogin(currentSheet.api);
});

/* ================================================================== boot */

async function boot() {
  setLang(getLang());
  $('#desk-qr').innerHTML = qrSvg(location.origin + '/');
  renderTopbar();
  try { state.config = await api('/api/config'); } catch { state.config = {}; }
  await loadMe().catch(() => {});
  window.addEventListener('hashchange', router);
  await router();
  // A login that was in progress before WhatsApp took over the screen (some phones reload the tab).
  const s = await api('/api/auth/status').catch(() => null);
  if (s && (s.status === 'waiting' || s.status === 'code_sent') && !state.user) {
    const sheet = openSheet('', { onClose: stopPolling });
    if (s.status === 'code_sent') drawOtp(sheet, s);
    else { state.login = null; drawLoginIntro(sheet); }
    stopPolling();
    pollTimer = setInterval(() => pollLogin(sheet), 2000);
  }
}

boot();
