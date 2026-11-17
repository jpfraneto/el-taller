// Árbol de Lilith · the niche (El Taller Ep. 07, ../../../SOFTWARE-EVOLUTIVO.md).
//
// This Worker is the ROUTER that owns arboldelilith.jpfraneto.com. It does three things, the same for every product:
//   1. Login (phone + 6-digit code; Pili by a private link) and the data (D1): products never implement either.
//   2. The contract (/api/*): her events, inscriptions, payments, the "te leo" messages, who's logged in.
//   3. Which product is served: the champion (one value in D1, Pili picks it at /pili), or a challenger for whoever
//      opened ?probar=<id> (a cookie). A product is a folder of static files in public/p/<id>/; its index.html is
//      served at "/" and its other files at "/<file>". Changing the champion = one row, nothing redeployed.
//
// Payment priority (JP, 2026-11-10): paying locks your place; signing up without paying is allowed, but when places
// run out, paid places win (PRIORIDAD_PAGADAS). Places are computed, never rewritten: see lugares().

import PRODUCTOS from './productos.json';

const TZ = 'America/Santiago';
const DAY = 24 * 60 * 60 * 1000;
const OTP_TTL = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL = 120 * DAY;
const DEMO_CODE = '888888';
const PRIORIDAD_PAGADAS = true; // false = first come, first served (paid or not)
const MP_API = 'https://api.mercadopago.com';
const MP_LINK_TTL = 3 * DAY;
const COOKIE = 'al_session';
const PROBAR = 'al_probar';
const MODALIDADES = ['presencial', 'online'];
const MAX_REGALOS = 5; // places you can gift in one go, besides your own

// The 1:1 hour (JP, 2026-11-10: "una hora 1:1 por 40 lucas"). Price overridable with the SESION_PRECIO var.
const SESION = {
  nombre: 'Una hora 1:1 con Pili',
  linea: 'Una hora para ti sola: una lectura de Tarot Madre Paz, una sesión de terapia o, simplemente, conversar lo que estás viviendo.',
  duracion: 60,
  motivos: ['Lectura de Tarot Madre Paz', 'Terapia (Gestalt, menstrual, Biografía Humana)', 'Conversar, no sé todavía'],
  modalidades: { presencial: 'Presencial, en Llanquihue', online: 'Online' },
};
const sesionPrecio = (env) => (+env.SESION_PRECIO > 0 ? Math.round(+env.SESION_PRECIO) : 40000);

// What she offers, in her words (her posts). accion: what the button opens in a product ('hora' = the 1:1 hour).
const OFRECE = [
  { id: 'hora', nombre: SESION.nombre, linea: SESION.linea, precio: '$40.000 · 1 hora', accion: 'hora', destacado: true },
  { id: 'circulos', nombre: 'Círculos de Mujeres', linea: 'Al compás de la luna. Para encontrarnos, respirar juntas y acompañar lo que está cambiando dentro de nosotras.', precio: 'Aporte desde $10.000' },
  { id: 'talleres', nombre: 'Talleres', linea: 'Ciclicidad femenina, Sahumar: Humos Sagrados, Caldero de Tierra y Agua.', precio: 'Según el taller' },
  { id: 'tarot', nombre: 'Lectura de Tarot Madre Paz', linea: 'Una lectura para mirar tu momento con más claridad.', precio: 'En una hora 1:1', accion: 'hora' },
  { id: 'terapia', nombre: 'Terapia individual', linea: 'Gestalt, Eneagrama, terapia menstrual y Biografía Humana.', precio: 'En una hora 1:1', accion: 'hora' },
  { id: 'utero', nombre: 'Bendición de Útero', linea: 'Moon Mother nivel 2. Armonizar y sincronizar la energía femenina.', precio: null },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      return await route(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
      console.error(err);
      return json({ error: 'server_error', message: 'Algo falló. Intenta de nuevo.' }, 500);
    }
  },
};

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

async function route(req, env, url) {
  const p = url.pathname;
  const m = req.method;

  if (p.startsWith('/api/')) return api(req, env, url, p, m);
  if (p === '/mp/vuelta') return mpVuelta(env, url);
  if (p === '/mp/webhook' && m === 'POST') return mpWebhook(req, env, url);
  const entrar = p.match(/^\/pili\/entrar\/([A-Za-z0-9_-]{8,80})$/);
  if (entrar) return piliEntrar(env, url, entrar[1]);
  if (m !== 'GET' && m !== 'HEAD') return json({ error: 'method' }, 405);

  // Shared files and the dueña's console are the niche's, not a product's.
  if (p.startsWith('/comun/') || p.startsWith('/p/')) return env.ASSETS.fetch(req);
  if (p === '/pili' || p.startsWith('/pili/')) return env.ASSETS.fetch(req);
  if (p === '/manifest.webmanifest' || p === '/favicon.ico') return env.ASSETS.fetch(new Request(new URL('/comun' + (p === '/favicon.ico' ? '/icon-180.png' : p), url), req));

  // ?probar=<id> → try a challenger (cookie), ?probar= (empty) → back to the champion.
  if (url.searchParams.has('probar')) {
    const id = url.searchParams.get('probar');
    const ok = PRODUCTOS.some((x) => x.id === id);
    const back = new URL(url); back.searchParams.delete('probar');
    return new Response(null, { status: 302, headers: { location: back.pathname + back.search + back.hash, 'set-cookie': setCookie(PROBAR, ok ? id : '', url, ok ? 30 * 86400 : 0, false) } });
  }

  const { activo } = await nichoEstado(req, env);
  const file = p === '/' || p === '/index.html' ? '/' : p;
  const res = await env.ASSETS.fetch(new Request(new URL(`/p/${activo}${file}`, url), req));
  // Same URL, different product: never let the browser reuse the other product's file.
  const h = new Headers(res.headers);
  h.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers: h });
}

