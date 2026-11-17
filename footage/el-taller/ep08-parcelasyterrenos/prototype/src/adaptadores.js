// One small reader per platform that several corredoras share, for the ones whose public site we may index WITHOUT
// asking: robots.txt allows what we read and their terms don't forbid reuse (checked one by one on 2026-11-11, the
// details in ../fuentes-permisos.md). We ask their own public WordPress API only for FACT fields (_fields=…): never
// agents, owners, phones, photos or descriptions. ≥2 s between requests, a User-Agent that says who we are.
// Each returns { id, url, titulo, region, comuna, m2, precio, moneda, lat, lng, fecha }.
import { UA } from './indice.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const uno = (v) => (Array.isArray(v) ? v[0] : v) ?? '';

async function json(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 80)}`);
  return r.json();
}

// All pages of a WP REST collection (100 per page), politely.
async function todasLasPaginas(base) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const sep = base.includes('?') ? '&' : '?';
    const r = await fetch(`${base}${sep}per_page=100&page=${page}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (r.status === 400 && page > 1) break;                   // WP: past the last page
    if (!r.ok) throw new Error(`${r.status} ${base.slice(0, 80)}`);
    const lote = await r.json();
    out.push(...lote);
    if (lote.length < 100 || page >= Number(r.headers.get('x-wp-totalpages') || 1)) break;
    await espera(2000);
  }
  return out;
}

const nombres = async (web, tax) => Object.fromEntries((await json(`${web}/wp-json/wp/v2/${tax}?per_page=100&_fields=id,name`).catch(() => [])).map((t) => [t.id, t.name]));

// "Tomé, Provincia de Concepción, Región del Biobío, Chile" → comuna + región
function direccion(a) {
  const partes = String(a || '').split(',').map((x) => x.trim()).filter(Boolean);
  return { comuna: partes.find((x) => !/provincia|regi[oó]n|chile/i.test(x)) || '', region: partes.find((x) => /regi[oó]n/i.test(x)) || '' };
}

// RealHomes theme (Home Key, Ketterer…): post type + taxonomies differ per site, set in cfg.
async function wpRealHomes(c) {
  const { web, ruta, tipoTax, tipos, estadoTax, venta } = c.cfg;
  // RealHomes fills property_meta only when the whole item is asked for (_fields empties it): it comes whole, and only
  // the facts below are kept. Comuna names from its own "ciudad" taxonomy when it has one.
  const lista = await todasLasPaginas(`${web}/wp-json/wp/v2/${ruta}?${tipoTax}=${tipos.join(',')}`);
  const ciudades = c.cfg.ciudadTax ? await nombres(web, c.cfg.ciudadTax) : {};
  return lista.filter((p) => (p[estadoTax] || []).some((e) => venta.includes(e))).map((p) => {
    const m = p.property_meta || {};
    const porM2 = /x\s*m|por\s*m|\/\s*m/i.test(m.REAL_HOMES_property_price_postfix || '');     // a price per m² isn't the price
    const lote = m.REAL_HOMES_property_lot_size || m.REAL_HOMES_property_size;
    const unidad = m.REAL_HOMES_property_lot_size ? m.REAL_HOMES_property_lot_size_postfix : m.REAL_HOMES_property_size_postfix;
    const loc = m.REAL_HOMES_property_location || {};
    const d = direccion(m.REAL_HOMES_property_address);
    if (!d.comuna && c.cfg.ciudadTax) d.comuna = ciudades[(p[c.cfg.ciudadTax] || [])[0]] || '';
    return { id: p.id, url: p.link, titulo: texto(p.title?.rendered), comuna: d.comuna, region: d.region || d.comuna || texto(p.title?.rendered),
      m2: lote ? `${lote} ${/ha|hect/i.test(unidad || '') ? 'ha' : 'm2'}` : '', precio: porM2 ? '' : m.REAL_HOMES_property_price,
      moneda: /uf/i.test(m.REAL_HOMES_property_price_prefix || '') ? 'UF' : 'CLP',
      lat: Number(loc.latitude) || 0, lng: Number(loc.longitude) || 0, fecha: p.modified };
  });
}

