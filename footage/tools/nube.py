#!/usr/bin/env python3
"""nube: El Taller's posting schedule in the cloud, so a reel goes out with this Mac off (JP, 2026-11-14).

    tools/.venv/bin/python tools/nube.py subir [ep10-campoymar ...]   every scheduled reel with a caption → the cloud
    tools/.venv/bin/python tools/nube.py estado                       the cloud queue; what got posted → publish-log.json
    tools/.venv/bin/python tools/nube.py tick                         run one cloud tick now (instead of waiting 5 min)

The cloud is the Worker in tools/nube/ (agenda.jpfraneto.com): R2 keeps each reel (the 10 Mbps copy, publish_ig.lighter)
and its cover, a KV list keeps caption + time, and a cron every 5 minutes posts what's due with the same Instagram calls
as publish_ig.py, then messages JP on Telegram. An item sent up gets "nube" in publish.json: from then on the local
agent (episode.py agenda) leaves it to the cloud and only copies the result into publish-log.json.
Changing a caption or a time: edit publish.json (or the review page) and run `subir` again; files aren't re-uploaded.
Credentials: ~/.config/eltaller/nube.env (NUBE_URL, NUBE_CLAVE); the Worker's own secrets are listed in its wrangler.jsonc.
"""
import glob, json, os, secrets, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from estilo import TALLER
from publish_ig import lighter

ENV = os.path.expanduser("~/.config/eltaller/nube.env")
BUCKET = "eltaller-agenda"


def cfg():
    d = dict(l.strip().split("=", 1) for l in open(ENV) if "=" in l and not l.startswith("#"))
    return d["NUBE_URL"].rstrip("/"), d["NUBE_CLAVE"]


def llamar(method, path, data=None):
    url, clave = cfg()
    req = urllib.request.Request(url + path, method=method, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"authorization": f"Bearer {clave}", "content-type": "application/json",
                                          "user-agent": "eltaller-nube"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def r2_put(path, key, tipo):
    subprocess.run(["npx", "wrangler", "r2", "object", "put", f"{BUCKET}/{key}", "--file", path, "--content-type", tipo,
                    "--remote"], cwd=f"{HERE}/nube", check=True, stdout=subprocess.DEVNULL)


def episodios(nombres):
    if nombres:
        return [os.path.join(TALLER, n) if not os.path.isdir(n) else os.path.abspath(n) for n in nombres]
    return sorted(glob.glob(f"{TALLER}/ep[0-9][0-9]-*"))


def log_de(ep):
    p = f"{ep}/publish-log.json"
    return json.load(open(p)) if os.path.exists(p) else {}


def subir(nombres):
    enviados = []
    for ep in episodios(nombres):
        p = f"{ep}/publish.json"
        if not os.path.exists(p):
            continue
        plan, log = json.load(open(p)), log_de(ep)
        for x in plan:
            name = os.path.basename(x["file"])
            if name in log or not x.get("cuando") or not x.get("caption", "").strip():
                continue
            if not x.get("nube"):
                pre = f"{os.path.basename(ep)}/{secrets.token_hex(8)}"
                print(f"↑ {os.path.basename(ep)}/{name}", flush=True)
                video = lighter(os.path.join(ep, x["file"]))
                x["nube"] = {"video": f"{pre}-{name}"}
                r2_put(video, x["nube"]["video"], "video/mp4")
                if x.get("cover"):
                    x["nube"]["cover"] = f"{pre}-{os.path.basename(x['cover'])}"
                    r2_put(os.path.join(ep, x["cover"]), x["nube"]["cover"], "image/jpeg")
                json.dump(plan, open(p, "w"), ensure_ascii=False, indent=1)
            enviados.append({"id": f"{os.path.basename(ep)}/{name}", "video": x["nube"]["video"],
                             "cover": x["nube"].get("cover"), "caption": x["caption"], "cuando": x["cuando"],
                             "user_tags": x.get("user_tags") or []})
    if enviados:
        llamar("POST", "/cola", enviados)
    estado()


def estado(quiet=False):
    """Print the cloud queue; copy what got posted into each episode's publish-log.json."""
    cola = llamar("GET", "/cola")
    for x in sorted(cola, key=lambda x: x["cuando"]):
        ep, name = x["id"].split("/", 1)
        if x.get("estado") == "publicado":
            p = f"{TALLER}/{ep}/publish-log.json"
            log = log_de(f"{TALLER}/{ep}")
            if name not in log:
                log[name] = {k: x.get(k) for k in ("container", "media_id", "permalink", "user_tags", "at")} | {"nube": True}
                json.dump(log, open(p, "w"), ensure_ascii=False, indent=1)
        if not quiet:
            extra = x.get("permalink") or x.get("nota") or ""
            print(f"{x['cuando'][:16].replace('T', ' ')}  {x.get('estado', ''):<10} {x['id']}  {extra}")
    return cola


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in ("subir", "estado", "tick"):
        raise SystemExit(__doc__)
    if a[0] == "subir":
        subir(a[1:])
    elif a[0] == "estado":
        estado()
    else:
        print(json.dumps(llamar("POST", "/tick"), ensure_ascii=False, indent=1))