async function api(req, env, url, p, m) {
  if (p === '/api/nicho' && m === 'GET') return json(await nichoEstado(req, env));
  if (p === '/api/cosa' && m === 'GET') return json(cosa(env));
  if (p === '/api/yo' && m === 'GET') { const u = await currentUser(req, env); return json({ user: u ? publicUser(u) : null }); }
  if (p === '/api/auth/start' && m === 'POST') return authStart(req, env);
  if (p === '/api/auth/verify' && m === 'POST') return authVerify(req, env, url);
  if (p === '/api/auth/salir' && m === 'POST') return salir(req, env, url);
  if (p === '/api/eventos' && m === 'GET') return getEventos(req, env);
  let r;
  if ((r = p.match(/^\/api\/eventos\/(\d+)\/inscribir$/)) && m === 'POST') return inscribir(req, env, url, +r[1]);
  if ((r = p.match(/^\/api\/inscripciones\/(\d+)\/pagar$/)) && m === 'POST') return pagar(req, env, url, +r[1]);
  if ((r = p.match(/^\/api\/inscripciones\/(\d+)\/cancelar$/)) && m === 'POST') return cancelar(req, env, +r[1]);
  if ((r = p.match(/^\/api\/demo\/pagar\/(\d+)$/)) && m === 'POST') return demoPagar(req, env, +r[1]);
  if (p === '/api/mias' && m === 'GET') return getMias(req, env);
  if (p === '/api/mensajes' && m === 'POST') return postMensaje(req, env);
  if (p === '/api/sesion' && m === 'GET') return sesionInfo(env);
  if (p === '/api/sesiones' && m === 'POST') return pedirSesion(req, env, url);
  if ((r = p.match(/^\/api\/sesiones\/(\d+)\/pagar$/)) && m === 'POST') return pagarSesion(req, env, url, +r[1]);

  // Pili (dueña) only.
  if (p.startsWith('/api/pili/')) {
    await requireDuena(req, env);
    if (p === '/api/pili/resumen' && m === 'GET') return piliResumen(env);
    if ((r = p.match(/^\/api\/pili\/inscripciones\/(\d+)$/)) && m === 'POST') return piliInscripcion(req, env, +r[1]);
    if (p === '/api/pili/mensajes' && m === 'GET') return piliMensajes(env);
    if ((r = p.match(/^\/api\/pili\/mensajes\/(\d+)\/leido$/)) && m === 'POST') return piliLeido(env, +r[1]);
    if (p === '/api/pili/eventos' && m === 'POST') return piliEvento(req, env, null);
    if ((r = p.match(/^\/api\/pili\/eventos\/(\d+)$/)) && m === 'POST') return piliEvento(req, env, +r[1]);
    if (p === '/api/pili/campeon' && m === 'POST') return piliCampeon(req, env);
    if ((r = p.match(/^\/api\/pili\/sesiones\/(\d+)$/)) && m === 'POST') return piliSesion(req, env, +r[1]);
  }
  return json({ error: 'not_found' }, 404);
}

// ---------- helpers ----------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
async function body(req) { try { return await req.json(); } catch { return {}; } }
function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setCookie(name, value, url, maxAgeSec, httpOnly = true) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/;${httpOnly ? ' HttpOnly;' : ''} SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
function randomOtp() {
  const a = new Uint32Array(1); let n;
  do { crypto.getRandomValues(a); n = a[0]; } while (n >= 4294000000);
  return String(n % 1000000).padStart(6, '0');
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function clean(s, max = 120) { return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function cleanText(s, max = 2000) { return String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max); }
/** "+56 9 8549 1126", "9 8549 1126" → "56985491126". */
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  if (d.length === 8) d = '569' + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}
/** Today in Chile, YYYY-MM-DD. */
function hoy(ts = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}
async function safeEqual(a, b) { return (await sha256('k:' + a)) === (await sha256('k:' + b)); }

// ---------- the niche ----------

async function nichoEstado(req, env) {
  const row = await env.DB.prepare(`SELECT v FROM nicho WHERE k = 'campeon'`).first();
  const campeon = PRODUCTOS.some((x) => x.id === (row && row.v)) ? row.v : PRODUCTOS[0].id;
  const probar = cookies(req)[PROBAR];
  const activo = probar && PRODUCTOS.some((x) => x.id === probar) ? probar : campeon;
  return { campeon, activo, probando: activo !== campeon, productos: PRODUCTOS };
}

function cosa(env) {
  return {
    nombre: 'Árbol de Lilith',
    persona: 'Pilar Abarzúa',
    le_dicen: 'Pili',
    donde: 'Llanquihue · Puerto Varas',
    instagram: 'arboldelilith',
    whatsapp: env.PILI_WA || null,
    frases: ['Nada florece todo el año. Y nosotras tampoco.', 'Soltar no es perder. Soltar es confiar.', 'Te leo.'],
    ofrece: OFRECE,
    demo: env.DEMO === '1',
  };
}

// ---------- login ----------

async function currentUser(req, env) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(await sha256(token), Date.now()).first();
}
async function requireUser(req, env) {
  const u = await currentUser(req, env);
  if (!u) throw new HttpError(401, 'login', 'Entra con tu teléfono.');
  return u;
}
async function requireDuena(req, env) {
  const u = await requireUser(req, env);
  if (u.role !== 'duena') throw new HttpError(403, 'solo_pili', 'Esto es solo para Pili.');
  return u;
}
function publicUser(u) {
  return { id: u.id, name: u.name || '', firstName: clean(u.name).split(' ')[0] || '', phone: u.phone, role: u.role };
}
async function newSession(env, url, userId) {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256(token), userId, now, now + SESSION_TTL).run();
  return setCookie(COOKIE, token, url, SESSION_TTL / 1000);
}

async function authStart(req, env) {
  const b = await body(req);
  const phone = normalizePhone(b.phone);
  if (!phone) throw new HttpError(400, 'telefono', 'Revisa el número: 9 dígitos, empieza con 9.');
  const now = Date.now();
  const prev = await env.DB.prepare(`SELECT created_at FROM login_codes WHERE phone = ?`).bind(phone).first();
  if (prev && now - prev.created_at < 15 * 1000) throw new HttpError(429, 'espera', 'Espera unos segundos antes de pedir otro código.');
  const code = env.DEMO_OTP === '1' ? DEMO_CODE : randomOtp();
  await env.DB.prepare(
    `INSERT INTO login_codes (phone, code_hash, attempts, created_at, expires_at) VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, created_at = excluded.created_at, expires_at = excluded.expires_at`
  ).bind(phone, await sha256(phone + ':' + code), now, now + OTP_TTL).run();
  // Production: send `code` by WhatsApp (Cloud API template) here. Prototype: shown on screen as a fake message.
  const user = await env.DB.prepare(`SELECT name FROM users WHERE phone = ?`).bind(phone).first();
  const out = { status: 'enviado', phone, nuevo: !user || !user.name, name: user ? clean(user.name).split(' ')[0] : '' };
  if (env.DEMO_OTP === '1') out.demoCode = code;
  return json(out);
}

