// La Junta: API + WhatsApp login, running on Cloudflare Workers with D1.
//
// Login flow ("Entrar con WhatsApp"):
//  1. POST /api/auth/start      → browser gets a short code (JUNTA-4F7K) bound to an HttpOnly cookie.
//  2. The person sends that code to La Junta's WhatsApp (wa.me link with the text prefilled).
//  3. POST /webhook/whatsapp    → we learn the verified phone number and reply with a 6-digit code.
//  4. POST /api/auth/verify     → the same browser types the 6 digits and gets a session.
// The 6 digits only work in the browser that started the login, so a shared/phished
// "send this to La Junta" link can't log someone else in.
//
// Manual mode (LOGIN_CODE set, no Meta account yet): the person types their number, WhatsApp
// opens a chat with WA_NUMBER asking for a code, and a human replies with the fixed LOGIN_CODE.
// The phone number is self-reported, not verified, so manual mode only creates new accounts:
// a number that already has an account is refused. Prototype only.

const LOGIN_TTL = 10 * 60 * 1000;      // how long the JUNTA-XXXX code waits for the WhatsApp
const OTP_TTL = 5 * 60 * 1000;         // how long the 6-digit code is valid
const MANUAL_TTL = 30 * 60 * 1000;     // manual mode: a human answers, so give them more time
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL = 60 * 24 * 60 * 60 * 1000; // 60 days
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

const SPOTS = {
  pv: { name: 'Puerto Varas', lat: -41.319, lon: -72.985 },
  cochamo: { name: 'Valle Cochamó', lat: -41.42, lon: -72.13 },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      const res = await route(request, env, ctx, url);
      return res || json({ error: 'not_found' }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
      console.error(err);
      return json({ error: 'server_error' }, 500);
    }
  },
};

