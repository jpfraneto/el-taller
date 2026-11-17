// The sources of the index. Each one: { nombre, web, reclamable, leer(env) → [{ id, url, titulo, region, comuna, m2,
// precio, moneda, fecha, tipo, nota }] }. Only sources we're allowed to read and republish facts from go here.
//
// Checked 2026-11-11 (README "Las fuentes"): chilepropiedades.cl, yapo.cl, goplaceit.com and Portal Inmobiliario /
// MercadoLibre forbid reusing their listings in their terms without written permission, even where robots.txt allows the
// pages. They come in only with that permission (drafts of the requests: ../fuentes-permisos.md). Never before.
import { UA } from './indice.js';

const BN = 'https://licitaciones.mbienes.gob.cl';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function traer(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// Next.js pages ship their data as self.__next_f.push([1,"…"]) string chunks: decode and join them.
export function rsc(html) {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { out += JSON.parse(m[1]); } catch {}
  }
  return out;
}

// The JSON array that follows `"key":[` in a text, read bracket by bracket.
export function arreglo(texto, key) {
  const i = texto.indexOf(`"${key}":[`);
  if (i < 0) return null;
  let j = i + key.length + 4, nivel = 1, enStr = false;   // just past the [
  for (; j < texto.length && nivel; j++) {
    const c = texto[j];
    if (enStr) { if (c === '\\') j++; else if (c === '"') enStr = false; }
    else if (c === '"') enStr = true;
    else if (c === '[') nivel++;
    else if (c === ']') nivel--;
  }
  try { return JSON.parse(texto.slice(i + key.length + 3, j)); } catch { return null; }
}

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
function fechaES(t) {
  const m = String(t || '').toLowerCase().match(/(\d{1,2}) de ([a-zé]+) de (\d{4})/);
  return m && MESES[m[2]] ? `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

// One tender page → the facts the list doesn't have (minimum price, surface, dates). Kept a week in KV.
export function detalleBN(html) {
  // The meta description has the price and date; the deadline is further down the page.
  const txt = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\n/g, '\n');
  return {
    precio: (txt.match(/Valor Comercial M[ií]nimo:\s*([\d.,]+\s*UF)/i) || [])[1] || '',
    superficie: (html.match(/Superficie: (?:<!-- -->)?([^<]+)</) || [])[1] || '',
    fecha: fechaES((txt.match(/Fecha de Publicaci[oó]n:\s*([^\n.]+)/i) || [])[1]),
    recepcion: fechaES((txt.match(/Recepci[oó]n de ofertas:\s*([^\n<]+)/i) || [])[1]),
  };
}

// The open tenders (/licitaciones-actuales): cards in the HTML. Slug, code, title, "comuna, región", modality.
export function actualesBN(html) {
  const out = [];
  for (const m of html.matchAll(/href="\/licitacion\/([a-z0-9-]+)"([\s\S]{0,2500}?)<\/a>/g)) {
    const textos = [...m[2].matchAll(/>([^<>]+)</g)].map((x) => x[1].trim()).filter((x) => x && x !== ',' && !/^<!--/.test(x));
    const cod = textos.find((x) => /^L-\d{4}-S\d-\d+$/.test(x));
    if (!cod) continue;
    const i = textos.indexOf(cod);
    out.push({ slug: m[1], idLicitacion: cod, titulo: textos[i + 1], comuna: textos[i + 2], region: textos[i + 3],
      modalidadOferta: textos.slice(i + 2).find((x) => /^(Venta|Concesi|Arriendo)/.test(x)) || '', estado: 'Abierta' });
  }
  return out;
}

async function leerBN(env) {
  // 1. Everything the map knows (upcoming tenders, with region/comuna/surface) + 2. the ones open today.
  const mapa = arreglo(rsc(await traer(`${BN}/mapa`)), 'licitaciones') || [];
  await espera(1500);
  const abiertas = actualesBN(await traer(`${BN}/licitaciones-actuales`));
  const porSlug = new Map();
  for (const x of mapa) if (x.modalidadOferta === 'Venta' && x.estado === 'Próximamente' && x.visible !== false) porSlug.set(x.slug, x);
  for (const x of abiertas) if (/^Venta/.test(x.modalidadOferta)) porSlug.set(x.slug, { ...porSlug.get(x.slug), ...x });
  // 3. Each tender's page, for the minimum price and dates: at most 25 new pages a run, 1.5 s apart, cached a week.
  let leidas = 0;
  const out = [];
  // This site is about land: apartments, offices, shops, storage and parking units are left out.
  const noEsTerreno = /departamento|depto\.?\s|oficina|local comercial|bodega|estacionamiento/i;
  // Open tenders first: they have a price and a deadline today.
  const orden = [...porSlug].sort(([, a], [, b]) => (b.estado === 'Abierta') - (a.estado === 'Abierta'));
  for (const [slug, x] of orden) {
    if (noEsTerreno.test(x.titulo || '')) continue;
    let d = await env.DB.get(`bn:${slug}`, 'json');
    if ((!d || Date.now() - d.t > 7 * 864e5) && leidas < 25) {
      try {
        await espera(1500);
        d = { ...detalleBN(await traer(`${BN}/licitacion/${slug}`)), t: Date.now() };
        await env.DB.put(`bn:${slug}`, JSON.stringify(d));
      } catch { /* the list's facts are enough for today */ }
      leidas++;
    }
    const abierta = x.estado === 'Abierta';
    out.push({
      id: x.idLicitacion || slug, url: `${BN}/licitacion/${slug}`, titulo: x.titulo,
      region: x.region, comuna: x.comuna, m2: d?.superficie || x.superficie || '',
      lat: x.coordLat, lng: x.coordLng,
      precio: d?.precio || '', moneda: 'UF',
      fecha: d?.fecha || String(x.createdAt || '').replace(/^\$D/, '').slice(0, 10),
      tipo: x.tipoProyecto ? `Terreno fiscal · ${x.tipoProyecto}` : 'Terreno fiscal',
      nota: abierta ? `Licitación abierta${d?.recepcion ? ` · ofertas hasta el ${d.recepcion.split('-').reverse().join('/')}` : ''}`
        : 'Licitación próxima: se publica pronto',
    });
  }
  return out;
}

export const FUENTES = {
  'bienes-nacionales': {
    nombre: 'Bienes Nacionales',
    web: BN,
    reclamable: false,        // state land: nobody claims it, you bid for it
    logo: '/img/fuentes/bienes-nacionales.png',   // its favicon, to say where the listing lives
    que: 'Terrenos del Estado que el Ministerio de Bienes Nacionales vende por licitación pública. Precio = valor mínimo de la licitación.',
    leer: leerBN,
  },
};