async function authVerify(req, env, url) {
  const b = await body(req);
  const phone = normalizePhone(b.phone);
  const code = String(b.code || '').replace(/\D/g, '');
  if (!phone || code.length !== 6) throw new HttpError(400, 'codigo', 'El código tiene 6 dígitos.');
  const row = await env.DB.prepare(`SELECT * FROM login_codes WHERE phone = ?`).bind(phone).first();
  const now = Date.now();
  if (!row || row.expires_at < now) throw new HttpError(400, 'vencido', 'El código venció. Pide otro.');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'intentos', 'Demasiados intentos. Pide otro código.');
  if (row.code_hash !== (await sha256(phone + ':' + code))) {
    await env.DB.prepare(`UPDATE login_codes SET attempts = attempts + 1 WHERE phone = ?`).bind(phone).run();
    throw new HttpError(400, 'incorrecto', 'Ese código no es. Revisa el mensaje.');
  }
  await env.DB.prepare(`DELETE FROM login_codes WHERE phone = ?`).bind(phone).run();
  const name = clean(b.name, 60);
  let user = await env.DB.prepare(`SELECT * FROM users WHERE phone = ?`).bind(phone).first();
  if (!user) {
    user = await env.DB.prepare(`INSERT INTO users (phone, name, role, created_at) VALUES (?, ?, 'persona', ?) RETURNING *`).bind(phone, name, now).first();
  } else if (name && !user.name) {
    user = await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ? RETURNING *`).bind(name, user.id).first();
  }
  return json({ ok: true, user: publicUser(user) }, 200, { 'set-cookie': await newSession(env, url, user.id) });
}

async function salir(req, env, url) {
  const token = cookies(req)[COOKIE];
  if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': setCookie(COOKIE, '', url, 0) });
}

/** Pili's door: a private link JP sends her by WhatsApp. One tap, no password, no code. */
async function piliEntrar(env, url, key) {
  if (!env.PILI_KEY || !(await safeEqual(key, env.PILI_KEY))) return new Response('Este link no es válido.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  let u = await env.DB.prepare(`SELECT * FROM users WHERE role = 'duena' ORDER BY id LIMIT 1`).first();
  if (!u) u = await env.DB.prepare(`INSERT INTO users (phone, name, role, created_at) VALUES (NULL, 'Pili', 'duena', ?) RETURNING *`).bind(Date.now()).first();
  return new Response(null, { status: 302, headers: { location: '/pili/', 'set-cookie': await newSession(env, url, u.id) } });
}

// ---------- events and places ----------

function precioActual(precios, dia = hoy()) {
  let list = [];
  try { list = JSON.parse(precios || '[]'); } catch {}
  const i = list.findIndex((x) => !x.hasta || x.hasta >= dia);
  if (i < 0) return { monto: list.length ? list[list.length - 1].monto : 0, hasta: null, siguiente: null, tramos: list };
  return { monto: list[i].monto, hasta: list[i].hasta || null, siguiente: list[i + 1] ? list[i + 1].monto : null, tramos: list };
}

/**
 * Who has a place, per modality. Paid ones first (by when they paid), then reservations without payment (by when
 * they signed up); the first `cupos` have a place, the rest wait. So a payment can push an unpaid reservation to the
 * waiting list, never a paid one. Nothing is rewritten: it's recomputed every time.
 */
function lugares(rows, cupos) {
  const activos = rows.filter((r) => r.estado === 'pagada' || r.estado === 'reservada');
  activos.sort((a, b) => {
    if (PRIORIDAD_PAGADAS && a.estado !== b.estado) return a.estado === 'pagada' ? -1 : 1;
    const ta = PRIORIDAD_PAGADAS && a.estado === 'pagada' ? a.pagada_at : a.created_at;
    const tb = PRIORIDAD_PAGADAS && b.estado === 'pagada' ? b.pagada_at : b.created_at;
    return ta - tb || a.id - b.id;
  });
  const out = new Map();
  activos.forEach((r, i) => out.set(r.id, i < cupos ? (r.estado === 'pagada' ? 'asegurado' : 'reservado') : 'espera'));
  const pagadas = activos.filter((r) => r.estado === 'pagada').length;
  const reservadas = activos.length - pagadas;
  return {
    lugar: out,
    resumen: {
      cupos, pagadas, reservadas,
      libres: Math.max(0, cupos - activos.length),
      // a payment still gets a place while paid ones haven't filled it
      puedePagar: pagadas < cupos,
      espera: Math.max(0, activos.length - cupos),
    },
  };
}

async function cargarEvento(env, id) {
  const ev = await env.DB.prepare(`SELECT * FROM eventos WHERE id = ?`).bind(id).first();
  if (!ev) throw new HttpError(404, 'evento', 'Ese encuentro no existe.');
  const { results } = await env.DB.prepare(`SELECT i.*, u.name, u.phone, g.name AS regalo_de_nombre FROM inscripciones i JOIN users u ON u.id = i.user_id LEFT JOIN users g ON g.id = i.regalo_de WHERE i.evento_id = ?`).bind(id).all();
  return { ev, rows: results };
}

function vistaEvento(ev, rows, user) {
  const mod = {};
  const lugarDe = new Map();
  for (const m of MODALIDADES) {
    const cupos = m === 'presencial' ? ev.cupos_presencial : ev.cupos_online;
    if (!cupos) continue;
    const l = lugares(rows.filter((r) => r.modalidad === m), cupos);
    mod[m] = l.resumen;
    l.lugar.forEach((v, k) => lugarDe.set(k, v));
  }
  const mia = user && rows.find((r) => r.user_id === user.id && r.estado !== 'cancelada');
  return {
    id: ev.id, tipo: ev.tipo, nombre: ev.nombre, bajada: ev.bajada, descripcion: ev.descripcion,
    fecha: ev.fecha, hora: ev.hora, hora_fin: ev.hora_fin, lugar: ev.lugar, luna: ev.luna, pregunta: ev.pregunta,
    estado: ev.estado, precio: precioActual(ev.precios), modalidades: mod,
    mia: mia ? { id: mia.id, modalidad: mia.modalidad, estado: mia.estado, lugar: lugarDe.get(mia.id) || null, monto: mia.monto, regaloDe: mia.regalo_de_nombre || null } : null,
    // places I gifted (only to me: I typed their names and numbers)
    regalos: user ? rows.filter((r) => r.regalo_de === user.id && r.estado !== 'cancelada').map((r) => ({
      id: r.id, nombre: r.name || '', telefono: r.phone || null, modalidad: r.modalidad, estado: r.estado, lugar: lugarDe.get(r.id) || null,
    })) : [],
  };
}

async function getEventos(req, env) {
  const user = await currentUser(req, env);
  const { results: evs } = await env.DB.prepare(`SELECT * FROM eventos WHERE estado = 'abierto' AND fecha >= ? ORDER BY fecha, hora`).bind(hoy()).all();
  if (!evs.length) return json({ eventos: [] });
  const ids = evs.map((e) => e.id);
  const { results: rows } = await env.DB.prepare(`SELECT i.*, u.name, u.phone, g.name AS regalo_de_nombre FROM inscripciones i JOIN users u ON u.id = i.user_id LEFT JOIN users g ON g.id = i.regalo_de WHERE i.evento_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  return json({ eventos: evs.map((e) => vistaEvento(e, rows.filter((r) => r.evento_id === e.id), user)) });
}

