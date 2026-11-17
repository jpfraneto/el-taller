// Endémico: API on Cloudflare Workers + D1.
//
// The rule of this prototype: zero extra work for Seba.
//  - Members check in by scanning the QR on the door (one tap). Their visits and payments become visible to them.
//  - Seba's spreadsheet fills itself (/api/coach/planilla), and downloads as the same kind of .xlsx he uses today.
//  - On Sunday he writes the week on the whiteboard as always; a photo of it becomes the weekly workout page
//    (/api/coach/semana/foto, read by Claude), which people outside the gym can subscribe to.
//
// Payments: Mercado Pago Checkout Pro through the Orders API. We create an order (a real payment link) for the member's
// plan or for the weekly-workout subscription; when MP processes it (webhook, or the buyer's return to /mp/vuelta) we
// fetch the order from MP's API, check it, and record it once. Seba doesn't type anything.
//
// Login: phone number + 6-digit code. In the prototype (DEMO_OTP=1) the code is shown on screen as a fake
// WhatsApp message; in production it goes out through the WhatsApp Cloud API. Numbers in COACH_PHONES are coach.

import Anthropic from '@anthropic-ai/sdk';

const TZ = 'America/Santiago';
const OTP_TTL = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL = 90 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const PLAN_PRECIOS = { 1: 40000, 2: 80000, 3: 100000, 4: 120000, 5: 140000 }; // from their pinned "Nuestros Planes"
const CLASES_POR_VEZ = 4; // a plan is sold as "N veces/semana": N × 4 classes for its month
// Single sessions, same post. Bought one at a time, then booked like a class (one person per hour).
const SERVICIOS = {
  puncion: { nombre: 'Punción seca', precio: 35000 },
  kine: { nombre: 'Kinesioterapia', precio: 28000 },
  personalizado: { nombre: 'Entrenamiento personalizado', precio: 22000 },
  masaje: { nombre: 'Masaje', precio: 30000 },
};
const clasesDePlan = (n) => (+n || 0) * CLASES_POR_VEZ;
const METHODS = ['efectivo', 'transferencia', 'tarjeta']; // what Seba registers by hand; 'mercadopago' is recorded automatically
const MP_API = 'https://api.mercadopago.com';
const MP_LINK_TTL = 7 * DAY;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const AUSENTE_DIAS = 10; // "no ha venido en 10 días"
const DEMO_CODE = '888888'; // prototype: every member logs in with this code (easy to remember on camera)
const AGENDA_DIAS = 30; // how far ahead a member can book
// Class times from their pinned post: L–V 07–12 y 15–21, sábado 09–12. One class per hour. 0 = Sunday.
const HORARIO = (() => {
  const h = (from, to) => Array.from({ length: to - from }, (_, i) => String(from + i).padStart(2, '0') + ':00');
  const lv = [...h(7, 12), ...h(15, 21)];
  return { 0: [], 1: lv, 2: lv, 3: lv, 4: lv, 5: lv, 6: h(9, 12) };
})();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const res = await route(request, env, url);
      return res || json({ error: 'not_found' }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
      console.error(err);
      return json({ error: 'server_error' }, 500);
    }
  },
};

async function route(req, env, url) {
  const p = url.pathname;
  const m = req.method;

  // The door QR points here; send the phone to the check-in screen.
  let mm = p.match(/^\/c\/([^/]+)$/);
  if (mm && m === 'GET') return Response.redirect(`${url.origin}/#/checkin/${encodeURIComponent(mm[1])}`, 302);

  if (p === '/mp/vuelta' && m === 'GET') return mpVuelta(env, url);
  if (p === '/api/mp/webhook' && m === 'POST') return mpWebhook(req, env, url);

  if (p === '/api/config' && m === 'GET') return config(env);
  if (p === '/api/auth/start' && m === 'POST') return authStart(req, env);
  if (p === '/api/auth/verify' && m === 'POST') return authVerify(req, env, url);
  if (p === '/api/auth/logout' && m === 'POST') return logout(req, env, url);

  if (p === '/api/me' && m === 'GET') return getMe(req, env);
  if (p === '/api/me/historial' && m === 'GET') return getHistorial(req, env);
  if (p === '/api/me/pago' && m === 'POST') return informarPago(req, env);
  if (p === '/api/me/mp' && m === 'POST') return memberMpLink(req, env, url);
  if (p === '/api/comprar' && m === 'POST') return comprar(req, env, url);
  if (p === '/api/checkin' && m === 'POST') return checkin(req, env);
  if (p === '/api/agenda' && m === 'GET') return getAgenda(req, env, url);
  if (p === '/api/me/reserva' && m === 'POST') return reservar(req, env);
  if (p === '/api/me/reserva' && m === 'DELETE') return cancelarReserva(req, env, url);

  if (p === '/api/semana' && m === 'GET') return getSemana(req, env, url);
  if (p === '/api/semana/mp' && m === 'POST') return semanaMpLink(req, env, url);

  if (p.startsWith('/api/coach/')) {
    await requireCoach(req, env);
    if (p === '/api/coach/hoy' && m === 'GET') return coachHoy(env);
    if (p === '/api/coach/alumnos' && m === 'GET') return coachAlumnos(env);
    if (p === '/api/coach/alumnos' && m === 'POST') return coachAddAlumno(req, env);
    mm = p.match(/^\/api\/coach\/alumnos\/(\d+)$/);
    if (mm && m === 'PATCH') return coachPatchAlumno(req, env, +mm[1]);
    if (mm && m === 'GET') return coachAlumno(env, +mm[1]);
    if (p === '/api/coach/checkin' && m === 'POST') return coachCheckin(req, env);
    if (p === '/api/coach/pagos' && m === 'POST') return coachPago(req, env);
    if (p === '/api/coach/mp-link' && m === 'POST') return coachMpLink(req, env, url);
    mm = p.match(/^\/api\/coach\/pagos\/(\d+)\/confirmar$/);
    if (mm && m === 'POST') return coachConfirmar(env, +mm[1]);
    mm = p.match(/^\/api\/coach\/pagos\/(\d+)\/comprobante$/);
    if (mm && m === 'GET') return coachComprobante(env, +mm[1]);
    if (p === '/api/coach/planilla' && m === 'GET') return coachPlanilla(env);
    if (p === '/api/coach/import' && m === 'POST') return coachImport(req, env);
    if (p === '/api/coach/puerta' && m === 'GET') return json({ url: `${url.origin}/c/${env.DOOR_KEY}` });
    if (p === '/api/coach/semana/foto' && m === 'POST') return coachSemanaFoto(req, env);
    if (p === '/api/coach/semana' && m === 'PUT') return coachSemanaSave(req, env);
  }
  return null;
}

/* ------------------------------------------------------------------ helpers */

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(name, value, url, maxAgeSec) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}

