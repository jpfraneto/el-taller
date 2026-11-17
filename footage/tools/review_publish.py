#!/usr/bin/env python3
"""review_publish: a local page to review an episode before posting it.

The 3 reels side by side (as they sit in the grid: 1/3 on the left), each with its cover, its caption in an
editable textarea and the accounts tagged on the post. "Guardar" writes publish.json (+ post-copy.md);
"Listo para publicar" also writes publish-ready.json, the signal that the copy is approved.

usage: tools/.venv/bin/python tools/review_publish.py el-taller/ep04-endemico [port=8811]
"""
import datetime, html, json, os, re, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

EP = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit(__doc__)
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8811
PUB, READY, COPY = f"{EP}/publish.json", f"{EP}/publish-ready.json", f"{EP}/post-copy.md"
TYPES = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def act(item):
    m = re.search(r"·\s*(\d)/3", item["caption"]) or re.search(r"0(\d)-", os.path.basename(item["file"]))
    return int(m.group(1)) if m else 0


def write_copy(items):
    """post-copy.md mirrors publish.json (in act order) so both always say the same."""
    title = os.path.basename(EP)
    out = [f"# {title}: Instagram copy", "",
           "**Publish in the order of `publish.json`** (3/3 → 2/3 → 1/3, so 1/3 lands on the left of the row):",
           f"`python3 tools/publish_ig.py {os.path.relpath(EP, os.path.dirname(os.path.dirname(EP)))} --dry-run`, then without `--dry-run`.",
           "Edited in `tools/review_publish.py`.", ""]
    for it in sorted(items, key=act):
        tags = " ".join("@" + u for u in it.get("user_tags", []))
        out += ["---", "", f"## {act(it)}/3 · `{it['file']}` · cover `{it.get('cover', '')}`" + (f" · tags {tags}" if tags else ""),
                "", it["caption"], ""]
    open(COPY, "w").write("\n".join(out))


