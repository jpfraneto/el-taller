# El Taller con JP

I build a working system for a small business in southern Chile, record one take explaining it, and a pipeline turns
that take into a row of Instagram reels ([@eltallerconjp](https://instagram.com/eltallerconjp)). Then the business gets
the system to run themselves: "mi trabajo es que me dejen de necesitar".

This repo is the abstraction: the pipeline that goes from a recording to published reels, the suite each owner installs
on their own computer, and the prototypes built so far as examples.

## What's here

```
footage/
├── PIPELINE.md            the process, stage by stage: record → ingest → plan → drafts → covers → ◆ review → finals → ◆ publish
├── CLAUDE.md              notes for Claude, who runs most of it
├── tools/                 the pipeline (episode.py runs an episode to its next checkpoint)
└── el-taller/
    ├── EL-TALLER.md       what El Taller is, how it works, where it's going (Spanish)
    ├── NARRATIVE.md       voice, story and grid rules
    ├── TASTE.md           JP's taste, learned from each review: the planner reads it
    ├── estilo.json        the look of every reel and cover (color, acts, CTAs, sounds, grade)
    └── epNN-slug/
        ├── prototype/     the system built for that business (a Cloudflare Worker)
        └── reels.json     the cut the planner wrote from the take
os/                        the suite on the owner's computer: installer, local panel, Claude's folder template, the site
```

## The examples

| Ep. | Business | What was built | Live |
|---|---|---|---|
| 03 | La Junta | a phone app for the climbing gym in Puerto Varas | https://lajunta.jpfraneto.com |
| 04 | Endémico | QR check-in, history, the week's training, payments (Mercado Pago) | https://endemico.jpfraneto.com |
| 05 | Umbral Sur | one cabin, one price: walk through it and talk to the owner | https://umbralsur.jpfraneto.com |
| 06 | TuAuto | "how much is your car worth?" from a photo; stock + the team's inbox | https://tuauto.jpfraneto.com |
| 07 | Árbol de Lilith | "software evolutivo": a niche router and two products competing | https://arboldelilith.jpfraneto.com |
| 08 | Parcelas y Terrenos | a parcel marketplace with Claude answering, visits booked, the owner's panel | https://parcelasyterrenos.jpfraneto.com |
| 09 | CG Limpiezas | their Instagram redesigned + a quote from one photo | https://cglimpiezas.jpfraneto.com |
| 10 | Campo & Mar | their Instagram redesigned + ordering for you and your café | https://campoymar.jpfraneto.com |
| 11 | Del Sur Propiedades | their 530 listings in photos and on the map, filters you tap, every post code is a link | https://delsurpropiedades.jpfraneto.com |

Each prototype runs on its own (`npm install`, a `.dev.vars` from `.dev.vars.example`, `npx wrangler dev`). The data in
them is what each business publishes: their listings, photos and texts.

## Running the pipeline

macOS, Python 3, ffmpeg, and [Claude Code](https://claude.com/claude-code) for the planning step. From `footage/`:

```sh
tools/.venv/bin/python tools/episode.py                 # every episode: where it is, what's next
tools/.venv/bin/python tools/episode.py epNN-slug       # run one to its next checkpoint
tools/.venv/bin/python tools/episode.py watch           # AirDrop a take → it runs to the review by itself
```

Not included: the raw footage, the rendered reels, the episode notes and anything about the businesses that isn't
already public. Secrets live in `.dev.vars` and `wrangler secret`, never in the code.
