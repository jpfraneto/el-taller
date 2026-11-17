# Endémico · app (prototipo El Taller, Ep. 04)

**Publicada: https://endemico.jpfraneto.com** (Cloudflare Worker `endemico-app` + D1 `endemico`, 2026-11-04, con datos de demo). Mercado Pago: aplicación **Endemico** (App ID `1588567708799045`, cuenta de JP, Chile, Checkout Pro), webhook `https://endemico.jpfraneto.com/api/mp/webhook`, evento `order`.

Secretos del Worker (los pone JP, nunca en el repo):
```bash
npx wrangler secret put COACH_CODE          # 6 dígitos: sin esto, el número de Seba no entra en el sitio publicado
npx wrangler secret put MP_ACCESS_TOKEN     # Access Token (APP_USR-...) del vendedor de prueba, después el de Endémico
npx wrangler secret put MP_WEBHOOK_SECRET   # developers/panel/app/1588567708799045/webhooks → clave secreta
npx wrangler secret put ANTHROPIC_API_KEY   # opcional: leer la foto de la pizarra
```

App web pensada para el teléfono, con la línea gráfica de @endemico.ft. La regla: **no le agrega ni un minuto de trabajo a Seba.**

| Para quién | Qué hace |
|---|---|
| **Alumno** | Escanea el **QR de la puerta** y queda registrado (un toque). Ve cuántas veces vino este mes, su calendario, su plan, hasta cuándo está pagado y todos sus pagos. **Paga su plan con Mercado Pago** (queda registrado solo) o, si transfirió, sube el comprobante. |
| **Seba (coach)** | **Hoy:** quién vino (en vivo), transferencias por confirmar, quién no viene hace 10 días (botón para escribirle por WhatsApp desde su teléfono), pagos vencidos con botón **Link** (genera el link de Mercado Pago del alumno y se lo manda por WhatsApp). **Alumnos:** registrar un pago en un toque (efectivo / transferencia / tarjeta; el monto sale del plan), check-in a mano, agregar alumnos. **Planilla:** una tabla igual a un Excel que se llena sola, con **Descargar Excel** (Alumnos, Asistencia, Pagos) y **Subir mi Excel de alumnos**. **Semana:** saca una foto de la pizarra del domingo y se convierte en la página de la semana. **QR de la puerta:** afiche para imprimir. |
| **Agenda** | En Inicio el alumno toca un día del calendario y elige la hora (L–V 07–12 y 15–21, sáb 09–12; una clase por hora, una clase por día). Necesita clases disponibles en el mes pagado de ese día; si no, la misma hoja ofrece renovar o comprar. Seba ve "Agendados hoy" por hora, con ✓ si ya llegó. Tabla `reservas`. |
| **La pizarra** | Los días van numerados (Día 1, 2, 3…), no lunes/martes. Cada día: Warmup, Serie 1, Serie 2, con las vueltas (x4, x3) arriba. Al escanear el QR la app muestra el día que te toca: tu N-ésima clase de la semana es el Día N (si vienes más veces que días, vuelve al Día 1). |
| **Planes (comprar y agendar)** | Pestaña **Planes** para todos, con o sin sesión, con los precios de su post "Nuestros Planes". Los planes son **clases al mes**: 1×/semana = 4 clases ($40.000) … 5×/semana = 20 clases ($140.000). Cada pago de plan da sus clases por un mes, encadenado (pagar antes no pierde días). Las **sesiones** (punción seca $35.000, kinesioterapia $28.000, personalizado $22.000, masaje $30.000) se compran de a una y se agendan como una clase, pero una persona por hora. Flujo: Planes → plan → "Pagar" (si no tiene sesión, pide número + nombre y vuelve solo) → Mercado Pago → "PAGADO · ¿cuándo vienes?" → elige día y hora. Quien compra queda como alumno, sin que Seba haga nada. Cancelar devuelve la clase o la sesión (hasta 30 min antes). |
| **Gente de afuera** | **El entrenamiento de la semana**: el mismo plan de la pizarra, con un selector de equipo (gimnasio completo · mancuernas · sin equipo). El lunes es gratis; el resto se paga con Mercado Pago: 30 días por `SEMANA_PRECIO` (hoy $15.000 de ejemplo). |

**Login:** número de teléfono + código de 6 dígitos (en el prototipo, con `DEMO_OTP=1`, el código es siempre **888888**; Seba entra con `COACH_CODE`). El número de Seba (`COACH_PHONES`) entra siempre como coach. Los números que no están en el gimnasio solo pueden entrar a suscribirse al entrenamiento. En el prototipo (`DEMO_OTP=1`) el código aparece en pantalla como una notificación de WhatsApp falsa (tócala y se rellena sola). En producción se manda con la API de WhatsApp (se puede reusar el código de `../../ep03-la-junta/prototype/src/worker.js`).

**La pizarra:** `POST /api/coach/semana/foto` manda la foto a Claude (`claude-opus-5-5`, salida en JSON con esquema fijo). Transcribe lo que escribió Seba sin inventar, y agrega para cada ejercicio una versión con mancuernas y otra sin equipo. Si algo no se lee, lo marca "no se lee bien". Necesita `ANTHROPIC_API_KEY`.

