// El Taller · tu espacio (los 30 días con JP): entrar con WhatsApp, dejar tu contexto, elegir tu día 1 y pagar.
//
// Entrar (sin contraseña: tu WhatsApp es la llave):
//   (no hay cómo pedir entrar: JP, 2026-11-11. Se entra pagando — el pago aprobado + el secreto del navegador —
//    o con el enlace que manda JP. La sesión es la cookie __Host-et.)
//   GET  /api/entrar/link?l=<token>     → el enlace que manda JP (os/clientes.py): sirve una vez, salvo --varias
//   POST /api/salir
// Tu espacio (cookie "et"):
//   GET  /api/yo                        → cuenta, contexto, reserva y los días que se pueden elegir
//   POST /api/yo {nombre, negocio, instagram}
//   POST /api/contexto/archivo  (cuerpo = el archivo; x-nombre, content-type)   → R2 CONTEXTO, cuentas/<id>/…
//   POST /api/contexto/subida/{inicio,fin} + PUT /api/contexto/subida/parte     → lo grande (videos), en partes
//   POST /api/contexto/nota {texto}     (texto o un link)
//   DELETE /api/contexto?id=
//   GET  /api/contexto/ver?id=          → el archivo (solo su dueño)
//   POST /api/pagar {inicio, hora}      → Mercado Pago (preferencia con la fecha adentro) → { url }
//   POST /api/pago/verificar {pago}     → al volver de Mercado Pago
//   POST /api/mp                        → aviso de Mercado Pago (lo que manda es la consulta a su API, no el aviso)
//   GET  /api/cupos                     → público: {cupos, disponibles (para partir mañana), proximo, gente}
//   POST /api/semilla {codigo}          → el código de instalación (de su espacio, ya pagado): sirve UNA vez, 7 días.
//                                         Devuelve su negocio + la lista de su contexto + una llave para ese computador.
//   GET  /api/semilla/estado            (Authorization: Bearer <llave>) → su contexto de nuevo (el panel sincroniza)
//   GET  /api/semilla/archivo?id=       (Bearer <llave>) → un archivo de su contexto
//   POST /api/instalar/codigo           (con sesión, pagado) → otro código (el anterior deja de servir)
//   admin: POST /api/admin/codigo {id} · POST /api/admin/subir?id=&nombre= (cuerpo = archivo) · POST /api/admin/nota {id, texto}
//   GET  /api/perfil?slug=<instagram>   → público: el perfil de un negocio de El Taller (solo si dijo que sí: publico)
//   GET  /api/foto/<id>                 → público: su foto (si subió una y es público)
// JP (Authorization: Bearer ADMIN_CLAVE, desde os/clientes.py):
//   GET /api/admin/cuentas · POST /api/admin/enlace {telefono|id, nombre?, negocio?, prototipo?, prototipo_titulo?} · POST /api/admin/confirmar {id} · POST /api/admin/borrar {id}
//   GET /api/admin/archivo?id=&a=
//
// Una vez pagado, la fecha queda fija. Así lo quiere JP: "once we start, we start. once he schedules, it is scheduled."

import { DurableObject } from "cloudflare:workers";

const CUPOS = 6;
const PRECIO = 1500000;
const DIAS = 30;
const HORAS = ["10:00", "15:00"];         // el kickoff del día 1: dos horas, sin apuro
const VENTANA_DIAS = 60;                    // qué tan lejos se puede elegir el día 1
const SESION_DIAS = 120;
const MAX_ARCHIVO = 95 * 1024 * 1024;     // de una vez; más grande va en partes
const MAX_GRANDE = 4 * 1024 * 1024 * 1024;
// Cupos que no pasan por aquí (JP, cliente cero, aparece en el tablero de jpfraneto.com)
const FIJOS = [];  // (El Taller, el cliente cero, es una cuenta más desde 2026-11-11)

const enc = new TextEncoder();
const json = (d, status = 200, extra = {}) =>
  Response.json(d, { status, headers: { "cache-control": "no-store", ...extra } });
async function sha(t) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(t))));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function igual(a, b) {
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0;
}
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";  // sin 0/O ni 1/I: se dicta y se escribe sin confundirse
const codigoInstalacion = () => {
  const s = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => LETRAS[x % LETRAS.length]).join("");
  return s.slice(0, 4) + "-" + s.slice(4);
};
const CODIGO_DIAS = 7;
const azar = (n = 24) => {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]);
};
const telefonoCL = (x) => {
  let d = String(x || "").replace(/\D/g, "");
  if (d.length === 9 && d[0] === "9") d = "56" + d;
  else if (d.length === 8) d = "569" + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
};

// Fechas en Chile, como texto AAAA-MM-DD
const hoyChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const sumar = (f, n) => {
  const d = new Date(f + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fechaOk = (f) => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + "T12:00:00Z"));
// un @ de Instagram: minúsculas, letras, números, punto y guion bajo, hasta 30
const handleIG = (x) => { const h = String(x || "").trim().replace(/^@/, "").toLowerCase(); return /^[a-z0-9._]{1,30}$/.test(h) ? h : ""; };
// quién es ese @: Business Discovery desde la cuenta de El Taller. Solo responde por cuentas de empresa o creador
// (el filtro: los 30 días son para negocios). Sin el token (IG_LOOKUP_TOKEN) no se sabe y no se bloquea a nadie.
async function buscarIG(env, h) {
  if (!env.IG_LOOKUP_TOKEN || !env.IG_LOOKUP_USER) return { estado: "sin-token", username: h };
  const cache = caches.default, k = new Request("https://ig.cache/" + h);
  const ya = await cache.match(k);
  if (ya) return ya.json();
  const campos = `business_discovery.username(${h}){username,name,profile_picture_url,followers_count,media_count}`;
  const u = `https://graph.facebook.com/${env.GRAPH_VERSION || "v27.0"}/${env.IG_LOOKUP_USER}?fields=${encodeURIComponent(campos)}&access_token=${env.IG_LOOKUP_TOKEN}`;
  const r = await fetch(u).then((x) => x.json()).catch(() => ({ error: {} }));
  const b = r.business_discovery;
  const d = b ? { estado: "empresa", username: b.username, nombre: b.name || "", foto: b.profile_picture_url || "", seguidores: b.followers_count || 0, publicaciones: b.media_count || 0 }
    : r.error && r.error.code === 110 ? { estado: "no-empresa", username: h }  // 110: no existe o es personal
    : { estado: "sin-respuesta", username: h };
  if (d.estado !== "sin-respuesta") await cache.put(k, new Response(JSON.stringify(d), { headers: { "cache-control": "max-age=600" } }));
  return d;
}
// Conectar tu WhatsApp sin escribirlo: la página pide un código, WhatsApp se abre con "…mi código es ET-4K7P" hacia el
// número de El Taller, lo mandas, y el aviso de Meta (meta.js) deja tu número junto al código. Vive 30 minutos (KV RUTAS).
// Mientras el número de El Taller no esté en la API de WhatsApp (WA_VERIFICA != "1"), el WhatsApp se escribe a mano.
const codigoWA = () => "ET-" + [...crypto.getRandomValues(new Uint8Array(4))].map((x) => LETRAS[x % LETRAS.length]).join("");
async function waVerificado(env, d) {  // {c, k} → "+569…" si ese código ya llegó por WhatsApp
  if (!d || typeof d.c !== "string" || typeof d.k !== "string" || !/^ET-[A-Z0-9]{4}$/.test(d.c)) return "";
  const r = await env.RUTAS.get("wa-cod:" + d.c, "json");
  return r && r.numero && r.kh === (await sha(d.k)) ? r.numero : "";
}
const limpiar = (x, n) => (typeof x === "string" ? x.trim().slice(0, n) : "");

