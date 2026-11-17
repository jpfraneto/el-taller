// El Taller · eltallerconjp.jpfraneto.com
// La página de El Taller + la ventana en vivo al negocio de JP (cliente cero): si Claude está en línea y cuánto lleva hoy.
//   GET  /api/ventana  lo que el servidor de JP (su MacBook Air) publicó: solo lo que JP aprobó mostrar
//   POST /api/ventana  lo publica el servidor, con la clave VENTANA_CLAVE (secreto del Worker)
// Nunca hay conversaciones ni datos de clientes acá: el servidor manda contadores, publico.md y el diario.

import { rutaMeta, Caja } from "./meta.js";
import { rutaEspacio, paginaPerfil, Espacio } from "./espacio.js";
export { Caja, Espacio };

const MAX = 64 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const metodo = request.method.toUpperCase();

    const meta = await rutaMeta(request, env, url, ctx);  // /conectar, /meta (webhook de la app), /relay
    if (meta) return meta;

    const esp = await rutaEspacio(request, env, url, ctx);  // /api/*: tu espacio (entrar, contexto, pagar)
    if (esp) return esp;
    if (url.pathname.startsWith("/p/")) { const pp = await paginaPerfil(request, env, url); if (pp) return pp; }  // /p/<instagram>: un perfil

    if (url.pathname === "/api/ventana") {
      if (metodo === "GET" || metodo === "HEAD") {
        const v = (await env.VENTANA.get("ventana")) || "{}";
        return new Response(metodo === "HEAD" ? null : v, {
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=15", "access-control-allow-origin": "*" },
        });
      }
      if (metodo === "POST") return publicar(request, env);
      return new Response("no", { status: 405, headers: { allow: "GET, HEAD, POST" } });
    }

    if (metodo !== "GET" && metodo !== "HEAD") {
      return new Response("no", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    return env.ASSETS.fetch(request);
  },
};

async function publicar(request, env) {
  const clave = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.VENTANA_CLAVE || !(await igual(clave, env.VENTANA_CLAVE))) {
    return Response.json({ error: "clave" }, { status: 401 });
  }
  const texto = await request.text();
  if (texto.length > MAX) return Response.json({ error: "muy grande" }, { status: 413 });
  let d;
  try {
    d = JSON.parse(texto);
  } catch {
    return Response.json({ error: "json" }, { status: 400 });
  }
  const s = (x, n) => (typeof x === "string" ? x.slice(0, n) : "");
  const num = (x) => (Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  const limpio = {
    amigo: { nombre: s(d.amigo?.nombre, 40) },
    negocio: { nombre: s(d.negocio?.nombre, 80), instagram: s(d.negocio?.instagram, 60) },
    whatsapp: s(d.whatsapp, 30).replace(/[^\d+ ]/g, ""),
    estado: {
      encendido: !!d.estado?.encendido,
      atiende_clientes: !!d.estado?.atiende_clientes,
      ultimo_mensaje: s(d.estado?.ultimo_mensaje, 40),
      hoy: { mensajes: num(d.estado?.hoy?.mensajes), clientes: num(d.estado?.hoy?.clientes), avisos: num(d.estado?.hoy?.avisos) },
    },
    publico_md: s(d.publico_md, 20000),
    diario_md: s(d.diario_md, 30000),
    version: s(d.version, 20),
    recibido: new Date().toISOString(),
  };
  await env.VENTANA.put("ventana", JSON.stringify(limpio));
  return Response.json({ ok: true });
}

async function igual(a, b) {  // comparación en tiempo constante
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let r = 0;
  for (let i = 0; i < u.length; i++) r |= u[i] ^ v[i];
  return r === 0;
}
