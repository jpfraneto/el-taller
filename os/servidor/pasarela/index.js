// Ruben · la pasarela: lo único del negocio que vive siempre en internet. Va en la cuenta de Cloudflare DEL DUEÑO.
//
// Meta le avisa aquí de cada mensaje que llega al WhatsApp del negocio; la pasarela revisa la firma, lo guarda en una
// cola y se lo pasa al computador del dueño cuando este pregunta (el computador sale a buscar: no abre ningún puerto).
// No piensa, no tiene IA y no decide quién manda: eso lo hace el computador (taller.py). Lo único que hace sola es
// avisarle al dueño, sin IA, si su computador está apagado: "tu mensaje quedó guardado".
//
//   GET  /meta                  verificación del webhook (hub.verify_token = META_VERIFY_TOKEN)
//   POST /meta                  avisos de Meta, firmados con META_APP_SECRET (X-Hub-Signature-256)
//   GET  /relay?desde=N         el computador recibe lo nuevo (Authorization: Bearer <RELAY_CLAVE>), espera hasta 25 s
//   POST /dueno {whatsapp:[…]}  el computador le dice quién es el dueño (para el aviso de apagado), con la misma clave
//   GET  /salud                 "ok"
// Mismo protocolo que el reparto de El Taller (os/web/src/meta.js): taller.py no distingue entre los dos.
//
// Secretos (wrangler secret put, los pone `taller.py pasarela`): META_APP_SECRET, META_VERIFY_TOKEN, RELAY_CLAVE, WA_TOKEN
// Vars: PHONE_NUMBER_ID (solo ese número pasa), GRAPH_VERSION, GRAPH_BASE (solo pruebas), APAGADO_SEG (por defecto 90)

const enc = new TextEncoder();
const json = (d, status = 200) => Response.json(d, { status, headers: { "cache-control": "no-store" } });

