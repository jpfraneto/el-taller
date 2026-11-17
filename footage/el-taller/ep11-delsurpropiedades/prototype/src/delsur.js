// Reads Del Sur's own site from the Worker (the cron in wrangler.jsonc), so the storefront doesn't depend on anyone's Mac.
// Their site stays the source of truth: they keep publishing there. Each tick reads ONE category (its list + "load more"),
// adds the new listings (their detail page), drops the ones gone, updates prices from the list cards, and saves the
// whole thing as one KV value ('snapshot'). If a read fails or comes back empty, the last good copy stays and the
// failure goes to 'estado' (GET /api/estado). Under 50 requests per tick (Cloudflare's free plan).
// The first full read (with light photos and map points) is scripts/leer_delsur.py + scripts/preparar.py → the static
// public/data/propiedades.json, which is also the seed and the fallback.

const WEB = 'https://www.delsurpropiedades.cl';
const UA = 'Mozilla/5.0 (compatible; DelSur-vitrina/1.0; +https://delsurpropiedades.jpfraneto.com)';
const CATEGORIAS = [['sales', 1], ['sales', 2], ['sales', 3], ['sales', 4], ['sales', 5], ['sales', 6], ['sales', 7], ['sales', 12],
  ['rents', 1], ['rents', 2], ['rents', 6], ['rents', 7], ['rents', 12]];
