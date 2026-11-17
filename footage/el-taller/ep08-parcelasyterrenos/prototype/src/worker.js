// Parcelas y Terrenos (El Taller, Ep. 08): a marketplace of parcels on a domain Google has sent people to since 2012.
// Listing is free, no commission; the money is the AUSPICIO: billboards on the map, in front of the traffic. ("Destacar",
// a paid parcel on top, was taken out on 2026-11-16, JP: "yo sacaría el destacar del prototipo".)
//   GET  /, /parcelas/, /fotogaleria/, /plano/, /contactanos/, /home/, /sitemap/   the addresses the Webnode site has had
//        since 2012 (same <title>s), so Google's links keep landing · /parcela/<id> one listing · /publicar/ the form
//   GET  /api/parcelas   every published listing (Sebastián's from data/parcelas.json + the ones others publish, in KV)
//   POST /api/chat       Claude answers about any listing; the lead goes to that listing's seller
//   POST /api/visita     a visit to one listing · POST /api/publicar  a new listing (pending) · POST /api/auspicio  a sponsor
//   GET  /f/<key>        a photo someone uploaded
//   The index (src/indice.js + src/fuentes.js): parcels from public listings all over Chile, facts only + the link,
//   refreshed by the daily cron · /fuentes/ says where they come from · POST /api/quitar removes one at once
//   GET/POST /api/panel  the site owner's panel (/sebastian), behind PANEL_KEY
// KV (DB): c:<id> conversations/leads · p:<id> listings · f:<id>-<n> photos · a:<ts> sponsors · rl:… rate limits.
import { todo, filtrar, porRegion, parecidas, actualizar, subir, ubicar, item, olvidar, REGIONES, region as regionDe } from './indice.js';
import { leerFeedXML, leerCorredora, listarCorredoras } from './corredoras.js';
import { pagar, webhook, vuelta, cartelesActivos, cupoPara, ordenarCarteles, comprasDelMes, PagoError } from './pagos.js';

const MODELOS = ['anthropic/claude-haiku-5.5', 'anthropic/claude-sonnet-5.5'];
const TEMAS = ['precio', 'credito', 'visita', 'agua_luz', 'ubicacion', 'fotos', 'tamano', 'subdivision', 'papeles', 'construir', 'vender', 'auspiciar', 'otro'];
const ESTADOS = ['nuevo', 'contactado', 'visita', 'negociando', 'vendido', 'descartado'];
const SERVICIOS = ['Rol propio', 'Luz', 'Agua potable', 'Pozo', 'Camino pavimentado', 'Vista a los volcanes', 'Vista al lago', 'Bosque nativo', 'Estero o río', 'Plana', 'Factibilidad de luz'];

// The old site's pages → section + the <title> Google already shows for it.
const PAGINAS = {
  '/': ['inicio', 'Parcelas, propiedades y venta. Puerto Varas'],
  '/home/': ['inicio', 'Parcelas, propiedades y venta. Puerto Varas'],
  '/parcelas/': ['todas', 'Parcelas :: PARCELAS Y TERRENOS'],
  '/fotogaleria/': ['todas', 'Parcelas y propiedades en Puerto Varas'],
  '/plano/': ['todas', 'Parcelas de 5.000 mts2 a la venta'],
  '/contactanos/': ['contacto', 'Contáctanos :: PARCELAS Y TERRENOS'],
  '/sitemap/': ['inicio', 'Mapa del sitio :: PARCELAS Y TERRENOS'],
  '/publicar/': ['publicar', 'Publica tu parcela gratis, sin comisión :: PARCELAS Y TERRENOS'],
  '/fuentes/': ['fuentes', 'De dónde vienen las parcelas :: PARCELAS Y TERRENOS'],
  '/corredoras/': ['corredoras', 'Corredoras: pon tus parcelas en el mapa, gratis :: PARCELAS Y TERRENOS'],
};

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
async function body(req) {
  try { return await req.json(); } catch { throw new HttpError(400, 'json_invalido'); }
}
const s = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const largo = (v, n) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const hoyCL = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });

function telefono(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 8) d = '569' + d;
  else if (d.length === 9 && d[0] === '9') d = '56' + d;
  return /^569\d{8}$/.test(d) ? d : '';
}

async function limitar(env, req, max, que) {
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const key = `rl:${hoyCL()}:${que}:${ip}`;
  const n = Number(await env.DB.get(key)) || 0;
  if (n >= max) throw new HttpError(429, 'limite', 'Por hoy ya fue harto. Vuelve mañana o escribe por WhatsApp.');
  await env.DB.put(key, String(n + 1), { expirationTtl: 60 * 60 * 26 });
}