function randomOtp() {
  const a = new Uint32Array(1);
  let n;
  do { crypto.getRandomValues(a); n = a[0]; } while (n >= 4294000000);
  return String(n % 1000000).padStart(6, '0');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clean(s, max = 120) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** "+56 9 8549 1126", "9 8549 1126" → "56985491126". Chilean mobiles without country code get 56. */
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  if (d.length === 8) d = '569' + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

const coachCode = (env) => (/^\d{6}$/.test(env.COACH_CODE || '') ? env.COACH_CODE : null);
const coachPhones = (env) => String(env.COACH_PHONES || '').split(',').map((s) => normalizePhone(s)).filter(Boolean);

/** Chile-time calendar day for a timestamp: 'YYYY-MM-DD'. */
function dayOf(ts = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOf(day) {
  const wd = new Date(day + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

function addMonth(ts) {
  const d = new Date(ts);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.getTime();
}

async function currentUser(req, env) {
  const token = cookies(req).en_session;
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(await sha256(token), Date.now()).first();
}

async function requireUser(req, env) {
  const u = await currentUser(req, env);
  if (!u) throw new HttpError(401, 'login_required');
  return u;
}

async function requireCoach(req, env) {
  const u = await requireUser(req, env);
  if (u.role !== 'coach') throw new HttpError(403, 'solo_coach');
  return u;
}

function publicUser(u) {
  return { id: u.id, name: u.name, firstName: clean(u.name).split(' ')[0] || '', phone: u.phone, role: u.role, plan: u.plan, planMonto: u.plan_monto, subUntil: u.sub_until };
}

/** Each confirmed payment adds one month on top of what was already paid (paying early doesn't lose days). */
function pagadoHastaDe(paidAts) {
  let hasta = 0;
  for (const t of [...paidAts].sort((a, b) => a - b)) hasta = addMonth(Math.max(hasta, t));
  return hasta || null;
}

/** Payment status for one member, from the list of their confirmed payment times. */
function estadoPago(paidAts, pending, now = Date.now()) {
  const hasta = pagadoHastaDe(paidAts || []);
  if (!hasta) return { estado: pending ? 'por_confirmar' : 'sin_pago', pagadoHasta: null };
  let estado = 'al_dia';
  if (hasta < now) estado = 'vencido';
  else if (hasta - now < 4 * DAY) estado = 'por_vencer';
  if (pending && estado !== 'al_dia') estado = 'por_confirmar';
  return { estado, pagadoHasta: hasta };
}

/** One query with everything the coach sees per member. */
async function alumnosStats(env, onlyId = null) {
  const today = dayOf();
  const monthStart = today.slice(0, 8) + '01';
  const rows = await env.DB.prepare(`
    SELECT u.id, u.name, u.phone, u.plan, u.plan_monto, u.activo, u.created_at,
      (SELECT COUNT(*) FROM checkins c WHERE c.user_id = u.id AND c.day >= ?1) AS clases_mes,
      (SELECT MAX(c.day) FROM checkins c WHERE c.user_id = u.id) AS ultima_visita,
      (SELECT MAX(p.paid_at) FROM payments p WHERE p.user_id = u.id AND p.status = 'confirmado' AND p.item = 'plan') AS ultimo_pago,
      (SELECT COUNT(*) FROM payments p WHERE p.user_id = u.id AND p.status = 'por_confirmar') AS pendientes,
      (SELECT c.at FROM checkins c WHERE c.user_id = u.id AND c.day = ?2) AS hoy_at
    FROM users u
    WHERE u.role = 'alumno' ${onlyId ? 'AND u.id = ?3' : ''}
    ORDER BY u.name COLLATE NOCASE`
  ).bind(...(onlyId ? [monthStart, today, onlyId] : [monthStart, today])).all();
  const pays = await env.DB.prepare(`SELECT user_id, paid_at FROM payments WHERE status = 'confirmado' AND item = 'plan' ${onlyId ? 'AND user_id = ?' : ''}`)
    .bind(...(onlyId ? [onlyId] : [])).all();
  const byUser = {};
  for (const x of pays.results) (byUser[x.user_id] ||= []).push(x.paid_at);
  return rows.results.map((r) => {
    const ep = estadoPago(byUser[r.id], r.pendientes > 0);
    const diasSinVenir = r.ultima_visita ? Math.round((Date.parse(today) - Date.parse(r.ultima_visita)) / DAY) : null;
    return {
      id: r.id, name: r.name, phone: r.phone, plan: r.plan, planMonto: r.plan_monto, activo: !!r.activo,
      clasesMes: r.clases_mes, ultimaVisita: r.ultima_visita, diasSinVenir, hoyAt: r.hoy_at,
      ultimoPago: r.ultimo_pago, pendientes: r.pendientes, ...ep,
    };
  });
}

/* ------------------------------------------------------------------ config + auth */

function config(env) {
  return json({
    demo: env.DEMO === '1',
    demoOtp: env.DEMO_OTP === '1',
    gymWa: env.GYM_WA,
    semanaPrecio: +env.SEMANA_PRECIO || 15000,
    planes: PLAN_PRECIOS,
    horario: HORARIO,
    clasesPorVez: CLASES_POR_VEZ,
    servicios: SERVICIOS,
    agendaDias: AGENDA_DIAS,
    lectorPizarra: Boolean(env.ANTHROPIC_API_KEY),
    mercadoPago: Boolean(env.MP_ACCESS_TOKEN),
    // Demo only: lets the member home "simulate" the door scan from a laptop.
    demoDoor: env.DEMO === '1' ? env.DOOR_KEY : undefined,
  });
}

async function authStart(req, env) {
  const b = await body(req);
  const phone = normalizePhone(b.phone);
  if (!phone) throw new HttpError(400, 'telefono_invalido', 'Revisa el número.');
  const intent = b.intent === 'remoto' || b.intent === 'comprar' ? b.intent : 'login';
  const user = await env.DB.prepare(`SELECT * FROM users WHERE phone = ?`).bind(phone).first();
  const isCoach = coachPhones(env).includes(phone);
  // Unknown numbers come in to buy a plan or a session, or to follow the weekly workout. Just logging in needs an account.
  if (!user && !isCoach && intent === 'login') return json({ status: 'desconocido', phone });

  const now = Date.now();
  const prev = await env.DB.prepare(`SELECT created_at FROM login_codes WHERE phone = ?`).bind(phone).first();
  if (prev && now - prev.created_at < 20 * 1000) throw new HttpError(429, 'espera', 'Espera unos segundos antes de pedir otro código.');

  const code = env.DEMO_OTP === '1' ? DEMO_CODE : randomOtp();
  await env.DB.prepare(
    `INSERT INTO login_codes (phone, code_hash, intent, attempts, created_at, expires_at) VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, intent = excluded.intent, attempts = 0,
       created_at = excluded.created_at, expires_at = excluded.expires_at`
  ).bind(phone, await sha256(phone + ':' + code), intent, now, now + OTP_TTL).run();

  // Production: send `code` with the WhatsApp Cloud API (template "codigo_de_acceso") here.
  const out = { status: 'enviado', phone, name: user ? clean(user.name).split(' ')[0] : '', nuevo: !user || !user.name };
  // Prototype: members see their code on screen. The coach never does: with COACH_CODE set, Seba's number
  // only opens with that fixed code (a secret only JP and Seba know), so knowing his number isn't enough.
  // Published (PUBLIC_URL set): the coach's code is never shown; without COACH_CODE his number simply can't log in.
  const hideCoach = isCoach && (coachCode(env) || env.PUBLIC_URL);
  if (env.DEMO_OTP === '1' && !hideCoach) out.demoCode = code;
  if (hideCoach) out.coachCode = true;
  return json(out);
}

async function authVerify(req, env, url) {
  const b = await body(req);
  const phone = normalizePhone(b.phone);
  const code = String(b.code || '').replace(/\D/g, '');
  if (!phone || code.length !== 6) throw new HttpError(400, 'codigo_invalido', 'El código tiene 6 dígitos.');
  const row = await env.DB.prepare(`SELECT * FROM login_codes WHERE phone = ?`).bind(phone).first();
  const now = Date.now();
  if (!row || row.expires_at < now) throw new HttpError(400, 'codigo_vencido', 'El código venció. Pide otro.');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'muchos_intentos', 'Demasiados intentos. Pide otro código.');
  const fixed = coachPhones(env).includes(phone) ? coachCode(env) : null;
  const ok = fixed ? code === fixed : row.code_hash === (await sha256(phone + ':' + code));
  if (!ok) {
    await env.DB.prepare(`UPDATE login_codes SET attempts = attempts + 1 WHERE phone = ?`).bind(phone).run();
    throw new HttpError(400, 'codigo_incorrecto', 'Ese código no es. Revisa el mensaje.');
  }
  await env.DB.prepare(`DELETE FROM login_codes WHERE phone = ?`).bind(phone).run();

  let user = await env.DB.prepare(`SELECT * FROM users WHERE phone = ?`).bind(phone).first();
  const isCoach = coachPhones(env).includes(phone);
  if (!user) {
    const role = isCoach ? 'coach' : 'remoto';
    const name = clean(b.name, 60) || (isCoach ? 'Seba' : '');
    user = await env.DB.prepare(`INSERT INTO users (phone, name, role, created_at) VALUES (?, ?, ?, ?) RETURNING *`)
      .bind(phone, name, role, now).first();
  } else if (!user.name && clean(b.name, 60)) {
    user = await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ? RETURNING *`).bind(clean(b.name, 60), user.id).first();
  }
  if (isCoach && user.role !== 'coach') {
    user = await env.DB.prepare(`UPDATE users SET role = 'coach' WHERE id = ? RETURNING *`).bind(user.id).first();
  }

  const token = randomToken();
  await env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256(token), user.id, now, now + SESSION_TTL).run();
  return json({ ok: true, user: publicUser(user) }, 200, { 'set-cookie': setCookie('en_session', token, url, SESSION_TTL / 1000) });
}

async function logout(req, env, url) {
  const token = cookies(req).en_session;
  if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': setCookie('en_session', '', url, 0) });
}

/* ------------------------------------------------------------------ member */

async function memberSummary(env, u) {
  const today = dayOf();
  const monthStart = today.slice(0, 8) + '01';
  const weekStart = mondayOf(today);
  const [mes, semana, hoy, last, pending, lastPay, reserva] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) n FROM checkins WHERE user_id = ? AND day >= ?`).bind(u.id, monthStart).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM checkins WHERE user_id = ? AND day >= ?`).bind(u.id, weekStart).first(),
    env.DB.prepare(`SELECT at FROM checkins WHERE user_id = ? AND day = ?`).bind(u.id, today).first(),
    env.DB.prepare(`SELECT paid_at FROM payments WHERE user_id = ? AND status = 'confirmado' AND item = 'plan'`).bind(u.id).all(),
    env.DB.prepare(`SELECT COUNT(*) n FROM payments WHERE user_id = ? AND status = 'por_confirmar'`).bind(u.id).first(),
    env.DB.prepare(`SELECT amount, method, paid_at, status FROM payments WHERE user_id = ? ORDER BY paid_at DESC LIMIT 1`).bind(u.id).first(),
    env.DB.prepare(`SELECT hora FROM reservas WHERE user_id = ? AND day = ?`).bind(u.id, today).first(),
  ]);
  return {
    clasesMes: mes.n, clasesSemana: semana.n, hoyAt: hoy ? hoy.at : null, reservaHoy: reserva ? reserva.hora : null,
    ultimoPago: lastPay || null, pendientes: pending.n,
    ...estadoPago(last.results.map((x) => x.paid_at), pending.n > 0),
    creditos: await planCreditos(env, u, today),
    servicios: await serviciosCreditos(env, u),
  };
}

async function getMe(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ user: null });
  const out = { user: publicUser(u) };
  if (u.role === 'alumno') out.resumen = await memberSummary(env, u);
  return json(out);
}

async function getHistorial(req, env) {
  const u = await requireUser(req, env);
  const since = addDays(dayOf(), -190);
  const [checks, pays, res] = await Promise.all([
    env.DB.prepare(`SELECT day, at, source FROM checkins WHERE user_id = ? AND day >= ? ORDER BY day`).bind(u.id, since).all(),
    env.DB.prepare(`SELECT id, amount, method, status, paid_at, created_by, item, clases, (receipt IS NOT NULL) AS has_receipt FROM payments WHERE user_id = ? ORDER BY paid_at DESC LIMIT 24`).bind(u.id).all(),
    env.DB.prepare(`SELECT day, hora, servicio FROM reservas WHERE user_id = ? AND day >= ? ORDER BY day, hora`).bind(u.id, dayOf()).all(),
  ]);
  return json({ checkins: checks.results, pagos: pays.results, reservas: res.results });
}

async function informarPago(req, env) {
  const u = await requireUser(req, env);
  if (u.role !== 'alumno') throw new HttpError(403, 'solo_alumnos');
  const b = await body(req);
  const amount = Math.round(+b.amount || u.plan_monto || 0);
  if (!(amount > 0 && amount < 5000000)) throw new HttpError(400, 'monto_invalido');
  const receipt = typeof b.receipt === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(b.receipt) && b.receipt.length < 1500000 ? b.receipt : null;
  if (!receipt) throw new HttpError(400, 'falta_comprobante', 'Sube la foto o captura del comprobante.');
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO payments (user_id, amount, method, status, paid_at, receipt, created_by, created_at, item, clases) VALUES (?, ?, 'transferencia', 'por_confirmar', ?, ?, 'alumno', ?, 'plan', ?)`
  ).bind(u.id, amount, now, receipt, now, clasesDePlan(u.plan) || null).run();
  return json({ ok: true, resumen: await memberSummary(env, u) });
}

async function checkin(req, env) {
  const b = await body(req);
  if (String(b.door || '') !== String(env.DOOR_KEY)) throw new HttpError(400, 'qr_invalido', 'Este QR no es el de la puerta de Endémico.');
  const u = await requireUser(req, env);
  if (u.role !== 'alumno') throw new HttpError(403, 'solo_alumnos', u.role === 'coach' ? 'Eres el coach: tú no haces check-in 😉' : 'El check-in es para alumnos del gimnasio.');
  const now = Date.now();
  const today = dayOf(now);
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO checkins (user_id, day, at, source) VALUES (?, ?, ?, 'qr')`).bind(u.id, today, now).run();
  const resumen = await memberSummary(env, u);
  return json({ ok: true, nuevo: r.meta.changes > 0, at: resumen.hoyAt, resumen, user: publicUser(u) });
}

/* ------------------------------------------------------------------ agenda (members book a class time) */

function chileMinutes(ts = Date.now()) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts)).split(':').map(Number);
  return h * 60 + m;
}

/** Times still open to book on `day` (today: only the ones that haven't started). */
function horasLibres(day) {
  const today = dayOf();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || day < today || day > addDays(today, AGENDA_DIAS)) return [];
  const horas = HORARIO[new Date(day + 'T12:00:00Z').getUTCDay()] || [];
  if (day !== today) return horas;
  const now = chileMinutes();
  return horas.filter((h) => +h.slice(0, 2) * 60 > now);
}

async function requireAlumno(req, env) {
  const u = await requireUser(req, env);
  if (u.role !== 'alumno') throw new HttpError(403, 'solo_alumnos', 'La agenda es para alumnos del gimnasio.');
  return u;
}

const CANCEL_MIN = 30; // a booking can be cancelled or moved until 30 minutes before the class

/** Minutes until a booked class starts (negative once it started). */
function minutosPara(day, hora) {
  const today = dayOf();
  if (day > today) return Infinity;
  if (day < today) return -Infinity;
  return +hora.slice(0, 2) * 60 + +hora.slice(3, 5) - chileMinutes();
}

/**
 * Each confirmed plan payment buys one month of classes, chained (paying early doesn't lose days):
 * [{ desde, hasta, clases }] with days 'YYYY-MM-DD', both inclusive.
 */
async function planPeriodos(env, u) {
  const r = await env.DB.prepare(`SELECT paid_at, clases FROM payments WHERE user_id = ? AND status = 'confirmado' AND item = 'plan' ORDER BY paid_at`).bind(u.id).all();
  const out = [];
  let hasta = 0;
  for (const p of r.results) {
    const start = Math.max(hasta, p.paid_at);
    hasta = addMonth(start);
    out.push({ desde: dayOf(start), hasta: dayOf(hasta), clases: p.clases || clasesDePlan(u.plan) });
  }
  return out;
}

/**
 * Classes left in the paid month that covers `day`: days they came, plus days still booked from today on, count.
 * Past bookings they didn't show up for don't count. `exceptDay` is left out (the day being booked or moved).
 * cubierto = false when no paid month covers that day. `hastaPagado` = last day covered by any payment.
 */
async function planCreditos(env, u, day = dayOf(), exceptDay = '') {
  const periodos = await planPeriodos(env, u);
  const hastaPagado = periodos.length ? periodos[periodos.length - 1].hasta : null;
  const per = periodos.find((x) => x.desde <= day && day <= x.hasta);
  if (!per) return { clases: 0, usadas: 0, quedan: 0, desde: null, hasta: null, hastaPagado, cubierto: false };
  const r = await env.DB.prepare(`
    SELECT COUNT(*) n FROM (
      SELECT day FROM checkins WHERE user_id = ?1 AND day BETWEEN ?2 AND ?3
      UNION
      SELECT day FROM reservas WHERE user_id = ?1 AND servicio = 'clase' AND day BETWEEN ?2 AND ?3 AND day >= ?4
    ) WHERE day != ?5`
  ).bind(u.id, per.desde, per.hasta, dayOf(), exceptDay).first();
  return { clases: per.clases, usadas: r.n, quedan: Math.max(0, per.clases - r.n), desde: per.desde, hasta: per.hasta, hastaPagado, cubierto: true };
}

/** Sessions of each service paid and not booked yet: { masaje: 1, … }. */
async function serviciosCreditos(env, u) {
  const [paid, booked] = await Promise.all([
    env.DB.prepare(`SELECT item, SUM(COALESCE(clases, 1)) n FROM payments WHERE user_id = ? AND status = 'confirmado' AND item != 'plan' GROUP BY item`).bind(u.id).all(),
    env.DB.prepare(`SELECT servicio, COUNT(*) n FROM reservas WHERE user_id = ? AND servicio != 'clase' GROUP BY servicio`).bind(u.id).all(),
  ]);
  const out = {};
  for (const k of Object.keys(SERVICIOS)) {
    const p = (paid.results.find((x) => x.item === k) || {}).n || 0;
    const b = (booked.results.find((x) => x.servicio === k) || {}).n || 0;
    if (p - b > 0) out[k] = p - b;
  }
  return out;
}

const servicioValido = (s) => (s === 'clase' || SERVICIOS[s] ? s : null);

/** One day of the agenda for a class or a service: each time with how many are booked, my booking, and what I have left. */
async function getAgenda(req, env, url) {
  const u = await requireAlumno(req, env);
  const day = url.searchParams.get('day') || dayOf();
  const servicio = servicioValido(url.searchParams.get('servicio') || 'clase');
  if (!servicio) throw new HttpError(400, 'servicio_invalido');
  const libres = horasLibres(day);
  const [counts, mine, creditos, servicios] = await Promise.all([
    env.DB.prepare(`SELECT hora, COUNT(*) n FROM reservas WHERE day = ? AND servicio = ? GROUP BY hora`).bind(day, servicio).all(),
    env.DB.prepare(`SELECT hora FROM reservas WHERE user_id = ? AND day = ? AND servicio = ?`).bind(u.id, day, servicio).first(),
    planCreditos(env, u, day, day),
    serviciosCreditos(env, u),
  ]);
  const n = Object.fromEntries(counts.results.map((r) => [r.hora, r.n]));
  const mia = mine ? mine.hora : null;
  // A service is one person per hour (one professional): a taken hour can't be booked.
  const horas = libres.map((hora) => ({ hora, n: n[hora] || 0, ocupada: servicio !== 'clase' && (n[hora] || 0) > 0 && hora !== mia }));
  return json({
    day, servicio, horas, mia,
    cancelable: mia ? minutosPara(day, mia) >= CANCEL_MIN : null,
    cancelMin: CANCEL_MIN,
    creditos,   // plan classes in the paid month of this day, not counting this day
    servicios,  // sessions paid and not booked yet
  });
}

/** Book (or move) a class or a session. A class needs a class left in that paid month; a session needs a paid session. */
async function reservar(req, env) {
  const u = await requireAlumno(req, env);
  const b = await body(req);
  const day = String(b.day || '');
  const hora = String(b.hora || '');
  const servicio = servicioValido(b.servicio || 'clase');
  if (!servicio) throw new HttpError(400, 'servicio_invalido');
  if (!horasLibres(day).includes(hora)) throw new HttpError(400, 'hora_invalida', 'Esa hora no está disponible.');
  const prev = await env.DB.prepare(`SELECT hora FROM reservas WHERE user_id = ? AND day = ? AND servicio = ?`).bind(u.id, day, servicio).first();
  if (prev && prev.hora === hora) return json({ ok: true, day, hora, servicio });
  if (prev && minutosPara(day, prev.hora) < CANCEL_MIN) {
    throw new HttpError(400, 'muy_tarde', `Tu hora solo se puede cambiar hasta ${CANCEL_MIN} minutos antes.`);
  }
  if (servicio === 'clase' && !prev) {
    const c = await planCreditos(env, u, day, day);
    if (!c.cubierto) throw new HttpError(402, 'sin_plan', c.hastaPagado ? `Tu plan cubre hasta el ${fechaLarga(c.hastaPagado)}. Renuévalo para agendar este día.` : 'Compra un plan para agendar tus clases.');
    if (c.quedan <= 0) throw new HttpError(402, 'sin_clases', `Ya usaste tus ${c.clases} clases hasta el ${fechaLarga(c.hasta)}.`);
  }
  if (servicio !== 'clase') {
    if (!prev && !(await serviciosCreditos(env, u))[servicio]) throw new HttpError(402, 'sin_sesion', `Paga la sesión de ${SERVICIOS[servicio].nombre.toLowerCase()} para agendarla.`);
    const taken = await env.DB.prepare(`SELECT 1 FROM reservas WHERE day = ? AND hora = ? AND servicio = ? AND user_id != ?`).bind(day, hora, servicio, u.id).first();
    if (taken) throw new HttpError(409, 'ocupada', 'Esa hora ya la tomó otra persona.');
  }
  await env.DB.prepare(
    `INSERT INTO reservas (user_id, day, hora, servicio, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, day, servicio) DO UPDATE SET hora = excluded.hora, created_at = excluded.created_at`
  ).bind(u.id, day, hora, servicio, Date.now()).run();
  return json({ ok: true, day, hora, servicio });
}

function fechaLarga(day) {
  const [, m, d] = day.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

async function cancelarReserva(req, env, url) {
  const u = await requireAlumno(req, env);
  const day = url.searchParams.get('day') || '';
  const servicio = servicioValido(url.searchParams.get('servicio') || 'clase') || 'clase';
  const r = await env.DB.prepare(`SELECT hora FROM reservas WHERE user_id = ? AND day = ? AND servicio = ?`).bind(u.id, day, servicio).first();
  if (!r) return json({ ok: true });
  if (minutosPara(day, r.hora) < CANCEL_MIN) throw new HttpError(400, 'muy_tarde', `Solo puedes cancelar hasta ${CANCEL_MIN} minutos antes.`);
  // Cancelling gives the class (or the paid session) back.
  await env.DB.prepare(`DELETE FROM reservas WHERE user_id = ? AND day = ? AND servicio = ?`).bind(u.id, day, servicio).run();
  return json({ ok: true });
}

/* ------------------------------------------------------------------ weekly workout */

async function loadWeek(env, day = dayOf()) {
  const ws = mondayOf(day);
  let row = await env.DB.prepare(`SELECT week_start, plan, source, updated_at, (photo IS NOT NULL) AS has_photo FROM weeks WHERE week_start = ?`).bind(ws).first();
  if (!row) row = await env.DB.prepare(`SELECT week_start, plan, source, updated_at, (photo IS NOT NULL) AS has_photo FROM weeks ORDER BY week_start DESC LIMIT 1`).first();
  if (!row) return null;
  return { weekStart: row.week_start, plan: JSON.parse(row.plan), source: row.source, updatedAt: row.updated_at, hasPhoto: !!row.has_photo };
}

async function getSemana(req, env, url) {
  const u = await currentUser(req, env);
  const week = await loadWeek(env);
  if (!week) return json({ week: null });
  if (url.searchParams.get('foto') === '1') {
    const r = await env.DB.prepare(`SELECT photo FROM weeks WHERE week_start = ?`).bind(week.weekStart).first();
    return json({ photo: r ? r.photo : null });
  }
  const full = u && (u.role === 'coach' || u.role === 'alumno' || (u.role === 'remoto' && u.sub_until > Date.now()));
  if (!full) {
    // Preview: the first day complete, the rest only as titles.
    week.plan = { ...week.plan, dias: week.plan.dias.map((d, i) => (i === 0 ? d : { dia: d.dia, foco: d.foco, bloques: [], bloqueado: true })) };
  }
  return json({ week, full: !!full, hoy: dayOf() });
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'nota', 'dias'],
  properties: {
    titulo: { type: 'string', description: 'Título corto de la semana, p. ej. "Semana de fuerza".' },
    nota: { type: 'string', description: 'Comentario general escrito en la pizarra, o "" si no hay.' },
    dias: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dia', 'foco', 'bloques'],
        properties: {
          dia: { type: 'string', description: 'Como está numerado en la pizarra: "Día 1", "Día 2", "Día 3"… (no son días de la semana).' },
          foco: { type: 'string', description: 'Qué se trabaja, p. ej. "Tren superior · hombro y brazo".' },
          bloques: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['nombre', 'formato', 'ejercicios'],
              properties: {
                nombre: { type: 'string', description: 'Como lo escribe Seba: "Warmup", "Serie 1", "Serie 2".' },
                formato: { type: 'string', description: 'Las vueltas escritas arriba del bloque, p. ej. "x4", "x3". "" si no hay.' },
                ejercicios: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['nombre', 'dosis', 'mancuernas', 'sin_equipo', 'nota'],
                    properties: {
                      nombre: { type: 'string', description: 'Tal como está en la pizarra (versión gimnasio completo), con la ortografía corregida.' },
                      dosis: { type: 'string', description: 'Repeticiones, tiempo o distancia, p. ej. "10–12", "20 lentos", "40\'\'".' },
                      mancuernas: { type: 'string', description: 'Equivalente con solo un par de mancuernas que trabaje el mismo patrón.' },
                      sin_equipo: { type: 'string', description: 'Equivalente con el peso del cuerpo, sin nada, que trabaje el mismo patrón.' },
                      nota: { type: 'string', description: 'Indicación técnica escrita en la pizarra, o "no se lee bien" si no se entiende, o "".' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const PIZARRA_PROMPT = `Esta es una foto de la pizarra del gimnasio Endémico Functional Training (Llanquihue, Chile). Cada domingo el coach, Seba, escribe aquí el entrenamiento de la semana, día por día.

Seba numera los días (Día 1, Día 2… normalmente hasta el Día 5): no son días de la semana. Transcribe todos los días que haya en la pizarra. Cada día tiene siempre tres bloques: Warmup, Serie 1 y Serie 2, y arriba de cada bloque escribe las vueltas (x4, x3…).

Transcribe la pizarra al formato pedido:
- Respeta lo que Seba escribió: mismos días, mismo orden, mismos ejercicios y repeticiones. No inventes ejercicios ni días que no estén.
- Corrige ortografía y abreviaturas obvias ("rem" → "Remo", "sent" → "Sentadilla"), en español de Chile.
- Si algo no se lee, escribe tu mejor lectura y pon "no se lee bien" en la nota de ese ejercicio.
- Para cada ejercicio agrega dos equivalentes para quien entrena fuera del gimnasio: uno solo con un par de mancuernas y otro sin nada de equipo (peso corporal). Que trabajen el mismo patrón de movimiento y sean seguros. Si el ejercicio ya es sin equipo, repite el mismo.
- Si la foto no es una pizarra con un entrenamiento, devuelve "dias": [] y explica en "nota" qué se ve.`;

async function readWhiteboard(env, base64, mediaType) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: PIZARRA_PROMPT },
      ],
    }],
  });
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'no_se_pudo_leer', 'No pude leer esa foto. Intenta con otra.');
  if (res.stop_reason === 'max_tokens') throw new HttpError(422, 'pizarra_muy_larga', 'La pizarra es muy larga para leerla de una vez.');
  const text = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  return JSON.parse(text);
}

async function coachSemanaFoto(req, env) {
  const b = await body(req);
  const m = String(b.image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(400, 'foto_invalida', 'Sube una foto (JPG o PNG).');
  if (b.image.length > 1900000) throw new HttpError(413, 'foto_muy_grande');
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'sin_lector', 'Falta conectar el lector de pizarras (ANTHROPIC_API_KEY).');
  const plan = await readWhiteboard(env, m[2], m[1]);
  if (!plan.dias || !plan.dias.length) throw new HttpError(422, 'no_es_pizarra', plan.nota || 'No encontré un entrenamiento en esa foto.');
  const ws = mondayOf(b.semana && /^\d{4}-\d{2}-\d{2}$/.test(b.semana) ? b.semana : dayOf());
  await env.DB.prepare(
    `INSERT INTO weeks (week_start, photo, plan, source, updated_at) VALUES (?, ?, ?, 'foto', ?)
     ON CONFLICT(week_start) DO UPDATE SET photo = excluded.photo, plan = excluded.plan, source = 'foto', updated_at = excluded.updated_at`
  ).bind(ws, b.image, JSON.stringify(plan), Date.now()).run();
  return json({ ok: true, week: await loadWeek(env, ws) });
}

function sanitizePlan(p) {
  const s = (v, n = 160) => clean(v, n);
  return {
    titulo: s(p.titulo, 80), nota: s(p.nota, 400),
    dias: (Array.isArray(p.dias) ? p.dias : []).slice(0, 7).map((d) => ({
      dia: s(d.dia, 20), foco: s(d.foco, 80),
      bloques: (Array.isArray(d.bloques) ? d.bloques : []).slice(0, 12).map((bl) => ({
        nombre: s(bl.nombre, 60), formato: s(bl.formato, 60),
        ejercicios: (Array.isArray(bl.ejercicios) ? bl.ejercicios : []).slice(0, 20).map((e) => ({
          nombre: s(e.nombre), dosis: s(e.dosis, 40), mancuernas: s(e.mancuernas) || s(e.nombre),
          sin_equipo: s(e.sin_equipo) || s(e.nombre), nota: s(e.nota),
        })),
      })),
    })),
  };
}

async function coachSemanaSave(req, env) {
  const b = await body(req);
  const plan = sanitizePlan(b.plan || {});
  if (!plan.dias.length) throw new HttpError(400, 'plan_vacio');
  const ws = mondayOf(b.semana && /^\d{4}-\d{2}-\d{2}$/.test(b.semana) ? b.semana : dayOf());
  await env.DB.prepare(
    `INSERT INTO weeks (week_start, plan, source, updated_at) VALUES (?, ?, 'manual', ?)
     ON CONFLICT(week_start) DO UPDATE SET plan = excluded.plan, updated_at = excluded.updated_at`
  ).bind(ws, JSON.stringify(plan), Date.now()).run();
  return json({ ok: true, week: await loadWeek(env, ws) });
}

/* ------------------------------------------------------------------ coach */

async function coachHoy(env) {
  const today = dayOf();
  const [checks, pend, alumnos, agenda] = await Promise.all([
    env.DB.prepare(`SELECT c.id, c.at, c.source, u.id AS user_id, u.name, u.plan FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.day = ? ORDER BY c.at DESC`).bind(today).all(),
    env.DB.prepare(`SELECT p.id, p.amount, p.paid_at, u.id AS user_id, u.name FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status = 'por_confirmar' ORDER BY p.paid_at`).all(),
    alumnosStats(env),
    env.DB.prepare(`SELECT r.hora, r.servicio, u.id AS user_id, u.name, (SELECT c.at FROM checkins c WHERE c.user_id = u.id AND c.day = r.day) AS vino_at
      FROM reservas r JOIN users u ON u.id = r.user_id WHERE r.day = ? ORDER BY r.hora, u.name COLLATE NOCASE`).bind(today).all(),
  ]);
  const activos = alumnos.filter((a) => a.activo);
  return json({
    hoy: today,
    checkins: checks.results,
    porConfirmar: pend.results,
    agendados: agenda.results,
    ausentes: activos.filter((a) => a.diasSinVenir !== null && a.diasSinVenir >= AUSENTE_DIAS).sort((a, b) => b.diasSinVenir - a.diasSinVenir).slice(0, 8),
    vencidos: activos.filter((a) => a.estado === 'vencido' || a.estado === 'por_vencer').slice(0, 8),
    totalActivos: activos.length,
    semana: await loadWeek(env),
  });
}

async function coachAlumnos(env) {
  return json({ alumnos: await alumnosStats(env) });
}

async function coachAlumno(env, id) {
  const [a] = await alumnosStats(env, id);
  if (!a) throw new HttpError(404, 'no_existe');
  const [checks, pays] = await Promise.all([
    env.DB.prepare(`SELECT day, at, source FROM checkins WHERE user_id = ? ORDER BY day DESC LIMIT 120`).bind(id).all(),
    env.DB.prepare(`SELECT id, amount, method, status, paid_at, created_by, (receipt IS NOT NULL) AS has_receipt FROM payments WHERE user_id = ? ORDER BY paid_at DESC LIMIT 24`).bind(id).all(),
  ]);
  return json({ alumno: a, checkins: checks.results, pagos: pays.results });
}

function readPlan(b) {
  const plan = Math.max(0, Math.min(5, Math.round(+b.plan || 0)));
  const monto = b.planMonto !== undefined && b.planMonto !== '' ? Math.round(+b.planMonto) : (PLAN_PRECIOS[plan] || 0);
  return { plan, monto: monto >= 0 && monto < 5000000 ? monto : 0 };
}

async function coachAddAlumno(req, env) {
  const b = await body(req);
  const phone = normalizePhone(b.phone);
  const name = clean(b.name, 60);
  if (!phone || !name) throw new HttpError(400, 'faltan_datos', 'Nombre y teléfono.');
  const { plan, monto } = readPlan(b);
  const ex = await env.DB.prepare(`SELECT id, role FROM users WHERE phone = ?`).bind(phone).first();
  if (ex && ex.role === 'alumno') throw new HttpError(409, 'ya_existe', 'Ese número ya es alumno.');
  if (ex) {
    await env.DB.prepare(`UPDATE users SET name = ?, role = 'alumno', plan = ?, plan_monto = ?, activo = 1 WHERE id = ?`).bind(name, plan, monto, ex.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO users (phone, name, role, plan, plan_monto, created_at) VALUES (?, ?, 'alumno', ?, ?, ?)`).bind(phone, name, plan, monto, Date.now()).run();
  }
  return json({ ok: true });
}