PAGE = """<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Publicar · __TITLE__</title>
<style>
:root{--bg:#0d0d0f;--card:#17171b;--line:#2a2a31;--txt:#f2f2f2;--mut:#9a9aa3;--y:#ffd23f;--g:#4ef03e;--r:#ff5a4f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:rgba(13,13,15,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);
 padding:14px 28px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
h1{font-size:18px;margin:0;letter-spacing:.02em}h1 b{color:var(--y)}
.order{color:var(--mut);font-size:13px}.sp{flex:1}
button{font:600 14px/1 inherit;border:0;border-radius:10px;padding:12px 18px;cursor:pointer}
.save{background:#2b2b33;color:var(--txt)}.ready{background:var(--y);color:#111}.ready.done{background:var(--g)}
#status{font-size:13px;color:var(--mut);min-width:180px;text-align:right}
.grid{display:grid;grid-template-columns:repeat(3,minmax(300px,1fr));gap:22px;padding:24px 28px 60px;max-width:1500px;margin:0 auto}
.col{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:12px}
.tag{display:flex;align-items:center;gap:10px}.act{background:var(--y);color:#111;font-weight:800;border-radius:7px;padding:3px 8px;font-size:13px}
.name{font-weight:700}.file{color:var(--mut);font-size:12px;margin-left:auto}
.media{position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:9/16}
.media video,.media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.switch{display:flex;gap:6px}.switch button{flex:1;padding:8px;font-size:12px;background:#22222a;color:var(--mut)}.switch button.on{background:#33333d;color:var(--txt)}
textarea{width:100%;min-height:360px;resize:vertical;background:#0f0f12;color:var(--txt);border:1px solid var(--line);border-radius:12px;
 padding:12px;font:14px/1.5 -apple-system,system-ui,sans-serif}
textarea:focus{outline:2px solid var(--y);border-color:transparent}
.meta{display:flex;flex-wrap:wrap;gap:6px}.pill{font-size:12px;border-radius:999px;padding:4px 10px;background:#22222a;color:var(--mut)}
.ok{color:var(--g)}.bad{color:var(--r)}
.tags{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mut)}
.tags input{flex:1;background:#0f0f12;border:1px solid var(--line);border-radius:8px;color:var(--txt);padding:8px;font:13px inherit}
.prev{background:#000;border-radius:12px;padding:12px;font-size:13px;color:#ddd}.prev b{color:#fff}.prev .more{color:var(--mut)}
.row{display:flex;gap:4px;padding:0 28px;max-width:760px;margin:18px auto 0}.row img{width:calc(100%/3);aspect-ratio:3/4;object-fit:cover;border-radius:4px}
.rowlab{max-width:760px;margin:8px auto 0;padding:0 28px;color:var(--mut);font-size:12px;text-align:center}
</style></head><body>
<header><h1>EL TALLER · <b>__TITLE__</b></h1><span class="order">Se publican en este orden: 3/3 → 2/3 → 1/3 (así 1/3 queda a la izquierda de la fila)</span>
<span class="sp"></span><span id="status"></span><button class="save" onclick="save(false)">Guardar</button>
<button class="ready" id="readyBtn" onclick="save(true)">Listo para publicar</button></header>
<div class="row" id="row"></div><div class="rowlab">Así se ve la fila en el perfil (recorte 3:4 de cada portada)</div>
<div class="grid" id="grid"></div>
<script>
let ITEMS = __ITEMS__; let READY = __READY__; let dirty = false;
const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const actOf = it => +(it.caption.match(/·\\s*(\\d)\\/3/) || it.file.match(/0(\\d)-/) || [0,0])[1];
function render(){
  const order = ITEMS.map((it,i)=>[actOf(it),i]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
  document.getElementById('row').innerHTML = order.map(i=>`<img src="/f/${ITEMS[i].cover}">`).join('');
  document.getElementById('grid').innerHTML = order.map(i=>{ const it=ITEMS[i], a=actOf(it), name=it.file.split('/').pop();
    return `<div class="col"><div class="tag"><span class="act">${a}/3</span><span class="name">${['','El caso','El nudo','La propuesta'][a]||''}</span><span class="file">${esc(name)}</span></div>
    <div class="media" id="m${i}"><video src="/f/${it.file}" poster="/f/${it.cover}" controls playsinline preload="metadata"></video></div>
    <div class="switch"><button class="on" onclick="show(${i},'v',this)">Reel</button><button onclick="show(${i},'c',this)">Portada</button></div>
    <textarea id="t${i}" oninput="upd(${i})">${esc(it.caption)}</textarea>
    <div class="tags">Etiquetas en el post <input id="u${i}" value="${(it.user_tags||[]).map(u=>'@'+u).join(' ')}" oninput="upd(${i})"></div>
    <div class="meta" id="k${i}"></div><div class="prev" id="p${i}"></div></div>`}).join('');
  ITEMS.forEach((_,i)=>check(i)); status();
}
function show(i,w,b){ const m=document.getElementById('m'+i), it=ITEMS[i];
  m.innerHTML = w==='v' ? `<video src="/f/${it.file}" poster="/f/${it.cover}" controls playsinline preload="metadata"></video>` : `<img src="/f/${it.cover}">`;
  b.parentNode.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); }
function upd(i){ ITEMS[i].caption=document.getElementById('t'+i).value;
  ITEMS[i].user_tags=document.getElementById('u'+i).value.split(/[\\s,]+/).map(s=>s.replace(/^@/,'')).filter(Boolean);
  dirty=true; READY=false; check(i); status(); }
function check(i){ const c=ITEMS[i].caption, n=[...c].length, h=(c.match(/#\\w+/gu)||[]).length, at=(c.match(/@[\\w.]+/g)||[]);
  const tags=ITEMS[i].user_tags||[], ia=(c.match(/(?<![\\p{L}])(IA|inteligencia artificial)(?![\\p{L}])/giu)||[]).length;
  const pills=[[`${n} / 2200 caracteres`, n<=2200],[`${h} / 30 hashtags`, h<=30],
    [`menciona ${at.join(' ')||'—'}`, tags.every(t=>at.includes('@'+t))],[`etiqueta ${tags.map(t=>'@'+t).join(' ')||'—'}`, tags.length>0],
    [`"IA" ×${ia}`, ia<=1]];
  document.getElementById('k'+i).innerHTML=pills.map(([t,ok])=>`<span class="pill ${ok?'ok':'bad'}">${ok?'✓':'✗'} ${esc(t)}</span>`).join('');
  const first=c.slice(0,125); document.getElementById('p'+i).innerHTML=`<b>eltallerconjp</b> ${esc(first).replace(/\\n/g,'<br>')}${c.length>125?' <span class="more">… más</span>':''}`;
}
function status(){ const s=document.getElementById('status'), b=document.getElementById('readyBtn');
  s.textContent = dirty ? 'Cambios sin guardar' : READY ? 'Listo ✓ Avísale a Claude' : 'Guardado';
  b.classList.toggle('done', READY && !dirty); b.textContent = READY && !dirty ? 'Listo ✓' : 'Listo para publicar'; }
async function save(ready){ const r=await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({items:ITEMS,ready})}); const j=await r.json(); if(!j.ok){alert(j.error);return}
  dirty=false; READY=ready; status(); }
window.addEventListener('beforeunload',e=>{ if(dirty){e.preventDefault();e.returnValue=''} });
render();
</script></body></html>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="text/html; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            items = json.load(open(PUB))
            page = (PAGE.replace("__TITLE__", html.escape(os.path.basename(EP).upper()))
                    .replace("__ITEMS__", json.dumps(items, ensure_ascii=False).replace("</", "<\\/"))
                    .replace("__READY__", "true" if os.path.exists(READY) else "false"))
            return self.send(200, page.encode())
        if self.path.startswith("/f/"):
            rel = os.path.normpath(self.path[3:].split("?")[0])
            path = os.path.join(EP, rel)
            if rel.startswith("..") or not os.path.isfile(path):
                return self.send(404, b"not found", "text/plain")
            size = os.path.getsize(path)
            ctype = TYPES.get(os.path.splitext(path)[1].lower(), "application/octet-stream")
            rng = self.headers.get("Range")
            a, b = 0, size - 1
            if rng and rng.startswith("bytes="):   # video seeking (Safari needs it)
                s, _, e = rng[6:].partition("-")
                a = int(s) if s else max(0, size - int(e))
                b = int(e) if s and e else size - 1
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
            else:
                self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(b - a + 1))
            self.end_headers()
            with open(path, "rb") as f:
                f.seek(a)
                left = b - a + 1
                try:
                    while left > 0:
                        chunk = f.read(min(1 << 20, left))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass
            return
        self.send(404, b"not found", "text/plain")

    def do_POST(self):
        if self.path != "/api/save":
            return self.send(404, b"{}", "application/json")
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        old = {it["file"]: it for it in json.load(open(PUB))}
        out = []
        for it in data["items"]:   # only the caption and tags can change here; file, cover and order stay
            base = dict(old[it["file"]])
            base["caption"] = it["caption"].replace("\r\n", "\n").strip()
            base["user_tags"] = [u.strip().lstrip("@") for u in it.get("user_tags", []) if u.strip()]
            out.append(base)
        json.dump(out, open(PUB, "w"), ensure_ascii=False, indent=1)
        write_copy(out)
        if data.get("ready"):
            json.dump({"ready_at": datetime.datetime.now().isoformat(timespec="seconds")}, open(READY, "w"))
            print(f"READY {datetime.datetime.now():%H:%M:%S}", flush=True)
        elif os.path.exists(READY):
            os.remove(READY)
            print(f"saved (not ready) {datetime.datetime.now():%H:%M:%S}", flush=True)
        else:
            print(f"saved {datetime.datetime.now():%H:%M:%S}", flush=True)
        self.send(200, b'{"ok":true}', "application/json")


if __name__ == "__main__":
    print(f"http://localhost:{PORT}  ({EP})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
