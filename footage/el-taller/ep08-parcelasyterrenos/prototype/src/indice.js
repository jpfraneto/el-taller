// The index: parcels for sale all over Chile, from public listings, refreshed every day by the Worker's cron.
//
// What we keep, and why it's legal to show it (public page: /fuentes/):
//   - FACTS only: title, region, comuna, surface, price (in its own currency), date, and the link to the original listing.
//     Facts aren't copyrighted; photos and long descriptions are, so we never copy them.
//   - NO personal data: no seller names, phones or emails (Ley 19.628 / 21.719). The buyer goes to the source to contact.
//   - Only sources whose robots.txt allows the pages we read, at a low rate, with a User-Agent that says who we are.
//   - Anyone can ask us to remove a listing (/fuentes/), and a listing that disappears at the source drops out here.
// Each source writes its own KV key (ix:<fuente>), so one failing source never erases the others.
import { FUENTES } from './fuentes.js';
import { listarCorredoras, leerCorredora, publica as corredoraPublica } from './corredoras.js';

export const UA = 'ParcelasYTerrenosBot/1.0 (+https://parcelasyterrenos.cl/fuentes/)';
export const REGIONES = ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana',
  "O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes'];
const UF_RESPALDO = 40000;          // only if mindicador.cl is down: used to filter/sort, never shown as a price

const sin = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// "Región de Los Lagos", "X Región", "los lagos" → "Los Lagos"
export function region(t) {
  const x = sin(t);
  if (!x) return '';
  if (/metropolitana|santiago|\brm\b/.test(x)) return 'Metropolitana';
  if (/o.?higgins|libertador/.test(x)) return "O'Higgins";
  if (/araucania/.test(x)) return 'La Araucanía';
  if (/aysen|aisen/.test(x)) return 'Aysén';
  if (/magallanes/.test(x)) return 'Magallanes';
  if (/bio.?bio/.test(x)) return 'Biobío';
  return REGIONES.find((r) => x.includes(sin(r))) || '';
}

// "5.000 m²", "1,5 ha", "2 hectáreas", 5000 → m²
export function m2(v) {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : 0;
  const x = sin(v).replace(/\s+/g, ' ');
  const m = x.match(/([\d.,]+)\s*(ha|hectarea|hectareas|hás|has|m2|mt2|mts2|mts|m²|metros)/);
  if (!m) return 0;
  const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  if (!n) return 0;
  return Math.round(/^h/.test(m[2]) ? n * 10000 : n);
}

// A price in CLP or UF → { moneda, monto }. "UF 1.200", "$ 45.000.000", "45 millones".
export function precio(v, monedaHint) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? { moneda: monedaHint === 'UF' ? 'UF' : 'CLP', monto: v } : null;
  const x = sin(v);
  const uf = /\buf\b/.test(x) || monedaHint === 'UF';
  const mill = /millon/.test(x);
  const num = (x.match(/[\d][\d.,]*/) || [''])[0];
  if (!num) return null;
  let n = uf ? Number(num.replace(/\./g, '').replace(',', '.')) : Number(num.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
  if (mill) n *= 1e6;
  return n > 0 ? { moneda: uf ? 'UF' : 'CLP', monto: Math.round(n * 100) / 100 } : null;
}

export async function valorUF(env) {
  const c = await env.DB.get('uf', 'json');
  if (c && Date.now() - c.t < 20 * 3600e3) return c.v;
  // mindicador.cl sometimes hangs for 2 minutes and then fails (2026-11-16): every page waited on it. Give it 4 s,
  // and after a failure keep yesterday's UF for an hour before asking again.
  if (c?.fallo && Date.now() - c.fallo < 3600e3) return c.v || UF_RESPALDO;
  try {
    const r = await fetch('https://mindicador.cl/api/uf', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(4000) });
    const v = (await r.json())?.serie?.[0]?.valor;
    if (v > 10000) { await env.DB.put('uf', JSON.stringify({ v, t: Date.now() })); return v; }
  } catch {}
  await env.DB.put('uf', JSON.stringify({ ...(c || {}), fallo: Date.now() }));
  return c?.v || UF_RESPALDO;
}

