// El Taller · conectar con Meta (una sola app: "El Taller Con JP") y repartir los mensajes a cada servidor.
//
// Conectar (desde el teléfono del dueño, abierto por el QR del panel de su computador):
//   GET  /conectar?s=<sesión>&h=<sha256(secreto)>   la página con los dos botones (public/conectar/index.html)
//   GET  /conectar/config                           lo público que necesita la página (app id, configuraciones)
//   GET  /conectar/instagram?s=&h=                  → login unificado de Meta (Instagram), vuelve a /conectar/vuelta
//   GET  /conectar/vuelta?code=&state=              cambia el código por el token de negocio, busca sus cuentas de Instagram
//   POST /conectar/whatsapp {s,h,code,waba_id,phone_number_id,business_id,app}   Embedded Signup (el código dura 30 s);
//                                                   app: el número ya está en la app WhatsApp Business del teléfono
//   POST /conectar/recoger {s,secreto,cliente?,clave?}   el servidor del dueño recoge lo conectado (una vez)
// Mensajes:
//   GET/POST /meta                                  el webhook de la app (verificación + avisos firmados por Meta)
//   GET  /relay?desde=N   (Authorization: Bearer <clave del cliente>)   el servidor del dueño recibe SUS avisos (espera hasta 25 s)
//
// Secretos del Worker: META_APP_SECRET (lo pone JP), META_VERIFY_TOKEN. Nada de tokens de clientes queda guardado
// aquí más allá de lo que tarda el dueño en recogerlos (la sesión vive 30 minutos y se borra al recoger).


const SESION_TTL = 30 * 60 * 1000;
const json = (d, status = 200) => Response.json(d, { status, headers: { "cache-control": "no-store" } });
const enc = new TextEncoder();

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
const azar = (n = 24) => {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]);
};
const valido = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(s);
const caja = (env, nombre) => env.CAJA.get(env.CAJA.idFromName(nombre));
async function cajaPedir(env, nombre, ruta, datos) {
  const r = await caja(env, nombre).fetch("https://caja" + ruta, datos === undefined ? {} : { method: "POST", body: JSON.stringify(datos) });
  return r.json();
}

