# Parcelas y Terrenos · prototipo (El Taller, Ep. 08)

**Publicado: https://parcelasyterrenos.jpfraneto.com** (Cloudflare Worker `parcelasyterrenos-app` + KV `DB`).
Local: `npm install && npm run dev` → http://localhost:8808 (necesita `.dev.vars`, ver `.dev.vars.example`) · Publicar: `npm run deploy`.

Un marketplace de parcelas (JP, 2026-11-11): publicar es gratis y sin comisión; se gana con **Auspicia aquí**: los
letreros de la Ruta 5 en el mapa (`precio_auspicio`, $1.000.000/mes, 5 cupos + 1 para ONGs). Mientras no esté el marco
legal, `venta_carteles: false` = "PRÓXIMAMENTE" + WhatsApp. **Destacar** (una parcela pagada arriba) se sacó el 2026-11-16
(JP: "yo sacaría el destacar del prototipo"): no hay botón, ni casilla al publicar, ni estrella en el panel, ni cobro.
Precios y dueño del sitio: `public/data/parcelas.json` → `sitio`.

| Parte | Qué hace |
|---|---|
| **Inicio** (`/`) | "Parcelas en el sur, directo con el dueño". todas las parcelas con filtros (tamaño, crédito directo), cómo funciona para el que busca y el que vende. |
| **Las direcciones de siempre** | `/parcelas/`, `/fotogaleria/`, `/plano/`, `/contactanos/`, `/home/`, `/sitemap/` con su `<title>` de Webnode. Google indexa solo `www.parcelasyterrenos.cl` (`DOMINIO` en `wrangler.jsonc`); cualquier otra dirección, como el prototipo en jpfraneto.com, va con `noindex`. Sin www → 301 a www, como hacía Webnode. |
| **Una parcela** (`/parcela/<id>`) | Fotos, superficie, precio (o "te lo da <vendedor>"), lo que tiene, su texto, **Quién la vende** (nombre, quién es, desde cuándo), Agendar visita, Preguntar. Título y descripción propios (para Google, el día que se indexe). |
| **Publicar** (`/publicar/`) | Gratis: nombre, WhatsApp, quién eres, la parcela (comuna, sector, m², precio opcional, crédito directo, qué tiene, texto), hasta 8 fotos (se achican en el teléfono). Queda **pendiente** hasta que el dueño del sitio la aprueba. Fotos en KV (`f:`), servidas en `/f/<id>`. |
| **Claude** (`POST /api/chat`) | `anthropic/claude-haiku-5.5` por OpenRouter (respaldo `sonnet-5.5`). Conoce todas las parcelas publicadas y sus vendedores; si la persona está en una ficha, habla de esa. Nunca inventa precio, distancias, subdivisión. JSON estricto: respuesta + lead (nombre, WhatsApp, parcela, qué busca, visita, crédito) + temas + temperatura + resumen. El lead queda con su vendedor. |
| **Auspicia aquí** (`POST /api/auspicio`) | Empresa, nombre, WhatsApp, qué ofrece → panel. |
| **Panel** (`/sebastian`) | Clave `../.panel_key` o `/sebastian#k=<clave>`. Resumen del día, números, **La plata** (los letreros: vendidos, o "próximamente" + cuántos tocaron "Me interesa"), **Por aprobar** (Aprobar · No · WhatsApp), quieren auspiciar, próximas visitas, lo que preguntan + lo que le falta a la página, interesados ("Para <vendedor>"), las publicadas. Al pie: cargar / borrar ejemplos (`src/demo.js`). |