// Houzez theme (Lorca…): the land kinds and "for sale" ids per site, region/comuna names from its own taxonomies.
async function wpHouzez(c) {
  const { web, terrenoTax, terrenos, ventaTax, venta } = c.cfg;
  const campos = `id,link,title,modified,property_state,property_city,${terrenoTax},${ventaTax},property_meta.fave_property_price,property_meta.fave_currency,property_meta.fave_property_land,property_meta.fave_property_land_postfix,property_meta.houzez_geolocation_lat,property_meta.houzez_geolocation_long,property_meta.fave_property_map_address`;
  const [lista, estados, ciudades] = [await todasLasPaginas(`${web}/wp-json/wp/v2/properties?${terrenoTax}=${terrenos.join(',')}&${ventaTax}=${venta.join(',')}&_fields=${campos}`),
    await nombres(web, 'property_state'), await nombres(web, 'property_city')];
  return lista.map((p) => {
    const m = p.property_meta || {};
    const comuna = ciudades[(p.property_city || [])[0]] || String(uno(m.fave_property_map_address)).split(',')[0];
    return { id: p.id, url: p.link, titulo: texto(p.title?.rendered), comuna, region: estados[(p.property_state || [])[0]] || comuna,
      m2: uno(m.fave_property_land) ? `${uno(m.fave_property_land)} ${/ha|hect/i.test(uno(m.fave_property_land_postfix)) ? 'ha' : 'm2'}` : '',
      precio: uno(m.fave_property_price), moneda: /uf/i.test(uno(m.fave_currency)) ? 'UF' : 'CLP',
      lat: Number(uno(m.houzez_geolocation_lat)) || 0, lng: Number(uno(m.houzez_geolocation_long)) || 0, fecha: p.modified };
  });
}