// Chile is a strip: latitude says the region almost always (the center needs longitude: the coast or Santiago).
// Only used when the source didn't say the region.
export function regionPorCoords(lat, lng) {
  if (!(lat < -17 && lat > -56.5)) return '';
  if (lat > -19.2) return 'Arica y Parinacota';
  if (lat > -21.6) return 'Tarapacá';
  if (lat > -26.0) return 'Antofagasta';
  if (lat > -29.2) return 'Atacama';
  if (lat > -32.2) return 'Coquimbo';
  if (lat > -34.3) return lng > -71.25 && lat < -32.9 ? 'Metropolitana' : 'Valparaíso';
  if (lat > -35.0) return "O'Higgins";
  if (lat > -36.2) return 'Maule';
  if (lat > -37.2) return lng > -72.7 ? 'Ñuble' : 'Biobío';
  if (lat > -38.5) return 'Biobío';
  if (lat > -39.6) return 'La Araucanía';
  if (lat > -40.6) return 'Los Ríos';
  if (lat > -44.0) return 'Los Lagos';
  if (lat > -49.2) return 'Aysén';
  return 'Magallanes';
}

// A parcel doesn't cost less than ~UF 50 or $1.000.000: below that it's a price per m² or a typo at the source.
const creible = (p) => (p.moneda === 'UF' ? p.monto >= 50 : p.monto >= 1e6);

// One item, the same shape for every source. `k` is the stable key: <fuente>:<id at the source>.
export function item(fuente, x) {
  let p = precio(x.precio, x.moneda);
  if (p?.moneda === 'CLP' && p.monto < 100000) p = { moneda: 'UF', monto: p.monto };   // "$5.785" for land is UF without its label
  if (p && !creible(p)) p = null;   // "UF 4" (per m²) or "$165.000": not the price of a parcel, better none
  const lat = Number(x.lat) || 0, lng = Number(x.lng) || 0;
  return {
    k: `${fuente}:${String(x.id).slice(0, 60)}`,
    f: fuente,
    url: x.url,
    titulo: String(x.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 110),
    region: region(x.region) || region(x.comuna) || regionPorCoords(lat, lng),
    comuna: region(x.comuna) && sin(x.comuna).length < 22 && REGIONES.some((r) => sin(r) === sin(x.comuna).replace(/^region de (la |los )?/, '')) ? '' : String(x.comuna || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    m2: m2(x.m2) || m2(x.titulo),
    moneda: p?.moneda || '', monto: p?.monto || 0,
    fecha: x.fecha ? String(x.fecha).slice(0, 10) : '',
    tipo: String(x.tipo || '').slice(0, 60), nota: String(x.nota || '').slice(0, 120),
    // Where the pin goes: the listing's own point if the source gives one, else its comuna (ubicar(), below).
    lat: dentroDeChile(lat, lng) ? lat : 0, lng: dentroDeChile(lat, lng) ? lng : 0, aprox: x.aprox === true || !dentroDeChile(lat, lng),
  };
}

// ── Where on the map ─────────────────────────────────────────────────────────
// Listings without coordinates go to their comuna's center, from OpenStreetMap's Nominatim (its usage policy: an
// identifying User-Agent, at most 1 request a second, results cached). One lookup per comuna, kept forever in KV.
const dentroDeChile = (lat, lng) => lat < -17 && lat > -56.5 && lng > -76.5 && lng < -66;
export async function ubicar(env, items, max = 60) {
  let pedidas = 0;
  for (const x of items) {
    if (x.lat && x.lng && dentroDeChile(x.lat, x.lng)) continue;
    if (!x.comuna && !x.region) continue;
    const llave = `geo:${sin(x.comuna)}|${sin(x.region)}`;
    let g = await env.DB.get(llave, 'json');
    if (!g && pedidas < max) {
      pedidas++;
      await new Promise((r) => setTimeout(r, 1100));
      try {
        const q = new URLSearchParams({ q: [x.comuna, x.region ? `Región de ${x.region}` : '', 'Chile'].filter(Boolean).join(', '),
          format: 'json', limit: '1', countrycodes: 'cl' });
        const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'user-agent': UA } });
        const j = await r.json();
        g = j?.[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : { lat: 0, lng: 0 };
        await env.DB.put(llave, JSON.stringify(g));
      } catch { g = null; }
    }
    if (g?.lat && dentroDeChile(g.lat, g.lng)) { x.lat = g.lat; x.lng = g.lng; x.aprox = true; x.region = x.region || regionPorCoords(g.lat, g.lng); }
  }
  return items;
}