async function sha256hex(t) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(t)));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function igual(a, b) {
  const [x, y] = await Promise.all([sha256hex(String(a)), sha256hex(String(b))]);
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0;
}
async function firmaOk(cuerpo, cabecera, secreto) {
  if (!secreto || !cabecera || !cabecera.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const f = new Uint8Array(await crypto.subtle.sign("HMAC", k, cuerpo));
  return igual([...f].map((x) => x.toString(16).padStart(2, "0")).join(""), cabecera.slice(7));
}
const cola = (env) => env.COLA.get(env.COLA.idFromName("cola"));
async function colaPedir(env, ruta, datos) {
  const r = await cola(env).fetch("https://cola" + ruta, datos === undefined ? {} : { method: "POST", body: JSON.stringify(datos) });
  return r.json();
}
async function claveOk(request, env) {
  const clave = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!(env.RELAY_CLAVE && clave && (await igual(clave, env.RELAY_CLAVE)));
}

// El aviso de apagado: solo al dueño, una vez por apagón, y solo si la última vez que el computador preguntó fue
// hace más de APAGADO_SEG. Es un mensaje fijo: la pasarela no inventa nada.
async function avisarApagado(env, de, visto) {
  if (!env.WA_TOKEN || !env.PHONE_NUMBER_ID) return;
  const min = visto ? Math.max(1, Math.round((Date.now() - visto) / 60000)) : 0;
  const cuando = !visto ? "todavía no se ha conectado" : min < 120 ? `no se conecta hace ${min} min` : `no se conecta hace ${Math.round(min / 60)} h`;
  const texto = `Tu computador ${cuando}: puede estar apagado, dormido o sin internet. Tu mensaje quedó guardado y lo veo apenas vuelva. ` +
    "Si no vuelve solo, revisa que esté prendido y enchufado.";
  const v = env.GRAPH_VERSION || "v27.0";
  await fetch(`${env.GRAPH_BASE || "https://graph.facebook.com"}/${v}/${env.PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: "Bearer " + env.WA_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: de, type: "text", text: { body: texto } }),
  }).catch(() => {});
}

function politica(env, ruta) {
  const negocio = (env.NEGOCIO || "este negocio").replace(/[<>&]/g, "");
  const p = ruta === "/privacidad"
    ? [`Política de privacidad · ${negocio}`,
       `Esta aplicación conecta el WhatsApp de ${negocio} con el computador de su dueño. Recibe los mensajes que llegan a ese número para que el dueño los responda o trabaje con ellos.`,
       "Los mensajes pasan por aquí solo hasta que el computador del dueño los recoge; después se borran de este servicio. No se venden, no se comparten con terceros y no se usan para publicidad.",
       `Para preguntar o pedir que se borren tus datos, escríbele a ${negocio} a este mismo WhatsApp.`]
    : [`Borrar tus datos · ${negocio}`,
       `Escríbele a ${negocio} por WhatsApp pidiendo que se borren tus mensajes. Se borran del computador del negocio y te lo confirmamos por el mismo chat. Este servicio no guarda mensajes después de entregarlos.`];
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${p[0]}</title>` +
    `<body style="font:16px/1.5 system-ui;max-width:40em;margin:2em auto;padding:0 1em"><h1>${p[0]}</h1>${p.slice(1).map((x) => `<p>${x}</p>`).join("")}`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function webhook(request, env, url, ctx) {
  if (request.method === "GET") {
    const q = url.searchParams;
    if (q.get("hub.mode") === "subscribe" && env.META_VERIFY_TOKEN && (await igual(q.get("hub.verify_token") || "", env.META_VERIFY_TOKEN))) {
      return new Response(q.get("hub.challenge") || "", { headers: { "content-type": "text/plain" } });
    }
    return new Response("no", { status: 403 });
  }
  if (request.method !== "POST") return new Response("no", { status: 405 });
  const cuerpo = await request.arrayBuffer();
  if (cuerpo.byteLength > 1 << 20) return new Response("no", { status: 413 });
  if (!(await firmaOk(cuerpo, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET))) return new Response("no", { status: 403 });
  let d;
  try { d = JSON.parse(new TextDecoder().decode(cuerpo)); } catch { return new Response("ok"); }
  if (d.object !== "whatsapp_business_account") return new Response("ok");
  const entry = [], remitentes = [];
  for (const e of d.entry || []) {
    for (const ch of e.changes || []) {
      const pn = ch.value && ch.value.metadata && ch.value.metadata.phone_number_id;
      if (env.PHONE_NUMBER_ID && pn !== env.PHONE_NUMBER_ID) continue;  // otro número de la misma cuenta: no es de aquí
      entry.push({ ...e, changes: [ch] });
      for (const m of (ch.value && ch.value.messages) || []) if (m.from) remitentes.push(String(m.from));
    }
  }
  if (!entry.length) return new Response("ok");
  const r = await colaPedir(env, "/meter", { aviso: { object: d.object, entry }, remitentes });
  for (const de of r.avisar || []) ctx.waitUntil(avisarApagado(env, de, r.visto));
  return new Response("ok");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/meta") return webhook(request, env, url, ctx);
    if (url.pathname === "/salud") return new Response("ok", { headers: { "content-type": "text/plain" } });
    // Meta pide estas dos direcciones para publicar la app del dueño (modo Live): las sirve la misma pasarela.
    if (url.pathname === "/privacidad" || url.pathname === "/borrar-datos") return politica(env, url.pathname);
    if (url.pathname === "/relay") {
      if (!(await claveOk(request, env))) return json({ error: "clave" }, 401);
      const desde = Number(url.searchParams.get("desde") || 0) || 0;
      return cola(env).fetch(`https://cola/sacar?desde=${desde}&espera=25`);
    }
    if (url.pathname === "/dueno" && request.method === "POST") {
      if (!(await claveOk(request, env))) return json({ error: "clave" }, 401);
      const d = await request.json().catch(() => ({}));
      const duenos = (Array.isArray(d.whatsapp) ? d.whatsapp : []).map((x) => String(x).replace(/\D/g, "")).filter(Boolean).slice(0, 10);
      return json(await colaPedir(env, "/duenos", { duenos }));
    }
    return new Response("no", { status: 404 });
  },
};

// La cola: un solo Durable Object. Guarda los avisos (hasta 1000), cuándo preguntó el computador por última vez y
// quién es el dueño. Lo que el computador ya recibió se borra en la pregunta siguiente (el cursor "desde").
export class Cola {
  constructor(state, env) { this.state = state; this.env = env; this.esperando = []; }
  async fetch(request) {
    const url = new URL(request.url), st = this.state.storage;
    if (url.pathname === "/duenos") {
      const { duenos } = await request.json();
      await st.put("duenos", duenos);
      return Response.json({ ok: true, duenos });
    }
    if (url.pathname === "/meter") {
      const { aviso, remitentes } = await request.json();
      const seq = ((await st.get("seq")) || 0) + 1;
      await st.put({ seq, ["ev:" + String(seq).padStart(12, "0")]: aviso });
      const viejos = await st.list({ prefix: "ev:", end: "ev:" + String(Math.max(0, seq - 1000)).padStart(12, "0") });
      if (viejos.size) await st.delete([...viejos.keys()]);
      const despierto = this.esperando.length > 0;
      const w = this.esperando; this.esperando = []; w.forEach((f) => f());
      // ¿Apagado? Nadie esperando ahora y la última pregunta fue hace rato. Se avisa una vez por apagón.
      const visto = (await st.get("visto")) || 0, duenos = (await st.get("duenos")) || [];
      const limite = Number(this.env.APAGADO_SEG || 90) * 1000;
      let avisar = [];
      if (!despierto && Date.now() - visto > limite && !(await st.get("avisado"))) {
        avisar = [...new Set(remitentes.filter((x) => duenos.includes(x)))];
        if (avisar.length) await st.put("avisado", true);
      }
      return Response.json({ ok: true, seq, visto, avisar });
    }
    if (url.pathname === "/sacar") {
      await st.put({ visto: Date.now(), avisado: false });  // el computador está aquí
      const desde = Number(url.searchParams.get("desde") || 0);
      const espera = Math.min(25, Number(url.searchParams.get("espera") || 0)) * 1000;
      const leer = async () => {
        const ev = await st.list({ prefix: "ev:", start: "ev:" + String(desde + 1).padStart(12, "0"), limit: 100 });
        if (desde > 0) {
          const vistos = await st.list({ prefix: "ev:", end: "ev:" + String(desde + 1).padStart(12, "0") });
          if (vistos.size) await st.delete([...vistos.keys()]);
        }
        return [...ev.entries()].map(([k, v]) => ({ seq: Number(k.slice(3)), aviso: v }));
      };
      let ev = await leer();
      if (!ev.length && espera) {
        await new Promise((ok) => { const t = setTimeout(ok, espera); this.esperando.push(() => { clearTimeout(t); ok(); }); });
        ev = await leer();
        await st.put("visto", Date.now());
      }
      return Response.json({ eventos: ev, seq: (await st.get("seq")) || 0 });
    }
    return new Response("no", { status: 404 });
  }
}