// ───────── el Durable Object: todo lo de las cuentas, en un solo lugar (una cosa a la vez, sin carreras) ─────────
export class Espacio extends DurableObject {
  get st() { return this.ctx.storage; }

  // entrar con WhatsApp
  // sesiones y enlaces de un solo uso
  async sesionNueva(cid) {
    const token = azar(32);
    await this.st.put("s:" + (await sha(token)), { c: cid, creada: Date.now() });
    return token;
  }
  async deSesion(token) {
    if (!token) return null;
    const s = await this.st.get("s:" + (await sha(token)));
    if (!s || Date.now() - s.creada > SESION_DIAS * 864e5) return null;
    return (await this.st.get("c:" + s.c)) || null;
  }
  async salir(token) { if (token) await this.st.delete("s:" + (await sha(token))); }
  // Por defecto sirve una vez. Con llave (--varias) sirve hasta que vence
  // (lo abre en Instagram y después en su computador para subir el video).
  // el código de instalación: lo ve el dueño en su espacio (ya pagado); sirve una vez y da una llave a ese computador
  async instalacionNueva(cid) {
    const c = await this.st.get("c:" + cid);
    if (!c) return null;
    if (c.instalacion && c.instalacion.codigo) await this.st.delete("k:" + (await sha(c.instalacion.codigo)));
    const codigo = codigoInstalacion(), vence = Date.now() + CODIGO_DIAS * 864e5;
    c.instalacion = { ...(c.instalacion || {}), codigo, vence, usado: 0 };
    await this.st.put({ ["c:" + cid]: c, ["k:" + (await sha(codigo))]: { c: cid, vence } });
    return c.instalacion;
  }
  async instalacionVigente(cid) {  // la que muestra su espacio: si no hay una vigente sin usar, crea otra
    const c = await this.st.get("c:" + cid);
    if (!c) return null;
    const i = c.instalacion;
    if (i && i.codigo && !i.usado && Date.now() < i.vence) return i;
    if (i && i.usado) return i;  // ya instalado: el espacio lo muestra, y "otro computador" pide uno nuevo
    return this.instalacionNueva(cid);
  }
  async instalacionUsar(codigo) {
    const k = "k:" + (await sha(codigo));
    const x = await this.st.get(k);
    if (!x || Date.now() > x.vence) return null;
    const c = await this.st.get("c:" + x.c);
    if (!c || !(c.reserva && c.reserva.estado === "pagada")) return null;
    const llave = azar(32);
    c.instalacion = { ...(c.instalacion || {}), usado: Date.now(), codigo: "" };
    await this.st.delete(k);
    await this.st.put({ ["c:" + c.id]: c, ["q:" + (await sha(llave))]: { c: c.id, creada: Date.now() } });
    return { llave, cuenta: c };
  }
  async deLlave(llave) {
    if (!llave) return null;
    const q = await this.st.get("q:" + (await sha(llave)));
    return q ? (await this.st.get("c:" + q.c)) || null : null;
  }

  async enlaceNuevo(cid, minutos, llave = false) {
    const t = azar(24);
    await this.st.put("m:" + (await sha(t)), { c: cid, vence: Date.now() + minutos * 60 * 1000, llave });
    return t;
  }
  async enlaceUsar(t) {
    const k = "m:" + (await sha(t));
    const m = await this.st.get(k);
    if (!m) return null;
    if (!m.llave || Date.now() > m.vence) await this.st.delete(k);
    if (Date.now() > m.vence) return null;
    return this.sesionNueva(m.c);
  }