// ── Reading ─────────────────────────────────────────────────────────────────

let CACHE = null;
export const olvidar = () => { CACHE = null; };   // after a corredora joins or changes: the map shows it now
export async function todo(env) {
  if (CACHE && Date.now() - CACHE.t < 5 * 60e3) return CACHE;
  const uf = await valorUF(env);
  const corredoras = await listarCorredoras(env);
  const meta = { ...Object.fromEntries(Object.entries(FUENTES).map(([f, x]) => [f, x])),
    ...Object.fromEntries(corredoras.map((c) => [`co-${c.id}`, { ...corredoraPublica(c), corredora: true }])) };
  const partes = await Promise.all(Object.keys(meta).map(async (f) => [f, await env.DB.get(`ix:${f}`, 'json')]));
  const items = [];
  const fuentes = {};
  for (const [f, d] of partes) {
    const FUENTES = meta;                         // static sources + corredoras, same fields
    fuentes[f] = { corredora: Boolean(FUENTES[f].corredora), verificada: Boolean(FUENTES[f].verificada), nombre: FUENTES[f].nombre, web: FUENTES[f].web, que: FUENTES[f].que || '', reclamable: FUENTES[f].reclamable !== false, logo: FUENTES[f].logo || '',
      n: d?.items?.length || 0, t: d?.t || 0, error: d?.error || '' };
    for (const x0 of d?.items || []) {
      const x = x0.monto && !creible(x0) ? { ...x0, monto: 0, moneda: '' } : x0;      // items stored before this rule
      items.push({ ...x, clp: x.moneda === 'UF' ? Math.round(x.monto * uf) : x.monto });
    }
  }
  const borrados = new Set((await env.DB.get('ix-borrados', 'json')) || []);
  CACHE = { t: Date.now(), uf, fuentes, items: items.filter((x) => !borrados.has(x.k) && x.url && x.titulo) };
  return CACHE;
}

const TAM = { chica: [1, 5000], media: [5001, 10000], grande: [10001, 1e12] };

