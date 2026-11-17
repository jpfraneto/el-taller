# Árbol de Lilith · prototipo (El Taller Ep. 07, software evolutivo)

**Live (demo) since 2026-11-10: https://arboldelilith.jpfraneto.com** (Worker `arboldelilith-app` + D1 `arboldelilith`).
Local: `npm install && npm run db:reset && npm run dev` → http://localhost:8807 · Why it's shaped like this: `../../SOFTWARE-EVOLUTIVO.md`.

## What's here: one niche, two products

| | What | Where |
|---|---|---|
| **The router** (the niche) | Owns the domain, the login, the data and the payments. Serves the champion at `/`; `?probar=<id>` serves a challenger to whoever opens it (cookie; `?probar=` goes back). Products never do login or keep data. | `src/worker.js`, `schema.sql` |
| **jp-01 «La próxima luna»** (champion) | Home = her next circle, in her poster's look (moon, chips, aporte). **Pagar y asegurar mi lugar** (pay right there) or **Inscribirme sin pagar**. Then "Más adelante", the **1:1 hour card**, "Lo que ofrezco" (tarot/terapia → the 1:1 hour; the rest "Quiero saber más" → her inbox), her question for this moon. | `public/p/jp-01/` |
| **jp-02 «Te leo»** (challenger, child of jp-01) | Home = today's moon (computed: phase + archetype) over her forest, and her question big. **Responderle** → private message to Pili → "si quieres vivirlo acompañada" → the circle. Below: the next 6 moons with the circle on each, then the 1:1 hour card ("¿Prefieres a solas?"). | `public/p/jp-02/` |
| **Shared** (what products inherit) | Her palette and type, the phone login sheet, **"Quiero ir"** (presencial/online, your place + gifted places, pay or not, result + calendar + "avisarle por WhatsApp"), **"Una hora 1:1"**, the payment step, the "estás probando" ribbon, the moon math (Meeus). | `public/comun/` |
| **/pili** (her console, the niche's) | **Quién viene** (first the 1:1 hours: who, for whom, what, when suits, paid, "Escribirle" with a message ready, "Ya la agendamos" → "Hecha"; then per circle: paid / unpaid / waiting, collected, "Pagó por transferencia", WhatsApp each one, copy a reminder) · **Te leen** (messages) · **Nuevo** (circle or workshop: suggested moon dates, her places, cupos, price by date, her question) · **Tu árbol** (the products, "Probarla", "Elegir esta" → the domain changes at once). | `public/pili/` |

**Who gets a place (JP, 2026-11-10):** paying locks it; signing up without paying is allowed; when places run out, paid ones
win. Computed on every read (`lugares()`): paid first by when they paid, then unpaid by when they signed up; the first `cupos`
have a place. A payment can push the most recent unpaid sign-up to the waiting list, never a paid one. Paying is refused only
when every place is paid. Flip to first-come-first-served: `PRIORIDAD_PAGADAS = false`.

**Gifting places (JP, 2026-11-10: "comprar más de un cupo, para regalarle a otra persona, y poner al tiro eso para otra persona"):**
in "Quiero ir", "+ Regalarle un lugar a otra persona" (up to 5): her name, and her WhatsApp if you have it. One payment covers
all of them (`compras`). Each gifted place is that woman's own inscription (`regalo_de` = who gave it): logging in with that
number, she sees "Tu lugar está asegurado · regalo de Rosa". After paying, "Avisarle por WhatsApp" opens a chat with the message
ready (or "Copiar mensaje" without a number). Paying for N places needs N places not yet paid; gifting someone who already has a
place is refused. Pili sees "🎁 regalo de Rosa" in her list.

**The 1:1 hour (JP, 2026-11-10: "una hora 1:1 por 40 lucas"):** $40.000, 60 minutes (`SESION` in the worker; `SESION_PRECIO`
var to change the price). For me or to gift; tarot / terapia / conversar; presencial (Llanquihue) or online; "¿cuándo te
acomoda?" free text; pay now or "pagar después". **No calendar**: Pili agrees the day by WhatsApp from her console. That's on
purpose until we know her real availability.

## Logins
- **Her people:** phone → 6-digit code. Prototype (`DEMO_OTP=1`): the code is **888888** and appears on screen as a fake
  WhatsApp message. Production: send it with the WhatsApp Cloud API (`authStart`, one marked line).
- **Pili:** `https://arboldelilith.jpfraneto.com/pili/entrar/<PILI_KEY>`. One tap, no code. The key is in `../.pili_key`
  (git-ignored; locally in `.dev.vars`). Send her that link by WhatsApp. Changing the secret invalidates the old link.

## Payments
- Without `MP_ACCESS_TOKEN`, "Pagar" opens a screen that says it's a **test** ("no se cobra nada") and marks it paid.
- With **Pili's** Mercado Pago token (her account, her money; never JP's production one): Checkout Pro through the Orders API,
  `/mp/vuelta` + `/mp/webhook` (signature checked), recorded once (ported from ep04).
- Transfers: Pili marks them in /pili.

## Demo data (`scripts/seed.mjs`, `npm run db:reset`)
Invented women (first name + initial, phones 5690000xxxx). Real: the circle names, places, prices and questions from her posts,
and the dates (next full moon, the solstice, computed). Not real: that these events exist. **Confirm her next real circle.**
Luna Llena: presencial 8 paid (one a gift) + 5 unpaid of 15 (2 left), online 2 + 2 of 10. Two 1:1 hours asked (one a gift, unpaid). Champion: jp-01.

## Checked (2026-11-10, local)
Routing (`/`, `/app.js`, `?probar=`, `/pili`, `/comun`), login, free sign-up, pay (test), gifts (3 places in one payment;
the gifted one logs in and sees it; too many / same person refused), the 1:1 hour as a paid gift → in Pili's console, priority (a waiting-list payer gets
the place, the latest unpaid moves to waiting), Pili's link (wrong key → 403; a persona → 403 on /api/pili), "Elegir esta"
changes what `/` serves, messages. Looked at on a phone-width window: both products, the sheets, /pili.

## Deploy (when Pili says yes)
```sh
npx wrangler d1 create arboldelilith        # paste the id into wrangler.jsonc
npm run db:reset:remote                     # schema + demo data
npx wrangler secret put PILI_KEY            # paste ../.pili_key
npm run deploy                              # custom domain arboldelilith.jpfraneto.com
```

## Adding a product (a challenger)
A product is a folder `public/p/<id>/` with an `index.html` (served at `/`) and whatever files it references relatively.
It talks to `/api/*` (contract: `../../SOFTWARE-EVOLUTIVO.md` §5) and may import `/comun/lilith.js`. Add it to
`src/productos.json` (id, nombre, autor, cree_que, padre) and it shows up in Pili's tree. No server code per product.

## To confirm with Pili
Her WhatsApp (`PILI_WA`), her next real circle, Mercado Pago or transfer only, the logo file (this one is cropped from a reel),
permission for the forest photo and the logo, and whether the online circles are zoom.
