# TASTE: how El Taller reels should be cut (the pipeline's memory)

The planner (`tools/plan_episode.py`) reads this file every time it plans an episode. It is how JP's feedback
carries from one episode to the next: when JP says "the hook was weak" or "too many callouts", the lesson lands
here (by hand, or `tools/episode.py <ep> learn`), and tomorrow's episode is planned with it.

Keep it short and concrete. Newest lessons at the bottom of each section, with the episode they came from.
If a rule here contradicts an older one, the newer one wins: delete the old one.

## The row
- **2026-11-10, JP: three reels per brand is too much.** "these 3 videos per brand are sucking out the air of the
  room. it is too much for our followers. we need to be MORE precise with the communication. targeted." Same day: "i
  still want to work through the experience of recording the episode of the day and creating N reels out of it." So:
  **one take a day → N reels, as many as the take really has** (not a fixed 3 per brand). Each reel is for one specific
  viewer, says exactly one thing, and nothing else: simple, direct, precise. Fewer and sharper beats more.
  Example (Ep. 07): one reel is how to put your page on your own domain, why, and how to keep evolving it, shown with
  only the one-line install. The pipeline and NARRATIVE.md still assume rows of 3 (1/3 caso · 2/3 nudo · 3/3 propuesta).
- Each reel stands alone. 30–60 s.
- **2026-11-12, Ep. 09, JP: the row of 3 = 3 independent reels, the episode is the spine.** "im not attached to them
  being connected to each other… it would be valuable for them to be independent (while always having the broad
  episode as the spinal chord)… a random person looking at this should find value on it." So each reel of the row is
  one idea a stranger can use in their own business, with today's business as the example; no "sigue en 2/3" chain is
  needed for it to make sense (the end card can still invite to the next one). When JP talks a lot, pick the three
  ideas with the most complete reasoning, not the three that tell the episode in order.
- **2026-11-13, Ep. 10, JP: the structure wasn't strong enough** ("it is a story… what is the story they are trying to
  tell? and how can each one of them exist by its own?"). Claude's answer, not yet confirmed by JP: **three scenes, one
  truth.** The row has one sentence (what JP found about the business: "Campo & Mar no vende una familia: vende el sin
  azúcar"). Each reel opens on a scene JP lived (a real moment, a person, a place: a girl in a store, him at the
  register, a school party) → what it reveals → the move a stranger can use, and ends on its own line. The three
  scenes advance: first contact (who you are to a stranger) → the decision (what it costs to come in) → the meaning
  (what you stand for). Look for JP's anecdotes in the take first; they are the reels.
- **2026-11-13, JP: his own takes go to the weekend.** "esas takes mías que salgan durante el episodio podríamos dejarlo
  para el fin de semana." The weekday row is about the business; what JP says about himself (his story, his mission, his
  doubts) goes to `el-taller/fin-de-semana.md` with the minute and the idea, and is cut for the weekend. The planner
  should list those in its notes instead of dropping them.