**El índice (todo Chile, datos reales)** · `src/indice.js` (reglas, filtros, búsqueda para Claude) + `src/fuentes.js` (cada fuente).
Solo datos + link (título, región, comuna, m², precio en su moneda, fecha); nunca fotos, descripciones largas ni personas.
Cada fuente en su llave `ix:<fuente>`; "¿Es tuya?" (si la fuente es reclamable) prellena `/publicar/?de=<k>`; `/fuentes/`
explica todo y `POST /api/quitar` saca una publicación al tiro (`ix-borrados`, se ve en el panel).
Hoy: **Bienes Nacionales** (licitaciones abiertas con valor mínimo UF y fecha de ofertas + las próximas; sin departamentos,
oficinas, locales ni estacionamientos). Se lee desde el Mac (`scripts/leer-indice.mjs`, launchd diario 06:00, plist en
`scripts/`) y se sube a `POST /api/panel/indice/subir`; el cron del Worker (09:00 UTC) lo intenta igual. Los portales
privados: solo con permiso escrito (`../fuentes-permisos.md`).

**Atención pagada, sola (JP, 2026-11-11: "el link debería ser a Mercado Pago directo y todo debería estar automatizado")**
· `src/pagos.js`. Los 5 letreros del mapa (cuando `venta_carteles` sea true) crean una orden de
Mercado Pago y mandan directo al checkout. El webhook (`/mp/webhook`, firmado) y la vuelta (`/mp/vuelta`) consultan la
orden en Mercado Pago (nunca confían en el aviso), y al aprobarse el letrero muestra la marca con su link 30 días (`carteles`). Se apagan solos. Pagar de nuevo suma 30 días. Nadie aprueba
nada; el panel muestra la plata del mes. **Falta conectar la cuenta** (la del dueño del sitio, su plata):
`npx wrangler secret put MP_ACCESS_TOKEN` y, en Mercado Pago → Tus integraciones → Webhooks, el evento "Order" a
`https://<dominio>/mp/webhook` → `npx wrangler secret put MP_WEBHOOK_SECRET`. Sin token, los botones dicen que el pago se activa
cuando el dueño conecte su cuenta.

**Corredoras** · `src/corredoras.js` + `/corredoras/`. Se suman solas: feed XML (formato Trovit/Mitula, lo que su software ya
exporta), EasyBroker o Tokko (con su API key; esos dos sin probar hasta la primera corredora real) o "ayúdenme" (WhatsApp).
Con feed/API que devuelve parcelas: verificada y en el mapa al tiro, con su logo (su favicon) y "✓ Corredora verificada".
Autorización explícita guardada con fecha. Cada "Ver en … ↗" se cuenta por corredora y mes (`clic:`): es lo que les muestra
el valor del mapa. Las que leemos de su web pública sin pedir permiso (robots.txt lo permite, sus términos no lo prohíben)
son `estado: indexada`, con su lector en `src/adaptadores.js`.

**Publicar** ya no espera aprobación: queda en el mapa al tiro; el panel la puede bajar ("Recién publicadas").

**Datos:** KV `DB`: `c:<id>` conversaciones/leads · `p:<id>` parcelas publicadas por otros (los viejos `{override}` de "destacar" se ignoran) · `f:<id>-<n>` fotos · `a:<ts>` auspicios · `rl:…` límites.
Lo marcado `demo` (ejemplos, grabaciones) se borra con "Borrar ejemplos".

**Pasarlo a su dominio** (día 1 de los 30): su dominio en Cloudflare → en `wrangler.jsonc` descomentar las dos rutas
(`www.parcelasyterrenos.cl` y `parcelasyterrenos.cl`) y `npm run deploy` → redirigir las páginas viejas de fotos (`/album/fotogaleria/...`) a `/fotogaleria/`.
Antes, medir cuánta gente llega hoy (Webnode / Search Console) para comparar.

**Por confirmar con él:** su nombre (`sitio.dueno`, `vendedores.sebastian`), qué foto va con qué parcela, precios o un
"desde", su crédito directo, minutos a Puerto Varas, y el precio del auspicio (después de medir el tráfico).
**Falta para producción:** avisar al vendedor por WhatsApp cuando llega un lead (hoy solo queda en el panel), moderar
fotos, y que publicar se pueda hacer mandándole fotos y un audio a Claude.