async function route(req, env, ctx, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/webhook/whatsapp' && m === 'GET') return waVerify(url, env);
  if (p === '/webhook/whatsapp' && m === 'POST') return waWebhook(req, env, ctx);

  if (p === '/api/config' && m === 'GET') return config(env);
  if (p === '/api/auth/start' && m === 'POST') return authStart(req, env, url);
  if (p === '/api/auth/status' && m === 'GET') return authStatus(req, env);
  if (p === '/api/auth/verify' && m === 'POST') return authVerify(req, env, url);
  if (p === '/api/auth/logout' && m === 'POST') return logout(req, env, url);

  if (p === '/api/me' && m === 'GET') return getMe(req, env);
  if (p === '/api/me' && m === 'PATCH') return patchMe(req, env);

  if (p === '/api/weather' && m === 'GET') return weather(env, ctx);
  if (p === '/api/home' && m === 'GET') return home(req, env);

  if (p === '/api/juntas' && m === 'GET') return listJuntas(req, env);
  if (p === '/api/juntas' && m === 'POST') return createJunta(req, env);
  let mm = p.match(/^\/api\/juntas\/(\d+)\/join$/);
  if (mm && m === 'POST') return joinJunta(req, env, +mm[1], true);
  if (mm && m === 'DELETE') return joinJunta(req, env, +mm[1], false);
  mm = p.match(/^\/api\/juntas\/(\d+)$/);
  if (mm && m === 'DELETE') return deleteJunta(req, env, +mm[1]);

  if (p === '/api/socios' && m === 'GET') return getSocios(req, env);
  if (p === '/api/socios/checkout' && m === 'POST') return socioCheckout(req, env);

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

function randomCode(len = 4) {
  const a = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(a, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function randomOtp() {
  // Rejection sampling so every 6-digit code is equally likely.
  const a = new Uint32Array(1);
  let n;
  do { crypto.getRandomValues(a); n = a[0]; } while (n >= 4294000000);
  return String(n % 1000000).padStart(6, '0');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function clean(s, max = 120) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function firstName(name) {
  return clean(name).split(' ')[0] || '';
}

/** Public display name: "Camila R." */
function shortName(name) {
  const parts = clean(name).split(' ').filter(Boolean);
  if (!parts.length) return 'Escalador/a';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

function waLink(env, text) {
  return `https://wa.me/${env.WA_NUMBER}?text=${encodeURIComponent(text)}`;
}

const manualCode = (env) => (/^\d{6}$/.test(env.LOGIN_CODE || '') ? env.LOGIN_CODE : null);

/** "+56 9 8549 1126", "9 8549 1126" → "56985491126". Chilean mobiles without country code get +56. */
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

async function currentUser(req, env) {
  const token = cookies(req).lj_session;
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(await sha256(token), Date.now()).first();
  return row || null;
}

async function requireUser(req, env) {
  const u = await currentUser(req, env);
  if (!u) throw new HttpError(401, 'login_required');
  return u;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    shortName: shortName(u.name),
    level: u.level,
    origin: u.origin,
    lang: u.lang,
    phone: u.phone,
    onboarded: Boolean(u.level && u.origin && u.name),
  };
}

/* ------------------------------------------------------------------ config */

function config(env) {
  return json({
    manualLogin: Boolean(manualCode(env)),
    waNumber: env.WA_NUMBER,
    demo: env.DEMO === '1',
    cupos: +env.SOCIOS_CUPOS || 100,
    precio: +env.SOCIO_PRECIO || 100000,
  });
}

/* ------------------------------------------------------------------ auth */

const MSG = {
  es: {
    prefill: (code) => `Hola La Junta 👋 Quiero entrar. Mi código: JUNTA-${code}`,
    ask: 'Hola La Junta 👋 Quiero entrar a la app. ¿Me mandas mi código?',
    otp: (otp, name) =>
      `${name ? `¡Hola ${name}! ` : ''}Tu código para entrar a La Junta es *${otp}*\n\nVence en 5 minutos. Si no fuiste tú, ignora este mensaje.`,
    expired: 'Ese código ya venció. Vuelve a la web y aprieta *Entrar con WhatsApp* otra vez. 🧗',
    noCode: '¡Hola! 👋 Para entrar a La Junta, aprieta *Entrar con WhatsApp* en la web y envía el mensaje tal cual.',
  },
  en: {
    prefill: (code) => `Hi La Junta 👋 I want to log in. My code: JUNTA-${code}`,
    ask: 'Hi La Junta 👋 I want to log in to the app. Can you send me my code?',
    otp: (otp, name) =>
      `${name ? `Hi ${name}! ` : ''}Your La Junta login code is *${otp}*\n\nIt expires in 5 minutes. If this wasn't you, ignore this message.`,
    expired: 'That code expired. Go back to the website and tap *Log in with WhatsApp* again. 🧗',
    noCode: 'Hi! 👋 To log in to La Junta, tap *Log in with WhatsApp* on the website and send the message as it is.',
  },
};

async function authStart(req, env, url) {
  const b = await body(req);
  const lang = b.lang === 'en' ? 'en' : 'es';
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const now = Date.now();

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM login_requests WHERE ip = ? AND created_at > ?`
  ).bind(ip, now - 10 * 60 * 1000).first();
  if (recent.n >= 15) throw new HttpError(429, 'too_many', 'Demasiados intentos. Espera unos minutos.');

  // Pick a code that isn't waiting for anybody else right now.
  let code;
  for (let i = 0; i < 6; i++) {
    const c = randomCode(4);
    const taken = await env.DB.prepare(
      `SELECT 1 FROM login_requests WHERE code = ? AND status IN ('waiting','code_sent') AND expires_at > ?`
    ).bind(c, now).first();
    if (!taken) { code = c; break; }
  }
  if (!code) throw new HttpError(503, 'busy');

  const sid = randomToken();
  const fixed = manualCode(env);
  if (fixed) {
    const phone = normalizePhone(b.phone);
    if (!phone) throw new HttpError(400, 'bad_phone', lang === 'en' ? 'Check your WhatsApp number.' : 'Revisa tu número de WhatsApp.');
    // The fixed code proves nothing about the number, so it can only create new accounts.
    if (await env.DB.prepare(`SELECT 1 FROM users WHERE phone = ?`).bind(phone).first()) throw takenError(lang);
    const sidHash = await sha256(sid);
    await env.DB.prepare(
      `INSERT INTO login_requests (sid_hash, code, lang, status, phone, otp_hash, otp_expires, ip, created_at, expires_at)
       VALUES (?, ?, ?, 'code_sent', ?, ?, ?, ?, ?, ?)`
    ).bind(sidHash, code, lang, phone, await sha256(`${sidHash}:${fixed}`), now + MANUAL_TTL, ip, now, now + MANUAL_TTL).run();
    const text = MSG[lang].ask;
    return json(
      { manual: true, phone: maskPhone(phone), text, waLink: waLink(env, text), expiresAt: now + MANUAL_TTL },
      200,
      { 'set-cookie': setCookie('lj_login', sid, url, MANUAL_TTL / 1000) }
    );
  }

  await env.DB.prepare(
    `INSERT INTO login_requests (sid_hash, code, lang, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(await sha256(sid), code, lang, ip, now, now + LOGIN_TTL).run();

  const text = MSG[lang].prefill(code);
  return json(
    { code: `JUNTA-${code}`, text, waLink: waLink(env, text), expiresAt: now + LOGIN_TTL },
    200,
    { 'set-cookie': setCookie('lj_login', sid, url, LOGIN_TTL / 1000) }
  );
}

function takenError(lang) {
  return new HttpError(409, 'phone_taken', lang === 'en'
    ? 'This number already has a La Junta account. Message us on WhatsApp and we\'ll help you log in.'
    : 'Este número ya tiene cuenta en La Junta. Escríbenos por WhatsApp y te ayudamos a entrar.');
}

async function loginRow(req, env) {
  const sid = cookies(req).lj_login;
  if (!sid) return null;
  return env.DB.prepare(`SELECT * FROM login_requests WHERE sid_hash = ?`).bind(await sha256(sid)).first();
}

function maskPhone(phone) {
  if (!phone) return '';
  return `+${phone.slice(0, Math.max(1, phone.length - 8))} •••• ${phone.slice(-4)}`;
}

async function authStatus(req, env) {
  const row = await loginRow(req, env);
  if (!row) return json({ status: 'none' });
  const now = Date.now();
  let status = row.status;
  if (status === 'waiting' && row.expires_at < now) status = 'expired';
  if (status === 'code_sent' && row.otp_expires < now) status = 'expired';
  return json({ status, phone: maskPhone(row.phone), name: firstName(row.wa_name) });
}

async function authVerify(req, env, url) {
  const b = await body(req);
  const otp = String(b.otp || '').replace(/\D/g, '');
  const row = await loginRow(req, env);
  if (!row || row.status !== 'code_sent') throw new HttpError(400, 'no_login', 'Empieza de nuevo con “Entrar con WhatsApp”.');
  if (row.otp_expires < Date.now()) throw new HttpError(400, 'expired', 'El código venció. Pide uno nuevo.');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'too_many', 'Demasiados intentos. Pide un código nuevo.');

  await env.DB.prepare(`UPDATE login_requests SET attempts = attempts + 1 WHERE id = ?`).bind(row.id).run();
  const ok = otp.length === 6 && timingSafeEqual(await sha256(`${row.sid_hash}:${otp}`), row.otp_hash || '');
  if (!ok) {
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    throw new HttpError(400, 'bad_code', left > 0 ? `Código incorrecto. Te quedan ${left} intentos.` : 'Código incorrecto. Pide uno nuevo.');
  }

  const now = Date.now();
  let user = await env.DB.prepare(`SELECT * FROM users WHERE phone = ?`).bind(row.phone).first();
  if (user && manualCode(env)) throw takenError(row.lang); // someone else claimed this number first
  let isNew = false;
  if (!user) {
    isNew = true;
    user = await env.DB.prepare(
      `INSERT INTO users (phone, name, wa_name, lang, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *`
    ).bind(row.phone, clean(row.wa_name, 60), clean(row.wa_name, 60), row.lang, now).first();
  }

  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(`UPDATE login_requests SET status = 'done', otp_hash = NULL WHERE id = ?`).bind(row.id),
    env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .bind(await sha256(token), user.id, now, now + SESSION_TTL),
  ]);

  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', setCookie('lj_session', token, url, SESSION_TTL / 1000));
  headers.append('set-cookie', setCookie('lj_login', '', url, 0));
  return new Response(JSON.stringify({ user: publicUser(user), isNew }), { headers });
}

async function logout(req, env, url) {
  const token = cookies(req).lj_session;
  if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': setCookie('lj_session', '', url, 0) });
}

/**
 * Handles one inbound WhatsApp text. Returns the replies to send back.
 * Used by the real webhook.
 */
async function handleInbound(env, { from, name, text }) {
  const phone = String(from || '').replace(/\D/g, '');
  if (phone.length < 8) return [];
  const match = String(text || '').toUpperCase().match(/JUNTA[\s-]*([A-Z0-9]{4})\b/);
  const now = Date.now();

  if (!match) {
    const lang = /\b(hi|hello|log in|login)\b/i.test(text || '') ? 'en' : 'es';
    return [MSG[lang].noCode];
  }

  const row = await env.DB.prepare(
    `SELECT * FROM login_requests WHERE code = ? AND status IN ('waiting','code_sent') ORDER BY id DESC LIMIT 1`
  ).bind(match[1]).first();
  if (!row || row.expires_at < now) return [MSG.es.expired];

  // Someone already claimed this code from a different phone: don't let a second phone hijack it.
  if (row.status === 'code_sent' && row.phone !== phone) return [MSG[row.lang].expired];

  const otp = randomOtp();
  await env.DB.prepare(
    `UPDATE login_requests SET status = 'code_sent', phone = ?, wa_name = ?, otp_hash = ?, otp_expires = ?, attempts = 0 WHERE id = ?`
  ).bind(phone, clean(name, 60), await sha256(`${row.sid_hash}:${otp}`), now + OTP_TTL, row.id).run();

  const existing = await env.DB.prepare(`SELECT name FROM users WHERE phone = ?`).bind(phone).first();
  return [MSG[row.lang].otp(otp, firstName(existing?.name || name))];
}

// Meta webhook verification handshake.
function waVerify(url, env) {
  const ok = url.searchParams.get('hub.mode') === 'subscribe' &&
    env.WA_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN;
  return ok ? new Response(url.searchParams.get('hub.challenge') || '') : new Response('forbidden', { status: 403 });
}

async function waWebhook(req, env, ctx) {
  const raw = await req.text();

  // Verify Meta's signature (X-Hub-Signature-256 = HMAC-SHA256 of the raw body with the app secret).
  if (!env.WA_APP_SECRET) return new Response('not configured', { status: 503 });
  const sig = req.headers.get('x-hub-signature-256') || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WA_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const expected = 'sha256=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(sig, expected)) return new Response('bad signature', { status: 401 });

  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response('ok'); }

  const jobs = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
      for (const msg of v.messages || []) {
        if (msg.type !== 'text') continue;
        jobs.push((async () => {
          const replies = await handleInbound(env, { from: msg.from, name: names[msg.from], text: msg.text?.body });
          for (const r of replies) await waSend(env, msg.from, r);
        })());
      }
    }
  }
  // Answer Meta right away; finish the replies in the background.
  ctx.waitUntil(Promise.allSettled(jobs));
  return new Response('ok');
}

