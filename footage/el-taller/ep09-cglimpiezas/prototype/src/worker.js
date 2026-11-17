// CG Limpiezas · prototipo El Taller Ep. 09 (cglimpiezas.jpfraneto.com)
//   /            su Instagram, rediseñado (la propuesta): static, public/index.html
//   /cotiza/     "mándanos la foto y te decimos el precio al tiro": static, public/cotiza/
//   /c/?id=…     one quote: the client sees it and pays; CG (with its key) sets the price · /tutorial/: CG on its own
//   POST /api/mirar   a photo → what it is (rug, sofa, mattress…), how big, what state (OpenRouter vision; Workers AI
//                     if that fails). The price is computed in the page from public/js/precios.js.

const TIPOS = ['alfombra_muro', 'alfombra_deco', 'sillon', 'seccional', 'poltrona', 'silla', 'colchon', 'coche', 'otro'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['es_limpiable', 'tipo', 'cantidad', 'm2', 'plazas', 'manchas', 'mascotas', 'veo', 'pregunta', 'confianza'],
  properties: {
    es_limpiable: { type: 'boolean' },
    tipo: { type: 'string', enum: TIPOS },
    cantidad: { type: 'integer' },
    m2: { type: 'number' },
    plazas: { type: 'string', enum: ['1', '1.5', '2', 'king', ''] },
    manchas: { type: 'boolean' },
    mascotas: { type: 'boolean' },
    veo: { type: 'string' },
    pregunta: { type: 'string' },
    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
  },
};

const PROMPT = `Eres de CG Limpiezas, una familia que lava alfombras, sillones, colchones y tapices en Santiago hace más de 35 años (inyección-extracción). Un cliente te mandó esta foto para saber cuánto le cobrarían. Mírala como alguien con oficio y responde SOLO el JSON.

- es_limpiable: true si en la foto hay algo que CG limpia (alfombra, sillón, colchón, silla tapizada, poltrona, coche de bebé). false si no (una persona, un auto, un plato…).
- tipo: alfombra_muro (alfombra pegada al piso de pared a pared), alfombra_deco (alfombra suelta / de living / de pasillo), sillon (sofá de 1 a 3 cuerpos), seccional (sofá en L, modular, 4+ cuerpos), poltrona (butaca, sitial, silla mariposa, puf), silla (sillas de comedor tapizadas), colchon, coche (coche de bebé o silla de auto), otro.
- cantidad: sillon → el NÚMERO DE CUERPOS (asientos) de ese sillón, 1, 2 o 3 (no cuántos sillones: un sillón de dos cuerpos es 2); tiene que calzar con lo que dices en "veo". silla → cuántas sillas se ven; poltrona/coche/seccional → cuántas piezas; alfombras y colchón → 1.
- m2: solo alfombras: los metros cuadrados que estimas por lo que se ve (una pieza normal de departamento: 9 a 14 m²; un living: 15 a 25; una alfombra de living suelta: 2 a 6). Si no es alfombra, 0.
- plazas: solo colchón: "1", "1.5", "2" o "king". Si no es colchón, "".
- manchas: true si se ven manchas. mascotas: true si se ven pelos, huellas o manchas que parecen de mascota (orina).
- veo: UNA frase corta, en chileno, de tú, con oficio, de lo que ves ("Un sillón de tres cuerpos gris, con manchas en los cojines: eso sale."). Sin precios.
- pregunta: la UNA cosa que preguntarías para afinar el precio ("¿Cuánto mide la pieza?", "¿Las manchas son de pipí de perro?"). Si no hace falta, "".
- confianza: alta, media o baja según qué tan claro se ve.`;

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
  const n = Number(await env.COTIZA.get(key)) || 0;
  if (n >= Number(env.LIMITE_DIARIO || 30)) throw new HttpError(429, 'limite', 'Ya cotizaste muchas fotos hoy. Escríbenos por WhatsApp.');
  await env.COTIZA.put(key, String(n + 1), { expirationTtl: 60 * 60 * 26 });
}