  // la cuenta
  async cuenta(cid) { return (await this.st.get("c:" + cid)) || null; }
  async cuentaCrear(datos) {  // JP la crea a mano (os/clientes.py enlace)
    const wa = String(datos.telefono || "").replace(/\D/g, "");
    const ig = handleIG(datos.ig);
    const id = wa ? "wa" + wa : ig ? "ig" + ig.replace(/\./g, "-") : "jp" + azar(9).replace(/[-_]/g, "x");
    let c = await this.st.get("c:" + id);
    if (!c) c = { id, telefono: wa ? "+" + wa : "", nombre: "", negocio: "", instagram: "", creada: Date.now(), contexto: [] };
    if (datos.nombre) c.nombre = limpiar(datos.nombre, 60);
    if (datos.negocio) c.negocio = limpiar(datos.negocio, 80);
    if (datos.instagram) c.instagram = limpiar(datos.instagram, 60).replace(/^@/, "");
    // lo que JP ya le mostró (el prototipo del episodio): aparece arriba de su espacio
    if (datos.prototipo && /^https:\/\//.test(datos.prototipo)) c.prototipo = { url: limpiar(datos.prototipo, 300), titulo: limpiar(datos.prototipo_titulo, 80) };
    await this.st.put("c:" + id, c);
    return c;
  }
  async cuentaGuardar(cid, d) {
    const c = await this.st.get("c:" + cid);
    if (!c) return null;
    if (typeof d.nombre === "string") c.nombre = limpiar(d.nombre, 60);
    if (typeof d.negocio === "string") c.negocio = limpiar(d.negocio, 80);
    if (typeof d.instagram === "string") c.instagram = limpiar(d.instagram, 60).replace(/^@/, "");
    if (typeof d.publico === "boolean") c.publico = d.publico;  // su nombre en el tablero de jpfraneto.com
    await this.st.put("c:" + cid, c);
    return c;
  }
  async contextoAgregar(cid, item) {
    const c = await this.st.get("c:" + cid);
    if (!c) return null;
    c.contexto = [...(c.contexto || []), { ...item, id: azar(9), fecha: Date.now() }].slice(-500);
    await this.st.put("c:" + cid, c);
    return c.contexto[c.contexto.length - 1];
  }
  async contextoQuitar(cid, id) {
    const c = await this.st.get("c:" + cid);
    if (!c) return null;
    const x = (c.contexto || []).find((i) => i.id === id);
    c.contexto = (c.contexto || []).filter((i) => i.id !== id);
    await this.st.put("c:" + cid, c);
    return x || null;
  }
  // el perfil público (lo que se ve en /p/<instagram>): JP lo arma con el dueño; se muestra solo con publico = true
  async perfilGuardar(cid, d) {
    const c = await this.st.get("c:" + cid);
    if (!c) return null;
    const pf = { ...(c.perfil || {}) };
    for (const k of ["linea", "web", "app", "foto"]) if (typeof d[k] === "string") pf[k] = limpiar(d[k], k === "linea" ? 160 : 300);
    if (typeof d.whatsapp === "string") pf.whatsapp = d.whatsapp.replace(/\D/g, "").slice(0, 15);
    if (typeof d.fotoKey === "string") pf.fotoKey = d.fotoKey;
    for (const k of ["web", "app", "foto"]) if (pf[k] && !/^https:\/\//.test(pf[k])) pf[k] = "";
    c.perfil = pf;
    for (const k of ["nombre", "negocio"]) if (typeof d[k] === "string" && d[k].trim()) c[k] = limpiar(d[k], k === "nombre" ? 60 : 80);
    if (typeof d.instagram === "string") c.instagram = limpiar(d.instagram, 60).replace(/^@/, "");
    if (typeof d.publico === "boolean") c.publico = d.publico;
    // JP fija una fecha ya pagada (el cliente cero, o un pago por fuera con fecha pasada)
    if (fechaOk(d.inicio)) c.reserva = { inicio: d.inicio, hora: HORAS.includes(d.hora) ? d.hora : HORAS[0], estado: "pagada", pagada: Date.now(), pago: { id: "manual" } };
    await this.st.put("c:" + cid, c);
    return c;
  }
  async cuentaPorInstagram(h) {
    const cs = (await this.cuentas()).filter((c) => (c.instagram || "").toLowerCase() === h);
    return cs.find((c) => c.reserva && c.reserva.estado === "pagada") || cs[0] || null;
  }
  async cuentaPorTelefono(wa) {
    const t = "+" + wa, cs = (await this.cuentas()).filter((c) => c.telefono === t || c.id === "wa" + wa);
    return cs.find((c) => c.reserva && c.reserva.estado === "pagada") || cs[0] || null;
  }
  async datosPago(cid, d) {  // lo que pide la pared: nombre, negocio, WhatsApp, Instagram
    const c = await this.st.get("c:" + cid);
    if (!c) return null;
    if (limpiar(d.nombre, 60)) c.nombre = limpiar(d.nombre, 60);
    if (limpiar(d.negocio, 80)) c.negocio = limpiar(d.negocio, 80);
    if (typeof d.instagram === "string" && d.instagram.trim()) c.instagram = limpiar(d.instagram, 60).replace(/^@/, "");
    const wa = telefonoCL(d.whatsapp);
    if (wa && !c.telefono) c.telefono = "+" + wa;
    await this.st.put("c:" + cid, c);
    return c;
  }
  async cuentaBorrar(cid) {  // JP: una cuenta de prueba o un error (os/clientes.py borrar)
    const c = await this.st.get("c:" + cid);
    if (!c) return null;
    await this.st.delete("c:" + cid);
    return c;
  }
  async cuentas() {
    const m = await this.st.list({ prefix: "c:" });
    return [...m.values()];
  }

  // la agenda: seis cupos a la vez; un día 1 se puede elegir si los 30 días que abre tienen lugar
  async ocupacion() {
    const tomadas = (await this.cuentas()).filter((c) => c.reserva && c.reserva.estado === "pagada").map((c) => c.reserva.inicio);
    const dias = {};
    for (const ini of [...FIJOS.map((f) => f.inicio), ...tomadas]) {
      for (let i = 0; i < DIAS; i++) { const d = sumar(ini, i); dias[d] = (dias[d] || 0) + 1; }
    }
    return dias;
  }
  async disponibles() {
    const dias = await this.ocupacion();
    const manana = sumar(hoyChile(), 1);
    const out = [];
    for (let i = 0; i < VENTANA_DIAS; i++) {
      const ini = sumar(manana, i);
      let libre = true;
      for (let k = 0; k < DIAS && libre; k++) if ((dias[sumar(ini, k)] || 0) >= CUPOS) libre = false;
      out.push({ fecha: ini, libre });
    }
    return out;
  }
  async reservar(cid, inicio, hora, extra = {}) {
    const c = await this.st.get("c:" + cid);
    if (!c) return { error: "cuenta" };
    if (c.reserva && c.reserva.estado === "pagada") return { error: "Tu fecha ya está fija" };
    const libres = await this.disponibles();
    const dia = libres.find((d) => d.fecha === inicio);
    if (!dia || !dia.libre) return { error: "Ese día ya no está disponible" };
    if (!HORAS.includes(hora)) return { error: "hora" };
    c.reserva = { inicio, hora, estado: "pendiente", elegida: Date.now(), ...extra };
    await this.st.put("c:" + cid, c);
    return { ok: true, reserva: c.reserva };
  }
  async confirmarPago(cid, pago) {
    const c = await this.st.get("c:" + cid);
    if (!c || !c.reserva) return { error: "sin reserva" };
    if (c.reserva.estado === "pagada") return { ok: true, ya: true, cuenta: c };
    const dias = await this.ocupacion();
    let sobrecupo = false;
    for (let k = 0; k < DIAS; k++) if ((dias[sumar(c.reserva.inicio, k)] || 0) >= CUPOS) sobrecupo = true;
    c.reserva = { ...c.reserva, estado: "pagada", pagada: Date.now(), pago, ...(sobrecupo ? { sobrecupo: true } : {}) };
    await this.st.put("c:" + cid, c);
    return { ok: true, cuenta: c, sobrecupo };
  }

  // limpieza: códigos y enlaces vencidos
  async alarm() {
    const ahora = Date.now();
    const l = await this.st.list({ prefix: "l:" });
    const viejos = [...l].filter(([, v]) => ahora - v.creado > 60 * 60 * 1000).map(([k]) => k);
    const m = await this.st.list({ prefix: "m:" });
    viejos.push(...[...m].filter(([, v]) => ahora > v.vence).map(([k]) => k));
    if (viejos.length) await this.st.delete(viejos);
  }
}

// el perfil: su dirección es su Instagram (o su id si no tiene)
const slugDe = (c) => (c.instagram || c.id).toLowerCase().replace(/[^a-z0-9._-]/g, "");
const diaDe = (inicio, hoy) => Math.round((new Date(hoy + "T12:00:00Z") - new Date(inicio + "T12:00:00Z")) / 864e5) + 1;
const fotoDe = (c, base) => (c.perfil && c.perfil.fotoKey ? `${base}/api/foto/${c.id}?v=${c.perfil.fotoKey.split("/").pop()}` : (c.perfil && c.perfil.foto) || "");
function perfilPublico(c, base) {
  const pf = c.perfil || {}, r = c.reserva && c.reserva.estado === "pagada" ? c.reserva : null;
  return { slug: slugDe(c), nombre: c.nombre, negocio: c.negocio, instagram: c.instagram || "", foto: fotoDe(c, base), linea: pf.linea || "",
    whatsapp: pf.whatsapp || "", web: pf.web || (c.prototipo && c.prototipo.url) || "", app: pf.app || "",
    inicio: r ? r.inicio : "", dia: r ? diaDe(r.inicio, hoyChile()) : 0, dias: DIAS };
}
export { perfilPublico, slugDe };

// /p/<instagram>: la página del perfil, con sus datos adentro (y su foto en la vista previa de WhatsApp/Instagram)
export async function paginaPerfil(request, env, url) {
  const m = url.pathname.match(/^\/p\/([a-z0-9._-]{1,60})\/?$/i);
  if (!m) return null;
  const base = url.hostname === "localhost" ? url.origin : "https://" + url.host;
  const c = (await espacio(env).cuentas()).find((x) => x.publico && slugDe(x) === m[1].toLowerCase());
  if (!c) return Response.redirect(base + "/", 302);
  const pf = perfilPublico(c, base);
  const html = await env.ASSETS.fetch(new Request(base + "/perfil/", request));
  const esc = (t) => String(t).replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[x]);
  const titulo = `${pf.negocio || pf.nombre} · El Taller`;
  const desc = pf.linea || `${pf.nombre} y ${pf.negocio}, en El Taller.`;
  const meta = `<title>${esc(titulo)}</title><meta name="description" content="${esc(desc)}" />` +
    `<meta property="og:title" content="${esc(titulo)}" /><meta property="og:description" content="${esc(desc)}" />` +
    (pf.foto ? `<meta property="og:image" content="${esc(pf.foto)}" />` : "") +
    `<script>window.PERFIL=${JSON.stringify(pf).replace(/</g, "\\u003c")}</script>`;
  return new HTMLRewriter().on("title", { element: (e) => e.remove() }).on("head", { element: (h) => h.append(meta, { html: true }) })
    .transform(new Response(html.body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } }));
}