// The person wrote first, so this is a free-form reply inside WhatsApp's 24 h service window.
async function waSend(env, to, text) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WA_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  if (!res.ok) console.error('whatsapp send failed', res.status, await res.text());
}

/* ------------------------------------------------------------------ profile */

async function getMe(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ user: null });
  const socio = await env.DB.prepare(`SELECT number, display_name, paid_at FROM socios WHERE user_id = ?`).bind(u.id).first();
  return json({ user: { ...publicUser(u), socio: socio || null } });
}

async function patchMe(req, env) {
  const u = await requireUser(req, env);
  const b = await body(req);
  const name = b.name !== undefined ? clean(b.name, 60) : u.name;
  const level = ['empiezo', 'escalo', 'anos'].includes(b.level) ? b.level : u.level;
  const origin = ['pv', 'chile', 'mundo'].includes(b.origin) ? b.origin : u.origin;
  const lang = ['es', 'en'].includes(b.lang) ? b.lang : u.lang;
  if (!name) throw new HttpError(400, 'name_required', 'Cuéntanos tu nombre.');
  const row = await env.DB.prepare(
    `UPDATE users SET name = ?, level = ?, origin = ?, lang = ? WHERE id = ? RETURNING *`
  ).bind(name, level, origin, lang, u.id).first();
  return json({ user: publicUser(row) });
}

