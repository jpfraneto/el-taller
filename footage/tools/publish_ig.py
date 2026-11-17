#!/usr/bin/env python3
"""publish_ig: publish an episode's reels to @eltallerconjp with the official Instagram API.

Works with a Facebook Page token (graph.facebook.com) or an Instagram-login token (graph.instagram.com).
Meta rejects big files sent straight from here (a 123 MB upload fails), so each reel is served for a
few minutes from this Mac through a temporary Cloudflare quick tunnel, and Meta downloads it from there
(video_url). The tunnel runs with an empty config and HOME, so it never touches ~/.cloudflared.

usage:
  python3 tools/publish_ig.py check                          # token + account OK?
  python3 tools/publish_ig.py el-taller/ep02-aubel --dry-run  # show what would be posted
  python3 tools/publish_ig.py el-taller/ep02-aubel            # post, in the order of publish.json
  python3 tools/publish_ig.py el-taller/ep07-x --solo NAME.mp4 # post only that one (episode.py's schedule does this)
  python3 tools/publish_ig.py refresh                         # extend the token another 60 days

Each episode has a publish.json, in posting order (the last item ends up on the left of the row):
  [{"file": "reels/x-03.mp4", "cover": "para-publicar/portada-x-03.jpg", "caption": "…"}, …]
"cover" (an image, 9:16) wins over "thumb_offset_ms" (a frame of the video).
"user_tags": ["endemico.ft"] tags those accounts on the reel (not a collab). If Meta refuses, it posts without.
Results go to <episode>/publish-log.json; items already published are skipped, so a run that
stopped halfway can simply be run again.

One-time setup (JP): see "Publishing with the Instagram API" in footage/README.md.
Credentials live outside the repo, in ~/.config/eltaller/instagram.env (or the file in IG_ENV: each business its own,
estilo.json "publicacion"."instagram_env"):
  IG_USER_ID=…
  IG_ACCESS_TOKEN=…
  IG_API_VERSION=v23.0      (optional)
"""
import contextlib, json, os, re, shutil, socket, subprocess, sys, tempfile, time
import urllib.error, urllib.parse, urllib.request

ENV = os.path.expanduser(os.environ.get("IG_ENV") or "~/.config/eltaller/instagram.env")
IG_HOST, FB_HOST = "https://graph.instagram.com", "https://graph.facebook.com"


def host(cfg):
    # Instagram-login tokens start with IG…; Facebook / unified-login tokens (EAA…) use graph.facebook.com.
    return IG_HOST if cfg["IG_ACCESS_TOKEN"].startswith("IG") else FB_HOST


def load_env():
    if not os.path.exists(ENV):
        sys.exit(f"missing {ENV} (see the setup in footage/README.md)")
    cfg = {}
    for line in open(ENV):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            cfg[k.strip()] = v.strip().strip('"')
    for k in ("IG_USER_ID", "IG_ACCESS_TOKEN"):
        if not cfg.get(k):
            sys.exit(f"{k} is empty in {ENV}")
    cfg.setdefault("IG_API_VERSION", "v23.0")
    return cfg


def call(method, url, params=None, data=None, headers=None, timeout=120):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"{method} {url.split('?')[0]} → HTTP {e.code}\n{body}")


def api(cfg, method, path, **params):
    params["access_token"] = cfg["IG_ACCESS_TOKEN"]
    return call(method, f"{host(cfg)}/{cfg['IG_API_VERSION']}/{path}", params)


def check(cfg):
    me = api(cfg, "GET", cfg["IG_USER_ID"], fields="id,username")
    print(f"ok: @{me.get('username')}, user id {me.get('id')} (via {host(cfg)})")
    lim = api(cfg, "GET", f"{cfg['IG_USER_ID']}/content_publishing_limit", fields="quota_usage,config")
    print("publishing quota (24 h):", json.dumps(lim.get("data", lim)))