// Same reader as Ep. 06 (picked on 2026-11-09 from 5 cheap vision models): ~2.5 s, ~US$0.0002 per photo.
const OPENROUTER_MODELS = ['google/gemini-2.5-flash-lite', 'google/gemini-3.1-flash-lite'];

async function mirarConOpenRouter(env, img) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'http-referer': 'https://cglimpiezas.jpfraneto.com',
      'x-title': 'CG Limpiezas · El Taller',
    },
    body: JSON.stringify({
      models: env.OPENROUTER_MODEL ? [env.OPENROUTER_MODEL] : OPENROUTER_MODELS,
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: 'json_schema', json_schema: { name: 'mirada', strict: true, schema: SCHEMA } },
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } },
        { type: 'text', text: PROMPT },
      ] }],
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.choices?.[0]) throw new Error(`openrouter ${r.status} ${JSON.stringify(j?.error || j).slice(0, 200)}`);
  const m = String(j.choices[0].message?.content || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('openrouter: no json');
  return { mirada: JSON.parse(m[0]), modelo: j.model };
}

async function mirarConWorkersAI(env, img) {
  const out = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } },
      { type: 'text', text: PROMPT + '\n\nResponde solo el objeto JSON, sin texto antes ni después.' },
    ] }],
    max_tokens: 600,
  });
  const text = typeof out?.response === 'string' ? out.response : JSON.stringify(out?.response || '');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new HttpError(502, 'no_vi', 'No pude ver bien la foto. Prueba con otra.');
  return { mirada: JSON.parse(m[0]), modelo: 'workers-ai' };
}

function limpiar(a) {
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
  return {
    es_limpiable: Boolean(a.es_limpiable),
    tipo: TIPOS.includes(a.tipo) ? a.tipo : 'otro',
    cantidad: Math.round(num(a.cantidad, 1, 20)),
    m2: Math.round(num(a.m2, 0, 300)),
    plazas: ['1', '1.5', '2', 'king'].includes(String(a.plazas)) ? String(a.plazas) : '',
    manchas: Boolean(a.manchas),
    mascotas: Boolean(a.mascotas),
    veo: s(a.veo, 200),
    pregunta: s(a.pregunta, 120),
    confianza: ['alta', 'media', 'baja'].includes(a.confianza) ? a.confianza : 'media',
  };
}

async function mirar(req, env) {
  const b = await body(req);
  const img = dataUrl(b.image, 2_400_000);
  await limitar(env, req);
  const t = Date.now();
  let r;
  if (env.OPENROUTER_API_KEY) {
    try { r = await mirarConOpenRouter(env, img); } catch (e) { console.error(e.message); }
  }
  if (!r) r = await mirarConWorkersAI(env, img);
  return json({ mirada: limpiar(r.mirada), motor: r.modelo, ms: Date.now() - t });
}

// ── Sus casos: CG puts a price on each of its public jobs (/tus-casos/?k=…) ──────────────────────────────────
// Stored as one KV value ("casos"). Public read: only the cases CG marked "mostrar", with type, size and price.

function claveOk(req, env) {
  const k = req.headers.get('x-clave') || new URL(req.url).searchParams.get('k');
  if (!env.CG_CLAVE || k !== env.CG_CLAVE) throw new HttpError(401, 'clave', 'Este link no es válido.');
}

function limpiarCaso(c) {
  const precio = Math.round(Number(String(c.precio ?? '').replace(/\D/g, '')) || 0);
  return {
    id: String(c.id || '').slice(0, 20),
    tipo: TIPOS.includes(c.tipo) ? c.tipo : 'otro',
    cantidad: String(c.cantidad ?? '').slice(0, 6),
    precio: precio > 0 && precio < 5_000_000 ? precio : null,
    mostrar: c.mostrar !== false,
    nota: String(c.nota || '').trim().slice(0, 200),
  };
}

