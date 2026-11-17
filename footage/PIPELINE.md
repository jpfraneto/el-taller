# PIPELINE: from the recording to the published row

The goal: **JP records one take → everything else (3 reels, 3 covers, captions, publishing) happens on its own**, with JP only approving at two checkpoints. This file is the plan and the state of that system. Any session (human or Claude) working on an episode starts here, then reads the episode's `README.md` (its To-do says where that episode is).

Related: `README.md` (folder rules, tools), `el-taller/NARRATIVE.md` (the story, the grid, voice rules), `el-taller/TASTE.md`
(JP's accumulated taste: the planner reads it), `tools/*.py` (the code).

**Since 2026-11-05 evening, one command runs an episode** (from `footage/`):

```sh
tools/.venv/bin/python tools/episode.py                      # every episode: where it is, what's next (◆ = JP's turn)
tools/.venv/bin/python tools/episode.py watch                # leave running: AirDrop a take → it runs to the review by itself
tools/.venv/bin/python tools/episode.py ep05-slug            # or run one episode until its next checkpoint
tools/.venv/bin/python tools/episode.py ep05-slug review     # review page on the phone (same wifi): send changes / approve
tools/.venv/bin/python tools/episode.py ep05-slug feedback "…"   # Claude re-plans with JP's notes, drafts re-render
tools/.venv/bin/python tools/episode.py ep05-slug frames 4,1,7   # other cover frames (ranks in cover/frames/candidates.jpg)
tools/.venv/bin/python tools/episode.py ep05-slug approve    # → final reels; the episode's feedback is learned into TASTE.md
tools/.venv/bin/python tools/episode.py ep05-slug publish    # dry run, then asks before posting
```

JP's time per episode: record (~25 min) + review (~5 min per round) + publish (1 min). The rest (~20 min of machine
time for a 25 min take) runs alone. Timings per stage are kept in `<episode>/status.json`.

---

## 0. The shape of an episode

One long take (~20–25 min, phone, vertical) → one row on @eltallerconjp:

| | 1/3 · EL CASO | 2/3 · EL NUDO | 3/3 · LA PROPUESTA |
|---|---|---|---|
| Reel | who they are, what they do well | where the energy is lost | the prototype, working |
| Cover | hook + JP + progress ■□□ | hook + JP + ■■□ | hook + JP + ■■■ |
| Caption | `post-copy.md` | | CTA "analizo tu negocio" |

Published the same day in order **3/3 → 2/3 → 1/3** (so 1/3 lands on the left).

**The pinned row (Ep. 00 · Empieza aquí, 2026-11-08)** is the exception: three questions (¿QUIÉN? · ¿QUÉ? · ¿CÓMO?) instead
of acts, covers from the real frame (`tools/covers_fijados.py`, `cover.json` with `"layout": "fijados"`), top tag from
`reels.json` `"tag"`. Only re-recorded when there's something new to prove (see `el-taller/ep00-el-taller/README.md`).

---

## 1. The stages

Status: ✅ automated (one command) · 🟡 semi (a command, but someone decides/edits) · 🔴 manual.