async function listarTodo(env, prefijo) {
  const out = [];
  let cursor;
  do {
    const r = await env.DB.list({ prefix: prefijo, cursor });
    out.push(...r.keys);
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

// ── Listings ────────────────────────────────────────────────────────────────

let DATOS = null;
async function datos(env, req) {
  if (!DATOS) DATOS = await env.ASSETS.fetch(new Request(new URL('/data/parcelas.json', req.url))).then((r) => r.json());
  return DATOS;
}

// Every listing in one shape, the seller inside, so the page and Claude never need a second lookup.
async function parcelas(env, req, { todas = false } = {}) {
  const d = await datos(env, req);
  const fijas = d.parcelas.map((p) => ({ ...p, fija: true, estado: 'publicada', t: Date.UTC(2012, 5, 26), vendedor: { id: p.vendedor, ...d.vendedores[p.vendedor] } }));
  const keys = await listarTodo(env, 'p:');
  const kv = (await Promise.all(keys.map((k) => env.DB.get(k.name, 'json')))).filter(Boolean);
  // (p:<id> {override: true} were the old "featured" switches for his own listings: not listings, skipped.)
  const todasLas = [...fijas, ...kv.filter((p) => !p.override)];
  return todas ? todasLas : todasLas.filter((p) => p.estado === 'publicada');
}

const publica = ({ interes_destacar, destacada, ...p }) => p;   // what the page sees

function slug(t) {
  return s(t, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'parcela';
}

function foto(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(400, 'foto', 'Una de las fotos no se pudo leer.');
  if (m[2].length > 1_100_000) throw new HttpError(413, 'foto_grande', 'Una foto es muy grande.');
  return { tipo: m[1], bin: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)) };
}

async function publicar(req, env) {
  const b = await body(req);
  await limitar(env, req, 6, 'publicar');
  const tel = telefono(b.telefono);
  if (!s(b.nombre)) throw new HttpError(400, 'nombre', 'Falta tu nombre.');
  if (!tel) throw new HttpError(400, 'telefono', 'Revisa tu WhatsApp (ej: 9 1234 5678).');
  if (!s(b.titulo) || !s(b.comuna)) throw new HttpError(400, 'parcela', 'Falta el título y la comuna de tu parcela.');
  const m2 = Math.round(Number(String(b.m2 || '').replace(/\D/g, ''))) || 0;
  const precio = Math.round(Number(String(b.precio || '').replace(/\D/g, ''))) || null;
  const fotos = (Array.isArray(b.fotos) ? b.fotos : []).slice(0, 8).map(foto);
  const id = `${slug(b.titulo)}-${crypto.randomUUID().slice(0, 4)}`;
  const urls = [];
  for (const [i, f] of fotos.entries()) {
    await env.DB.put(`f:${id}-${i}`, f.bin, { metadata: { tipo: f.tipo } });
    urls.push(`/f/${id}-${i}`);
  }
  const p = {
    id, estado: 'publicada', t: Date.now(),      // live at once; the panel can take it down
    titulo: s(b.titulo, 80), region: regionDe(b.region) || regionDe(b.comuna), comuna: s(b.comuna, 40), sector: s(b.sector, 80), m2,
    superficie: m2 ? (m2 >= 10000 ? `${(m2 / 10000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ha` : `${m2.toLocaleString('es-CL')} m²`) : '',
    cantidad: '1 parcela', precio, credito: Boolean(b.credito),
    chips: (Array.isArray(b.servicios) ? b.servicios : []).filter((x) => SERVICIOS.includes(x)),
    texto: largo(b.texto, 1500), fotos: urls,
    vendedor: { id: `v-${tel}`, nombre: s(b.nombre, 60), quien: s(b.quien, 240), lugar: s(b.comuna, 40), desde: new Date().getFullYear(), whatsapp: tel },
    ...(b.demo === true ? { demo: true } : {}),     // the screen recording's listing: removable with "Borrar ejemplos"
  };
  await env.DB.put(`p:${id}`, JSON.stringify(p));
  return json({ ok: true, id });
}

async function auspicio(req, env) {
  const b = await body(req);
  await limitar(env, req, 6, 'auspicio');
  const tel = telefono(b.telefono);
  if (!s(b.empresa) || !tel) throw new HttpError(400, 'datos', 'Faltan tu empresa y tu WhatsApp.');
  const a = { empresa: s(b.empresa, 80), nombre: s(b.nombre, 60), telefono: tel, que: s(b.que, 400), t: Date.now(), estado: 'nuevo' };
  await env.DB.put(`a:${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, JSON.stringify(a));
  return json({ ok: true });
}

// A billboard is a link: "https://casasdelsur.cl/x" → the URL to open and "casasdelsur.cl" to show.
function enlace(v) {
  let u = s(v, 300);
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  try { const x = new URL(u); if (!/\./.test(x.hostname)) return null; return { url: x.href, dominio: x.hostname.replace(/^www\./, '') }; } catch { return null; }
}

// The 6th billboard is free for NGOs (JP, 2026-11-13): they sign up here, the site's owner approves them in the panel,
// and the approved ones take turns (one at random on each visit). KV: ong:<id> each sign-up · ongs the approved pool.
async function ong(req, env) {
  const b = await body(req);
  await limitar(env, req, 5, 'ong');
  const e = enlace(b.url);
  if (!s(b.nombre) || !e) throw new HttpError(400, 'datos', 'Faltan el nombre de la ONG y su link.');
  if (!s(b.contacto)) throw new HttpError(400, 'contacto', 'Déjanos un correo o WhatsApp para avisarte.');
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  const o = { id, nombre: s(b.nombre, 80), ...e, que: s(b.que, 300), contacto: s(b.contacto, 120), estado: 'pendiente', t: Date.now() };
  await env.DB.put(`ong:${id}`, JSON.stringify(o));
  return json({ ok: true });
}
async function ongsPool(env) { return (await env.DB.get('ongs', 'json')) || []; }
async function ongDeTurno(env) { const p = await ongsPool(env); return p.length ? p[Math.floor(Math.random() * p.length)] : null; }

// ── Conversations ───────────────────────────────────────────────────────────

const leerConv = async (env, id) => (await env.DB.get(`c:${id}`, 'json'));
async function guardarConv(env, c) {
  c.t1 = Date.now();
  if (c.id.startsWith('demo-')) c.demo = true;      // examples and screen recordings use demo-… ids: tagged "ejemplo", removable
  await env.DB.put(`c:${c.id}`, JSON.stringify(c), {
    metadata: { t1: c.t1, n: c.msgs.length, tel: c.lead?.telefono ? 1 : 0, demo: c.demo ? 1 : 0 },
  });
}
const nuevaConv = (id, origen) => ({ id, t0: Date.now(), t1: Date.now(), origen, msgs: [], lead: {}, temas: [], temperatura: 'curioso', resumen: '', estado: 'nuevo' });

function fechaLarga(d) {
  return d.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
// The next days spelled out: models get "next Saturday" wrong when they have to count.
function proximosDias() {
  const out = [];
  for (let i = 1; i <= 10; i++) out.push(new Date(Date.now() + i * 864e5)
    .toLocaleDateString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long' }));
  return out.join(' · ');
}
const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;

function sistema(d, lista, mirando, otras = []) {
  const st = d.sitio;
  const fichas = lista.slice(0, 40).map((p) => [
    `- id "${p.id}": ${p.titulo}. ${p.comuna}${p.sector ? `, ${p.sector}` : ''}. ${p.cantidad}, ${p.superficie || 'superficie sin dato'}.`,
    `Precio: ${p.precio ? pesos(p.precio) : 'no publicado (lo da el vendedor)'}.${p.credito ? ' Crédito directo.' : ''}`,
    `Vende: ${p.vendedor.nombre} (${p.vendedor.quien || ''}).`,
    p.chips?.length ? `Tiene: ${p.chips.join(', ')}.` : '',
    p.texto ? `En sus palabras: "${p.texto.slice(0, 600)}"` : '',
  ].filter(Boolean).join(' ')).join('\n');
  const fuera = otras.length ? `\nPARCELAS PUBLICADAS EN OTROS SITIOS (las encontramos en internet; su vendedor NO está aquí, no tomes datos para ellas; si a la persona le interesa una, dale el link para que contacte allá):\n${otras.map((x) => `- ${x.titulo}. ${x.comuna ? x.comuna + ', ' : ''}${x.region}. ${x.m2 ? x.m2.toLocaleString('es-CL') + ' m². ' : ''}${x.monto ? (x.moneda === 'UF' ? 'UF ' + x.monto.toLocaleString('es-CL') : pesos(x.monto)) : 'sin precio'}. Link: ${x.url}`).join('\n')}\n` : '';
  const ahora = mirando ? `\nLa persona está mirando la parcela "${mirando.id}" (${mirando.titulo}, vende ${mirando.vendedor.nombre}). Si no dice otra cosa, habla de esa.\n` : '';
  return `Eres Claude y atiendes ${st.dominio}, un lugar en internet donde los dueños publican sus parcelas del sur de Chile y se venden directo, sin corredor. Publicar es gratis y sin comisión. La gente llega aquí buscando parcelas desde ${st.desde}. Atiendes a cualquier hora, para que nadie se quede esperando.

Hablas como alguien del sur de Chile: cercano, claro y breve (2 a 4 frases), tuteando. Sin listas largas, sin emojis. No te presentes de nuevo si ya hay conversación.

LAS PARCELAS PUBLICADAS (solo esto es verdad):
${fichas}
${fuera}${ahora}
REGLAS:
1. Nunca inventes. Si algo no está arriba (un precio no publicado, el pie, las cuotas, distancias en km o minutos, la ubicación exacta, si se puede subdividir, papeles, si se puede construir algo en particular), dilo sin rodeos: "eso te lo dice <nombre del vendedor>", y ofrece que el vendedor le escriba o agendar una visita.
2. Cada parcela tiene su vendedor: los datos de la persona le llegan a ESE vendedor. Cuando sepas qué parcela le interesa, nómbralo.
3. Tu trabajo: entender qué busca (para qué: vivir, turismo, inversión, mini campo; tamaño; zona; para cuándo; si le sirve el crédito directo), mostrarle las que calzan y, cuando muestre interés, tomar sus datos: nombre y WhatsApp, y si quiere ir a ver, el día y la hora que le acomodan. Un dato a la vez, sin interrogatorio; nunca en tu primer mensaje.
4. Si no hay ninguna que calce, dilo, y ofrece avisarle cuando se publique una (pide nombre y WhatsApp, y anota qué busca).
5. Cuando tengas nombre y WhatsApp, dile que el vendedor le escribe (y si eligió día, que le confirma la visita).
6. Si alguien quiere vender su parcela: publicar es gratis y sin comisión, en el botón "Publicar gratis". Si una empresa quiere aparecer frente a la gente que busca parcelas: "Auspicia aquí", en la página.
7. Hoy es ${fechaLarga(new Date())}. Los próximos días son: ${proximosDias()}. Usa esas fechas tal cual ("el sábado" = el primer sábado de esa lista). Anota la visita con lo que dijo la persona ("sábado 14 de noviembre, en la mañana"); no inventes horarios ni digas qué horas tiene libres el vendedor: él confirma.
8. Si preguntan quién eres: Claude, una IA que atiende ${st.dominio}; los precios y las decisiones son de cada vendedor.

Responde con el JSON pedido:
- respuesta: lo que le dices a la persona.
- lead: lo que sabes de la persona en TODA la conversación ("" si no lo sabes). parcela: el id de la parcela que le interesa, o "". busca: para qué y qué quiere, en pocas palabras. visita: día y hora si los dio. credito: "sí", "no" o "".
- temas: de qué preguntó en su ÚLTIMO mensaje.
- temperatura: "caliente" (quiere ir a ver, o pidió el precio y dejó su WhatsApp), "tibio" (preguntas concretas sobre una parcela) o "curioso" (mirando).
- resumen: una línea para el vendedor sobre esta persona (qué busca y qué falta), como se lo diría un colega.`;
}

// What Claude returns each turn: the answer + what it knows about the person (strict JSON, enforced by OpenRouter).
function salida(ids) {
  const TXT = { type: 'string' };
  return {
    type: 'object', additionalProperties: false,
    required: ['respuesta', 'lead', 'temas', 'temperatura', 'resumen'],
    properties: {
      respuesta: TXT,
      lead: { type: 'object', additionalProperties: false, required: ['nombre', 'telefono', 'parcela', 'busca', 'visita', 'credito'],
        properties: { nombre: TXT, telefono: TXT, parcela: { type: 'string', enum: [...ids, ''] }, busca: TXT, visita: TXT, credito: TXT } },
      temas: { type: 'array', items: { type: 'string', enum: TEMAS } },
      temperatura: { type: 'string', enum: ['caliente', 'tibio', 'curioso'] },
      resumen: TXT,
    },
  };
}

async function claude(env, system, msgs, schema) {
  for (const model of MODELOS) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json',
          'http-referer': 'https://parcelasyterrenos.jpfraneto.com', 'x-title': 'Parcelas y Terrenos · El Taller' },
        body: JSON.stringify({ model, max_tokens: 1500, reasoning: { effort: 'low' },
          response_format: { type: 'json_schema', json_schema: { name: 'respuesta', strict: true, schema } },
          messages: [{ role: 'system', content: system }, ...msgs] }),
      });
      const j = await r.json().catch(() => null);
      const txt = String(j?.choices?.[0]?.message?.content || '');
      if (!r.ok || !txt) throw new Error(`openrouter ${model} ${r.status} ${JSON.stringify(j?.error || '').slice(0, 160)}`);
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) return { respuesta: txt.trim() };
      try { return JSON.parse(m[0]); } catch { return { respuesta: txt.replace(/\{[\s\S]*\}/, '').trim() || txt.trim() }; }
    } catch (e) { console.log(String(e)); }
  }
  throw new HttpError(502, 'ia', 'Se me cortó la conexión. Prueba de nuevo.');
}

function mezclarLead(c, nuevo, lista) {
  const l = c.lead || {};
  for (const k of ['nombre', 'busca', 'visita', 'credito']) if (s(nuevo?.[k])) l[k] = s(nuevo[k], 160);
  const p = lista.find((x) => x.id === nuevo?.parcela);
  if (p) { l.parcela = p.id; l.parcela_titulo = p.titulo; l.vendedor = p.vendedor.nombre; }
  const tel = telefono(nuevo?.telefono);
  if (tel) l.telefono = tel;
  if (l.telefono && l.nombre && !c.t_lead) c.t_lead = Date.now();
  c.lead = l;
}

async function chat(req, env) {
  const b = await body(req);
  const id = String(b.id || '');
  if (!/^[a-z0-9-]{8,40}$/.test(id)) throw new HttpError(400, 'id');
  const msg = s(b.msg, 600);
  if (!msg) throw new HttpError(400, 'vacio');
  await limitar(env, req, Number(env.LIMITE_DIARIO || 80), 'chat');
  const c = (await leerConv(env, id)) || nuevaConv(id, 'chat');
  if (c.msgs.length >= 60) throw new HttpError(429, 'larga', 'Esta conversación ya está larga: sigue por WhatsApp con el vendedor.');
  c.msgs.push({ r: 'user', c: msg, t: Date.now() });
  const telEnMsg = telefono((msg.match(/\+?\d[\d\s.-]{7,14}\d/) || [''])[0]);   // the model sometimes forgets to copy it
  const [d, lista, ix] = await Promise.all([datos(env, req), parcelas(env, req), todo(env)]);
  const mirando = lista.find((p) => p.id === b.parcela) || null;
  const otras = parecidas(ix.items, c.msgs.filter((m) => m.r === 'user').map((m) => m.c).join(' '));
  const out = await claude(env, sistema(d, lista, mirando, otras),
    c.msgs.filter((m) => m.r !== 'evento').slice(-24).map((m) => ({ role: m.r, content: m.c })), salida(lista.map((p) => p.id)));
  const respuesta = s(out.respuesta, 1200) || 'Perdón, no te entendí. ¿Me lo dices de nuevo?';
  c.msgs.push({ r: 'assistant', c: respuesta, t: Date.now() });
  mezclarLead(c, { ...out.lead, parcela: out.lead?.parcela || (mirando && !c.lead?.parcela ? mirando.id : ''),
    telefono: telefono(out.lead?.telefono) || telEnMsg }, lista);
  const temas = (Array.isArray(out.temas) ? out.temas : []).filter((t) => TEMAS.includes(t));
  c.temas = [...new Set([...(c.temas || []), ...temas])];
  if (['caliente', 'tibio', 'curioso'].includes(out.temperatura)) {
    const orden = { curioso: 0, tibio: 1, caliente: 2 };            // a lead never cools down on its own
    if (orden[out.temperatura] >= orden[c.temperatura || 'curioso']) c.temperatura = out.temperatura;
  }
  if (s(out.resumen)) c.resumen = s(out.resumen, 240);
  await guardarConv(env, c);
  return json({ respuesta, listo: Boolean(c.lead.nombre && c.lead.telefono), vendedor: c.lead.vendedor || '' });
}

async function visita(req, env) {
  const b = await body(req);
  await limitar(env, req, 20, 'form');
  const tel = telefono(b.telefono);
  if (!s(b.nombre)) throw new HttpError(400, 'nombre', 'Falta tu nombre.');
  if (!tel) throw new HttpError(400, 'telefono', 'Revisa tu WhatsApp (ej: 9 1234 5678).');
  if (!s(b.dia) || !s(b.hora)) throw new HttpError(400, 'dia', 'Elige un día y una hora.');
  const lista = await parcelas(env, req);
  const p = lista.find((x) => x.id === b.parcela);
  if (!p) throw new HttpError(400, 'parcela', 'Elige una parcela.');
  const id = /^[a-z0-9-]{8,40}$/.test(String(b.id || '')) ? b.id : crypto.randomUUID();
  const c = (await leerConv(env, id)) || nuevaConv(id, 'visita');
  mezclarLead(c, { nombre: b.nombre, telefono: tel, parcela: p.id, visita: `${s(b.dia, 60)}, ${s(b.hora, 10)}` }, lista);
  c.temas = [...new Set([...(c.temas || []), 'visita'])];
  c.temperatura = 'caliente';
  c.visita = { parcela: p.id, dia: s(b.dia, 60), fecha: s(b.fecha, 10), hora: s(b.hora, 10) };
  if (!c.resumen) c.resumen = 'Agendó una visita desde la página.';
  c.msgs.push({ r: 'evento', c: `Agendó visita: ${c.lead.visita}`, t: Date.now() });
  await guardarConv(env, c);
  return json({ ok: true, vendedor: p.vendedor.nombre });
}

// ── The site owner's panel ──────────────────────────────────────────────────

function panelOk(req, env) {
  const k = req.headers.get('x-clave');
  if (!env.PANEL_KEY || k !== env.PANEL_KEY) throw new HttpError(401, 'clave', 'Clave incorrecta.');
}

async function borrarDemo(env) {
  for (const k of await listarTodo(env, 'c:')) if (k.metadata?.demo) await env.DB.delete(k.name);
  for (const k of await listarTodo(env, 'a:')) if (k.name.endsWith('-demo')) await env.DB.delete(k.name);
  for (const k of await listarTodo(env, 'p:')) {
    const p = await env.DB.get(k.name, 'json');
    if (!p?.demo && !p?.override) continue;
    await env.DB.delete(k.name);
    for (const f of await listarTodo(env, `f:${p.id}-`)) await env.DB.delete(f.name);
  }
}

async function panel(req, env, path) {
  panelOk(req, env);
  if (path === '/api/panel' && req.method === 'GET') {
    const keys = (await listarTodo(env, 'c:')).filter((k) => (k.metadata?.n || 0) > 0)
      .sort((a, b) => (b.metadata?.t1 || 0) - (a.metadata?.t1 || 0)).slice(0, 150);
    const convs = (await Promise.all(keys.map((k) => env.DB.get(k.name, 'json')))).filter(Boolean);
    const ak = (await listarTodo(env, 'a:')).sort((a, b) => (a.name < b.name ? 1 : -1)).slice(0, 50);
    const auspicios = await Promise.all(ak.map(async (k) => ({ key: k.name, ...(await env.DB.get(k.name, 'json')) })));
    const [d, lista] = await Promise.all([datos(env, req), parcelas(env, req, { todas: true })]);
    const ix = await todo(env);
    const qk = (await listarTodo(env, 'q:')).sort((a, b) => (a.name < b.name ? 1 : -1)).slice(0, 30);
    const quitados = await Promise.all(qk.map((k) => env.DB.get(k.name, 'json')));
    const corredoras = (await listarCorredoras(env, { todas: true })).map(({ clave, ...c }) => ({ ...c, con_clave: Boolean(clave) }));
    const mes = hoyCL().slice(0, 7);
    const ck = await listarTodo(env, `clic:${mes}:`);
    const clics = Object.fromEntries(await Promise.all(ck.map(async (k) => [k.name.split(':')[2], Number(await env.DB.get(k.name)) || 0])));
    const compras = await comprasDelMes(env);
    const ok = (await listarTodo(env, 'ong:')).sort((a, b) => (a.name < b.name ? 1 : -1)).slice(0, 100);
    const ongs = (await Promise.all(ok.map((k) => env.DB.get(k.name, 'json')))).filter(Boolean);
    return json({ ongs, convs, parcelas: lista, auspicios, estados: ESTADOS, hoy: hoyCL(), sitio: d.sitio, corredoras, clics, compras,
      carteles: await cartelesActivos(env), pagos: Boolean(env.MP_ACCESS_TOKEN),
      indice: { total: ix.items.length, fuentes: ix.fuentes, regiones: porRegion(ix.items), uf: ix.uf, quitados } });
  }
  let m = path.match(/^\/api\/panel\/c\/([a-z0-9-]{8,40})$/);
  if (m && req.method === 'POST') {
    const b = await body(req);
    const c = await leerConv(env, m[1]);
    if (!c) throw new HttpError(404, 'no');
    if (ESTADOS.includes(b.estado)) c.estado = b.estado;
    await guardarConv(env, c);
    return json({ ok: true });
  }
  // A billboard's image off (the face goes back to the one drawn from its link): the site's owner decides what stands there.
  m = path.match(/^\/api\/panel\/cartel\/(\d{1,2})$/);
  if (m && req.method === 'POST') {
    const c = (await env.DB.get('carteles', 'json')) || {};
    if (!c[m[1]]) throw new HttpError(404, 'no');
    c[m[1]].img = '';
    await env.DB.put('carteles', JSON.stringify(c));
    return json({ ok: true });
  }
  m = path.match(/^\/api\/panel\/ong\/([a-z0-9-]{8,40})$/);
  if (m && req.method === 'POST') {
    const b = await body(req);
    const o = await env.DB.get(`ong:${m[1]}`, 'json');
    if (!o) throw new HttpError(404, 'no');
    if (['aprobada', 'rechazada', 'pendiente'].includes(b.estado)) o.estado = b.estado;
    await env.DB.put(`ong:${o.id}`, JSON.stringify(o));
    const pool = (await ongsPool(env)).filter((x) => x.id !== o.id);
    if (o.estado === 'aprobada') pool.push({ id: o.id, nombre: o.nombre, url: o.url, dominio: o.dominio });
    await env.DB.put('ongs', JSON.stringify(pool));
    return json({ ok: true });
  }
  m = path.match(/^\/api\/panel\/p\/([a-z0-9-]{3,60})$/);
  if (m && req.method === 'POST') {
    const b = await body(req);
    const p = (await parcelas(env, req, { todas: true })).find((x) => x.id === m[1]);
    if (!p) throw new HttpError(404, 'no');
    if (p.fija) return json({ ok: true });         // Sebastián's own come from parcelas.json
    if (['publicada', 'pendiente', 'rechazada'].includes(b.estado)) p.estado = b.estado;
    await env.DB.put(`p:${p.id}`, JSON.stringify(p));
    return json({ ok: true });
  }
  if (path === '/api/panel/indice/subir' && req.method === 'POST') {
    const b = await body(req);
    return json({ ok: true, n: await subir(env, String(b.fuente || ''), b.items) });
  }
  m = path.match(/^\/api\/panel\/co\/([a-z0-9-]{2,60})$/);
  if (m && req.method === 'POST') {
    const b = await body(req);
    const c = (await env.DB.get(`co:${m[1]}`, 'json')) || (await listarCorredoras(env, { todas: true })).find((x) => x.id === m[1]);
    if (!c) throw new HttpError(404, 'no');
    if (b.borrar && c.estado === 'indexada') {          // one we index from its web: stop reading it
      const q = new Set((await env.DB.get('co-quitadas', 'json')) || []); q.add(c.id);
      await env.DB.put('co-quitadas', JSON.stringify([...q])); await env.DB.delete(`ix:co-${c.id}`);
      olvidar();
      return json({ ok: true });
    }
    if (b.borrar) {
      await env.DB.delete(`co:${c.id}`); await env.DB.delete(`ix:co-${c.id}`);
      olvidar();
      return json({ ok: true });
    }
    if (['pendiente', 'verificada', 'indexada'].includes(b.estado)) c.estado = b.estado;
    await env.DB.put(`co:${c.id}`, JSON.stringify(c));
    olvidar();
    // Approved: its parcels go on the map right now, not tomorrow at 06:00.
    const r = c.estado !== 'pendiente' ? await actualizar(env, `co-${c.id}`) : {};
    return json({ ok: true, resultado: r });
  }
  if (path === '/api/panel/indice' && req.method === 'POST') {
    const b = await body(req);
    return json({ ok: true, resultado: await actualizar(env, b.fuente) });
  }
  if (path === '/api/panel/demo' && req.method === 'POST') {
    const b = await body(req);
    await borrarDemo(env);
    if (b.accion === 'sembrar') {
      // Example conversations and a sponsor request for the panel (tagged "ejemplo"). No invented listings: the
      // listings are Sebastián's and the real ones from the index.
      const { DEMO, AUSPICIO_DEMO } = await import('./demo.js');
      for (const c of DEMO()) await guardarConv(env, c);
      await env.DB.put(`a:${Date.now() - 7 * 3600e3}-demo`, JSON.stringify(AUSPICIO_DEMO()));
    }
    return json({ ok: true });
  }
  throw new HttpError(404, 'no');
}

// ── The listing: own parcels + the index, filtered and paged on the server ─────

async function listado(req, env, url) {
  const q = Object.fromEntries(url.searchParams);
  const pagina = Math.max(1, Number(q.pagina) || 1);
  const POR = 24;
  const [d, lista, ix] = await Promise.all([datos(env, req), parcelas(env, req), todo(env)]);
  // Own listings go through the same filter as the index (same fields), and always come first.
  const propias = lista.filter((p) => filtrar([{ ...p, clp: p.precio || 0 }], { ...q, orden: '' }).length);
  if (q.k) return json({ item: ix.items.find((x) => x.k === q.k) || null });
  // The map wants everything at once (a few hundred bytes each), filtered in the browser.
  if (q.mapa) {
    const carteles = await cartelesActivos(env);
    return json({ parcelas: lista.map(publica), indexadas: ix.items,
      fuentes: ix.fuentes, sitio: d.sitio, lista_regiones: REGIONES, uf: ix.uf, pagos: Boolean(env.MP_ACCESS_TOKEN),
      carteles: ordenarCarteles(carteles, d.sitio.cupos_auspicio, await ongDeTurno(env)) });
  }
  const otras = filtrar(ix.items, q);
  return json({
    parcelas: pagina === 1 ? propias.map(publica) : [],
    indexadas: otras.slice((pagina - 1) * POR, pagina * POR).map(({ clp, ...x }) => x),
    total: otras.length, pagina, por_pagina: POR,
    total_indice: ix.items.length, regiones: porRegion(ix.items), lista_regiones: REGIONES,
    fuentes: ix.fuentes, sitio: d.sitio,
  });
}

// "Remove this listing": done at once (no questions), and logged for the owner.
async function quitar(req, env) {
  const b = await body(req);
  await limitar(env, req, 20, 'quitar');
  const ix = await todo(env);
  const x = ix.items.find((i) => i.k === b.k || (b.url && i.url === s(b.url, 500)));
  if (!x) throw new HttpError(404, 'no', 'No encontré esa publicación. Escríbenos y la quitamos.');
  const lista = (await env.DB.get('ix-borrados', 'json')) || [];
  if (!lista.includes(x.k)) lista.push(x.k);
  await env.DB.put('ix-borrados', JSON.stringify(lista));
  await env.DB.put(`q:${Date.now()}`, JSON.stringify({ k: x.k, url: x.url, titulo: x.titulo, motivo: s(b.motivo, 300), t: Date.now() }));
  ix.items = ix.items.filter((i) => i.k !== x.k);
  return json({ ok: true });
}

// ── Corredoras ──────────────────────────────────────────────────────────────

const TIPOS = ['feed', 'easybroker', 'tokko', 'ayuda'];

// "Paste your feed": read it now and show what we found, before they even sign up.
async function probarFeed(req, env) {
  const b = await body(req);
  await limitar(env, req, 30, 'probar');
  const url = s(b.feed, 500);
  if (!/^https?:\/\//.test(url)) throw new HttpError(400, 'feed', 'Pega el link completo del feed (https://…).');
  let items;
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'ParcelasYTerrenosBot/1.0 (+https://parcelasyterrenos.cl/corredoras/)' } });
    if (!r.ok) throw new Error(String(r.status));
    items = leerFeedXML((await r.text()).slice(0, 8_000_000));
  } catch (e) { throw new HttpError(400, 'feed', `No pude leer ese link (${String(e.message).slice(0, 40)}).`); }
  return json({ n: items.length, ejemplos: items.slice(0, 3).map((x) => ({ titulo: x.titulo, comuna: x.comuna, m2: x.m2, precio: x.precio, moneda: x.moneda })) });
}

async function sumarCorredora(req, env) {
  const b = await body(req);
  await limitar(env, req, 6, 'corredora');
  const nombre = s(b.nombre, 80);
  const tel = telefono(b.whatsapp);
  if (!nombre) throw new HttpError(400, 'nombre', 'Falta el nombre de la corredora.');
  if (!tel) throw new HttpError(400, 'telefono', 'Revisa el WhatsApp (ej: 9 1234 5678).');
  if (b.autoriza !== true) throw new HttpError(400, 'autoriza', 'Necesitamos tu autorización para mostrar tus parcelas.');
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'ayuda';
  const web = /^https?:\/\//.test(String(b.web || '')) ? s(b.web, 200).replace(/\/$/, '') : '';
  let id = slug(nombre).slice(0, 40);
  if (await env.DB.get(`co:${id}`)) id = `${id}-${crypto.randomUUID().slice(0, 4)}`;
  const c = { id, nombre, web, logo: web ? `${new URL(web).origin}/favicon.ico` : '', comuna: s(b.comuna, 60), whatsapp: tel,
    tipo, feed: tipo === 'feed' ? s(b.feed, 500) : '', clave: ['easybroker', 'tokko'].includes(tipo) ? s(b.clave, 200) : '',
    estado: 'pendiente', autorizo: { t: Date.now(), texto: 'Autorizo a parcelasyterrenos.cl a mostrar el título, la ubicación, la superficie, el precio y el link de mis publicaciones, y mi logo.' },
    que: 'Corredora que publica aquí sus parcelas.', t: Date.now() };
  // Automatic: a feed or API that returns parcels → verified and on the map now. "Ayúdenme" waits for a WhatsApp.
  let n = 0;
  if (tipo !== 'ayuda') {
    try {
      const items = await ubicar(env, (await leerCorredora(c, env)).map((x) => item(`co-${id}`, x)).filter((x) => x.url && x.titulo), 40);
      n = items.length;
      if (n) { c.estado = 'verificada'; await env.DB.put(`ix:co-${id}`, JSON.stringify({ t: Date.now(), items, error: '' })); }
    } catch (e) { c.error = String(e.message || e).slice(0, 120); }
  }
  await env.DB.put(`co:${id}`, JSON.stringify(c));
  olvidar();
  return json({ ok: true, id, n, verificada: c.estado === 'verificada' });
}

// "Auspicia aquí" → straight to Mercado Pago (pagos.js switches the billboard on when it's paid).
async function comprar(req, env, url) {
  const b = await body(req);
  await limitar(env, req, 20, 'pagar');
  const d = await datos(env, req);
  const precios = { auspicio: d.sitio.precio_auspicio };
  if (b.tipo === 'auspicio') {
    if (!d.sitio.venta_carteles) throw new HttpError(403, 'pronto', 'Los letreros se abren pronto. Escríbenos por WhatsApp y te avisamos primero.');
    // A billboard is a link, and that's all (JP, 2026-11-13): the map shows its domain.
    const e = enlace(b.url);
    if (!e) throw new HttpError(400, 'url', 'Pega el link de tu página (ej: casasdelsur.cl).');
    const cartel = cupoPara(await cartelesActivos(env), d.sitio.cupos_auspicio, e.dominio);
    if (cartel < 0) throw new HttpError(409, 'ocupado', `Los ${d.sitio.cupos_auspicio} cupos están tomados este mes. Escríbenos y te avisamos cuando se libere uno.`);
    // Their billboard's image (optional, already cut to 3:1 on the phone). Without one, the map draws it from the link.
    let img = '';
    if (b.imagen) {
      const f = foto(b.imagen), k = `cartel-${crypto.randomUUID().slice(0, 13)}`;
      await env.DB.put(`f:${k}`, f.bin, { metadata: { tipo: f.tipo } });
      img = `/f/${k}`;
    }
    return json(await pagar(env, url.origin, { tipo: 'auspicio', cartel, empresa: e.dominio, url: e.url, texto: '', img }, precios));
  }
  throw new HttpError(400, 'tipo');
}

// "Ver en <corredora> ↗": counted per source and month, so each corredora can see what the map sends them.
async function clic(req, env) {
  const b = await body(req).catch(() => ({}));
  const f = String(b.f || '').slice(0, 64);
  if (!/^[a-z0-9-]{2,64}$/.test(f)) return json({ ok: false });
  const k = `clic:${hoyCL().slice(0, 7)}:${f}`;
  await env.DB.put(k, String((Number(await env.DB.get(k)) || 0) + 1), { expirationTtl: 60 * 60 * 24 * 400 });
  return json({ ok: true });
}

// ── Pages ───────────────────────────────────────────────────────────────────

async function pagina(req, env, vista, titulo, descripcion) {
  const r = await env.ASSETS.fetch(new Request(new URL('/index.html', req.url)));
  let rw = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(titulo); } })
    .on('body', { element(e) { e.setAttribute('data-vista', vista); } });
  if (descripcion) rw = rw.on('meta[name=description]', { element(e) { e.setAttribute('content', descripcion); } });
  return rw.transform(new Response(r.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } }));
}

// Google indexes only his own address, www.parcelasyterrenos.cl (the canonical one since 2012); any other host
// (the prototype on jpfraneto.com) is noindex, so it never competes with his domain. Moving = adding the route.
const indexable = (req, env) => Boolean(env.DOMINIO) && new URL(req.url).hostname === `www.${env.DOMINIO}`;
function noIndex(res, env, req) {
  if (indexable(req, env)) return res;
  const h = new Headers(res.headers);
  h.set('x-robots-tag', 'noindex, nofollow');
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  // Every day at 06:00 Chile: read the sources again (wrangler.jsonc → triggers.crons).
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(actualizar(env).then((r) => console.log('indice', JSON.stringify(r))));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    // His domain without www → www, as Webnode did for 14 years (the address Google knows).
    if (env.DOMINIO && url.hostname === env.DOMINIO) return Response.redirect(`https://www.${env.DOMINIO}${p}${url.search}`, 301);
    try {
      if (p.startsWith('/api/')) {
        if (p === '/api/parcelas' && req.method === 'GET') return await listado(req, env, url);
        if (p === '/api/quitar' && req.method === 'POST') return await quitar(req, env);
        if (p === '/api/corredoras' && req.method === 'POST') return await sumarCorredora(req, env);
        if (p === '/api/corredoras/probar' && req.method === 'POST') return await probarFeed(req, env);
        if (p === '/api/clic' && req.method === 'POST') return await clic(req, env);
        if (p === '/api/pagar' && req.method === 'POST') return await comprar(req, env, url);
        if (p === '/api/chat' && req.method === 'POST') return await chat(req, env);
        if (p === '/api/visita' && req.method === 'POST') return await visita(req, env);
        if (p === '/api/publicar' && req.method === 'POST') return await publicar(req, env);
        if (p === '/api/auspicio' && req.method === 'POST') return await auspicio(req, env);
        if (p === '/api/ong' && req.method === 'POST') return await ong(req, env);
        if (p.startsWith('/api/panel')) return await panel(req, env, p);
        throw new HttpError(404, 'no');
      }
      if (p === '/ongs' || p === '/ongs/') return Response.redirect(new URL('/#ong', url), 302);
      if (p === '/mp/webhook' && req.method === 'POST') return await webhook(req, env, url);
      if (p === '/mp/vuelta') return await vuelta(env, url);
      const fm = p.match(/^\/f\/([a-z0-9-]{3,70})$/);
      if (fm) {
        const { value, metadata } = await env.DB.getWithMetadata(`f:${fm[1]}`, 'arrayBuffer');
        if (!value) return new Response('no', { status: 404 });
        return new Response(value, { headers: { 'content-type': metadata?.tipo || 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
      }
      const pm = p.match(/^\/parcela\/([a-z0-9-]{3,60})\/?$/);
      if (pm && req.method === 'GET') {
        const x = (await parcelas(env, req)).find((q) => q.id === pm[1]);
        if (!x) return Response.redirect(new URL('/parcelas/', url), 302);
        const desc = `${x.titulo} · ${x.superficie} · ${x.comuna}${x.sector ? `, ${x.sector}` : ''}. Directo con ${x.vendedor.nombre}, sin comisión.`;
        return noIndex(await pagina(req, env, 'parcela', `${x.titulo} · ${x.comuna} :: PARCELAS Y TERRENOS`, desc), env, req);
      }
      const conBarra = p.endsWith('/') ? p : p + '/';
      if (req.method === 'GET' && PAGINAS[conBarra]) {
        if (p !== conBarra) return Response.redirect(new URL(conBarra + url.search, url), 301);
        return noIndex(await pagina(req, env, ...PAGINAS[p]), env, req);
      }
      if (p === '/robots.txt' && !indexable(req, env)) return new Response('User-agent: *\nDisallow: /\n');
      return noIndex(await env.ASSETS.fetch(req), env, req);
    } catch (e) {
      if (e instanceof HttpError || e instanceof PagoError) return json({ error: e.code, mensaje: e.message }, e.status);
      console.log('error', e?.stack || e);
      return json({ error: 'interno', mensaje: 'Algo falló. Prueba de nuevo.' }, 500);
    }
  },
};
