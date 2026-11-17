#!/usr/bin/env python3
"""Conecta el WhatsApp de El Taller (+56 9 4845 5809) a la API sin sacarlo de la app WhatsApp Business del teléfono
(lo que Meta llama "coexistencia"), por la misma página /conectar que usan los clientes.

1. python3 os/web/wa-eltaller.py           → abre el enlace en el navegador (dura 30 minutos)
2. En la página: "¿Tu número ya está en WhatsApp Business, en un teléfono?" → ventana de Meta → escanear el código
   con el teléfono (WhatsApp Business al día).
3. Este script espera, recoge lo que quedó conectado y lo guarda en ~/.config/eltaller/eltaller-wa.json (solo tú lo lees).
"""
import hashlib, json, os, secrets, subprocess, sys, time, urllib.error, urllib.request

BASE = "https://eltallerconjp.jpfraneto.com"
DEST = os.path.expanduser("~/.config/eltaller/eltaller-wa.json")


def post(path, body):
    req = urllib.request.Request(BASE + path, json.dumps(body).encode(), {"content-type": "application/json", "user-agent": "ElTaller/wa"})  # sin UA, Cloudflare corta (1010)
    try:
        return json.loads(urllib.request.urlopen(req, timeout=30).read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}")


s, secreto = secrets.token_urlsafe(24), secrets.token_urlsafe(32)
enlace = f"{BASE}/conectar?s={s}&h={hashlib.sha256(secreto.encode()).hexdigest()}"
print("Enlace:", enlace, flush=True)
if "--sin-abrir" not in sys.argv:
    subprocess.run(["open", enlace])
guardado = json.load(open(DEST)) if os.path.exists(DEST) else {}  # mismo cliente de El Taller que la vez anterior
fin = time.time() + 30 * 60
while time.time() < fin:
    time.sleep(4)
    j = post("/conectar/recoger", {"s": s, "secreto": secreto, "cliente": guardado.get("cliente", ""), "clave": guardado.get("clave", "")})
    if j.get("pendiente") or j.get("error"):  # "clave" mientras la página no se ha abierto: la sesión aún no existe
        continue
    guardado.update({k: v for k, v in j.items() if v and k != "clave"}, conectado=time.strftime("%Y-%m-%d %H:%M"))
    guardado["clave"] = j.get("clave") or guardado.get("clave", "")
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    with open(os.open(DEST, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump(guardado, f, indent=2)
    if j.get("ig"):
        print("· Instagram conectado:", ", ".join("@" + c.get("username", "") for c in j["ig"].get("cuentas", [])), flush=True)
    if j.get("wa"):  # lo que buscamos: el número
        print(f"Listo: WhatsApp {j['wa'].get('numero', '?')} ({j['wa'].get('nombre', '')}) conectado. Guardado en {DEST}")
        sys.exit(0)
sys.exit("Pasaron 30 minutos sin WhatsApp. Corre el script de nuevo y toca \"¿Tu número ya está en WhatsApp Business…?\".")