## Mercado Pago (Checkout Pro vía Orders API)

Se usa la **Orders API**, el camino que Mercado Pago recomienda hoy para Checkout Pro ([Crear order](https://www.mercadopago.cl/developers/es/reference/online-payments/checkout-pro/create-order/post)). La Preferences API quedó como legado.

- **Crear el link:** `POST /v1/orders` con `type: online`, `processing_mode: manual`, el monto en CLP como texto entero (`"100000"`), un `external_reference` propio, `expiration_time: P7D` y las URLs de vuelta (`config.online`). Mercado Pago devuelve el `checkout_url`: ese es el link.
- **Saber si se pagó:** `GET /v1/orders/{id}`. Está pagada cuando `status = processed` y `status_detail = accredited`.
- **Dos caminos de aviso:** el **webhook** (`/api/mp/webhook`, evento *Order (Mercado Pago)*, llega con `?data.id=ORD…&type=order`) y la **vuelta del comprador** (`/mp/vuelta`). En los dos, el servidor consulta la order a Mercado Pago y revisa que la referencia, la moneda y el monto calcen. Lo anota una sola vez: plan → fila en Pagos con medio "Mercado Pago"; suscripción → +30 días de acceso. Lo que diga la URL de vuelta nunca hace que la pantalla diga "Pagado".
- **Firma del webhook:** `x-signature` (`ts`, `v1`), HMAC-SHA256 de `id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;` con `MP_WEBHOOK_SECRET`.
- **Ventas ajenas:** las orders que no creó la app se ignoran.

**Conectarlo:**
1. En [mercadopago.cl/developers](https://www.mercadopago.cl/developers/panel/app) → *Crear aplicación* → Checkout Pro.
2. **Para probar:** crea *cuentas de prueba* (un vendedor y un comprador). La Orders API **no acepta "credenciales de prueba"** (`invalid_credentials`): usa las **credenciales de producción de la cuenta vendedora de prueba**, y paga con la cuenta compradora de prueba.
3. Pon el Access Token en `.dev.vars` (`MP_ACCESS_TOKEN=APP_USR-...`). Publicado: `npx wrangler secret put MP_ACCESS_TOKEN`.
4. Publicado: en la app de Mercado Pago, *Webhooks* → URL `https://<tu-dominio>/api/mp/webhook`, evento **Order (Mercado Pago)**. Copia la clave secreta a `MP_WEBHOOK_SECRET` y pon `PUBLIC_URL` en `wrangler.jsonc` (con https, Mercado Pago también devuelve al comprador solo: `auto_return`).

Con la cuenta real de Endémico solo cambia el token: la plata cae en su cuenta.

**Probarlo sin cuenta:** `scripts/mp-mock.mjs` imita la Orders API (crear, consultar, pagar/rechazar). Instrucciones al principio del archivo.

**Base publicada creada antes del 5 de noviembre:** correr una vez `scripts/migrate-planes.sql` (ya corrido en la de endemico.jpfraneto.com).

## Correrlo en local

```bash
npm install
cp .dev.vars.example .dev.vars   # y pon tu ANTHROPIC_API_KEY (solo para la foto de la pizarra)
npm run db:reset                 # base local con datos de demo
npm run dev                      # http://localhost:8800 (desde el teléfono, misma red: http://<ip-del-mac>:8800)
```

Puerto 8800 (8787 lo usa otra app, 8799 es La Junta).

**Datos de demo:** 26 alumnos con nombres inventados (`is_demo = 1`), ~75 días de asistencia y pagos. Seba (coach) y JP (alumno). JP **no** tiene check-in hoy, para hacerlo en vivo. Hay 1 transferencia por confirmar (Constanza Silva), 3 ausentes y 2 pagos vencidos. `npm run db:reset` lo deja todo igual de nuevo.

**URLs útiles:** `/c/puerta-endemico-2026` (lo que abre el QR) · `#/puerta` (afiche) · `#/coach/planilla` (mejor en pantalla grande) · `#/semana`.

## Publicarlo (Cloudflare)

```bash
npx wrangler d1 create endemico        # copia el database_id a wrangler.jsonc
npm run db:reset:remote
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

**Seguridad del sitio publicado:** con `DEMO_OTP=1` los alumnos ven su código en pantalla (datos de demo). El número de Seba nunca muestra el suyo: entra solo con `COACH_CODE`. Con alumnos reales: conectar WhatsApp, poner `DEMO_OTP` y `DEMO` en `""`, y cambiar `DOOR_KEY` (hoy es pública: el modo demo la usa para "simular" el escaneo) y reimprimir el QR.

## Lo que falta para usarlo de verdad
- Envío real del código por WhatsApp (Meta Cloud API).
- Las columnas reales del Excel de Seba (el import busca "Nombre", "Teléfono", "Plan", "Monto" en la primera hoja; el export sale con 3 hojas). Diseñarlas con él.
- Probar con una cuenta de prueba real de Mercado Pago (hasta ahora solo contra el mock).
- Suscripción con cobro automático cada mes (Suscripciones de Mercado Pago pide el email del comprador; hoy es un pago de 30 días).
- Editar la semana a mano en la app (la API `PUT /api/coach/semana` ya existe; falta la pantalla).