async function casos(req, env, p) {
  if (p === '/api/casos' && req.method === 'GET') {
    const todos = (await env.COTIZA.get('casos', 'json')) || [];
    return json({
      casos: todos.filter((c) => c.mostrar).map(({ id, tipo, cantidad, precio }) => ({ id, tipo, cantidad, precio })),
      ocultos: todos.filter((c) => !c.mostrar).map((c) => c.id),
    });
  }
  claveOk(req, env);
  if (p === '/api/casos/todo' && req.method === 'GET') return json({ casos: (await env.COTIZA.get('casos', 'json')) || [] });
  if (p === '/api/casos' && req.method === 'POST') {
    const b = await body(req);
    const lista = (Array.isArray(b.casos) ? b.casos : []).slice(0, 200).map(limpiarCaso).filter((c) => c.id);
    await env.COTIZA.put('casos', JSON.stringify(lista));
    return json({ ok: true, con_precio: lista.filter((c) => c.precio).length });
  }
  throw new HttpError(404, 'no_existe');
}

// ── Cotizaciones: each quote gets its own link (/c/?id=…). The client sends it by WhatsApp; CG opens it, sets the
// price and confirms; the client pays there with Mercado Pago. KV: q:<id> (the quote), f:<id> (its small photo),
// l:<reverse time>:<id> (the list), m:<order id> → <id> (a Mercado Pago order).

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (n) => ID_CHARS[n % ID_CHARS.length]).join('');
const peso = (v) => { const n = Math.round(Number(String(v ?? '').replace(/\D/g, '')) || 0); return n > 0 && n < 5_000_000 ? n : null; };

function vista(q) {
  const { id, ts, tipo, que, veo, min, max, fuente, precio, nota, estado, pagada_at } = q;
  return { id, ts, tipo, que, veo, min, max, fuente, precio, nota, estado, pagada_at, foto: `/api/cotizaciones/${id}/foto` };
}

async function crearCotizacion(req, env) {
  const b = await body(req);
  const foto = b.foto ? (dataUrl(b.foto, 400_000), b.foto) : '';
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const ts = Date.now();
  const q = {
    id: nuevoId(), ts, tipo: TIPOS.includes(b.tipo) ? b.tipo : 'otro', que: s(b.que, 120), veo: s(b.veo, 200),
    min: peso(b.min), max: peso(b.max), fuente: b.fuente === 'cg' ? 'cg' : 'mercado',
    precio: null, nota: '', estado: 'nueva',
  };
  await Promise.all([
    env.COTIZA.put(`q:${q.id}`, JSON.stringify(q)),
    foto && env.COTIZA.put(`f:${q.id}`, foto),
    env.COTIZA.put(`l:${String(9e15 - ts).padStart(16, '0')}:${q.id}`, ''),
  ]);
  return json({ id: q.id });
}

async function leerCotizacion(env, id) {
  if (!/^[A-Z2-9]{5}$/.test(id)) throw new HttpError(404, 'no_existe', 'Esa cotización no existe.');
  const q = await env.COTIZA.get(`q:${id}`, 'json');
  if (!q) throw new HttpError(404, 'no_existe', 'Esa cotización no existe.');
  return q;
}