async function coachPatchAlumno(req, env, id) {
  const b = await body(req);
  const u = await env.DB.prepare(`SELECT * FROM users WHERE id = ? AND role = 'alumno'`).bind(id).first();
  if (!u) throw new HttpError(404, 'no_existe');
  const name = b.name !== undefined ? clean(b.name, 60) || u.name : u.name;
  const { plan, monto } = b.plan !== undefined ? readPlan(b) : { plan: u.plan, monto: u.plan_monto };
  const activo = b.activo !== undefined ? (b.activo ? 1 : 0) : u.activo;
  await env.DB.prepare(`UPDATE users SET name = ?, plan = ?, plan_monto = ?, activo = ? WHERE id = ?`).bind(name, plan, monto, activo, id).run();
  return json({ ok: true });
}

async function coachCheckin(req, env) {
  const b = await body(req);
  const u = await env.DB.prepare(`SELECT id FROM users WHERE id = ? AND role = 'alumno'`).bind(+b.userId).first();
  if (!u) throw new HttpError(404, 'no_existe');
  const now = Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO checkins (user_id, day, at, source) VALUES (?, ?, ?, 'coach')`).bind(u.id, dayOf(now), now).run();
  return json({ ok: true });
}

async function coachPago(req, env) {
  const b = await body(req);
  const u = await env.DB.prepare(`SELECT * FROM users WHERE id = ? AND role = 'alumno'`).bind(+b.userId).first();
  if (!u) throw new HttpError(404, 'no_existe');
  const method = METHODS.includes(b.method) ? b.method : null;
  if (!method) throw new HttpError(400, 'medio_invalido');
  const amount = Math.round(+b.amount || u.plan_monto || 0);
  if (!(amount > 0 && amount < 5000000)) throw new HttpError(400, 'monto_invalido');
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO payments (user_id, amount, method, status, paid_at, created_by, created_at, confirmed_at, item, clases) VALUES (?, ?, ?, 'confirmado', ?, 'coach', ?, ?, 'plan', ?)`
  ).bind(u.id, amount, method, now, now, now, clasesDePlan(u.plan) || null).run();
  return json({ ok: true });
}