async function inscribir(req, env, url, eventoId) {
  const u = await requireUser(req, env);
  const b = await body(req);
  const { ev } = await cargarEvento(env, eventoId);
  if (ev.estado !== 'abierto' || ev.fecha < hoy()) throw new HttpError(400, 'cerrado', 'Este encuentro ya no recibe inscripciones.');
  const modalidad = MODALIDADES.includes(b.modalidad) ? b.modalidad : 'presencial';
  const cupos = modalidad === 'presencial' ? ev.cupos_presencial : ev.cupos_online;
  if (!cupos) throw new HttpError(400, 'modalidad', `Este encuentro no es ${modalidad}.`);
  if (clean(b.name, 60) && !u.name) await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`).bind(clean(b.name, 60), u.id).run();
  const yo = b.yo !== false;
  // Gifted places: a name (required) and her WhatsApp (optional: with it, she sees her place when she logs in).
  const invitadas = (Array.isArray(b.invitadas) ? b.invitadas : []).slice(0, MAX_REGALOS).map((x) => {
    const nombre = clean(x && x.nombre, 60);
    if (!nombre) throw new HttpError(400, 'nombre', 'Falta el nombre de la persona a la que le regalas el lugar.');
    const raw = clean(x && x.telefono, 30);
    const telefono = raw ? normalizePhone(raw) : null;
    if (raw && !telefono) throw new HttpError(400, 'telefono', `Revisa el WhatsApp de ${nombre}.`);
    if (telefono && telefono === u.phone) throw new HttpError(400, 'telefono', 'Ese número es el tuyo: marca «Yo también voy».');
    return { nombre, telefono };
  });
  const tels = invitadas.map((x) => x.telefono).filter(Boolean);
  if (new Set(tels).size !== tels.length) throw new HttpError(400, 'telefono', 'Hay dos lugares con el mismo WhatsApp.');
  if (!yo && !invitadas.length) throw new HttpError(400, 'vacio', 'Elige al menos un lugar.');

  const { rows } = await cargarEvento(env, eventoId);
  const l = lugares(rows.filter((r) => r.modalidad === modalidad), cupos);
  const now = Date.now();
  const ids = [];
  const nuevos = [];
  // gifted places first (checks only: nothing is written until we know it fits)
  for (const x of invitadas) {
    let g = x.telefono ? await env.DB.prepare(`SELECT * FROM users WHERE phone = ?`).bind(x.telefono).first() : null;
    if (g) {
      const ya = await env.DB.prepare(`SELECT estado FROM inscripciones WHERE evento_id = ? AND user_id = ?`).bind(eventoId, g.id).first();
      if (ya && ya.estado !== 'cancelada') throw new HttpError(400, 'ya', `${x.nombre} ya tiene su lugar en este encuentro.`);
    }
    nuevos.push({ ...x, user: g });
  }
  const prev = yo ? await env.DB.prepare(`SELECT * FROM inscripciones WHERE evento_id = ? AND user_id = ?`).bind(eventoId, u.id).first() : null;
  const yoPaga = yo && !(prev && prev.estado === 'pagada');
  if (b.pagar && (yoPaga ? 1 : 0) + nuevos.length > cupos - l.resumen.pagadas) {
    const quedan = Math.max(0, cupos - l.resumen.pagadas);
    throw new HttpError(409, 'completo', quedan ? `Quedan ${quedan} ${quedan === 1 ? 'lugar' : 'lugares'} para pagar (${modalidad}).` : 'Los lugares ya están todos pagados. Puedes anotarte en la lista de espera.');
  }
  // my place
  if (yo) {
    let insc;
    if (!prev) insc = await env.DB.prepare(`INSERT INTO inscripciones (evento_id, user_id, modalidad, estado, created_at) VALUES (?, ?, ?, 'reservada', ?) RETURNING *`).bind(eventoId, u.id, modalidad, now).first();
    else if (prev.estado === 'cancelada') insc = await env.DB.prepare(`UPDATE inscripciones SET modalidad = ?, estado = 'reservada', created_at = ?, monto = NULL, metodo = NULL, pagada_at = NULL, compra_id = NULL, regalo_de = NULL WHERE id = ? RETURNING *`).bind(modalidad, now, prev.id).first();
    else if (prev.estado === 'reservada' && prev.modalidad !== modalidad) insc = await env.DB.prepare(`UPDATE inscripciones SET modalidad = ? WHERE id = ? RETURNING *`).bind(modalidad, prev.id).first();
    else insc = prev;
    if (insc.estado !== 'pagada') ids.push(insc.id);
  }
  // each gifted place is her own inscription (found by her phone, or a new person)
  for (const n of nuevos) {
    let g = n.user;
    if (!g) g = await env.DB.prepare(`INSERT INTO users (phone, name, role, created_at) VALUES (?, ?, 'persona', ?) RETURNING *`).bind(n.telefono, n.nombre, now).first();
    else if (!g.name) await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`).bind(n.nombre, g.id).run();
    const insc = await env.DB.prepare(
      `INSERT INTO inscripciones (evento_id, user_id, modalidad, estado, regalo_de, created_at) VALUES (?, ?, ?, 'reservada', ?, ?)
       ON CONFLICT(evento_id, user_id) DO UPDATE SET modalidad = excluded.modalidad, estado = 'reservada', regalo_de = excluded.regalo_de,
         created_at = excluded.created_at, monto = NULL, metodo = NULL, pagada_at = NULL, compra_id = NULL
       RETURNING *`
    ).bind(eventoId, g.id, modalidad, u.id, now).first();
    ids.push(insc.id);
  }
  const out = await estadoInscripcion(env, eventoId, u);
  if (b.pagar && ids.length) {
    const monto = precioActual(ev.precios).monto;
    const compra = await nuevaCompra(env, u, monto * ids.length);
    await env.DB.prepare(`UPDATE inscripciones SET compra_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`).bind(compra.id, ...ids).run();
    const title = `Árbol de Lilith · ${ev.nombre} · ${ids.length} ${ids.length === 1 ? 'lugar' : 'lugares'} (${modalidad})`;
    return json({ ...out, pago: await linkDePago(env, url, compra, title) });
  }
  return json(out);
}

