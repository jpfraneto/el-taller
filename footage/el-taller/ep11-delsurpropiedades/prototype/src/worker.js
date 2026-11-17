// Del Sur Propiedades (prototipo El Taller Ep. 11). The page is static (public/); the Worker answers:
//   GET  /data/propiedades.json   the listings: the last good read of their site (src/delsur.js), else the static file
//   GET  /api/config   where "Me interesa" goes (demo: El Taller's WhatsApp, see wrangler.jsonc)
//   GET  /api/estado   how the reading of their site is going (per category: when, how many, errors)
//   POST /api/busca    { texto, operacion } → the listings that fit what the person wrote, each with why (OpenRouter)
// Everything else is public/ (and /3257 → index.html, which opens that listing). Ties to El Taller: taller.json.
// /nueva/ is a second version of the page (a corredora first: comprar, arrendar, vender), on the same data.
import { snapshot, estado, tick } from './delsur.js';

export default {
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(tick(env));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      // The second version of the page (public/nueva/): /nueva/3257 and /nueva/noviembre are that page, which opens them.
      if (url.pathname.startsWith('/nueva/')) return env.ASSETS.fetch(new Request(new URL('/nueva/', url), req));
      if (url.pathname === '/data/propiedades.json') {
        return new Response(JSON.stringify(await snapshot(env, url)), {
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
      }
      if (url.pathname === '/api/config') return json({ wa: env.WA_NUMERO, demo: env.DEMO || '' });
      if (url.pathname === '/api/estado') return json(await estado(env));
      if (url.pathname === '/api/busca' && req.method === 'POST') return json(await busca(req, env, url));
      return json({ error: 'no existe' }, 404);
    } catch (e) {
      return json({ error: e.publico || 'Algo falló. Prueba de nuevo.' }, e.status || 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function falla(status, publico) {
  return Object.assign(new Error(publico), { status, publico });
}

async function propiedades(env, url) {
  return (await snapshot(env, url)).propiedades;
}

// One line per listing: what the model needs to choose (no photos, no long text).
function linea(p) {
  const precio = p.uf ? `UF ${p.uf}` : p.clp ? `$${Math.round(p.clp / 1000)}mil` : 'sin precio';
  const m2 = [p.construido && `${p.construido}m² const`, p.terreno && `${p.terreno}m² terreno`].filter(Boolean).join(', ');
  const piezas = p.dormitorios ? `${p.dormitorios}D/${p.banos || '?'}B` : '';
  const desc = (p.descripcion || '').replace(/\s+/g, ' ').slice(0, 220);
  return `${p.id} | ${p.tipo} | ${p.comuna} | ${p.titulo} | ${precio} | ${m2} | ${piezas} | ${desc}`;
}

const MODELOS = ['google/gemini-2.5-flash-lite', 'google/gemini-3.1-flash-lite'];
const UF = 41300;

async function preguntar(env, sistema, usuario, nombre, schema, max = 1200) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'http-referer': 'https://delsurpropiedades.jpfraneto.com',
      'x-title': 'Del Sur Propiedades - El Taller',
    },
    body: JSON.stringify({
      models: MODELOS, temperature: 0.2, max_tokens: max,
      response_format: { type: 'json_schema', json_schema: { name: nombre, strict: true, schema } },
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.choices?.[0]) throw falla(502, 'La búsqueda no respondió. Prueba de nuevo en un rato.');
  const m = String(j.choices[0].message?.content || '').match(/\{[\s\S]*\}/);
  if (!m) throw falla(502, 'La búsqueda no respondió bien. Prueba de nuevo.');
  return JSON.parse(m[0]);
}

// Step 1: what the person wrote → hard limits (code applies them; the model never decides a price is "within budget").
const FILTROS = {
  type: 'object', additionalProperties: false, required: ['tipos', 'comunas', 'precio_max', 'dormitorios_min'],
  properties: {
    tipos: { type: 'array', items: { type: 'string' } },
    comunas: { type: 'array', items: { type: 'string' } },
    precio_max: { type: ['number', 'null'] },
    dormitorios_min: { type: ['number', 'null'] },
  },
};

// Step 2: rank what's left, saying why with what each listing says.
const ESQUEMA = {
  type: 'object', additionalProperties: false, required: ['respuesta', 'propiedades'],
  properties: {
    respuesta: { type: 'string' },
    propiedades: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['id', 'porque'],
        properties: { id: { type: 'string' }, porque: { type: 'string' } } },
    },
  },
};

const precioDe = (p, op) => (op === 'venta' ? (p.uf ?? (p.clp ? p.clp / UF : null)) : (p.clp ?? (p.uf ? p.uf * UF : null)));

function aplicar(todas, f, op, { holgura = 1, conComuna = true } = {}) {
  const tipos = new Set(f.tipos || []);
  const comunas = new Set(f.comunas || []);
  return todas.filter((p) => (!tipos.size || tipos.has(p.tipo))
    && (!conComuna || !comunas.size || comunas.has(p.comuna))
    && (!f.precio_max || (precioDe(p, op) ?? Infinity) <= f.precio_max * holgura)
    && (!f.dormitorios_min || !p.dormitorios || p.dormitorios >= f.dormitorios_min));
}

async function busca(req, env, url) {
  const { texto = '', operacion = 'venta' } = await req.json().catch(() => ({}));
  const pide = String(texto).trim().slice(0, 500);
  if (pide.length < 3) throw falla(400, 'Cuéntanos un poco más de lo que buscas.');
  if (!env.OPENROUTER_API_KEY) throw falla(503, 'La búsqueda conversada no está encendida.');
  await limite(req, env);

  const todas = (await propiedades(env, url)).filter((p) => p.operacion === operacion);
  const tipos = [...new Set(todas.map((p) => p.tipo))];
  const comunas = [...new Set(todas.map((p) => p.comuna))];
  const f = await preguntar(env,
    `Convierte lo que alguien busca para ${operacion === 'venta' ? 'comprar' : 'arrendar'} en filtros. Usa SOLO valores de estas listas. Tipos: ${tipos.join(', ')}. Comunas: ${comunas.join(', ')}. Pon un tipo solo si lo pide explícito ("casa" → Casas; "parcela" sola → Parcelas y Casas, porque muchas casas están en parcela; "terreno" → Terrenos Urbanos y Parcelas; "depto" → Departamentos). Pon comunas solo si las nombra ("cerca de Frutillar" → Frutillar). precio_max: el tope que dice, en ${operacion === 'venta' ? 'UF (si lo dice en pesos, divide por 41300; "barata" sin número = null)' : 'pesos al mes'}; null si no dice. dormitorios_min: null si no dice ("familia de 4" → 3).`,
    pide, 'filtros', FILTROS, 300);

  let lista = aplicar(todas, f, operacion);
  let nota = '';
  if (lista.length < 3) { lista = aplicar(todas, f, operacion, { holgura: 1.15 }); nota = 'Con tu tope exacto había muy poco: incluí hasta un 15% más caro.'; }
  if (lista.length < 3) { lista = aplicar(todas, f, operacion, { holgura: 1.15, conComuna: false }); nota = 'En esa comuna había muy poco: incluí alrededores.'; }
  if (!lista.length) return { respuesta: 'No encontré nada que calce con eso. Escríbenos por WhatsApp y te ayudamos a buscar.', propiedades: [], filtros: f };

  const salida = await preguntar(env,
    `Eres la búsqueda de Del Sur Propiedades, corredora de Puerto Varas (Chile). Todas estas propiedades ya cumplen los límites duros (tipo, comuna, precio, dormitorios). Elige las que mejor calcen con lo que pide (máximo 8, la mejor primero) y di en una frase (máx. 16 palabras) por qué calza cada una, usando solo lo que dice ESA línea: si pide vista al lago y la línea no dice lago, no lo afirmes. No repitas "dentro de tu presupuesto". Nunca inventes. "respuesta": una o dos frases en español de Chile, directas, tuteando, sin saludar ni signos de exclamación; no afirmes algo de "todas" si no es cierto de cada una.${nota ? ` Menciona esto: ${nota}` : ''} Formato de cada línea: id | tipo | comuna | título | precio | m² | dormitorios/baños | descripción.`,
    `Lo que busco: ${pide}\n\nPropiedades:\n${lista.map(linea).join('\n')}`, 'busca', ESQUEMA);
  const ids = new Set(lista.map((p) => p.id));
  salida.propiedades = (salida.propiedades || []).filter((x) => ids.has(String(x.id))).slice(0, 8);
  salida.filtros = f;
  return salida;
}

// A few questions per IP per day (the Cache API is enough for a demo: no storage to set up).
async function limite(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const llave = new Request(`https://limite.local/${new Date().toISOString().slice(0, 10)}/${ip}`);
  const cache = caches.default;
  const n = Number((await (await cache.match(llave))?.text()) || 0);
  if (n >= Number(env.LIMITE_DIARIO || 30)) throw falla(429, 'Por hoy llegaste al máximo de búsquedas. Escríbenos por WhatsApp.');
  await cache.put(llave, new Response(String(n + 1), { headers: { 'cache-control': 'max-age=86400' } }));
}