// Cloudflare's free plan allows 50 requests per tick: the list pages come first (Parcelas needs ~37 pages of 6), and
// whatever is left goes to new listings' pages (the rest wait for the next round).
const PRESUPUESTO = 46;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', sup2: '²', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', iexcl: '¡', iquest: '¿', deg: '°', ordm: 'º' };
const entidades = (s) => s.replace(/&(#\d+|[a-zA-Z0-9]+);/g, (m, e) => (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : ENT[e] ?? m));

function texto(s) {
  return entidades(String(s || '').replace(/<br\s*\/?>/g, '\n').replace(/<\/p>\s*/g, '\n\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function numero(s) {
  const m = String(s || '').replace(/\./g, '').replace(',', '.').match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

// One category: [name, Map(id → true), read to the end?, requests used], following the site's own "load more".
async function leerCategoria(modo, tipo) {
  const url = `${WEB}/propertytypes/${modo}/${tipo}`;
  const r0 = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r0.ok) throw new Error(`${url} ${r0.status}`);
  const galleta = (r0.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
  const h0 = await r0.text();
  const nombre = texto((h0.match(/id="rents">[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1]);
  const cartas = new Map();
  const leer = (h) => {
    let nuevas = 0;
    for (const m of h.matchAll(/data-url="[^"]*\/properties\/view\/(\d+)"([\s\S]*?)(?=data-url="|$)/g)) {
      if (cartas.has(m[1])) continue;
      cartas.set(m[1], true);
      nuevas++;
    }
    return nuevas;
  };
  leer(h0);
  let usadas = 1;
  let completa = false;
  for (let page = 2; usadas < PRESUPUESTO - 2; page++) {
    usadas++;
    const r = await fetch(`${WEB}/propertytypes/loadpage`, {
      method: 'POST',
      headers: { 'user-agent': UA, cookie: galleta, 'x-requested-with': 'XMLHttpRequest', referer: url,
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ propertytype: tipo, page, type: 'recents', modalitytype_id: modo === 'sales' ? 1 : 2, moneda: 'uf' }),
    });
    if (!r.ok) break;
    if (!leer(await r.text())) { completa = true; break; }
  }
  return [nombre, cartas, completa, usadas];
}

// One listing's own page (same fields as scripts/leer_delsur.py).
async function leerFicha(id) {
  const r = await fetch(`${WEB}/properties/view/${id}`, { headers: { 'user-agent': UA } });
  const h = await r.text();
  const i = h.indexOf('<h3 class="title-property">');
  if (i < 0) return null;
  const b = h.slice(i);
  const h4 = (b.match(/<h4>([\s\S]*?)<\/h4>/) || [])[1] || '';
  const uf = h4.match(/UF\s?([\d.,]+)/);
  const clp = h4.match(/\$\s?([\d.]{4,})/);
  const datos = {};
  for (const m of b.split('</ul>')[0].matchAll(/<h5>([\s\S]*?)<\/h5>\s*<h6>([\s\S]*?)<\/h6>/g)) datos[texto(m[1])] = texto(m[2]);
  const desc = b.match(/<p class="description">([\s\S]*?)<\/p>\s*(?:<a|<\/div>)/);
  const fotos = [...new Set([...h.matchAll(/src="(https:\/\/delsurpropiedades\.cl\/img\/properties\/[^"]+)"/g)].map((m) => encodeURI(m[1])))];
  const lugar = h.match(/google\.com\/maps\?q=([^"&]+)/);
  return {
    id: String(id), titulo: texto(b.match(/<h3 class="title-property">([\s\S]*?)<\/h3>/)[1]), comuna: texto(h4.split('<br')[0]),
    uf: uf ? numero(uf[1]) : null, clp: clp ? numero(clp[1]) : null,
    construido: numero(datos.Construido), terreno: numero(datos.Terreno), dormitorios: numero(datos.Dormitorios), banos: numero(datos['Baños']),
    descripcion: desc ? texto(desc[1]) : '', fotos,
    lugar: lugar ? entidades(decodeURIComponent(lugar[1])).trim() : '', url: `${WEB}/properties/view/${id}`,
  };
}

// The listings as the page sees them: KV's snapshot, else the static file.
let memoria = null;
export async function snapshot(env, url) {
  if (memoria && Date.now() - memoria.t < 60_000) return memoria.d;
  let d = env.DELSUR && (await env.DELSUR.get('snapshot', 'json'));
  if (!d) d = await (await env.ASSETS.fetch(new URL('/data/propiedades.json', url))).json();
  memoria = { t: Date.now(), d };
  return d;
}

export async function estado(env) {
  return (await env.DELSUR.get('estado', 'json')) || { nota: 'todavía no corre la lectura' };
}

// One cron tick.
export async function tick(env) {
  const base = new URL('https://delsurpropiedades.jpfraneto.com');
  const d = structuredClone(await snapshot(env, base));
  const centros = await (await env.ASSETS.fetch(new URL('/data/comunas.json', base))).json().catch(() => ({}));
  const est = (await env.DELSUR.get('estado', 'json')) || { categorias: {} };
  const cursor = Number((await env.DELSUR.get('cursor')) || 0) % CATEGORIAS.length;
  const [modo, tipo] = CATEGORIAS[cursor];
  const op = modo === 'sales' ? 'venta' : 'arriendo';
  const clave = `${modo}/${tipo}`;
  await env.DELSUR.put('cursor', String(cursor + 1));

  let nombre, cartas, completa, usadas;
  try {
    [nombre, cartas, completa, usadas] = await leerCategoria(modo, tipo);
  } catch (e) {
    est.categorias[clave] = { ok: false, cuando: new Date().toISOString(), error: String(e.message || e).slice(0, 200) };
    await env.DELSUR.put('estado', JSON.stringify({ ...est, ultima: new Date().toISOString() }));
    return;
  }
  // An empty read where there were listings = their site changed or failed: keep the last good copy.
  const mismas = d.propiedades.filter((p) => p.operacion === op && p.tipo === nombre);
  if (!cartas.size && mismas.length) {
    est.categorias[clave] = { ok: false, cuando: new Date().toISOString(), error: `0 propiedades leídas (había ${mismas.length}): se mantiene la última copia` };
    await env.DELSUR.put('estado', JSON.stringify({ ...est, ultima: new Date().toISOString() }));
    return;
  }

  let cambios = 0;
  const porId = new Map(d.propiedades.map((p) => [p.id, p]));
  // Gone from their site → gone from ours. Only after reading the category to the end: a cut read never deletes.
  d.propiedades = d.propiedades.filter((p) => {
    const mia = completa && p.operacion === op && p.tipo === nombre;
    if (mia && !cartas.has(p.id)) { cambios++; return false; }
    return true;
  });
  for (const id of cartas.keys()) { const p = porId.get(id); if (p) p.cat = clave; }
  // New ones: their own page, a point at the comuna's center (referencial), their first photo as the card.
  const nuevas = [...cartas.keys()].filter((id) => !porId.has(id)).slice(0, Math.max(0, PRESUPUESTO - usadas));
  for (const id of nuevas) {
    const p = await leerFicha(id).catch(() => null);
    if (!p) continue;
    const c = centros[p.comuna];
    Object.assign(p, { operacion: op, tipo: nombre, cat: clave, nueva: new Date().toISOString().slice(0, 10) },
      c ? { lat: c[0], lng: c[1], aprox: 'comuna' } : {});
    p.revisada = Date.now();
    d.propiedades.push(p);
    cambios++;
  }
  // Leftover requests: re-check the listings of this category checked longest ago (price, text, photos), from their
  // own page, which is the most complete source.
  let sobran = PRESUPUESTO - usadas - nuevas.length;
  const viejas = d.propiedades.filter((p) => p.cat === clave).sort((a, b) => (a.revisada || 0) - (b.revisada || 0));
  let revisadas = 0;
  for (const p of viejas) {
    if (sobran-- <= 0) break;
    const f = await leerFicha(p.id).catch(() => null);
    if (!f) continue;
    for (const k of ['titulo', 'comuna', 'uf', 'clp', 'construido', 'terreno', 'dormitorios', 'banos', 'descripcion', 'fotos', 'lugar']) {
      if (JSON.stringify(f[k]) !== JSON.stringify(p[k])) { p[k] = f[k]; cambios++; }
    }
    p.revisada = Date.now();
    revisadas++;
  }
  if (revisadas) cambios++;

  est.categorias[clave] = { ok: true, completa, cuando: new Date().toISOString(), nombre, leidas: cartas.size, nuevas: nuevas.length, revisadas,
    pendientes: [...cartas.keys()].filter((id) => !porId.has(id)).length - nuevas.length };
  if (cambios) {
    d.leido = new Date().toISOString().slice(0, 10);
    await env.DELSUR.put('snapshot', JSON.stringify(d));
    memoria = null;
  }
  await env.DELSUR.put('estado', JSON.stringify({ ...est, ultima: new Date().toISOString(), cambios_ultimo: cambios }));
}
