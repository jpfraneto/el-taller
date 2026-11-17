// eltaller-agenda: El Taller's posting schedule, in the cloud (see ../wrangler.jsonc).
//
//   GET  /f/<key>          a reel or cover from R2, with Range (Meta downloads from here; keys are unguessable)
//   GET  /cola             the queue                       (Authorization: Bearer CLAVE)
//   POST /cola             add or update items: [{id, video, cover, caption, cuando, user_tags}]   (same)
//   POST /tick             run one tick now                 (same)
//   cron */5               post what's due: one reel at a time, in order of `cuando`
//
// An item goes pendiente → procesando (container created, Meta downloading) → publicado, or error. One step per tick,
// so a tick never waits on Meta; a reel takes 2–3 ticks. The next one starts only when the previous is out (grid order).

const json = (d, s = 200) => new Response(JSON.stringify(d, null, 1), { status: s, headers: { 'content-type': 'application/json' } });

async function leer(env) {
  return JSON.parse((await env.COLA.get('cola')) || '[]');
}
async function guardar(env, cola) {
  await env.COLA.put('cola', JSON.stringify(cola));
}

async function api(env, method, path, params = {}) {
  const host = env.IG_ACCESS_TOKEN.startsWith('IG') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
  const q = new URLSearchParams({ ...params, access_token: env.IG_ACCESS_TOKEN });
  const r = await fetch(`${host}/${env.IG_API_VERSION}/${path}?${q}`, { method });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(d.error || d).slice(0, 300)}`);
  return d;
}

async function avisar(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

async function tick(env, origin) {
  const cola = await leer(env);
  const ahora = Date.now();
  const it = cola.filter((x) => x.estado !== 'publicado' && x.estado !== 'error').sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando))[0];
  if (!it || Date.parse(it.cuando) > ahora) return { nada: true, proximo: it ? `${it.id} ${it.cuando}` : null };
  const uid = env.IG_USER_ID;
  try {
    if (!it.caption || !it.caption.trim()) {          // the captions are JP's: never out empty
      it.nota = 'sin caption';
    } else if (!it.container) {
      const p = { media_type: 'REELS', caption: it.caption, share_to_feed: 'true', video_url: `${origin}/f/${it.video}` };
      if (it.cover) p.cover_url = `${origin}/f/${it.cover}`;
      let c;
      try {
        c = await api(env, 'POST', `${uid}/media`, it.user_tags?.length ? { ...p, user_tags: JSON.stringify(it.user_tags.map((u) => ({ username: u }))) } : p);
      } catch (e) {
        if (!it.user_tags?.length) throw e;
        c = await api(env, 'POST', `${uid}/media`, p);  // Meta refused the tag: post without it
        it.user_tags = [];
      }
      Object.assign(it, { container: c.id, estado: 'procesando', desde: new Date().toISOString() });
    } else {
      const st = await api(env, 'GET', it.container, { fields: 'status_code,status' });
      if (st.status_code === 'FINISHED') {
        const pub = await api(env, 'POST', `${uid}/media_publish`, { creation_id: it.container });
        const link = (await api(env, 'GET', pub.id, { fields: 'permalink' })).permalink;
        Object.assign(it, { estado: 'publicado', media_id: pub.id, permalink: link, at: new Date().toISOString() });
        await avisar(env, `Publicado: ${it.id}\n${link}`);
      } else if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED' || ahora - Date.parse(it.desde) > 40 * 60e3) {
        // one more try with a fresh container, then give up and tell JP
        if (!it.reintento) Object.assign(it, { reintento: true, container: null, estado: 'pendiente', nota: JSON.stringify(st) });
        else { Object.assign(it, { estado: 'error', nota: JSON.stringify(st) }); await avisar(env, `No se pudo publicar ${it.id}: ${it.nota}`); }
      }
    }
  } catch (e) {
    it.nota = String(e.message || e).slice(0, 500);
    it.fallos = (it.fallos || 0) + 1;
    if (it.fallos >= 4) { it.estado = 'error'; await avisar(env, `No se pudo publicar ${it.id}: ${it.nota}`); }
  }
  await guardar(env, cola);
  return it;
}

async function archivo(req, env, key) {
  const range = req.headers.get('range');
  const obj = await env.R.get(key, range ? { range: req.headers } : {});
  if (!obj) return new Response('no', { status: 404 });
  const h = new Headers({ 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
  obj.writeHttpMetadata(h);
  if (range && obj.range) {
    const { offset = 0, length = obj.size - offset } = obj.range;
    h.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    h.set('content-length', String(length));
    return new Response(req.method === 'HEAD' ? null : obj.body, { status: 206, headers: h });
  }
  h.set('content-length', String(obj.size));
  return new Response(req.method === 'HEAD' ? null : obj.body, { headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/f/')) return archivo(req, env, decodeURIComponent(url.pathname.slice(3)));
    if (req.headers.get('authorization') !== `Bearer ${env.CLAVE}`) return json({ error: 'no' }, 401);
    if (url.pathname === '/cola' && req.method === 'GET') return json(await leer(env));
    if (url.pathname === '/cola' && req.method === 'POST') {
      const nuevos = await req.json();
      const cola = await leer(env);
      for (const n of nuevos) {
        const i = cola.findIndex((x) => x.id === n.id);
        if (i >= 0 && cola[i].estado === 'publicado') continue;   // what's out stays out
        const x = { estado: 'pendiente', ...(i >= 0 ? cola[i] : {}), ...n };
        if (i >= 0) cola[i] = x; else cola.push(x);
      }
      await guardar(env, cola);
      return json(cola);
    }
    if (url.pathname === '/tick' && req.method === 'POST') return json(await tick(env, url.origin));
    return json({ error: 'no_existe' }, 404);
  },
  async scheduled(ev, env) {
    await tick(env, 'https://agenda.jpfraneto.com');
  },
};