async function graph(env, metodo, ruta, token, cuerpo) {
  const v = env.GRAPH_VERSION || "v27.0";
  const url = `${env.GRAPH_BASE || "https://graph.facebook.com"}/${v}/${ruta}`;  // GRAPH_BASE: solo para pruebas locales
  const r = await fetch(url, {
    method: metodo,
    headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(cuerpo ? { "content-type": "application/json" } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || "Meta respondió " + r.status);
  return j;
}
async function cambiarCodigo(env, code, redirect) {
  if (!env.META_APP_SECRET) throw new Error("Falta META_APP_SECRET en el Worker");
  const q = new URLSearchParams({ client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, code });
  if (redirect) q.set("redirect_uri", redirect);
  const j = await graph(env, "GET", "oauth/access_token?" + q);
  if (!j.access_token) throw new Error("Meta no entregó el token");
  return j.access_token;
}

// ───────── conectar ─────────
async function sesionLista(env, s, h) {
  if (!valido(s) || !/^[0-9a-f]{64}$/.test(h || "")) throw new Error("Este enlace no es válido: ábrelo desde el panel de tu computador");
  const d = await cajaPedir(env, "sesion:" + s, "/leer");
  if (d.h && d.h !== h) throw new Error("Este enlace no es válido");
  if (d.creada && Date.now() - d.creada > SESION_TTL) throw new Error("El enlace venció: genera otro en el panel");
  if (!d.h) await cajaPedir(env, "sesion:" + s, "/guardar", { h, creada: Date.now() });
  return d;
}

async function conectar(request, env, url) {
  const p = url.pathname, q = url.searchParams, base = url.origin;
  try {
    if (p === "/conectar/config") {
      return json({ app_id: env.META_APP_ID, ig_config: env.IG_CONFIG_ID || "", wa_config: env.WA_CONFIG_ID || "", version: env.GRAPH_VERSION || "v27.0",
        listo: !!env.META_APP_SECRET });
    }
    if (p === "/conectar/instagram") {
      await sesionLista(env, q.get("s"), q.get("h"));
      if (!env.IG_CONFIG_ID) throw new Error("Instagram todavía no está configurado en El Taller");
      const d = new URLSearchParams({ client_id: env.META_APP_ID, config_id: env.IG_CONFIG_ID, response_type: "code",
        override_default_response_type: "true", redirect_uri: base + "/conectar/vuelta", state: q.get("s") + "." + q.get("h") });
      return Response.redirect("https://www.facebook.com/dialog/oauth?" + d, 302);
    }
    if (p === "/conectar/vuelta") {
      const [s, h] = (q.get("state") || "").split(".");
      const volver = (extra) => Response.redirect(`${base}/conectar?s=${encodeURIComponent(s)}&h=${encodeURIComponent(h)}&${extra}`, 302);
      if (q.get("error")) return volver("error=" + encodeURIComponent(q.get("error_description") || q.get("error")));
      await sesionLista(env, s, h);
      const token = await cambiarCodigo(env, q.get("code") || "", base + "/conectar/vuelta");
      const yo = await graph(env, "GET", "me?fields=client_business_id", token).catch(() => ({}));
      const cuentas = (await graph(env, "GET", "me/assigned_instagram_accounts?fields=id,username", token)).data || [];
      const suscritas = [];
      for (const c of cuentas) {  // que Meta avise de los mensajes de cada cuenta
        try { await graph(env, "POST", `${c.id}/subscribed_apps?subscribed_fields=messages`, token); suscritas.push(c.id); } catch (e) { /* queda en la lista igual */ }
      }
      await cajaPedir(env, "sesion:" + s, "/guardar", { ig: { token, business_id: yo.client_business_id || "", cuentas, suscritas } });
      return volver("listo=instagram");
    }
    if (p === "/conectar/whatsapp" && request.method === "POST") {
      const d = await request.json();
      await sesionLista(env, d.s, d.h);
      const token = await cambiarCodigo(env, d.code || "");
      // The number already lives in the WhatsApp Business app (Meta's "coexistence"): Meta only gives the waba_id, so the
      // number is looked up; and it's NOT registered again (/register is for numbers that aren't on WhatsApp): the app
      // keeps working on the phone and the API answers in parallel.
      const app = d.app === true;
      if (app && /^\d+$/.test(d.waba_id || "") && !/^\d+$/.test(d.phone_number_id || "")) {
        const ns = (await graph(env, "GET", `${d.waba_id}/phone_numbers?fields=id`, token).catch(() => ({}))).data || [];
        d.phone_number_id = ns[0] && ns[0].id;
      }
      if (!/^\d+$/.test(d.waba_id || "") || !/^\d+$/.test(d.phone_number_id || "")) throw new Error("Meta no devolvió el número");
      await graph(env, "POST", `${d.waba_id}/subscribed_apps`, token, {});
      const pin = app ? "" : String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      let registrado = true;
      if (!app) {
        try { await graph(env, "POST", `${d.phone_number_id}/register`, token, { messaging_product: "whatsapp", pin }); } catch (e) { registrado = String(e.message); }
      }
      const num = await graph(env, "GET", `${d.phone_number_id}?fields=display_phone_number,verified_name`, token).catch(() => ({}));
      await cajaPedir(env, "sesion:" + d.s, "/guardar", { wa: { token, waba_id: d.waba_id, phone_number_id: d.phone_number_id, business_id: d.business_id || "",
        numero: num.display_phone_number || "", nombre: num.verified_name || "", pin, registrado, app } });
      return json({ ok: true, numero: num.display_phone_number || "" });
    }
    if (p === "/conectar/estado") {  // para la página: qué quedó conectado (sin tokens)
      const d = await sesionLista(env, q.get("s"), q.get("h"));
      const h_ = d.hechos || [];
      return json({ instagram: [...h_.filter((x) => x.startsWith("@")), ...(d.ig ? d.ig.cuentas.map((c) => "@" + c.username) : [])],
        whatsapp: d.wa ? d.wa.numero : (h_.find((x) => x.startsWith("+")) || ""), recogido: h_.length > 0 && !d.ig && !d.wa });
    }
    if (p === "/conectar/recoger" && request.method === "POST") {
      const d = await request.json();
      if (!valido(d.s)) return json({ error: "sesión" }, 400);
      const ses = await cajaPedir(env, "sesion:" + d.s, "/leer");
      if (!ses.h || !(await igual(await sha256hex(String(d.secreto || "")), ses.h))) return json({ error: "clave" }, 401);
      if (!ses.ig && !ses.wa) return json({ pendiente: true });
      // El cliente (un negocio = un servidor): nuevo, o el que el servidor ya tiene
      let cliente = d.cliente, clave = "";
      if (cliente) {
        const c = await cajaPedir(env, "cliente:" + cliente, "/leer");
        if (!c.clave_h || !(await igual(await sha256hex(String(d.clave || "")), c.clave_h))) return json({ error: "cliente" }, 401);
      } else {
        cliente = azar(18); clave = azar(32);
        await cajaPedir(env, "cliente:" + cliente, "/guardar", { clave_h: await sha256hex(clave), creado: Date.now() });
      }
      const rutas = [];
      if (ses.wa) rutas.push("wa:" + ses.wa.phone_number_id);
      if (ses.ig) for (const c of ses.ig.cuentas) rutas.push("ig:" + c.id);
      for (const r of rutas) await env.RUTAS.put("ruta:" + r, cliente);
      // Lo entregado se borra de la sesión (los tokens no quedan aquí); la sesión sigue viva para lo que falte conectar.
      const hechos = [...(ses.hechos || []), ...(ses.ig ? ses.ig.cuentas.map((c) => "@" + c.username) : []), ...(ses.wa ? [ses.wa.numero || "+"] : [])];
      await cajaPedir(env, "sesion:" + d.s, "/borrar");
      await cajaPedir(env, "sesion:" + d.s, "/guardar", { h: ses.h, creada: ses.creada, hechos });
      return json({ cliente, clave, ig: ses.ig || null, wa: ses.wa || null, rutas });
    }
    if (p === "/conectar" || p === "/conectar/") return env.ASSETS.fetch(new Request(base + "/conectar/", request));
  } catch (e) {
    if (p === "/conectar/instagram" || p === "/conectar/vuelta") {
      return Response.redirect(`${base}/conectar?error=${encodeURIComponent(e.message)}`, 302);
    }
    return json({ error: e.message }, 400);
  }
  return json({ error: "no existe" }, 404);
}

// ───────── webhook de la app y reparto ─────────
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
  // Cada cliente recibe solo sus entradas: WhatsApp por phone_number_id, Instagram por el id de la cuenta.
  const por = new Map();
  const poner = (cliente, entrada) => { if (!por.has(cliente)) por.set(cliente, []); por.get(cliente).push(entrada); };
  for (const e of d.entry || []) {
    if (d.object === "whatsapp_business_account") {
      for (const ch of e.changes || []) {
        const pn = ch.value && ch.value.metadata && ch.value.metadata.phone_number_id;
        // "Conectar WhatsApp" (espacio.js): un mensaje al número de El Taller con su código → ese código queda con este número
        if (env.ELTALLER_WA && ch.value && ch.value.metadata && String(ch.value.metadata.display_phone_number || "").replace(/\D/g, "") === env.ELTALLER_WA) {
          for (const m of ch.value.messages || []) {
            const cod = ((m.text && m.text.body) || "").toUpperCase().match(/\bET-[A-Z0-9]{4}\b/);
            const r = cod && (await env.RUTAS.get("wa-cod:" + cod[0], "json"));
            if (r && !r.numero && m.from) await env.RUTAS.put("wa-cod:" + cod[0], JSON.stringify({ ...r, numero: "+" + String(m.from).replace(/\D/g, "") }), { expirationTtl: 1800 });
          }
        }
        const cliente = pn && (await env.RUTAS.get("ruta:wa:" + pn));
        if (cliente) poner(cliente, { ...e, changes: [ch] });
      }
    } else if (d.object === "instagram") {
      const cliente = await env.RUTAS.get("ruta:ig:" + e.id);
      if (cliente) poner(cliente, e);
    }
  }
  for (const [cliente, entry] of por) await cajaPedir(env, "cliente:" + cliente, "/meter", { object: d.object, entry });
  return new Response("ok");
}

async function relay(request, env, url) {
  const clave = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const cliente = url.searchParams.get("c") || "";
  if (!valido(cliente) || !clave) return json({ error: "clave" }, 401);
  const c = await cajaPedir(env, "cliente:" + cliente, "/leer");
  if (!c.clave_h || !(await igual(await sha256hex(clave), c.clave_h))) return json({ error: "clave" }, 401);
  const desde = Number(url.searchParams.get("desde") || 0) || 0;
  return caja(env, "cliente:" + cliente).fetch(`https://caja/sacar?desde=${desde}&espera=25`);
}

export async function rutaMeta(request, env, url, ctx) {
  if (url.pathname === "/meta") return webhook(request, env, url, ctx);
  if (url.pathname === "/relay") return relay(request, env, url);
  if (url.pathname === "/conectar" || url.pathname.startsWith("/conectar/")) return conectar(request, env, url);
  return null;
}

// ───────── la caja: un Durable Object por sesión y por cliente (datos + cola de avisos) ─────────
export class Caja {
  constructor(state) { this.state = state; this.esperando = []; }
  async fetch(request) {
    const url = new URL(request.url), st = this.state.storage;
    if (url.pathname === "/leer") return Response.json((await st.get("datos")) || {});
    if (url.pathname === "/guardar") {
      const nuevo = await request.json();
      await st.put("datos", { ...((await st.get("datos")) || {}), ...nuevo });
      return Response.json({ ok: true });
    }
    if (url.pathname === "/borrar") { await st.delete("datos"); return Response.json({ ok: true }); }
    if (url.pathname === "/meter") {
      const seq = ((await st.get("seq")) || 0) + 1;
      await st.put({ seq, ["ev:" + String(seq).padStart(12, "0")]: await request.json() });
      const viejos = await st.list({ prefix: "ev:", end: "ev:" + String(Math.max(0, seq - 1000)).padStart(12, "0") });
      if (viejos.size) await st.delete([...viejos.keys()]);
      const w = this.esperando; this.esperando = []; w.forEach((f) => f());
      return Response.json({ ok: true, seq });
    }
    if (url.pathname === "/sacar") {
      const desde = Number(url.searchParams.get("desde") || 0);
      const espera = Math.min(25, Number(url.searchParams.get("espera") || 0)) * 1000;
      const leer = async () => {
        const ev = await st.list({ prefix: "ev:", start: "ev:" + String(desde + 1).padStart(12, "0"), limit: 100 });
        if (desde > 0) {  // lo que el servidor ya recibió se borra
          const vistos = await st.list({ prefix: "ev:", end: "ev:" + String(desde + 1).padStart(12, "0") });
          if (vistos.size) await st.delete([...vistos.keys()]);
        }
        return [...ev.entries()].map(([k, v]) => ({ seq: Number(k.slice(3)), aviso: v }));
      };
      let ev = await leer();
      if (!ev.length && espera) {
        await new Promise((ok) => { const t = setTimeout(ok, espera); this.esperando.push(() => { clearTimeout(t); ok(); }); });
        ev = await leer();
      }
      return Response.json({ eventos: ev, seq: (await st.get("seq")) || 0 });
    }
    return new Response("no", { status: 404 });
  }
}