def refresh(cfg):
    if host(cfg) == FB_HOST:
        sys.exit("this token comes from Facebook / unified login; system-user tokens don't expire")
    r = call("GET", f"{IG_HOST}/refresh_access_token",
             {"grant_type": "ig_refresh_token", "access_token": cfg["IG_ACCESS_TOKEN"]})
    tok = r["access_token"]
    lines = open(ENV).read().splitlines()
    lines = [f"IG_ACCESS_TOKEN={tok}" if l.startswith("IG_ACCESS_TOKEN=") else l for l in lines]
    open(ENV, "w").write("\n".join(lines) + "\n")
    print(f"token refreshed, valid for {int(r.get('expires_in', 0)) // 86400} more days")


@contextlib.contextmanager
def public_url(*paths):
    """Serve files at a temporary https://….trycloudflare.com URL while the block runs; yields their URLs."""
    tmp = tempfile.mkdtemp(prefix="publish_ig-")
    procs = []
    try:
        os.mkdir(f"{tmp}/www"); os.mkdir(f"{tmp}/home")
        open(f"{tmp}/home/empty.yml", "w").close()
        names = []
        for i, path in enumerate(paths):
            name = f"f{i}{os.path.splitext(path)[1].lower()}"
            try:
                os.link(path, f"{tmp}/www/{name}")
            except OSError:
                shutil.copy(path, f"{tmp}/www/{name}")
            names.append(name)
        with socket.socket() as sk:
            sk.bind(("127.0.0.1", 0)); port = sk.getsockname()[1]
        # rangeserve, not `python -m http.server`: from 2026-11-06 Meta failed every reel served by http.server
        # (error 2207077 within seconds, even Ep. 04's reel that published the day before); the same file served
        # by rangeserve (Range + Accept-Ranges) finished. Images were never affected.
        procs.append(subprocess.Popen([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                                    "rangeserve.py"), str(port)],
                                      cwd=f"{tmp}/www", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        log = open(f"{tmp}/cf.log", "w")
        procs.append(subprocess.Popen(["cloudflared", "tunnel", "--config", f"{tmp}/home/empty.yml", "--no-autoupdate",
                                       "--url", f"http://127.0.0.1:{port}"], stdout=log, stderr=log,
                                      env={**os.environ, "HOME": f"{tmp}/home"}))
        url = None
        for _ in range(60):
            m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", open(f"{tmp}/cf.log").read())
            if m and "Registered tunnel connection" in open(f"{tmp}/cf.log").read():
                url = m.group(0); break
            time.sleep(1)
        if not url:
            sys.exit(f"cloudflared quick tunnel did not start (log: {tmp}/cf.log)")
        time.sleep(10)   # let the new hostname reach public DNS before Meta asks for it
        yield [f"{url}/{n}" for n in names]
    finally:
        for pr in procs:
            pr.terminate()
        shutil.rmtree(tmp, ignore_errors=True)


def publish_one(cfg, path, caption, thumb_ms, cover=None, user_tags=None):
    uid = cfg["IG_USER_ID"]
    params = dict(media_type="REELS", caption=caption, share_to_feed="true")
    if thumb_ms is not None and not cover:
        params["thumb_offset"] = str(int(thumb_ms))
    with public_url(path, *([cover] if cover else [])) as urls:
        if cover:
            params["cover_url"] = urls[1]
        tagged = list(user_tags or [])
        if tagged:
            # tag accounts on the reel itself (not a collab: collabs break the grid rows). Reels take no x/y.
            try:
                c = api(cfg, "POST", f"{uid}/media", video_url=urls[0],
                        user_tags=json.dumps([{"username": u} for u in tagged]), **params)
            except SystemExit as e:
                print(f"   ! Meta refused the user tag ({e}); publishing without it (the caption still mentions them)")
                tagged = []
                c = api(cfg, "POST", f"{uid}/media", video_url=urls[0], **params)
        else:
            c = api(cfg, "POST", f"{uid}/media", video_url=urls[0], **params)
        cid = c["id"]
        print(f"   container {cid}, Meta is downloading {os.path.getsize(path) / 1e6:.0f} MB …", flush=True)
        st = wait_ready(cfg, cid)
    pub = api(cfg, "POST", f"{uid}/media_publish", creation_id=cid)
    mid = pub["id"]
    link = api(cfg, "GET", mid, fields="permalink").get("permalink")
    return dict(container=cid, media_id=mid, permalink=link, user_tags=tagged, at=time.strftime("%Y-%m-%d %H:%M:%S"))


def wait_ready(cfg, cid):
    t0 = time.time()
    while True:
        st = api(cfg, "GET", cid, fields="status_code,status")
        code = st.get("status_code")
        if code == "FINISHED":
            break
        if code in ("ERROR", "EXPIRED"):
            sys.exit(f"   processing failed: {st}")
        if time.time() - t0 > 1200:
            sys.exit(f"   still processing after 20 min: {st}. Run again later (it resumes).")
        print(f"   processing ({code}) …", flush=True)
        time.sleep(15)
    return st


def lighter(path):
    """A 10 Mbps copy of a reel in <episode>/reels/ig/ (Instagram recompresses below that anyway)."""
    out = os.path.join(os.path.dirname(path), "ig", os.path.basename(path))
    if os.path.dirname(path).endswith("/ig") or os.path.exists(out):
        return out if os.path.exists(out) else path
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-c:v", "libx264", "-preset", "slow", "-b:v", "10M",
                    "-maxrate", "12M", "-bufsize", "24M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ac", "2",
                    "-movflags", "+faststart", out], check=True)
    return out


