# El Taller: the shared story

References: `referencias/cachetada.md` (Juana Tormey's CACHETADA: structure of an episode, titles, series).

What someone should understand in **5 seconds** on the profile:

> This person takes real businesses, finds where they lose energy, and proposes (and builds) a concrete fix, so the people in that business can be more human.

Every decision below serves that sentence. The whole account is El Taller: **@eltallerconjp**. @jpfraneto stays as Anky.

**Voice rule: say "IA" when it helps people understand, don't abuse it.** People know about IA and think about it; JP loves it. When a reel or caption is about what IA did (built the prototype, made the renders, answers the WhatsApp), name it plainly so people get it. Don't abuse it: not in every title, no hype words ("revolución", "el futuro"), and the business and its people stay the headline, IA is how. Rough measure: at most one mention per caption, and not on every cover of a row. (Until 2026-11-06 the rule was "never say IA"; JP: "people think about IA. they know about IA… we love ai".)

---

## 1. The thesis (the reason for every episode)

**Quitarle la burocracia a los negocios, para que las personas vuelvan a ser personas.**

Brand line: **Cuéntame de tu negocio y te doy ideas.** (until 2026-11-05: "Inteligencia para Negocios Modernos")

Each episode proves the thesis on one real business. The thesis never changes; only the business changes. Lines from the takes that already say it:

- "Parecemos robots porque hacemos trabajo de robots." (ep01)
- "Hasta ahora la mente es la que comanda. De ahora en adelante, el corazón." (ep02)
- "Mucha fricción hace que las cosas se quemen." (ep01)
- "Voy a proponer soluciones." (ep01)

## 2. The grid: rows are episodes, columns are acts

**Since 2026-11-10 (JP): no more rows of three.** One take a day → 1 to 5 reels, as many as it really has, each for one
specific viewer saying one thing, published **one per slot** on a schedule (estilo.json "publicacion"), not three at once.
Everything below about rows, acts (caso · nudo · propuesta) and publishing in threes describes Ep. 02–06 and is kept as
history; only the pinned row (Ep. 00) still follows it.

```
            ┌──────────────┬──────────────┬──────────────┐
 PINNED     │   ¿QUIÉN?    │    ¿QUÉ?     │    ¿CÓMO?    │  ← "Empieza aquí" (Ep. 00), never moves
            ├──────────────┼──────────────┼──────────────┤
 newest →   │ EP03 · CASO  │ EP03 · NUDO  │ EP03 · PROP. │
            ├──────────────┼──────────────┼──────────────┤
            │ EP02 · CASO  │ EP02 · NUDO  │ EP02 · PROP. │
            ├──────────────┼──────────────┼──────────────┤
            │ EP01 · CASO  │ EP01 · NUDO  │ EP01 · PROP. │
            └──────────────┴──────────────┴──────────────┘
```

- **Left column, 1/3 · EL CASO:** who they are and what they do well. Respect first: we show the business as worth studying.
- **Middle column, 2/3 · EL NUDO:** where the energy is lost. One friction, with screenshots of their real IG or website.
- **Right column, 3/3 · LA PROPUESTA:** "aquí estoy, esto propongo." The concrete fix, shown as a mock or prototype, never just described.

Someone scrolling down the right column sees every proposal. Someone scrolling the left column sees every business. That's the cohesion.

### Grid mechanics (easy to break)
- ~~Always publish in threes~~ (until 2026-11-10; now one reel per slot, see above). Rows of 3 went out 3/3 → 2/3 → 1/3 so 1/3 landed on the left.
- **Pin exactly 3 posts or none.** Pinning 1 or 2 shifts every row. The pinned row is **Empieza aquí** (Ep. 00, published 2026-11-08: three questions a stranger asks, ¿quién? · ¿qué? · ¿cómo?, not acts; see `ep00-el-taller/README.md`; it replaced the La Tesis plan), so no episode loses a tile. After pinning, check the order on your phone (pinning order decides position).
- **The pinned row never ages:** no price, no cupos, no dates, no "busco N personas". What changes lives on jpfraneto.com and in DMs. It's the one place in the account where jpfraneto.com is named.
- **No collab posts from client work.** A collab drops a single tile into the grid and breaks the rows. Share client work in Stories instead (see Highlights).
- The profile grid crops covers to **3:4**. Design covers in 1080×1440 safe area inside the 1080×1920 frame.
- Mobile shows 3 columns. Desktop web may show more; ignore it, almost everyone visits on a phone.
- **Don't redo old covers to match new ones.** The cover style changes as the show improves (Ep 02–03: big @handle; Ep 04+: hook headline), and the grid shows that evolution in real time (JP, 2026-11-08). Only the current episode follows the current style.

## 3. Covers

**From Ep. 04 on: covers v2 ("La fila")**: the workshop still runs across the row, but each cover also stands alone: a hook from JP's own words, JP cut out (a good frame: eyes open, looking at camera), the business chip, the act tag and a progress bar ■□□ ■■□ ■■■. Spec, how it's made and how to pick frames: `../PIPELINE.md` §3. Generator: `tools/covers2.py`, configured per episode in `cover/cover.json`.

### Up to Ep. 03: one image per row (`tools/covers.py`, per episode `make_cover.py`)

Each episode's 3 covers form one image across the row:

```
┌──────────────────┬──────────────────┬──────────────────┐
│            EL TALLER · EPISODIO 3                       │
│        (their pfp)  @their_handle  (big)                │
│              RUBRO · CIUDAD                             │
│                  you at the bench                       │
│   the empty workshop (brand/taller-vacio.jpg) behind    │
│   1/3 EL CASO   │   2/3 EL NUDO   │   3/3 LA PROPUESTA  │
└──────────────────┴──────────────────┴──────────────────┘
```

Same layout every episode; only the handle, the profile picture and your pose (a still from that take) change.

## 4. Inside every reel

- Top tag, always visible: `EL TALLER · EP 02 · 2/3`
- 30–60 s, one idea, hook in the first sentence.
- Captions in the existing reelkit style.
- End card (`tools/reelkit.py` → `EndCard`): EL TALLER · episode pill · CTA · `CUÉNTAME DE TU NEGOCIO Y TE DOY IDEAS` · **@eltallerconjp**. The CTA points to the next act (`→ 3/3 La propuesta`), or on 3/3, `¿Quieres que analice tu negocio? Coméntalo abajo.` Handle and tagline are the `HANDLE` / `TAGLINE` constants in reelkit.

## 5. Captions (post copy) template

**Since 2026-11-13 JP writes every caption himself** (review page, `episode.py <ep> review`); Claude doesn't draft them.
The template below is history.

```
<hook: one line, a question or a claim>

<2–4 lines: the point of this act>

El Taller · Ep. 02 · Constructora Aubel · 2/3
← 1/3 el caso · 3/3 la propuesta →

<CTA: only on 3/3> ¿Quieres que analice tu negocio? Coméntalo abajo.
#ElTaller + 3–4 specific tags (#emprendimiento #negocios #puertovaras …; #IA only when the reel is about it)
```

Tag the business in 1/3 (@constructora_aubel) as a mention, **not** as a collab.

## 6. Profile (decided 2026-11-02)

Rename the existing @jorgefranetoviciv account (keeps its history and followers).

| Field | Value |
|---|---|
| **Handle** | `@eltallerconjp`: say it out loud "el taller con jota pe" |
| **Name** | `El Taller con JP` |
| **Bio** (115/150, edited by JP; set on IG 2026-11-08, replacing a 150/150 bio whose CTA hid behind "more") | see below |
| **Link** | jpfraneto.com |
| **Photo** | the El Taller logo (`brand/logo/`, proposals 2026-11-05: el caballete · el galpón · el sello) |

```
Cuéntame de tu negocio y te doy ideas.
Analizo un negocio real, propongo ideas, y las construyo.
↓ Comenta tu negocio
```

Before launch: **archive** the 3 current posts (desk selfies, GPU). Archived posts can be restored anytime, and the grid starts clean with La Tesis.

**Highlights** (optional, only if JP ever wants Stories):
- **Qué es:** 3 stories: the thesis, the format, how to apply.
- **Postula:** how to send your business (= comment on any reel).
- **Construido:** what actually got built (La Junta prototype, Nacemos site, client reels). This is the proof that the proposals are real.
- **Respuestas:** replies to comments, re-shared from Stories, plus what the businesses said back. The follow-up is part of the story.

## 7. Episode lifecycle

1. **Pick** a business that sells on Instagram (check earlier episodes: no repeated ideas; see `../README.md`).
2. **Before recording:** in the episode README, write the 3 acts in one line each. Then record **one long take**, loosely following that map.
3. **Cut** 3 reels, one per act. Screenshots of their real IG/website as overlays.
4. **Publish** the row: 3/3 → 2/3 → 1/3, same day.
5. **DM the business the published reels** the same day, plus the prototype link (links inside reels can't be tapped). Anything sensitive, like a security hole, goes only in private.
6. **Follow up** in Stories → Highlights (Respuestas / Construido).

## 8. Launch plan (updated 2026-11-02)

**The account launches with Episodio 3 · La Junta as its first row** (the first episode built for this format). Numbering stays "Episodio 3".

| Order | Row | State |
|---|---|---|
| 1 | **Episodio 3 · La Junta** | **published 2026-11-02** |
| next | **Episodio 0 · jpfraneto.com** (pinned row) | record 2026-11-03. JP is cupo #1 of the **Temporada Génesis** (6 cupos, día 1 = 2026-11-02): see `temporada-genesis.md` |
| later | **La Tesis** (pinned) | pinning puts it on top whenever it's published |
| next | **Episodio 2 · Aubel** | re-recorded and cut 2026-11-03 as 3 standalone reels (Escuchar · La historia · El después); JP reviewing (see `ep02-aubel/README.md`) |
| later | Ep 01 El Galpón | recut into 3 acts, or retire |

## 9. The replies are the work (decided 2026-11-02, DMs reopened 2026-11-08)

**DMs are open** (message requests: "Everyone", since 2026-11-08). Closing them on 2026-11-02 was a mistake (JP: "that was a stupid decision"): the real leads (Iván, Seba, La Junta) were talking to us in DMs anyway, and a business that wants to pay shouldn't hit a closed door. **We follow no one** (following: 0). **Two doors:** comments are the public one (every good answer is also content), DMs are where the business conversation happens (prices, WhatsApp, private details). Answering both is the job.

- **Every comment gets a real answer, the same day.** Not "🙌 gracias", but a sentence that adds something: a question back, a mini-idea, a link to the episode that covers it.
- **When someone names their business:** ask the two questions that matter, in public: "¿Cuál es tu IG? ¿Qué es lo que más te cuesta hoy?" Log it in `postulaciones.md` (next episode candidates).
- **Stories are now the casting room** (changed 2026-11-08, see §10). Replies still live in the comment thread. If a reply ever deserves video, a Story keeps the grid clean; a "reply with reel" would land on the grid and break the rows.
- **Pin** the best comment, or your best reply, under each reel.
- **Close the loop:** when a business from the comments becomes an episode, reply in their original comment with the link.
- The CTA on reels stays **"Coméntalo abajo"**: a public comment feeds the algorithm and the next episode. DMs are open for anyone who prefers to write privately; no need to push them.

## 10. Tú eliges · sell less (decided 2026-11-08)

JP: "we should stop selling myself this hard". The account gives value; the product stays hidden, and whoever wants more goes looking for it. Proof that pull works: Lalo asked for the price twice on his own.

- **The poll (Stories):** 3 businesses, followers vote, the winner is the next episode. Three candidates from La Cantera (`leads/`), only ones who already show their face on camera. **Before they go in the poll, DM each one** ("te nominamos para El Taller, ¿te animas?"). That message is the outreach, and nobody loses in public without knowing. The ones who don't win get their ideas by DM and stay in for the next round.
- **The daily Story:** "¿Qué negocio analizo?" with a question sticker. People send in their IG. Every answer goes into `postulaciones.md` (column "Dónde comentó" = `story`), and the good ones go into the next poll.
- **No selling in reels or captions.** The CTA stays "Coméntalo abajo". jpfraneto.com shows up only on the pinned reels (La Tesis / Ep 0).
- **Price and the 30 days only in DMs or WhatsApp,** when someone asks. Bio link: jpfraneto.com (decided 2026-11-11; it is now the El Taller page).
