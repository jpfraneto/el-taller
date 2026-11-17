// TuAuto (El Taller, Ep. 06). The Worker serves public/ and three small APIs:
//   POST /api/mirar            a photo → what car it is (OpenRouter vision model; Workers AI if that fails). Nothing is stored.
//   POST /api/solicitudes      the seller taps "Mandar a TuAuto": the card (+ small photo) lands in the team inbox.
//   GET/POST /api/equipo/...   the team inbox (/equipo), behind EQUIPO_KEY.
// Pricing happens in the browser (public/js/precio.js) from public/data/*.json: no secrets there.
const CARROCERIAS = ['citycar', 'hatchback', 'sedan', 'suv', 'pickup', 'comercial', 'coupe', 'otro'];
const ESTADOS_VISIBLES = ['impecable', 'bueno', 'con detalles', 'para reparar'];

const AUTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['es_auto', 'marca', 'modelo', 'version', 'generacion', 'ano_desde', 'ano_hasta', 'carroceria', 'color',
    'estado', 'detalles', 'confianza', 'nota', 'talla'],
  properties: {
    es_auto: { type: 'boolean' },
    marca: { type: 'string' },
    modelo: { type: 'string' },
    version: { type: 'string' },
    generacion: { type: 'string' },
    ano_desde: { type: 'integer' },
    ano_hasta: { type: 'integer' },
    carroceria: { type: 'string', enum: CARROCERIAS },
    color: { type: 'string' },
    estado: { type: 'string', enum: ESTADOS_VISIBLES },
    detalles: { type: 'array', items: { type: 'string' } },
    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
    nota: { type: 'string' },
    talla: { type: 'string' },
  },
};

const PROMPT = `Eres el tasador de TuAuto, una automotora de Temuco, Chile. Alguien le sacó una foto a su auto para saber cuánto vale.

Mira la foto y responde en español de Chile, en el formato pedido:
- es_auto: true si en la foto hay un auto, SUV, camioneta o furgón (el principal, si hay varios).
- marca y modelo: como se venden en Chile ("Suzuki", "Swift"; "Chevrolet", "D-Max"; "Toyota", "Corolla Cross"). Sin la versión.
- version: solo si se lee en la foto (un emblema, "4x4", "GLX"); si no, "".
- generacion: la generación que reconoces por la carrocería, en pocas palabras ("3ª generación, 2017–2023").
- ano_desde / ano_hasta: los años del modelo que calzan con lo que se ve (la generación, o el facelift si lo distingues).
- carroceria: citycar, hatchback, sedan, suv, pickup, comercial (furgón), coupe u otro.
- color: el color en una o dos palabras ("rojo", "gris plata").
- estado: solo por lo que se ve: impecable, bueno, con detalles (rayas, abolladuras, focos opacos) o para reparar.
- detalles: hasta 4 cosas que SE VEN POR FUERA en la foto y afectan el precio, buenas o malas ("llantas de aleación", "parachoque rayado", "focos opacos", "barras de techo"). Nunca equipamiento que no se ve (aire acondicionado, bluetooth, cámara, frenos, airbags). Si no ves nada especial, deja la lista vacía.
- confianza: alta si estás seguro de marca y modelo, media si dudas entre dos, baja si casi no se ve.
- nota: UNA frase corta (máximo 15 palabras), cercana, tuteando, sin saludos formales (\"¡Buen auto! Se nota cuidado.\"). Si es_auto es false, di qué ves y pídele una foto del auto completo, de lado o de frente.
- talla: UNA frase (máximo 20 palabras) que te agarra pa'l hueveo por tu auto, con cariño, como un amigo chileno en un asado. Juega con la FAMA del modelo en Chile (quién lo maneja, para qué se usa, el cliché) o con algo concreto que se vea en la foto. Tiene que ser específica de ESE auto: si sirve para cualquier auto, no sirve. Nada de clima, sol ni barro. Sin groserías, nada sobre la persona. Tono de ejemplo (no los copies): Suzuki Swift: "El auto oficial de la primera pega: chico, rendidor y siempre con una multa de estacionamiento."; Toyota Hilux: "Doble cabina para ir al supermercado como si fueras a cosechar."; Ford Mustang: "Crisis de los 40, versión V8."; Kia Morning: "Se estaciona en cualquier parte, incluso en tu bolsillo.". Si es_auto es false, "".
Si no es un auto, usa "" en los textos, 0 en los años, "otro" y "bueno" en los campos con opciones.`;

