// Selling attention, by itself: "Auspicia aquí" (a billboard on the map's Ruta 5 with your link), paid with Mercado
// Pago, switched on when the payment is approved, off 30 days later.
// Nobody approves anything: Mercado Pago's webhook (and the return redirect) look the order up in MP itself
// (never trusting the notification) and turn the thing on once. Same Orders API as Ep. 07 (Árbol de Lilith).
//
// KV: mp:<ref> the purchase · mpo:<order id> → ref · carteles {i: {empresa, url, texto, img, hasta}}
// Secrets: MP_ACCESS_TOKEN (the site owner's Mercado Pago, his money) · MP_WEBHOOK_SECRET ("Order" events → /mp/webhook)
const MP_API = 'https://api.mercadopago.com';
const MES = 30 * 864e5;

export class PagoError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function mp(env, path, init = {}) {
  const r = await fetch(MP_API + path, { ...init, headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.log('mercadopago', path, r.status, JSON.stringify(d).slice(0, 600)); throw new PagoError(502, 'mercadopago', `Mercado Pago respondió ${r.status}.`); }
  return d;
}

// What's on, right now (expired ones simply stop counting: nothing to clean up by hand).
export async function cartelesActivos(env) {
  const c = (await env.DB.get('carteles', 'json')) || {};
  return Object.fromEntries(Object.entries(c).filter(([, x]) => x.hasta > Date.now()));
}

// A sponsor buys one of the cupos, not a place on the coast. The cupo for a link: the one it already has (paying again
// adds 30 days), else the first free one, else -1 (all taken).
export function cupoPara(activos, cupos, empresa) {
  const suyo = Object.entries(activos).find(([, x]) => x.empresa === empresa);
  if (suyo) return Number(suyo[0]);
  for (let i = 0; i < cupos; i++) if (!activos[i]) return i;
  return -1;
}

// What stands on each of the 6 numbered billboards (1 = north … 6 = south), decided on every page load: the sold cupos,
// null for a free one ("DISPONIBLE"), and the NGOs' one ({ong: true} + the NGO on duty, if any). JP, 2026-11-16: all six,
// in a new random order every time the page loads. This is the one place for a ranking algorithm later (clicks per
// sponsor are counted as clic:<mes>:auspicio-<dominio>).
export function ordenarCarteles(activos, cupos, ong) {
  const lista = Object.entries(activos).map(([i, x]) => ({ cupo: Number(i), empresa: x.empresa, url: x.url, img: x.img || '' }));
  while (lista.length < cupos) lista.push(null);
  lista.push({ ong: true, ...(ong ? { url: ong.url, empresa: ong.dominio } : {}) });
  for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
  return lista;
}

// A purchase → a Mercado Pago checkout link.
export async function pagar(env, origin, { tipo, cartel, empresa, url, texto, img }, precios) {
  if (!env.MP_ACCESS_TOKEN) throw new PagoError(503, 'sin_mp', 'El pago con Mercado Pago se activa cuando el dueño del sitio conecte su cuenta.');
  if (tipo !== 'auspicio') throw new PagoError(400, 'tipo', 'Eso no se vende.');
  const monto = precios.auspicio;
  const ref = `${tipo}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const desc = `Parcelas y Terrenos · Auspicio ${empresa}, 30 días`;
  const vuelta = `${origin}/mp/vuelta`;
  const order = await mp(env, '/v1/orders', {
    method: 'POST', headers: { 'x-idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      type: 'online', processing_mode: 'manual', total_amount: String(monto), external_reference: ref, expiration_time: 'P2D',
      description: desc, config: { statement_descriptor: 'PARCELASYTERRENOS', online: { success_url: vuelta, failure_url: vuelta, pending_url: vuelta, auto_return: 'approved' } },
      items: [{ external_code: ref, title: desc, quantity: 1, unit_price: String(monto) }],
    }),
  });
  if (!order.id || !order.checkout_url) throw new PagoError(502, 'mercadopago', 'Mercado Pago no devolvió el link.');
  const compra = { ref, tipo, cartel: Number(cartel), empresa: empresa || '', url: url || '', texto: texto || '', img: img || '',
    monto, order_id: order.id, estado: 'creada', t: Date.now() };
  await env.DB.put(`mp:${ref}`, JSON.stringify(compra), { expirationTtl: 60 * 60 * 24 * 400 });
  await env.DB.put(`mpo:${order.id}`, ref, { expirationTtl: 60 * 60 * 24 * 30 });
  return { url: order.checkout_url };
}

function estadoOrden(o) {
  if (o.status === 'processed' && (!o.status_detail || o.status_detail === 'accredited')) return 'approved';
  if (['created', 'processing', 'action_required'].includes(o.status)) return 'pending';
  return 'rejected';
}

// Look the order up in MP, check it's ours and fully paid, then switch the thing on (once).
export async function procesarOrden(env, orderId) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(orderId))) return 'desconocido';
  const ref = await env.DB.get(`mpo:${orderId}`);
  const compra = ref && (await env.DB.get(`mp:${ref}`, 'json'));
  if (!compra) return 'desconocido';
  if (compra.estado === 'pagada') return 'approved';
  const o = await mp(env, `/v1/orders/${encodeURIComponent(orderId)}`);
  const estado = estadoOrden(o);
  if (estado !== 'approved') return estado;
  const pagado = Math.round(+o.total_paid_amount || +o.total_amount || 0);
  if (String(o.external_reference) !== compra.ref || (o.currency && o.currency !== 'CLP') || pagado < compra.monto) return 'rejected';
  compra.estado = 'pagada'; compra.pagada = Date.now(); compra.hasta = Date.now() + MES;
  await env.DB.put(`mp:${compra.ref}`, JSON.stringify(compra), { expirationTtl: 60 * 60 * 24 * 400 });
  if (compra.tipo === 'auspicio') {
    const c = (await env.DB.get('carteles', 'json')) || {};
    // Two people paid for the same free cupo at once: the second takes the next free index (never overwrite a payer).
    let i = compra.cartel;
    const otro = (k) => c[k]?.hasta > Date.now() && c[k].empresa !== compra.empresa;
    while (otro(i)) i++;
    const antes = c[i]?.hasta > Date.now() ? c[i].hasta : Date.now();
    // Paying again without a new image keeps the one it had.
    const img = compra.img || (c[i]?.empresa === compra.empresa ? c[i].img : '') || '';
    c[i] = { empresa: compra.empresa, url: compra.url, texto: compra.texto, img, hasta: antes + MES };
    await env.DB.put('carteles', JSON.stringify(c));
  }
  return 'approved';
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function firmaValida(req, env, dataId) {
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
  const mia = await hmacHex(env.MP_WEBHOOK_SECRET, manifest);
  if (mia.length !== v1.length) return false;
  let r = 0; for (let i = 0; i < mia.length; i++) r |= mia.charCodeAt(i) ^ v1.charCodeAt(i);
  return r === 0;
}

export async function webhook(req, env, url) {
  const b = await req.json().catch(() => ({}));
  const tipo = url.searchParams.get('type') || b.type;
  const dataId = url.searchParams.get('data.id') || b.data?.id;
  if (!env.MP_WEBHOOK_SECRET || !(await firmaValida(req, env, url.searchParams.get('data.id')))) return new Response('firma', { status: 401 });
  if (tipo === 'order' && dataId && env.MP_ACCESS_TOKEN) {
    try { await procesarOrden(env, dataId); } catch (e) { console.log(String(e)); return new Response('reintenta', { status: 500 }); }
  }
  return new Response('ok');
}

// Back from Mercado Pago: check the order and land on the map with the result.
export async function vuelta(env, url) {
  const orderId = url.searchParams.get('order_id') || url.searchParams.get('merchant_order_id') || '';
  let estado = 'pending';
  if (orderId && env.MP_ACCESS_TOKEN) { try { estado = await procesarOrden(env, orderId); } catch (e) { console.log(String(e)); } }
  if (estado === 'desconocido') estado = 'pending';
  return Response.redirect(`${url.origin}/?pago=${encodeURIComponent(estado)}`, 302);
}

export async function comprasDelMes(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.DB.list({ prefix: 'mp:', cursor });
    for (const k of r.keys) { const c = await env.DB.get(k.name, 'json'); if (c?.estado === 'pagada' && c.pagada > Date.now() - MES) out.push(c); }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}