async function coachConfirmar(env, id) {
  const r = await env.DB.prepare(`UPDATE payments SET status = 'confirmado', confirmed_at = ? WHERE id = ? AND status = 'por_confirmar'`).bind(Date.now(), id).run();
  if (!r.meta.changes) throw new HttpError(404, 'no_existe');
  return json({ ok: true });
}

async function coachComprobante(env, id) {
  const r = await env.DB.prepare(`SELECT receipt FROM payments WHERE id = ?`).bind(id).first();
  if (!r || !r.receipt) throw new HttpError(404, 'no_existe');
  return json({ receipt: r.receipt });
}

async function coachPlanilla(env) {
  const since = addDays(dayOf(), -120);
  const [alumnos, checks, pays] = await Promise.all([
    alumnosStats(env),
    env.DB.prepare(`SELECT c.id, c.day, c.at, c.source, u.name, u.plan FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.day >= ? ORDER BY c.at`).bind(since).all(),
    env.DB.prepare(`SELECT p.id, p.amount, p.method, p.status, p.paid_at, p.item, p.clases, u.name FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.paid_at`).all(),
  ]);
  return json({ alumnos, asistencia: checks.results, pagos: pays.results, generado: Date.now() });
}

/** Rows parsed client-side from Seba's Excel: [{nombre, telefono, plan, monto}]. */
async function coachImport(req, env) {
  const b = await body(req);
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
  let nuevos = 0, actualizados = 0, saltados = 0;
  for (const r of rows) {
    const phone = normalizePhone(r.telefono);
    const name = clean(r.nombre, 60);
    if (!phone || !name || coachPhones(env).includes(phone)) { saltados++; continue; }
    const { plan, monto } = readPlan({ plan: r.plan, planMonto: r.monto });
    const ex = await env.DB.prepare(`SELECT id FROM users WHERE phone = ?`).bind(phone).first();
    if (ex) {
      await env.DB.prepare(`UPDATE users SET name = ?, role = 'alumno', plan = ?, plan_monto = ? WHERE id = ?`).bind(name, plan, monto, ex.id).run();
      actualizados++;
    } else {
      await env.DB.prepare(`INSERT INTO users (phone, name, role, plan, plan_monto, created_at) VALUES (?, ?, 'alumno', ?, ?, ?)`).bind(phone, name, plan, monto, Date.now()).run();
      nuevos++;
    }
  }
  return json({ ok: true, nuevos, actualizados, saltados });
}

