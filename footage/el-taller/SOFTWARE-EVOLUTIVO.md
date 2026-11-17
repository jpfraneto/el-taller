# Software evolutivo: one thing, one domain, many products competing for it

Written 2026-11-10 for Ep. 07 (Árbol de Lilith), the first thing run this way. Status: **the router and two products are
built and tested locally** (`ep07-arboldelilith/prototype/`, not deployed); the featured page on jpfraneto.com and outside
submissions are not built. The episode: `ep07-arboldelilith/README.md`.

> "Hola, soy JP y este es el demo de software evolutivo." (JP's opening line for the Ep. 07 take)

## 1. The unit: a "cosa"

A brand, a project, a "thing" (**una cosa**) is three parts that only make sense together:

| Part | What it is | Árbol de Lilith |
|---|---|---|
| **Persona** | the human it belongs to | Pili (Pilar Abarzúa) |
| **Negocio** | what that person gives the world and lives from | women's circles, workshops, Tarot Madre Paz, therapy (Gestalt, menstrual, Biografía Humana), Bendición de Útero |
| **Interfaces** | every surface where that person meets herself (and her people meet her) through the AI agent | the domain `arboldelilith.jpfraneto.com`, IG `@arboldelilith`, her WhatsApp, her amigo imaginario (El Taller folder, `../../os/`), her email |

The AI agent is a service the persona uses to see her own business: El Taller's *amigo imaginario* (`os/README.md`).
The interfaces are the windows. The product at the domain is the window her people see.

## 2. The niche: the domain + the handle

A cosa owns one **niche**: its domain (`<slug>.jpfraneto.com`) and its handle (`@<slug>`). The niche serves **one
product at a time**, the **champion**. Every other product built for that cosa is a **challenger**.

Products are disposable. The niche and the cosa's data aren't.

## 3. The loop (it's El Taller's Método, with more than one builder)

The Método on jpfraneto.com is turns ("vueltas"): observe → build → put it in the world → listen. Software evolutivo
is the same loop where **anyone can do the "build" step**, and the cosa picks:

1. **Variation.** Anyone submits a product for the cosa: JP, another builder, or an agent run on a hypothesis
   ("a challenger for arboldelilith where the moon calendar is the home page"). Each gets its own preview URL.
2. **Selection.** **The persona decides** which product is champion. Usage from her real people informs it
   (inscriptions completed, questions answered, what they ignored), but it's her cosa: she picks, from her phone.
3. **Inheritance.** The champion's code and everything the cosa has learned (its data, its content, `cosa.json`) are
   what the next challengers start from. A challenger that loses still leaves its good ideas in the lineage.

Each cycle is one vuelta. The lineage is a tree (for Pili's cosa that's literal: her brand is a tree).

## 4. The rule that makes it work: data and login belong to the niche, not to the product

If each product kept its own users and records, swapping the champion would lose Pili's inscriptions, and her people
would have to log in again. So:

- **One router Worker owns the domain** (`arboldelilith.jpfraneto.com`). It holds the pointer "champion = X" (one value
  in KV/D1), serves the champion, and serves a challenger to whoever opens a preview link (`/?probar=<id>`, kept in a cookie).
  Swapping champion = changing one value. Instant, reversible, nothing redeployed.
- **The router does the login, once, for every product.** Phone number + 6-digit code (ep04's `authStart` / `authVerify`,
  demo code 888888 while it's a prototype; WhatsApp Cloud API when her amigo has its own number). The persona logs in
  with a private link JP sends her by WhatsApp (ep04's `COACH_CODE` idea): one tap, no password. The router passes
  each product a signed header (`x-cosa-user: {phone, role: "duena" | "persona"}`). **Products never implement login**:
  that's how login stays seamless across every product that ever holds the niche.
- **The cosa's data lives in the niche's D1 database** (`arboldelilith`), behind a small stable contract (§5). Products
  read and write through it. A new champion sees every inscription the old one took.

Multi-level subdomains (`x.arboldelilith.jpfraneto.com`) aren't covered by Cloudflare's free certificate, so challengers
live at `arboldelilith.jpfraneto.com/?probar=<id>`, not on their own subdomain.

**As built (v0): a product is a folder of static files** (`public/p/<id>/`: HTML, CSS, JS) that talks to the router's API.
No server code per product. That turned out to be the right shape: a product is cheap to make (jp-02 was one screen on top of
what it inherited), anyone can submit one, and reviewing a submission means reading front-end code, not a server. If a future
product needs its own server logic, that's the moment for a separate Worker behind a service binding.

## 5. The contract a product can count on

What the router gives every product (v0, write it down before the second product exists):

| | |
|---|---|
| `GET /api/cosa` | `cosa.json`: persona, negocio, interfaces, palette, the content it can show (§6) |
| `GET /api/yo` | who's logged in (or nobody) and their role |
| `/api/eventos` (+ `/inscribir`) | the offerings: circles, workshops, readings, with date, place, modality, cupos, price tiers |
| `/api/personas` | her people (dueña only): who signed up for what, paid or not |
| `/api/pagar` | a Mercado Pago link for an inscription (her account; until then hidden, like ep04) |
| `/api/mensajes` | what people wrote (questions, answers to her prompts), dueña only |

A product is anything that turns these into a good experience. Two products can disagree completely about the
experience and still share the data.

## 6. `cosa.json`: the cosa as data

Lives with the episode (`ep07-arboldelilith/cosa.json`), served by the router. It's the brief every challenger reads first,
human or agent: who the persona is, in her words; the negocio; the interfaces; the visual direction (palette, type,
imagery); what's private; what the current champion believes the job is. **Facts come from her own posts, never invented.**

## 7. On El Taller: `jpfraneto.com/<slug>`, the featured page

Each cosa gets a page on jpfraneto.com (not built yet; jpfraneto.com is one screen since 2026-11-10, so this would be
the first path besides it). One screen, same spirit:

- **Who**: persona + negocio in two lines, her picture, her handle.
- **The champion**: a phone mock of what's live at the domain, "Abrir" → the domain.
- **The lineage**: the tree of products (champion highlighted, challengers as branches, each with its author and the one
  idea it tried). Tap one → its preview (`?probar=`).
- **"Proponer un producto"**: how to submit. v0 is honest and manual: a WhatsApp to JP with the product folder (a repo or a
  zip) + one sentence ("qué crees que necesita Pili"). JP reads the code before it gets near her domain, copies it to
  `public/p/<id>/`, adds a line to `productos.json`, and it appears as a branch in Pili's tree. Never proxy someone else's
  hosted site under her domain: it would share her login.

## 8. The video is the delivery

The episode doesn't describe a product, it hands one over: JP to camera ("soy JP y este es el demo de software
evolutivo"), the cosa explained in a sentence, the champion working on screen, and the invitation to build a challenger.
JP talking straight to the camera is the format that works (Ep. 00 1/3, the account's best reel: `ep06-tuauto/research/ig-performance.md`).

## 9. Open questions (decide before building the shared parts)

- Who can submit: anyone, or builders JP invites? (Moderation is JP reading code; that doesn't scale past a few a week.)
- Does Pili see challengers before they're public on the lineage page? (Recommended: yes. She approves what's shown under her name.)
- Does traffic ever split automatically (A/B), or is it always her pick? (Recommended: always her pick in v0.)
- Is `<slug>.jpfraneto.com` the long-term home, or does a cosa graduate to its own domain (`arboldelilith.cl`)? The router
  design doesn't change; only the route does.
- Is there money for a challenger that wins? (Not in v0. Worth deciding before inviting other builders.)
