# Árbol de Lilith · prototype brief (product jp-01, the first champion)

**Status: built (see README.md). This was the plan.** Read first: `../cosa.json` (who she is, her palette, what's private) and `../../SOFTWARE-EVOLUTIVO.md` (why login and data
live in the router, not in this product). Live target: **https://arboldelilith.jpfraneto.com**. Nothing is built or deployed yet.

## The job, in one line
"La próxima luna, a un toque." Today every inscription passes through Pili's hands ("escríbeme INVIERNO por interno",
seven years of "déjame tu mail"). The product takes that off her, in her own look, so her energy goes to holding the circle.

## Screens (phone first, one screen each, her look)

**For her people (no login to look, phone + code to sign up):**
1. **Hoy** (home). Today's moon (phase computed in the browser, not invented), her question for this moon in her words
   ("¿Qué necesita más descanso en ti hoy?"), and the **next circle** as a card: name, date, time, place, presencial/online,
   cupos left (live), aporte. One button: **Quiero ir**.
2. **Inscribirse.** Name + phone → 6-digit code (demo 888888) → presencial or online → pay the aporte (Mercado Pago, hidden
   until her token exists, like ep04) or "pago por transferencia" (she confirms by hand) → "Te esperamos" + add to calendar.
   Online: the zoom link arrives by itself the day before. Early-bird prices by date (her 2024 workshop had 3 tiers) work on their own.
3. **Te leo.** Her posts end with a question and "te leo". Here a woman can answer the moon's question privately: it goes
   to Pili, not to a comment section. (Optional for jp-01: build it if time allows; it's the most "her" feature.)
4. **Lo que ofrezco.** Círculos, talleres, tarot, terapia: one line each, in her words, each with "Quiero saber más"
   (→ her WhatsApp once she says which number; until then a form that lands in her inbox).

**For Pili (`/pili`, one-tap login from a private link JP sends her by WhatsApp):**
5. **Quién viene.** The next circle: inscritas, presencial/online, paid or pending (tap to mark a transfer as paid),
   "mandar mensaje a todas". Cupos close by themselves.
6. **Nuevo círculo.** Name, date (suggested: next full/new moon, solstice), place (her list), cupos, aporte, price tiers,
   the poster text. Saves, and it's live.

## Demo data (fake names only)
- Next circle: **Círculo de Luna Llena**, Tue 24 Nov 2026 (approximate full moon: compute it in code, don't hardcode), 19:00,
  Club Lunera, 15 presencial + 15 online, aporte $15.000, 9 inscritas with invented names.
- Then: **Solsticio de verano**, Mon 21 Dec 2026, Anahata Lodge. And one workshop with two price tiers.
- All circle/place names are hers (from her posts); dates and counts are demo. Confirm real ones with Pili before she sees it.

## Look
Her 2026 identity (cosa.json → estilo): cream paper background, serif with rose-clay italics, mauve chips with icons,
watercolor logo, misty forest photos from her own posts (`../assets/ig/2026-06-*`, with her permission before going public).
Logo: crop it from `../assets/ig/2026-06-26-reel-a-veces-creemos-que-podemos.jpg` (large and clean) or ask her for the file.

## Build
- Start from ep04 (`../../ep04-endemico/prototype/`): Worker + D1 + static, phone login with `DEMO_OTP`, owner code
  (`COACH_CODE` → here `PILI_CODE`), Mercado Pago Orders API + webhook, bottom sheets. Use `tools/new_episode.py`'s
  copy logic or copy by hand without node_modules/secrets.
- Shape it for the router from day one even if there's only one product: put login + `/api/*` (the contract in
  SOFTWARE-EVOLUTIVO.md §5) in one module and the screens in another, so splitting into router + product is a move, not a rewrite.
- To make "evolutivo" visible in the take: build **a second, deliberately different product** (e.g. jp-02 "Te leo first":
  the home is the moon's question, the circle comes after) and the switch (`?probar=jp-02`, and in `/pili` "elegir este").
  Two products + Pili picking = the demo. One product = just another prototype.
- Deploy: `npx wrangler d1 create arboldelilith` → id into `wrangler.jsonc` → `npm run db:reset:remote` → `npm run deploy`,
  route `arboldelilith.jpfraneto.com`.

## To confirm with Pili
- That she wants it (she's a friend; still her name and her people). Which WhatsApp number. Her next real circle.
- Her Mercado Pago account (or transfer only). Whether online circles are zoom or meet.
- The logo file and permission to use her photos.
- Which question per moon (or: she writes them in `/pili`).