/* ------------------------------------------------------------------ Mercado Pago (Checkout Pro, Orders API) */
// Docs: https://www.mercadopago.cl/developers/es/reference/online-payments/checkout-pro/create-order/post
// An order = one payment link (checkout_url). It's paid when status = 'processed' and status_detail = 'accredited'.

function requireMp(env) {
  if (!env.MP_ACCESS_TOKEN) throw new HttpError(503, 'sin_mercadopago', 'Falta conectar Mercado Pago (MP_ACCESS_TOKEN).');
}

async function mpFetch(env, path, init = {}) {
  const res = await fetch((env.MP_API_URL || MP_API) + path, { // MP_API_URL: only to point tests at a mock
    ...init,
    headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', accept: 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('mercadopago', path, res.status, JSON.stringify(data).slice(0, 800));
    const detail = (data.errors && data.errors[0] && (data.errors[0].message || data.errors[0].code)) || data.message || data.error || 'error';
    throw new HttpError(502, 'mercadopago_error', `Mercado Pago respondió ${res.status}: ${detail}`);
  }
  return data;
}

const baseUrl = (env, url) => (env.PUBLIC_URL || url.origin).replace(/\/$/, '');

/** Creates a Checkout Pro order and remembers it. Returns our link row (with checkout_url). */
async function createMpLink(env, url, { user, tipo, amount, title, createdBy }) {
  requireMp(env);
  // Reuse a still-valid unpaid link for the same thing, so sending it twice doesn't create two.
  const now = Date.now();
  const old = await env.DB.prepare(
    `SELECT * FROM mp_links WHERE user_id = ? AND tipo = ? AND amount = ? AND paid_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`
  ).bind(user.id, tipo, amount, now + DAY).first();
  if (old) return old;

  const base = baseUrl(env, url);
  const ref = `${tipo}-${user.id}-${randomToken(9).replace(/[^A-Za-z0-9]/g, 'x')}`; // only letters, numbers, - and _
  const online = { success_url: `${base}/mp/vuelta`, failure_url: `${base}/mp/vuelta`, pending_url: `${base}/mp/vuelta` };
  if (base.startsWith('https://')) online.auto_return = 'approved';
  const order = await mpFetch(env, '/v1/orders', {
    method: 'POST',
    headers: { 'x-idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'manual',
      total_amount: String(amount),                 // CLP: whole number, as a string
      external_reference: ref,
      expiration_time: 'P7D',
      description: title,
      config: { statement_descriptor: 'ENDEMICO', online },
      items: [{ external_code: tipo, title, quantity: 1, unit_price: String(amount) }],
    }),
  });
  if (!order.id || !order.checkout_url) throw new HttpError(502, 'mercadopago_error', 'Mercado Pago no devolvió el link.');
  const link = {
    ref, order_id: order.id, user_id: user.id, tipo, amount, title, checkout_url: order.checkout_url,
    created_by: createdBy, created_at: now, expires_at: now + MP_LINK_TTL,
  };
  await env.DB.prepare(
    `INSERT INTO mp_links (ref, order_id, user_id, tipo, amount, title, checkout_url, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(link.ref, link.order_id, link.user_id, link.tipo, link.amount, link.title, link.checkout_url, link.created_by, link.created_at, link.expires_at).run();
  return link;
}

function planTitle(u, n = u.plan) {
  return `Endémico · ${clasesDePlan(n)} clases al mes (${n} ${n === 1 ? 'vez' : 'veces'}/semana)`;
}

/** Renew my current plan. */
async function memberMpLink(req, env, url) {
  const u = await requireUser(req, env);
  if (u.role !== 'alumno') throw new HttpError(403, 'solo_alumnos');
  if (!(u.plan_monto > 0)) throw new HttpError(400, 'sin_plan', 'Elige un plan en Planes.');
  const link = await createMpLink(env, url, { user: u, tipo: `plan${u.plan}`, amount: u.plan_monto, title: planTitle(u), createdBy: 'alumno' });
  return json({ url: link.checkout_url, amount: link.amount, title: link.title });
}

/**
 * Buy anything from Planes, straight to Mercado Pago: 'plan1'…'plan5' (monthly classes), a service session
 * ('masaje', …) or 'semana' (the weekly workout, for people outside the gym). Recorded when MP confirms it.
 */
async function comprar(req, env, url) {
  const u = await requireUser(req, env);
  if (u.role === 'coach') throw new HttpError(403, 'coach', 'Eres el coach 😉');
  const item = String((await body(req)).item || '');
  let amount, title;
  const pm = item.match(/^plan([1-5])$/);
  if (pm) { amount = PLAN_PRECIOS[pm[1]]; title = planTitle(u, +pm[1]); }
  else if (SERVICIOS[item]) { amount = SERVICIOS[item].precio; title = `Endémico · ${SERVICIOS[item].nombre} (1 sesión)`; }
  else if (item === 'semana') {
    if (u.role === 'alumno') throw new HttpError(400, 'ya_incluido', 'El entrenamiento de la semana ya viene con tu plan.');
    amount = +env.SEMANA_PRECIO || 15000; title = 'Endémico · El entrenamiento de la semana · 30 días';
  } else throw new HttpError(400, 'item_invalido');
  const link = await createMpLink(env, url, { user: u, tipo: item, amount, title, createdBy: u.role });
  return json({ url: link.checkout_url, amount: link.amount, title: link.title });
}

async function coachMpLink(req, env, url) {
  const b = await body(req);
  const u = await env.DB.prepare(`SELECT * FROM users WHERE id = ? AND role = 'alumno'`).bind(+b.userId).first();
  if (!u) throw new HttpError(404, 'no_existe');
  if (!(u.plan_monto > 0)) throw new HttpError(400, 'sin_plan', 'Ese alumno no tiene monto de plan.');
  const link = await createMpLink(env, url, { user: u, tipo: 'plan', amount: u.plan_monto, title: planTitle(u), createdBy: 'coach' });
  return json({ url: link.checkout_url, amount: link.amount, title: link.title, phone: u.phone, name: u.name });
}

async function semanaMpLink(req, env, url) {
  const u = await requireUser(req, env);
  if (u.role !== 'remoto') throw new HttpError(400, 'ya_incluido', 'Ya lo tienes incluido.');
  const amount = +env.SEMANA_PRECIO || 15000;
  const link = await createMpLink(env, url, { user: u, tipo: 'semana', amount, title: 'Endémico · El entrenamiento de la semana · 30 días', createdBy: 'remoto' });
  return json({ url: link.checkout_url, amount: link.amount, title: link.title });
}

/** Maps an order's status to what our screens show: approved | pending | rejected. */
function orderEstado(o) {
  if (o.status === 'processed' && (!o.status_detail || o.status_detail === 'accredited')) return 'approved';
  if (['created', 'processing', 'action_required'].includes(o.status)) return 'pending';
  return 'rejected'; // failed, canceled, expired, refunded, charged_back
}

/**
 * Looks the order up in MP (never trust the notification or the redirect) and records it once.
 * Returns 'approved' | 'pending' | 'rejected' | 'desconocido'.
 */
async function processMpOrder(env, orderId) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(orderId))) return 'desconocido';
  const link = await env.DB.prepare(`SELECT * FROM mp_links WHERE order_id = ?`).bind(String(orderId)).first();
  if (!link) return 'desconocido'; // not ours (another sale on the same MP account)
  const o = await mpFetch(env, `/v1/orders/${encodeURIComponent(orderId)}`);
  const estado = orderEstado(o);
  const pays = ((o.transactions && o.transactions.payments) || []).map((x) => `${x.status}/${x.status_detail}/${x.payment_method && x.payment_method.id}`);
  console.log('mercadopago: order', orderId, o.status, o.status_detail, JSON.stringify(pays));
  if (estado !== 'approved') return estado;
  const paid = Math.round(+o.total_paid_amount || +o.total_amount || 0);
  if (String(o.external_reference) !== link.ref || (o.currency && o.currency !== 'CLP') || paid < link.amount) {
    console.error('mercadopago: order mismatch', orderId, o.external_reference, o.currency, paid, link.amount);
    return 'rejected';
  }
  const payment = (o.transactions && o.transactions.payments && o.transactions.payments[0]) || {};
  const paidAt = Date.parse(o.last_updated_date || '') || Date.now();
  // Claim the link first: webhook retries and the return redirect can both arrive; only one records it.
  const claimed = await env.DB.prepare(`UPDATE mp_links SET paid_at = ? WHERE ref = ? AND paid_at IS NULL`).bind(paidAt, link.ref).run();
  if (!claimed.meta.changes) return 'approved';
  const planN = (link.tipo.match(/^plan([1-5])$/) || [])[1];
  if (link.tipo === 'plan' || planN) {
    // A plan: N × 4 classes for its month. Whoever buys it becomes a member with that plan (new people too).
    const u = await env.DB.prepare(`SELECT plan FROM users WHERE id = ?`).bind(link.user_id).first();
    const n = planN ? +planN : u.plan;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO payments (user_id, amount, method, status, paid_at, created_by, created_at, confirmed_at, mp_order_id, item, clases) VALUES (?, ?, 'mercadopago', 'confirmado', ?, 'mercadopago', ?, ?, ?, 'plan', ?)`
    ).bind(link.user_id, paid, paidAt, Date.now(), Date.now(), String(o.id), clasesDePlan(n) || null).run();
    if (planN) await env.DB.prepare(`UPDATE users SET plan = ?, plan_monto = ?, activo = 1, role = CASE WHEN role = 'coach' THEN role ELSE 'alumno' END WHERE id = ?`).bind(n, PLAN_PRECIOS[n], link.user_id).run();
  } else if (SERVICIOS[link.tipo]) {
    // One session of a service, to book whenever they want.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO payments (user_id, amount, method, status, paid_at, created_by, created_at, confirmed_at, mp_order_id, item, clases) VALUES (?, ?, 'mercadopago', 'confirmado', ?, 'mercadopago', ?, ?, ?, ?, 1)`
    ).bind(link.user_id, paid, paidAt, Date.now(), Date.now(), String(o.id), link.tipo).run();
    await env.DB.prepare(`UPDATE users SET role = 'alumno', activo = 1 WHERE id = ? AND role = 'remoto'`).bind(link.user_id).run();
  } else if (link.tipo === 'semana') {
    const u = await env.DB.prepare(`SELECT sub_until FROM users WHERE id = ?`).bind(link.user_id).first();
    const until = Math.max((u && u.sub_until) || 0, paidAt) + 30 * DAY;
    await env.DB.prepare(`UPDATE users SET sub_until = ? WHERE id = ?`).bind(until, link.user_id).run();
  }
  console.log('mercadopago: recorded', link.tipo, link.user_id, paid, o.id, payment.id || '');
  return 'approved';
}