// Sites without an API: list pages → each listing's page, where the facts are read from its JSON-LD (schema.org) and a
// few patterns per site. Slow on purpose (cfg.pausa between pages, their crawl-delay if any): runs from the Mac (mac: true).
async function html(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 80)}`);
  return r.text();
}
function jsonld(h) {
  for (const m of h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); for (const x of [j, ...(j['@graph'] || [])]) if (/RealEstateListing|Product|Residence|Place|Offer/.test(String(x['@type']))) return x; } catch {}
  }
  return {};
}
async function listaYDetalle(c) {
  const { listas, enlace, paginas = 5, pausa = 2500, precio, superficie, coords, comuna: rComuna } = c.cfg;
  const urls = new Set();
  for (const base of listas) {
    for (let n = 1; n <= paginas; n++) {
      const h = await html(base.replace('{n}', n));
      const antes = urls.size;
      for (const m of h.matchAll(new RegExp(enlace, 'g'))) urls.add(new URL(m[1], c.cfg.web).href);
      await espera(pausa);
      if (urls.size === antes || !base.includes('{n}')) break;
    }
  }
  const out = [];
  for (const u of urls) {
    try {
      const h = await html(u);
      const ld = jsonld(h);
      const t = texto(h);
      const pr = (t.match(new RegExp(precio, 'i')) || [])[1] || '';
      const co = coords ? h.match(new RegExp(coords)) : null;
      out.push({ id: u.split('/').filter(Boolean).pop(), url: u, titulo: texto(ld.name) || texto((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]),
        comuna: ld.address?.addressLocality || (rComuna ? (t.match(new RegExp(rComuna, 'i')) || [])[1] : '') || '',
        region: ld.address?.addressRegion || '', m2: (t.match(new RegExp(superficie, 'i')) || [])[1] ? `${(t.match(new RegExp(superficie, 'i')))[1]} ${/ha/i.test((t.match(new RegExp(superficie, 'i')))[0]) ? 'ha' : 'm2'}` : '',
        precio: pr, moneda: /uf/i.test(pr) ? 'UF' : 'CLP', lat: co ? Number(co[1]) : 0, lng: co ? Number(co[2]) : 0,
        fecha: ld.datePosted || '' });
    } catch (e) { console.log('detalle', u, e.message); }
    await espera(pausa);
  }
  return out;
}

// Daniel Carrasco (Valdivia): its own public JSON (the one its site reads). Land for sale, not sold, not hidden.
async function dcApi(c) {
  const j = await json(`${c.cfg.web}/wp-json/danielcarrasco/v1/properties`);
  return (j.properties || []).filter((p) => /parcela|sitio|terreno|campo|lote/i.test(p.type) && /venta/i.test(p.category) && !p.is_sold && !p.is_hidden)
    .map((p) => ({ id: p.id, url: new URL(p.url, c.cfg.web).href, titulo: texto(p.title),
      comuna: String(p.address || '').split(',').map((x) => x.trim()).filter((x) => x && !/^chile$|regi[oó]n/i.test(x)).pop() || p.location, region: '',
      m2: p.lot_size || p.area || 0, precio: p.price, moneda: /uf/i.test(p.currency) ? 'UF' : 'CLP', lat: Number(p.latitude) || 0, lng: Number(p.longitude) || 0 }));
}

// Victoria Monsalve (Valdivia): its public API, sales of parcels and land. The agent object (a person) is never read.
async function vmApi(c) {
  const out = [];
  for (const tipo of ['parcel', 'land', 'plot', 'agricultural']) {
    for (let page = 1; page <= 10; page++) {
      const j = await json(`${c.cfg.web}/api/properties?operation_type=sale&property_type=${tipo}&page_size=60&page=${page}`);
      for (const p of j.data || []) {
        if (p.status && p.status !== 'published') continue;
        out.push({ id: p.id, url: `${c.cfg.web}/propiedades/${p.slug}`, titulo: texto(p.title), comuna: p.city, region: p.region,
          m2: p.total_area || 0, precio: p.show_price === false ? '' : p.price, moneda: /uf|clf/i.test(p.currency) ? 'UF' : 'CLP',
          lat: Number(p.latitude) || 0, lng: Number(p.longitude) || 0, fecha: p.updated_at || p.published_at });
      }
      if (page >= (j.total_pages || 1)) break;
      await espera(2000);
    }
    await espera(2000);
  }
  return out;
}

// Convecta / Prop360 (the CRM behind Nieny, Asegen, Ahumada, VS, Kolbach, Greene…): open the listing page (it gives a
// session), then ask its own listing endpoint page by page. The cards carry id, comuna ("Parcela en Retiro"), price in
// $ and UF and m²; the agent's name on each card is skipped. Coordinates aren't on the cards: the comuna places the pin.
async function convecta(c) {
  const { web, terreno = 'Terreno_Construccion', sectores = false } = c.cfg;
  const tipos = [['Parcela', 14], ['Sitio', 4], [terreno, 16]];
  const out = new Map();
  for (const [ruta, tpro] of tipos) {
    const pagina = `${web}/${ruta}/Venta/Todas_las_comunas${sectores ? '/Todos_los_sectores' : ''}`;
    const r0 = await fetch(pagina, { headers: { 'user-agent': UA }, redirect: 'manual' });
    const galleta = (r0.headers.getSetCookie?.() || [r0.headers.get('set-cookie') || '']).map((x) => x.split(';')[0]).filter(Boolean).join('; ');
    await espera(2000);
    for (let pagi = 1, ultima = 1; pagi <= Math.min(ultima, 40); pagi++) {
      // Every version's parameters at once (v01 sends sect/proy, v03 dest/esta/amob/pisc): unknown ones are ignored.
      const q = new URLSearchParams({ acci: 'listadoPropiedades', oper: 1, tpro, regi: 0, comu: 0, sect: 0, orde: 1, pagi, tlis: 1, pred: 0, preh: 0, divi: 1, dorm: 0, bath: 0, proy: 0, dest: 0, esta: 0, amob: 0, pisc: 0, vend: 0, arri: 0, medi: 0, cache: Math.random() * 10 });
      const r = await fetch(`${web}/recursos/publico.ashx?${q}`, { headers: { 'user-agent': UA, cookie: galleta, referer: pagina, 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' } });
      if (!r.ok) throw new Error(`${r.status} convecta ${web}`);
      let j = await r.json();
      j = Array.isArray(j) ? j[0] : j;
      if (!j || j.error === 'si') break;
      ultima = Math.max(1, ...[...String(j.paginador || '').matchAll(/data-pagina='(\d+)'/g)].map((m) => Number(m[1])));
      // One card per property image (alt='<id>'): the card templates differ by site, the image is always there.
      const html = String(j.listing || '');
      const imgs = [...html.matchAll(/<img[^>]*alt='(\d+)'/g)];
      for (const [n, m] of imgs.entries()) {
        const id = m[1];
        const card = html.slice(m.index, imgs[n + 1]?.index ?? html.length);
        const href = [null, (html.match(new RegExp(`href='([^'?]*/${id})(?:\\?[^']*)?'`)) || [])[1]];   // page 2+ adds ?pagi=N
        if (!id || out.has(id)) continue;
        const titulo = texto((card.match(/<h[34][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
        const uf = (card.match(/UF\s?([\d.,]+)/) || [])[1];
        const clp = (card.match(/\$\s?([\d.]{5,})/) || [])[1];
        if (!href[1]) continue;
        out.set(id, { id, url: new URL(href[1], web).href, titulo: titulo || `${ruta.replace(/_/g, ' ')} en venta`,
          comuna: (titulo.match(/ en (.+)$/) || [])[1] || '', region: '',
          m2: ((card.match(/([\d.,]+)\s?m<sup>2/) || [])[1] || '').replace(/\./g, '') + ' m2',
          precio: clp ? `$ ${clp}` : uf ? `UF ${uf}` : '', moneda: clp ? 'CLP' : 'UF' });
      }
      await espera(2000);
    }
  }
  return [...out.values()];
}

// Del Sur Propiedades (Puerto Varas): its own site (CakePHP). The first 6 cards come with the page, the rest with its
// "load more" (POST /propertytypes/loadpage). Every card has id, title, comuna, UF and $, m²: no detail pages needed.
async function delSur(c) {
  const web = c.cfg.web;
  const out = new Map();
  const leer = (h) => {
    let nuevas = 0;
    for (const m of h.matchAll(/data-url="([^"]*\/properties\/view\/(\d+))"([\s\S]*?)(?=data-url="|$)/g)) {
      const [, url, id, card] = m;
      if (out.has(id)) continue;
      const titulo = texto((card.match(/<h3 class="title-property">([\s\S]*?)<br>/) || [])[1]);
      const comuna = texto((card.match(/<h4>\s*([^<]+)<br>/) || [])[1]);
      const uf = (card.match(/UF\s?([\d.,]+)/) || [])[1];
      const clp = (card.match(/\$\s?([\d.]{5,})/) || [])[1];
      out.set(id, { id, url, titulo: titulo || 'Parcela', comuna, region: 'Los Lagos', m2: (card.match(/<h6>([^<]*m²)<\/h6>/) || [])[1] || '',
        precio: uf ? `UF ${uf}` : clp ? `$ ${clp}` : '', moneda: uf ? 'UF' : 'CLP' });
      nuevas++;
    }
    return nuevas;
  };
  for (const tipo of c.cfg.tipos) {
    const r0 = await fetch(`${web}/propertytypes/sales/${tipo}`, { headers: { 'user-agent': UA } });
    const galleta = (r0.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
    leer(await r0.text());
    for (let page = 2; page <= 60; page++) {
      await espera(2000);
      const r = await fetch(`${web}/propertytypes/loadpage`, { method: 'POST', headers: { 'user-agent': UA, cookie: galleta, 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', referer: `${web}/propertytypes/sales/${tipo}` },
        body: new URLSearchParams({ propertytype: tipo, page, type: 'recents', modalitytype_id: 1, moneda: 'uf' }) });
      if (!r.ok || !leer(await r.text())) break;
    }
    await espera(2000);
  }
  return [...out.values()];
}

export const ADAPTADORES = { delsur: delSur, 'wp-realhomes': wpRealHomes, 'wp-houzez': wpHouzez, 'lista-detalle': listaYDetalle, 'dc-api': dcApi, 'vm-api': vmApi, convecta };

// The corredoras we index from their public site (estado 'indexada': no "verificada" badge until they join themselves).
// Their logo is their own favicon/logo, to say where the listing lives. Any of them can ask to be removed (/fuentes/).
export const INDEXADAS = [
  { id: 'lorca', nombre: 'Lorca Corredores', web: 'https://www.lorcacorredores.cl', comuna: 'Concepción',
    logo: 'https://www.lorcacorredores.cl/wp-content/uploads/2026/09/lorca-favicon.png', adaptador: 'wp-houzez',
    cfg: { web: 'https://www.lorcacorredores.cl', terrenoTax: 'property_status', terrenos: [1503, 1740, 1748], ventaTax: 'property_type', venta: [1746] } },
  { id: 'homekey', nombre: 'Home Key Propiedades', web: 'https://homekeypropiedades.cl', comuna: 'Concepción',
    logo: 'https://homekeypropiedades.cl/favicon.ico', adaptador: 'wp-realhomes',
    cfg: { web: 'https://homekeypropiedades.cl', ruta: 'properties', tipoTax: 'tipos-propiedad', tipos: [8, 9], estadoTax: 'estatus-propiedad', venta: [29], ciudadTax: 'ciudades-propiedad' } },
  { id: 'ketterer', nombre: 'Ketterer Propiedades', web: 'https://kettererpropiedades.cl', comuna: 'Temuco',
    logo: 'https://kettererpropiedades.cl/favicon.ico', adaptador: 'wp-realhomes',
    cfg: { web: 'https://kettererpropiedades.cl', ruta: 'propiedad', tipoTax: 'tipo-propiedad', tipos: [76, 62], estadoTax: 'estado-propiedad', venta: [30], ciudadTax: 'propiedad-ubicacion' } },
  { id: 'patriciogidi', nombre: 'Patricio Gidi Propiedades', web: 'https://www.patriciogidi.com', comuna: 'Villarrica',
    logo: 'https://www.patriciogidi.com/images/logo-mark.png', adaptador: 'lista-detalle', mac: true,
    cfg: { web: 'https://www.patriciogidi.com', listas: ['https://www.patriciogidi.com/propiedades?tipo=parcela&page={n}', 'https://www.patriciogidi.com/propiedades?tipo=terreno&page={n}'],
      enlace: 'href="((?:https://www\\.patriciogidi\\.com)?/propiedades/[a-z0-9-]+)"', paginas: 4,
      precio: '(UF\\s?[\\d.,]+|\\$\\s?[\\d.]{6,})', superficie: '([\\d.,]+)\\s?(?:m²|m2|ha)\\s?(?:de\\s)?terreno', coords: 'maps\\.google\\.com/\\?q=(-?[\\d.]+),\\s?(-?[\\d.]+)' } },
  { id: 'danielcarrasco', nombre: 'Daniel Carrasco Propiedades', web: 'https://danielcarrascopropiedades.cl', comuna: 'Valdivia',
    logo: 'https://danielcarrascopropiedades.cl/wp-content/uploads/2023/05/LogoDanielCarrascoPropiedades-1.png', adaptador: 'dc-api',
    cfg: { web: 'https://danielcarrascopropiedades.cl' } },
  { id: 'victoriamonsalve', nombre: 'Victoria Monsalve Propiedades', web: 'https://victoriamonsalvepropiedades.com', comuna: 'Valdivia',
    logo: 'https://victoriamonsalvepropiedades.com/vm-icon.png', adaptador: 'vm-api', cfg: { web: 'https://victoriamonsalvepropiedades.com' } },
  { id: 'corretajeschiloe', nombre: 'Corretajes Chiloé', web: 'https://corretajeschiloe.cl', comuna: 'Castro',
    logo: 'https://corretajeschiloe.cl/wp-content/uploads/2024/02/logo.png', adaptador: 'wp-houzez',
    cfg: { web: 'https://corretajeschiloe.cl', terrenoTax: 'property_type', terrenos: [62, 72, 76, 75], ventaTax: 'property_status', venta: [63] } },
  { id: 'mendez', nombre: 'Corredora Méndez', web: 'https://corredoramendez.cl', comuna: 'Puerto Montt',
    logo: 'https://corredoramendez.cl/wp-content/uploads/2021/04/logo-mendez-web.png', adaptador: 'wp-houzez',
    cfg: { web: 'https://corredoramendez.cl', terrenoTax: 'property_type', terrenos: [83, 108, 107], ventaTax: 'property_status', venta: [110] } },
  { id: 'ichiloe', nombre: 'Inmobiliaria Chiloé', web: 'https://www.ichiloe.cl', comuna: 'Ancud',
    logo: 'https://www.ichiloe.cl/propiedades/wp-content/uploads/2019/11/ichiloe_logo_lb_mobile.png', adaptador: 'wp-realhomes',
    cfg: { web: 'https://www.ichiloe.cl/propiedades', ruta: 'propiedad', tipoTax: 'tipo-propiedad', tipos: [45, 70], estadoTax: 'estado-propiedad', venta: [30] } },
  { id: 'nieny', nombre: 'Nieny Gestión Inmobiliaria', web: 'https://nieny.cl', comuna: 'Rancagua', logo: 'https://nieny.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://nieny.cl', terreno: 'Terreno_Construccion', sectores: true } },
  { id: 'asegen', nombre: 'Asegen Propiedades', web: 'https://www.asegenpropiedades.cl', comuna: 'Copiapó', logo: 'https://www.asegenpropiedades.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://www.asegenpropiedades.cl', terreno: 'Terreno_Construccion_', sectores: false } },
  { id: 'ahumada', nombre: 'Ahumada Propiedades', web: 'https://www.ahumadapropiedades.cl', comuna: 'Coyhaique', logo: 'https://www.ahumadapropiedades.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://www.ahumadapropiedades.cl', terreno: 'Terreno_Construccion', sectores: true } },
  { id: 'vs', nombre: 'VS Propiedades', web: 'https://www.vspropiedades.cl', comuna: 'Punta Arenas', logo: 'https://www.vspropiedades.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://www.vspropiedades.cl', terreno: 'Terreno_Construccion_', sectores: false } },
  { id: 'kolbach', nombre: 'Kolbach Propiedades', web: 'https://www.kolbachpropiedades.cl', comuna: 'Las Condes', logo: 'https://www.kolbachpropiedades.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://www.kolbachpropiedades.cl', terreno: 'Terreno_Construccion_', sectores: false } },
  { id: 'greene', nombre: 'Greene Propiedades', web: 'https://www.greenepropiedades.cl', comuna: 'Las Condes', logo: 'https://www.greenepropiedades.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://www.greenepropiedades.cl', terreno: 'Terreno_Construccion_', sectores: false } },
  { id: 'theowl', nombre: 'The Owl Real Estate', web: 'https://www.theowlrealestate.cl', comuna: 'Lo Barnechea', logo: 'https://www.theowlrealestate.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://www.theowlrealestate.cl', terreno: 'Terreno_Construccion_', sectores: false } },
  { id: 'bailey', nombre: 'Bailey Propiedades', web: 'https://www.baileypropiedades.cl', comuna: 'Concón', logo: 'https://www.baileypropiedades.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://www.baileypropiedades.cl', terreno: 'Terreno_Construccion_', sectores: false } },
  { id: 'mshouse', nombre: 'MSHouse', web: 'https://www.mshouse.cl', comuna: 'Talagante', logo: 'https://www.mshouse.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://www.mshouse.cl', terreno: 'Terreno_Construccion_', sectores: false } },
  { id: 'inhouse', nombre: 'In House Propiedades', web: 'https://inhousepropiedades.cl', comuna: 'Curacaví', logo: 'https://inhousepropiedades.cl/assets/img/favIcon/android-icon-192x192.png', adaptador: 'convecta', mac: true,
    cfg: { web: 'https://inhousepropiedades.cl', terreno: 'Terreno_Construccion', sectores: false } },
  { id: 'delsur', nombre: 'Del Sur Propiedades', web: 'https://www.delsurpropiedades.cl', comuna: 'Puerto Varas',
    logo: 'https://www.delsurpropiedades.cl/assets/img/new-web/home/Logotipo.png', adaptador: 'delsur', mac: true,
    cfg: { web: 'https://www.delsurpropiedades.cl', tipos: [3, 4, 5] } },
];