async function estadoInscripcion(env, eventoId, user) {
  const { ev, rows } = await cargarEvento(env, eventoId);
  return { evento: vistaEvento(ev, rows, user) };
}

async function getMias(req, env) {
  const u = await requireUser(req, env);
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT e.* FROM eventos e JOIN inscripciones i ON i.evento_id = e.id WHERE (i.user_id = ? OR i.regalo_de = ?) AND i.estado != 'cancelada' AND e.fecha >= ? ORDER BY e.fecha`
  ).bind(u.id, u.id, hoy()).all();
  const out = [];
  for (const e of results) {
    const { rows } = await cargarEvento(env, e.id);
    out.push(vistaEvento(e, rows, u));
  }
  const { results: ses } = await env.DB.prepare(`SELECT * FROM sesiones WHERE user_id = ? AND estado != 'cancelada' ORDER BY created_at DESC LIMIT 20`).bind(u.id).all();
  return json({ eventos: out, sesiones: ses.map(vistaSesion) });
}

async function cancelar(req, env, id) {
  const u = await requireUser(req, env);
  const insc = await env.DB.prepare(`SELECT * FROM inscripciones WHERE id = ? AND (user_id = ? OR regalo_de = ?)`).bind(id, u.id, u.id).first();
  if (!insc) throw new HttpError(404, 'no_existe');
  if (insc.estado === 'pagada') throw new HttpError(400, 'pagada', 'Ese lugar ya está pagado: escríbele a Pili para ver qué hacer.');
  await env.DB.prepare(`UPDATE inscripciones SET estado = 'cancelada' WHERE id = ?`).bind(id).run();
  return json(await estadoInscripcion(env, insc.evento_id, u));
}

// ---------- the 1:1 hour ----------

function vistaSesion(s) {
  return {
    id: s.id, para: s.para_nombre || null, paraTelefono: s.para_telefono || null, motivo: s.motivo, modalidad: s.modalidad,
    preferencia: s.preferencia, monto: s.monto, estado: s.estado, pagada: !!s.pagada, creada: s.created_at,
  };
}

function sesionInfo(env) {
  return json({ ...SESION, precio: sesionPrecio(env) });
}

async function pedirSesion(req, env, url) {
  const u = await requireUser(req, env);
  const b = await body(req);
  const regalo = b.para === 'otra';
  const paraNombre = regalo ? clean(b.para_nombre, 60) : null;
  if (regalo && !paraNombre) throw new HttpError(400, 'nombre', '¿Para quién es la hora?');
  const rawTel = regalo ? clean(b.para_telefono, 30) : '';
  const paraTel = rawTel ? normalizePhone(rawTel) : null;
  if (rawTel && !paraTel) throw new HttpError(400, 'telefono', `Revisa el WhatsApp de ${paraNombre}.`);
  const modalidad = MODALIDADES.includes(b.modalidad) ? b.modalidad : 'presencial';
  const motivo = SESION.motivos.includes(b.motivo) ? b.motivo : SESION.motivos[SESION.motivos.length - 1];
  const monto = sesionPrecio(env);
  const s = await env.DB.prepare(
    `INSERT INTO sesiones (user_id, para_nombre, para_telefono, motivo, modalidad, preferencia, monto, estado, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pedida', ?) RETURNING *`
  ).bind(u.id, paraNombre, paraTel, motivo, modalidad, clean(b.preferencia, 160) || null, monto, Date.now()).first();
  if (!b.pagar) return json({ sesion: vistaSesion(s) });
  return json({ sesion: vistaSesion(s), pago: await pagoSesion(env, url, u, s) });
}

async function pagarSesion(req, env, url, id) {
  const u = await requireUser(req, env);
  const s = await env.DB.prepare(`SELECT * FROM sesiones WHERE id = ? AND user_id = ?`).bind(id, u.id).first();
  if (!s || s.estado === 'cancelada') throw new HttpError(404, 'no_existe');
  if (s.pagada) throw new HttpError(400, 'pagada', 'Esa hora ya está pagada.');
  return json({ pago: await pagoSesion(env, url, u, s) });
}

async function pagoSesion(env, url, u, s) {
  const compra = await nuevaCompra(env, u, s.monto);
  await env.DB.prepare(`UPDATE sesiones SET compra_id = ? WHERE id = ?`).bind(compra.id, s.id).run();
  return await linkDePago(env, url, compra, `Árbol de Lilith · Una hora 1:1 con Pili${s.para_nombre ? ` (regalo para ${s.para_nombre})` : ''}`);
}