const espacio = (env) => env.ESPACIO.get(env.ESPACIO.idFromName("el-taller"));

// ───────── avisos a JP (Telegram) ─────────
async function avisarJP(env, texto) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texto, disable_web_page_preview: true }),
    });
  } catch { /* que un aviso no rompa nada */ }
}
const quien = (c) => [c.nombre, c.negocio && c.negocio !== c.nombre && "(" + c.negocio + ")", c.instagram && "@" + c.instagram, c.telefono].filter(Boolean).join(" ");

// ───────── Mercado Pago ─────────
async function mp(env, metodo, ruta, cuerpo) {
  const r = await fetch((env.MP_BASE || "https://api.mercadopago.com") + ruta, {
    method: metodo,
    headers: { authorization: "Bearer " + env.MP_ACCESS_TOKEN, "content-type": "application/json",
      ...(metodo === "POST" ? { "x-idempotency-key": azar(16) } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "Mercado Pago respondió " + r.status);
  return j;
}
// Lo que manda es lo que dice la API de Mercado Pago del pago, no lo que diga el aviso ni el navegador.
async function revisarPago(env, ctx, pagoId) {
  if (!env.MP_ACCESS_TOKEN || !/^\d+$/.test(String(pagoId))) return { error: "pago" };
  const p = await mp(env, "GET", "/v1/payments/" + pagoId);
  const [cid] = String(p.external_reference || "").split("|");
  if (!cid) return { error: "referencia" };
  if (p.status !== "approved") return { estado: p.status, cid };
  if (p.currency_id !== "CLP" || Number(p.transaction_amount) < PRECIO) {
    ctx.waitUntil(avisarJP(env, `El Taller · OJO: pago ${p.id} aprobado pero por ${p.transaction_amount} ${p.currency_id}. No se fijó la fecha.`));
    return { error: "monto" };
  }
  const r = await espacio(env).confirmarPago(cid, { id: String(p.id), cuotas: p.installments || 1, medio: p.payment_method_id || "" });
  if (r.ok && !r.ya) {
    const c = r.cuenta;
    ctx.waitUntil(avisarJP(env, `El Taller · PAGÓ ${quien(c)}\nDía 1: ${c.reserva.inicio} · kickoff ${c.reserva.hora} · ${p.installments || 1} cuota(s)` +
      (r.sobrecupo ? "\nOJO: con este pago hay más de 6 cupos en esos días." : "")));
  }
  return { estado: "approved", cid };
}

// ───────── cookies ─────────
const COOKIE = "__Host-et";  // __Host-: solo https, solo este dominio, nadie más la puede poner
const leerCookie = (req) => {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)__Host-et=([A-Za-z0-9_-]{20,80})/);
  return m ? m[1] : "";
};
// el secreto de "fui a pagar" también en una cookie: si se pagó desde jpfraneto.com, su localStorage no llega a /espacio
const leerSecreto = (req) => {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)__Host-et-pago=([0-9a-f]{20,80})/);
  return m ? m[1] : "";
};
const conCookie = (token) => ({
  "set-cookie": `${COOKIE}=${token}; Path=/; Max-Age=${SESION_DIAS * 86400}; HttpOnly; Secure; SameSite=Lax`,
});

function semilla(c) {  // lo que baja el computador con el código: el negocio y la lista de su contexto
  return {
    cuenta: { id: c.id, nombre: c.nombre, negocio: c.negocio, instagram: c.instagram || "", telefono: c.telefono || "" },
    prototipo: c.prototipo || null,
    reserva: c.reserva && c.reserva.estado === "pagada" ? { inicio: c.reserva.inicio, hora: c.reserva.hora } : null,
    contexto: (c.contexto || []).map((i) => ({ id: i.id, tipo: i.tipo, nombre: i.nombre, texto: i.texto, peso: i.peso, mime: i.mime, fecha: i.fecha })),
  };
}