export function filtrar(items, q) {
  const texto = sin(q.q || '').split(/\s+/).filter((w) => w.length > 2);
  const [min, max] = TAM[q.tam] || [0, 1e12];
  const tope = Number(q.max) || 0;
  let out = items.filter((x) => (!q.region || x.region === q.region)
    && (!q.tam || (x.m2 >= min && x.m2 <= max))
    && (!tope || (x.clp && x.clp <= tope))
    && (!texto.length || texto.every((w) => sin(`${x.titulo} ${x.comuna} ${x.region}`).includes(w))));
  const orden = q.orden || 'nuevas';
  out = out.sort(orden === 'barato' ? (a, b) => (a.clp || 9e15) - (b.clp || 9e15)
    : orden === 'grande' ? (a, b) => b.m2 - a.m2
    : (a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return out;
}

export function porRegion(items) {
  const c = {};
  for (const x of items) if (x.region) c[x.region] = (c[x.region] || 0) + 1;
  return c;
}

// How people name a zone when it isn't a region (the chat's quick questions use these): words → regions.
const ZONAS = [
  [/patagonia/, ['Aysén', 'Magallanes']],
  [/santiago|capital/, ['Metropolitana', 'Valparaíso', "O'Higgins"]],
  [/\bsur\b/, ['La Araucanía', 'Los Ríos', 'Los Lagos']],
  [/\bnorte\b/, ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo']],
  [/chiloe/, ['Los Lagos']],
];
// And what they want next to it, matched against the listing's own title.
const ENTORNOS = [[/\bmar\b|playa|costa/, /\bmar\b|playa|costa|borde ?mar/], [/\blagos?\b/, /\blagos?\b|laguna/], [/\brios?\b/, /\brios?\b|estero/]];

// For Claude: the few indexed listings that match what the person is talking about (comuna/region/zone words, mar/lago/río).
export function parecidas(items, conversacion, n = 12) {
  const t = sin(conversacion);
  const regs = [...new Set([...REGIONES.filter((r) => t.includes(sin(r))), ...ZONAS.filter(([re]) => re.test(t)).flatMap(([, r]) => r)])];
  const comunas = [...new Set(items.map((x) => x.comuna).filter(Boolean))].filter((c) => c.length > 3 && t.includes(sin(c)));
  const sinRegiones = t.replace(/los lagos|los rios/g, '');   // the regions' names aren't a lake or a river
  const entornos = ENTORNOS.filter(([re]) => re.test(sinRegiones)).map(([, en]) => en);
  if (!regs.length && !comunas.length && !entornos.length) return [];
  const lugar = (x) => (!regs.length && !comunas.length) || comunas.includes(x.comuna) || regs.includes(x.region);
  const entorno = (x) => !entornos.length || entornos.some((re) => re.test(sin(x.titulo)));
  return items.filter((x) => lugar(x) && entorno(x))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, n);
}

// ── Writing (the cron) ──────────────────────────────────────────────────────

// Items read somewhere else (the Mac in Chile: the government site doesn't answer Cloudflare) → the same KV key.
export async function subir(env, f, crudos) {
  if (!FUENTES[f] && !(f.startsWith('co-') && (await listarCorredoras(env)).some((c) => `co-${c.id}` === f))) throw new Error('fuente desconocida');
  // They arrive already shaped by item() on the Mac: run them through it again (it cleans), keeping price and position.
  const items = (Array.isArray(crudos) ? crudos : []).slice(0, 20000).map((x) => item(f, { ...x, id: String(x.k || x.id || '').replace(`${f}:`, ''),
    precio: x.precio ?? (x.monto || null), moneda: x.moneda }))
    .filter((x) => /^https:\/\//.test(x.url) && x.titulo);
  if (!items.length) throw new Error('sin items');
  const unicos = [...new Map(items.map((x) => [x.k, x])).values()];
  await env.DB.put(`ix:${f}`, JSON.stringify({ t: Date.now(), items: unicos, error: '', desde: 'mac' }));
  CACHE = null;
  return unicos.length;
}

export async function actualizar(env, soloFuente) {
  const res = {};
  // Slow page-by-page sites (mac: true) are read by the Mac's daily job, not by the Worker (subrequest limits).
  const corredoras = Object.fromEntries((await listarCorredoras(env)).filter((c) => c.estado !== 'pendiente' && (!c.mac || soloFuente === `co-${c.id}`))
    .map((c) => [`co-${c.id}`, { leer: (e) => leerCorredora(c, e) }]));
  for (const [f, src] of Object.entries({ ...FUENTES, ...corredoras })) {
    if (soloFuente && f !== soloFuente) continue;
    const t0 = Date.now();
    const antes = (await env.DB.get(`ix:${f}`, 'json')) || { items: [] };
    try {
      const nuevos = await ubicar(env, (await src.leer(env)).map((x) => item(f, x)).filter((x) => x.url && x.titulo));
      // Never shrink the index to nothing because of one bad run: keep the old ones if the source returned zero.
      if (!nuevos.length && antes.items.length) throw new Error('la fuente no devolvió nada');
      const unicos = [...new Map(nuevos.map((x) => [x.k, x])).values()];
      await env.DB.put(`ix:${f}`, JSON.stringify({ t: Date.now(), items: unicos, error: '' }));
      res[f] = { n: unicos.length, ms: Date.now() - t0 };
    } catch (e) {
      await env.DB.put(`ix:${f}`, JSON.stringify({ ...antes, error: String(e?.message || e).slice(0, 200), t_error: Date.now() }));
      res[f] = { error: String(e?.message || e).slice(0, 200) };
    }
  }
  CACHE = null;
  return res;
}