// ---------- payments: one compra = one payment for one or more places, or a 1:1 hour ----------

async function nuevaCompra(env, u, monto) {
  return await env.DB.prepare(`INSERT INTO compras (user_id, monto, estado, created_at) VALUES (?, ?, 'pendiente', ?) RETURNING *`).bind(u.id, monto, Date.now()).first();
}

/** Pay a place that was reserved without paying (mine, or one I gifted). */
async function pagar(req, env, url, id) {
  const u = await requireUser(req, env);
  const insc = await env.DB.prepare(`SELECT * FROM inscripciones WHERE id = ? AND (user_id = ? OR regalo_de = ?)`).bind(id, u.id, u.id).first();
  if (!insc || insc.estado === 'cancelada') throw new HttpError(404, 'no_existe');
  if (insc.estado === 'pagada') throw new HttpError(400, 'pagada', 'Ya está pagado.');
  const { ev, rows } = await cargarEvento(env, insc.evento_id);
  const cupos = insc.modalidad === 'presencial' ? ev.cupos_presencial : ev.cupos_online;
  if (!lugares(rows.filter((r) => r.modalidad === insc.modalidad), cupos).resumen.puedePagar) throw new HttpError(409, 'completo', 'Los lugares ya están todos pagados. Quedas en la lista de espera: si alguien se baja, te avisamos.');
  const compra = await nuevaCompra(env, u, precioActual(ev.precios).monto);
  await env.DB.prepare(`UPDATE inscripciones SET compra_id = ? WHERE id = ?`).bind(compra.id, id).run();
  return json({ pago: await linkDePago(env, url, compra, `Árbol de Lilith · ${ev.nombre} (${insc.modalidad})`) });
}

/** Mercado Pago when Pili's token is set; otherwise (prototype) a payment screen marked as a test. */
async function linkDePago(env, url, compra, title) {
  if (!env.MP_ACCESS_TOKEN) {
    if (env.DEMO !== '1') throw new HttpError(503, 'sin_pago', 'Por ahora el pago es por transferencia: Pili te escribe.');
    return { tipo: 'demo', compra: compra.id, monto: compra.monto, title };
  }
  const link = await createMpLink(env, url, { compra, title });
  return { tipo: 'mercadopago', url: link.checkout_url, monto: compra.monto, title };
}

/** Marks everything in a compra as paid, once. */
async function compraPagada(env, compraId, metodo, paidAt = Date.now()) {
  const c = await env.DB.prepare(`UPDATE compras SET estado = 'pagada', metodo = ?, pagada_at = ? WHERE id = ? AND estado != 'pagada' RETURNING *`).bind(metodo, paidAt, compraId).first();
  if (!c) return false;
  const n = await env.DB.prepare(`SELECT COUNT(*) n FROM inscripciones WHERE compra_id = ?`).bind(compraId).first();
  if (n.n) {
    await env.DB.prepare(`UPDATE inscripciones SET estado = 'pagada', monto = ?, metodo = ?, pagada_at = ? WHERE compra_id = ? AND estado != 'pagada'`)
      .bind(Math.round(c.monto / n.n), metodo, paidAt, compraId).run();
  }
  await env.DB.prepare(`UPDATE sesiones SET pagada = 1, metodo = ? WHERE compra_id = ?`).bind(metodo, compraId).run();
  return true;
}

async function demoPagar(req, env, id) {
  if (env.DEMO !== '1' || env.MP_ACCESS_TOKEN) throw new HttpError(404, 'not_found');
  const u = await requireUser(req, env);
  const c = await env.DB.prepare(`SELECT * FROM compras WHERE id = ? AND user_id = ?`).bind(id, u.id).first();
  if (!c) throw new HttpError(404, 'no_existe');
  await compraPagada(env, c.id, 'demo');
  const insc = await env.DB.prepare(`SELECT evento_id FROM inscripciones WHERE compra_id = ? LIMIT 1`).bind(c.id).first();
  if (insc) return json(await estadoInscripcion(env, insc.evento_id, u));
  const s = await env.DB.prepare(`SELECT * FROM sesiones WHERE compra_id = ?`).bind(c.id).first();
  return json({ sesion: s ? vistaSesion(s) : null });
}