/** Where MP sends the buyer back (?order_id=…&status=…&external_reference=…&payment_id=…). */
async function mpVuelta(env, url) {
  const q = url.searchParams;
  let orderId = q.get('order_id');
  let tipo = '';
  const ref = q.get('external_reference');
  if (ref) {
    const link = await env.DB.prepare(`SELECT order_id, tipo FROM mp_links WHERE ref = ?`).bind(ref).first();
    if (link) { orderId = orderId || link.order_id; tipo = link.tipo; }
  }
  if (!tipo && orderId) {
    const link = await env.DB.prepare(`SELECT tipo FROM mp_links WHERE order_id = ?`).bind(String(orderId)).first();
    if (link) tipo = link.tipo;
  }
  // The query string can be edited by anyone: it never makes a screen say "Pagado". Only MP's answer does.
  const st = q.get('status') || q.get('collection_status') || '';
  let estado = st === 'rejected' || st === 'failure' ? 'rejected' : 'pending';
  if (orderId && env.MP_ACCESS_TOKEN) {
    try { estado = await processMpOrder(env, orderId); } catch (e) { console.error(e); estado = 'pending'; }
  }
  if (estado === 'desconocido') estado = 'pending';
  return Response.redirect(`${url.origin}/#/pago/${encodeURIComponent(estado)}${tipo ? '?t=' + encodeURIComponent(tipo) : ''}`, 302);
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * x-signature: "ts=…,v1=…", HMAC-SHA256 (hex) of "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 * Order ids are uppercase alphanumeric: MP's docs say to lowercase data.id in the manifest.
 */
async function validMpSignature(req, env, dataId) {
  const header = req.headers.get('x-signature') || '';
  let ts = '', v1 = '';
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 'ts') ts = v;
    if (k === 'v1') v1 = v;
  }
  if (!ts || !v1) return false;
  const reqId = (req.headers.get('x-request-id') || '').trim();
  const id = dataId ? String(dataId).trim() : '';
  const manifest = (id ? `id:${/^[a-z0-9]+$/i.test(id) ? id.toLowerCase() : id};` : '') + (reqId ? `request-id:${reqId};` : '') + `ts:${ts};`;
  const mine = await hmacHex(env.MP_WEBHOOK_SECRET, manifest);
  if (mine.length !== v1.length) return false;
  let r = 0;
  for (let i = 0; i < mine.length; i++) r |= mine.charCodeAt(i) ^ v1.charCodeAt(i);
  return r === 0;
}

/** Webhook for the "Order (Mercado Pago)" event: POST ?data.id=ORD…&type=order */
async function mpWebhook(req, env, url) {
  const b = await body(req);
  const type = url.searchParams.get('type') || b.type;
  const dataId = url.searchParams.get('data.id') || (b.data && b.data.id);
  if (env.MP_WEBHOOK_SECRET && !(await validMpSignature(req, env, url.searchParams.get('data.id')))) return json({ error: 'firma_invalida' }, 401);
  if (type === 'order' && dataId && env.MP_ACCESS_TOKEN) {
    try { await processMpOrder(env, dataId); } catch (e) { console.error(e); return json({ error: 'retry' }, 500); }
  }
  return json({ ok: true });
}
