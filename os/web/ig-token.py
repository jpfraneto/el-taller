#!/usr/bin/env python3
"""El token para saber quién es un @ (Business Discovery): foto, nombre y seguidores en la hoja de los 30 días.

1. https://developers.facebook.com/tools/explorer → app "El Taller Con JP" → "Get User Access Token" con:
   instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement, business_management
   → Generate → copiarlo (instagram_manage_insights es el que deja ver otras cuentas de empresa).
2. pbpaste | python3 os/web/ig-token.py   (o sin pbpaste: lo pide, y no se muestra)

Con ese token se pide el token de la página "El Taller Con JP" (los de página no vencen si salen de uno largo;
si sale de uno corto, vence en ~1 hora: este script lo alarga con el secreto de la app, que se guarda una vez con
`pbpaste | python3 ig-token.py --secreto` en ~/.config/eltaller/meta.env y en el Worker),
se prueba buscando @nike, y se guarda en el Worker como el secreto IG_LOOKUP_TOKEN.
"""
import getpass, json, os, re, subprocess, sys, urllib.error, urllib.parse, urllib.request

V, APP = "v23.0", "29474239675513962"
IG = re.search(r'"IG_LOOKUP_USER":\s*"(\d+)"', open(os.path.join(os.path.dirname(__file__) or ".", "wrangler.jsonc")).read()).group(1)


def g(path, **p):
    try:
        return json.loads(urllib.request.urlopen(f"https://graph.facebook.com/{V}/{path}?" + urllib.parse.urlencode(p), timeout=30).read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


ENV = os.path.expanduser("~/.config/eltaller/meta.env")


def secreto_guardado():
    if os.environ.get("META_APP_SECRET"):
        return os.environ["META_APP_SECRET"]
    for l in open(ENV) if os.path.exists(ENV) else []:
        if l.startswith("META_APP_SECRET="):
            return l.split("=", 1)[1].strip()


if sys.argv[1:] == ["--secreto"]:  # pbpaste | python3 ig-token.py --secreto  (App settings → Basic → App secret → Show)
    s = (sys.stdin.read() if not sys.stdin.isatty() else getpass.getpass("App secret (no se muestra): ")).strip()
    if not re.fullmatch(r"[0-9a-f]{32}", s):
        sys.exit("Eso no parece el App secret (32 letras y números).")
    lineas = [l for l in (open(ENV).read().splitlines() if os.path.exists(ENV) else []) if not l.startswith("META_APP_SECRET=")]
    os.makedirs(os.path.dirname(ENV), exist_ok=True)
    with open(os.open(ENV, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        f.write("\n".join(lineas + [f"META_APP_SECRET={s}"]) + "\n")
    subprocess.run(["npx", "wrangler", "secret", "put", "META_APP_SECRET"], input=s, text=True, check=True,
                   cwd=os.path.dirname(os.path.abspath(__file__)))
    sys.exit("Listo: secreto guardado en ~/.config/eltaller/meta.env y en el Worker.")

tok = (sys.stdin.read() if not sys.stdin.isatty() else getpass.getpass("Token del Graph API Explorer (no se muestra): ")).strip()
if secreto_guardado():  # alargarlo: 60 días, y el de página que sale de él no vence
    r = g("oauth/access_token", grant_type="fb_exchange_token", client_id=APP, client_secret=secreto_guardado(), fb_exchange_token=tok)
    if r.get("access_token"):
        tok = r["access_token"]
        print("· alargado")
    else:
        print("· no se pudo alargar:", (r.get("error") or {}).get("message"))
paginas = g("me/accounts", fields="id,name,access_token,instagram_business_account", access_token=tok)
if "error" in paginas:
    sys.exit("Meta: " + paginas["error"].get("message", "?"))
pag = next((p for p in paginas.get("data", []) if (p.get("instagram_business_account") or {}).get("id") == IG), None)
if not pag:
    sys.exit("No encontré la página conectada a @eltallerconjp entre: " + ", ".join(p["name"] for p in paginas.get("data", [])))
prueba = g(IG, fields="business_discovery.username(nike){username,followers_count}", access_token=pag["access_token"])
if "error" in prueba:
    sys.exit("La búsqueda no funcionó: " + prueba["error"].get("message", "?") + "\n(¿instagram_basic, instagram_manage_insights y pages_read_engagement están en el token?)")
print(f"· @nike: {prueba['business_discovery']['followers_count']:,} seguidores. Funciona.")
subprocess.run(["npx", "wrangler", "secret", "put", "IG_LOOKUP_TOKEN"], input=pag["access_token"], text=True, check=True,
               cwd=os.path.dirname(os.path.abspath(__file__)))
print("Listo: la hoja de los 30 días ya muestra la foto y el nombre de cada @.")