/* ------------------------------------------------------------------ weather */

// Live forecast from Open-Meteo (free, no key), cached 15 minutes. Used for the rain warning on juntas.
async function weather(env, ctx) {
  const cache = caches.default;
  const key = new Request('https://cache.lajunta.internal/weather-v2');
  const hit = await cache.match(key);
  if (hit) return hit;

  const out = {};
  await Promise.all(Object.entries(SPOTS).map(async ([id, s]) => {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}` +
      `&current=temperature_2m,precipitation,weather_code,wind_speed_10m,is_day` +
      `&daily=weather_code,precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min` +
      `&past_days=2&forecast_days=4&timezone=America%2FSantiago`;
    try {
      const r = await fetch(u, { cf: { cacheTtl: 900 } });
      const d = await r.json();
      const days = d.daily.time.map((t, i) => ({
        date: t,
        code: d.daily.weather_code[i],
        rain: d.daily.precipitation_sum[i],
        prob: d.daily.precipitation_probability_max[i],
        max: d.daily.temperature_2m_max[i],
        min: d.daily.temperature_2m_min[i],
      }));
      const today = days[2];
      const past48 = (days[0]?.rain || 0) + (days[1]?.rain || 0);
      let verdict = 'roca';
      if ((today.rain || 0) >= 1 || (today.prob || 0) >= 60) verdict = 'lluvia';
      else if (past48 >= 5) verdict = 'mojada';
      out[id] = {
        name: s.name,
        now: { temp: d.current.temperature_2m, code: d.current.weather_code, wind: d.current.wind_speed_10m, isDay: d.current.is_day },
        today, past48: Math.round(past48 * 10) / 10, verdict,
        next: days.slice(3),
      };
    } catch (e) {
      out[id] = { name: s.name, error: true };
    }
  }));

  const res = json({ spots: out, at: Date.now() }, 200, { 'cache-control': 'public, max-age=900' });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/* ------------------------------------------------------------------ home */

async function home(req, env) {
  const now = Date.now();
  const [people, juntas, socios] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM juntas WHERE starts_at > ?`).bind(now - 3 * 3600e3).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM socios`).first(),
  ]);
  return json({ people: people.n, juntas: juntas.n, socios: socios.n, cupos: +env.SOCIOS_CUPOS || 100 });
}

/* ------------------------------------------------------------------ juntas */

async function listJuntas(req, env) {
  const me = await currentUser(req, env);
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT j.*, u.name AS org_name, u.level AS org_level, u.origin AS org_origin, u.phone AS org_phone,
            (SELECT COUNT(*) FROM junta_members m WHERE m.junta_id = j.id) AS joined_count
       FROM juntas j JOIN users u ON u.id = j.user_id
      WHERE j.starts_at > ?
      ORDER BY j.starts_at ASC LIMIT 60`
  ).bind(now - 3 * 3600e3).all();

  const ids = results.map((r) => r.id);
  const members = {};
  if (ids.length) {
    const { results: ms } = await env.DB.prepare(
      `SELECT m.junta_id, u.id, u.name, u.phone, u.origin FROM junta_members m JOIN users u ON u.id = m.user_id
        WHERE m.junta_id IN (${ids.map(() => '?').join(',')}) ORDER BY m.created_at`
    ).bind(...ids).all();
    for (const m of ms) (members[m.junta_id] ||= []).push(m);
  }

  const juntas = results.map((j) => {
    const ms = members[j.id] || [];
    const mine = me && j.user_id === me.id;
    const joined = me && ms.some((m) => m.id === me.id);
    // Phone numbers are only shared among the people inside the same junta.
    const inside = mine || joined;
    return {
      id: j.id, kind: j.kind, place: j.place, meet: j.meet, startsAt: j.starts_at, seats: j.seats, note: j.note,
      organizer: { name: shortName(j.org_name), level: j.org_level, origin: j.org_origin, phone: inside ? j.org_phone : null },
      members: ms.map((m) => ({ name: shortName(m.name), origin: m.origin, phone: inside ? m.phone : null })),
      joinedCount: j.joined_count,
      full: j.seats > 0 && j.joined_count >= j.seats,
      mine: Boolean(mine), joined: Boolean(joined),
    };
  });
  return json({ juntas });
}