async function cotizaciones(req, env, url, p) {
  if (p === '/api/cotizaciones' && req.method === 'POST') return crearCotizacion(req, env);
  if (p === '/api/cotizaciones' && req.method === 'GET') {
    claveOk(req, env);
    const page = await env.COTIZA.list({ prefix: 'l:', limit: 60 });
    const qs = await Promise.all(page.keys.map((k) => env.COTIZA.get(`q:${k.name.split(':')[2]}`, 'json')));
    return json({ cotizaciones: qs.filter(Boolean).map(vista) });
  }
  const m = p.match(/^\/api\/cotizaciones\/([A-Z2-9]{5})(\/foto|\/pagar|\/pago-prueba)?$/);
  if (!m) throw new HttpError(404, 'no_existe');
  const q = await leerCotizacion(env, m[1]);
  if (!m[2] && req.method === 'GET') return json({ cotizacion: vista(q), pago: env.MP_ACCESS_TOKEN ? 'mercadopago' : 'prueba' });
  if (m[2] === '/foto') {
    const v = await env.COTIZA.get(`f:${q.id}`);
    if (!v) throw new HttpError(404, 'sin_foto');
    const [head, b64] = v.split(',');
    return new Response(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      { headers: { 'content-type': head.slice(5, head.indexOf(';')), 'cache-control': 'private, max-age=3600' } });
  }
  if (!m[2] && req.method === 'POST') {  // CG sets the price
    claveOk(req, env);
    if (q.estado === 'pagada') throw new HttpError(400, 'pagada', 'Ya está pagada.');
    const b = await body(req);
    const precio = peso(b.precio);
    if (!precio) throw new HttpError(400, 'precio', 'Escribe el precio.');
    Object.assign(q, { precio, nota: String(b.nota || '').trim().slice(0, 300), estado: 'confirmada' });
    await env.COTIZA.put(`q:${q.id}`, JSON.stringify(q));
    return json({ cotizacion: vista(q) });
  }
  if (m[2] === '/pagar' && req.method === 'POST') {
    if (q.estado !== 'confirmada' || !q.precio) throw new HttpError(400, 'sin_precio', 'CG todavía no confirma el precio.');
    if (!env.MP_ACCESS_TOKEN) return json({ tipo: 'prueba', monto: q.precio });
    return json({ tipo: 'mercadopago', url: await linkMp(env, url, q) });
  }
  if (m[2] === '/pago-prueba' && req.method === 'POST') {  // only while there's no Mercado Pago token: nothing is charged
    if (env.MP_ACCESS_TOKEN) throw new HttpError(404, 'no_existe');
    if (q.estado !== 'confirmada') throw new HttpError(400, 'sin_precio', 'CG todavía no confirma el precio.');
    Object.assign(q, { estado: 'pagada', metodo: 'prueba', pagada_at: Date.now() });
    await env.COTIZA.put(`q:${q.id}`, JSON.stringify(q));
    return json({ cotizacion: vista(q) });
  }
  throw new HttpError(404, 'no_existe');
}

// ── Mercado Pago (CG's own Access Token: the money lands in CG's account). Same flow as Ep. 07: an online order with
// a checkout link; the payment is looked up in MP (never trusting the redirect or the notification) and recorded once.
const MP_API = 'https://api.mercadopago.com';

async function mpFetch(env, path, init = {}) {
  const r = await fetch(MP_API + path, { ...init, headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('mercadopago', path, r.status, JSON.stringify(d).slice(0, 600)); throw new HttpError(502, 'mercadopago', `Mercado Pago respondió ${r.status}.`); }
  return d;
}

async function linkMp(env, url, q) {
  if (q.mp?.checkout_url && q.mp.monto === q.precio && Date.now() - q.mp.ts < 2 * 86400e3) return q.mp.checkout_url;
  const base = (env.PUBLIC_URL || url.origin).replace(/\/$/, '');
  const online = { success_url: `${base}/mp/vuelta`, failure_url: `${base}/mp/vuelta`, pending_url: `${base}/mp/vuelta` };
  if (base.startsWith('https://')) online.auto_return = 'approved';
  const title = `CG Limpiezas · ${q.que || 'limpieza'}`.slice(0, 120);
  const ref = `cot-${q.id}-${nuevoId()}`;
  const o = await mpFetch(env, '/v1/orders', {
    method: 'POST', headers: { 'x-idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      type: 'online', processing_mode: 'manual', total_amount: String(q.precio), external_reference: ref, expiration_time: 'P3D',
      description: title, config: { statement_descriptor: 'CG LIMPIEZAS', online },
      items: [{ external_code: `cot-${q.id}`, title, quantity: 1, unit_price: String(q.precio) }],
    }),
  });
  if (!o.id || !o.checkout_url) throw new HttpError(502, 'mercadopago', 'Mercado Pago no devolvió el link.');
  q.mp = { ref, order_id: o.id, checkout_url: o.checkout_url, monto: q.precio, ts: Date.now() };
  await Promise.all([env.COTIZA.put(`q:${q.id}`, JSON.stringify(q)), env.COTIZA.put(`m:${o.id}`, q.id)]);
  return o.checkout_url;
}