def publish_episode(cfg, ep_dir, dry, solo=None):
    plan = json.load(open(os.path.join(ep_dir, "publish.json")))
    if solo:
        plan = [it for it in plan if os.path.basename(it["file"]) == solo]
        if not plan:
            sys.exit(f"{solo} no está en publish.json")
    log_path = os.path.join(ep_dir, "publish-log.json")
    log = json.load(open(log_path)) if os.path.exists(log_path) else {}
    for n, item in enumerate(plan, 1):
        path = os.path.join(ep_dir, item["file"])
        name = os.path.basename(path)
        if name in log:
            print(f"{n}. {name}: already published → {log[name].get('permalink')}")
            continue
        if not os.path.exists(path):
            sys.exit(f"missing {path}")
        first = item["caption"].splitlines()[0]
        cover = os.path.join(ep_dir, item["cover"]) if item.get("cover") else None
        if cover and not os.path.exists(cover):
            sys.exit(f"missing cover {cover}")
        what = f"cover {item['cover']}" if cover else f"cover frame at {item.get('thumb_offset_ms')} ms"
        if item.get("user_tags"):
            what += " · tags " + " ".join("@" + u for u in item["user_tags"])
        print(f"{n}. {name} ({os.path.getsize(path) / 1e6:.0f} MB) · {what} · “{first}”")
        if dry:
            continue
        try:
            log[name] = publish_one(cfg, path, item["caption"], item.get("thumb_offset_ms"), cover, item.get("user_tags"))
        except SystemExit as e:
            if "processing failed" not in str(e):
                raise
            # Meta sometimes refuses a big 20 Mbps file (error 2207077, 2026-11-06); a 10 Mbps copy goes through.
            print(f"{e}\n   retrying with a 10 Mbps copy …", flush=True)
            light = lighter(path)
            log[name] = publish_one(cfg, light, item["caption"], item.get("thumb_offset_ms"), cover, item.get("user_tags"))
        json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
        print(f"   published → {log[name]['permalink']}", flush=True)
        if n < len(plan):
            time.sleep(45)   # keep the posting order (and the grid) clean
    if dry:
        print("dry run: nothing was posted")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    if args[0] in ("check", "refresh"):
        cfg = load_env()
        (check if args[0] == "check" else refresh)(cfg)
    else:
        dry = "--dry-run" in sys.argv
        solo = sys.argv[sys.argv.index("--solo") + 1] if "--solo" in sys.argv else None
        cfg = load_env() if not dry or os.path.exists(ENV) else None
        publish_episode(cfg, args[0], dry, solo)