| # | Stage | Input → output | How | Status | Who decides |
|---|---|---|---|---|---|
| 1 | **Prepare** | idea → `el-taller/epNN-slug/` | `tools/new_episode.py NN slug "Name" --prototype-from ep04-endemico`; README (business + 3 acts); `cover/pfp.png`; assets (screenshots, `assets/rec/*.mp4` screen recordings); adapt `prototype/` (§5) | 🟡 | JP + Claude (the fun part) |
| 2 | **Record** | phone → `.MOV` | one take, 9:16, mic in hand; AirDrop (with `episode.py watch` running, that's all) | 🔴 | JP |
| 3 | **Ingest** | MOV → `proxy/`, `transcript/` | `ingest.py` (~10 min for 25 min) | ✅ | — |
| 4 | **Frames** | take → `cover/frames/` (12 best frames + face position) | `pick_frames.py` (~2 min) | ✅ | — |
| 5 | **Plan** | transcript + README + TASTE + assets → `reels.json`, hooks, `plan-notes.md` (no captions: JP writes them at 8) | `plan_episode.py` (`claude -p`, checked against the transcript, self-corrects) | ✅ | Claude proposes |
| 6 | **Drafts** | `reels.json` → `reels/draft/*.mp4` (B&W, 540×960, 10 fps) | `DRAFT=1 autoreel.py` (~30 s per reel) | ✅ | — |
| 6b | **Stories** | the take's funny bits → `historias.json` → `historias/*.mp4` (2 per episode, each points to that day's 1/3) | Claude writes `historias.json` (same format as `reels.json`), then `PLAN=historias.json autoreel.py <ep>`; the review page shows them; JP posts them by hand | 🟡 | Claude proposes |
| 6c | **Framing rule** | `encuadre.json` → every cut cropped so some things never show (Ep. 09: the beer and the crates) | `tools/encuadre.py <ep>` (face track) + `encuadre.json` (`hide` boxes, `avoid` seconds); autoreel applies it to reels and stories, `--check` rejects pieces in `avoid` | 🟡 | Claude marks the boxes once per take |
| 7 | **Covers** | `cover.json` (hooks from the plan, top 3 frames) → covers + grid preview | `covers2.py` | ✅ | — |
| 8 | **Checkpoint 1** | review page: grid, covers, drafts; **JP writes each caption** under its reel (what he said in the take is right there) | `episode.py <ep> review` → feedback (back to 5) or approve | 🔴 | **JP** |
| 9 | **Finals** | → `reels/*.mp4` | `autoreel.py` without DRAFT | ✅ | — |
| 10 | **Learn** | `feedback.md` → `el-taller/TASTE.md` | on approve (`episode.py <ep> learn`) | ✅ | Claude |
| 11 | **Checkpoint 2** | show the business privately, then publish | `episode.py <ep> publish` (agenda, one reel per slot; then the launchd agent posts each at its time) → `publish_ig.py` | 🟡 | **JP** |
| 12 | **After** | | pin check, music, 3:4 crop check on the phone (the API can't) | 🔴 | JP |
| 13 | **YouTube + free the Mac** | `long.json` (Claude) → long cut public + raw take private (the backup) → the take, `.work/` and the long .mp4 leave the Mac | `episode.py <ep> youtube` (renders, opens Studio, shows the files) → JP drags both in → `youtube <url> raw <url>` → `youtube limpiar` | 🟡 | **JP** drags; Claude writes `long.json` |

Episodes 01–04 were cut by hand (`make_reels.py` + their own `kit.py`): their graphics are richer (the Excel sheet,
the month grid, the capacity room). From Ep. 05 the plan is data (`reels.json`) with generic graphics (§3b); a bespoke
graphic is still possible: add a type to `tools/autokit.py` + `autoreel.py`, then it exists for every later episode.

---

## 2. Commands, stage by stage (as run for Ep. 04, 2026-11-05)

Paths from `footage/`. Python = `tools/.venv/bin/python` (Pillow, numpy). Aligner runs in its own uv env (torch).

```sh
# 1 · new episode
tools/.venv/bin/python tools/new_episode.py 05 slug "Name"

# 3 · ingest: ONE command (does everything below, skips what exists; AirDrop the .MOV into the episode folder first)
tools/.venv/bin/python tools/ingest.py el-taller/ep05-slug
# what it runs, for reference (EP=el-taller/ep05-slug, RAW=raw/<date>_el-taller-ep05_slug/IMG_1234.MOV):
tools/.venv/bin/python tools/proxy.py $RAW $EP/proxy/IMG_1234.proxy.mp4        # 1% size, B&W, same timing
ffmpeg -i $RAW -vn -ac 1 -ar 16000 -c:a pcm_s16le $EP/transcript/IMG_1234.wav
whisper-cli -m ~/models/whisper/ggml-large-v3-turbo.bin -f $EP/transcript/IMG_1234.wav -l es -t 8 \
    -otxt -osrt -oj -of $EP/transcript/IMG_1234                                   # text, srt, segments
whisper-cli -m ~/models/whisper/ggml-large-v3-turbo.bin -f $EP/transcript/IMG_1234.wav -l es -t 8 \
    -ml 1 -sow -oj -of $EP/transcript/IMG_1234.words                              # one word per segment
uv run -q --python 3.12 --with "torch==2.8.*" --with "torchaudio==2.8.*" --with num2words --with numpy \
    python tools/align_take.py $EP/transcript/IMG_1234.wav $EP/transcript/IMG_1234.words.json $EP/transcript/IMG_1234.aligned.json
# + transcript/IMG_1234.timed.txt: ~30 s paragraphs with [mm:ss.s], the one to read when planning cuts

# 5 / 7 · reels
cd $EP && DRAFT=1 ../../tools/.venv/bin/python make_reels.py          # all three, drafts
../../tools/.venv/bin/python make_reels.py 02-el-nudo                  # one final

# 8 · covers (§3)
tools/.venv/bin/python tools/pick_frames.py $EP        # → $EP/cover/frames/candidates.jpg: pick 3, note their seconds
# edit $EP/cover/cover.json (frames, hooks, handle, pfp, accent), then:
cd $EP && ../../tools/.venv/bin/python make_cover.py   # → cover/epNN-cover-{1,2,3}of3.jpg + epNN-grid-preview.jpg

# 11 · publish
python3 tools/publish_ig.py $EP --dry-run && python3 tools/publish_ig.py $EP
```

---

## 3. Covers v2 ("B · La fila", chosen 2026-11-05 for Ep. 04)

**Why it changed.** Up to Ep. 03 the 3 covers of a row were one image (the workshop + the business's @handle in big type across the row). Nice as a row, but each cover alone says nothing (tile 3 was just the workshop), and a reel lives alone in the feed, Explore and the Reels tab. We tried 3 formats (A · Titular: face + headline; B · La fila; C · La prueba: the object, no face; all in `el-taller/ep04-endemico/cover/propuestas/`). **JP chose B.**

**What a v2 row is** (generator: `tools/covers2.py`, config: `<episode>/cover/cover.json`; the 3 original proposals: `el-taller/ep04-endemico/cover/propuestas/`):
- **One 3240×1920 composition** sliced into three 1080×1920 covers: the empty workshop (`el-taller/brand/taller-vacio.jpg`, blurred, darkened) runs continuously across the row → the row reads as one piece, like the earlier rows.
- **On each cover, standalone:** top line `EL TALLER · EP. 04` (yellow) + the business chip (their IG picture with Instagram's ring + `@handle`); a **hook** in 3 lines, SF Pro Display Black 128 px, one word on the client's accent color (Endémico: lime `#4EF03E`); **JP cut out** (Apple Vision, `tools/cutout.swift` via `covers._mask`), from the tabletop up; the act tag `1/3 EL CASO` + `SIGUE ›` (on 1/3 and 2/3).
- **Progress bar:** 3 segments on every cover, filled up to that act, the current one glowing: ■□□ · ■■□ · ■■■. On the grid it reads as progress across the row; alone, each cover says where it is in the story.
- **Safe zones:** everything that matters lives in y = 240–1680 (the profile grid crops to 3:4). Bottom ~25 % is covered by Instagram's UI in the feed: only background there.
- **Constants of the series** (never change): SF Pro, El Taller yellow `#FFD23F`, the kicker, the act tags, the progress bar, the workshop background. **Per episode:** hooks, JP's 3 frames, client handle + picture + accent color.
- **Rendering:** HTML/CSS → headless Chrome (own throwaway `--user-data-dir`: sharing the everyday profile fails at random) → PNG → Pillow slices + grid preview (`grid()`: the new row on top of the two previous rows, cropped to 3:4).

**Hooks.** 3 to 6 words, a claim or a tension, **taken from what JP actually says in the take**, true to the reel's content. "IA" is fine when the reel is about it, not on every hook. Ep. 04:
1/3 `MI GIMNASIO VIVE EN UN EXCEL` (1:55 "el Seba maneja todo con una planilla Excel") ·
2/3 `QUIERO PAGAR. NO EXISTE EL BOTÓN.` (3:45 "te pago las 100 lucas… no existe ese botón") ·
3/3 `LE HICE UNA APP A MI GIMNASIO` (the prototype). The 3 together tell the episode: caso → nudo → propuesta.

**Picking JP's frames (JP: "los screenshots que sacaste de mí son horribles").** Don't take the frame at the hook's timestamp: pick for the face. **Automated in `tools/pick_frames.py`**: every keyframe of the take (~1/s) scored with Apple Vision (`tools/facescore.swift`: capture quality × eyes open × facing the lens, measured against the most frontal frames of that take, since the camera sits low), best 12 at least 15 s apart → `cover/frames/candidates.jpg`. The manual method it replaces:
1. One frame every 3 s from the proxy (`ffmpeg -vf fps=1/3`) → contact sheets of the face crop, numbered.
2. Shortlist: **looking at the camera, eyes open, mouth relaxed, hand/mic away from the face, an expressive gesture**; avoid looking down, blinks, mid-word grimaces.
3. Pull the shortlist ±0.6 s from the **raw** take at full resolution, compare large, pick 3 different gestures (Ep. 04: 16:45 hand raised, half smile · 6:27 explaining · 15:24 arm up, presenting).
4. Cut out, crop at the tabletop (`TABLE = 1090` in the frame; camera static), and check that no gesture crosses into the neighbor cover (each cover clips its own JP).

**Rules learned:**
- Never put invented content about the business on a cover (C's fake WhatsApp chat implied Endémico doesn't answer: unfair, dropped).
- Fake/demo names only on screen.
- The business picture is redrawn sharp (Instagram only serves 110 px), with the IG ring, like earlier rows.

---

## 3b. Reels as data (`reels.json`), planned by Claude

**Why.** Up to Ep. 04 each episode's reels were a Python file with timestamps and bespoke graphics: an afternoon of
work per row. With 6 businesses at once that can't be the job. Now a reel is data that says **what JP says and what is
shown**, anchored to his words (never to seconds), so Claude can write it, a program can check it, and JP can correct it in
one sentence.

- **Format**: the docstring of `tools/autoreel.py`. Pieces = `{"t": ~seconds, "say": "exact words"}`; graphics =
  `title · callout · stamp · image · phone · laptop · broll · button`, each with `at` / `until` / `through` / `for` as
  phrases said in that reel. Worked example: `tools/plan/example-ep04.reels.json` (Ep. 04 rebuilt with generic graphics).
- **Planner**: `tools/plan_episode.py` sends `claude -p` (JP's login, model opus) the whole take word by word, the README,
  `TASTE.md`, `NARRATIVE.md`, the asset list + contact sheets of every image/clip (Claude looks at them with Read), and the
  example. Output is JSON-schema validated, then every phrase is checked against the transcript; errors go back to Claude
  (up to 3 rounds). Writes `reels.json`, hooks into `cover/cover.json`, `publish.json`, `post-copy.md`, `plan-notes.md`.
  Old plans are kept in `.plans/`.
- **Feedback loop**: `episode.py <ep> feedback "…"` appends to `<ep>/feedback.md` and re-plans with the previous plan +
  the note ("keep what he didn't mention"). On approve, `learn` asks Claude to fold that episode's feedback into
  `el-taller/TASTE.md` as general rules (old versions in `el-taller/.taste-history/`). Tomorrow's plan starts from it.
- **Renderer**: `tools/autoreel.py` turns the data into `taller.py` specs (cuts at word level, captions by whisper +
  forced alignment, graphics from `reelkit` / `ep02kit` / `autokit`, sound effects per graphic type).
  `autoreel.py <ep> --check` prints each reel as a script without rendering.
- **Style (2026-11-08)**: `el-taller/estilo.json` holds the look and fixed texts of every future reel and cover: series
  name/color/handle/tagline, the 3 acts (name + end-card CTA), reel length, zooms, fillers cut, sound per graphic, color
  grade, cover background and kicker. Read by `tools/estilo.py` (defaults = the values before the file existed, so a
  missing key renders like before). `episode.py <ep> muestra` renders that episode's covers + 2 stills per reel with the
  current style into `<ep>/muestra/muestra.jpg`, next to what's published (~7 s, nothing published changes).
  **Where a change goes:** one episode → `reels.json` / `cover.json` (or `feedback`) · the look or a fixed text →
  `estilo.json` · editorial judgement (what to tell, how to cut, how hooks sound) → `TASTE.md` · something the pipeline
  can't do yet → code. Old rows keep their old style on purpose (NARRATIVE §2).
- **Sobrio (2026-11-13, Ep. 10)**: estilo.json `reels.modo = "sobrio"` (`tools/sobrio.py`): no graphics, sounds or
  tag; Spanish captions one word at a time + English one word at a time under them (each piece's `"en"` in reels.json,
  spread over that piece's Spanish words); a news lower third (`reels.sobrio.nombre` / `rol`) at the start; the end is
  the reel's `cta` in plain type (a line starting with `~` = the English) + the handle. `modo: ""` = the old look.

## 4. Toward full automation: the plan, in order

Each step removes a manual or semi step. Do them in this order; each one is small and testable on Ep. 04's files.

1. ✅ (2026-11-05) **`tools/ingest.py <episode>`** → stage 3 in one command: move to raw/ if needed, proxy, wav, both whisper passes, alignment, `timed.txt`. Idempotent (skips what exists). *Removes 6 commands.*
2. ✅ (2026-11-05) **Covers as config: `tools/covers2.py` + `<episode>/cover/cover.json`.** Ep. 04 regenerates pixel-identical from its config. Move `make_propuestas.py`'s B code into tools; per episode only data: `{"ep": "04", "handle": "endemico.ft", "pfp": "...", "accent": "#4EF03E", "hooks": [[...],[...],[...]], "frames": [1005.6, 387.0, 924.0], "table_y": 1090}`. `make_cover.py` becomes 3 lines. *Covers = editing a JSON.*
3. ✅ (2026-11-05) **Frame picker: `tools/pick_frames.py <episode>`.** Scan the take, score each frame with Apple Vision (face detected, looking at camera, eyes open, no hand over the mouth, sharpness), write a contact sheet of the top 12 with timestamps → JP (or Claude) picks 3 into `cover.json`. *From an hour of looking to one glance.*
4. ✅ (2026-11-05) **Draft the plan from the transcript.** `tools/plan_episode.py` + `tools/autoreel.py` (reels as data) + `el-taller/TASTE.md` (taste memory). Claude reads `timed.txt` + the README's 3 acts and writes: the `REELS` pieces for `make_reels.py`, the 3 hooks (rules §3), `post-copy.md` and `publish.json`. Output is a proposal JP reviews at checkpoint 1.
5. ✅ (2026-11-05) **Orchestrator: `tools/episode.py <episode> [stage]`** with a state file `<episode>/status.json` (`{"ingest": "done", "drafts": "done", "checkpoint1": "pending", ...}`). `episode.py ep05-x` runs every stage whose inputs exist and stops at the next checkpoint, printing what JP must look at. Any new session resumes by running `status`.
6. 🟡 (2026-11-05: review page on the LAN with "send changes" / "approve"; publishing stays a terminal command) **Checkpoints on the phone.** Send drafts + grid preview + captions to JP (AirDrop or a private page), and an "OK" publishes. (Publishing already works via API.)
7. **After publishing:** a check that the row landed in the right order, and a metrics pull a few days later (views per act) to learn which hooks work.

When 1–5 exist, an episode is: **record → AirDrop → `episode.py ep05-x` → approve drafts → approve grid → published.**

Next, in order:
8. **Assets without hands:** `capture_assets.py` generic (their IG profile + website screenshots from the handle in cover.json), the IG picture → `cover/pfp.png`, and a scripted prototype recording (`record_prototype.py` from a list of flows) so 3/3 always has screen footage.
9. **Review from anywhere:** the review page on a private URL (cloudflared tunnel, like `publish_ig.py`) + a phone notification, so JP approves from the gym.
10. **Metrics → TASTE:** a week after publishing, pull views/retention per reel and add "what worked" to TASTE.md (which hooks, which lengths).
11. ✅ (2026-11-10) **launchd:** `~/Library/LaunchAgents/com.jpfraneto.eltaller-agenda.plist` runs `episode.py agenda` every
    10 min (log: `~/Library/Logs/eltaller/agenda.log`), so scheduled reels go out without leaving `watch` open. A sleeping
    Mac posts on wake. (`watch` is still the way to catch AirDropped takes.) Slots: estilo.json `horas` = 09:00 · 13:30 · 20:00.
    ✅ (2026-11-14) **In the cloud, Mac off:** `tools/nube.py subir` sends every scheduled reel that has its caption to the
    Worker in `tools/nube/` (agenda.jpfraneto.com: reel + cover in R2, caption + time in KV, a cron every 5 min posts what's
    due and messages JP on Telegram). Those items get `"nube"` in publish.json and the local agent leaves them alone;
    `episode.py agenda` copies what the cloud posted into publish-log.json. `nube.py estado` shows the cloud queue.
12. 🟡 (2026-11-07) **The long version (YouTube):** the same take, whole, with jump cuts, captions and chapters (= the 3 acts) → a 20–25 min episode. Why: `el-taller/referencias/cachetada.md` (long solo chronicles are what travels there), and the businesses asked for the full video.
    `tools/longcut.py <ep>` reads `<ep>/long.json` (start/end, skips, acts, chapters, right-panel screenshots/recordings, title, thumbnail hook; format in its docstring) → `<ep>/long/`: `epNN-long.mp4` (16:9: take in the center, chapter left, what he talks about right; pauses > 0.75 s cut), `.srt`, `epNN-thumb.jpg`, `epNN-youtube.txt` (title + description with chapters). `--check` / `--stills` / `--preview 60` to look before rendering (~10 min per episode).
    `long.json` was drafted by Claude per episode (ep02–05) from the transcript + README; its `review_notes` list what JP should know (skips that remove content, sensitive lines). Channel: "El Taller con JP" on YouTube. Upload is in YouTube Studio (the API locks uploads from unaudited projects to private). Next: draft `long.json` inside `plan_episode.py` so it's one more stage of `episode.py`.
    **2026-11-17, every episode (JP: "subir el video de ayer a youtube y borrarlo. y empezar a hacer eso con todos los negocios"; Iván of Umbral Sur watched his long episode 3 times):** after publish, `episode.py <ep> youtube` (§1 row 13). The raw take goes up too, private, titled `epNN slug RAW` (as ep07/ep08 did on 2026-11-12), so deleting it from the Mac loses nothing. `limpiar` refuses until both URLs are in `long/youtube-log.json`. A rant (Ep. 11) has `"acts": []`: no act block on the left.

---

## 5. The prototype (the demo 3/3 shows)

Start from Ep. 04's: `tools/new_episode.py NN slug "Name" --prototype-from ep04-endemico` copies `prototype/` (code only) and renames
the Worker (`slug-app`), the D1 database (`slug`) and the subdomain (`https://slug.jpfraneto.com`). Reusable pieces in it:

| Piece | Where (ep04 prototype) |
|---|---|
| Cloudflare Worker + D1 + static app, no build step | `wrangler.jsonc`, `src/worker.js` (router), `public/` |
| Login by phone + 6-digit code; demo code **888888** (`DEMO_OTP=1`), owner gets a secret `COACH_CODE` | `authStart` / `authVerify` |
| Mercado Pago Checkout Pro (Orders API): pay link, return page, webhook with signature, record once | `createMpLink`, `processMpOrder`, `mpWebhook`; test offline with `scripts/mp-mock.mjs` |
| Selling: plans / single sessions / online subscription, then "¿cuándo vienes?" | `comprar`, `viewPlanes`, `viewPagoVuelta` |
| Booking calendar with credits and 30-min cancel rule | `reservar`, `agendarSheet`, `viewCalendario` |
| The owner's Excel that fills itself (+ .xlsx download/upload) | `coachPlanilla`, `viewPlanilla` |
| Phone-first shell: one-screen pages, tab bar, bottom sheets, toasts, brand variables | `public/css/app.css` |
| Real data, never invented (JP, Ep. 08: fake data is noise you then have to flag and design around): the business's own + public data that's legal to republish (facts + link, no photos, no people; check robots.txt **and** the terms) | Ep. 08 `prototype/src/indice.js`, `fuentes.js`, `../fuentes-permisos.md` |

To publish it: `npx wrangler d1 create slug` (paste the id into `wrangler.jsonc`) → `npm install` → `npm run db:reset:remote` → `npm run deploy`.
**Mercado Pago:** a new Worker has no `MP_ACCESS_TOKEN`, so pay buttons stay hidden until one is set. Use the mock or a test seller
account; the Endémico Worker runs on JP's production credentials (real money).

**The seed for the owner (`semilla/`):** each episode can carry `semilla/negocio/contexto-inicial.md`, the synthesis of the
business written for its agent as data to confirm (model: `el-taller/ep07-arboldelilith/semilla/`). `tools/semilla.sh <ep>`
(or `todas`) packs it with the prototype into `el-taller/semillas/<slug>.zip`: `LEEME.md` + `negocio/` + `sitio/`, without
node_modules, local DBs or secrets; it refuses to zip if something looks like a key. Prototype elsewhere: put its path in
`semilla/sitio.txt` (Aubel: `webs/aubel`). El Taller's server reads `negocio/contexto-inicial.md` on day 0.

## 6. Checklist: demo tonight, episode tomorrow

Tonight (prepare, the fun part):
- [ ] `tools/.venv/bin/python tools/new_episode.py 05 <slug> "<Name>" --prototype-from ep04-endemico`
- [ ] README: business, proposal in one line, the 3 acts (what to say / what to show): the planner reads it
- [ ] **Reconócete** first: `uv run --with playwright --with pillow python tools/reconocer.py <handle>` → `el-taller/reconocer/<handle>/<date>/reporte.md`
      (who they are, what works, what is missing, where to start; profile + last 12 posts, logged out). It feeds the README.
- [ ] Their IG: screenshots → `assets/`, profile picture → `cover/pfp.png`; handle + brand color → `cover/cover.json`
- [ ] Prototype: adapt, **real data only** (theirs + public data that's legal to show; no invented listings, names or
      "ejemplo" flags), deploy to `https://<slug>.jpfraneto.com`, test on the phone
- [ ] AI in the prototype (vision, text): **OpenRouter**, key in `el-taller/.openrouter_key` (git-ignored) →
      `npx wrangler secret put OPENROUTER_API_KEY`. Default vision model: `google/gemini-2.5-flash-lite` (+ `gemini-3.1-flash-lite`
      as fallback); bench script: `ep06-tuauto/research/bench_vision.mjs`. Reference: `ep06-tuauto/prototype/src/worker.js`.
- [ ] Screen recordings of the prototype → `assets/rec/*.mp4` (the 3/3 reel shows them; without them 3/3 is just talk)
- [ ] B-roll of the place (optional): `raw/<date>_<slug>_<anything>/` (the planner finds folders with the slug in their name)
Tomorrow:
- [ ] `tools/.venv/bin/python tools/episode.py watch` running → record → AirDrop. (~20 min later: notification "listo para revisar")
- [ ] `episode.py ep05-<slug> review` on the phone → changes or approve
- [ ] Show the business → `episode.py ep05-<slug> publish`

## 7. Notes for whoever continues (Claude included)

- Start with: this file → the episode `README.md` (To-do) → `NARRATIVE.md` if touching covers/captions/voice.
- Never change files in `raw/`. Heavy renders: draft first (`DRAFT=1`), final only after checkpoint 1.
- The prototype sites run on real Mercado Pago credentials: anything that clicks "Pagar" on the live site charges real money.
- Talk to the business before publishing; real names of their customers never appear on screen.
- **jpfraneto.com is one screen since 2026-11-10** (`../public/index.html`): the 6 tracks + "Trabajemos juntos" (modal
  with the offer + Pagar $1.500.000), "Método" (the atom, in a modal) and "Login" (WhatsApp placeholder). Episodes are
  **no longer listed on the home page**: publishing an episode doesn't require touching the site. The old episode cards
  live in `jpfraneto.com/index.2026-11-10-pre-una-pantalla.html` if they come back. Personal page per business: `<IG handle>.jpfraneto.com`
  (`.`/`_` → `-`, e.g. `endemico-ft.jpfraneto.com`, optional `?n=Seba`): one line in `CONFIG.invitados` + one
  `custom_domain` route in `wrangler.jsonc`. Taking a slot = add the client to
  `CONFIG.clientes` at the bottom of the page, then `npx wrangler deploy` from `jpfraneto.com/`. Backup of the page
  before each change: `jpfraneto.com/index.<date>.html`.
- **Meta error 2207077 on reels (2026-11-06).** Every reel served by `python -m http.server` through the tunnel failed
  within seconds (even Ep. 04's, published fine the day before); images and a reel on a normal host were fine.
  `publish_ig.py` now serves with `tools/rangeserve.py` (Range support), which fixed it for 3/3; 2/3 (163 MB) still
  failed once, and a 10 Mbps re-encode published at the first try. If it happens again: re-encode
  (`ffmpeg -i in.mp4 -c:v libx264 -preset slow -b:v 10M -maxrate 12M -bufsize 24M -c:a aac -b:a 192k -ac 2 -movflags +faststart out.mp4`),
  point that item's `file` in publish.json to it, run `publish_ig.py <ep>` again (it skips what's already up).
  Since then `publish_ig.py` does this by itself: a reel that fails processing is retried once from a 10 Mbps copy in
  `reels/ig/`. A half-published row is visible on the profile: finish it right away.
