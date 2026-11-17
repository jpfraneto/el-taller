# footage/ · notes for Claude

- **What El Taller is, how it works, where it's going: [`el-taller/EL-TALLER.md`](el-taller/EL-TALLER.md)** (JP's context; update it first when the model changes).
- **Start here: [`PIPELINE.md`](PIPELINE.md)**: the process from recording to published, what's automated, the plan (§4).
  JP's goal: many businesses at once; JP builds the prototype and records one take, everything else runs alone with
  two approvals (review on the phone, publish).
- **One command per episode:** `tools/.venv/bin/python tools/episode.py` (dashboard) · `episode.py <ep>` (run to the next
  checkpoint) · `episode.py watch` (AirDrop → runs by itself). Stages: ingest → frames → plan (Claude, `plan_episode.py`)
  → drafts (`autoreel.py`) → covers (`covers2.py`) → ◆ review → finals → ◆ publish.
- **Reels are data**: `<ep>/reels.json` (format: `tools/autoreel.py` docstring). To change a reel, edit the JSON or
  `episode.py <ep> feedback "…"`; don't write a `make_reels.py` for new episodes.
- **The look of future reels/covers lives in `el-taller/estilo.json`** (color, handle, acts + CTAs, length, sounds, grade,
  cover kicker). A style request from JP = edit that file, then `episode.py <ep> muestra` and show him `muestra.jpg`
  before he approves. Not a code change. Map of what goes where: `PIPELINE.md` §3b "Style".
- **JP's taste lives in `el-taller/TASTE.md`**: the planner reads it; when JP corrects something, the lesson goes there
  (general rule, not a one-off). Voice/story/grid rules: `el-taller/NARRATIVE.md` ("IA" when it helps people understand, never abused).
- Demo night (new episode + prototype): the checklist in `PIPELINE.md` §6.
- Never modify `raw/`. Publishing is public and irreversible: only JP triggers it (`episode.py <ep> publish`).
- When something in the pipeline becomes automated, update the stage table in `PIPELINE.md` §1.
