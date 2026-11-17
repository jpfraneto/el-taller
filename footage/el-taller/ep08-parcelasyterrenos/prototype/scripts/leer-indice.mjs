#!/usr/bin/env node
// Reads the index sources from this computer (in Chile) and uploads the facts to the site.
// Why here and not in the Worker's cron: licitaciones.mbienes.gob.cl doesn't answer Cloudflare's network (522), it does
// answer a Chilean connection. Same code as the Worker (src/fuentes.js), same rules (src/indice.js: facts only, no people).
//
// usage: node scripts/leer-indice.mjs [fuente]        (from prototype/; the launchd agent runs it every day at 06:00)
// env:   SITIO (default https://parcelasyterrenos.jpfraneto.com) · the key comes from ../.panel_key
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUENTES } from '../src/fuentes.js';
import { item, ubicar } from '../src/indice.js';
import { INDEXADAS } from '../src/adaptadores.js';
import { leerCorredora } from '../src/corredoras.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SITIO = process.env.SITIO || 'https://parcelasyterrenos.jpfraneto.com';
const CLAVE = fs.readFileSync(path.join(AQUI, '../../.panel_key'), 'utf8').trim();
const CACHE = path.join(AQUI, '../.cache-indice.json');

// The sources keep small notes between runs (e.g. each tender's price, read once a week): a JSON file plays KV here.
const notas = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const env = { DB: {
  get: async (k, tipo) => (k in notas ? (tipo === 'json' ? notas[k] : JSON.stringify(notas[k])) : null),
  put: async (k, v) => { notas[k] = typeof v === 'string' ? JSON.parse(v) : v; fs.writeFileSync(CACHE, JSON.stringify(notas)); },
} };

const solo = process.argv[2];
// The state's land + the corredoras whose sites are read page by page (mac: true); the rest the Worker reads by itself.
const LENTAS = Object.fromEntries(INDEXADAS.filter((c) => c.mac).map((c) => [`co-${c.id}`, { leer: (e) => leerCorredora({ ...c, tipo: 'indexada' }, e) }]));
for (const [f, src] of Object.entries({ ...FUENTES, ...LENTAS })) {
  if (solo && f !== solo) continue;
  const t0 = Date.now();
  try {
    const items = await ubicar(env, (await src.leer(env)).map((x) => item(f, x)).filter((x) => x.url && x.titulo), 250);
    const r = await fetch(`${SITIO}/api/panel/indice/subir`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-clave': CLAVE, 'user-agent': 'ParcelasYTerrenos-mac/1.0' },
      body: JSON.stringify({ fuente: f, items }),
    });
    console.log(new Date().toISOString(), f, items.length, 'leídas →', r.status, await r.text(), `${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (e) {
    console.log(new Date().toISOString(), f, 'ERROR', e.message);
  }
}