async function createJunta(req, env) {
  const u = await requireUser(req, env);
  const b = await body(req);
  const kind = ['roca', 'cordada', 'sesion'].includes(b.kind) ? b.kind : null;
  const place = clean(b.place, 60);
  const meet = clean(b.meet, 80);
  const note = clean(b.note, 280);
  const startsAt = Number(b.startsAt);
  const seats = Math.max(0, Math.min(12, parseInt(b.seats, 10) || 0));
  if (!kind) throw new HttpError(400, 'bad_kind', 'Elige qué tipo de junta es.');
  if (!place) throw new HttpError(400, 'place_required', '¿A dónde van?');
  if (!startsAt || startsAt < Date.now() - 3600e3 || startsAt > Date.now() + 120 * 864e5)
    throw new HttpError(400, 'bad_date', 'Revisa la fecha y la hora.');
  const row = await env.DB.prepare(
    `INSERT INTO juntas (user_id, kind, place, meet, starts_at, seats, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(u.id, kind, place, meet, startsAt, seats, note, Date.now()).first();
  return json({ id: row.id });
}

async function joinJunta(req, env, id, join) {
  const u = await requireUser(req, env);
  const j = await env.DB.prepare(
    `SELECT j.*, (SELECT COUNT(*) FROM junta_members m WHERE m.junta_id = j.id) AS n FROM juntas j WHERE j.id = ?`
  ).bind(id).first();
  if (!j) throw new HttpError(404, 'not_found');
  if (j.user_id === u.id) throw new HttpError(400, 'own', 'Es tu junta.');
  if (join) {
    if (j.seats > 0 && j.n >= j.seats) throw new HttpError(409, 'full', 'Ya no quedan cupos.');
    await env.DB.prepare(`INSERT OR IGNORE INTO junta_members (junta_id, user_id, created_at) VALUES (?, ?, ?)`)
      .bind(id, u.id, Date.now()).run();
  } else {
    await env.DB.prepare(`DELETE FROM junta_members WHERE junta_id = ? AND user_id = ?`).bind(id, u.id).run();
  }
  return json({ ok: true });
}

async function deleteJunta(req, env, id) {
  const u = await requireUser(req, env);
  await env.DB.prepare(`DELETE FROM junta_members WHERE junta_id = ? AND junta_id IN (SELECT id FROM juntas WHERE user_id = ?)`).bind(id, u.id).run();
  const r = await env.DB.prepare(`DELETE FROM juntas WHERE id = ? AND user_id = ?`).bind(id, u.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
  return json({ ok: true });
}

/* ------------------------------------------------------------------ socios honorarios */

async function getSocios(req, env) {
  const me = await currentUser(req, env);
  const { results } = await env.DB.prepare(`SELECT number, display_name, user_id FROM socios ORDER BY number`).all();
  return json({
    cupos: +env.SOCIOS_CUPOS || 100,
    precio: +env.SOCIO_PRECIO || 100000,
    tomados: results.length,
    lista: results.map((s) => ({ n: s.number, name: s.display_name, mine: Boolean(me && s.user_id === me.id) })),
  });
}

// Prototype: the payment is simulated. In production this creates a Mercado Pago / Flow
// checkout and the socio row is written from the payment provider's confirmation webhook.
async function socioCheckout(req, env) {
  const u = await requireUser(req, env);
  const b = await body(req);
  const cupos = +env.SOCIOS_CUPOS || 100;
  const precio = +env.SOCIO_PRECIO || 100000;

  const existing = await env.DB.prepare(`SELECT * FROM socios WHERE user_id = ?`).bind(u.id).first();
  if (existing) return json({ socio: { number: existing.number, name: existing.display_name }, already: true });

  const display = clean(b.displayName || u.name, 40);
  if (!display) throw new HttpError(400, 'name_required', '¿Qué nombre ponemos en el muro?');

  for (let attempt = 0; attempt < 5; attempt++) {
    const { n } = await env.DB.prepare(`SELECT COALESCE(MAX(number), 0) + 1 AS n FROM socios`).first();
    if (n > cupos) throw new HttpError(409, 'sold_out', 'Se completaron los cupos. ¡Gracias por querer ser parte!');
    try {
      await env.DB.prepare(
        `INSERT INTO socios (user_id, number, display_name, amount, method, paid_at) VALUES (?, ?, ?, ?, 'simulado', ?)`
      ).bind(u.id, n, display, precio, Date.now()).run();
      return json({ socio: { number: n, name: display } });
    } catch (e) {
      if (!String(e.message).includes('UNIQUE')) throw e; // someone took this number at the same time: retry
    }
  }
  throw new HttpError(503, 'busy', 'Intenta de nuevo.');
}