- **Stories (since Ep. 09): 2 chascarros per episode** (JP: "make two funny videos so that i can post them like stories…
  they also should feel like stories about whatever we discuss on this episode… an entry point for people to discover
  the first reel of today"). Short (15–35 s), the funny bits of the take (a running gag, a slip, the setting), each
  ending on a line that points to that day's 1/3. Not the vulnerable parts (his history with alcohol is not a gag).
  Ep. 09: "EL NOMBRE" (he forgets the business's name 4 times → "ahí hay una invitación" → 1/3) and "OTRA VEZ"
  (the first take got erased; at the end he doesn't know if this one recorded → "sí se grabó: el reel 1/3").

## Cutting
- Open on the strongest sentence of the act, not on the chronological start. Ep. 04 1/3 opened on
  "Siempre me causa gracia que el Seba maneja todo con una planilla Excel", then went back to "este es un gimnasio de un amigo".
- Pieces are short (1–6 s) and can jump around the take: build the argument, not the chronology.
- Drop warm-up talk, logistics ("estoy preparando acá"), repetitions and half sentences.
- 3/3 must show the prototype on screen (phone/laptop recordings) for most of its length; the voice explains, the screen proves.
- End each reel on a line that lands (a claim, a number, a contrast), never on a trailing "entonces…".

## Graphics
- **2026-11-13, Ep. 10, JP: "way more sobrio. just keep it raw."** estilo.json reels.modo = "sobrio" (tools/sobrio.py):
  no graphics, sounds or tag; Spanish one word at a time + subtle English one word at a time (each piece's "en": a
  translation for the internet, not literal: "a little girl walks in with her mom, sees the cookies by the register");
  a news lower third RUBÉN · maestro chasquilla at the start. The rules below are for the old look (modo "").
- An opening **title** (2 lines, the second highlighted) on screen until the first other graphic: it's the hook in the feed.
- **Callouts** only for the 3–5 lines that carry the argument, in JP's own words, 2–3 lines of ≤ 16 characters.
- Show the real thing when it exists: their IG profile screenshot when talking about their IG, B-roll of the place when
  describing it, the prototype recording when describing a feature.
- Stamps for numbers ("5 AÑOS", "$15.000 / MES").
- Never invent facts about the business on screen (Ep. 04: a fake WhatsApp chat implying they don't answer was unfair, dropped).
- Fake/demo names only. Real customers' names never appear.
- What the README lists under "Private, never in a reel" (security holes, numbers told in confidence) never appears,
  even if JP says it in the take.

## Words
- "IA" is allowed: say it plainly when the reel is about what IA did, so people understand. Don't abuse it (at most once
  per caption, not on every cover of a row, no hype); the business stays the headline (NARRATIVE.md voice rule, JP 2026-11-06:
  "we love ai").
- Chilean spelling of what JP says ("podís", "tenís"); the business's name and the owner's name spelled right
  (add to "fixes").
- Hooks for covers: 3 lines, 3–6 words in total, a claim or a tension taken from what JP actually says, one word
  marked `<m>…</m>` (client color). Ep. 04: "MI GIMNASIO / VIVE EN UN / <m>EXCEL</m>", "QUIERO PAGAR. / <m>NO EXISTE</m> /
  EL BOTÓN.", "LE HICE / UNA <m>APP</m> / A MI GIMNASIO". The 3 hooks together tell the episode.
- **Captions are JP's (2026-11-13, Ep. 10): "no quiero que mis posts estén escritos con IA. no no no. quiero escribir.
  soy bueno escribiendo. tengo algo que decir. y ya lo dije en la take."** Claude never writes a caption: publish.json
  leaves them empty, and JP writes each one on the review page (`episode.py <ep> review`: the reel, what he said in the
  take, an empty box). `publish` refuses while any is empty. (Until 2026-11-12 Claude drafted them in lowercase, his
  voice; that rule is retired.) The two breakouts so far (~1.3k views vs ~150) were JP's own story and a proposal shown on the prototype;
  the abstract-thesis reels did worst (Ep. 07: 80–137).

- **2026-11-12, Ep. 09 (feedback from someone close, JP agreed): nothing in frame that reads as unprofessional.** The take was shot in the
  forest with a beer bottle and beer crates as the table: "por querer hacerlo distinto era ruido". The props go out of
  frame (`encuadre.json`: crops that leave them out, the seconds where he drinks are not used), the takes and the
  structure stay. Stories don't play the beer as a gag either. Next takes: a clean table, nothing branded in frame.
- **2026-11-17, Ep. 09 long version, JP: his own story is never cut from the long version.** The draft skipped ~4 min
  where he talks about the beer and his past abuse of alcohol; JP: "esa parte debería estar adentro, es parte de mi
  historia". Reels stay tight and don't play it as a gag, but the YouTube episode keeps what JP tells about himself
  (vulnerable included). Skip there only retakes, dead air, the private things of others (clients, family, numbers)
  and unverified harsh claims about the business, never JP's own story.

## Covers
- Frames of JP: eyes open, looking at the camera, hand away from the face, an expressive gesture; three different gestures.
  ("los screenshots que sacaste de mí son horribles": Ep. 04, before pick_frames existed.)

- **2026-11-13, JP: each row has to read as a chapter, and say whose.** "no está 100% claro que cada línea es algo
  especial… una franja de arte ancestral de la humanidad, hecho de una cultura que tiene una resonancia con la creación…
  cada uno «separa» un reel del otro. y también el thumbnail tiene que mostrar de quién es el capítulo." He chose
  **Mapuche-huilliche weaving, from a real piece photographed** (credit the weaver; no AI-made pattern). covers2 draws it as
  one band across the row (estilo.json portadas.franja; per episode: cover.json "franja") and puts "CAP. NN · MARCA" on the
  middle cover (cover.json "marca"). Test with a placeholder (not Mapuche): el-taller/brand/muestra-franja-ep09.jpg.

## Lessons by episode
<!-- tools/episode.py <ep> learn appends here: one dated block per episode, what JP changed and why -->
- **Ep. 04 (2026-11-05)**: covers v2 "La fila" chosen over a headline-only and an object-only format; the bottom
  progress bar must read as progress ("■□□ ■■□ ■■■"). Prototype days are numbered (Día 1…5), not weekdays.
- **Ep. 05 (2026-11-06, run by Claude end to end; JP hasn't confirmed these yet)**: plan from the take, not from the
  README's acts: JP never walked through the prototype on camera, so 3/3 put his lines about clarity, the walkthrough
  and cupos under the matching prototype screens. JP's first-person stories ("yo estuve a punto de ampliar mi casa…")
  carry 2/3: they speak to any business owner. The planner dropped this one; check for them. A 1/3 hook can be a
  general lesson in his words ("TU PRIMERA VENTA ES TU MAYOR ACTIVO"). When the take and the prototype disagree on a
  number (he said "3 cupos", the page showed 4), change the prototype and re-record. Website screenshots: crop to the
  part he's talking about (the checklist, the m² form); a full desktop page is unreadable on a phone. Never put a
  "¿cómo voy a confiar?" type line on the business's own cover.
- **Ep. 05 v3 (2026-11-06 night)**: JP didn't like v2 ("i honestly didn't like the ones of today too much"). Claude's read,
  not yet confirmed by JP: v2 critiqued the business's website screen by screen, which only matters to that business. Build each
  reel on an idea a stranger would share (Gemini logo / "AI content" label; "la IA también lee tu web"; "muéstrame el avance"),
  with the business as the example, not the subject. Do a real demo when the take suggests one (we asked Claude JP's exact
  question and showed the answer). When the proposal has no screen yet (the build progress), add it to the prototype and record it.
- **Ep. 00 · Empieza aquí (2026-11-08, Claude end to end; JP asked for "something new" instead of 1/3 2/3 3/3)**: the
  pinned row is three questions, not three acts (¿QUIÉN? ¿QUÉ? ¿CÓMO?), taken from JP's own take. When JP records a
  long personal take, cut each reel as one answer plus one idea a stranger can use (WhatsApp is the identity; don't ask
  grandma for her email) plus one proof (the gym app → Seba). Leave out what dates the video or reads as doubt in a
  permanent post (price, cupos, money left, "todavía no lo tengo resuelto"). This take's framing has JP's head high:
  titles/callouts at y≈375, stamps at 440, so text never covers his face.

- **Ep. 06 · TuAuto (2026-11-09, Claude end to end; JP hasn't confirmed these yet)**: the study of the first 15 reels
  (`ep06-tuauto/research/ig-performance.md`) found no winning act or length. The two breakouts open on JP's own story.
  So each reel opens on the strongest line or JP's own stake, and 3/3 shows the result (photo → price → joke) in the
  first 5 s. When JP describes a feature that isn't in the prototype yet (here, the roast), build it and record it.
  Check JP's claims about the business against the data before putting them on screen. He said the brands post was
  their most popular; by likes it was third, so the label doesn't claim "#1". Leave out the price of El Taller even if
  he says it in the take. When the camera sits far from JP, raise `zooms` in reels.json (≈2–2.6).
- **Ep. 07 · Árbol de Lilith (2026-11-10, Claude end to end, JP: "no me pidas permiso")**: JP likes 3 reels a day but not
  all at once, and not three reels on one topic. So: as many reels as the take has **independent ideas**, each with its
  own take a stranger can use without the others (24/7 is a lie · the 3 things to be online · a payment beats a mail ·
  the shame of the camera), the business only where it's the example. Covers carry the business chip only on the reels
  about it (`chips` in cover.json); each reel ends on its own question, not the generic CTA. Leave out what's true but
  unfair in public about a friend. When the take drifts from the README's plan,
  cut what he said, not what was planned.
- **Ep. 07, second cut (same night): the 4 independent reels "lacked substance, no force" (JP deleted the one posted).**
  The force is in JP's *reasons*, not his claims: the first cut kept "la tecnología es como un enemigo" and dropped
  "porque era caro construir tecnología, nadie podía preocuparse de cualquier persona"; kept "24/7 es una mentira" and
  cut right before the payoff ("…para no creernos el cuento… todos tenemos una llama única"). Keep the whole chain
  claim → porque → so-what, in long contiguous runs; never a mosaic of one-liners from all over the take. Every reel must
  leave a stranger with a perspective they didn't have. Back to the row of 3, published together (3/3 → 2/3 → 1/3), at
  least for now; acts can be the take's own spine (here: la vergüenza · la tecnología · la mentira) instead of
  caso · nudo · propuesta, and the business can go unnamed when the idea doesn't need it (`fila: true` in cover.json
  keeps "SIGUE ›" with custom act names).

- **A prototype's look comes from the business's own physical brand, not from a generic app.** (2026-11-13, Campo & Mar:
  "esta página debería tener un estilo gráfico… una identidad que permitiera que se conozcan".) Find their sign, their
  packaging, their shop front, and build the site from it: Campo & Mar = the wine plate of the Castro sign, cream letters, a
  double fillet, tracked caps, the turquoise of the Ancud door. Rounded cards and pills read as a template. Where they are goes
  on a map drawn in that same style (`ep10-campoymar/prototype/tools/mapa.mjs`), not as a list of @s.
- **A client's page is one walk, not a thread of things that coexist.** (2026-11-13: "la página no tiene secciones
  cohesivas… es como un hilo de distintas cosas".) Few sections in the order a customer thinks (what you make → order it →
  what's coming → where → for businesses), each with the same anatomy (rótulo · title · one action), and the action of one
  feeds the next (the catalog fills the order). Pickup points come from where they really are (Campo & Mar: Puerto Varas too).
- **An account's reels share one character you recognise in a second, and the site wears it too.** (2026-11-17,
  @parcelasyterrenos: the realistic Google Earth flight "doesn't have character… anyone that watches a video coming out of
  this account feels like 'OH that's similar and i get it'. character is a MUST.") Realism alone is generic footage: print
  it into the account's world (there: the yellow pages, halftone ink on yellow paper, guide word + scale + listings in
  columns, the directory ad) and keep the same pieces in every reel and on the page.
- **Information unfolds with the video; it doesn't land in one card at the end.** (Same day: "esta información debería
  ir saliendo a medida que avanza el video".) One line at a time, timed to what's on screen.
- **A listing reel is an invitation to live there, so it shows life.** (Same day: "el video debería invitar a vivir a
  chile… volvamos a la 'vida'… cada lugar de chile tuviera fotos".) Real photos of the places the video goes through
  (free licences, author + licence on screen: `ep08…/prototype/scripts/fotos_lugares.py`), not only maps and numbers.