async function procesarOrden(env, orderId) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(orderId))) return { estado: 'desconocido' };
  const id = await env.COTIZA.get(`m:${orderId}`);
  if (!id) return { estado: 'desconocido' };
  const q = await env.COTIZA.get(`q:${id}`, 'json');
  const o = await mpFetch(env, `/v1/orders/${encodeURIComponent(orderId)}`);
  const ok = o.status === 'processed' && (!o.status_detail || o.status_detail === 'accredited');
  if (!ok) return { id, estado: ['created', 'processing', 'action_required'].includes(o.status) ? 'pendiente' : 'rechazado' };
  const pagado = Math.round(+o.total_paid_amount || +o.total_amount || 0);
  if (String(o.external_reference) !== q.mp?.ref || (o.currency && o.currency !== 'CLP') || pagado < q.precio) return { id, estado: 'rechazado' };
  if (q.estado !== 'pagada') {
    Object.assign(q, { estado: 'pagada', metodo: 'mercadopago', pagada_at: Date.parse(o.last_updated_date || '') || Date.now() });
    await env.COTIZA.put(`q:${id}`, JSON.stringify(q));
  }
  return { id, estado: 'pagada' };
}

async function mpVuelta(env, url) {
  const orderId = url.searchParams.get('order_id');
  let r = { estado: 'pendiente' };
  if (orderId && env.MP_ACCESS_TOKEN) { try { r = await procesarOrden(env, orderId); } catch (e) { console.error(e); } }
  return Response.redirect(`${url.origin}/c/${r.id ? `?id=${r.id}` : ''}#pago=${encodeURIComponent(r.estado)}`, 302);
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function firmaMpOk(req, env, dataId) {
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
  let d = 0; for (let i = 0; i < mine.length; i++) d |= mine.charCodeAt(i) ^ v1.charCodeAt(i);
  return d === 0;
}

async function mpWebhook(req, env, url) {
  const b = await body(req).catch(() => ({}));
  const type = url.searchParams.get('type') || b.type;
  const dataId = url.searchParams.get('data.id') || b.data?.id;
  if (!env.MP_WEBHOOK_SECRET || !(await firmaMpOk(req, env, url.searchParams.get('data.id')))) return json({ error: 'firma' }, 401);
  if (type === 'order' && dataId && env.MP_ACCESS_TOKEN) {
    try { await procesarOrden(env, dataId); } catch (e) { console.error(e); return json({ error: 'reintentar' }, 500); }
  }
  return json({ ok: true });
}

// What's connected (for /tutorial/): whose WhatsApp, Mercado Pago, the AI. Never the values, only yes/no.
function config(env) {
  return {
    wa: env.WA_NUMERO || '', demo: env.DEMO || '',
    conectado: { mercadopago: Boolean(env.MP_ACCESS_TOKEN), webhook: Boolean(env.MP_WEBHOOK_SECRET), ia: Boolean(env.OPENROUTER_API_KEY),
      whatsapp_propio: Boolean(env.WA_NUMERO) && env.WA_NUMERO === env.WA_CG, dominio_propio: Boolean(env.PUBLIC_URL) && !String(env.PUBLIC_URL).includes('jpfraneto.com') },
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/api/mirar' && req.method === 'POST') return await mirar(req, env);
      if (p.startsWith('/api/casos')) return await casos(req, env, p);
      if (p.startsWith('/api/cotizaciones')) return await cotizaciones(req, env, url, p);
      if (p === '/api/mp' && req.method === 'POST') return await mpWebhook(req, env, url);
      if (p === '/mp/vuelta') return await mpVuelta(env, url);
      if (p === '/api/config') return json(config(env));
      if (p.startsWith('/api/')) throw new HttpError(404, 'no_existe');
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: 'interno', message: 'Algo falló. Prueba de nuevo.' }, 500);
    }
  },
};