async function mpFetch(env, path, init = {}) {
  const res = await fetch(MP_API + path, { ...init, headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('mercadopago', path, res.status, JSON.stringify(data).slice(0, 800));
    throw new HttpError(502, 'mercadopago', `Mercado Pago respondió ${res.status}.`);
  }
  return data;
}

const baseUrl = (env, url) => (env.PUBLIC_URL || url.origin).replace(/\/$/, '');

async function createMpLink(env, url, { compra, title }) {
  const now = Date.now();
  const amount = compra.monto;
  const base = baseUrl(env, url);
  const ref = `compra-${compra.id}-${randomToken(9).replace(/[^A-Za-z0-9]/g, 'x')}`;
  const online = { success_url: `${base}/mp/vuelta`, failure_url: `${base}/mp/vuelta`, pending_url: `${base}/mp/vuelta` };
  if (base.startsWith('https://')) online.auto_return = 'approved';
  const order = await mpFetch(env, '/v1/orders', {
    method: 'POST',
    headers: { 'x-idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      type: 'online', processing_mode: 'manual', total_amount: String(amount), external_reference: ref,
      expiration_time: 'P3D', description: title, config: { statement_descriptor: 'ARBOL DE LILITH', online },
      items: [{ external_code: `compra-${compra.id}`, title, quantity: 1, unit_price: String(amount) }],
    }),
  });
  if (!order.id || !order.checkout_url) throw new HttpError(502, 'mercadopago', 'Mercado Pago no devolvió el link.');
  const link = { ref, order_id: order.id, compra_id: compra.id, amount, title, checkout_url: order.checkout_url, created_at: now, expires_at: now + MP_LINK_TTL };
  await env.DB.prepare(`INSERT INTO mp_links (ref, order_id, compra_id, amount, title, checkout_url, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(link.ref, link.order_id, link.compra_id, link.amount, link.title, link.checkout_url, link.created_at, link.expires_at).run();
  return link;
}

function orderEstado(o) {
  if (o.status === 'processed' && (!o.status_detail || o.status_detail === 'accredited')) return 'approved';
  if (['created', 'processing', 'action_required'].includes(o.status)) return 'pending';
  return 'rejected';
}

/** Looks the order up in MP (never trusts the notification or the redirect) and records it once. */
async function processMpOrder(env, orderId) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(orderId))) return 'desconocido';
  const link = await env.DB.prepare(`SELECT * FROM mp_links WHERE order_id = ?`).bind(String(orderId)).first();
  if (!link) return 'desconocido';
  const o = await mpFetch(env, `/v1/orders/${encodeURIComponent(orderId)}`);
  const estado = orderEstado(o);
  if (estado !== 'approved') return estado;
  const paid = Math.round(+o.total_paid_amount || +o.total_amount || 0);
  if (String(o.external_reference) !== link.ref || (o.currency && o.currency !== 'CLP') || paid < link.amount) return 'rejected';
  const paidAt = Date.parse(o.last_updated_date || '') || Date.now();
  const claimed = await env.DB.prepare(`UPDATE mp_links SET paid_at = ? WHERE ref = ? AND paid_at IS NULL`).bind(paidAt, link.ref).run();
  if (!claimed.meta.changes) return 'approved';
  await compraPagada(env, link.compra_id, 'mercadopago', paidAt);
  return 'approved';
}

async function mpVuelta(env, url) {
  const q = url.searchParams;
  let orderId = q.get('order_id');
  const ref = q.get('external_reference');
  if (ref && !orderId) {
    const link = await env.DB.prepare(`SELECT order_id FROM mp_links WHERE ref = ?`).bind(ref).first();
    if (link) orderId = link.order_id;
  }
  let estado = 'pending';
  if (orderId && env.MP_ACCESS_TOKEN) { try { estado = await processMpOrder(env, orderId); } catch (e) { console.error(e); } }
  if (estado === 'desconocido') estado = 'pending';
  return Response.redirect(`${url.origin}/#pago=${encodeURIComponent(estado)}`, 302);
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function validMpSignature(req, env, dataId) {
  let ts = '', v1 = '';
  for (const part of (req.headers.get('x-signature') || '').split(',')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 'ts') ts = v; if (k === 'v1') v1 = v;
  }
  if (!ts || !v1) return false;
  const reqId = (req.headers.get('x-request-id') || '').trim();
  const id = dataId ? String(dataId).trim() : '';
  const manifest = (id ? `id:${/^[a-z0-9]+$/i.test(id) ? id.toLowerCase() : id};` : '') + (reqId ? `request-id:${reqId};` : '') + `ts:${ts};`;
  const mine = await hmacHex(env.MP_WEBHOOK_SECRET, manifest);
  if (mine.length !== v1.length) return false;
  let r = 0; for (let i = 0; i < mine.length; i++) r |= mine.charCodeAt(i) ^ v1.charCodeAt(i);
  return r === 0;
}
async function mpWebhook(req, env, url) {
  const b = await body(req);
  const type = url.searchParams.get('type') || b.type;
  const dataId = url.searchParams.get('data.id') || (b.data && b.data.id);
  if (!env.MP_WEBHOOK_SECRET || !(await validMpSignature(req, env, url.searchParams.get('data.id')))) return json({ error: 'firma' }, 401);
  if (type === 'order' && dataId && env.MP_ACCESS_TOKEN) {
    try { await processMpOrder(env, dataId); } catch (e) { console.error(e); return json({ error: 'retry' }, 500); }
  }
  return json({ ok: true });
}

// ---------- te leo ----------

async function postMensaje(req, env) {
  const b = await body(req);
  const texto = cleanText(b.texto, 2000);
  if (texto.length < 2) throw new HttpError(400, 'vacio', 'Escribe algo primero.');
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const ipHash = await sha256('ip:' + ip + ':' + hoy());
  const n = await env.DB.prepare(`SELECT COUNT(*) n FROM mensajes WHERE ip_hash = ? AND created_at > ?`).bind(ipHash, Date.now() - 3600 * 1000).first();
  if (n.n >= 8) throw new HttpError(429, 'muchos', 'Ya le escribiste harto por hoy. Pili te lee.');
  const u = await currentUser(req, env);
  await env.DB.prepare(`INSERT INTO mensajes (user_id, nombre, pregunta, texto, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(u ? u.id : null, clean(b.nombre, 60) || (u && u.name) || null, clean(b.pregunta, 200) || null, texto, ipHash, Date.now()).run();
  return json({ ok: true });
}

// ---------- Pili ----------

async function piliResumen(env) {
  const { results: evs } = await env.DB.prepare(`SELECT * FROM eventos WHERE fecha >= ? ORDER BY fecha, hora`).bind(hoy(Date.now() - DAY)).all();
  const out = [];
  for (const ev of evs) {
    const { results: rows } = await env.DB.prepare(
      `SELECT i.*, u.name, u.phone, g.name AS regalo_de_nombre FROM inscripciones i JOIN users u ON u.id = i.user_id LEFT JOIN users g ON g.id = i.regalo_de WHERE i.evento_id = ? ORDER BY i.created_at`
    ).bind(ev.id).all();
    const v = vistaEvento(ev, rows, null);
    const lugarDe = new Map();
    for (const m of MODALIDADES) {
      const cupos = m === 'presencial' ? ev.cupos_presencial : ev.cupos_online;
      if (cupos) lugares(rows.filter((r) => r.modalidad === m), cupos).lugar.forEach((x, k) => lugarDe.set(k, x));
    }
    v.personas = rows.filter((r) => r.estado !== 'cancelada').map((r) => ({
      id: r.id, nombre: r.name || 'Sin nombre', telefono: r.phone, modalidad: r.modalidad, estado: r.estado,
      lugar: lugarDe.get(r.id), monto: r.monto, metodo: r.metodo, desde: r.created_at, regaloDe: r.regalo_de_nombre || null,
    }));
    v.recaudado = rows.filter((r) => r.estado === 'pagada').reduce((s, r) => s + (r.monto || 0), 0);
    v.precios = ev.precios; v.cupos_presencial = ev.cupos_presencial; v.cupos_online = ev.cupos_online;
    out.push(v);
  }
  const nl = await env.DB.prepare(`SELECT COUNT(*) n FROM mensajes WHERE leido = 0`).first();
  const row = await env.DB.prepare(`SELECT v FROM nicho WHERE k = 'campeon'`).first();
  const { results: ses } = await env.DB.prepare(
    `SELECT s.*, u.name AS pide_nombre, u.phone AS pide_telefono FROM sesiones s JOIN users u ON u.id = s.user_id
     WHERE s.estado IN ('pedida', 'agendada') OR s.created_at > ? ORDER BY s.created_at DESC LIMIT 50`
  ).bind(Date.now() - 14 * DAY).all();
  const sesiones = ses.map((s) => ({ ...vistaSesion(s), pide: s.pide_nombre || 'Sin nombre', pideTelefono: s.pide_telefono, metodo: s.metodo }));
  return json({ eventos: out, sesiones, sinLeer: nl.n, campeon: (row && row.v) || PRODUCTOS[0].id, productos: PRODUCTOS });
}

async function piliSesion(req, env, id) {
  const b = await body(req);
  const s = await env.DB.prepare(`SELECT * FROM sesiones WHERE id = ?`).bind(id).first();
  if (!s) throw new HttpError(404, 'no_existe');
  if (b.pagada === true) await env.DB.prepare(`UPDATE sesiones SET pagada = 1, metodo = COALESCE(metodo, 'transferencia') WHERE id = ?`).bind(id).run();
  if (['pedida', 'agendada', 'hecha', 'cancelada'].includes(b.estado)) await env.DB.prepare(`UPDATE sesiones SET estado = ? WHERE id = ?`).bind(b.estado, id).run();
  return json({ ok: true });
}

async function piliInscripcion(req, env, id) {
  const b = await body(req);
  const insc = await env.DB.prepare(`SELECT * FROM inscripciones WHERE id = ?`).bind(id).first();
  if (!insc) throw new HttpError(404, 'no_existe');
  if (b.estado === 'pagada') {
    const { ev } = await cargarEvento(env, insc.evento_id);
    await env.DB.prepare(`UPDATE inscripciones SET estado = 'pagada', monto = ?, metodo = 'transferencia', pagada_at = ? WHERE id = ? AND estado != 'pagada'`)
      .bind(+b.monto > 0 ? Math.round(+b.monto) : precioActual(ev.precios).monto, Date.now(), id).run();
  } else if (b.estado === 'reservada') {
    await env.DB.prepare(`UPDATE inscripciones SET estado = 'reservada', monto = NULL, metodo = NULL, pagada_at = NULL WHERE id = ?`).bind(id).run();
  } else if (b.estado === 'cancelada') {
    await env.DB.prepare(`UPDATE inscripciones SET estado = 'cancelada' WHERE id = ?`).bind(id).run();
  } else throw new HttpError(400, 'estado');
  return json({ ok: true });
}

async function piliMensajes(env) {
  const { results } = await env.DB.prepare(`SELECT id, nombre, pregunta, texto, leido, created_at FROM mensajes ORDER BY created_at DESC LIMIT 200`).all();
  return json({ mensajes: results });
}
async function piliLeido(env, id) {
  await env.DB.prepare(`UPDATE mensajes SET leido = 1 WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

async function piliEvento(req, env, id) {
  const b = await body(req);
  const nombre = clean(b.nombre, 80);
  if (!nombre) throw new HttpError(400, 'nombre', 'Ponle nombre.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) throw new HttpError(400, 'fecha', 'Revisa la fecha.');
  if (!/^\d{2}:\d{2}$/.test(b.hora || '')) throw new HttpError(400, 'hora', 'Revisa la hora.');
  let precios = Array.isArray(b.precios) ? b.precios : [];
  precios = precios.map((x) => ({ hasta: /^\d{4}-\d{2}-\d{2}$/.test(x.hasta || '') ? x.hasta : null, monto: Math.max(0, Math.round(+x.monto || 0)) })).filter((x) => x.monto > 0);
  precios.sort((a, c) => (a.hasta || '9999') < (c.hasta || '9999') ? -1 : 1);
  if (!precios.length) throw new HttpError(400, 'precio', 'Pon el aporte.');
  const v = [
    b.tipo === 'taller' ? 'taller' : 'circulo', nombre, clean(b.bajada, 160) || null, cleanText(b.descripcion, 1500) || null,
    b.fecha, b.hora, /^\d{2}:\d{2}$/.test(b.hora_fin || '') ? b.hora_fin : null, clean(b.lugar, 120) || null,
    ['llena', 'nueva', 'solsticio'].includes(b.luna) ? b.luna : null, clean(b.pregunta, 200) || null,
    Math.max(0, Math.round(+b.cupos_presencial || 0)), Math.max(0, Math.round(+b.cupos_online || 0)), JSON.stringify(precios),
    b.estado === 'cerrado' ? 'cerrado' : 'abierto',
  ];
  if (!v[10] && !v[11]) throw new HttpError(400, 'cupos', 'Pon cupos presenciales u online.');
  if (id) {
    await env.DB.prepare(`UPDATE eventos SET tipo=?, nombre=?, bajada=?, descripcion=?, fecha=?, hora=?, hora_fin=?, lugar=?, luna=?, pregunta=?, cupos_presencial=?, cupos_online=?, precios=?, estado=? WHERE id = ?`).bind(...v, id).run();
  } else {
    await env.DB.prepare(`INSERT INTO eventos (tipo, nombre, bajada, descripcion, fecha, hora, hora_fin, lugar, luna, pregunta, cupos_presencial, cupos_online, precios, estado, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...v, Date.now()).run();
  }
  return json({ ok: true });
}

async function piliCampeon(req, env) {
  const id = String((await body(req)).id || '');
  if (!PRODUCTOS.some((x) => x.id === id)) throw new HttpError(400, 'producto');
  await env.DB.prepare(`INSERT INTO nicho (k, v, updated_at) VALUES ('campeon', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`).bind(id, Date.now()).run();
  return json({ ok: true, campeon: id });
}
