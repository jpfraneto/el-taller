// Corredoras: each independent broker is a source of the index, with its own logo and a status:
//   'verificada'  it joined (/corredoras/) and authorized us: its feed or API is read every day
//   'pendiente'   it asked to join; the site owner approves it in the panel
//   'indexada'    we read its public site without asking (robots.txt allows it, its terms don't forbid it): facts + link only
// KV: co:<id> the corredora (its API key never leaves the server) · ix:co-<id> its listings (same shape as every source).
//
// Ways in, all ending in the same item() facts:
//   feed     an XML feed in the Trovit / Mitula format (what most broker software already exports for aggregators)
//   easybroker / tokko   the corredora's own API key for the CRM it already uses
import { UA } from './indice.js';
import { ADAPTADORES, INDEXADAS } from './adaptadores.js';

const ES_TERRENO = /parcela|terreno|sitio|lote|loteo|campo|agr[ií]cola|fundo|hijuela|land|plot|farm|ranch|chacra/i;
const tag = (xml, t) => {
  const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
};
const attr = (xml, t, a) => (xml.match(new RegExp(`<${t}\\s[^>]*${a}="([^"]*)"`, 'i')) || [])[1] || '';
const area = (v, unidad) => {
  const n = Number(String(v || '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0;
  return /ha|hect/i.test(unidad || '') ? n * 10000 : n;
};

// Trovit (<trovit><ad>…) and Mitula (<Mitula><ad>…) share most tags. Only sales of land are kept.
export function leerFeedXML(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<ad>([\s\S]*?)<\/ad>/gi)) {
    const a = m[1];
    const tipo = `${tag(a, 'property_type')} ${tag(a, 'title')}`;
    const op = tag(a, 'type');
    if (op && !/sale|venta|vende/i.test(op)) continue;
    if (!ES_TERRENO.test(tipo)) continue;
    const plot = tag(a, 'plot_area') || tag(a, 'floor_area');
    out.push({
      id: tag(a, 'id'), url: tag(a, 'url'), titulo: tag(a, 'title'),
      region: tag(a, 'region'), comuna: tag(a, 'city') || tag(a, 'city_area'),
      m2: area(plot, attr(a, 'plot_area', 'unit') || attr(a, 'floor_area', 'unit')),
      precio: tag(a, 'price'), moneda: /uf|clf/i.test(attr(a, 'price', 'currency')) ? 'UF' : 'CLP',
      lat: Number(tag(a, 'latitude')) || 0, lng: Number(tag(a, 'longitude')) || 0,
      fecha: tag(a, 'date'),
    });
  }
  return out;
}

// EasyBroker: GET /v1/properties with the broker's key (X-Authorization). Untested until a corredora gives us one.
async function leerEasyBroker(clave) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`https://api.easybroker.com/v1/properties?page=${page}&limit=50&search[statuses][]=published`,
      { headers: { 'X-Authorization': clave, accept: 'application/json', 'user-agent': UA } });
    if (!r.ok) throw new Error(`easybroker ${r.status}`);
    const j = await r.json();
    for (const p of j.content || []) {
      if (!ES_TERRENO.test(`${p.property_type} ${p.title}`)) continue;
      const venta = (p.operations || []).find((o) => o.type === 'sale');
      if (!venta) continue;
      const lugar = String(p.location || '').split(',').map((x) => x.trim());
      out.push({ id: p.public_id, url: p.public_url || `https://www.easybroker.com/cl/listings/${p.public_id}`, titulo: p.title,
        comuna: lugar[lugar.length - 2] || lugar[0] || '', region: lugar[lugar.length - 1] || '',
        m2: Number(p.lot_size) || 0, precio: venta.amount, moneda: /uf|clf/i.test(venta.currency) ? 'UF' : 'CLP', fecha: p.updated_at });
    }
    if (!j.pagination?.next_page) break;
  }
  return out;
}

// Tokko Broker: GET /api/v1/property/?key=… Untested until a corredora gives us a key.
async function leerTokko(clave) {
  const out = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const r = await fetch(`https://www.tokkobroker.com/api/v1/property/?key=${encodeURIComponent(clave)}&format=json&lang=es_ar&limit=100&offset=${offset}`,
      { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error(`tokko ${r.status}`);
    const j = await r.json();
    for (const p of j.objects || []) {
      if (!ES_TERRENO.test(`${p.type?.name} ${p.publication_title}`)) continue;
      const venta = (p.operations || []).find((o) => /sale|venta/i.test(o.operation_type));
      if (!venta) continue;
      const precio = venta.prices?.[0];
      out.push({ id: p.id, url: p.public_url || p.reference_code, titulo: p.publication_title, comuna: p.location?.name || '',
        region: (p.location?.full_location || '').split('|').map((x) => x.trim())[1] || '',
        m2: Number(p.surface || p.total_surface) || 0, precio: precio?.price, moneda: /uf|clf/i.test(precio?.currency) ? 'UF' : 'CLP',
        lat: Number(p.geo_lat) || 0, lng: Number(p.geo_long) || 0, fecha: p.created_at });
    }
    if (!j.meta?.next) break;
  }
  return out;
}

export async function leerCorredora(c, env) {
  if (c.tipo === 'feed' && c.feed) {
    const r = await fetch(c.feed, { headers: { 'user-agent': UA, accept: 'application/xml,text/xml' } });
    if (!r.ok) throw new Error(`feed ${r.status}`);
    return leerFeedXML(await r.text());
  }
  if (c.tipo === 'easybroker' && c.clave) return leerEasyBroker(c.clave);
  if (c.tipo === 'tokko' && c.clave) return leerTokko(c.clave);
  if (c.tipo === 'indexada' && c.adaptador) {
    const a = ADAPTADORES[c.adaptador];
    if (!a) throw new Error(`sin adaptador ${c.adaptador}`);
    return a(c, env);
  }
  return [];
}

export async function listarCorredoras(env, { todas = false } = {}) {
  // The ones we index from their public site come from the code (adaptadores.js); if one joins us itself (co:<id>), that wins.
  const quitadas = new Set((await env.DB.get('co-quitadas', 'json')) || []);
  const out = INDEXADAS.filter((c) => !quitadas.has(c.id)).map((c) => ({ ...c, tipo: 'indexada', estado: 'indexada',
    que: 'Corredora independiente: leemos su web pública (solo datos y el link).' }));
  let cursor;
  do {
    const r = await env.DB.list({ prefix: 'co:', cursor });
    for (const k of r.keys) {
      const c = await env.DB.get(k.name, 'json');
      if (!c || (!todas && c.estado === 'pendiente')) continue;
      const i = out.findIndex((x) => x.id === c.id);
      if (i >= 0) out[i] = c; else out.push(c);
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

// What the public may see of a corredora (never its key or its private WhatsApp).
export const publica = (c) => ({ nombre: c.nombre, web: c.web, logo: c.logo || '', que: c.que || '', reclamable: false,
  verificada: c.estado === 'verificada', estado: c.estado });
