// Campo & Mar · prototipo El Taller Ep. 10 (campoymar.jpfraneto.com)
//   /          su Instagram, rediseñado (la propuesta): static, public/index.html
//   /hoy/      el link de la bio: la hornada. Lo que salió hoy en Ancud y Castro, lo que está en prueba (y se reserva:
//              la reserva es la respuesta, no un like), dónde llegó esta semana, qué lleva cada cosa.
//   /pide/     encargar una torta (para ti) y el catálogo mayorista (para tu café). Termina en un WhatsApp escrito.
//   /horno/?k= el link privado de Campo & Mar: escriben qué salió, abren una prueba, anotan dónde llegó, ven las reservas.
//
// KV CAMPO: "hoy" {ancud, castro, hora, fecha} · "pruebas" [{id, nombre, texto, foto, fuente, meta, estado}] ·
//           "llego" [{donde, ciudad, que, fecha}] · "res:<id>" [{nombre, tienda, t}] · "rl:<día>:<ip>"

// The first two tests are their own public questions that nobody answered (0 comments on both).
const PRUEBAS_INICIALES = [
  {
    id: 'rollitos-sin-azucar', nombre: 'Rollitos de canela sin azúcar', foto: '/img/posts/rollitos.jpg',
    texto: 'Los rollitos son sus favoritos. Preguntamos si quieren una versión sin azúcar: si la quieres, resérvala.',
    fuente: 'su pregunta del 20 oct 2026: «¿Les gustaría que hiciéramos una versión sin azúcar?»', meta: null, estado: 'abierta',
  },
  {
    id: 'muffins-arandano', nombre: 'Muffins veganos de arándano', foto: '/img/posts/muffins.jpg',
    texto: 'Nacieron en la cocina de la casa, con los niños. ¿Los quieres en las tiendas? Resérvalos.',
    fuente: 'su pregunta del 18 oct 2026: «¿Les gustaría encontrarlos en nuestras tiendas?»', meta: null, estado: 'abierta',
  },
];

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function body(req) {
  try { return await req.json(); } catch { throw new HttpError(400, 'json_invalido'); }
}

const s = (v, n) => String(v ?? '').trim().slice(0, n);
const leer = async (env, k, d) => (await env.CAMPO.get(k, 'json')) ?? d;
const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

function esDuena(env, url) {
  return Boolean(env.HORNO_CLAVE) && url.searchParams.get('k') === env.HORNO_CLAVE;
}

async function estado(env, duena) {
  const [hoy, pruebas, llego] = await Promise.all([
    leer(env, 'hoy', null), leer(env, 'pruebas', PRUEBAS_INICIALES), leer(env, 'llego', []),
  ]);
  const conReservas = await Promise.all(pruebas.map(async (p) => {
    const r = await leer(env, `res:${p.id}`, []);
    return { ...p, cuenta: r.length, ultima: r.at(-1)?.t || null, ...(duena ? { reservas: r } : {}) };
  }));
  // "salió" counts only for today (Chile); yesterday's batch is not today's.
  const vigente = hoy && hoy.fecha === hoyChile() ? hoy : null;
  return { hoy: vigente, hoy_anterior: vigente ? null : hoy, pruebas: conReservas, llego: llego.slice(0, 12) };
}

async function limitar(env, req) {
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const key = `rl:${hoyChile()}:${ip}`;
  const n = Number(await env.CAMPO.get(key)) || 0;
  if (n >= Number(env.LIMITE_DIARIO || 12)) throw new HttpError(429, 'limite', 'Ya reservaste harto hoy. Escríbenos por WhatsApp.');
  await env.CAMPO.put(key, String(n + 1), { expirationTtl: 60 * 60 * 26 });
}

async function reservar(req, env) {
  const b = await body(req);
  const pruebas = await leer(env, 'pruebas', PRUEBAS_INICIALES);
  const p = pruebas.find((x) => x.id === b.prueba);
  if (!p || p.estado !== 'abierta') throw new HttpError(404, 'no_existe', 'Esa prueba ya no está abierta.');
  const nombre = s(b.nombre, 40);
  const tienda = ['Ancud', 'Castro', 'Puerto Varas'].includes(b.tienda) ? b.tienda : 'Ancud';
  if (!nombre) throw new HttpError(400, 'falta_nombre', 'Pon tu nombre.');
  await limitar(env, req);
  const r = await leer(env, `res:${p.id}`, []);
  r.push({ nombre, tienda, t: new Date().toISOString() });
  await env.CAMPO.put(`res:${p.id}`, JSON.stringify(r.slice(-500)));
  return json({ ok: true, cuenta: r.length, meta: p.meta });
}

// The owner's private link: one POST with whatever changed.
async function horno(req, env, url) {
  if (!esDuena(env, url)) throw new HttpError(403, 'clave', 'Este link no es el tuyo.');
  if (req.method === 'GET') return json(await estado(env, true));
  const b = await body(req);
  if (b.hoy) {
    await env.CAMPO.put('hoy', JSON.stringify({
      ancud: s(b.hoy.ancud, 600), castro: s(b.hoy.castro, 600), fecha: hoyChile(),
      hora: new Date().toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    }));
  }
  if (b.prueba) {
    const pruebas = await leer(env, 'pruebas', PRUEBAS_INICIALES);
    const id = s(b.prueba.id, 60) || s(b.prueba.nombre, 60).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) throw new HttpError(400, 'falta_nombre');
    const i = pruebas.findIndex((x) => x.id === id);
    const antes = i >= 0 ? pruebas[i] : { id, foto: null, fuente: 'Campo & Mar', estado: 'abierta' };
    const p = {
      ...antes,
      nombre: s(b.prueba.nombre ?? antes.nombre, 60),
      texto: s(b.prueba.texto ?? antes.texto, 300),
      // meta = how many reservations make them bake it ("" clears it; absent keeps it).
      meta: !('meta' in b.prueba) ? antes.meta ?? null
        : Number(b.prueba.meta) > 0 ? Math.min(999, Math.round(Number(b.prueba.meta))) : null,
      estado: ['abierta', 'sale', 'cerrada'].includes(b.prueba.estado) ? b.prueba.estado : antes.estado,
      sale: s(b.prueba.sale ?? antes.sale, 80),
    };
    if (i >= 0) pruebas[i] = p; else pruebas.unshift(p);
    await env.CAMPO.put('pruebas', JSON.stringify(pruebas));
  }
  if (b.llego) {
    const llego = await leer(env, 'llego', []);
    llego.unshift({ donde: s(b.llego.donde, 60), ciudad: s(b.llego.ciudad, 40), que: s(b.llego.que, 120), fecha: hoyChile() });
    await env.CAMPO.put('llego', JSON.stringify(llego.slice(0, 50)));
  }
  return json(await estado(env, true));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/api/config') return json({ wa: env.WA_NUMERO || '', demo: env.DEMO || '' });
      if (p === '/api/estado') return json(await estado(env, false));
      if (p === '/api/reservar' && req.method === 'POST') return await reservar(req, env);
      if (p === '/api/horno') return await horno(req, env, url);
      if (p.startsWith('/api/')) throw new HttpError(404, 'no_existe');
      // The site opens on the shop: no asset answers "/", so it lands here.
      if (p === '/') return Response.redirect(new URL('/hoy/', url), 302);
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: 'interno', message: 'Algo falló. Prueba de nuevo.' }, 500);
    }
  },
};