// Models sold in Chile (their stock + the price table): a hint so the model says "Corolla Cross" and not "Raize".
let CANDIDATOS = null;
async function candidatos(env, req) {
  if (CANDIDATOS) return CANDIDATOS;
  const get = (p) => env.ASSETS.fetch(new Request(new URL(p, req.url))).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [stock, ref] = await Promise.all([get('/data/stock.json'), get('/data/precios.json')]);
  const set = new Set();
  for (const m of ref?.modelos || []) set.add(`${m.marca} ${m.modelo}`);
  for (const a of stock?.autos || []) set.add(a.titulo.split(' ').slice(0, 3).join(' ').replace(/\s+[\d.]+.*$/, ''));
  CANDIDATOS = [...set].sort().join(', ');
  return CANDIDATOS;
}

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function body(req) {
  try { return await req.json(); } catch { throw new HttpError(400, 'json_invalido'); }
}

function dataUrl(s, max) {
  const m = String(s || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(400, 'foto_invalida', 'Sube una foto (JPG o PNG).');
  if (s.length > max) throw new HttpError(413, 'foto_muy_grande', 'La foto es muy grande.');
  return { mediaType: m[1], base64: m[2] };
}

async function limitar(env, req) {
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const key = `rl:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const n = Number(await env.SOLICITUDES.get(key)) || 0;
  if (n >= Number(env.LIMITE_DIARIO || 40)) throw new HttpError(429, 'limite', 'Ya tasaste muchos autos hoy. Vuelve mañana.');
  await env.SOLICITUDES.put(key, String(n + 1), { expirationTtl: 60 * 60 * 26 });
}

// ── Reading the photo ───────────────────────────────────────────────────────

const conPista = (lista) => `${PROMPT}\n\nModelos comunes en Chile (pista, no una lista cerrada; si el auto no está, nómbralo igual): ${lista}.`;

// OpenRouter (El Taller's AI for every project). Picked on 2026-11-09 from 5 cheap vision models on 16 labeled photos:
// gemini-2.5-flash-lite got 14/16 at ~$0.21 per 1000 photos (~2.5 s); the second model is OpenRouter's fallback.
const OPENROUTER_MODELS = ['google/gemini-2.5-flash-lite', 'google/gemini-3.1-flash-lite'];

async function mirarConOpenRouter(env, img, lista) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'http-referer': 'https://tuauto.jpfraneto.com',
      'x-title': 'TuAuto · El Taller',
    },
    body: JSON.stringify({
      models: env.OPENROUTER_MODEL ? [env.OPENROUTER_MODEL] : OPENROUTER_MODELS,
      temperature: 0.6,
      max_tokens: 900,
      response_format: { type: 'json_schema', json_schema: { name: 'auto', strict: true, schema: AUTO_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } },
          { type: 'text', text: conPista(lista) },
        ],
      }],
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.choices?.[0]) throw new Error(`openrouter ${r.status} ${JSON.stringify(j?.error || j).slice(0, 200)}`);
  const text = String(j.choices[0].message?.content || '');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('openrouter: no json');
  return { auto: JSON.parse(m[0]), modelo: j.model };
}

const WORKERS_AI_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/google/gemma-3-12b-it',
  '@cf/mistralai/mistral-small-3.1-24b-instruct'];

async function mirarConWorkersAI(env, img, modelo, lista) {
  const model = WORKERS_AI_MODELS.includes(modelo) ? modelo : (env.WORKERS_AI_MODEL || WORKERS_AI_MODELS[0]);
  const messages = [
    { role: 'system', content: `${conPista(lista)}\n\nResponde SOLO con un objeto JSON con estas claves: ${AUTO_SCHEMA.required.join(', ')}.` },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Esta es la foto del auto.' },
        { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } },
      ],
    },
  ];
  const out = await env.AI.run(model, {
    messages,
    max_tokens: 900,
    temperature: 0.1,
    response_format: { type: 'json_schema', json_schema: AUTO_SCHEMA },
  });
  const r = out?.response;
  if (r && typeof r === 'object') return r;
  const m = String(r || '').match(/\{[\s\S]*\}/);
  if (!m) throw new HttpError(502, 'sin_respuesta', 'No pude leer la foto. Prueba de nuevo.');
  return JSON.parse(m[0]);
}

// The joke ("te agarra pa'l hueveo"): the vision model reads the car well but isn't funny, so a writer model
// gets the facts and writes the line (2026-11-09: ~1.2 s, ~US$0,0005 per car). If it fails, the vision model's line stays.
const TALLA_MODEL = 'anthropic/claude-sonnet-5.5';
async function tallaConClaude(env, a) {
  const auto = [`${a.marca} ${a.modelo}`, a.generacion, a.color, ...a.detalles].filter(Boolean).join(', ');
  const prompt = `Auto de la foto: ${auto}.
Escribe UNA talla corta (8 a 16 palabras) que agarra pa'l hueveo al dueño de este auto, tuteándolo, con cariño, como un amigo chileno en un asado. Juega con la fama de ESE modelo en Chile: quién lo maneja, para qué se usa, el cliché. Una sola idea, remate al final. Nada de limpieza ni lavado. Sin groserías, nada ofensivo, nada sobre el cuerpo, la familia ni la plata de la persona. Tono (no copies): Toyota Hilux: "Doble cabina pa' ir al supermercado como si fueras a cosechar." · Ford Mustang: "Crisis de los 40, versión V8."
Responde solo la frase, sin comillas.`;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json',
      'http-referer': 'https://tuauto.jpfraneto.com', 'x-title': 'TuAuto · El Taller' },
    body: JSON.stringify({ model: TALLA_MODEL, max_tokens: 1500, reasoning: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json().catch(() => null);
  const txt = String(j?.choices?.[0]?.message?.content || '').trim().split('\n')[0].trim().replace(/^["“«]|["”»]$/g, '');
  if (!r.ok || !txt) throw new Error(`talla ${r.status}`);
  return txt.slice(0, 200);
}

function limpiarAuto(a) {
  const s = (v, n = 60) => String(v ?? '').trim().slice(0, n);
  const y = (v) => { const n = Number(v); return n >= 1980 && n <= 2027 ? Math.round(n) : 0; };
  let desde = y(a.ano_desde), hasta = y(a.ano_hasta);
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  return {
    es_auto: Boolean(a.es_auto),
    marca: s(a.marca, 30), modelo: s(a.modelo, 40), version: s(a.version, 40), generacion: s(a.generacion, 80),
    ano_desde: desde, ano_hasta: hasta || desde,
    carroceria: CARROCERIAS.includes(a.carroceria) ? a.carroceria : 'otro',
    color: s(a.color, 30),
    estado: ESTADOS_VISIBLES.includes(a.estado) ? a.estado : 'bueno',
    detalles: (Array.isArray(a.detalles) ? a.detalles : []).map((d) => s(d, 60)).filter(Boolean).slice(0, 4),
    confianza: ['alta', 'media', 'baja'].includes(a.confianza) ? a.confianza : 'media',
    nota: s(String(a.nota ?? '').split(/(?<=[.!?])\s/)[0], 140),
    talla: s(a.talla, 200),
  };
}

async function mirar(req, env) {
  const b = await body(req);
  const img = dataUrl(b.image, 2_400_000);
  await limitar(env, req);
  const t = Date.now();
  const lista = await candidatos(env, req);
  let auto, motor;
  if (env.OPENROUTER_API_KEY) {
    try {
      const r = await mirarConOpenRouter(env, img, lista);
      auto = r.auto; motor = r.modelo;
    } catch (e) {
      console.error(e.message); // fall through to Cloudflare's own model so the person still gets an answer
    }
  }
  if (!auto) { auto = await mirarConWorkersAI(env, img, b.modelo, lista); motor = 'workers-ai'; }
  const limpio = limpiarAuto(auto);
  if (limpio.es_auto && env.OPENROUTER_API_KEY) {
    const mejor = await tallaConClaude(env, limpio).catch((e) => { console.error(e.message); return ''; });
    if (mejor) limpio.talla = mejor;
  }
  return json({ auto: limpio, motor, ms: Date.now() - t });
}

// ── Requests to the team ────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigo = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
const ESTADOS = ['nueva', 'tomada', 'revision', 'cerrada'];
const EQUIPO = ['Sergio', 'Patricio', 'Ventas'];

function claveDe(ts, id) { return `s:${String(9e15 - ts).padStart(16, '0')}:${id}`; }

async function crearSolicitud(req, env) {
  const b = await body(req);
  const foto = b.foto ? dataUrl(b.foto, 400_000) && b.foto : '';
  const s = (v, n = 60) => String(v ?? '').trim().slice(0, n);
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const ts = Date.now();
  const id = /^[A-Z2-9]{4}$/.test(b.id) ? b.id : codigo();
  const meta = {
    id, ts,
    auto: s(b.auto, 70), ano: num(b.ano), km: num(b.km),
    min: num(b.min), max: num(b.max),
    camino: b.camino === 'consigna' ? 'consigna' : 'hoy',
    nombre: s(b.nombre, 40), estado: 'nueva', quien: '',
    demo: Boolean(b.demo),
  };
  // KV metadata is capped at 1024 bytes: keep the card small; the photo goes in the value.
  await env.SOLICITUDES.put(claveDe(ts, id), foto, { metadata: meta });
  // Direct lookup by code (KV list() takes up to a minute to show new keys; get() doesn't).
  await env.SOLICITUDES.put(`i:${id}`, claveDe(ts, id));
  return json({ ok: true, id });
}

function equipoOk(req, env) {
  const k = req.headers.get('x-equipo') || new URL(req.url).searchParams.get('k');
  if (!env.EQUIPO_KEY || k !== env.EQUIPO_KEY) throw new HttpError(401, 'clave', 'Clave incorrecta.');
}

// Status and owner live in a small key per card (e:<id>): list() metadata can lag a minute behind writes, get() doesn't.
async function listar(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.SOLICITUDES.list({ prefix: 's:', limit: 100, cursor });
    for (const k of page.keys) out.push({ key: k.name, ...k.metadata });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && out.length < 100);
  const estados = await Promise.all(out.map((x) => env.SOLICITUDES.get(`e:${x.id}`, 'json')));
  return out.map((x, i) => (estados[i]?.borrada ? null : { ...x, ...(estados[i] || {}) })).filter(Boolean);
}

async function porCodigo(env, id) {
  const key = await env.SOLICITUDES.get(`i:${id}`);
  if (!key) return null;
  const { value, metadata } = await env.SOLICITUDES.getWithMetadata(key);
  if (!metadata) return null;
  return { key, foto: value || '', meta: metadata };
}

async function equipo(req, env, path) {
  equipoOk(req, env);
  if (path === '/api/equipo/solicitudes' && req.method === 'GET') {
    return json({ solicitudes: await listar(env), equipo: EQUIPO });
  }
  let m = path.match(/^\/api\/equipo\/foto\/([A-Z0-9]{4})$/);
  if (m && req.method === 'GET') {
    const it = await porCodigo(env, m[1]);
    const v = it?.foto;
    if (!v) throw new HttpError(404, 'sin_foto');
    const [head, b64] = v.split(',');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'content-type': head.slice(5, head.indexOf(';')), 'cache-control': 'private, max-age=3600' } });
  }
  m = path.match(/^\/api\/equipo\/solicitudes\/([A-Z0-9]{4})$/);
  if (m && req.method === 'POST') {
    const b = await body(req);
    const it = await porCodigo(env, m[1]);
    if (!it) throw new HttpError(404, 'no_existe');
    const { key, meta } = it;
    if (b.borrar) {
      await Promise.all([env.SOLICITUDES.delete(key), env.SOLICITUDES.delete(`i:${m[1]}`),
        env.SOLICITUDES.put(`e:${m[1]}`, JSON.stringify({ borrada: true }), { expirationTtl: 86400 })]);
      return json({ ok: true });
    }
    const e = (await env.SOLICITUDES.get(`e:${m[1]}`, 'json')) || { estado: meta.estado, quien: meta.quien };
    if (ESTADOS.includes(b.estado)) e.estado = b.estado;
    if (b.quien === '' || EQUIPO.includes(b.quien)) e.quien = b.quien;
    await env.SOLICITUDES.put(`e:${m[1]}`, JSON.stringify(e));
    return json({ ok: true, solicitud: { key, ...meta, ...e } });
  }
  throw new HttpError(404, 'no_existe');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/api/mirar' && req.method === 'POST') return await mirar(req, env);
      if (p === '/api/solicitudes' && req.method === 'POST') return await crearSolicitud(req, env);
      if (p.startsWith('/api/equipo/')) return await equipo(req, env, p);
      if (p === '/api/estado') return json({ lector: env.OPENROUTER_API_KEY ? (env.OPENROUTER_MODEL || OPENROUTER_MODELS[0]) : 'workers-ai' });
      if (p.startsWith('/api/')) throw new HttpError(404, 'no_existe');
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: 'interno', message: 'Algo falló. Prueba de nuevo.' }, 500);
    }
  },
};