function vista(c, libres) {  // lo que ve el dueño de su cuenta
  return {
    cuenta: { nombre: c.nombre, negocio: c.negocio, instagram: c.instagram, telefono: c.telefono, publico: !!c.publico },
    pagado: !!(c.reserva && c.reserva.estado === "pagada"),
    instalacion: c.instalacion ? { codigo: c.instalacion.usado ? "" : c.instalacion.codigo, vence: c.instalacion.vence, usado: c.instalacion.usado || 0 } : null,
    contexto: (c.contexto || []).map((i) => ({ id: i.id, tipo: i.tipo, nombre: i.nombre, texto: i.texto, peso: i.peso, mime: i.mime, fecha: i.fecha })),
    prototipo: c.prototipo || null,
    reserva: c.reserva ? { inicio: c.reserva.inicio, hora: c.reserva.hora, estado: c.reserva.estado } : null,
    agenda: { hoy: hoyChile(), dias: libres, horas: HORAS, precio: PRECIO, duracion: DIAS },
    pago: { listo: true },
  };
}

// ───────── rutas ─────────
const PUERTAS = new Set(["https://jpfraneto.com", "https://www.jpfraneto.com"]);
export async function rutaEspacio(request, env, url, ctx) {
  const o = request.headers.get("origin") || "";
  // jpfraneto.com pregunta si ya estás adentro, y desde su portada se elige el día 1 y se va a pagar (JP, 2026-11-12: "que se sienta en la misma página")
  const abierta = PUERTAS.has(o) && ["/api/yo", "/api/agenda", "/api/pagar", "/api/ig", "/api/wa/codigo", "/api/wa/estado"].includes(url.pathname);
  const cors = { "access-control-allow-origin": o, "access-control-allow-credentials": "true", vary: "origin" };
  if (abierta && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } });
  }
  const r = await rutaEspacio0(request, env, url, ctx);
  if (!r || !abierta) return r;
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(r.body, { status: r.status, headers: h });
}
async function rutaEspacio0(request, env, url, ctx) {
  const p = url.pathname;
  if (!p.startsWith("/api/") || p === "/api/ventana") return null;
  const metodo = request.method.toUpperCase();
  const base = url.hostname === "localhost" ? url.origin : "https://" + url.host;
  const E = espacio(env);
  try {
    // público
    if (p === "/api/cupos") {
      const cs = (await E.cuentas()).filter((c) => c.reserva && c.reserva.estado === "pagada");
      // disponibles: cuántos podrían partir mañana (los 30 días que abre, en su día más lleno). proximo: si no hay, el primer día 1 libre.
      const dias = await E.ocupacion(), manana = sumar(hoyChile(), 1);
      let lleno = 0;
      for (let k = 0; k < DIAS; k++) lleno = Math.max(lleno, dias[sumar(manana, k)] || 0);
      const disponibles = Math.max(0, CUPOS - lleno);
      const proximo = disponibles ? manana : ((await E.disponibles()).find((d) => d.libre) || {}).fecha || "";
      // la gente: los que están en sus 30 días o por partir (los activos primero); cara y perfil solo si dijeron que sí
      const hoy = hoyChile();
      const gente = cs.map((c) => ({ c, dia: diaDe(c.reserva.inicio, hoy) })).filter((x) => x.dia <= DIAS)
        .sort((a, b) => (b.dia > 0) - (a.dia > 0) || a.c.reserva.inicio.localeCompare(b.c.reserva.inicio))
        .map(({ c, dia }) => (c.publico ? { slug: slugDe(c), nombre: c.nombre, negocio: c.negocio, foto: fotoDe(c, base), dia, inicio: c.reserva.inicio } : { dia, inicio: c.reserva.inicio }));
      return json({ cupos: CUPOS, disponibles, proximo, gente },
        200, { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" });
    }
    if (p === "/api/semilla" && metodo === "POST") {
      const d = await request.json().catch(() => ({}));
      const codigo = String(d.codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (codigo.length !== 8) return json({ error: "El código tiene 8 letras y números (ej: K7P2-QX9M)" }, 400);
      const r = await E.instalacionUsar(codigo.slice(0, 4) + "-" + codigo.slice(4));
      if (!r) return json({ error: "Ese código no existe, venció o ya se usó. Pide otro en tu espacio de El Taller." }, 404);
      ctx.waitUntil(avisarJP(env, `El Taller · ${quien(r.cuenta)} instaló El Taller en su computador.`));
      return json({ llave: r.llave, ...semilla(r.cuenta) });
    }
    if (p === "/api/semilla/estado" || p === "/api/semilla/archivo") {
      const c = await E.deLlave((request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
      if (!c) return json({ error: "llave" }, 401);
      if (p === "/api/semilla/estado") return json(semilla(c));
      const a = (c.contexto || []).find((i) => i.id === url.searchParams.get("id"));
      if (!a || !a.key) return json({ error: "no existe" }, 404);
      const o = await env.CONTEXTO.get(a.key);
      if (!o) return json({ error: "no existe" }, 404);
      return new Response(o.body, { headers: { "content-type": a.mime || "application/octet-stream" } });
    }
    if (p === "/api/ig") {
      const h = handleIG(url.searchParams.get("u"));
      if (!h) return json({ error: "Ese @ no se ve bien" }, 400);
      return json(await buscarIG(env, h));
    }
    if (p === "/api/agenda") {
      return json({ hoy: hoyChile(), dias: await E.disponibles(), horas: HORAS, precio: PRECIO, duracion: DIAS, listo: !!env.MP_ACCESS_TOKEN || !!env.MP_LINK,
        wa: { verifica: env.WA_VERIFICA === "1" } });
    }
    if (p === "/api/wa/codigo" && metodo === "POST") {
      if (env.WA_VERIFICA !== "1" || !env.ELTALLER_WA) return json({ error: "Todavía no" }, 503);
      const c = codigoWA(), k = azar(24);
      await env.RUTAS.put("wa-cod:" + c, JSON.stringify({ kh: await sha(k), numero: "" }), { expirationTtl: 1800 });
      const texto = `Hola JP, quiero conectar mi WhatsApp a El Taller. Mi código es ${c}`;
      return json({ c, k, link: `https://wa.me/${env.ELTALLER_WA}?text=${encodeURIComponent(texto)}` });
    }
    if (p === "/api/wa/estado") {
      const n = await waVerificado(env, { c: url.searchParams.get("c"), k: url.searchParams.get("k") });
      return json({ numero: n });
    }
    if (p === "/api/perfil") {
      const slug = String(url.searchParams.get("slug") || "").toLowerCase();
      const c = (await E.cuentas()).find((x) => x.publico && slugDe(x) === slug);
      if (!c) return json({ error: "no existe" }, 404);
      return json(perfilPublico(c, base), 200, { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" });
    }
    if (p.startsWith("/api/foto/")) {
      const c = await E.cuenta(p.slice(10));
      if (!c || !c.publico || !c.perfil || !c.perfil.fotoKey) return new Response("no", { status: 404 });
      const o = await env.CONTEXTO.get(c.perfil.fotoKey);
      if (!o) return new Response("no", { status: 404 });
      return new Response(o.body, { headers: { "content-type": o.httpMetadata?.contentType || "image/jpeg", "cache-control": "public, max-age=300" } });
    }
    if (p === "/api/entrar/link") {
      const token = await E.enlaceUsar(url.searchParams.get("l") || "");
      if (!token) return Response.redirect(base + "/espacio/?vencido=1", 302);
      return new Response(null, { status: 302, headers: { location: base + "/espacio/", ...conCookie(token) } });
    }
    if (p === "/api/mp" && metodo === "POST") {  // aviso de Mercado Pago
      const cuerpo = await request.text();
      let d = {};
      try { d = JSON.parse(cuerpo || "{}"); } catch {}
      const id = (d.data && d.data.id) || url.searchParams.get("data.id") || url.searchParams.get("id");
      const tipo = d.type || url.searchParams.get("type") || url.searchParams.get("topic");
      if (env.MP_WEBHOOK_SECRET && !(await firmaMP(env, request, id))) return new Response("firma", { status: 401 });
      if (tipo === "payment" && id) ctx.waitUntil(revisarPago(env, ctx, id).catch(() => {}));
      return new Response("ok");
    }

    // JP
    if (p.startsWith("/api/admin/")) {
      const clave = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      // JP entra con la clave (os/clientes.py) o desde el panel de El Taller: la llave del computador de una cuenta admin (ADMIN_CUENTAS)
      let ok = !!(env.ADMIN_CLAVE && clave && (await igual(clave, env.ADMIN_CLAVE)));
      if (!ok && clave && env.ADMIN_CUENTAS) {
        const dueno = await E.deLlave(clave);
        ok = !!(dueno && String(env.ADMIN_CUENTAS).split(",").map((x) => x.trim()).includes(dueno.id));
      }
      if (!ok) return json({ error: "clave" }, 401);
      if (p === "/api/admin/cuentas") return json({ cuentas: await E.cuentas(), ocupacion: await E.disponibles() });
      if (p === "/api/admin/enlace" && metodo === "POST") {
        const d = await request.json();
        const c = d.id ? await E.cuenta(d.id) : await E.cuentaCrear(d);  // con teléfono: la crea o la actualiza
        if (!c) return json({ error: "no existe" }, 404);
        // por defecto sirve UNA vez (7 días para abrirlo): lo más seguro. "varias": la llave que sirve hasta que vence.
        const t = await E.enlaceNuevo(c.id, Number(d.minutos) || 7 * 24 * 60, !!d.varias);
        return json({ cuenta: c, url: `${base}/api/entrar/link?l=${t}` });
      }
      if (p === "/api/admin/confirmar" && metodo === "POST") {
        const d = await request.json();
        return json(await E.confirmarPago(d.id, { id: "manual", nota: limpiar(d.nota, 200) }));
      }
      if (p === "/api/admin/perfil" && metodo === "POST") {
        const d = await request.json();
        const c = await E.perfilGuardar(String(d.id || ""), d);
        return c ? json({ ok: true, cuenta: c, perfil: base + "/p/" + slugDe(c) }) : json({ error: "no existe" }, 404);
      }
      if (p === "/api/admin/foto" && metodo === "POST") {
        const id = url.searchParams.get("id") || "";
        if (!(await E.cuenta(id))) return json({ error: "no existe" }, 404);
        const tipo = request.headers.get("content-type") || "image/jpeg";
        if (!/^image\//.test(tipo)) return json({ error: "imagen" }, 400);
        const key = `perfiles/${id}/${Date.now()}`;
        await env.CONTEXTO.put(key, request.body, { httpMetadata: { contentType: tipo } });
        return json({ ok: true, cuenta: await E.perfilGuardar(id, { fotoKey: key }) });
      }
      if (p === "/api/admin/codigo" && metodo === "POST") {
        const d = await request.json();
        const cu = await E.cuenta(String(d.id || ""));
        if (!cu) return json({ error: "no existe" }, 404);
        if (!(cu.reserva && cu.reserva.estado === "pagada")) return json({ error: "El código se abre cuando paga" }, 409);
        const i = await E.instalacionNueva(cu.id);
        return json({ codigo: i.codigo, vence: i.vence, linea: `curl -fsSL https://jpfraneto.com/taller.sh | bash -s ${i.codigo}` });
      }
      if (p === "/api/admin/subir" && metodo === "POST") {  // JP sube contexto a la cuenta de un negocio (os/clientes.py subir)
        const cid = url.searchParams.get("id") || "";
        if (!(await E.cuenta(cid))) return json({ error: "no existe" }, 404);
        const nombre = limpiar(decodeURIComponent(url.searchParams.get("nombre") || "archivo"), 140).replace(/[\/\\]/g, "-") || "archivo";
        const key = `cuentas/${cid}/${Date.now()}-${azar(6)}-${nombre}`;
        const o = await env.CONTEXTO.put(key, request.body, { httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" } });
        const item = await E.contextoAgregar(cid, { tipo: "archivo", nombre, key, peso: o.size, mime: request.headers.get("content-type") || "", de: "jp" });
        return json({ ok: true, item });
      }
      if (p === "/api/admin/nota" && metodo === "POST") {
        const d = await request.json();
        const t = limpiar(d.texto, 4000);
        if (!t) return json({ error: "vacía" }, 400);
        const item = await E.contextoAgregar(String(d.id || ""), { tipo: /^https?:\/\/\S+$/.test(t) ? "link" : "nota", texto: t, de: "jp" });
        return item ? json({ ok: true, item }) : json({ error: "no existe" }, 404);
      }
      if (p === "/api/admin/borrar" && metodo === "POST") {
        const d = await request.json();
        const c = await E.cuentaBorrar(String(d.id || ""));
        if (!c) return json({ error: "no existe" }, 404);
        let archivos = 0, cursor;  // sus archivos en R2 también
        do {
          const l = await env.CONTEXTO.list({ prefix: `cuentas/${c.id}/`, cursor });
          if (l.objects.length) { await env.CONTEXTO.delete(l.objects.map((o) => o.key)); archivos += l.objects.length; }
          cursor = l.truncated ? l.cursor : undefined;
        } while (cursor);
        return json({ ok: true, id: c.id, archivos });
      }
      if (p === "/api/admin/archivo") {
        const c = await E.cuenta(url.searchParams.get("id") || "");
        const a = c && (c.contexto || []).find((i) => i.id === url.searchParams.get("a"));
        if (!a || !a.key) return json({ error: "no existe" }, 404);
        const o = await env.CONTEXTO.get(a.key);
        if (!o) return json({ error: "no existe" }, 404);
        return new Response(o.body, { headers: { "content-type": a.mime || "application/octet-stream" } });
      }
      return json({ error: "no existe" }, 404);
    }

    // ── la pared: pagar no necesita cuenta. Al pagar se crea tu espacio y entras (JP, 2026-11-11: "this is exclusive")
    if ((p === "/api/pagar" || p === "/api/pago/verificar") && metodo === "POST") {
      const origen = request.headers.get("origin");
      if (origen && origen !== base && !(p === "/api/pagar" && PUERTAS.has(origen))) return json({ error: "origen" }, 403);
      const sesion = await E.deSesion(leerCookie(request));
      const d = await request.json().catch(() => ({}));
      if (p === "/api/pago/verificar") {
        const r = await revisarPago(env, ctx, d.pago);
        if (sesion) return r.cid && r.cid !== sesion.id ? json({ error: "pago" }, 403) : json(r);
        // sin sesión: el pago aprobado + el secreto que guardó este navegador al ir a pagar → adentro
        const c = r.cid && (await E.cuenta(r.cid)), t = typeof d.t === "string" && d.t ? d.t : leerSecreto(request);
        if (r.estado === "approved" && c && c.reserva && c.reserva.th && t && c.reserva.th === (await sha(t))) {
          return json({ ...r, adentro: true }, 200, conCookie(await E.sesionNueva(c.id)));
        }
        return json(r);
      }
      if (!fechaOk(d.inicio)) return json({ error: "Elige tu día 1" }, 400);
      let c = sesion, th;
      if (c) {
        if (c.reserva && c.reserva.estado === "pagada") return json({ error: "Tu fecha ya está fija" }, 409);
        c = await E.datosPago(c.id, d);
      } else {
        if (typeof d.t !== "string" || !/^[0-9a-f]{20,80}$/.test(d.t)) return json({ error: "Recarga la página" }, 400);
        // la pared, simple (JP, 2026-11-13: "déjalo pagar acá nomás"): su WhatsApp o su Instagram, uno basta; JP le escribe
        // después del pago. El @ es opcional y no tiene que ser cuenta de empresa: si Instagram lo encuentra, trae su nombre.
        const ig = handleIG(d.instagram);
        const wa = env.WA_VERIFICA === "1" && d.wa ? (await waVerificado(env, d.wa)).replace(/\D/g, "") : telefonoCL(d.whatsapp);
        if (!wa && !ig) return json({ error: "Déjame tu WhatsApp o tu Instagram: te escribo apenas pagues" }, 400);
        const porWa = wa ? await E.cuentaPorTelefono(wa) : null, porIg = ig ? await E.cuentaPorInstagram(ig) : null;
        if ((porWa && porWa.reserva && porWa.reserva.estado === "pagada") || (porIg && porIg.reserva && porIg.reserva.estado === "pagada"))
          return json({ error: "Ya tienes tu espacio: escríbeme y te mando cómo entrar" }, 409);
        if (wa && ig && porIg && porIg.telefono && porIg.telefono !== "+" + wa) return json({ error: "@" + ig + " ya está conectado a otro WhatsApp. Escríbeme." }, 409);
        if (wa && ig && porWa && porWa.instagram && porWa.instagram.toLowerCase() !== ig) return json({ error: "Ese WhatsApp ya está conectado a @" + porWa.instagram + ". Escríbeme." }, 409);
        const q = ig ? await buscarIG(env, ig).catch(() => ({})) : {};
        const nombre = limpiar(d.nombre, 60) || (q.estado !== "no-empresa" && q.nombre) || (ig ? "@" + ig : "+" + wa);
        const base_ = porWa || porIg || (await E.cuentaCrear(wa ? { telefono: wa } : { ig }));
        c = await E.datosPago(base_.id, { nombre, negocio: limpiar(d.negocio, 80) || nombre, instagram: ig, whatsapp: wa });
        th = await sha(d.t);
      }
      if (!c.nombre || !c.negocio) return json({ error: "Cuéntame tu nombre y el de tu negocio" }, 400);
      if (!c.telefono && !c.instagram) return json({ error: "Déjame tu WhatsApp o tu Instagram: te escribo apenas pagues" }, 400);
      const r = await E.reservar(c.id, d.inicio, d.hora, th ? { th } : {});
      if (r.error) return json(r, 409);
      const fin = sumar(d.inicio, DIAS - 1);
      const secreto = th ? { "set-cookie": `__Host-et-pago=${d.t}; Path=/; Max-Age=${3 * 86400}; HttpOnly; Secure; SameSite=Lax` } : {};
      if (env.MP_ACCESS_TOKEN) {
        const pref = await mp(env, "POST", "/checkout/preferences", {
          items: [{ id: "el-taller-30", title: `El Taller · 30 días con JP · ${c.negocio}`, description: `Del ${d.inicio} al ${fin}. Kickoff el día 1 a las ${d.hora}.`,
            quantity: 1, currency_id: "CLP", unit_price: PRECIO }],
          payer: c.nombre ? { name: c.nombre } : undefined,
          external_reference: `${c.id}|${d.inicio}|${azar(6)}`,
          metadata: { cuenta: c.id, inicio: d.inicio, hora: d.hora },
          payment_methods: { excluded_payment_types: [{ id: "ticket" }] },
          back_urls: { success: base + "/espacio/?pago=ok", pending: base + "/espacio/?pago=pendiente", failure: base + "/espacio/?pago=no" },
          auto_return: "approved",
          notification_url: base + "/api/mp",
          statement_descriptor: "EL TALLER JP",
        });
        ctx.waitUntil(avisarJP(env, `El Taller · ${quien(c)} eligió partir el ${d.inicio} (${d.hora}) y fue a pagar.`));
        return json({ url: pref.init_point }, 200, secreto);
      }
      if (env.MP_LINK) {  // sin token: el link fijo de siempre, y JP confirma a mano (os/clientes.py confirmar)
        ctx.waitUntil(avisarJP(env, `El Taller · ${quien(c)} eligió partir el ${d.inicio} (${d.hora}) y fue a pagar con el link fijo.\nCuando veas el pago: os/clientes.py confirmar ${c.id}`));
        return json({ url: env.MP_LINK }, 200, secreto);
      }
      return json({ error: "El pago todavía no está listo. Escríbele a JP." }, 503);
    }

    // con sesión
    const token = leerCookie(request);
    const c = await E.deSesion(token);
    if (p === "/api/salir" && metodo === "POST") {
      await E.salir(token);
      return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
    }
    if (!c) return json({ error: "entrar" }, 401);
    if (metodo === "POST" && request.headers.get("origin") && request.headers.get("origin") !== base) return json({ error: "origen" }, 403);
    if (p.startsWith("/api/contexto") && !(c.reserva && c.reserva.estado === "pagada")) return json({ error: "Tu espacio se abre cuando pagas" }, 403);

    if (p === "/api/instalar/codigo" && metodo === "POST") {
      if (!(c.reserva && c.reserva.estado === "pagada")) return json({ error: "Se abre cuando pagas" }, 403);
      await E.instalacionNueva(c.id);
      const v = vista((await E.cuenta(c.id)), await E.disponibles());
      v.pago.listo = !!env.MP_ACCESS_TOKEN || !!env.MP_LINK;
      return json(v);
    }
    if (p === "/api/yo") {
      if (metodo === "GET" && c.reserva && c.reserva.estado === "pagada") await E.instalacionVigente(c.id);
      if (metodo === "POST") {
        const d = await request.json();
        await E.cuentaGuardar(c.id, d);
      }
      const v = vista((await E.cuenta(c.id)), await E.disponibles());
      v.pago.listo = !!env.MP_ACCESS_TOKEN || !!env.MP_LINK;
      return json(v);
    }
    if (p === "/api/contexto/archivo" && metodo === "POST") {
      const largo = Number(request.headers.get("content-length") || 0);
      if (!largo) return json({ error: "vacío" }, 400);
      if (largo > MAX_ARCHIVO) return json({ error: "Muy pesado (máx. 95 MB). Mándamelo por WhatsApp." }, 413);
      const nombre = limpiar(decodeURIComponent(request.headers.get("x-nombre") || "archivo"), 140).replace(/[\/\\]/g, "-") || "archivo";
      const mime = limpiar(request.headers.get("content-type") || "application/octet-stream", 100);
      const key = `cuentas/${c.id}/${Date.now()}-${azar(6)}-${nombre}`;
      await env.CONTEXTO.put(key, request.body, { httpMetadata: { contentType: mime } });
      const item = await E.contextoAgregar(c.id, { tipo: "archivo", nombre, mime, peso: largo, key });
      return json({ item: { id: item.id, tipo: item.tipo, nombre, mime, peso: largo, fecha: item.fecha } });
    }
    // archivos grandes (videos del teléfono): en partes de hasta 50 MB, directo a R2
    if (p === "/api/contexto/subida/inicio" && metodo === "POST") {
      const d = await request.json();
      const peso = Number(d.peso) || 0;
      if (peso > MAX_GRANDE) return json({ error: "Muy pesado (máx. 4 GB)" }, 413);
      const nombre = limpiar(d.nombre || "archivo", 140).replace(/[\/\\]/g, "-") || "archivo";
      const mime = limpiar(d.mime || "application/octet-stream", 100);
      const key = `cuentas/${c.id}/${Date.now()}-${azar(6)}-${nombre}`;
      const up = await env.CONTEXTO.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
      return json({ key, uploadId: up.uploadId });
    }
    if (p === "/api/contexto/subida/parte" && metodo === "PUT") {
      const key = url.searchParams.get("key") || "", n = Number(url.searchParams.get("n"));
      if (!key.startsWith(`cuentas/${c.id}/`) || !(n >= 1 && n <= 10000)) return json({ error: "parte" }, 400);
      const parte = await env.CONTEXTO.resumeMultipartUpload(key, url.searchParams.get("uploadId") || "").uploadPart(n, request.body);
      return json({ partNumber: parte.partNumber, etag: parte.etag });
    }
    if (p === "/api/contexto/subida/fin" && metodo === "POST") {
      const d = await request.json();
      if (typeof d.key !== "string" || !d.key.startsWith(`cuentas/${c.id}/`)) return json({ error: "subida" }, 400);
      const up = env.CONTEXTO.resumeMultipartUpload(d.key, d.uploadId);
      const obj = await up.complete(d.partes || []);
      const nombre = d.key.split("/").pop().replace(/^\d+-[A-Za-z0-9_-]{8}-/, "");
      const item = await E.contextoAgregar(c.id, { tipo: "archivo", nombre, mime: obj.httpMetadata?.contentType || "", peso: obj.size, key: d.key });
      return json({ item: { id: item.id, tipo: item.tipo, nombre, mime: item.mime, peso: obj.size, fecha: item.fecha } });
    }
    if (p === "/api/contexto/nota" && metodo === "POST") {
      const d = await request.json();
      const texto = limpiar(d.texto, 20000);
      if (!texto) return json({ error: "vacío" }, 400);
      const item = await E.contextoAgregar(c.id, { tipo: /^https?:\/\/\S+$/.test(texto) ? "link" : "nota", texto });
      return json({ item: { id: item.id, tipo: item.tipo, texto, fecha: item.fecha } });
    }
    if (p === "/api/contexto" && metodo === "DELETE") {
      const x = await E.contextoQuitar(c.id, url.searchParams.get("id") || "");
      if (x && x.key) ctx.waitUntil(env.CONTEXTO.delete(x.key));
      return json({ ok: true });
    }
    if (p === "/api/contexto/ver") {
      const a = (c.contexto || []).find((i) => i.id === url.searchParams.get("id"));
      if (!a || !a.key) return json({ error: "no existe" }, 404);
      const o = await env.CONTEXTO.get(a.key);
      if (!o) return json({ error: "no existe" }, 404);
      return new Response(o.body, { headers: { "content-type": a.mime || "application/octet-stream", "cache-control": "private, max-age=3600",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nombre)}` } });
    }
    return json({ error: "no existe" }, 404);
  } catch (e) {
    return json({ error: e.message || "error" }, 500);
  }
}

// x-signature: "ts=…,v1=…"  firmado: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
async function firmaMP(env, request, id) {
  const sig = request.headers.get("x-signature") || "";
  const ts = (sig.match(/ts=([^,]+)/) || [])[1], v1 = (sig.match(/v1=([^,]+)/) || [])[1];
  if (!ts || !v1) return false;
  const rid = request.headers.get("x-request-id") || "";
  const plano = `id:${String(id || "").toLowerCase()};request-id:${rid};ts:${ts};`;
  const k = await crypto.subtle.importKey("raw", enc.encode(env.MP_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const f = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(plano)));
  return igual([...f].map((x) => x.toString(16).padStart(2, "0")).join(""), v1);
}
